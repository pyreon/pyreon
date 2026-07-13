/**
 * Correctness + fine-grained-invalidation contract for `flexRenderCell`.
 *
 * The adapter keeps ONE coarse table signal (drives the keyed <For> structure)
 * PLUS per-row signals that `flexRenderCell` subscribes to. An in-place DATA
 * edit must re-run ONLY the changed rows' cells; a table-STATE change
 * (selection/sort/filter/visibility), a reorder, or an add/remove must re-run
 * every affected cell (correct-by-over-invalidation). Uses `h()` (not JSX) so
 * the keyed reconciliation is faithful (the vitest transform is not the real
 * compiler).
 */
import { For as ForBase, h } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { getCoreRowModel, getFilteredRowModel, getSortedRowModel } from '@tanstack/table-core'
import { describe, expect, it } from 'vitest'
import { flexRenderCell, useTable } from '../index'

const flush = async () => {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

// `<For>`'s render callback types cleanly as the `children` prop (positional
// children are runtime-valid via mergeChildrenIntoProps but not typed for For).
const hAny = h as (...a: unknown[]) => any
const hFor = (props: { each: () => unknown[]; by: (i: any) => unknown }, child: (i: any) => unknown): any =>
  hAny(ForBase, { ...props, children: child })

interface Row {
  id: number
  a: string
  b: string
}
function makeData(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, a: `a${i}`, b: `b${i}` }))
}
function editCell(data: Row[], rowIndex: number, field: 'a' | 'b', value: string): Row[] {
  const next = data.slice()
  next[rowIndex] = { ...next[rowIndex]!, [field]: value }
  return next
}

const cols = [
  { accessorKey: 'a', id: 'a' },
  { accessorKey: 'b', id: 'b' },
]

/** Mount a table whose cells use `flexRenderCell(accessor, ...)`; count each
 *  cell-accessor run so we can assert fine-grained re-runs. */
function mountFineTable(data: ReturnType<typeof signal<Row[]>>, extraOpts: object = {}) {
  const cellRuns: number[] = [0] // boxed so closures share it
  const el = document.createElement('div')
  document.body.appendChild(el)
  let tableAccessor!: () => any
  const App = () => {
    const table = useTable(() => ({
      data: data(),
      columns: cols,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getRowId: (r: Row) => String(r.id),
      ...extraOpts,
    }))
    tableAccessor = table
    return h('table', {}, h('tbody', {}, () =>
      hFor({ each: () => table().getRowModel().rows, by: (r: any) => r.id }, (row: any) => {
        const rowId = row.id
        return h('tr', { 'data-rowid': rowId },
          hFor({ each: () => row.getVisibleCells(), by: (c: any) => c.id }, (cell: any) => {
            const colId = cell.column.id
            return h('td', { class: `col-${colId}`, 'data-col': colId }, () => {
              cellRuns[0]!++
              return String(flexRenderCell(table, rowId, colId))
            })
          }),
        )
      }),
    ))
  }
  const dispose = mount(hAny(App), el)
  return {
    el,
    table: () => tableAccessor(),
    cellRuns,
    cellText: (rowId: number, colId: string) =>
      el.querySelector(`[data-rowid="${rowId}"] .col-${colId}`)?.textContent,
    unmount: () => {
      if (typeof dispose === 'function') dispose()
      el.remove()
    },
  }
}

describe('flexRenderCell — fine-grained invalidation', () => {
  it('in-place single-cell edit re-runs ONLY the changed row cells', async () => {
    const data = signal(makeData(5))
    const t = mountFineTable(data)
    expect(t.cellText(2, 'a')).toBe('a2')

    t.cellRuns[0] = 0 // reset — count only edit-driven runs
    data.set(editCell(data(), 2, 'a', 'EDITED'))
    await flush()

    // Cell updated fine-grained.
    expect(t.cellText(2, 'a')).toBe('EDITED')
    // An unchanged row is untouched.
    expect(t.cellText(0, 'a')).toBe('a0')
    // Only row 2's TWO cells re-ran (a + b), not all 10.
    expect(t.cellRuns[0]).toBe(2)
    t.unmount()
  })

  it('editing two rows re-runs only those two rows cells', async () => {
    const data = signal(makeData(10))
    const t = mountFineTable(data)
    t.cellRuns[0] = 0
    let next = editCell(data(), 1, 'a', 'X')
    next = editCell(next, 7, 'b', 'Y')
    data.set(next)
    await flush()
    expect(t.cellText(1, 'a')).toBe('X')
    expect(t.cellText(7, 'b')).toBe('Y')
    // 2 rows × 2 cells = 4 re-runs, not 20.
    expect(t.cellRuns[0]).toBe(4)
    t.unmount()
  })

  it('a SORT (state change) re-runs all cells AND re-orders correctly', async () => {
    // reverse-sorted `a` so ascending sort actually re-orders
    const data = signal([
      { id: 0, a: 'z', b: 'b0' },
      { id: 1, a: 'm', b: 'b1' },
      { id: 2, a: 'a', b: 'b2' },
    ])
    const t = mountFineTable(data)
    t.cellRuns[0] = 0
    t.table().getColumn('a').toggleSorting(false) // ascending
    await flush()
    // all 3×2 = 6 cells re-ran (coarse on state change)
    expect(t.cellRuns[0]).toBe(6)
    // order in DOM is now a, m, z
    const firstRow = t.el.querySelector('tbody [data-rowid]')
    expect(firstRow?.querySelector('.col-a')?.textContent).toBe('a')
    t.unmount()
  })

  it('a selection toggle (state change) re-runs cells so selection-derived cells stay correct', async () => {
    const data = signal(makeData(4))
    const el = document.createElement('div')
    document.body.appendChild(el)
    let cellRuns = 0
    let tableAccessor!: () => any
    const App = () => {
      const table = useTable(() => ({
        data: data(),
        columns: cols,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (r: Row) => String(r.id),
        enableRowSelection: true,
      }))
      tableAccessor = table
      // A cell that renders table STATE (selection), not row data.
      return h('table', {}, h('tbody', {}, () =>
        hFor({ each: () => table().getRowModel().rows, by: (r: any) => r.id }, (row: any) => {
          const rowId = row.id
          return h('tr', { 'data-rowid': rowId },
            h('td', { class: 'sel' }, () => {
              cellRuns++
              // read the LIVE row's selection state
              const live = table().getRowModel().rowsById[rowId]
              return live?.getIsSelected() ? 'SELECTED' : '-'
            }),
          )
        }),
      ))
    }
    const dispose = mount(hAny(App), el)
    expect(el.querySelector('[data-rowid="1"] .sel')?.textContent).toBe('-')
    cellRuns = 0
    tableAccessor().getRowModel().rowsById['1'].toggleSelected(true)
    await flush()
    expect(el.querySelector('[data-rowid="1"] .sel')?.textContent).toBe('SELECTED')
    if (typeof dispose === 'function') dispose()
    el.remove()
  })

  it('editing a value in a SORTED table keeps every rendered cell showing its own row value', async () => {
    // The fine-grained guarantee is VALUE correctness: each rendered <tr> shows
    // its own row's live data. (DOM re-ORDER on a data edit that changes the
    // sort key is a separate, pre-existing base-adapter limitation — see
    // "reorder-on-data-edit" note in the README/docs; a data change that alters
    // the sort order does not re-position the keyed rows until the next
    // structure/state change. Sorting via the sort controls DOES re-order.)
    const data = signal([
      { id: 0, a: 'c', b: 'b0' },
      { id: 1, a: 'b', b: 'b1' },
      { id: 2, a: 'a', b: 'b2' },
    ])
    const t = mountFineTable(data)
    t.table().getColumn('a').toggleSorting(false) // asc -> a,b,c (ids 2,1,0)
    await flush()
    // Edit id 2's `a` value.
    data.set(editCell(data(), 2, 'a', 'zz'))
    await flush()
    // Each row still shows the correct value FOR ITS id, regardless of position.
    expect(t.cellText(2, 'a')).toBe('zz')
    expect(t.cellText(1, 'a')).toBe('b')
    expect(t.cellText(0, 'a')).toBe('c')
    t.unmount()
  })

  it('removing a row evicts its per-row signal (no unbounded growth)', async () => {
    const data = signal(makeData(6))
    const t = mountFineTable(data)
    // shrink to 2 rows
    data.set(makeData(2))
    await flush()
    expect(t.el.querySelectorAll('tbody [data-rowid]')).toHaveLength(2)
    // grow back — an in-place edit of a surviving row still fine-grained
    data.set([...makeData(2), { id: 9, a: 'a9', b: 'b9' }])
    await flush()
    t.cellRuns[0] = 0
    data.set(editCell(data(), 0, 'a', 'Z'))
    await flush()
    expect(t.cellText(0, 'a')).toBe('Z')
    expect(t.cellRuns[0]).toBe(2) // still fine-grained after churn
    t.unmount()
  })

  it('coarse fallback: a plain Computed<Table> (not from useTable) still renders reactively', async () => {
    const data = signal(makeData(2))
    const el = document.createElement('div')
    document.body.appendChild(el)
    let tableAccessor!: () => any
    const App = () => {
      const t = useTable(() => ({
        data: data(),
        columns: cols,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (r: Row) => String(r.id),
      }))
      // Wrap in a PLAIN computed — not registered in the row-signal registry,
      // so flexRenderCell must fall back to a coarse subscription.
      const plain = computed(() => t())
      tableAccessor = t
      return h('table', {}, h('tbody', {}, () =>
        hFor({ each: () => t().getRowModel().rows, by: (r: any) => r.id }, (row: any) => {
          const rowId = row.id
          return h('tr', { 'data-rowid': rowId },
            h('td', { class: 'col-a' }, () => String(flexRenderCell(plain, rowId, 'a'))),
          )
        }),
      ))
    }
    const dispose = mount(hAny(App), el)
    expect(el.querySelector('[data-rowid="1"] .col-a')?.textContent).toBe('a1')
    data.set(editCell(data(), 1, 'a', 'COARSE'))
    await flush()
    expect(el.querySelector('[data-rowid="1"] .col-a')?.textContent).toBe('COARSE')
    if (typeof dispose === 'function') dispose()
    el.remove()
  })

  it('raw Table instance form — flexRenderCell(table(), ...) subscribes coarsely', async () => {
    const data = signal(makeData(3))
    const el = document.createElement('div')
    document.body.appendChild(el)
    const App = () => {
      const t = useTable(() => ({
        data: data(),
        columns: cols,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (r: Row) => String(r.id),
      }))
      return h('table', {}, h('tbody', {}, () =>
        hFor({ each: () => t().getRowModel().rows, by: (r: any) => r.id }, (row: any) => {
          const rowId = row.id
          // Pass the RESOLVED instance t() — coarse subscription via the closure.
          return h('tr', { 'data-rowid': rowId },
            h('td', { class: 'col-a' }, () => String(flexRenderCell(t(), rowId, 'a'))),
          )
        }),
      ))
    }
    const dispose = mount(hAny(App), el)
    expect(el.querySelector('[data-rowid="2"] .col-a')?.textContent).toBe('a2')
    data.set(editCell(data(), 2, 'a', 'RAW'))
    await flush()
    expect(el.querySelector('[data-rowid="2"] .col-a')?.textContent).toBe('RAW')
    if (typeof dispose === 'function') dispose()
    el.remove()
  })

  it('sort asc → desc (array-state slice, same length) re-runs cells; a value edit while sorted stays fine', async () => {
    const data = signal(makeData(4))
    const t = mountFineTable(data)
    t.table().getColumn('a').toggleSorting(false) // sorting: [{id:'a',desc:false}]
    await flush()
    t.cellRuns[0] = 0
    t.table().getColumn('a').toggleSorting(true) // sorting: [{id:'a',desc:true}] — same length, differ
    await flush()
    expect(t.cellRuns[0]).toBe(8) // coarse: all 4×2 cells re-run on the sort-direction change
    // a subsequent value edit (structure/state unchanged) is fine-grained again
    t.cellRuns[0] = 0
    data.set(editCell(data(), 0, 'b', 'Z'))
    await flush()
    expect(t.cellRuns[0]).toBe(2)
    t.unmount()
  })

  it('a columns signal change re-runs all cells (coarse) and reflects the new columns', async () => {
    const data = signal(makeData(3))
    const columns = signal([
      { accessorKey: 'a', id: 'a' },
      { accessorKey: 'b', id: 'b' },
    ])
    const el = document.createElement('div')
    document.body.appendChild(el)
    let cellRuns = 0
    const App = () => {
      const t = useTable(() => ({
        data: data(),
        columns: columns(),
        getCoreRowModel: getCoreRowModel(),
        getRowId: (r: Row) => String(r.id),
      }))
      return h('table', {}, h('tbody', {}, () =>
        hFor({ each: () => t().getRowModel().rows, by: (r: any) => r.id }, (row: any) => {
          const rowId = row.id
          return h('tr', { 'data-rowid': rowId },
            hFor({ each: () => t().getRow(rowId).getVisibleCells(), by: (c: any) => c.id }, (cell: any) => {
              const colId = cell.column.id
              return h('td', { class: `col-${colId}` }, () => {
                cellRuns++
                return String(flexRenderCell(t, rowId, colId))
              })
            }),
          )
        }),
      ))
    }
    const dispose = mount(hAny(App), el)
    expect(el.querySelectorAll('[data-rowid="0"] td')).toHaveLength(2)
    cellRuns = 0
    // Add a column — columnsChanged → coarse invalidation.
    columns.set([
      { accessorKey: 'a', id: 'a' },
      { accessorKey: 'b', id: 'b' },
      { accessorKey: 'c' as any, id: 'c' },
    ])
    await flush()
    expect(el.querySelectorAll('[data-rowid="0"] td')).toHaveLength(3)
    expect(cellRuns).toBeGreaterThan(0)
    if (typeof dispose === 'function') dispose()
    el.remove()
  })

  it('a missing row OR a missing column renders null instead of throwing', async () => {
    const data = signal(makeData(3))
    const el = document.createElement('div')
    document.body.appendChild(el)
    const App = () => {
      const t = useTable(() => ({
        data: data(),
        columns: cols,
        getCoreRowModel: getCoreRowModel(),
        getRowId: (r: Row) => String(r.id),
      }))
      return h('div', {},
        // missing row
        h('span', { class: 'no-row' }, () => String(flexRenderCell(t, '999', 'a'))),
        // valid row, missing column
        h('span', { class: 'no-col' }, () => String(flexRenderCell(t, '0', 'nope'))),
      )
    }
    const dispose = mount(hAny(App), el)
    expect(el.querySelector('.no-row')?.textContent).toBe('null')
    expect(el.querySelector('.no-col')?.textContent).toBe('null')
    if (typeof dispose === 'function') dispose()
    el.remove()
  })

  it('a primitive-state slice change (globalFilter string) coarse-invalidates', async () => {
    const data = signal(makeData(3))
    const el = document.createElement('div')
    document.body.appendChild(el)
    let cellRuns = 0
    let tableAccessor!: () => any
    const App = () => {
      const t = useTable(() => ({
        data: data(),
        columns: cols,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getRowId: (r: Row) => String(r.id),
      }))
      tableAccessor = t
      return h('table', {}, h('tbody', {}, () =>
        hFor({ each: () => t().getRowModel().rows, by: (r: any) => r.id }, (row: any) =>
          h('tr', { 'data-rowid': row.id },
            h('td', {}, () => {
              cellRuns++
              return String(flexRenderCell(t, row.id, 'a'))
            }),
          ),
        ),
      ))
    }
    const dispose = mount(hAny(App), el)
    cellRuns = 0
    // globalFilter: undefined -> 'a' (a string slice → sliceEqual primitive path)
    tableAccessor().setGlobalFilter('a')
    await flush()
    expect(cellRuns).toBeGreaterThan(0)
    if (typeof dispose === 'function') dispose()
    el.remove()
  })

  it('a no-op array-state re-set (same column order) is NOT treated as a change', async () => {
    const data = signal(makeData(3))
    const t = mountFineTable(data)
    t.table().setColumnOrder(['a', 'b']) // [] -> ['a','b'] (length differs → change)
    await flush()
    t.cellRuns[0] = 0
    // Re-set to an EQUAL-content new array — the value compare must see it as a
    // no-op (exercises shallowValueEqual's array element-wise equal path), so no
    // coarse cell invalidation fires.
    t.table().setColumnOrder(['a', 'b'])
    await flush()
    expect(t.cellRuns[0]).toBe(0)
    t.unmount()
  })
})
