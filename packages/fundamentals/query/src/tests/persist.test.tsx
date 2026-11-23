import { mount } from '@pyreon/runtime-dom'
import { onlineManager, QueryClient } from '@tanstack/query-core'
import { dehydrate, QueryClientProvider, useIsRestoring, useQuery } from '../index'
import * as PersistEntry from '../persist'
import {
  createAsyncStoragePersister,
  createSyncStoragePersister,
  IsRestoringProvider,
  type PersistedClient,
  PersistQueryClientProvider,
  persistQueryClient,
  persistQueryClientSave,
  type Persister,
  shouldPersistMutation,
} from '../persist'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms))

/** In-memory Persister with a configurable restore delay + seed. */
function memoryPersister(opts?: { seed?: PersistedClient; delayMs?: number }): Persister {
  let stored = opts?.seed
  const delay = opts?.delayMs ?? 0
  return {
    persistClient: (c) => {
      stored = c
    },
    restoreClient: () =>
      delay > 0
        ? new Promise<PersistedClient | undefined>((resolve) =>
            setTimeout(() => resolve(stored), delay),
          )
        : stored,
    removeClient: () => {
      stored = undefined
    },
  }
}

// ─── Subpath re-export presence ───────────────────────────────────────────────

describe('@pyreon/query/persist re-exports', () => {
  const names = [
    'persistQueryClient',
    'persistQueryClientRestore',
    'persistQueryClientSave',
    'persistQueryClientSubscribe',
    'removeOldestQuery',
    'createSyncStoragePersister',
    'createAsyncStoragePersister',
    'PersistQueryClientProvider',
    'IsRestoringProvider',
    'useIsRestoring',
  ] as const
  const entry = PersistEntry as unknown as Record<string, unknown>
  for (const n of names) {
    it(`exports ${n}`, () => {
      expect(typeof entry[n]).toBe('function')
    })
  }

  it('createSyncStoragePersister builds a working Persister over a Storage', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    }
    // throttleTime: 0 — persistClient throttles writes (default 1s); disable it
    // so the write lands on the next tick instead of a second later.
    const persister = createSyncStoragePersister({ storage, throttleTime: 0 })
    const client: PersistedClient = {
      timestamp: 1,
      buster: '',
      clientState: { mutations: [], queries: [] },
    }
    await persister.persistClient(client)
    await tick()
    expect(store.size).toBeGreaterThan(0)
    const restored = await persister.restoreClient()
    expect(restored?.buster).toBe('')
  })

  it('createAsyncStoragePersister is callable', () => {
    const store = new Map<string, string>()
    const persister = createAsyncStoragePersister({
      storage: {
        getItem: async (k: string) => store.get(k) ?? null,
        setItem: async (k: string, v: string) => {
          store.set(k, v)
        },
        removeItem: async (k: string) => {
          store.delete(k)
        },
      },
    })
    expect(typeof persister.persistClient).toBe('function')
  })
})

// ─── PersistQueryClientProvider — restore ─────────────────────────────────────

describe('PersistQueryClientProvider', () => {
  it('restores a dehydrated cache so a child query resolves without refetching', async () => {
    // Server: prefetch + dehydrate into a PersistedClient.
    const server = makeClient()
    server.setQueryData(['persist-user'], { name: 'Restored' })
    const seed: PersistedClient = {
      timestamp: 1,
      buster: '',
      clientState: dehydrate(server),
    }

    const client = makeClient()
    const persister = memoryPersister({ seed })
    let query: ReturnType<typeof useQuery<{ name: string }>> | undefined
    let callCount = 0

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: Infinity }}>
        {() => {
          query = useQuery(() => ({
            queryKey: ['persist-user'],
            queryFn: async () => {
              callCount++
              return { name: 'fresh' }
            },
            staleTime: Infinity,
          }))

          return null
        }}
      </PersistQueryClientProvider>,
      el,
    )

    // Restore is sync-ish (delay 0) but resolves on a microtask.
    await tick()
    expect(query!.data()).toEqual({ name: 'Restored' })
    expect(callCount).toBe(0)
    unmount()
    el.remove()
  })

  it('defers the child query fetch until restoration completes (the fetch-gate)', async () => {
    const client = makeClient()
    // Delayed restore + empty seed: isRestoring stays true for ~30ms, then the
    // query (no cached data) is allowed to fetch.
    const persister = memoryPersister({ delayMs: 30 })
    let isRestoring: (() => boolean) | undefined
    let callCount = 0

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
        {() => {
          isRestoring = useIsRestoring()
          useQuery(() => ({
            queryKey: ['gated'],
            queryFn: async () => {
              callCount++
              return 'data'
            },
          }))

          return null
        }}
      </PersistQueryClientProvider>,
      el,
    )

    // During restoration: the gate holds off — queryFn must NOT have run.
    await tick(5)
    expect(isRestoring!()).toBe(true)
    expect(callCount).toBe(0)

    // After restoration completes: the query subscribes + fetches.
    await tick(45)
    expect(isRestoring!()).toBe(false)
    expect(callCount).toBe(1)
    unmount()
    el.remove()
  })

  it('provides the QueryClient to descendants', async () => {
    const client = makeClient()
    const persister = memoryPersister()
    let query: ReturnType<typeof useQuery<string>> | undefined

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
        {() => {
          query = useQuery(() => ({ queryKey: ['provided'], queryFn: async () => 'ok' }))
          return null
        }}
      </PersistQueryClientProvider>,
      el,
    )
    await tick(20)
    expect(query!.data()).toBe('ok')
    unmount()
    el.remove()
  })

  it('calls onError + clears isRestoring when restoration fails', async () => {
    const client = makeClient()
    // restoreClient rejects → persistQueryClientRestore re-throws → onError path.
    const persister: Persister = {
      persistClient: () => {},
      restoreClient: () => Promise.reject(new Error('restore failed')),
      removeClient: () => {},
    }
    let errored = false
    let isRestoring: (() => boolean) | undefined

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider
        client={client}
        persistOptions={{ persister }}
        onError={() => {
          errored = true
        }}
      >
        {() => {
          isRestoring = useIsRestoring()
          return null
        }}
      </PersistQueryClientProvider>,
      el,
    )
    await tick(20)
    expect(errored).toBe(true)
    expect(isRestoring!()).toBe(false)
    unmount()
    el.remove()
  })

  it('renders a non-function (static) child', async () => {
    const client = makeClient()
    const persister = memoryPersister()
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
        persist-static-child
      </PersistQueryClientProvider>,
      el,
    )
    await tick()
    expect(el.textContent).toContain('persist-static-child')
    unmount()
    el.remove()
  })

  it('does not set isRestoring after unmount mid-restore (cancelled guard, success path)', async () => {
    const client = makeClient()
    const persister = memoryPersister({ delayMs: 30 })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
        {() => null}
      </PersistQueryClientProvider>,
      el,
    )
    // Unmount BEFORE the delayed restore resolves → cancelled guard fires.
    unmount()
    el.remove()
    await expect(tick(45)).resolves.toBeUndefined() // no set-after-dispose throw
  })

  it('does not set isRestoring after unmount mid-failing-restore (cancelled guard, error path)', async () => {
    const client = makeClient()
    const persister: Persister = {
      persistClient: () => {},
      restoreClient: () =>
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('late fail')), 30)),
      removeClient: () => {},
    }
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
        {() => null}
      </PersistQueryClientProvider>,
      el,
    )
    unmount()
    el.remove()
    await expect(tick(45)).resolves.toBeUndefined()
  })

  it('resumes a persisted PAUSED mutation once restored (offline write survives a reload)', async () => {
    // Session 1 (offline): a mutation with a mutationKey pauses and is dehydrated.
    const first = makeClient()
    const lost = vi.fn(async (_v: string) => 'session-1')
    first.setMutationDefaults(['todo-add'], { mutationFn: lost })
    onlineManager.setOnline(false)
    void first
      .getMutationCache()
      .build(first, { mutationKey: ['todo-add'] })
      .execute('buy milk')
      .catch(() => undefined)
    await tick()
    const clientState = dehydrate(first)
    expect(clientState.mutations).toHaveLength(1)
    expect(clientState.mutations[0]!.state.isPaused).toBe(true)
    first.clear()

    // Session 2 (page reload while ONLINE: no offline -> online transition
    // will ever fire, so only the provider can resume it).
    onlineManager.setOnline(true)
    const second = makeClient()
    const sent = vi.fn(async (_v: string) => 'sent')
    second.setMutationDefaults(['todo-add'], { mutationFn: sent })
    const persister = memoryPersister({ seed: { timestamp: Date.now(), buster: '', clientState } })

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider client={second} persistOptions={{ persister, maxAge: Infinity }}>
        {() => null}
      </PersistQueryClientProvider>,
      el,
    )
    await tick(30)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent.mock.calls[0]![0]).toBe('buy milk')
    expect(lost).not.toHaveBeenCalled()
    unmount()
    el.remove()
  })

  it('calls onSuccess after restoration', async () => {
    const client = makeClient()
    const persister = memoryPersister({ delayMs: 10 })
    let succeeded = false

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider
        client={client}
        persistOptions={{ persister }}
        onSuccess={() => {
          succeeded = true
        }}
      >
        {() => null}
      </PersistQueryClientProvider>,
      el,
    )
    await tick(30)
    expect(succeeded).toBe(true)
    unmount()
    el.remove()
  })
})

// ─── useIsRestoring / IsRestoringProvider ─────────────────────────────────────

describe('useIsRestoring', () => {
  it('defaults to false when no provider is mounted', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    let restoring: (() => boolean) | undefined
    const unmount = mount(
      <QueryClientProvider client={makeClient()}>
        {() => {
          restoring = useIsRestoring()
          return null
        }}
      </QueryClientProvider>,
      el,
    )
    expect(restoring!()).toBe(false)
    unmount()
    el.remove()
  })

  it('IsRestoringProvider provides a static value', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    let restoring: (() => boolean) | undefined
    const unmount = mount(
      <IsRestoringProvider value={true}>
        {() => {
          restoring = useIsRestoring()
          return null
        }}
      </IsRestoringProvider>,
      el,
    )
    expect(restoring!()).toBe(true)
    unmount()
    el.remove()
  })

  it('IsRestoringProvider accepts an accessor value', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    let restoring: (() => boolean) | undefined
    const unmount = mount(
      <IsRestoringProvider value={() => true}>
        {() => {
          restoring = useIsRestoring()
          return null
        }}
      </IsRestoringProvider>,
      el,
    )
    expect(restoring!()).toBe(true)
    unmount()
    el.remove()
  })

  it('IsRestoringProvider renders a non-function (static) child', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <IsRestoringProvider value={false}>restoring-child</IsRestoringProvider>,
      el,
    )
    expect(el.textContent).toContain('restoring-child')
    unmount()
    el.remove()
  })
})

// ─── persistQueryClient (engine re-export) ────────────────────────────────────

describe('persistQueryClient engine', () => {
  it('returns [unsubscribe, restorePromise] and restores into the client', async () => {
    const server = makeClient()
    server.setQueryData(['eng'], 42)
    const seed: PersistedClient = { timestamp: 1, buster: '', clientState: dehydrate(server) }

    const client = makeClient()
    const persister = memoryPersister({ seed })
    const [unsubscribe, restorePromise] = persistQueryClient({
      queryClient: client,
      persister,
      maxAge: Infinity,
    })
    expect(typeof unsubscribe).toBe('function')
    await restorePromise
    expect(client.getQueryData(['eng'])).toBe(42)
    unsubscribe()
  })
})

// ─── The persisted-mutation contract (#4723) ─────────────────────────────────
// A mutation leaves persisted storage only once it settles. Paused OR in
// flight, it stays persisted, and it comes back paused so it is resumed.

describe('persisted mutations stay persisted until they settle', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    return { promise, resolve, reject }
  }

  afterEach(() => onlineManager.setOnline(true))

  it('keeps an IN-FLIGHT mutation persisted, and drops it once it succeeds', async () => {
    const client = makeClient()
    const request = deferred<string>()
    client.setMutationDefaults(['m'], { mutationFn: () => request.promise })
    const persister = memoryPersister()
    const [unsubscribe, restored] = persistQueryClient({
      queryClient: client,
      persister,
      maxAge: Infinity,
    })
    await restored
    const run = client
      .getMutationCache()
      .build(client, { mutationKey: ['m'] })
      .execute('v1')
    await tick()
    const inFlight = (await persister.restoreClient())!.clientState.mutations
    expect(inFlight.map((m) => [m.state.variables, m.state.isPaused])).toEqual([['v1', false]])
    request.resolve('ok')
    await run
    await tick()
    expect((await persister.restoreClient())!.clientState.mutations).toEqual([])
    unsubscribe()
  })

  it('drops a mutation once it fails (settled is settled)', async () => {
    const client = makeClient()
    const request = deferred<string>()
    client.setMutationDefaults(['m'], { mutationFn: () => request.promise })
    const persister = memoryPersister()
    const [unsubscribe, restored] = persistQueryClient({
      queryClient: client,
      persister,
      maxAge: Infinity,
    })
    await restored
    const run = client
      .getMutationCache()
      .build(client, { mutationKey: ['m'] })
      .execute('v1')
    await tick()
    expect((await persister.restoreClient())!.clientState.mutations).toHaveLength(1)
    request.reject(new Error('rejected by the server'))
    await run.catch(() => undefined)
    await tick()
    expect((await persister.restoreClient())!.clientState.mutations).toEqual([])
    unsubscribe()
  })

  it('restores an in-flight mutation as PAUSED and resumes it (the provider path)', async () => {
    // Session 1 dies with the request in flight.
    const first = makeClient()
    first.setMutationDefaults(['m'], { mutationFn: () => new Promise<string>(() => undefined) })
    const persister = memoryPersister()
    void first
      .getMutationCache()
      .build(first, { mutationKey: ['m'] })
      .execute('v1')
      .catch(() => undefined)
    await tick()
    await persistQueryClientSave({ queryClient: first, persister })
    // Stored as it was: pending and NOT paused (it was in flight).
    const stored = (await persister.restoreClient())!.clientState.mutations
    expect(stored.map((m) => [m.state.status, m.state.isPaused])).toEqual([['pending', false]])

    // Session 2 loads online: the restored mutation is sent.
    const second = makeClient()
    const sent = vi.fn(async (_v: string) => 'sent')
    second.setMutationDefaults(['m'], { mutationFn: sent })
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <PersistQueryClientProvider client={second} persistOptions={{ persister, maxAge: Infinity }}>
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

  it('a restored paused mutation stays persisted while the client is still offline', async () => {
    const first = makeClient()
    first.setMutationDefaults(['m'], { mutationFn: async () => 'never' })
    onlineManager.setOnline(false)
    void first
      .getMutationCache()
      .build(first, { mutationKey: ['m'] })
      .execute('v1')
      .catch(() => undefined)
    await tick()
    const persister = memoryPersister()
    await persistQueryClientSave({ queryClient: first, persister })

    const second = makeClient()
    const sent = vi.fn(async (_v: string) => 'sent')
    second.setMutationDefaults(['m'], { mutationFn: sent })
    const [unsubscribe, restored] = persistQueryClient({
      queryClient: second,
      persister,
      maxAge: Infinity,
    })
    await restored
    await second.resumePausedMutations()
    second.setQueryData(['trigger-a-save'], 1)
    await tick()
    expect(sent).not.toHaveBeenCalled()
    expect(
      (await persister.restoreClient())!.clientState.mutations.map((m) => m.state.variables),
    ).toEqual(['v1'])
    unsubscribe()
  })

  it('an explicit dehydrateOptions.shouldDehydrateMutation still wins', async () => {
    const client = makeClient()
    client.setMutationDefaults(['m'], { mutationFn: () => new Promise<string>(() => undefined) })
    void client
      .getMutationCache()
      .build(client, { mutationKey: ['m'] })
      .execute('v1')
      .catch(() => undefined)
    await tick()
    const persister = memoryPersister()
    await persistQueryClientSave({
      queryClient: client,
      persister,
      dehydrateOptions: { shouldDehydrateMutation: () => false },
    })
    expect((await persister.restoreClient())!.clientState.mutations).toEqual([])
  })

  it('shouldPersistMutation is true exactly for unsettled mutations', async () => {
    const client = makeClient()
    const m = client.getMutationCache().build(client, { mutationFn: async () => 'ok' })
    expect(shouldPersistMutation(m)).toBe(false) // idle
    const run = m.execute(undefined)
    expect(shouldPersistMutation(m)).toBe(true) // pending
    await run
    expect(shouldPersistMutation(m)).toBe(false) // success
  })
})
