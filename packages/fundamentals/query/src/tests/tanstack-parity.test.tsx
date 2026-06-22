import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import * as QueryCore from '@tanstack/query-core'
import * as PyreonQuery from '../index'
import {
  dehydrate,
  HydrationBoundary,
  QueryClientProvider,
  QuerySuspense,
  skipToken,
  useMutation,
  useMutationState,
  usePrefetchInfiniteQuery,
  usePrefetchQuery,
  useQuery,
  useSuspenseQueries,
} from '../index'

// ─── Helpers (mirror query.test.tsx) ────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms))

// ─── Core re-export parity ───────────────────────────────────────────────────
// Every value @pyreon/query re-exports must be the SAME identity query-core
// exports — proves the surface is a faithful pass-through, not a re-implementation.

describe('query-core re-export parity', () => {
  // The 12 added in the parity PR + the prior surface — all VALUE exports.
  const valueExports = [
    // newly added
    'skipToken',
    'focusManager',
    'onlineManager',
    'notifyManager',
    'QueryObserver',
    'InfiniteQueryObserver',
    'MutationObserver',
    'QueriesObserver',
    'matchQuery',
    'matchMutation',
    'replaceEqualDeep',
    'isServer',
    // pre-existing
    'CancelledError',
    'defaultShouldDehydrateMutation',
    'defaultShouldDehydrateQuery',
    'dehydrate',
    'hashKey',
    'hydrate',
    'isCancelledError',
    'keepPreviousData',
    'MutationCache',
    'QueryCache',
    'QueryClient',
  ] as const

  const pyreon = PyreonQuery as unknown as Record<string, unknown>
  const core = QueryCore as unknown as Record<string, unknown>

  for (const name of valueExports) {
    it(`re-exports ${name} === query-core's ${name}`, () => {
      expect(name in pyreon).toBe(true)
      expect(pyreon[name]).toBe(core[name])
    })
  }

  it('observer classes are constructable', () => {
    const client = makeClient()
    expect(new PyreonQuery.QueryObserver(client, { queryKey: ['x'] })).toBeInstanceOf(
      QueryCore.QueryObserver,
    )
    expect(new PyreonQuery.QueriesObserver(client, [])).toBeInstanceOf(QueryCore.QueriesObserver)
    expect(new PyreonQuery.MutationObserver(client, {})).toBeInstanceOf(QueryCore.MutationObserver)
  })

  it('skipToken is the query-core sentinel symbol', () => {
    expect(typeof skipToken).toBe('symbol')
    expect(skipToken).toBe(QueryCore.skipToken)
  })
})

// ─── skipToken — functional ──────────────────────────────────────────────────

describe('skipToken', () => {
  it('disables the query — queryFn never runs, stays pending+idle', async () => {
    const client = makeClient()
    let query: ReturnType<typeof useQuery<string>> | undefined
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          query = useQuery<string>(() => ({
            queryKey: ['skip-token-test'],
            queryFn: skipToken,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await tick()
    // skipToken-disabled query: pending status, but NOT fetching (idle fetchStatus).
    expect(query!.isPending()).toBe(true)
    expect(query!.isFetching()).toBe(false)
    expect(query!.data()).toBeUndefined()
    unmount()
    el.remove()
  })
})

// ─── HydrationBoundary ───────────────────────────────────────────────────────

describe('HydrationBoundary', () => {
  it('hydrates dehydrated state so children resolve without refetching', () => {
    // Server: prefetch + dehydrate.
    const serverClient = makeClient()
    serverClient.setQueryData(['hb-user'], { name: 'Hydrated' })
    const state = dehydrate(serverClient)

    // Client: hydrate via the COMPONENT (not the function).
    const clientClient = makeClient()
    let query: ReturnType<typeof useQuery<{ name: string }>> | undefined
    let callCount = 0

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={clientClient}>
        <HydrationBoundary state={state}>
          {() => {
            query = useQuery(() => ({
              queryKey: ['hb-user'],
              queryFn: async () => {
                callCount++
                return { name: 'fresh' }
              },
              staleTime: Infinity,
            }))
            return null
          }}
        </HydrationBoundary>
      </QueryClientProvider>,
      el,
    )

    expect(query!.isSuccess()).toBe(true)
    expect(query!.data()).toEqual({ name: 'Hydrated' })
    expect(callCount).toBe(0)
    unmount()
    el.remove()
  })

  it('renders children unchanged when state is null/absent', () => {
    const client = makeClient()
    let ran = false
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        <HydrationBoundary>
          {() => {
            ran = true
            return null
          }}
        </HydrationBoundary>
      </QueryClientProvider>,
      el,
    )
    expect(ran).toBe(true)
    unmount()
    el.remove()
  })

  it('renders a non-function (static) child directly', () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        <HydrationBoundary>hello-static</HydrationBoundary>
      </QueryClientProvider>,
      el,
    )
    expect(el.textContent).toContain('hello-static')
    unmount()
    el.remove()
  })

  it('is marked nativeCompat', () => {
    // Symbol.for('pyreon:native-compat') brand — same contract as QueryClientProvider.
    const brand = Symbol.for('pyreon:native-compat')
    expect((HydrationBoundary as unknown as Record<symbol, unknown>)[brand]).toBeTruthy()
  })
})

// ─── useMutationState ────────────────────────────────────────────────────────

describe('useMutationState', () => {
  it('reflects in-flight mutations reactively (filtered by status)', async () => {
    const client = makeClient()
    const { promise, resolve } = deferred<string>()
    let pending: ReturnType<typeof useMutationState<string>> | undefined
    let mut: ReturnType<typeof useMutation<string, Error, string>> | undefined

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          pending = useMutationState<string>(() => ({
            filters: { status: 'pending' },
            select: (m) => m.state.variables as string,
          }))
          mut = useMutation<string, Error, string>({ mutationFn: () => promise })
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    expect(pending!()).toHaveLength(0)

    mut!.mutate('payload')
    await tick(0)
    expect(pending!()).toEqual(['payload'])

    resolve('done')
    await promise
    await tick()
    // No longer pending → filtered out.
    expect(pending!()).toHaveLength(0)
    unmount()
    el.remove()
  })

  it('default (no options) returns all mutation states', async () => {
    const client = makeClient()
    let all: ReturnType<typeof useMutationState> | undefined
    let mut: ReturnType<typeof useMutation<string, Error, void>> | undefined

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          all = useMutationState()
          mut = useMutation<string, Error, void>({ mutationFn: async () => 'done' })
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    expect(all!()).toHaveLength(0)
    mut!.mutate(undefined)
    await tick()
    // Mutation entered the cache; its state is observable.
    expect(all!().length).toBeGreaterThanOrEqual(1)
    const last = all!().at(-1) as { status: string } | undefined
    expect(last?.status).toBe('success')
    unmount()
    el.remove()
  })
})

// ─── usePrefetchQuery / usePrefetchInfiniteQuery ─────────────────────────────

describe('usePrefetchQuery', () => {
  it('prefetches data into the cache during setup', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          usePrefetchQuery(() => ({
            queryKey: ['pf-new'],
            queryFn: async () => 'fetched',
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await tick()
    expect(client.getQueryData(['pf-new'])).toBe('fetched')
    unmount()
    el.remove()
  })

  it('does NOT refetch when the key is already cached', async () => {
    const client = makeClient()
    client.setQueryData(['pf-cached'], 'existing')
    let calls = 0

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          usePrefetchQuery(() => ({
            queryKey: ['pf-cached'],
            queryFn: async () => {
              calls++
              return 'new'
            },
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await tick()
    expect(calls).toBe(0)
    expect(client.getQueryData(['pf-cached'])).toBe('existing')
    unmount()
    el.remove()
  })
})

describe('usePrefetchInfiniteQuery', () => {
  it('prefetches the first page into the cache', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          usePrefetchInfiniteQuery(() => ({
            queryKey: ['pfi'],
            queryFn: ({ pageParam }: { pageParam: number }) => Promise.resolve(`p${pageParam}`),
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await tick()
    const data = client.getQueryData(['pfi']) as { pages: string[] } | undefined
    expect(data?.pages).toEqual(['p0'])
    unmount()
    el.remove()
  })

  it('does NOT refetch when the key is already cached', async () => {
    const client = makeClient()
    client.setQueryData(['pfi-cached'], { pages: ['existing'], pageParams: [0] })
    let calls = 0

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          usePrefetchInfiniteQuery(() => ({
            queryKey: ['pfi-cached'],
            queryFn: () => {
              calls++
              return Promise.resolve('new')
            },
            initialPageParam: 0,
            getNextPageParam: () => undefined,
          }))
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await tick()
    expect(calls).toBe(0)
    const data = client.getQueryData(['pfi-cached']) as { pages: string[] } | undefined
    expect(data?.pages).toEqual(['existing'])
    unmount()
    el.remove()
  })
})

// ─── useSuspenseQueries ──────────────────────────────────────────────────────

describe('useSuspenseQueries', () => {
  it('aggregates queries; children render only when ALL succeed', async () => {
    const client = makeClient()
    const d1 = deferred<string>()
    const d2 = deferred<string>()
    let agg: ReturnType<typeof useSuspenseQueries<string>> | undefined
    let childrenData: string[] | null = null

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          agg = useSuspenseQueries<string>(() => [
            { queryKey: ['sqs-a'], queryFn: () => d1.promise },
            { queryKey: ['sqs-b'], queryFn: () => d2.promise },
          ])
          return (
            <QuerySuspense query={agg} fallback="loading">
              {() => {
                childrenData = agg!.data()
                return null
              }}
            </QuerySuspense>
          )
        }}
      </QueryClientProvider>,
      el,
    )

    await tick()
    expect(agg!.isPending()).toBe(true)
    expect(childrenData).toBeNull()

    d1.resolve('A')
    await d1.promise
    await tick()
    // One still pending → gate stays closed.
    expect(agg!.isPending()).toBe(true)
    expect(childrenData).toBeNull()

    d2.resolve('B')
    await d2.promise
    await tick()
    expect(agg!.isPending()).toBe(false)
    expect(agg!.isError()).toBe(false)
    expect(agg!.data()).toEqual(['A', 'B'])
    expect(childrenData).toEqual(['A', 'B'])
    unmount()
    el.remove()
  })

  it('isError + error aggregate when a query fails', async () => {
    const client = makeClient()
    const d1 = deferred<string>()
    const d2 = deferred<string>()
    let agg: ReturnType<typeof useSuspenseQueries<string>> | undefined

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          agg = useSuspenseQueries<string>(() => [
            { queryKey: ['sqs-err-a'], queryFn: () => d1.promise },
            { queryKey: ['sqs-err-b'], queryFn: () => d2.promise },
          ])
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    d1.resolve('ok')
    d2.reject(new Error('boom'))
    await d1.promise
    await d2.promise.catch(() => {
      /* expected */
    })
    await tick()

    expect(agg!.isError()).toBe(true)
    expect((agg!.error() as Error).message).toBe('boom')
    unmount()
    el.remove()
  })

  it('reactively re-evaluates when the queries signal changes', async () => {
    const { signal } = await import('@pyreon/reactivity')
    const client = makeClient()
    const ids = signal([1])
    let agg: ReturnType<typeof useSuspenseQueries<string>> | undefined

    const el = document.createElement('div')
    document.body.appendChild(el)
    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          agg = useSuspenseQueries<string>(() =>
            ids().map((id) => ({
              queryKey: ['sqs-reactive', id],
              queryFn: async () => `item-${id}`,
            })),
          )
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await tick(20)
    expect(agg!.results()).toHaveLength(1)
    expect(agg!.data()).toEqual(['item-1'])

    ids.set([1, 2])
    await tick(20)
    expect(agg!.results()).toHaveLength(2)
    expect(agg!.data()).toEqual(['item-1', 'item-2'])
    unmount()
    el.remove()
  })
})
