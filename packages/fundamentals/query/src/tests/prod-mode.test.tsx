/**
 * Production-mode coverage for the `process.env.NODE_ENV !== 'production'`
 * dev-gates that wrap the perf-harness counter emits across every hook.
 *
 * In the default vitest run `process.env.NODE_ENV === 'test'`, so the gate's
 * TRUE side (dev) is taken and the perf counter line runs — the FALSE side
 * (production: skip the counter) is never measured. These tests stub
 * `NODE_ENV=production` BEFORE invoking each hook so the production branch
 * executes. The gate reads `process.env.NODE_ENV` at call-time, so a static
 * import is fine — no dynamic re-import needed.
 *
 * Every hook path that carries a dev-gate is exercised here:
 *   - useQuery / useSuspenseQuery: entry + observerNotify (subscribe) + setOptions (effect)
 *   - useInfiniteQuery / useSuspenseInfiniteQuery: entry + observerNotify + setOptions
 *   - useMutation: entry + invalidate (onSuccess fan-out)
 *   - useIsFetching / useIsMutating: cache-event scan
 */
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  QueryClientProvider,
  useInfiniteQuery,
  useIsFetching,
  useIsMutating,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '../index'

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
}

function withProvider(client: QueryClient, component: () => void): () => void {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <QueryClientProvider client={client}>
      {() => {
        component()
        return null
      }}
    </QueryClientProvider>,
    el,
  )
  return () => {
    unmount()
    el.remove()
  }
}

const tick = () => new Promise((r) => setTimeout(r, 10))

describe('production-mode dev-gate false side', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('NODE_ENV is production for the gate', () => {
    expect(process.env.NODE_ENV).toBe('production')
  })

  it('useQuery: entry + observerNotify + setOptions run in production', async () => {
    const client = makeClient()
    const key = signal(1)
    let q: ReturnType<typeof useQuery> | null = null

    const unmount = withProvider(client, () => {
      // reactive queryKey reads the signal so the setOptions effect re-runs.
      q = useQuery(() => ({
        queryKey: ['prod-q', key()],
        queryFn: async () => 'ok',
      }))
      // Materialize a slot so observerNotify writes (and thus the subscribe
      // callback body) actually run.
      void q.data
    })

    // Wait for the async queryFn to resolve → fires the subscribe callback.
    await tick()
    expect(q!.data()).toBe('ok')

    // Flip the reactive key → re-runs the setOptions effect in production.
    key.set(2)
    await tick()

    unmount()
  })

  it('useMutation: entry + invalidate fan-out run in production', async () => {
    const client = makeClient()
    // Seed a query in the cache so invalidateQueries has something to match.
    await client.fetchQuery({ queryKey: ['posts'], queryFn: async () => ['a'] })

    let m: ReturnType<typeof useMutation<number, unknown, number, unknown>> | null = null
    const unmount = withProvider(client, () => {
      m = useMutation<number, unknown, number, unknown>({
        mutationFn: async (v: number) => v * 2,
        invalidates: [['posts']],
      })
    })

    // Fire the mutation → onSuccess runs the invalidate loop in production.
    await m!.mutateAsync(21)
    await tick()

    unmount()
  })

  it('useInfiniteQuery: entry + observerNotify + setOptions run in production', async () => {
    const client = makeClient()
    const key = signal('a')
    let q: ReturnType<typeof useInfiniteQuery> | null = null

    const unmount = withProvider(client, () => {
      q = useInfiniteQuery(() => ({
        queryKey: ['prod-inf', key()],
        queryFn: async ({ pageParam }) => `page-${pageParam}`,
        initialPageParam: 0,
        getNextPageParam: (_last: unknown, _all: unknown[], lastPageParam: number) =>
          lastPageParam + 1,
      }))
      void q.data
    })

    await tick()
    key.set('b')
    await tick()

    unmount()
  })

  it('useSuspenseQuery: entry + observerNotify + setOptions run in production', async () => {
    const client = makeClient()
    const key = signal(1)
    let q: ReturnType<typeof useSuspenseQuery> | null = null

    const unmount = withProvider(client, () => {
      q = useSuspenseQuery(() => ({
        queryKey: ['prod-susp', key()],
        queryFn: async () => 'sok',
      }))
      void q.data
    })

    await tick()
    expect(q!.data()).toBe('sok')
    key.set(2)
    await tick()

    unmount()
  })

  it('useSuspenseInfiniteQuery: entry + observerNotify + setOptions run in production', async () => {
    const client = makeClient()
    const key = signal('x')
    let q: ReturnType<typeof useSuspenseInfiniteQuery> | null = null

    const unmount = withProvider(client, () => {
      q = useSuspenseInfiniteQuery(() => ({
        queryKey: ['prod-susp-inf', key()],
        queryFn: async ({ pageParam }) => `p-${pageParam}`,
        initialPageParam: 0,
        getNextPageParam: (_last: unknown, _all: unknown[], lastPageParam: number) =>
          lastPageParam + 1,
      }))
      void q.data
    })

    await tick()
    key.set('y')
    await tick()

    unmount()
  })

  it('useIsFetching: cache-event scan runs in production', async () => {
    const client = makeClient()
    let fetching: ReturnType<typeof useIsFetching> | null = null

    const unmount = withProvider(client, () => {
      fetching = useIsFetching()
    })

    // Trigger a cache event so the subscription callback (with the dev-gate) runs.
    void client.fetchQuery({ queryKey: ['scan-q'], queryFn: async () => 1 })
    await tick()
    expect(fetching!()).toBeGreaterThanOrEqual(0)

    unmount()
  })

  it('useIsMutating: cache-event scan runs in production', async () => {
    const client = makeClient()
    let mutating: ReturnType<typeof useIsMutating> | null = null

    const unmount = withProvider(client, () => {
      mutating = useIsMutating()
    })

    // A mutation drives a mutation-cache event → the dev-gated callback runs.
    await client
      .getMutationCache()
      .build(client, { mutationFn: async () => 1 })
      .execute(undefined)
    await tick()
    expect(mutating!()).toBeGreaterThanOrEqual(0)

    unmount()
  })
})
