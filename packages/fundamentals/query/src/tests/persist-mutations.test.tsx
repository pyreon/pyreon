import { mount } from '@pyreon/runtime-dom'
import { MutationCache, onlineManager, QueryClient } from '@tanstack/query-core'
import {
  createAsyncStoragePersister,
  createSyncStoragePersister,
  type PersistedClient,
  PersistQueryClientProvider,
  persistQueryClient,
  persistQueryClientRestore,
  persistQueryClientSave,
  persistQueryClientSubscribe,
  type Persister,
  shouldPersistMutation,
} from '../persist'

// The persisted-mutation contract (#4723, and the review of PR #4752):
// - a mutation is persisted from creation until it settles, paused or in
//   flight, only when a later page could send exactly the same request;
// - a page takes over a persisted mutation only once the page that owns it is
//   gone (Web Locks), so two tabs never both send it;
// - writes land at once when a mutation is persisted, settles, or the page is
//   hidden, not after the persister's throttle.

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
const never = <T,>() => new Promise<T>(() => undefined)

// ─── A Web Locks manager shared by several "tabs" ─────────────────────────────

interface LockManagerLike {
  request: (
    name: string,
    options: { ifAvailable?: boolean },
    cb: (lock: unknown) => unknown,
  ) => Promise<unknown>
  query: () => Promise<{ held: Array<{ name: string }> }>
}

class FakeLocks {
  /** Grant uncontended requests after this many ms instead of at once. */
  constructor(private readonly grantDelay = 0) {}
  private holder = new Map<string, string>()
  private waiting = new Map<string, Array<{ tab: string; grant: () => void }>>()

  tab(id: string): LockManagerLike {
    return {
      request: (name, options, cb) =>
        new Promise((done) => {
          const grant = (): void => {
            this.holder.set(name, id)
            void Promise.resolve(cb({ name })).then(() => {
              if (this.holder.get(name) === id) this.free(name)
              done(undefined)
            })
          }
          if (!this.holder.has(name)) {
            if (this.grantDelay > 0) setTimeout(grant, this.grantDelay)
            else grant()
          } else if (options.ifAvailable) void Promise.resolve(cb(null)).then(() => done(undefined))
          else this.waiting.set(name, [...(this.waiting.get(name) ?? []), { tab: id, grant }])
        }),
      query: async () => ({ held: [...this.holder.keys()].map((name) => ({ name })) }),
    }
  }

  /** The tab died: the browser frees everything it held, and drops what it waited for. */
  kill(id: string): void {
    for (const [name, waiters] of this.waiting) {
      this.waiting.set(
        name,
        waiters.filter((w) => w.tab !== id),
      )
    }
    for (const [name, tab] of [...this.holder]) if (tab === id) this.free(name)
  }

  heldBy(prefix: string): string[] {
    return [...this.holder.keys()].filter((n) => n.startsWith(prefix))
  }

  private free(name: string): void {
    this.holder.delete(name)
    const next = this.waiting.get(name)?.shift()
    next?.grant()
  }
}

function useLocks(locks: LockManagerLike | undefined): void {
  Object.defineProperty(globalThis.navigator, 'locks', { value: locks, configurable: true })
}

// ─── A localStorage-shaped store, shared by the tabs ──────────────────────────

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: () => map.get('REACT_QUERY_OFFLINE_CACHE'),
    mutations: (): Array<{ state: { variables: unknown; status: string; isPaused: boolean } }> =>
      JSON.parse(map.get('REACT_QUERY_OFFLINE_CACHE') ?? '{"clientState":{"mutations":[]}}')
        .clientState.mutations,
  }
}

/** One "tab": its own QueryClient, its own view of the shared locks. */
function openTab(
  locks: FakeLocks | undefined,
  id: string,
  storage: ReturnType<typeof memoryStorage>,
  setup: (client: QueryClient) => void,
  config?: ConstructorParameters<typeof QueryClient>[0],
) {
  useLocks(locks?.tab(id))
  const client = new QueryClient(config)
  setup(client)
  const persister = createSyncStoragePersister({ storage, throttleTime: 1000 })
  const [unsubscribe, restored] = persistQueryClient({
    queryClient: client,
    persister,
    maxAge: Infinity,
  })

  return { client, unsubscribe, restored, persister }
}

function start(
  client: QueryClient,
  key: readonly unknown[] | undefined,
  variables: unknown,
  mutationFn?: (v: unknown) => Promise<unknown>,
) {
  return client
    .getMutationCache()
    .build(client, { ...(key ? { mutationKey: key } : {}), ...(mutationFn ? { mutationFn } : {}) })
    .execute(variables)
    .catch(() => undefined)
}

afterEach(() => {
  onlineManager.setOnline(true)
  useLocks(undefined)
  vi.restoreAllMocks()
})

describe('which mutations are persisted', () => {
  it('an in-flight RESUMABLE mutation is written at once, and leaves storage the moment it succeeds', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    let finish!: (v: string) => void
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => new Promise((r) => (finish = r)) }),
    )
    await tab.restored
    const run = start(tab.client, ['add'], { id: 1 })
    tab.client.setQueryData(['x'], 1) // a second save before the lock is granted asks for it only once
    await tick()
    // Written once its lock was granted, not 1 s later (the persister's throttle).
    expect(storage.mutations().map((m) => [m.state.variables, m.state.isPaused])).toEqual([
      [{ id: 1 }, false],
    ])
    finish('ok')
    await run
    // Settled: gone from storage before any throttle could run (#4752 review, item 5).
    expect(storage.mutations()).toEqual([])
    expect(locks.heldBy('pyreon-query-mutation:')).toEqual([])
    tab.unsubscribe()
  })

  it('a mutation that fails also leaves storage at once', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    let fail!: (e: Error) => void
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => new Promise((_, rej) => (fail = rej)) }),
    )
    await tab.restored
    const run = start(tab.client, ['add'], { id: 1 })
    await tick()
    expect(storage.mutations()).toHaveLength(1)
    fail(new Error('rejected by the server'))
    await run
    expect(storage.mutations()).toEqual([])
    tab.unsubscribe()
  })

  it('a keyless mutation with its own mutationFn never reaches storage (its password neither)', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, () => undefined)
    await a.restored
    a.client.setQueryData(['todos'], ['x']) // something else that IS written
    void start(a.client, undefined, { user: 'u', password: 'hunter2' }, () => never())
    await tick(5)
    a.client.setQueryData(['todos'], ['x', 'y'])
    window.dispatchEvent(new Event('pagehide')) // write now, not after the throttle
    expect(storage.raw()).toContain('"y"')
    expect(storage.raw()).not.toContain('hunter2')
    locks.kill('a')
    // The next page has nothing to resume, so no "No mutationFn found" error either.
    const errors: unknown[] = []
    const b = openTab(locks, 'b', storage, () => undefined, {
      mutationCache: new MutationCache({ onError: (e) => void errors.push(e) }),
    })
    await b.restored
    await b.client.resumePausedMutations()
    await tick(5)
    expect(errors).toEqual([])
    b.unsubscribe()
  })

  it('a keyed mutation that overrides the registered function is not persisted (a later page would run another one)', async () => {
    const client = new QueryClient()
    const registered = async () => 'registered'
    client.setMutationDefaults(['add'], { mutationFn: registered })
    const inline = client
      .getMutationCache()
      .build(client, { mutationKey: ['add'], mutationFn: async () => 'inline' })
    void inline.execute('v').catch(() => undefined)
    expect(shouldPersistMutation(inline, client)).toBe(false)
    const same = client
      .getMutationCache()
      .build(client, { mutationKey: ['add'], mutationFn: registered })
    void same.execute('v').catch(() => undefined)
    expect(shouldPersistMutation(same, client)).toBe(true)
    // A client-wide default mutationFn makes a keyless mutation that uses it resumable.
    const global = async () => 'global'
    const withGlobal = new QueryClient({ defaultOptions: { mutations: { mutationFn: global } } })
    const keyless = withGlobal.getMutationCache().build(withGlobal, {})
    void keyless.execute('v').catch(() => undefined)
    expect(shouldPersistMutation(keyless, withGlobal)).toBe(true)
  })

  it('meta: { persist: false } keeps a mutation out of storage, even a paused one', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    onlineManager.setOnline(false)
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['login'], { mutationFn: async () => 'ok', meta: { persist: false } }),
    )
    await tab.restored
    void start(tab.client, ['login'], { password: 'hunter2' })
    await tick(5)
    expect(tab.client.getMutationCache().getAll()[0]!.state.isPaused).toBe(true)
    tab.client.setQueryData(['x'], 1)
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.raw()).toContain('"x"')
    expect(storage.raw()).not.toContain('hunter2')
    tab.unsubscribe()
  })

  it('a File variable is not persisted (it would come back as {}), with a dev warning naming the fix', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['upload'], { mutationFn: () => never() }),
    )
    await tab.restored
    void start(tab.client, ['upload'], { file: new File(['hello'], 'a.txt'), name: 'a.txt' })
    await tick(5)
    tab.client.setQueryData(['x'], 1)
    await tick(5)
    expect(storage.mutations()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('variables.file is a File')
    expect(String(warn.mock.calls[0]![0])).toContain('meta: { persist: false }')
    tab.unsubscribe()
  })

  it('a circular or BigInt variable is skipped, and the rest of the cache is still written', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await tab.restored
    const self: Record<string, unknown> = { a: 1 }
    self.self = self
    void start(tab.client, ['add'], self)
    void start(tab.client, ['add'], { n: 10n })
    tab.client.setQueryData(['todos'], ['x', 'y'])
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.raw()).toContain('"y"')
    expect(storage.mutations()).toEqual([])
    tab.unsubscribe()
  })

  it.each([
    ['a Date', { at: new Date(0) }, 'variables.at is a Date'],
    ['a Map', { m: new Map() }, 'variables.m is a Map'],
    ['NaN', { n: Number.NaN }, 'variables.n is NaN'],
    ['undefined in an array', { list: [1, undefined] }, 'variables.list[1] is undefined'],
    ['a function in an array', { list: [() => 1] }, 'variables.list[0] is a function'],
    ['a function', { f: () => 1 }, 'variables.f is a function'],
    ['a symbol', { s: Symbol('x') }, 'variables.s is a symbol'],
    [
      'an object without a named constructor',
      { o: Object.create(Object.create(null)) },
      'an object with a custom prototype',
    ],
  ])('rejects %s in the variables', (_label, variables, message) => {
    const client = new QueryClient()
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    useLocks(new FakeLocks().tab('a'))
    const m = client.getMutationCache().build(client, { mutationKey: ['add'] })
    void m.execute(variables).catch(() => undefined)
    expect(shouldPersistMutation(m, client)).toBe(false)
    void persistQueryClientSave({
      queryClient: client,
      persister: {
        persistClient: () => undefined,
        restoreClient: () => undefined,
        removeClient: () => undefined,
      },
    })
    expect(String(warn.mock.calls[0]![0])).toContain(message)
  })

  it('accepts plain JSON variables, null-prototype objects and nested arrays; the onMutate context only needs to be writable', async () => {
    const client = new QueryClient()
    const date = new Date(0)
    client.setMutationDefaults(['add'], {
      mutationFn: () => never(),
      onMutate: () => ({ snapshot: date }),
    })
    const m = client.getMutationCache().build(client, { mutationKey: ['add'] })
    void m
      .execute({
        a: [1, 'b', true, null, { c: Object.assign(Object.create(null), { d: 1 }) }],
        e: undefined,
      })
      .catch(() => undefined)
    await tick()
    expect(shouldPersistMutation(m, client)).toBe(true)
    const cyclic = client.getMutationCache().build(client, {
      mutationKey: ['add'],
      onMutate: () => {
        const o: Record<string, unknown> = {}
        o.o = o
        return o
      },
    })
    void cyclic.execute({}).catch(() => undefined)
    await tick()
    expect(shouldPersistMutation(cyclic, client)).toBe(false)
  })
})

describe('precedence (TanStack order: explicit option, client default, this default)', () => {
  const sink = () => {
    let saved: PersistedClient | undefined
    return {
      persister: {
        persistClient: (c: PersistedClient) => void (saved = c),
        restoreClient: () => undefined,
        removeClient: () => undefined,
      } as Persister,
      saved: () => saved!,
    }
  }

  it("respects the client's defaultOptions.dehydrate.shouldDehydrateMutation", async () => {
    useLocks(new FakeLocks().tab('a'))
    const client = new QueryClient({
      defaultOptions: { dehydrate: { shouldDehydrateMutation: () => false } },
    })
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    void start(client, ['add'], { password: 'x' })
    await tick()
    const { persister, saved } = sink()
    await persistQueryClientSave({ queryClient: client, persister })
    expect(saved().clientState.mutations).toEqual([])
  })

  it('an explicit dehydrateOptions.shouldDehydrateMutation beats the client default', async () => {
    useLocks(new FakeLocks().tab('a'))
    const client = new QueryClient({
      defaultOptions: { dehydrate: { shouldDehydrateMutation: () => false } },
    })
    void start(client, undefined, 'v', () => never())
    await tick()
    const { persister, saved } = sink()
    await persistQueryClientSave({
      queryClient: client,
      persister,
      dehydrateOptions: { shouldDehydrateMutation: () => true },
    })
    expect(saved().clientState.mutations).toHaveLength(1)
  })
})

describe('two tabs: only a gone owner hands its mutation over', () => {
  it("a second tab does not send a live tab's in-flight request, keeps it stored, and takes it over once that tab dies", async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const aSent: unknown[] = []
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: (v) => (aSent.push(v), never()) }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    expect(storage.mutations()).toHaveLength(1)

    const bSent: unknown[] = []
    const b = openTab(locks, 'b', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: async (v) => (bSent.push(v), 'ok') }),
    )
    await b.restored
    await b.client.resumePausedMutations()
    await tick()
    expect(bSent).toEqual([]) // TanStack's default: nothing; the first version of this PR: sent it.
    // B's own writes keep A's mutation in storage while A is alive.
    b.client.setQueryData(['x'], 1)
    await tick(5)
    expect(storage.mutations().map((m) => m.state.variables)).toEqual([{ id: 1 }])

    // A's tab closes with the request in flight: B takes it over and sends it, once.
    locks.kill('a')
    await tick(5)
    expect(aSent).toEqual([{ id: 1 }])
    expect(bSent).toEqual([{ id: 1 }])
    await tick(5)
    expect(storage.mutations()).toEqual([])
    b.unsubscribe()
  })

  it('when the live tab settles it, the watching tab drops it and sends nothing', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    let finish!: (v: string) => void
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => new Promise((r) => (finish = r)) }),
    )
    await a.restored
    const run = start(a.client, ['add'], { id: 1 })
    await tick()
    const bSent: unknown[] = []
    const b = openTab(locks, 'b', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: async (v) => (bSent.push(v), 'ok') }),
    )
    await b.restored
    finish('ok')
    await run
    await tick(5)
    expect(bSent).toEqual([])
    b.client.setQueryData(['x'], 1)
    await tick(5)
    expect(storage.mutations()).toEqual([])
    // A closing later hands nothing over.
    locks.kill('a')
    await tick(5)
    expect(bSent).toEqual([])
    a.unsubscribe()
    b.unsubscribe()
  })

  it('a page that loads after the owner died takes the mutation over and sends it once; a third page does not', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    locks.kill('a')

    const sent: unknown[] = []
    let finish!: (v: string) => void
    const b = openTab(locks, 'b', storage, (c) =>
      c.setMutationDefaults(['add'], {
        mutationFn: (v) => (sent.push(v), new Promise((r) => (finish = r))),
      }),
    )
    await b.restored
    void b.client.resumePausedMutations()
    await tick()
    expect(sent).toEqual([{ id: 1 }])
    // B now owns it: a third tab opening while B is sending leaves it alone.
    const cSent: unknown[] = []
    const c = openTab(locks, 'c', storage, (cl) =>
      cl.setMutationDefaults(['add'], { mutationFn: async (v) => (cSent.push(v), 'ok') }),
    )
    await c.restored
    await c.client.resumePausedMutations()
    finish('ok')
    await tick(5)
    expect(cSent).toEqual([])
    expect(storage.mutations()).toEqual([])
    b.unsubscribe()
    c.unsubscribe()
  })

  it('a stale copy whose owner is alive but let go is dropped on restore', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    const stored = storage.raw()!
    // A settles and its write is lost (say, a full storage), then the old copy is read.
    a.client.getMutationCache().clear()
    await tick(5)
    storage.setItem('REACT_QUERY_OFFLINE_CACHE', stored)
    const sent: unknown[] = []
    const b = openTab(locks, 'b', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: async (v) => (sent.push(v), 'ok') }),
    )
    await b.restored
    await b.client.resumePausedMutations()
    await tick(5)
    expect(sent).toEqual([])
    a.unsubscribe()
    b.unsubscribe()
  })

  it('a remount of the same client does not restore a second copy of its own mutation', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    a.unsubscribe()
    const [again, restored] = persistQueryClient({
      queryClient: a.client,
      persister: a.persister,
      maxAge: Infinity,
    })
    await restored
    expect(a.client.getMutationCache().getAll()).toHaveLength(1)
    again()
  })
})

describe('without Web Locks', () => {
  it('in-flight mutations stay out of storage (at-most-once, as TanStack); paused ones are persisted', async () => {
    const storage = memoryStorage()
    const tab = openTab(undefined, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await tab.restored
    void start(tab.client, ['add'], { online: true })
    tab.client.setQueryData(['x'], 1)
    await tick(1100)
    expect(storage.mutations()).toEqual([])
    onlineManager.setOnline(false)
    void start(tab.client, ['add'], { online: false })
    await tick(1100)
    expect(storage.mutations().map((m) => m.state.variables)).toEqual([{ online: false }])
    tab.unsubscribe()
  })

  it('an untagged (TanStack-written) paused mutation is restored and resumed as TanStack does', async () => {
    const storage = memoryStorage()
    useLocks(new FakeLocks().tab('x'))
    const seed = new QueryClient()
    seed.setMutationDefaults(['add'], { mutationFn: async () => 'never' })
    onlineManager.setOnline(false)
    void start(seed, ['add'], 'offline')
    await tick()
    const { dehydrate } = await import('@tanstack/query-core')
    storage.setItem(
      'REACT_QUERY_OFFLINE_CACHE',
      JSON.stringify({ timestamp: Date.now(), buster: '', clientState: dehydrate(seed) }),
    )
    onlineManager.setOnline(true)
    const sent = vi.fn(async (_v: unknown) => 'sent')
    const tab = openTab(new FakeLocks(), 'b', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: sent }),
    )
    await tab.restored
    await tab.client.resumePausedMutations()
    expect(sent).toHaveBeenCalledWith('offline', expect.anything())
    tab.unsubscribe()
  })
})

describe('entry points and the provider', () => {
  it('persistQueryClientSubscribe writes on settle and on page hide, and stops when unsubscribed', async () => {
    const locks = new FakeLocks()
    useLocks(locks.tab('a'))
    const storage = memoryStorage()
    const client = new QueryClient()
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    const persister = createSyncStoragePersister({ storage, throttleTime: 1000 })
    const unsubscribe = persistQueryClientSubscribe({ queryClient: client, persister })
    void start(client, ['add'], { id: 1 })
    await tick()
    expect(storage.mutations()).toHaveLength(1)
    client.setQueryData(['late'], 'value')
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.raw()).toContain('late')
    client.setQueryData(['later'], 'value')
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(storage.raw()).toContain('later')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    client.setQueryData(['visible'], 'value')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(storage.raw()).not.toContain('"visible"')
    unsubscribe()
    client.setQueryData(['after'], 'value')
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.raw()).not.toContain('after')
  })

  it("persistQueryClientRestore takes over a gone page's mutation as paused", async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    locks.kill('a')
    useLocks(locks.tab('b'))
    const b = new QueryClient()
    await persistQueryClientRestore({
      queryClient: b,
      persister: createSyncStoragePersister({ storage }),
      maxAge: Infinity,
    })
    expect(
      b
        .getMutationCache()
        .getAll()
        .map((m) => [m.state.variables, m.state.isPaused]),
    ).toEqual([[{ id: 1 }, true]])
  })

  it("the provider resumes a gone page's in-flight mutation once restored", async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], 'v1')
    await tick()
    locks.kill('a')

    useLocks(locks.tab('b'))
    const b = new QueryClient()
    const sent = vi.fn(async (_v: string) => 'sent')
    b.setMutationDefaults(['add'], { mutationFn: sent })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider
        client={b}
        persistOptions={{ persister: createSyncStoragePersister({ storage }), maxAge: Infinity }}
      >
        {() => null}
      </PersistQueryClientProvider>,
      el,
    )
    await tick(30)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent.mock.calls[0]![0]).toBe('v1')
    unmount()
    el.remove()
  })

  it('the async persister flushes too, and a persister without storage stays inert', async () => {
    const locks = new FakeLocks()
    useLocks(locks.tab('a'))
    const map = new Map<string, string>()
    const storage = {
      getItem: async (k: string) => map.get(k) ?? null,
      setItem: async (k: string, v: string) => void map.set(k, v),
      removeItem: async (k: string) => void map.delete(k),
    }
    const client = new QueryClient()
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    const unsubscribe = persistQueryClientSubscribe({
      queryClient: client,
      persister: createAsyncStoragePersister({ storage, throttleTime: 1000 }),
    })
    void start(client, ['add'], { id: 1 })
    await tick(5)
    expect(map.get('REACT_QUERY_OFFLINE_CACHE')).toContain('"id":1')
    unsubscribe()
    expect(createSyncStoragePersister({ storage: undefined }).restoreClient()).toBeUndefined()
    expect(
      await createAsyncStoragePersister({ storage: undefined }).restoreClient(),
    ).toBeUndefined()
  })

  it('a full storage on the immediate write leaves the throttled write to retry', async () => {
    const locks = new FakeLocks()
    useLocks(locks.tab('a'))
    const client = new QueryClient()
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    let fail = true
    const map = new Map<string, string>()
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (fail) throw new Error('QuotaExceededError')
        map.set(k, v)
      },
      removeItem: (k: string) => void map.delete(k),
    }
    const unsubscribe = persistQueryClientSubscribe({
      queryClient: client,
      persister: createSyncStoragePersister({ storage, throttleTime: 10 }),
    })
    void start(client, ['add'], { id: 1 })
    await tick()
    fail = false
    await tick(30)
    expect(map.get('REACT_QUERY_OFFLINE_CACHE')).toContain('"id":1')
    unsubscribe()
  })
})

describe('edges of the contract', () => {
  const refusingLocks: LockManagerLike = {
    request: (_name, options, cb) =>
      options.ifAvailable ? Promise.resolve(cb(null)) : Promise.reject(new Error('AbortError')),
    query: async () => ({ held: [] }),
  }

  it('a browser that refuses the lock request: the mutation is not persisted, and a held one is left to its owner', async () => {
    const storage = memoryStorage()
    useLocks(refusingLocks)
    const client = new QueryClient()
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    const unsubscribe = persistQueryClientSubscribe({
      queryClient: client,
      persister: createSyncStoragePersister({ storage }),
    })
    void start(client, ['add'], { id: 1 })
    await tick(5)
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.mutations()).toEqual([])
    unsubscribe()

    // A page whose wait for a held lock is refused leaves that mutation alone.
    const locks = new FakeLocks()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 2 })
    await tick()
    useLocks(refusingLocks)
    const sent: unknown[] = []
    const b = new QueryClient()
    b.setMutationDefaults(['add'], { mutationFn: async (v) => (sent.push(v), 'ok') })
    await persistQueryClientRestore({
      queryClient: b,
      persister: createSyncStoragePersister({ storage }),
      maxAge: Infinity,
    })
    await tick(5)
    expect(sent).toEqual([])
    expect(b.getMutationCache().getAll()).toEqual([])
    a.unsubscribe()
  })

  it('a lock granted after the mutation already settled is handed straight back', async () => {
    const locks = new FakeLocks(20)
    const storage = memoryStorage()
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: async () => 'ok' }),
    )
    await tab.restored
    await start(tab.client, ['add'], { id: 1 })
    await tick(40)
    expect(locks.heldBy('pyreon-query-mutation:')).toEqual([])
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.mutations()).toEqual([])
    tab.unsubscribe()
  })

  it('variables: a problem inside an array item is found; a keyless mutation is named as such', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    useLocks(new FakeLocks().tab('a'))
    const client = new QueryClient({ defaultOptions: { mutations: { mutationFn: () => never() } } })
    const m = client.getMutationCache().build(client, {})
    void m.execute({ list: [{ at: new Date(0) }] }).catch(() => undefined)
    await persistQueryClientSave({
      queryClient: client,
      persister: {
        persistClient: () => undefined,
        restoreClient: () => undefined,
        removeClient: () => undefined,
      },
    })
    expect(String(warn.mock.calls[0]![0])).toContain(
      'a mutation without a mutationKey: variables.list[0].at is a Date',
    )
  })

  it('the onMutate context may hold functions and class instances (only a cycle or BigInt is refused)', async () => {
    const client = new QueryClient()
    client.setMutationDefaults(['add'], {
      mutationFn: () => never(),
      onMutate: () => ({ undo: () => 1, at: new Date(0) }),
    })
    const m = client.getMutationCache().build(client, { mutationKey: ['add'] })
    void m.execute({}).catch(() => undefined)
    await tick()
    expect(shouldPersistMutation(m, client)).toBe(true)
  })

  it("a gone page's PAUSED mutation is taken over as it is", async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    onlineManager.setOnline(false)
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    expect(storage.mutations().map((m) => m.state.isPaused)).toEqual([true])
    locks.kill('a')
    useLocks(locks.tab('b'))
    const b = new QueryClient()
    b.setMutationDefaults(['add'], { mutationFn: async () => 'ok' })
    await persistQueryClientRestore({
      queryClient: b,
      persister: createSyncStoragePersister({ storage }),
      maxAge: Infinity,
    })
    expect(
      b
        .getMutationCache()
        .getAll()
        .map((m) => m.state.isPaused),
    ).toEqual([true])
    // Restore-only (no subscription): settling it writes nothing, and releases its lock.
    onlineManager.setOnline(true)
    await b.resumePausedMutations()
    expect(locks.heldBy('pyreon-query-mutation:')).toEqual([])
  })

  it('restoring twice while the owner is alive watches it once', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    useLocks(locks.tab('b'))
    const b = new QueryClient()
    const sent: unknown[] = []
    b.setMutationDefaults(['add'], { mutationFn: async (v) => (sent.push(v), 'ok') })
    const persister = createSyncStoragePersister({ storage })
    await persistQueryClientRestore({ queryClient: b, persister, maxAge: Infinity })
    await persistQueryClientRestore({ queryClient: b, persister, maxAge: Infinity })
    locks.kill('a')
    await tick(5)
    expect(sent).toEqual([{ id: 1 }])
  })

  it('an owner that dies after storage was cleared hands nothing over', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    const sent: unknown[] = []
    const b = openTab(locks, 'b', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: async (v) => (sent.push(v), 'ok') }),
    )
    await b.restored
    storage.removeItem('REACT_QUERY_OFFLINE_CACHE') // say, a sign-out that removed the cache
    locks.kill('a')
    await tick(5)
    expect(sent).toEqual([])
    b.unsubscribe()
  })

  it('unsubscribing an older subscription leaves a newer one on the same client writing', async () => {
    useLocks(new FakeLocks().tab('a'))
    const storage = memoryStorage()
    const client = new QueryClient()
    const persister = createSyncStoragePersister({ storage })
    const first = persistQueryClientSubscribe({ queryClient: client, persister })
    const second = persistQueryClientSubscribe({ queryClient: client, persister })
    first()
    client.setQueryData(['still'], 'written')
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.raw()).toContain('still')
    second()
  })

  it('an async storage that rejects the immediate write does not throw', async () => {
    useLocks(new FakeLocks().tab('a'))
    const storage = {
      getItem: async () => null,
      setItem: async () => Promise.reject(new Error('quota')),
      removeItem: async () => undefined,
    }
    const client = new QueryClient()
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    const unsubscribe = persistQueryClientSubscribe({
      queryClient: client,
      persister: createAsyncStoragePersister({ storage }),
    })
    void start(client, ['add'], { id: 1 })
    await tick(5)
    unsubscribe()
  })
})
