/**
 * SSR volume / scaling probe.
 *
 * The shape test (`ssr.test.ts`) proves each counter fires at the right
 * cardinality on tiny trees. This probe proves the counters SCALE the way
 * the emit contract claims on realistic workloads (1k-10k nodes):
 *
 *   - component count == number of component vnodes (linear, not quadratic)
 *   - for.keyMarker == total items across all For lists
 *   - escape count grows with user-text density, not DOM size
 *   - render fires exactly once regardless of depth
 *
 * A quadratic emit (e.g. a counter accidentally placed inside a nested
 * loop) would turn 1k items into 1M emits — caught here with absolute
 * upper bounds.
 */
import { For, h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

const Row = ({ label }: { label: string }) =>
  h('li', null, h('span', null, label))

describe('SSR counter scaling', () => {
  it('1k-row list: counters scale linearly with row count', async () => {
    const N = 1000
    const items = Array.from({ length: N }, (_, i) => `row-${i}`)

    const outcome = await perfHarness.record('ssr-volume-1k', async () => {
      await renderToString(
        h(
          'ul',
          null,
          h(For, {
            each: () => items,
            by: (s: string) => s,
            children: (label: string) => h(Row, { label }),
          }),
        ),
      )
    })

    // Single render → 1 render counter
    expect(outcome.after['runtime-server.render']).toBe(1)

    // N Row components + 1 For wrapper component → N+1. Linear, not quadratic.
    // (`For` itself is a ComponentFn that returns a ForSymbol vnode; the
    // renderer fires `runtime-server.component` on its invocation too.)
    expect(outcome.after['runtime-server.component']).toBe(N + 1)

    // N key markers — one per For item
    expect(outcome.after['runtime-server.for.keyMarker']).toBe(N)

    // No Suspense in this tree
    expect(outcome.after['runtime-server.suspense.boundary']).toBeFalsy()

    // Escape should fire for the strings that contain '-' (they don't need
    // escaping) and any '<>&"' chars (none here). Zero or low.
    expect(outcome.after['runtime-server.escape'] ?? 0).toBe(0)
  })

  it('10k-row list: emit count stays linear, not polynomial', async () => {
    const N = 10_000
    const items = Array.from({ length: N }, (_, i) => `r${i}`)

    const outcome = await perfHarness.record('ssr-volume-10k', async () => {
      await renderToString(
        h(
          'ul',
          null,
          h(For, {
            each: () => items,
            by: (s: string) => s,
            children: (label: string) => h(Row, { label }),
          }),
        ),
      )
    })

    // Catch quadratic emits: a bug that accidentally puts an emit inside
    // a nested loop would make this number N*N = 100_000_000. N+1 is the
    // correct linear count (N Rows + 1 For wrapper).
    expect(outcome.after['runtime-server.component']).toBe(N + 1)
    expect(outcome.after['runtime-server.for.keyMarker']).toBe(N)
  })

  it('escape count scales with unsafe-char density, not node count', async () => {
    // 1k rows, all with safe strings → near-zero escape count
    const safeItems = Array.from({ length: 1000 }, (_, i) => `row${i}`)
    const safeOutcome = await perfHarness.record('ssr-escape-safe', async () => {
      await renderToString(
        h(
          'ul',
          null,
          h(For, {
            each: () => safeItems,
            by: (s: string) => s,
            children: (s: string) => h('li', null, s),
          }),
        ),
      )
    })
    expect(safeOutcome.after['runtime-server.escape'] ?? 0).toBe(0)

    // Same 1k rows, but each contains '<' → escape fires per row
    _reset()
    const unsafeItems = Array.from({ length: 1000 }, (_, i) => `<row${i}>`)
    const unsafeOutcome = await perfHarness.record('ssr-escape-unsafe', async () => {
      await renderToString(
        h(
          'ul',
          null,
          h(For, {
            each: () => unsafeItems,
            by: (s: string) => s,
            children: (s: string) => h('li', null, s),
          }),
        ),
      )
    })
    expect(unsafeOutcome.after['runtime-server.escape']).toBe(1000)
  })
})
