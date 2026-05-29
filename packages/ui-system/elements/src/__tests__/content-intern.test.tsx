/**
 * Content `$element` interning — locks the elClassCache-hit contract for the
 * compound-Element (beforeContent / afterContent) path.
 *
 * The Element fast path + Wrapper's 4 paths route their `$element` bundle
 * through `internElementBundle()` so identical primitive tuples share one
 * object identity and the styler's identity-keyed `elClassCache` HITS,
 * skipping the resolve pipeline. The Content helper (the compound before/after
 * slots) was the one `$element` consumer NOT wired to it — it allocated a
 * fresh bundle per mount → guaranteed cache miss → a full `styler.resolve`
 * per Content slot per mount.
 *
 * This mounts N identical compound Elements and counts `styler.resolve`.
 * Post-fix the Content slots intern → resolve count is a small constant
 * (cold resolves only). Bisect: drop the `internElementBundle()` wrap in
 * Content/component.tsx → resolve count jumps to ≈ 2×N and this fails.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Element } from '../Element'

type CountSink = ((name: string, n?: number) => void) | undefined

describe('Content $element interning (elClassCache hit on the compound path)', () => {
  let cleanups: Array<() => void> = []
  let prevSink: CountSink
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
    ;(globalThis as { __pyreon_count__?: CountSink }).__pyreon_count__ = prevSink
  })

  it('compound-Element Content slots hit elClassCache instead of re-resolving per mount', () => {
    const counts: Record<string, number> = {}
    const g = globalThis as { __pyreon_count__?: CountSink }
    prevSink = g.__pyreon_count__
    g.__pyreon_count__ = (name: string, n = 1) => {
      counts[name] = (counts[name] ?? 0) + n
    }

    const N = 20
    for (let i = 0; i < N; i++) {
      const { cleanup } = mountReactive(
        h(Element as never, {
          beforeContent: 'icon',
          content: 'body',
          afterContent: 'arrow',
        }),
      )
      cleanups.push(cleanup)
    }

    const resolves = counts['styler.resolve'] ?? 0
    // Post-fix: the before/after Content slots intern after the first compound
    // Element → every subsequent slot HITS elClassCache → resolve is a small
    // constant (cold resolves only), NOT ~2×N. Pre-fix: each of the 2 Content
    // slots resolves on every one of the N mounts → ≈ 2N = 40.
    expect(resolves).toBeLessThan(N)
  })
})
