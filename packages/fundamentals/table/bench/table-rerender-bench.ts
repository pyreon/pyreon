#!/usr/bin/env bun
/**
 * Re-render / recompute COUNT benchmark — @pyreon/table vs @tanstack/react-table.
 *
 * BOTH adapters wrap the SAME `@tanstack/table-core` (react-table@8.21.3 depends
 * on table-core@8.21.3; @pyreon/table depends on ^8.21.3 — deduped to the same
 * 8.21.3 copy). So the row-model / sorting / filtering WORK is byte-identical in
 * both — the ONLY thing this bench measures is the ADAPTER's render strategy:
 *
 *   - react-table re-renders React components (VDOM) on a state change.
 *   - @pyreon/table re-runs fine-grained signal bindings (no VDOM) and moves
 *     keyed <For> DOM nodes.
 *
 * Counts are DETERMINISTIC (not wall-clock) so they are stable + reproducible.
 * Two structural signals are reported per scenario:
 *
 *   - CELL UNITS   = JS invocations of the per-cell producer (a React <Cell>
 *                    component render, or a Pyreon cell accessor re-run). This
 *                    is the "how many cells did JS touch" number.
 *   - DOM WRITES   = observed characterData + childList mutations (via a
 *                    MutationObserver flushed with takeRecords()). This is the
 *                    "how much did the DOM actually change" number.
 *
 * FAIR baselines (per iter-13's lesson — react-table is NOT naive if you opt
 * into memoization, exactly like react-query's tracked props):
 *   - react naive        : plain `.map()` render, no memo.
 *   - react memoized-row : the idiomatic TanStack optimization — `React.memo`
 *                          on the row keyed by `row.original` identity, with
 *                          IMMUTABLE data updates (unchanged rows keep their
 *                          object reference), so only the changed row re-renders.
 *   - pyreon naive-map   : `() => rows.map(...)` — the ANTI-PATTERN (full tbody
 *                          rebuild). Shown to warn against it (the docs used to
 *                          teach `.map()`).
 *   - pyreon keyed-For   : keyed `<For>` + `flexRenderCell` reactive cells — the
 *                          recommended fine-grained pattern.
 *
 * HONEST READ (don't cherry-pick): @pyreon/table's cell bindings all subscribe
 * to ONE table signal, so a single-cell change RE-RUNS every cell accessor
 * (N×M cell units) — the same coarse granularity as react naive, and MORE cell
 * units than react memoized-row (M). BUT every Pyreon cell unit is a cheap
 * closure (navigate + flexRender + Object.is), no VDOM/reconciler/fiber, and
 * DOM WRITES stay at 1 (the Object.is gate). So the count table shows where
 * Pyreon does more JS work; the companion wall-clock bench (`bench:table:wall`)
 * shows whether that cheaper per-unit cost + no-VDOM makes it competitive. The
 * clean Pyreon wins are MOUNT, FULL-REPLACE and SORT/REORDER (keyed DOM moves),
 * not the targeted single-cell change at large N.
 *
 * Run: bun bench/table-rerender-bench.ts   (or `bun run bench:table`)
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()
// Drive React commits synchronously via flushSync — the correct bench primitive.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

const COLS = 6 // M columns
const SIZES = [100, 1000] as const

interface Row {
  id: number
  [k: `c${number}`]: string | number
}

// c0 is a DESCENDING sort key (String(n - i)) so an ASCENDING sort actually
// re-orders every row (a pre-sorted column would make "sort" a no-op and
// understate the reorder cost). c1..c5 are plain display values.
function makeData(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const row: Row = { id: i, c0: String(n - i).padStart(7, '0') }
    for (let c = 1; c < COLS; c++) row[`c${c}`] = `r${i}c${c}`
    return row
  })
}

/** Immutable single-cell edit: fresh array, ONE row is a fresh object with one
 *  changed field, every OTHER row keeps its reference (so memo/keyed reuse —
 *  the fair, idiomatic immutable update react-table's memoization relies on). */
function editOneCell(data: Row[], rowIndex: number): Row[] {
  const next = data.slice()
  const changed = { ...next[rowIndex]! }
  changed.c0 = `EDITED-${Math.random().toString(36).slice(2, 7)}`
  next[rowIndex] = changed
  return next
}

const columnDefs = Array.from({ length: COLS }, (_, c) => ({
  accessorKey: `c${c}`,
  id: `c${c}`,
  header: `c${c}`,
}))

interface Counts {
  cellUnits: number
  domWrites: number
}

function observe(root: Node): { flush: () => number } {
  const obs = new MutationObserver(() => {})
  obs.observe(root, { characterData: true, childList: true, subtree: true })
  return {
    flush: () => {
      const recs = obs.takeRecords()
      let n = 0
      for (const r of recs) {
        if (r.type === 'characterData') n++
        else if (r.type === 'childList') n += r.addedNodes.length + r.removedNodes.length
      }
      return n
    },
  }
}

// ─── React harnesses ─────────────────────────────────────────────────────────

async function reactHarness(
  n: number,
  memoized: boolean,
  op: 'single-cell' | 'sort',
): Promise<Counts> {
  const React = (await import('react')).default
  const { createElement: h, useState } = React
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  const { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } = await import(
    '@tanstack/react-table'
  )

  let cellUnits = 0
  let setData!: (d: Row[]) => void
  let tableRef: ReturnType<typeof useReactTable<Row>> | null = null
  // ONE base array — reused so the immutable edit keeps unchanged row refs.
  const base = makeData(n)
  const baseC0Row0 = base[0]!.c0

  const Cell = ({ cell }: { cell: any }) => {
    cellUnits++
    return h('td', null, flexRender(cell.column.columnDef.cell, cell.getContext()) as any)
  }

  const RowCmp = ({ row }: { row: any }) =>
    h(
      'tr',
      { 'data-rowid': row.id },
      row.getVisibleCells().map((cell: any) => h(Cell, { key: cell.id, cell })),
    )
  // Memoize the row on its ORIGINAL data identity — the idiomatic TanStack
  // optimization. Unchanged rows (same `original` reference) skip re-render.
  const MemoRow = React.memo(RowCmp, (a: any, b: any) => a.row.original === b.row.original)
  const RowComponent = memoized ? MemoRow : RowCmp

  function Table() {
    const [data, sd] = useState(() => base)
    setData = sd
    const table = useReactTable<Row>({
      data,
      columns: columnDefs as any,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getRowId: (r) => String(r.id),
    })
    tableRef = table
    return h(
      'table',
      null,
      h(
        'tbody',
        null,
        table.getRowModel().rows.map((row) => h(RowComponent as any, { key: row.id, row })),
      ),
    )
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(h(Table)))

  // Reset counters + observer AFTER mount — count only the op.
  cellUnits = 0
  const mo = observe(container)
  const target = Math.floor(n / 2)

  if (op === 'single-cell') {
    const before = container.querySelector(`[data-rowid="${target}"]`)?.children[0]?.textContent
    flushSync(() => setData(editOneCell(base, target)))
    const after = container.querySelector(`[data-rowid="${target}"]`)?.children[0]?.textContent
    if (before === after || after == null || !after.startsWith('EDITED')) {
      throw new Error(`[react ${memoized ? 'memo' : 'naive'}] single-cell not applied: ${before} -> ${after}`)
    }
    // an UNCHANGED cell keeps its value
    const other = container.querySelector(`[data-rowid="0"]`)?.children[0]?.textContent
    if (other !== baseC0Row0) throw new Error(`[react] unchanged cell corrupted: ${other}`)
  } else {
    flushSync(() => tableRef!.getColumn('c0')!.toggleSorting(false))
    const first = container.querySelector('tbody')?.children[0]?.getAttribute('data-rowid')
    if (first == null) throw new Error('[react] sort produced no rows')
  }

  const domWrites = mo.flush()
  root.unmount()
  container.remove()
  return { cellUnits, domWrites }
}

// ─── Pyreon harnesses ────────────────────────────────────────────────────────

async function pyreonHarness(
  n: number,
  mode: 'naive-map' | 'keyed-for',
  op: 'single-cell' | 'sort',
): Promise<Counts> {
  const { For, h } = await import('@pyreon/core')
  const { signal } = await import('@pyreon/reactivity')
  const { mount } = await import('@pyreon/runtime-dom')
  const { useTable, flexRender, flexRenderCell, getCoreRowModel, getSortedRowModel } = await import(
    '../src/index'
  )

  let cellUnits = 0
  const base = makeData(n)
  const baseC0Row0 = base[0]!.c0
  const data = signal<Row[]>(base)

  const container = document.createElement('div')
  document.body.appendChild(container)

  let tableAccessor!: () => any
  function App() {
    const table = useTable(() => ({
      data: data(),
      columns: columnDefs as any,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getRowId: (r: Row) => String(r.id),
    }))
    tableAccessor = table

    if (mode === 'naive-map') {
      // ANTI-PATTERN: full tbody rebuild on every change.
      return h('table', {}, h('tbody', {}, () =>
        table().getRowModel().rows.map((row: any) =>
          h('tr', { 'data-rowid': row.id },
            ...row.getVisibleCells().map((cell: any) => {
              cellUnits++
              return h('td', {}, String(flexRender(cell.column.columnDef.cell, cell.getContext())))
            }),
          ),
        ),
      ))
    }
    // RECOMMENDED: keyed <For> + fine-grained reactive cells.
    return h('table', {}, h('tbody', {}, () =>
      h(For, { each: () => table().getRowModel().rows, by: (r: any) => r.id }, (row: any) => {
        const rowId = row.id
        return h('tr', { 'data-rowid': rowId },
          h(For, { each: () => row.getVisibleCells(), by: (c: any) => c.id }, (cell: any) => {
            const colId = cell.column.id
            return h('td', {}, () => {
              cellUnits++
              return String(flexRenderCell(table, rowId, colId))
            })
          }),
        )
      }),
    ))
  }

  const dispose = mount(h(App), container)

  cellUnits = 0
  const mo = observe(container)
  const target = Math.floor(n / 2)

  if (op === 'single-cell') {
    const before = container.querySelector(`[data-rowid="${target}"]`)?.children[0]?.textContent
    data.set(editOneCell(data(), target))
    const after = container.querySelector(`[data-rowid="${target}"]`)?.children[0]?.textContent
    if (before === after || after == null || !after.startsWith('EDITED')) {
      throw new Error(`[pyreon ${mode}] single-cell not applied: ${before} -> ${after}`)
    }
    const other = container.querySelector(`[data-rowid="0"]`)?.children[0]?.textContent
    if (other !== baseC0Row0) throw new Error(`[pyreon ${mode}] unchanged cell corrupted: ${other}`)
  } else {
    tableAccessor().getColumn('c0').toggleSorting(false)
    const first = container.querySelector('tbody [data-rowid]')?.getAttribute('data-rowid')
    if (first == null) throw new Error('[pyreon] sort produced no rows')
  }

  const domWrites = mo.flush()
  if (typeof dispose === 'function') dispose()
  container.remove()
  return { cellUnits, domWrites }
}

// ─── run + report ─────────────────────────────────────────────────────────────

type Variant = 'react-naive' | 'react-memo-row' | 'pyreon-naive-map' | 'pyreon-keyed-for'
const VARIANTS: Variant[] = ['react-naive', 'react-memo-row', 'pyreon-naive-map', 'pyreon-keyed-for']

async function run(variant: Variant, n: number, op: 'single-cell' | 'sort'): Promise<Counts> {
  switch (variant) {
    case 'react-naive':
      return reactHarness(n, false, op)
    case 'react-memo-row':
      return reactHarness(n, true, op)
    case 'pyreon-naive-map':
      return pyreonHarness(n, 'naive-map', op)
    case 'pyreon-keyed-for':
      return pyreonHarness(n, 'keyed-for', op)
  }
}

const pad = (s: string, w: number) => s.padEnd(w)
const padL = (s: string, w: number) => s.padStart(w)

const jsonOut: Record<string, Record<string, Counts>> = {}

for (const op of ['single-cell', 'sort'] as const) {
  console.log(
    `\n=== ${op === 'single-cell' ? 'SINGLE-CELL edit (one field of one row, immutable update)' : 'SORT toggle (re-order all rows by column c0)'} — ${COLS} columns ===`,
  )
  console.log(
    `${pad('variant', 20)} ${padL('N', 5)}   ${padL('cell units', 11)}   ${padL('DOM writes', 11)}`,
  )
  console.log('─'.repeat(60))
  for (const variant of VARIANTS) {
    for (const n of SIZES) {
      const c = await run(variant, n, op)
      jsonOut[`${op}/${variant}/${n}`] = { [`${op}`]: c } as any
      jsonOut[`${op}`] ??= {}
      jsonOut[`${op}`][`${variant}@${n}`] = c
      console.log(
        `${pad(variant, 20)} ${padL(String(n), 5)}   ${padL(String(c.cellUnits), 11)}   ${padL(String(c.domWrites), 11)}`,
      )
    }
  }
}

console.log(
  `\n(cell units = React component renders OR Pyreon cell-accessor re-runs; DOM writes = observed characterData + child-node mutations.\n Lower is better on BOTH. Deterministic COUNT — not wall-clock; see bench:table:wall for timings.)`,
)
console.log(`\nJSON: ${JSON.stringify(jsonOut['single-cell'])}`)
console.log(`JSON: ${JSON.stringify(jsonOut['sort'])}`)
