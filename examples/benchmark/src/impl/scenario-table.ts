/**
 * Scenario: **data table — `@pyreon/table` vs `@tanstack/react-table`**, in a
 * real browser.
 *
 * Both adapters wrap the SAME `@tanstack/table-core@9`, so the row-model work
 * is identical; this times each adapter's render strategy. The package's own
 * comparison (`packages/fundamentals/table/bench/table-bench.ts`) runs in
 * happy-dom, a JavaScript DOM where every node and every DOM call is far more
 * expensive than in a browser — so its mount ratio could not say how a user's
 * browser would see it. This scenario is that answer.
 *
 * Arms:
 *  - **Pyreon** — idiomatic fine-grained `@pyreon/table`, compiled by the real
 *    Pyreon compiler (`scenario-table-pyreon.tsx`).
 *  - **React 19 (react-table, memo rows)** — `React.memo` rows keyed on the
 *    row's `original`, the idiomatic fast React shape (a naive React table
 *    re-renders every row on any edit and is not a fair comparison).
 *
 * Both register the same features (row sorting, column visibility, sorted row
 * model). React writes are wrapped in `flushSync` so the timed region holds
 * the commit, as every React arm in this suite does.
 *
 * Every op VERIFIES its effect outside the timed region — cell count, the
 * edited cell's text, the replaced data's salt, the sorted first row, an empty
 * host — so an arm that does nothing posts a failure, not a fast number.
 */
import { h as ph } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import {
  columnVisibilityFeature as rtColumnVisibility,
  createSortedRowModel as rtCreateSortedRowModel,
  flexRender as rtFlexRender,
  rowSortingFeature as rtRowSorting,
  sortFns as rtSortFns,
  tableFeatures as rtTableFeatures,
  useTable as useReactTable,
} from '@tanstack/react-table'
import * as React from 'react'
import { flushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import { PyreonTableApp, type PyreonTableHandle } from './scenario-table-pyreon'
import {
  columnDefs,
  editOneTableCell,
  makeTableData,
  TABLE_COLS,
  type TableRow,
} from './scenario-table-data'

export const TABLE_FRAMEWORKS = ['Pyreon', 'React 19 (react-table, memo rows)'] as const

const N = 1000
const EDIT_ROW = 500

interface TableTarget {
  mount(host: HTMLElement): () => void
  setData(rows: TableRow[]): void
  sort(desc: boolean): void
}

function pyreonTarget(initial: TableRow[]): TableTarget {
  const data = signal<TableRow[]>(initial)
  let handle: PyreonTableHandle | null = null
  return {
    mount(host) {
      data.set(initial)
      const unmount = pyreonMount(
        ph(PyreonTableApp, {
          data,
          onReady: (h: PyreonTableHandle) => {
            handle = h
          },
        }),
        host,
      )
      return () => unmount()
    },
    setData: (rows) => data.set(rows),
    sort: (desc) => handle!.sort(desc),
  }
}

function reactTarget(initial: TableRow[]): TableTarget {
  const h = React.createElement
  const features = rtTableFeatures({
    rowSortingFeature: rtRowSorting,
    columnVisibilityFeature: rtColumnVisibility,
    sortedRowModel: rtCreateSortedRowModel(),
    sortFns: rtSortFns,
  })
  // table-core's row/cell/table types are generic per table instance; the
  // arm only forwards them, so they stay untyped here (as in the happy-dom bench).
  type AnyCell = any
  const Cell = ({ cell }: { cell: AnyCell }) =>
    h('td', null, rtFlexRender(cell.column.columnDef.cell, cell.getContext()) as React.ReactNode)
  const RowCmp = ({ row }: { row: AnyCell }) =>
    h(
      'tr',
      { 'data-rowid': row.id },
      row.getVisibleCells().map((cell: AnyCell) => h(Cell, { key: cell.id, cell })),
    )
  const MemoRow = React.memo(
    RowCmp,
    (a: { row: AnyCell }, b: { row: AnyCell }) => a.row.original === b.row.original,
  )

  let setRows: (d: TableRow[]) => void = () => {}
  let tableRef: AnyCell = null
  function Table() {
    const [rows, set] = React.useState<TableRow[]>(initial)
    setRows = set
    const table = useReactTable({
      features,
      data: rows,
      columns: columnDefs as AnyCell,
      getRowId: (r: TableRow) => String(r.id),
    } as AnyCell) as AnyCell
    tableRef = table
    return h(
      'table',
      null,
      h(
        'tbody',
        null,
        table.getRowModel().rows.map((row: AnyCell) => h(MemoRow, { key: row.id, row })),
      ),
    )
  }
  return {
    mount(host) {
      const root = ReactDOM.createRoot(host)
      flushSync(() => root.render(h(Table)))
      return () => root.unmount()
    },
    setData: (rows) => flushSync(() => setRows(rows)),
    sort: (desc) => flushSync(() => tableRef.getColumn('c0').toggleSorting(desc)),
  }
}

const cellText = (host: HTMLElement, rowId: number, col: number): string =>
  host.querySelector(`tr[data-rowid="${rowId}"]`)?.children[col]?.textContent ?? ''

export async function runTable(frameworkName: string, container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }
  const base = makeTableData(N)
  const target = frameworkName === 'Pyreon' ? pyreonTarget(base) : reactTarget(base)
  const host = document.createElement('div')
  container.appendChild(host)

  const verifyMounted = (): void => {
    const tds = host.querySelectorAll('td').length
    if (tds !== N * TABLE_COLS)
      throw new Error(`[table] expected ${N * TABLE_COLS} cells, got ${tds}`)
    if (cellText(host, 0, 0) === '') throw new Error('[table] first cell is empty')
  }

  // ── Op 1: mount ───────────────────────────────────────────────────────────
  let teardown: (() => void) | null = null
  const clear = (): void => {
    teardown?.()
    teardown = null
    host.innerHTML = ''
  }
  await bench(
    `mount ${N} rows × ${TABLE_COLS} cols`,
    suite,
    () => {
      teardown = target.mount(host)
    },
    { reset: clear, verify: verifyMounted },
  )
  clear()

  // Steady-state table for the update ops.
  teardown = target.mount(host)
  verifyMounted()
  let current = base
  let salt = 1

  // ── Op 2: update one cell ─────────────────────────────────────────────────
  await bench(
    'update one cell',
    suite,
    () => {
      current = editOneTableCell(current, EDIT_ROW, salt)
      target.setData(current)
    },
    {
      reset: () => {
        salt++
      },
      verify: () => {
        if (cellText(host, EDIT_ROW, 0) !== `E${salt}`)
          throw new Error(
            `[table] edited cell reads "${cellText(host, EDIT_ROW, 0)}", expected "E${salt}"`,
          )
      },
    },
  )

  // ── Op 3: replace every row ───────────────────────────────────────────────
  await bench(
    `replace ${N} rows`,
    suite,
    () => {
      current = makeTableData(N, salt)
      target.setData(current)
    },
    {
      reset: () => {
        salt++
      },
      verify: () => {
        if (!cellText(host, 3, 2).endsWith(`#${salt}`))
          throw new Error(`[table] replace did not land: "${cellText(host, 3, 2)}"`)
      },
    },
  )

  // ── Op 4: sort toggle ─────────────────────────────────────────────────────
  let desc = true
  await bench(
    `sort ${N} rows`,
    suite,
    () => {
      target.sort(desc)
    },
    {
      reset: () => {
        desc = !desc
      },
      verify: () => {
        // c0 counts DOWN with the row index, so ascending puts the last row first.
        const first = host.querySelector('tr[data-rowid]')?.getAttribute('data-rowid')
        const want = desc ? '0' : String(N - 1)
        if (first !== want)
          throw new Error(
            `[table] sort ${desc ? 'desc' : 'asc'}: first row ${first}, expected ${want}`,
          )
      },
    },
  )

  // ── Op 5: unmount ─────────────────────────────────────────────────────────
  await bench(
    `unmount ${N} rows`,
    suite,
    () => {
      teardown?.()
      teardown = null
    },
    {
      reset: () => {
        host.innerHTML = ''
        teardown = target.mount(host)
        verifyMounted()
      },
      verify: () => {
        if (host.querySelectorAll('td').length !== 0)
          throw new Error('[table] cells survived unmount')
      },
    },
  )
  clear()
  return suite
}
