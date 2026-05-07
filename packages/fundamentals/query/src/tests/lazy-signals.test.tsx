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
import { QueryClientProvider, useMutation, useQuery } from '../index'

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
