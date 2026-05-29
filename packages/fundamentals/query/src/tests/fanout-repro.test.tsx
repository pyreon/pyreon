/** @jsxImportSource @pyreon/core */
/**
 * Reproduction of the deferred bug from PR #490 (queryReactiveKey-1000 journey).
 *
 * Real-app shape: 100 useQuery hooks subscribing to a shared `reactKey`
 * signal via their queryKey closures. External tight-loop `reactKey.set(i)`
 * × 10 was empirically observed to fire only 0–1 of the 1000 expected
 * setOptions runs.
 *
 * This test mounts that exact shape (real Pyreon mount + real TanStack
 * QueryObserver via useQuery) and asserts each useQuery's setOptions effect
 * runs once per external .set call.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import { describe, expect, it } from 'vitest'
import { QueryClientProvider, useQuery } from '../index'

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  })
}

describe('queryReactiveKey fanout (deferred bug from PR #490)', () => {
  it('100 useQuery hooks reading a shared reactive key — setOptions fires per .set', () => {
    const client = makeClient()
    const reactKey = signal(0)
    let setOptionsCount = 0

    // Hook into the perf counter sink — measures actual setOptions effect runs.
    const w = globalThis as { __pyreon_count__?: (n: string) => void }
    const prev = w.__pyreon_count__
    w.__pyreon_count__ = (name) => {
      if (name === 'query.setOptions') setOptionsCount++
      prev?.(name)
    }

    const root = document.createElement('div')
    document.body.appendChild(root)

    let unmount: () => void = () => {}
    try {
      unmount = mount(
        h(QueryClientProvider, { client }, () => {
          for (let i = 0; i < 100; i++) {
            const idx = i
            useQuery(() => ({
              queryKey: ['perf-reactive', reactKey(), idx],
              queryFn: () => Promise.resolve(idx),
            }))
          }
          return h('div', null, 'mounted')
        }),
        root,
      )

      // Initial mount: one setOptions emit per useQuery.
      expect(setOptionsCount, 'initial setOptions runs').toBe(100)

      // External tight-loop writes from outside any Pyreon scope.
      for (let i = 1; i <= 10; i++) reactKey.set(i)

      // Each of the 100 useQuery setOptions effects should re-run on each
      // of the 10 flips → 100 × 10 = 1000 additional emits, total 1100.
      expect(setOptionsCount, 'setOptions runs after 10 flips').toBe(1100)
    } finally {
      unmount()
      root.remove()
      if (prev) w.__pyreon_count__ = prev
      else delete w.__pyreon_count__
    }
  })
})
