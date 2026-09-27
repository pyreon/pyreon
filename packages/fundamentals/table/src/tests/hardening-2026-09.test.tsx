import { For as ForBase, h } from '@pyreon/core'
import { EffectScope, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { columnSignature } from '../use-table'
import { flexRenderCell, useTable } from '../index'
import { allFeatures } from './fixtures'

const flush = async () => {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}
const hAny = h as (...a: unknown[]) => any
const hFor = (props: { each: () => unknown[]; by: (i: any) => unknown }, child: (i: any) => unknown): any =>
  hAny(ForBase, { ...props, children: child })

interface Row {
  id: number
  name: string
}
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i, name: `n${i}` }))

afterEach(() => vi.restoreAllMocks())

// ─── 1. A cell renderer's own table-state reads are reactive ────────────────

describe('flexRenderCell — the renderer tracks what it reads', () => {
  function mountSelectable(data: ReturnType<typeof signal<Row[]>>) {
    const cellRuns = [0]
    const el = document.createElement('div')
    document.body.appendChild(el)
    let t!: any
    const columns = [
      { id: 'name', accessorKey: 'name' },
      {
        id: 'sel',
        cell: (info: any) => (info.row.getIsSelected() ? 'SELECTED' : 'no'),
      },
    ]
    const App = () => {
      const table = useTable(() => ({
        data: data(),
        columns,
        features: allFeatures,
        getRowId: (r: Row) => String(r.id),
        enableRowSelection: true,
      }))
      t = table
      return h('table', {}, h('tbody', {}, () =>
        hFor({ each: () => table.getRowModel().rows, by: (r: any) => r.id }, (row: any) => {
          const rowId = row.id
          return h('tr', { 'data-rowid': rowId },
            hFor({ each: () => row.getVisibleCells(), by: (c: any) => c.id }, (cell: any) => {
              const colId = cell.column.id
              return h('td', { class: `col-${colId}` }, () => {
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
      table: () => t,
      cellRuns,
      text: (rowId: number, col: string) =>
        el.querySelector(`[data-rowid="${rowId}"] .col-${col}`)?.textContent,
      unmount: () => {
        if (typeof dispose === 'function') dispose()
        el.remove()
      },
    }
  }

  it('a cell reading row.getIsSelected() updates when the row is selected', async () => {
    const data = signal(rows(3))
    const m = mountSelectable(data)
    expect(m.text(1, 'sel')).toBe('no')
    m.table().getRowModel().rowsById['1'].toggleSelected(true)
    await flush()
    expect(m.text(1, 'sel')).toBe('SELECTED')
    expect(m.text(0, 'sel')).toBe('no')
    m.unmount()
  })

  it('a data edit still re-runs only the edited row (the renderer tracking stays fine-grained)', async () => {
    const data = signal(rows(5))
    const m = mountSelectable(data)
    m.cellRuns[0] = 0
    const next = data().slice()
    next[2] = { ...next[2]!, name: 'EDITED' }
    data.set(next)
    await flush()
    expect(m.text(2, 'name')).toBe('EDITED')
    expect(m.cellRuns[0]).toBe(2)
    m.unmount()
  })
})

// ─── 2. columnSignature covers group children + renderers ───────────────────

describe('columnSignature — every column that renders is part of it', () => {
  it('a change inside a GROUP column changes the signature', () => {
    const a = [{ id: 'g', header: 'G', columns: [{ id: 'x', accessorKey: 'x' }] }]
    const b = [{ id: 'g', header: 'G', columns: [{ id: 'y', accessorKey: 'y' }] }]
    expect(columnSignature(a)).not.toBe(columnSignature(b))
  })

  it('a different cell / header renderer changes the signature', () => {
    const r1 = (i: any) => `A${i}`
    const r2 = (i: any) => `B${i}`
    expect(columnSignature([{ id: 'c', cell: r1 }])).not.toBe(columnSignature([{ id: 'c', cell: r2 }]))
    expect(columnSignature([{ id: 'c', header: () => 'x' }])).not.toBe(
      columnSignature([{ id: 'c', header: () => 'y' }]),
    )
  })

  it('an inline literal recreated with the same renderers is still the same signature', () => {
    const make = () => [{ id: 'c', accessorKey: 'c', cell: (i: any) => `v:${i.getValue()}` }]
    expect(columnSignature(make())).toBe(columnSignature(make()))
  })

  it('swapping a renderer through a signal re-renders the cells', async () => {
    const mode = signal<'a' | 'b'>('a')
    const renderA = () => 'A'
    const renderB = () => 'B'
    // STABLE data — a fresh array per options run would bump every row on its
    // own and hide whether the renderer swap was detected.
    const DATA = rows(2)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const App = () => {
      const table = useTable(() => ({
        data: DATA,
        columns: [{ id: 'c', cell: mode() === 'a' ? renderA : renderB }],
        features: allFeatures,
        getRowId: (r: Row) => String(r.id),
      }))
      return h('div', {}, () =>
        hFor({ each: () => table.getRowModel().rows, by: (r: any) => r.id }, (row: any) =>
          h('span', { class: 'cell' }, () => String(flexRenderCell(table, row.id, 'c'))),
        ),
      )
    }
    const dispose = mount(hAny(App), el)
    expect(el.querySelector('.cell')?.textContent).toBe('A')
    mode.set('b')
    await flush()
    expect(el.querySelector('.cell')?.textContent).toBe('B')
    if (typeof dispose === 'function') dispose()
    el.remove()
  })
})

// ─── 3. Scope-owned cleanup ──────────────────────────────────────────────────

describe('useTable outside a component', () => {
  it('does not warn about lifecycle hooks when created in a store / module scope', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data = signal(rows(2))
    useTable(() => ({ data: data(), columns: [{ id: 'name', accessorKey: 'name' }], features: allFeatures }))
    const lifecycleWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('onUnmount'))
    expect(lifecycleWarnings).toEqual([])
  })

  it('disposes its syncing effects with the owning EffectScope', () => {
    const scope = new EffectScope()
    const data = signal(rows(2))
    let options = 0
    const table = scope.runInScope(() =>
      useTable(() => {
        options++
        return { data: data(), columns: [{ id: 'name', accessorKey: 'name' }], features: allFeatures }
      }),
    )!
    const before = options
    scope.stop()
    data.set(rows(3))
    expect(options).toBe(before)
    expect(table).toBeDefined()
  })
})

describe('flexRenderCell — renderValue is available on the tracked context', () => {
  it('a renderer reading info.renderValue() renders the value', async () => {
    const DATA = rows(2)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const App = () => {
      const table = useTable(() => ({
        data: DATA,
        columns: [
          { id: 'name', accessorKey: 'name', cell: (i: any) => `rv:${i.renderValue()}` },
          { id: 'gv', accessorKey: 'name', cell: (i: any) => `gv:${i.getValue()}` },
        ],
        features: allFeatures,
        getRowId: (r: Row) => String(r.id),
      }))
      return h('div', {}, () =>
        hFor({ each: () => table.getRowModel().rows, by: (r: any) => r.id }, (row: any) =>
          h('span', {}, [
            h('i', { class: 'cell' }, () => String(flexRenderCell(table, row.id, 'name'))),
            h('i', { class: 'gv' }, () => String(flexRenderCell(table, row.id, 'gv'))),
            h('i', { class: 'missing' }, () => String(flexRenderCell(table, 'nope', 'gv'))),
          ]),
        ),
      )
    }
    const dispose = mount(hAny(App), el)
    expect(el.querySelector('.cell')?.textContent).toBe('rv:n0')
    expect(el.querySelector('.gv')?.textContent).toBe('gv:n0')
    expect(el.querySelector('.missing')?.textContent).toBe('null')
    if (typeof dispose === 'function') dispose()
    el.remove()
  })
})
