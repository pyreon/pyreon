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
    mutations: (): Array<{
      state: { variables: unknown; status: string; isPaused: boolean; failureReason?: unknown }
    }> =>
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
    // Settled: gone from storage before any throttle could run (#4752 review, item 5),
    // and its lock released only after that write landed.
    expect(storage.mutations()).toEqual([])
    await tick()
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

  it('in flight: a keyed mutation is resumable when its key resolves to a registered function, even with an inline mutationFn', async () => {
    const client = new QueryClient()
    const registered = async () => 'registered'
    client.setMutationDefaults(['add'], { mutationFn: registered })
    // The registered function is what a restored copy runs (#4752 re-review, A1).
    const inline = client
      .getMutationCache()
      .build(client, { mutationKey: ['add'], mutationFn: async () => 'inline' })
    void inline.execute('v').catch(() => undefined)
    expect(shouldPersistMutation(inline, client)).toBe(true)
    // No function registered for the key: a later page could not send it.
    const unregistered = client
      .getMutationCache()
      .build(client, { mutationKey: ['other'], mutationFn: async () => 'inline' })
    void unregistered.execute('v').catch(() => undefined)
    expect(shouldPersistMutation(unregistered, client)).toBe(false)
    // A client-wide default mutationFn makes a keyless mutation that uses it resumable;
    // a keyless one with its own function is not.
    const global = async () => 'global'
    const withGlobal = new QueryClient({ defaultOptions: { mutations: { mutationFn: global } } })
    const keyless = withGlobal.getMutationCache().build(withGlobal, {})
    void keyless.execute('v').catch(() => undefined)
    expect(shouldPersistMutation(keyless, withGlobal)).toBe(true)
    const keylessInline = withGlobal
      .getMutationCache()
      .build(withGlobal, { mutationFn: async () => 'own' })
    void keylessInline.execute('v').catch(() => undefined)
    expect(shouldPersistMutation(keylessInline, withGlobal)).toBe(false)
  })

  it('paused offline: everything TanStack persists is still persisted (inline fn, unregistered key, keyless)', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    onlineManager.setOnline(false)
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: async () => 'registered' }),
    )
    await tab.restored
    void start(tab.client, ['add'], { id: 'inline' }, async () => 'inline')
    void start(tab.client, ['unregistered'], { id: 'unregistered' }, async () => 'x')
    void start(tab.client, undefined, { id: 'keyless' }, async () => 'x')
    await tick(5)
    window.dispatchEvent(new Event('pagehide'))
    expect(
      storage
        .mutations()
        .map((m) => (m.state.variables as { id: string }).id)
        .sort(),
    ).toEqual(['inline', 'keyless', 'unregistered'])
    tab.unsubscribe()
  })

  it('a keyed mutation left out while in flight gets a dev warning saying why; a keyless one does not', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const tab = openTab(locks, 'a', storage, () => undefined)
    await tab.restored
    void start(tab.client, ['unregistered'], { id: 1 }, () => never())
    void start(tab.client, undefined, { password: 'hunter2' }, () => never())
    await tick(5)
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.mutations()).toEqual([])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain(
      'mutationKey ["unregistered"]: no mutationFn is registered',
    )
    tab.unsubscribe()
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

  it('a stale copy whose owner is alive (it still owns another mutation) is dropped on restore', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    const stored = storage.raw()!
    void start(a.client, ['add'], { id: 2 }) // A keeps owning something, so its owner lock stays held
    await tick()
    // A settles #1 and that write is lost (say, a full storage), then the old copy is read.
    a.client.getMutationCache().remove(a.client.getMutationCache().getAll()[0]!)
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
    // After pagehide that write is final, until the page comes back (pageshow).
    client.setQueryData(['frozen'], 'value')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(storage.raw()).not.toContain('frozen')
    window.dispatchEvent(new Event('pageshow'))
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

  it('a full storage on the immediate write warns, and leaves the throttled write to retry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
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
    expect(String(warn.mock.calls[0]![0])).toContain(
      'could not write to storage (Error: QuotaExceededError)',
    )
    expect(String(warn.mock.calls[0]![0])).toContain('a later page will send it again')
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
    await tick() // the storage correction lands first, then the lock is released
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

  it('an async storage that rejects the immediate write warns instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
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
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not write to storage (Error: quota)'),
    )
    unsubscribe()
  })
})

describe('#4752 re-review', () => {
  it('N4: without a subscription, settling corrects only its own stored entry; an emptied storage stays empty', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    void start(a.client, ['add'], { id: 2 })
    await tick()
    locks.kill('a')
    // An untagged entry (written by TanStack's own persistence) sits alongside them.
    const raw = JSON.parse(storage.raw()!)
    raw.clientState.mutations.push({
      mutationKey: ['legacy'],
      state: { ...raw.clientState.mutations[0].state, variables: { legacy: true } },
    })
    storage.setItem('REACT_QUERY_OFFLINE_CACHE', JSON.stringify(raw))
    // B takes both over through a restore alone (no subscription), then settles one.
    useLocks(locks.tab('b'))
    const b = new QueryClient()
    const finishers: Array<(v: string) => void> = []
    b.setMutationDefaults(['add'], {
      mutationFn: () => new Promise<string>((r) => finishers.push(r)),
    })
    await persistQueryClientRestore({
      queryClient: b,
      persister: createSyncStoragePersister({ storage }),
      maxAge: Infinity,
    })
    await tick()
    void b.resumePausedMutations()
    await tick()
    finishers[0]!('ok')
    await tick(5)
    expect(storage.mutations().map((m) => m.state.variables)).toEqual([{ id: 2 }, { legacy: true }])
    // Storage removed (a sign-out): settling the other one writes nothing back.
    storage.removeItem('REACT_QUERY_OFFLINE_CACHE')
    finishers[1]!('ok')
    await tick(5)
    expect(storage.raw()).toBeUndefined()
  })

  it('N4: a restore-only page that watched a mutation drops it when its live owner settles it', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    let finish!: (v: string) => void
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => new Promise((r) => (finish = r)) }),
    )
    await a.restored
    const run = start(a.client, ['add'], { id: 1 })
    await tick()
    useLocks(locks.tab('b'))
    const b = new QueryClient()
    const sent: unknown[] = []
    b.setMutationDefaults(['add'], { mutationFn: async (v) => (sent.push(v), 'ok') })
    await persistQueryClientRestore({
      queryClient: b,
      persister: createSyncStoragePersister({ storage }),
      maxAge: Infinity,
    })
    finish('ok')
    await run
    await tick(5)
    expect(sent).toEqual([])
    expect(storage.mutations()).toEqual([])
    a.unsubscribe()
  })

  it('N1: a restore TanStack discards (busted) releases what it adopted', async () => {
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
    b.setMutationDefaults(['add'], { mutationFn: () => never() })
    const persister = createSyncStoragePersister({ storage })
    const [unsubscribe, restored] = persistQueryClient({
      queryClient: b,
      persister,
      maxAge: Infinity,
      buster: 'v2',
    })
    await restored
    await tick(5)
    expect(b.getMutationCache().getAll()).toEqual([])
    expect(locks.heldBy('pyreon-query-mutation:')).toEqual([])
    // B owns nothing, so its owner lock goes at the next pagehide.
    window.dispatchEvent(new Event('pagehide'))
    await tick()
    expect(locks.heldBy('pyreon-query-owner:')).toEqual([])
    window.dispatchEvent(new Event('pageshow'))
    unsubscribe()
  })

  it('N2: a burst of mutations is written once, not twice per mutation', async () => {
    const locks = new FakeLocks()
    let writes = 0
    const storage = memoryStorage()
    const counted = {
      ...storage,
      setItem: (k: string, v: string) => {
        writes++
        storage.setItem(k, v)
      },
    }
    useLocks(locks.tab('a'))
    const client = new QueryClient()
    const finishers: Array<(v: string) => void> = []
    client.setMutationDefaults(['add'], {
      mutationFn: () => new Promise<string>((r) => finishers.push(r)),
    })
    const [unsubscribe, restored] = persistQueryClient({
      queryClient: client,
      persister: createSyncStoragePersister({ storage: counted, throttleTime: 1000 }),
      maxAge: Infinity,
    })
    await restored
    const before = writes
    const runs = Array.from({ length: 50 }, (_, i) => start(client, ['add'], { i }))
    await tick()
    expect(storage.mutations()).toHaveLength(50)
    for (const finish of finishers) finish('ok')
    await Promise.all(runs)
    await tick()
    expect(storage.mutations()).toEqual([])
    // One immediate write when they become owned, one when they settle.
    expect(writes - before).toBeLessThanOrEqual(2)
    unsubscribe()
  })

  it('N3: a retry whose failureReason has a cycle neither loses the cache write nor the mutation', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['r'], {
        mutationFn: () => {
          const e = new Error('net') as Error & { req?: unknown }
          e.req = { err: e }
          return Promise.reject(e)
        },
        retry: 3,
        retryDelay: 5000,
      }),
    )
    await tab.restored
    void start(tab.client, ['r'], { x: 1 })
    await tick(20)
    tab.client.setQueryData(['todos'], ['z'])
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.raw()).toContain('"z"')
    const [stored] = storage.mutations()
    expect(stored!.state.failureReason).toEqual({ name: 'Error', message: 'net' })
    tab.unsubscribe()
  })

  it('N3: a failure reason that is not an Error (a cyclic plain object) is written as a plain name and message', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['r'], {
        mutationFn: () => {
          const reason: Record<string, unknown> = {}
          reason.self = reason
          return Promise.reject(reason)
        },
        retry: 3,
        retryDelay: 5000,
      }),
    )
    await tab.restored
    void start(tab.client, ['r'], { x: 1 })
    await tick(20)
    window.dispatchEvent(new Event('pagehide'))
    expect(storage.mutations()[0]!.state.failureReason).toEqual({ name: 'Error', message: '' })
    tab.unsubscribe()
  })

  it('N3: a meta that cannot be written keeps the mutation out, with a warning', () => {
    useLocks(new FakeLocks().tab('a'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = new QueryClient()
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    const meta: Record<string, unknown> = {}
    meta.self = meta
    const m = client.getMutationCache().build(client, { mutationKey: ['add'], meta })
    void m.execute({}).catch(() => undefined)
    expect(shouldPersistMutation(m, client)).toBe(false)
    void persistQueryClientSave({
      queryClient: client,
      persister: {
        persistClient: () => undefined,
        restoreClient: () => undefined,
        removeClient: () => undefined,
      },
    })
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining('meta.self refers back to itself'),
    ])
  })

  it('N4: after a takeover, a page that was watching reads the CURRENT owner and does not resend a settled mutation', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    // C starts watching while A owns it: its tag names A.
    const cSent: unknown[] = []
    const c = openTab(locks, 'c', storage, (cl) =>
      cl.setMutationDefaults(['add'], { mutationFn: async (v) => (cSent.push(v), 'ok') }),
    )
    await c.restored
    // A dies; the lock goes to C, which takes it over and sends it.
    locks.kill('a')
    await tick(5)
    expect(cSent).toEqual([{ id: 1 }])
    expect(storage.mutations()).toEqual([])
    c.unsubscribe()
  })

  it('N4: a provider that unmounted still removes its settled mutation from storage, so a watching page does not resend it', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    locks.kill('a')
    // B takes it over, its provider unmounts mid-flight, then the request succeeds.
    let finish!: (v: string) => void
    const b = openTab(locks, 'b', storage, (cl) =>
      cl.setMutationDefaults(['add'], { mutationFn: () => new Promise((r) => (finish = r)) }),
    )
    await b.restored
    const resumed = b.client.resumePausedMutations()
    await tick(5)
    // The takeover re-tagged the stored entry: it names B now.
    const cSent: unknown[] = []
    const c = openTab(locks, 'c', storage, (cl) =>
      cl.setMutationDefaults(['add'], { mutationFn: async (v) => (cSent.push(v), 'ok') }),
    )
    await c.restored
    b.unsubscribe()
    finish('ok')
    await resumed
    await tick(10)
    expect(storage.mutations()).toEqual([])
    expect(cSent).toEqual([])
    c.unsubscribe()
  })

  it('teardown: a request the unloading page sees fail stays in storage for the next page', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    let abort!: (e: Error) => void
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => new Promise((_, rej) => (abort = rej)) }),
    )
    await tab.restored
    const run = start(tab.client, ['add'], { id: 1 })
    await tick()
    // A reload: pagehide, then the browser aborts the fetch and the dying page sees it reject.
    window.dispatchEvent(new Event('pagehide'))
    abort(new TypeError('Failed to fetch'))
    await run
    await tick(5)
    expect(storage.mutations().map((m) => [m.state.variables, m.state.status])).toEqual([
      [{ id: 1 }, 'pending'],
    ])
    window.dispatchEvent(new Event('pageshow'))
    tab.unsubscribe()
  })

  it('N5/N6: a page holds no Web Lock until it persists a mutation, and lets go of its owner lock at a pagehide that finds it owning none', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    let finish!: (v: string) => void
    const tab = openTab(locks, 'q', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => new Promise((r) => (finish = r)) }),
    )
    await tab.restored
    tab.client.setQueryData(['only-queries'], 1)
    await tick(5)
    expect(locks.heldBy('pyreon-query-')).toEqual([])
    const run = start(tab.client, ['add'], { id: 1 })
    await tick()
    expect(locks.heldBy('pyreon-query-owner:')).toHaveLength(1)
    finish('ok')
    await run
    await tick()
    // The mutation lock is gone; the owner lock stays while the page lives (the
    // backstop that tells another tab this page settled what it let go of).
    expect(locks.heldBy('pyreon-query-mutation:')).toEqual([])
    expect(locks.heldBy('pyreon-query-owner:')).toHaveLength(1)
    window.dispatchEvent(new Event('pagehide'))
    await tick()
    expect(locks.heldBy('pyreon-query-')).toEqual([])
    window.dispatchEvent(new Event('pageshow'))
    tab.unsubscribe()
  })

  it('N6: the storability check runs once per mutation, not on every cache event', async () => {
    useLocks(new FakeLocks().tab('a'))
    let reads = 0
    const variables = {}
    Object.defineProperty(variables, 'id', { enumerable: true, get: () => (reads++, 1) })
    const client = new QueryClient()
    client.setMutationDefaults(['add'], { mutationFn: () => never() })
    // A persister that keeps the object, so the only reads are the check's (JSON would read it on every write).
    const persister = {
      persistClient: () => undefined,
      restoreClient: () => undefined,
      removeClient: () => undefined,
    }
    const unsubscribe = persistQueryClientSubscribe({ queryClient: client, persister })
    void start(client, ['add'], variables)
    for (let i = 0; i < 20; i++) client.setQueryData(['n'], i)
    await tick()
    expect(reads).toBe(1)
    unsubscribe()
  })
})

describe('#4752 final review', () => {
  function asyncStorage(writeMs: number) {
    const map = new Map<string, string>()
    return {
      getItem: async (k: string) => map.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        await tick(writeMs)
        map.set(k, v)
      },
      removeItem: async (k: string) => void map.delete(k),
      mutations: (): unknown[] =>
        JSON.parse(map.get('REACT_QUERY_OFFLINE_CACHE') ?? '{"clientState":{"mutations":[]}}')
          .clientState.mutations,
    }
  }

  it('async storage: a second live tab does not resend a mutation that succeeded (a lock is never released before its removal landed)', async () => {
    const locks = new FakeLocks()
    const storage = asyncStorage(30)
    const tab = (id: string, fn: () => Promise<string>) => {
      useLocks(locks.tab(id))
      const client = new QueryClient()
      client.setMutationDefaults(['add'], { mutationFn: fn })
      const persister = createAsyncStoragePersister({ storage, throttleTime: 1000 })
      const [unsubscribe, restored] = persistQueryClient({
        queryClient: client,
        persister,
        maxAge: Infinity,
      })

      return { client, unsubscribe, restored }
    }
    let aSent = 0
    let bSent = 0
    const a = tab('a', () => (aSent++, tick(200).then(() => 'ok')))
    await a.restored
    const run = a.client
      .getMutationCache()
      .build(a.client, { mutationKey: ['add'] })
      .execute({ id: 1 })
    await tick(80)
    expect(storage.mutations()).toHaveLength(1)
    const b = tab('b', async () => (bSent++, 'ok'))
    await b.restored
    await b.client.resumePausedMutations()
    await run
    await tick(300)
    expect([aSent, bSent]).toEqual([1, 0])
    expect(storage.mutations()).toEqual([])
    a.unsubscribe()
    b.unsubscribe()
  })

  it('frozen (after pagehide): a success is removed from storage before its lock goes; a failure stays stored and owned until pageshow', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    const settle: Array<{ ok: (v: string) => void; fail: (e: Error) => void }> = []
    const tab = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], {
        mutationFn: () => new Promise<string>((ok, fail) => settle.push({ ok, fail })),
      }),
    )
    await tab.restored
    const runs = [
      start(tab.client, ['add'], { id: 'ok' }),
      start(tab.client, ['add'], { id: 'aborted' }),
    ]
    await tick()
    expect(storage.mutations()).toHaveLength(2)
    window.dispatchEvent(new Event('pagehide'))
    settle[0]!.ok('ok')
    settle[1]!.fail(new TypeError('Failed to fetch'))
    await Promise.all(runs)
    await tick(5)
    // The success left storage and released its lock; the aborted one is still stored and locked.
    expect(storage.mutations().map((m) => (m.state.variables as { id: string }).id)).toEqual([
      'aborted',
    ])
    expect(locks.heldBy('pyreon-query-mutation:')).toHaveLength(1)
    // Back from the back/forward cache: one write (the failure has settled for this page), then the lock goes.
    window.dispatchEvent(new Event('pageshow'))
    await tick(5)
    expect(storage.mutations()).toEqual([])
    expect(locks.heldBy('pyreon-query-mutation:')).toEqual([])
    tab.unsubscribe()
  })

  it('two clients over one storage: a copy another tab writes back right after a removal does not get the settled mutation resent', async () => {
    const locks = new FakeLocks()
    const storage = memoryStorage()
    // Another tab's write can land between this tab's removal and its lock release.
    let interleave: (() => void) | undefined
    const racing = {
      ...storage,
      setItem: (k: string, v: string) => {
        storage.setItem(k, v)
        const run = interleave
        if (run && !v.includes('"id":1')) {
          interleave = undefined
          run()
        }
      },
    }
    // Tab A dies with the request in flight.
    const a = openTab(locks, 'a', storage, (c) =>
      c.setMutationDefaults(['add'], { mutationFn: () => never() }),
    )
    await a.restored
    void start(a.client, ['add'], { id: 1 })
    await tick()
    locks.kill('a')
    a.unsubscribe()
    // Tab B takes it over through a restore alone (no subscription: it edits storage read-modify-write).
    useLocks(locks.tab('b'))
    const b = new QueryClient()
    let finish!: (v: string) => void
    b.setMutationDefaults(['add'], { mutationFn: () => new Promise<string>((r) => (finish = r)) })
    await persistQueryClientRestore({
      queryClient: b,
      persister: createSyncStoragePersister({ storage: racing }),
      maxAge: Infinity,
    })
    void b.resumePausedMutations()
    await tick()
    // Tab C, subscribed, keeps B's mutation and writes it back on its own saves.
    const cSent: unknown[] = []
    const c = openTab(locks, 'c', storage, (cl) =>
      cl.setMutationDefaults(['add'], { mutationFn: async (v) => (cSent.push(v), 'ok') }),
    )
    await c.restored
    // C writes (with its copy) the instant B's removal lands, before B lets go of the lock.
    interleave = () => {
      window.dispatchEvent(new Event('pagehide'))
      window.dispatchEvent(new Event('pageshow'))
    }
    finish('ok')
    await tick(10)
    expect(cSent).toEqual([])
    expect(storage.mutations()).toEqual([])
    c.unsubscribe()
  })
})
