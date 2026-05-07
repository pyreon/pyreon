/**
 * Lazy-signal allocation contract for `useQuery` / `useMutation` /
 * `useSuspenseQuery` / `useInfiniteQuery`.
 *
 * Each result field (`data`, `error`, `isPending`, etc.) is allocated on
 * FIRST property access and stays allocated for the lifetime of the hook.
 * The observer's subscribe callback only writes to materialized slots.
 *
 * Contract checks:
 *   1. `query.data` returns the SAME signal reference on every access
 *      (effect-tracking subscribes by signal identity — this is load-bearing).
 *   2. Reading a field before any cache update returns the initial value.
 *   3. After a cache update, materialized signals reflect the new value.
 *   4. Fields that were NEVER accessed remain unallocated (we can't easily
 *      observe this directly in a unit test, but the perf-record harness
 *      proves it via `reactivity.signalCreate` counters — see the PR
 *      description for the full diff).
 */
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import { describe, expect, it } from 'vitest'
import {
  QueryClientProvider,
  useInfiniteQuery,
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

describe('lazy signal allocation — contract', () => {
  it('useQuery: same signal reference on repeat property access', () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let firstRead: unknown = null
    let secondRead: unknown = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          const q = useQuery(() => ({
            queryKey: ['lazy-identity'],
            queryFn: () => Promise.resolve(42),
          }))
          // Identity must be stable — Pyreon's effect-tracking subscribes by
          // signal identity, so any getter that returns a fresh signal per
          // access would defeat reactivity entirely.
          firstRead = q.data
          secondRead = q.data
          return null
        }}
      </QueryClientProvider>,
      el,
    )
    unmount()
    el.remove()
    expect(firstRead).toBe(secondRead)
  })

  it('useQuery: materialized signal reflects observer updates', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let dataReader: (() => number | undefined) | null = null
    let isFetchingReader: (() => boolean) | null = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          const q = useQuery(() => ({
            queryKey: ['lazy-update'],
            queryFn: () => Promise.resolve(7),
          }))
          dataReader = () => q.data() as number | undefined
          isFetchingReader = () => q.isFetching()
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    // Wait one microtask + the queryFn to resolve.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(dataReader).not.toBeNull()
    expect(dataReader!()).toBe(7)
    expect(isFetchingReader!()).toBe(false)
    unmount()
    el.remove()
  })

  it('useMutation: same signal reference on repeat property access', () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let firstRead: unknown = null
    let secondRead: unknown = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          const m = useMutation({
            mutationFn: (n: number) => Promise.resolve(n),
          })
          firstRead = m.isPending
          secondRead = m.isPending
          return null
        }}
      </QueryClientProvider>,
      el,
    )
    unmount()
    el.remove()
    expect(firstRead).toBe(secondRead)
  })

  it('useMutation: data signal reflects mutate() result', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let dataReader: (() => number | undefined) | null = null
    let triggerMutate: ((n: number) => void) | null = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          const m = useMutation({
            mutationFn: (n: number) => Promise.resolve(n * 2),
          })
          dataReader = () => m.data() as number | undefined
          triggerMutate = (n) => m.mutate(n)
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    expect(triggerMutate).not.toBeNull()
    triggerMutate!(21)
    // Promise.resolve + the observer's subscribe pipeline.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(dataReader!()).toBe(42)
    unmount()
    el.remove()
  })
})

// ─── Coverage: exercise every getter + every subscribe-write branch ────────
//
// The lazy-getter pattern adds one branch per field: `slots.X ??= signal(...)`
// is the materialization branch, and `if (slots.X) slots.X.set(...)` in the
// subscribe callback is the materialized-write branch. Reading every field
// AFTER mount (so the subscribe callback's initial-fire writes nothing) and
// AGAIN after an observer update covers both branches per field.
describe('lazy signal allocation — full-getter coverage', () => {
  it('useQuery: every field materializes and sees updates', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let q: ReturnType<typeof useQuery<number>> | null = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          q = useQuery<number>(() => ({
            queryKey: ['lazy-coverage-q'],
            queryFn: () => Promise.resolve(11),
          }))
          // Touch every getter so the materialization branch is covered.
          // Each access also seeds the subscribe-callback's write branch.
          void q.result()
          void q.data()
          void q.error()
          void q.status()
          void q.isPending()
          void q.isLoading()
          void q.isFetching()
          void q.isError()
          void q.isSuccess()
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(q).not.toBeNull()
    expect(q!.data()).toBe(11)
    expect(q!.isSuccess()).toBe(true)
    expect(q!.error()).toBeNull()
    // refetch() is the surface API — exercised here to cover that arm too.
    await q!.refetch()
    expect(q!.data()).toBe(11)

    unmount()
    el.remove()
  })

  it('useMutation: every field materializes and sees mutate updates', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let m: ReturnType<typeof useMutation<number, Error, number>> | null = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          m = useMutation<number, Error, number>({
            mutationFn: (n) => Promise.resolve(n + 1),
          })
          void m.result()
          void m.data()
          void m.error()
          void m.status()
          void m.isPending()
          void m.isSuccess()
          void m.isError()
          void m.isIdle()
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    expect(m).not.toBeNull()
    m!.mutate(5)
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(m!.data()).toBe(6)
    expect(m!.isSuccess()).toBe(true)
    m!.reset()

    unmount()
    el.remove()
  })

  it('useInfiniteQuery: every field materializes and sees updates', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let q: ReturnType<typeof useInfiniteQuery<number>> | null = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          q = useInfiniteQuery<number>(() => ({
            queryKey: ['lazy-coverage-iq'],
            queryFn: ({ pageParam }) => Promise.resolve((pageParam as number) * 2),
            initialPageParam: 1,
            getNextPageParam: (lastPage) => (lastPage < 8 ? lastPage + 1 : undefined),
          }))
          void q.result()
          void q.data()
          void q.error()
          void q.status()
          void q.isPending()
          void q.isLoading()
          void q.isFetching()
          void q.isFetchingNextPage()
          void q.isFetchingPreviousPage()
          void q.isError()
          void q.isSuccess()
          void q.hasNextPage()
          void q.hasPreviousPage()
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(q).not.toBeNull()
    expect(q!.data()?.pages?.[0]).toBe(2)
    expect(q!.hasNextPage()).toBe(true)
    await q!.fetchNextPage()

    unmount()
    el.remove()
  })

  it('useSuspenseQuery: every field materializes', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let q: ReturnType<typeof useSuspenseQuery<number>> | null = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          q = useSuspenseQuery<number>(() => ({
            queryKey: ['lazy-coverage-sq'],
            queryFn: () => Promise.resolve(99),
          }))
          void q.result()
          void q.data()
          void q.error()
          void q.status()
          void q.isPending()
          void q.isFetching()
          void q.isError()
          void q.isSuccess()
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(q).not.toBeNull()
    expect(q!.isSuccess()).toBe(true)

    unmount()
    el.remove()
  })

  it('useSuspenseInfiniteQuery: every field materializes', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let q: ReturnType<typeof useSuspenseInfiniteQuery<number>> | null = null

    const unmount = mount(
      <QueryClientProvider client={client}>
        {() => {
          q = useSuspenseInfiniteQuery<number>(() => ({
            queryKey: ['lazy-coverage-siq'],
            queryFn: ({ pageParam }) => Promise.resolve((pageParam as number) + 100),
            initialPageParam: 1,
            getNextPageParam: (last) => (last < 105 ? last + 1 : undefined),
          }))
          void q.result()
          void q.data()
          void q.error()
          void q.status()
          void q.isFetching()
          void q.isFetchingNextPage()
          void q.isFetchingPreviousPage()
          void q.isError()
          void q.isSuccess()
          void q.hasNextPage()
          void q.hasPreviousPage()
          return null
        }}
      </QueryClientProvider>,
      el,
    )

    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(q).not.toBeNull()
    expect(q!.isSuccess()).toBe(true)

    unmount()
    el.remove()
  })
})
