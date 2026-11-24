/**
 * Complexity lock — a `<For>` clear/replace of n rows must cost O(1) DOM
 * removals, not n.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `handleFastClear` / `handleReplaceAll` run every entry's cleanup BEFORE the
 * "ONE native remove-all" (`replaceChildren`). A top-level element cleanup ends
 * in `el.parentNode.removeChild(el)`, so whether the bulk call does the work or
 * merely sweeps an already-empty parent depends on a shape that is NOT visible
 * at those call sites: a COMPILED row returns a `NativeItem` whose cleanup
 * disposes bindings only and never touches the DOM, leaving all n removals to
 * the single bulk call.
 *
 * Measured price of getting that wrong (real Chromium, bare DOM, interleaved,
 * 30 samples): removing 1,000 `<tr>` one at a time costs 765-795µs against
 * 670-698µs for one `replaceChildren` — ~1.14x, ~75-90 ns/row. At 10,000 rows:
 * 7.90ms vs 7.05-7.18ms.
 *
 * That matters because the rest of teardown is already thin: WITHIN one run,
 * Pyreon's whole clear costs 1.07-1.18x a hand-written Vanilla control across
 * n=100..10,000 (`bench-teardown-curve.ts`). So a per-row detach would add a
 * double-digit percentage to the one row-list op the framework does not
 * already win. (Do NOT compare Pyreon's clear against a bare-DOM
 * `replaceChildren` figure from a different session to argue it is "at the
 * floor": the clear CONTAINS that call plus n cleanups, so it cannot be below
 * it, and the between-session spread on that primitive is ~10%.)
 *
 * `for-clear-replace-fast.test.tsx` covers the same branches but drives them
 * with `h()`, where rows ARE VNodes and each cleanup legitimately removes its
 * own element. That path is real but is NOT what ships: every Pyreon app runs
 * the vite-plugin, so the row is a `_tpl`. These specs therefore compile REAL
 * JSX through `transformJSX` — asserting the shipped shape rather than the test
 * harness's.
 *
 * Bisect-verified: making the compiled row's cleanup detach its own element
 * (the `h()`-path behaviour) fails 4 of these 5 specs — `childrenAtBulk`
 * `expected 2 to be 202` (the bulk call found an empty parent), `ownRemovals`
 * `expected 200 to be +0`, and the n-independence spec `expected 500 to be 50`.
 * The teardown-completeness spec correctly stays green: cleanups still ran.
 * `for-clear-replace-fast.test.tsx`'s 10 specs ALSO stay green throughout —
 * verified, not assumed — which is the gap these specs exist to close.
 * Restored -> 15/15 across both files.
 */
import { query } from '@pyreon/test-utils'
import { transformJSX } from '@pyreon/compiler'
import { Fragment, For, h, _pk, _pp, _rp, _rpd, cx } from '@pyreon/core'
import { EffectScope, _bind, signal, renderEffect } from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountChild, _bindProp} from '../index'
import { _dispose2 } from '../dispose-helpers'
import { _bindDirect, _bindText, _mountSlot, _textSlot, _setChild, _setChildAt, _tpl } from '../template'

// ─── Counter sink (mirrors for-clear-replace-fast.test.tsx) ──────────────────
const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__

beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})

let mounted: Array<() => void>

beforeEach(() => {
  mounted = []
})

afterEach(() => {
  for (const dispose of mounted) dispose()
  mounted = []
  g.__pyreon_count__ = prevSink
})

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  renderEffect,
  _bindText,
  _bindProp,
  _bindDirect,
  _dispose2,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _pk,
  _pp,
  _rp,
  _rpd,
  _cx: cx,
  h,
  Fragment,
  For,
  signal,
  document,
} as const

const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

const FOR_LI_SOURCE = `
export const App = (props) => (
  <ul>
    <For each={props.rows} by={(row) => row.id}>
      {(row) => <li class="row">{() => row.label()}</li>}
    </For>
  </ul>
)
`

/**
 * Compile a `<For>` over compiled-template rows with the REAL client transform
 * and mount it. `rows` is the live signal the specs drive.
 */
function mountCompiledFor(n: number, source: string = FOR_LI_SOURCE) {
  // Containers are registered for teardown in an afterEach: a failing assertion
  // must not leave a mounted <For> with n live rows attached to document.body.
  // NOT indented: the strip below is line-anchored, and an indented `export`
  // survives it and reaches `new Function` as a syntax error.
  //
  // The row carries a REACTIVE binding (`{() => row.label()}`) on purpose: a
  // binding-free row compiles to `_tpl(..., () => { ...; return null })`, whose
  // NativeItem cleanup is null, so `cleanupCount` stays 0 and `handleFastClear`
  // skips its cleanup loop entirely — the exact branch these specs must
  // exercise would never run.
  const { code } = transformJSX(source, 'rows.tsx')
  const body = transformSync(
    code.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, '').trim(),
    { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment' },
  ).code
  const App = new Function(...DEP_NAMES, `${body}\nreturn App`)(...DEP_VALUES) as (
    p: unknown,
  ) => unknown

  const mk = (id: number) => ({ id, label: signal(`row ${id}`), done: signal(id % 3 === 0) })
  const rows = signal(Array.from({ length: n }, (_, i) => mk(i + 1)))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(h(App as never, { rows: () => rows() }), container) ?? (() => {})
  mounted.push(() => {
    cleanup()
    container.remove()
  })
  // The list's parent: the `<ul>` of the plain rows, the `<tbody>` of the table rows.
  const ul = query<HTMLElement>(container, 'ul, tbody')

  return { rows, container, ul, cleanup, mk }
}

/**
 * Record the DOM removal primitives PYREON fires while `fn` runs.
 *
 * `bulkChildCounts` is the LOAD-BEARING half, and the only assertion here that
 * is engine-independent and cannot pass for the wrong reason: `[n + 2]` proves
 * the single bulk call is what removes the rows. Had the per-row cleanups
 * detached first it would be `[2]` — the bulk branch would still be "taken",
 * the existing `clearFast` counter spec would still pass, and every row would
 * have been removed one at a time.
 *
 * `ownRemovals` is the weaker corroborating half. It counts `removeChild` calls
 * made OUTSIDE the bulk call; the suppression is required because happy-dom
 * implements `replaceChildren` AS a `removeChild` loop, so an unsuppressed spy
 * reports n+2 here and 0 in Chromium — it would measure the test DOM's
 * internals and assert the opposite of what ships. Its honest limit: a refactor
 * of `mount.ts` from `p.removeChild(el)` to `el.remove()` is caught in
 * happy-dom (which routes `.remove()` through `Node.prototype.removeChild`) but
 * would NOT be counted in Chromium. The suite still fails on such a refactor —
 * via `bulkChildCounts` — so lean on that one.
 */
function recordRemovals(fn: () => void) {
  const nodeProto = Node.prototype as unknown as { removeChild: <T extends Node>(c: T) => T }
  const elProto = Element.prototype as unknown as { replaceChildren: (...n: Node[]) => void }
  const realRemove = nodeProto.removeChild
  const realReplace = elProto.replaceChildren
  let inBulk = false
  let ownRemovals = 0
  // Removals from a CONNECTED parent only: a replace builds each new row in a
  // detached clone first, and a compiled slot drops its `<!>` placeholder
  // there — a removal no layout ever sees.
  let liveRemovals = 0
  // Per-CALL child counts, not a running sum: a sum cannot tell one bulk call
  // over n+2 children from two calls that happen to add up to it.
  const bulkChildCounts: number[] = []
  nodeProto.removeChild = function <T extends Node>(this: Node, c: T): T {
    if (!inBulk) {
      ownRemovals++
      if (this.isConnected) liveRemovals++
    }

    return realRemove.call(this, c) as T
  }
  elProto.replaceChildren = function (this: Element, ...nodes: Node[]) {
    bulkChildCounts.push(this.childNodes.length)
    inBulk = true
    try {
      return realReplace.apply(this, nodes)
    } finally {
      inBulk = false
    }
  }
  try {
    fn()
  } finally {
    nodeProto.removeChild = realRemove
    elProto.replaceChildren = realReplace
  }

  return {
    ownRemovals,
    liveRemovals,
    bulkChildCounts,
    replaceCalls: bulkChildCounts.length,
    childrenAtBulk: bulkChildCounts.reduce((a, b) => a + b, 0),
  }
}

const N = 200

describe('mountFor — a clear/replace of n compiled rows costs O(1) DOM removals', () => {
  it('CLEAR: one bulk call, and it is the call that does the work', () => {
    const { rows, ul } = mountCompiledFor(N)
    expect(ul.querySelectorAll('li.row')).toHaveLength(N)

    const ops = recordRemovals(() => rows.set([]))

    expect(ops.bulkChildCounts).toEqual([N + 2])
    expect(ul.querySelectorAll('li.row')).toHaveLength(0)
  })

  it('CLEAR: Pyreon itself fires ZERO removeChild — the cost stays O(1), not O(n)', () => {
    const { rows } = mountCompiledFor(N)
    const ops = recordRemovals(() => rows.set([]))
    expect(ops.ownRemovals).toBe(0)
  })

  it('CLEAR: every row is still torn down (O(1) DOM ops must not mean skipped cleanups)', () => {
    const { rows } = mountCompiledFor(N)
    const before = counts['runtime.cleanup'] ?? 0
    rows.set([])
    expect((counts['runtime.cleanup'] ?? 0) - before).toBe(N)
    expect(counts['runtime.mountFor.clearFast']).toBe(1)
  })

  it('REPLACE (no surviving key): one bulk call over the old rows, zero live removeChild', () => {
    const { rows, ul, mk } = mountCompiledFor(N)
    const ops = recordRemovals(() => {
      rows.set(Array.from({ length: N }, (_, i) => mk(10_000 + i)))
    })
    expect(ops.bulkChildCounts).toEqual([N + 2])
    expect(ops.ownRemovals).toBe(0)
    expect(counts['runtime.mountFor.replaceFast']).toBe(1)
    expect(ul.querySelectorAll('li.row')).toHaveLength(N)
  })

  it('the DOM-op count is INDEPENDENT of n — the property that makes teardown linear', () => {
    const at = (n: number) => {
      const { rows } = mountCompiledFor(n)
      return recordRemovals(() => rows.set([]))
    }
    const small = at(50)
    const large = at(500)
    // 10x the rows, the SAME number of removal primitives — asserted
    // ABSOLUTELY, not just as small === large: a constant k > 1 bulk calls
    // would satisfy a relative check while changing the shipped shape.
    expect(small.bulkChildCounts).toEqual([50 + 2])
    expect(large.bulkChildCounts).toEqual([500 + 2])
    expect(small.ownRemovals).toBe(0)
    expect(large.ownRemovals).toBe(0)
  })
})

/**
 * Rows that hold a REACTIVE RANGE — conditional JSX in a cell, the shape of
 * the `maplist` bench (`{row.done() ? <span/> : <em/>}`). Each such cell is a
 * `mountReactive` boundary with a marker comment and a mounted branch, and its
 * cleanup removed BOTH from the live table before the bulk call emptied it
 * anyway: 2n live `removeChild` calls on a clear of n rows, about half of the
 * clear's on-CPU time in real Chromium (1,000 rows: 274 -> 179 µs/op, CPU
 * profile of the production build). The clear and the replace-all now run the
 * row cleanups inside the bulk-detach window (see BULK DETACH in nodes.ts).
 *
 * Both list shapes take the same reconciler: `<For>`, and a keyed `.map()`,
 * which `mountKeyedList` hands to `mountFor`.
 *
 * Bisect-verified: running `handleFastClear` / `handleReplaceAll`'s cleanups
 * outside the window (the previous loop) fails the four live-removal specs —
 * `expected 400 to be +0` for `<For>` (each of 200 rows' branch and marker)
 * and `expected 600 to be +0` for the keyed `.map()` (its `h()`-built `<tr>`
 * too); keeping the window but removing `mountReactive`'s marker directly
 * fails the same four with 200. The completeness specs stay green.
 */
const FOR_COND_SOURCE = `
export const App = (props) => (
  <table>
    <tbody>
      <For each={props.rows} by={(row) => row.id}>
        {(row) => (
          <tr>
            <td class="label">{row.label()}</td>
            <td class="status">{row.done() ? <span class="done">done</span> : <em class="todo">todo</em>}</td>
          </tr>
        )}
      </For>
    </tbody>
  </table>
)
`

const MAP_COND_SOURCE = `
export const App = (props) => (
  <table>
    <tbody>
      {props.rows().map((row) => (
        <tr key={row.id}>
          <td class="label">{row.label()}</td>
          <td class="status">{row.done() ? <span class="done">done</span> : <em class="todo">todo</em>}</td>
        </tr>
      ))}
    </tbody>
  </table>
)
`

describe.each([
  ['<For>', FOR_COND_SOURCE],
  ['keyed .map()', MAP_COND_SOURCE],
])('mountFor — rows with a conditional cell (%s)', (_name, source) => {
  it('CLEAR: zero live removeChild — the rows leave in the one bulk call', () => {
    const { rows, ul } = mountCompiledFor(N, source)
    expect(ul.querySelectorAll('tr')).toHaveLength(N)
    const ops = recordRemovals(() => rows.set([]))
    expect(ops.ownRemovals).toBe(0)
    expect(ops.bulkChildCounts).toEqual([N + 2])
    expect(ul.querySelectorAll('tr')).toHaveLength(0)
  })

  it('REPLACE (no surviving key): zero live removeChild over the old rows', () => {
    const { rows, ul, mk } = mountCompiledFor(N, source)
    const ops = recordRemovals(() => {
      rows.set(Array.from({ length: N }, (_, i) => mk(10_000 + i)))
    })
    expect(ops.liveRemovals).toBe(0)
    expect(ops.bulkChildCounts).toEqual([N + 2])
    expect(ul.querySelectorAll('tr')).toHaveLength(N)
    // The new rows render both branches correctly.
    expect(ul.querySelectorAll('td.status > span.done').length + ul.querySelectorAll('td.status > em.todo').length).toBe(N)
  })

  it('CLEAR still disposes every conditional cell: a cleared row never re-renders', () => {
    const { rows, ul } = mountCompiledFor(N, source)
    const kept = rows.peek()
    rows.set([])
    const runsBefore = counts['reactivity.effectRun'] ?? 0
    for (const row of kept) row.done.set(!row.done.peek())
    expect((counts['reactivity.effectRun'] ?? 0) - runsBefore).toBe(0)
    expect(ul.childNodes.length).toBe(2) // the list's own two markers
  })

  // MEMORY: a conditional cell's boundary effect is owned by the row's cleanup
  // (`_effectOwned`), so a row registers nothing with an `EffectScope` and the
  // row collector stays pooled. Before, that effect was the one thing a row
  // registered, and every such row kept its own scope, array and stop closure.
  // Bisect-verified: building the boundary on plain `effect()` fails this with
  // `expected 200 to be +0`.
  it('creating the rows registers nothing with any EffectScope (no per-row scope)', () => {
    const { rows, mk } = mountCompiledFor(N, source)
    rows.set([])
    const proto = EffectScope.prototype as unknown as { add: (e: unknown) => void }
    const realAdd = proto.add
    let adds = 0
    proto.add = function (this: EffectScope, e: unknown) {
      adds++
      return realAdd.call(this, e)
    }
    try {
      rows.set(Array.from({ length: N }, (_, i) => mk(20_000 + i)))
    } finally {
      proto.add = realAdd
    }
    expect(adds).toBe(0)
  })

  // RETENTION: a keyed `.map()` mounts its rows OUTSIDE the row collector (its
  // render callback is identity; the vnode mounts after), so on the first
  // render — which runs inside the component's setup — every conditional cell's
  // effect registered with the COMPONENT's scope. A later removal disposed the
  // effect but the scope kept the reference, and with it the removed row's
  // closure and DOM, until the component unmounted. Bisect-verified: plain
  // `effect()` for the boundary gives `expected 201 to be +0` here for the
  // `.map()` (200 cells + the list's own effect) and 200 for `<For>` (one
  // per-row scope each).
  it('the FIRST render registers nothing per row with the enclosing scope either', () => {
    const proto = EffectScope.prototype as unknown as { add: (e: unknown) => void }
    const realAdd = proto.add
    let adds = 0
    proto.add = function (this: EffectScope, e: unknown) {
      adds++
      return realAdd.call(this, e)
    }
    try {
      mountCompiledFor(N, source)
    } finally {
      proto.add = realAdd
    }
    expect(adds).toBe(0)
  })

  it('a removal that is NOT a bulk clear still removes its range from the live DOM', () => {
    const { rows, ul } = mountCompiledFor(5, source)
    rows.set(rows.peek().slice(1))
    expect(ul.querySelectorAll('tr')).toHaveLength(4)
    // The surviving rows' conditional cells still flip in place.
    const first = rows.peek()[0]!
    first.done.set(!first.done.peek())
    const cell = query<HTMLElement>(ul, 'tr td.status')
    expect(cell.children).toHaveLength(1)
    expect(cell.firstElementChild?.className).toBe(first.done.peek() ? 'done' : 'todo')
    expect(cell.childNodes.length).toBe(2) // branch + its marker, nothing stranded
  })
})

/**
 * OWNERSHIP of what a keyed `.map()` row mounts. `<For>` runs its render
 * callback, which BUILDS the compiled row, under the row's collector scope, so
 * anything the row's template hands to the ambient scope (`_setChild` of a
 * non-text value → `ownByScope`) belongs to the row and stops with it. A keyed
 * `.map()` reaches the same reconciler with an IDENTITY callback: the row was
 * built lazily, by the mount that came after the callback, outside the
 * collector. So that work went to whatever scope was current — the component's
 * on the first render (kept, with the removed row, until the component
 * unmounted), and NONE on a later run, where it was never disposed at all: a
 * removed row's binding stayed subscribed for the life of the page.
 *
 * Bisect-verified: mounting the row after `runRowCallback` (the previous
 * `renderInto`) fails this with `expected 3 to be 0` — the three rows added
 * after the first render, removed, still subscribed.
 */
describe('mountFor — a keyed .map() row owns what its template mounts', () => {
  it('a row added after the first render, then removed, leaves nothing subscribed', () => {
    const tick = signal(0)
    const cellOf = () => () => `t${tick()}`
    const source = `
export const App = (props) => (
  <table>
    <tbody>
      {props.rows().map((row) => (
        <tr key={row.id}>
          <td class="cell">{row.cell}</td>
        </tr>
      ))}
    </tbody>
  </table>
)
`
    const { rows, ul } = mountCompiledFor(0, source)
    const mkCell = (id: number) => ({ id, cell: cellOf() })
    rows.set([mkCell(1)] as never)
    const baseline = tick.debug().subscriberCount
    expect(baseline).toBe(1)
    rows.set([mkCell(1), mkCell(2), mkCell(3), mkCell(4)] as never)
    expect(tick.debug().subscriberCount).toBe(4)
    expect(ul.querySelectorAll('td.cell')[3]?.textContent).toBe('t0')
    rows.set([mkCell(1)] as never)
    expect(tick.debug().subscriberCount - baseline).toBe(0)
  })
})
