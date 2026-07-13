#!/usr/bin/env bun
/**
 * Wall-clock benchmark — @pyreon/table vs @tanstack/react-table.
 *
 * Companion to the deterministic COUNT bench (`bench:table`). Same fair
 * foundation: BOTH adapters wrap the SAME `@tanstack/table-core@8.21.3`, so the
 * row-model work is identical — this times only the ADAPTER's render strategy.
 *
 * Objectivity contract (mirrors store-bench.ts):
 *  - NODE_ENV=production set by the npm script's SHELL before the process starts.
 *  - PER-(scenario × variant × N) PROCESS ISOLATION — a fresh `bun` child per
 *    cell, so react-dom's JIT/heap state can't bias Pyreon's cell and vice
 *    versa (they share NO process).
 *  - CORRECTNESS: every scenario asserts the expected DOM before timing (a
 *    single-cell edit really changed one cell, a sort really re-ordered, etc.).
 *  - React commits are driven synchronously via `flushSync` (the correct bench
 *    primitive — isolates render WORK from React's macrotask scheduler latency).
 *  - Pooled median of many small runs × BENCH_REPEATS processes + bootstrap
 *    CI95; `🤝` marks a react cell whose CI95 overlaps the Pyreon cell.
 *  - NO forced GC (JSC jettisons compiled code on forced GC → re-tier noise).
 *  - A `sink` defeats DCE.
 *
 * HONEST LIMIT: this runs in happy-dom (Node), NOT a real browser — it measures
 * the JS + DOM-mutation WORK each adapter performs, not browser layout/paint.
 * That is exactly the axis where the adapter difference lives (VDOM vs
 * fine-grained bindings). The ratio is the portable signal; absolute ms are
 * machine + happy-dom-version dependent.
 *
 * Run: bun bench/table-bench.ts   (or `bun run bench:table:wall`)
 */
process.env.NODE_ENV = 'production'

import { GlobalRegistrator } from '@happy-dom/global-registrator'
GlobalRegistrator.register()
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false

declare const Bun: {
  spawnSync: (
    cmd: string[],
    opts: { env: Record<string, string | undefined> },
  ) => { stdout: Uint8Array; stderr: Uint8Array; exitCode: number }
}

const COLS = 6
const now = () => Number(process.hrtime.bigint())
let sink = 0

interface Row {
  id: number
  [k: `c${number}`]: string | number
}
function makeData(n: number, salt = 0): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const row: Row = { id: i, c0: String(n - i).padStart(7, '0') + salt }
    for (let c = 1; c < COLS; c++) row[`c${c}`] = `r${i}c${c}#${salt}`
    return row
  })
}
function editOneCell(data: Row[], rowIndex: number, salt: number): Row[] {
  const next = data.slice()
  const changed = { ...next[rowIndex]! }
  changed.c0 = `E${salt}`
  next[rowIndex] = changed
  return next
}
const columnDefs = Array.from({ length: COLS }, (_, c) => ({
  accessorKey: `c${c}`,
  id: `c${c}`,
  header: `c${c}`,
}))

// ─── stats ────────────────────────────────────────────────────────────────────
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[s.length >> 1] as number
}
function bootstrapCI(samples: number[], resamples = 1500): [number, number] {
  const meds: number[] = []
  const n = samples.length
  for (let r = 0; r < resamples; r++) {
    const re: number[] = []
    for (let i = 0; i < n; i++) re.push(samples[(Math.random() * n) | 0] as number)
    meds.push(median(re))
  }
  meds.sort((a, b) => a - b)
  return [meds[(resamples * 0.025) | 0] as number, meds[(resamples * 0.975) | 0] as number]
}
const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1]

/** Time `op` over `runs` samples of `iters` each; `reset` runs untimed between. */
function measure(
  op: () => void,
  { warmup = 8, iters = 1, runs = 25, reset }: { warmup?: number; iters?: number; runs?: number; reset?: () => void } = {},
): number[] {
  for (let i = 0; i < warmup; i++) {
    op()
    reset?.()
  }
  const samples: number[] = []
  for (let r = 0; r < runs; r++) {
    const t0 = now()
    for (let i = 0; i < iters; i++) op()
    samples.push((now() - t0) / iters / 1e6) // ms
    reset?.()
  }
  return samples
}

// ─── React variant runner ─────────────────────────────────────────────────────
async function reactSamples(
  n: number,
  memoized: boolean,
  scenario: Scenario,
): Promise<number[]> {
  const React = (await import('react')).default
  const { createElement: h, useState } = React
  const { createRoot } = await import('react-dom/client')
  const { flushSync } = await import('react-dom')
  const { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } = await import(
    '@tanstack/react-table'
  )

  const base = makeData(n)
  const Cell = ({ cell }: { cell: any }) =>
    h('td', null, flexRender(cell.column.columnDef.cell, cell.getContext()) as any)
  const RowCmp = ({ row }: { row: any }) =>
    h('tr', { 'data-rowid': row.id }, row.getVisibleCells().map((cell: any) => h(Cell, { key: cell.id, cell })))
  const MemoRow = React.memo(RowCmp, (a: any, b: any) => a.row.original === b.row.original)
  const RowComponent = memoized ? MemoRow : RowCmp

  let setData!: (d: Row[]) => void
  let tableRef: any = null
  function Table() {
    const [data, sd] = useState<Row[]>(() => base)
    setData = sd
    const table = useReactTable<Row>({
      data,
      columns: columnDefs as any,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getRowId: (r) => String(r.id),
    })
    tableRef = table
    return h('table', null, h('tbody', null, table.getRowModel().rows.map((row) => h(RowComponent as any, { key: row.id, row }))))
  }

  if (scenario === 'mount') {
    return measure(
      () => {
        const c = document.createElement('div')
        const root = createRoot(c)
        flushSync(() => root.render(h(Table)))
        sink += c.querySelectorAll('td').length
        root.unmount()
      },
      { runs: 20, warmup: 5 },
    )
  }

  // Persistent-mount scenarios.
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(h(Table)))
  let salt = 1
  let op: () => void
  if (scenario === 'update-1cell') {
    const target = Math.floor(n / 2)
    op = () => flushSync(() => setData(editOneCell(base, target, salt++)))
  } else if (scenario === 'replace') {
    op = () => flushSync(() => setData(makeData(n, salt++)))
  } else {
    // sort — toggle asc/desc
    let desc = false
    op = () => {
      desc = !desc
      flushSync(() => tableRef.getColumn('c0').toggleSorting(desc))
    }
  }
  const samples = measure(op, { runs: 25, warmup: 8, iters: 1 })
  sink += container.querySelectorAll('td').length
  root.unmount()
  container.remove()
  return samples
}

// ─── Pyreon variant runner ────────────────────────────────────────────────────
async function pyreonSamples(n: number, scenario: Scenario): Promise<number[]> {
  const { For, h } = await import('@pyreon/core')
  const { signal } = await import('@pyreon/reactivity')
  const { mount } = await import('@pyreon/runtime-dom')
  const { useTable, flexRenderCell, getCoreRowModel, getSortedRowModel } = await import('../src/index')

  const base = makeData(n)
  const data = signal<Row[]>(base)
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
    return h('table', {}, h('tbody', {}, () =>
      h(For, { each: () => table().getRowModel().rows, by: (r: any) => r.id }, (row: any) => {
        const rowId = row.id
        return h('tr', { 'data-rowid': rowId },
          h(For, { each: () => row.getVisibleCells(), by: (c: any) => c.id }, (cell: any) => {
            const colId = cell.column.id
            return h('td', {}, () => String(flexRenderCell(table, rowId, colId)))
          }),
        )
      }),
    ))
  }

  if (scenario === 'mount') {
    return measure(
      () => {
        const c = document.createElement('div')
        const dispose = mount(h(App), c)
        sink += c.querySelectorAll('td').length
        if (typeof dispose === 'function') dispose()
      },
      { runs: 20, warmup: 5 },
    )
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const dispose = mount(h(App), container)
  let salt = 1
  let op: () => void
  if (scenario === 'update-1cell') {
    const target = Math.floor(n / 2)
    op = () => data.set(editOneCell(data(), target, salt++))
  } else if (scenario === 'replace') {
    op = () => data.set(makeData(n, salt++))
  } else {
    let desc = false
    op = () => {
      desc = !desc
      tableAccessor().getColumn('c0').toggleSorting(desc)
    }
  }
  const samples = measure(op, { runs: 25, warmup: 8, iters: 1 })
  sink += container.querySelectorAll('td').length
  if (typeof dispose === 'function') dispose()
  container.remove()
  return samples
}

type Scenario = 'mount' | 'update-1cell' | 'replace' | 'sort'
type Variant = 'react-naive' | 'react-memo-row' | 'pyreon'
const SCENARIOS: Scenario[] = ['mount', 'update-1cell', 'replace', 'sort']
const SIZES = [100, 1000] as const

async function runOne(variant: Variant, n: number, scenario: Scenario): Promise<number[]> {
  if (variant === 'pyreon') return pyreonSamples(n, scenario)
  return reactSamples(n, variant === 'react-memo-row', scenario)
}

// ─── child mode ────────────────────────────────────────────────────────────────
const childArgs = process.argv.slice(2)
if (childArgs.length === 3) {
  const [variant, nStr, scenario] = childArgs as [Variant, string, Scenario]
  const samples = await runOne(variant, Number(nStr), scenario)
  process.stdout.write(JSON.stringify({ samples }))
  if (sink === -1) console.log('sink')
  process.exit(0)
}

// ─── orchestrator ────────────────────────────────────────────────────────────
const CELL_REPEATS = Number(process.env.BENCH_REPEATS ?? 3)
interface Cell {
  med: number
  ci: [number, number]
}
function runCell(variant: Variant, n: number, scenario: Scenario): Cell {
  const pooled: number[] = []
  for (let r = 0; r < CELL_REPEATS; r++) {
    const proc = Bun.spawnSync(['bun', import.meta.path, variant, String(n), scenario], {
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (proc.exitCode !== 0) {
      throw new Error(
        `child failed (${variant}, ${n}, ${scenario}): ${new TextDecoder().decode(proc.stderr).slice(-400)}`,
      )
    }
    const { samples } = JSON.parse(new TextDecoder().decode(proc.stdout)) as { samples: number[] }
    pooled.push(...samples)
  }
  return { med: median(pooled), ci: bootstrapCI(pooled) }
}

console.log(
  `=== @pyreon/table vs @tanstack/react-table (${process.platform}/${process.arch}, happy-dom, NODE_ENV=production, per-cell isolated processes, median ms/op [CI95], 🤝 = CI-overlap tie) ===`,
)
console.log(`(both wrap @tanstack/table-core@8.21.3; ${COLS} columns; ratio = react ÷ pyreon, >1 ⇒ Pyreon faster)\n`)

const pad = (s: string, w: number) => s.padEnd(w)
const padL = (s: string, w: number) => s.padStart(w)
console.log(
  `${pad('scenario', 16)} ${padL('N', 5)}   ${padL('pyreon', 9)} ${padL('rt-naive', 9)} ${padL('rt-memo', 9)}   ${padL('vs naive', 16)} ${padL('vs memo-row', 16)}`,
)
console.log('─'.repeat(100))
for (const scenario of SCENARIOS) {
  for (const n of SIZES) {
    const p = runCell('pyreon', n, scenario)
    const rn = runCell('react-naive', n, scenario)
    const rm = runCell('react-memo-row', n, scenario)
    const verdict = (c: Cell) => {
      const ratio = c.med / p.med
      const tie = overlaps(p.ci, c.ci)
      const base = ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x SLOWER`
      return tie ? `🤝 ${base}` : base
    }
    console.log(
      `${pad(scenario, 16)} ${padL(String(n), 5)}   ${padL(p.med.toFixed(3), 9)} ${padL(rn.med.toFixed(3), 9)} ${padL(rm.med.toFixed(3), 9)}   ${padL(verdict(rn), 16)} ${padL(verdict(rm), 16)}`,
    )
  }
}
console.log(
  `\n(happy-dom JS+DOM-op work, NOT browser paint. Pooled median of 20-25 runs × ${CELL_REPEATS} processes per cell. rt-memo-row = idiomatic React.memo(row) on original identity + immutable updates. ratio is the portable signal.)`,
)
