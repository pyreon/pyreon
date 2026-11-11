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
 *  - **Solid (solid-table)**, **Vue 3 (vue-table)**, **Svelte 5 (svelte-table)**
 *    — the other TanStack Table v9 adapters on the same table-core, each in its
 *    adapter's documented basic shape (keyed loop over `getRowModel().rows`,
 *    `getVisibleCells()`, `FlexRender`). Solid is compiled by the real
 *    `babel-preset-solid`, Vue's template at build time (`vite-rivals.ts`),
 *    Svelte by `vite-plugin-svelte` (`TableTanstack.svelte`).
 *  - **AG Grid 36 (no row virtualisation)** — AG Grid Community (MIT). AG Grid
 *    virtualises rows by default, so a default grid renders only the rows in
 *    its viewport and "mount 1,000 rows" would mean something else. This arm
 *    turns that off with the documented `suppressRowVirtualisation` +
 *    `suppressMaxRenderedRowRestriction` (+ `suppressColumnVirtualisation`) so
 *    it renders every cell like the other arms, and `animateRows: false` so a
 *    sort does not start CSS row transitions. It renders into its own
 *    `div[role=gridcell]` grid, not a `<table>`.
 *  - **AG Grid 36 (default, virtualised)** — diagnostic, unranked: the grid as
 *    shipped, rendering only its 600px viewport. Its gate checks the rendered
 *    window, not 6,000 cells, so its numbers are NOT the same work.
 *
 * Every arm registers the same features (row sorting, column visibility,
 * sorted row model). React writes are wrapped in `flushSync`; Svelte writes
 * are followed by `flushSync()`; Vue awaits `nextTick()`; AG Grid writes are
 * followed by its public `flushAllAnimationFrames()`, which renders the rows it
 * would otherwise draw over the next animation frames. Each of these puts the
 * commit inside the timed region.
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
import {
  columnVisibilityFeature as stColumnVisibility,
  createSortedRowModel as stCreateSortedRowModel,
  rowSortingFeature as stRowSorting,
  sortFns as stSortFns,
  tableFeatures as stTableFeatures,
} from '@tanstack/solid-table'
import {
  columnVisibilityFeature as vtColumnVisibility,
  createSortedRowModel as vtCreateSortedRowModel,
  FlexRender as VueFlexRender,
  rowSortingFeature as vtRowSorting,
  sortFns as vtSortFns,
  tableFeatures as vtTableFeatures,
  useTable as useVueTable,
} from '@tanstack/vue-table'
import { AllCommunityModule, createGrid, ModuleRegistry, type GridApi } from 'ag-grid-community'
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from 'svelte'
import { mountTable as solidMountTable } from 'virtual:rival-solid/table-tanstack'
import { render as vueTableRender } from 'virtual:rival-vue/table-tanstack'
import { createApp, defineComponent, nextTick, shallowRef } from 'vue'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import TableTanstackSvelte from './TableTanstack.svelte'
import { PyreonTableApp, type PyreonTableHandle } from './scenario-table-pyreon'
import {
  columnDefs,
  editOneTableCell,
  makeTableData,
  TABLE_COLS,
  type TableRow,
} from './scenario-table-data'

export const TABLE_FRAMEWORKS = [
  'Pyreon',
  'React 19 (react-table, memo rows)',
  'Solid (solid-table)',
  'Vue 3 (vue-table)',
  'Svelte 5 (svelte-table)',
  'AG Grid 36 (no row virtualisation)',
  'AG Grid 36 (default, virtualised)',
] as const

const N = 1000
const EDIT_ROW = 500

interface TableTarget {
  mount(host: HTMLElement): () => void
  setData(rows: TableRow[]): void | Promise<void>
  sort(desc: boolean): void | Promise<void>
  /** Commit after `mount` (Vue: `nextTick`). Inside the timed region. */
  settle?: () => Promise<void>
  /** DOM read-back for a library that does not render `<tr data-rowid>` + `<td>`. */
  dom?: TableDom
}

interface TableDom {
  cellText(host: HTMLElement, rowId: number, col: number): string
  cellCount(host: HTMLElement): number
  firstRowId(host: HTMLElement): string | null
  /** Cells the mount must have rendered (default: every cell). */
  expectedCells?: number
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

function solidTarget(initial: TableRow[]): TableTarget {
  const features = stTableFeatures({
    rowSortingFeature: stRowSorting,
    columnVisibilityFeature: stColumnVisibility,
    sortedRowModel: stCreateSortedRowModel(),
    sortFns: stSortFns,
  })
  let setData: (rows: TableRow[]) => void = () => {}
  let table: any = null
  return {
    mount(host) {
      const m = solidMountTable(host, initial, features, columnDefs, (t) => {
        table = t
      })
      setData = m.setData
      return m.dispose
    },
    setData: (rows) => setData(rows),
    sort: (desc) => table.getColumn('c0').toggleSorting(desc),
  }
}

// @tanstack/vue-table v9 basic example —
// https://tanstack.com/table/latest/docs/framework/vue/examples/basic
// (`useTable({ features, columns, data })` with `data` a ref; template in
// rival-sources.ts). `shallowRef` because the array is replaced, not mutated.
function vueTarget(initial: TableRow[]): TableTarget {
  const features = vtTableFeatures({
    rowSortingFeature: vtRowSorting,
    columnVisibilityFeature: vtColumnVisibility,
    sortedRowModel: vtCreateSortedRowModel(),
    sortFns: vtSortFns,
  })
  const data = shallowRef<TableRow[]>(initial)
  let table: any = null
  return {
    mount(host) {
      data.value = initial
      const App = defineComponent({
        components: { FlexRender: VueFlexRender },
        setup() {
          table = useVueTable({
            features,
            columns: columnDefs as any,
            data,
            getRowId: (r: TableRow) => String(r.id),
          } as any)
          return { table }
        },
        render: vueTableRender,
      })
      const app = createApp(App)
      app.mount(host)
      return () => app.unmount()
    },
    settle: () => nextTick(),
    setData: async (rows) => {
      data.value = rows
      await nextTick()
    },
    sort: async (desc) => {
      table.getColumn('c0').toggleSorting(desc)
      await nextTick()
    },
  }
}

function svelteTarget(initial: TableRow[]): TableTarget {
  let handle: { setData: (rows: TableRow[]) => void; sort: (desc: boolean) => void } | null = null
  return {
    mount(host) {
      const app = svelteMount(TableTanstackSvelte, {
        target: host,
        props: {
          initial,
          onReady: (h: typeof handle) => {
            handle = h
          },
        },
      })
      svelteFlushSync()
      return () => {
        void svelteUnmount(app)
      }
    },
    setData: (rows) => {
      handle!.setData(rows)
      svelteFlushSync()
    },
    sort: (desc) => {
      handle!.sort(desc)
      svelteFlushSync()
    },
  }
}

// AG Grid Community 36 — https://www.ag-grid.com/javascript-data-grid/getting-started/
// (`createGrid(el, { rowData, columnDefs })`), row identity via `getRowId`
// (https://www.ag-grid.com/javascript-data-grid/row-ids/) so a new `rowData`
// array is applied as a delta (https://www.ag-grid.com/javascript-data-grid/data-update-row-data/),
// sort via `applyColumnState` (https://www.ag-grid.com/javascript-data-grid/row-sorting/).
// The no-virtualisation flags are documented at
// https://www.ag-grid.com/javascript-data-grid/dom-virtualisation/.
let agRegistered = false
function agGridTarget(initial: TableRow[], virtualised: boolean): TableTarget {
  if (!agRegistered) {
    ModuleRegistry.registerModules([AllCommunityModule])
    agRegistered = true
  }
  let api: GridApi<TableRow> | null = null
  // AG Grid 36 draws its unpinned rows in `.ag-grid-scrolling-container`.
  const center = (host: HTMLElement): Element | null => host.querySelector('.ag-grid-scrolling-container')
  return {
    mount(host) {
      host.style.height = '600px'
      api = createGrid<TableRow>(host, {
        rowData: initial,
        columnDefs: columnDefs.map((c) => ({ field: c.accessorKey as never, colId: c.id, headerName: c.header })),
        getRowId: (p) => String(p.data.id),
        animateRows: false,
        ...(virtualised
          ? {}
          : {
              suppressRowVirtualisation: true,
              suppressMaxRenderedRowRestriction: true,
              suppressColumnVirtualisation: true,
            }),
      })
      api.flushAllAnimationFrames()
      return () => {
        api!.destroy()
        api = null
      }
    },
    setData: (rows) => {
      api!.setGridOption('rowData', rows)
      api!.flushAllAnimationFrames()
    },
    sort: (desc) => {
      api!.applyColumnState({ state: [{ colId: 'c0', sort: desc ? 'desc' : 'asc' }], defaultState: { sort: null } })
      api!.flushAllAnimationFrames()
    },
    dom: {
      cellText: (host, rowId, col) =>
        center(host)?.querySelector(`.ag-row[row-id="${rowId}"] .ag-cell[col-id="c${col}"]`)?.textContent ?? '',
      cellCount: (host) => host.querySelectorAll('.ag-cell').length,
      firstRowId: (host) => center(host)?.querySelector('.ag-row[row-index="0"]')?.getAttribute('row-id') ?? null,
      // The default grid draws its 600px viewport (plus its row buffer), so the
      // virtualised arm is gated on "at least the visible rows", not 6,000.
      ...(virtualised ? { expectedCells: -1 } : {}),
    },
  }
}

function targetFor(frameworkName: string, base: TableRow[]): TableTarget {
  switch (frameworkName) {
    case 'Pyreon':
      return pyreonTarget(base)
    case 'React 19 (react-table, memo rows)':
      return reactTarget(base)
    case 'Solid (solid-table)':
      return solidTarget(base)
    case 'Vue 3 (vue-table)':
      return vueTarget(base)
    case 'Svelte 5 (svelte-table)':
      return svelteTarget(base)
    case 'AG Grid 36 (no row virtualisation)':
      return agGridTarget(base, false)
    case 'AG Grid 36 (default, virtualised)':
      return agGridTarget(base, true)
    default:
      throw new Error(`[table] unknown framework: ${frameworkName}`)
  }
}

const TABLE_DOM: TableDom = {
  cellText: (host, rowId, col) =>
    host.querySelector(`tr[data-rowid="${rowId}"]`)?.children[col]?.textContent ?? '',
  cellCount: (host) => host.querySelectorAll('td').length,
  firstRowId: (host) => host.querySelector('tr[data-rowid]')?.getAttribute('data-rowid') ?? null,
}

export async function runTable(frameworkName: string, container: HTMLElement): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }
  const base = makeTableData(N)
  const target = targetFor(frameworkName, base)
  const dom = target.dom ?? TABLE_DOM
  const cellText = dom.cellText
  /** Virtualised (diagnostic) arm: only its viewport is rendered. */
  const windowed = dom.expectedCells === -1
  const host = document.createElement('div')
  container.appendChild(host)

  const verifyMounted = (): void => {
    const cells = dom.cellCount(host)
    if (windowed) {
      if (cells === 0 || cells >= N * TABLE_COLS || cells % TABLE_COLS !== 0)
        throw new Error(`[table] virtualised grid rendered ${cells} cells — expected a window of whole rows`)
      for (let r = 0; r < 10; r++)
        if (cellText(host, r, 1) !== `r${r}c1#0` && !cellText(host, r, 1).startsWith(`r${r}c1#`))
          throw new Error(`[table] visible row ${r} is not rendered`)
    } else if (cells !== N * TABLE_COLS) {
      throw new Error(`[table] expected ${N * TABLE_COLS} cells, got ${cells}`)
    }
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
    async () => {
      teardown = target.mount(host)
      await target.settle?.()
    },
    { reset: clear, verify: verifyMounted },
  )
  clear()

  // Steady-state table for the update ops.
  teardown = target.mount(host)
  await target.settle?.()
  verifyMounted()
  let current = base
  let salt = 1

  // ── Op 2: update one cell ─────────────────────────────────────────────────
  // Skipped for the virtualised grid: row 500 is outside its viewport, so it
  // has no DOM to update and no DOM gate could tell a no-op apart.
  if (!windowed) {
    await bench(
      'update one cell',
      suite,
      async () => {
        current = editOneTableCell(current, EDIT_ROW, salt)
        await target.setData(current)
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
  }

  // ── Op 3: replace every row ───────────────────────────────────────────────
  await bench(
    `replace ${N} rows`,
    suite,
    async () => {
      current = makeTableData(N, salt)
      await target.setData(current)
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
    async () => {
      await target.sort(desc)
    },
    {
      reset: () => {
        desc = !desc
      },
      verify: () => {
        // c0 counts DOWN with the row index, so ascending puts the last row first.
        const first = dom.firstRowId(host)
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
      reset: async () => {
        host.innerHTML = ''
        teardown = target.mount(host)
        await target.settle?.()
        verifyMounted()
      },
      verify: () => {
        if (dom.cellCount(host) !== 0) throw new Error('[table] cells survived unmount')
      },
    },
  )
  clear()
  return suite
}

/**
 * CPU-profiling / split target for `bench-tableprofile.ts` (`?profileTable=1`).
 * Never runs the timed suite. Exposes named `__mountOnly` / `__teardownOnly`
 * frames so a CDP profile can be attributed to the mount subtree only, and a
 * `split()` sample that times the mount's JS and the forced layout separately
 * (the board's `bench()` times them together).
 */
export function setupTableProfile(): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const base = makeTableData(N)
  let target: TableTarget | null = null
  let teardown: (() => void) | null = null
  function __mountOnly(): void {
    teardown = target!.mount(host)
  }
  function __teardownOnly(): void {
    teardown?.()
    teardown = null
    host.innerHTML = ''
  }
  ;(globalThis as { __tableProf?: unknown }).__tableProf = {
    prepare(fw: string): void {
      target = fw === 'Pyreon' ? pyreonTarget(base) : reactTarget(base)
    },
    mount: __mountOnly,
    teardown: __teardownOnly,
    cells: (): number => host.querySelectorAll('td').length,
    /** One mount: JS (until `mount()` returns) and layout (the forced flush) apart. */
    split(): { js: number; layout: number } {
      const t0 = performance.now()
      __mountOnly()
      const t1 = performance.now()
      host.getBoundingClientRect()
      void document.body.offsetHeight
      const t2 = performance.now()
      if (host.querySelectorAll('td').length !== N * TABLE_COLS) throw new Error('[table-profile] wrong cell count')
      __teardownOnly()
      return { js: t1 - t0, layout: t2 - t1 }
    },
  }
}
