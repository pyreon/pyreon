/**
 * Scenario: **a keyed `.map()` list with conditional JSX in its slots**.
 *
 * WHY IT EXISTS: every other list in this suite is a `<For>` (Pyreon) or the
 * framework's equivalent list primitive, so two source shapes that real apps
 * write constantly were never compiled or run by any benchmark:
 *
 *  1. a keyed `.map()` of JSX rows inside an element
 *     (`{rows().map((row) => <tr key={row.id}>…</tr>)}`), which Pyreon routes
 *     through its keyed reconciler at runtime (`mountKeyedList` → `mountFor`);
 *  2. conditional JSX in a slot (`{row.done() ? <span/> : <em/>}` in each row,
 *     `{rows().length === 0 ? <p/> : null}` for the empty state), which the
 *     compiler has to decide how to lower.
 *
 * The scenario is the instrument for changes to either path (#4687 moved keyed
 * `.map()` lists onto `mountFor`; #4705 makes the compiler walk JSX inside
 * template holes). The DOM and the gates are in `scenario-maplist-shared.ts`.
 *
 * ## Ops
 *
 * All on 1,000 rows, every arm mounted with the same 1,000 initial rows and
 * then cleared, so each op runs on a list that has been through its first
 * render:
 *
 *   create 1,000 rows        into the mounted, empty list
 *   replace all rows         1,000 → 1,000 new keys
 *   update one cell          row 500's label (per-op, and a batch cycle)
 *   toggle one conditional   row 500's status branch (per-op, and a batch cycle)
 *   swap rows                rows 2 and 999 exchange places
 *   remove one row           row 500 from a full list
 *   clear rows               1,000 → 0, which also flips the empty-state slot
 *
 * A single-row op's framework work is a few microseconds in a fine-grained
 * arm; its per-op sample is dominated by the forced layout of the 1,000-row
 * table that every arm pays (the 2026-11-19 smoke run put it far above 10 ticks
 * of the isolated 5 µs clock, so it is not quantum-limited). Each has a batch
 * twin (one cycle = write + restore = TWO single-row updates, each followed by
 * a forced layout) as the clock-independent cross-check; quote a single-row
 * verdict only where the per-op and batch rows agree.
 *
 * ## Correctness gate
 *
 * Before ANY timing, every op is run once against a fresh list and the DOM is
 * checked against the harness model (`verifyMapList`). An op that fails there
 * is NOT timed for that arm and is reported as a gate failure, so the board
 * shows "this arm does not do this op correctly" instead of a number. During
 * timing every iteration is verified again and any failure aborts the arm, the
 * suite's usual rule.
 *
 * ## Arms and fairness
 *
 * - **Pyreon (.map)** — the idiomatic keyed `.map()` source
 *   (`scenario-maplist-pyreon.tsx`), mounted with its initial rows, so the list
 *   is classified as keyed on its first render.
 * - **Pyreon (.map, first render empty)** — the SAME component mounted while
 *   the list is empty, the shape of an app whose data arrives after mount.
 *   Diagnostic, unranked: on the `main` of 2026-11-19 the runtime pins a slot's
 *   classification to its first value, and an empty array is not a keyed array,
 *   so this list never reaches the keyed reconciler and every change re-creates
 *   every row. Kept so that cost stays visible.
 * - **Pyreon (<For>)** — the same DOM through `<For>`, the reference for
 *   `.map()` vs `<For>`.
 * - **React 19 / Preact** — `rows.map((row) => <Row key={row.id} row={row} />)`
 *   with `Row` wrapped in `memo`, react.dev's prescription for a long list, and
 *   an immutable row update (the only model their keyed `.map()` has). A
 *   one-row update still re-runs the parent's `.map()` and compares 1,000
 *   props: that is their model, not a harness cost.
 * - **Vue 3** — a keyed `v-for` with `v-if`/`v-else`, compiled at build time
 *   like an SFC; `shallowRef` list with immutable row updates (the row board's
 *   choice, Vue's guide for large replaced structures).
 * - **SolidJS** — `<For>` + ternary, compiled by the real `babel-preset-solid`.
 *   NOT a keyed `.map()`: Solid has no keyed `.map()` (a `.map()` in Solid JSX
 *   re-creates every row on each change), so its idiom for this list is
 *   `<For>`. Equal observable work, different source shape.
 * - **Svelte 5** — keyed `{#each … (row.id)}` + `{#if}`/`{:else}`; `$state.raw`
 *   list with `$state` fields (the row board's model).
 *
 * Signal-per-field arms (Pyreon, Solid, Svelte) allocate their per-row sources
 * inside the timed `create`/`replace`, as the row board does; the immutable arms
 * take the harness's plain rows as they are. Each arm pays its own model.
 *
 * AUTHOR-JUDGE CAVEAT: written and judged by the Pyreon authors, like the rest
 * of the suite.
 */
import { h as ph } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { render as preactRender } from 'preact'
import { jsx as preactJsx, jsxs as preactJsxs } from 'preact/jsx-runtime'
import { memo as preactMemo } from 'preact/compat'
import { useState as preactUseState } from 'preact/hooks'
import * as React from 'react'
import { flushSync as reactFlushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import { jsx as reactJsx, jsxs as reactJsxs } from 'react/jsx-runtime'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import { createApp, defineComponent, nextTick, shallowRef } from 'vue'
import { render as vueMapListRender } from 'virtual:maplist-vue-render'
import { makeRow as solidMakeRow, mountMapList as solidMountMapList } from 'virtual:rival-solid/maplist'
import type { BenchOptions, BenchSuite } from '../runner'
import { bench, resetRng } from '../runner'
import MapList from './MapList.svelte'
import { SvelteMapRow, getMapRows, setMapRows } from './maplist-state.svelte'
import { preactJsxKeyed } from './preact-jsx-keyed'
import { type PyreonMapRow, PyreonForList, PyreonMapList } from './scenario-maplist-pyreon'
import {
  ML_K,
  ML_ROWS,
  ML_SWAP_A,
  ML_SWAP_B,
  ML_TARGET,
  ML_UPDATED_SUFFIX,
  type PlainRow,
  buildPlainRows,
  labelUpdatedProbe,
  statusDoneProbe,
  verifyMapList,
} from './scenario-maplist-shared'

/**
 * One arm. Every method COMMITS before it returns (React/Svelte `flushSync`,
 * Vue `nextTick`, Preact one microtask, the synchronous arms nothing), so a
 * batch cycle's precondition probe after `reset` sees committed DOM.
 */
export interface MapListTarget {
  set: (rows: readonly PlainRow[]) => void | Promise<void>
  setLabel: (index: number, label: string) => void | Promise<void>
  setDone: (index: number, done: boolean) => void | Promise<void>
  swap: (a: number, b: number) => void | Promise<void>
  remove: (index: number) => void | Promise<void>
  clear: () => void | Promise<void>
  teardown: () => void
}

/** Copy-on-write helpers shared by the immutable arms (React, Preact, Vue). */
function withRow(rows: readonly PlainRow[], i: number, patch: Partial<PlainRow>): PlainRow[] {
  const next = rows.slice()
  next[i] = { ...(rows[i] as PlainRow), ...patch }
  return next
}
function swapped<T>(rows: readonly T[], a: number, b: number): T[] {
  const next = rows.slice()
  const t = next[a] as T
  next[a] = next[b] as T
  next[b] = t
  return next
}
function without<T>(rows: readonly T[], i: number): T[] {
  const next = rows.slice()
  next.splice(i, 1)
  return next
}

// ─── Pyreon ──────────────────────────────────────────────────────────────────

type PyreonKind = 'map' | 'map-first-empty' | 'for'

function toPyreonRows(plain: readonly PlainRow[]): PyreonMapRow[] {
  const out = new Array<PyreonMapRow>(plain.length)
  for (let i = 0; i < plain.length; i++) {
    const p = plain[i] as PlainRow
    out[i] = { id: p.id, label: signal(p.label), done: signal(p.done) }
  }
  return out
}

function pyreonTarget(container: HTMLElement, initial: readonly PlainRow[], kind: PyreonKind): MapListTarget {
  const rows = signal<PyreonMapRow[]>(kind === 'map-first-empty' ? [] : toPyreonRows(initial))
  const unmount = pyreonMount(ph((kind === 'for' ? PyreonForList : PyreonMapList) as never, { rows }), container)
  if (kind === 'map-first-empty') rows.set(toPyreonRows(initial))
  return {
    set: (next) => rows.set(toPyreonRows(next)),
    setLabel: (i, label) => (rows.peek()[i] as PyreonMapRow).label.set(label),
    setDone: (i, done) => (rows.peek()[i] as PyreonMapRow).done.set(done),
    swap: (a, b) => rows.set(swapped(rows.peek(), a, b)),
    remove: (i) => rows.set(without(rows.peek(), i)),
    clear: () => rows.set([]),
    teardown: unmount,
  }
}

// ─── React ───────────────────────────────────────────────────────────────────
// Written as esbuild's `jsx: 'automatic'` emit for the idiomatic source (diffed):
//
//   const Row = memo(({ row }) => <tr><td className="id">{row.id}</td>
//     <td className="label">{row.label}</td>
//     <td className="status">{row.done ? <span className="done">done</span> : <em className="todo">todo</em>}</td></tr>)
//   <div className="ml"><table><tbody>{rows.map((row) => <Row key={row.id} row={row} />)}</tbody></table>
//     {rows.length === 0 ? <p className="empty">No rows</p> : null}</div>

const ReactRow = React.memo(function ReactRow({ row }: { row: PlainRow }) {
  return reactJsxs('tr', {
    children: [
      reactJsx('td', { className: 'id', children: row.id }),
      reactJsx('td', { className: 'label', children: row.label }),
      reactJsx('td', {
        className: 'status',
        children: row.done
          ? reactJsx('span', { className: 'done', children: 'done' })
          : reactJsx('em', { className: 'todo', children: 'todo' }),
      }),
    ],
  })
})

function reactTarget(container: HTMLElement, initial: readonly PlainRow[]): MapListTarget {
  let setRowsState: ((rows: readonly PlainRow[]) => void) | null = null
  let current: readonly PlainRow[] = initial

  function App() {
    const [rows, setRows] = React.useState<readonly PlainRow[]>(initial)
    setRowsState = setRows
    return reactJsxs('div', {
      className: 'ml',
      children: [
        reactJsx('table', {
          children: reactJsx('tbody', { children: rows.map((row) => reactJsx(ReactRow, { row }, row.id)) }),
        }),
        rows.length === 0 ? reactJsx('p', { className: 'empty', children: 'No rows' }) : null,
      ],
    })
  }

  const root = ReactDOM.createRoot(container)
  reactFlushSync(() => root.render(reactJsx(App, {})))
  const commit = (next: readonly PlainRow[]) => {
    current = next
    reactFlushSync(() => setRowsState?.(next))
  }
  return {
    set: commit,
    setLabel: (i, label) => commit(withRow(current, i, { label })),
    setDone: (i, done) => commit(withRow(current, i, { done })),
    swap: (a, b) => commit(swapped(current, a, b)),
    remove: (i) => commit(without(current, i)),
    clear: () => commit([]),
    teardown: () => root.unmount(),
  }
}

// ─── Preact ──────────────────────────────────────────────────────────────────

const PreactRow = preactMemo(function PreactRow({ row }: { row: PlainRow }) {
  return preactJsxs('tr', {
    children: [
      preactJsx('td', { class: 'id', children: row.id }),
      preactJsx('td', { class: 'label', children: row.label }),
      preactJsx('td', {
        class: 'status',
        children: row.done
          ? preactJsx('span', { class: 'done', children: 'done' })
          : preactJsx('em', { class: 'todo', children: 'todo' }),
      }),
    ],
  })
})

function preactTarget(container: HTMLElement, initial: readonly PlainRow[]): MapListTarget {
  let setRowsState: ((rows: readonly PlainRow[]) => void) | null = null
  let current: readonly PlainRow[] = initial

  function App() {
    const [rows, setRows] = preactUseState<readonly PlainRow[]>(initial)
    setRowsState = setRows
    return preactJsxs('div', {
      class: 'ml',
      children: [
        preactJsx('table', {
          children: preactJsx('tbody', {
            children: rows.map((row) => preactJsxKeyed(PreactRow, { row }, row.id)) as never,
          }),
        }),
        rows.length === 0 ? preactJsx('p', { class: 'empty', children: 'No rows' }) : null,
      ],
    })
  }

  preactRender(preactJsx(App, {}), container)
  const commit = async (next: readonly PlainRow[]) => {
    current = next
    setRowsState?.(next)
    // Preact batches renders on a microtask; this is its real flush boundary
    // (the same one `impl/preact.ts` and the memo scenario use).
    await Promise.resolve()
  }
  return {
    set: commit,
    setLabel: (i, label) => commit(withRow(current, i, { label })),
    setDone: (i, done) => commit(withRow(current, i, { done })),
    swap: (a, b) => commit(swapped(current, a, b)),
    remove: (i) => commit(without(current, i)),
    clear: () => commit([]),
    teardown: () => preactRender(null, container),
  }
}

// ─── Vue ─────────────────────────────────────────────────────────────────────

function vueTarget(container: HTMLElement, initial: readonly PlainRow[]): MapListTarget {
  const rows = shallowRef<readonly PlainRow[]>(initial)
  const App = defineComponent({
    render: vueMapListRender,
    setup() {
      return { rows }
    },
  })
  const app = createApp(App)
  app.mount(container)
  const commit = async (next: readonly PlainRow[]) => {
    rows.value = next
    await nextTick()
  }
  return {
    set: commit,
    setLabel: (i, label) => commit(withRow(rows.value, i, { label })),
    setDone: (i, done) => commit(withRow(rows.value, i, { done })),
    swap: (a, b) => commit(swapped(rows.value, a, b)),
    remove: (i) => commit(without(rows.value, i)),
    clear: () => commit([]),
    teardown: () => app.unmount(),
  }
}

// ─── Solid ───────────────────────────────────────────────────────────────────

function solidTarget(container: HTMLElement, initial: readonly PlainRow[]): MapListTarget {
  const toRows = (plain: readonly PlainRow[]) => {
    const out = new Array<ReturnType<typeof solidMakeRow>>(plain.length)
    for (let i = 0; i < plain.length; i++) out[i] = solidMakeRow(plain[i] as PlainRow)
    return out
  }
  const list = solidMountMapList(container)
  list.setRows(toRows(initial))
  return {
    set: (next) => list.setRows(toRows(next)),
    setLabel: (i, label) => list.rows()[i]?.setLabel(label),
    setDone: (i, done) => list.rows()[i]?.setDone(done),
    swap: (a, b) => list.setRows(swapped(list.rows(), a, b)),
    remove: (i) => list.setRows(without(list.rows(), i)),
    clear: () => list.setRows([]),
    teardown: list.dispose,
  }
}

// ─── Svelte ──────────────────────────────────────────────────────────────────

function svelteTarget(container: HTMLElement, initial: readonly PlainRow[]): MapListTarget {
  const toRows = (plain: readonly PlainRow[]) => {
    const out = new Array<SvelteMapRow>(plain.length)
    for (let i = 0; i < plain.length; i++) {
      const p = plain[i] as PlainRow
      out[i] = new SvelteMapRow(p.id, p.label, p.done)
    }
    return out
  }
  setMapRows(toRows(initial))
  const app = svelteMount(MapList, { target: container })
  svelteFlushSync()
  const write = (next: SvelteMapRow[]) => {
    setMapRows(next)
    svelteFlushSync()
  }
  return {
    set: (next) => write(toRows(next)),
    setLabel: (i, label) => {
      ;(getMapRows()[i] as SvelteMapRow).label = label
      svelteFlushSync()
    },
    setDone: (i, done) => {
      ;(getMapRows()[i] as SvelteMapRow).done = done
      svelteFlushSync()
    },
    swap: (a, b) => write(swapped(getMapRows(), a, b)),
    remove: (i) => write(without(getMapRows(), i)),
    clear: () => write([]),
    teardown: () => {
      svelteUnmount(app)
      setMapRows([])
    },
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export const MAPLIST_FRAMEWORKS = [
  'Pyreon (.map)',
  'Pyreon (.map, first render empty)',
  'Pyreon (<For>)',
  'React 19',
  'Preact',
  'Vue 3',
  'SolidJS',
  'Svelte 5',
] as const

function makeTarget(framework: string, container: HTMLElement, initial: readonly PlainRow[]): MapListTarget {
  switch (framework) {
    case 'Pyreon (.map)':
      return pyreonTarget(container, initial, 'map')
    case 'Pyreon (.map, first render empty)':
      return pyreonTarget(container, initial, 'map-first-empty')
    case 'Pyreon (<For>)':
      return pyreonTarget(container, initial, 'for')
    case 'React 19':
      return reactTarget(container, initial)
    case 'Preact':
      return preactTarget(container, initial)
    case 'Vue 3':
      return vueTarget(container, initial)
    case 'SolidJS':
      return solidTarget(container, initial)
    case 'Svelte 5':
      return svelteTarget(container, initial)
    default:
      throw new Error(`[maplist] unknown framework: ${framework}`)
  }
}

/**
 * One op: `prepare` (untimed, once, before the op's iterations) brings the list
 * to the op's starting state; `reset`/`fn`/`after` are the `bench()` reset, the
 * timed op and a model update + DOM check run after every iteration.
 */
interface MapListOp {
  name: string
  prepare: () => Promise<void>
  reset?: () => Promise<void>
  fn: () => Promise<void>
  after: () => void
  /** Batch instrument: the probe, and its value before/after `fn` (omitted → derived from row 500's `done`). */
  batch?: { batchProbe: (container: HTMLElement) => number; batchPreExpect?: number; batchExpect?: number }
}

export async function runMapList(framework: string, container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework, container, results: [], gateFailures: [] }
  // Deterministic column widths for every arm (index.html `.bench-fixture`):
  // `table-layout: auto` re-measures the whole table when a wider label lands,
  // which made the row board's append bimodal.
  container.classList.add('bench-fixture')
  resetRng()

  // The harness's model of what the DOM must show. Every model update happens
  // in `prepare`/`reset`/`after`, never inside a timed region.
  let model: PlainRow[] = buildPlainRows(ML_ROWS)
  const target = makeTarget(framework, container, model)
  verifyMapList(container, model)
  await target.clear()
  model = []
  verifyMapList(container, model)

  let next: PlainRow[] = []
  const fill = async () => {
    model = buildPlainRows(ML_ROWS)
    await target.set(model)
  }

  // Single-row ops act on a fixed full list; these capture its row 500.
  let origLabel = ''
  let origDone = false
  const prepSingleRow = async () => {
    await fill()
    origLabel = (model[ML_TARGET] as PlainRow).label
    origDone = (model[ML_TARGET] as PlainRow).done
  }
  const labelModel = () => withRow(model, ML_TARGET, { label: origLabel + ML_UPDATED_SUFFIX })
  const doneModel = () => withRow(model, ML_TARGET, { done: !origDone })

  const updateCell: Omit<MapListOp, 'name'> = {
    prepare: prepSingleRow,
    reset: async () => target.setLabel(ML_TARGET, origLabel),
    fn: async () => target.setLabel(ML_TARGET, origLabel + ML_UPDATED_SUFFIX),
    after: () => verifyMapList(container, labelModel()),
  }
  const toggleCond: Omit<MapListOp, 'name'> = {
    prepare: prepSingleRow,
    reset: async () => target.setDone(ML_TARGET, origDone),
    fn: async () => target.setDone(ML_TARGET, !origDone),
    after: () => verifyMapList(container, doneModel()),
  }

  const ops: MapListOp[] = [
    {
      name: `create ${ML_ROWS.toLocaleString('en-US')} rows (into the mounted, empty list)`,
      prepare: async () => target.clear(),
      reset: async () => {
        await target.clear()
        next = buildPlainRows(ML_ROWS)
      },
      fn: async () => target.set(next),
      after: () => {
        model = next
        verifyMapList(container, model)
      },
    },
    {
      name: `replace all ${ML_ROWS.toLocaleString('en-US')} rows`,
      prepare: fill,
      reset: async () => {
        next = buildPlainRows(ML_ROWS)
      },
      fn: async () => target.set(next),
      after: () => {
        model = next
        verifyMapList(container, model)
      },
    },
    { name: 'update one cell (row 500 label)', ...updateCell },
    {
      name: 'update one cell (batch cycle: set + restore)',
      ...updateCell,
      batch: { batchProbe: labelUpdatedProbe, batchPreExpect: 0, batchExpect: 1 },
    },
    { name: 'toggle one conditional (row 500 status)', ...toggleCond },
    {
      name: 'toggle one conditional (batch cycle: flip + restore)',
      ...toggleCond,
      // Resolved at run time: whether row 500 starts `done` depends on its id.
      batch: { batchProbe: statusDoneProbe },
    },
    {
      name: `swap rows (${ML_SWAP_A + 1} ↔ ${ML_SWAP_B + 1})`,
      prepare: fill,
      fn: async () => target.swap(ML_SWAP_A, ML_SWAP_B),
      after: () => {
        model = swapped(model, ML_SWAP_A, ML_SWAP_B)
        verifyMapList(container, model)
      },
    },
    {
      name: 'remove one row (row 500)',
      prepare: fill,
      reset: fill,
      fn: async () => target.remove(ML_TARGET),
      after: () => {
        model = without(model, ML_TARGET)
        verifyMapList(container, model)
      },
    },
    {
      name: `clear ${ML_ROWS.toLocaleString('en-US')} rows`,
      prepare: fill,
      reset: fill,
      fn: async () => target.clear(),
      after: () => {
        model = []
        verifyMapList(container, model)
      },
    },
  ]

  type BatchOptions = Required<Pick<BenchOptions, 'batchK' | 'batchProbe' | 'batchPreExpect' | 'batchExpect'>>
  const batchOf = (op: MapListOp): BatchOptions | null => {
    if (!op.batch) return null
    return {
      batchK: ML_K,
      batchProbe: op.batch.batchProbe,
      batchPreExpect: op.batch.batchPreExpect ?? (origDone ? 1 : 0),
      batchExpect: op.batch.batchExpect ?? (origDone ? 0 : 1),
    }
  }

  // ── Correctness gate, BEFORE any timing ───────────────────────────────────
  // Each op once, on its own prepared list, checked against the model (and,
  // for a batch op, its probe before and after). An op that fails is reported
  // and not timed for this arm.
  const failed = new Set<string>()
  for (const op of ops) {
    try {
      await op.prepare()
      if (op.reset) await op.reset()
      const b = batchOf(op)
      if (b && b.batchProbe(container) !== b.batchPreExpect) {
        throw new Error(`[maplist] correctness gate failed — batch precondition probe is not ${b.batchPreExpect}`)
      }
      await op.fn()
      op.after()
      if (b && b.batchProbe(container) !== b.batchExpect) {
        throw new Error(`[maplist] correctness gate failed — batch probe after the op is not ${b.batchExpect}`)
      }
    } catch (err) {
      failed.add(op.name)
      suite.gateFailures?.push({ name: op.name, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Timing ────────────────────────────────────────────────────────────────
  for (const op of ops) {
    if (failed.has(op.name)) continue
    await op.prepare()
    const opts: BenchOptions = {
      ...(op.reset ? { reset: op.reset } : {}),
      verify: op.after,
      ...batchOf(op),
    }
    await bench(op.name, suite, op.fn, opts)
  }

  await target.clear()
  target.teardown()
  return suite
}
