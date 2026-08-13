// Contract tests for the dependency-free, native-portable table-state core.
// These prove the sort/filter/paginate/select behaviour a native peer runs
// verbatim (via PMTC) — pure signal logic, no DOM, no TanStack.

import { describe, expect, it } from 'vitest'
import { effect, signal } from '@pyreon/reactivity'
import { createTableState } from '../state'

type Row = { id: number; name: string; age: number }
const seed: Row[] = [
  { id: 1, name: 'Ada', age: 36 },
  { id: 2, name: 'Linus', age: 54 },
  { id: 3, name: 'Grace', age: 45 },
  { id: 4, name: 'alan', age: 41 },
]

const makeTable = (rows = seed, opts = {}) =>
  createTableState<Row>({
    data: () => rows,
    columns: [{ id: 'name' }, { id: 'age' }],
    rowId: (r) => String(r.id),
    ...opts,
  })

describe('createTableState — sorting', () => {
  it('toggles none → asc → desc → none, sorting rows()', () => {
    const t = makeTable()
    expect(t.rows().map((r) => r.name)).toEqual(['Ada', 'Linus', 'Grace', 'alan']) // unsorted

    t.toggleSort('name') // asc (case-insensitive string compare)
    expect(t.sortColumn()).toBe('name')
    expect(t.sortDirection()).toBe('asc')
    expect(t.rows().map((r) => r.name)).toEqual(['Ada', 'alan', 'Grace', 'Linus'])

    t.toggleSort('name') // desc
    expect(t.sortDirection()).toBe('desc')
    expect(t.rows().map((r) => r.name)).toEqual(['Linus', 'Grace', 'alan', 'Ada'])

    t.toggleSort('name') // none
    expect(t.sortColumn()).toBeNull()
    expect(t.rows().map((r) => r.id)).toEqual([1, 2, 3, 4])
  })

  it('sorts numbers numerically, not lexically', () => {
    const t = makeTable([
      { id: 1, name: 'a', age: 9 },
      { id: 2, name: 'b', age: 100 },
      { id: 3, name: 'c', age: 20 },
    ])
    t.toggleSort('age')
    expect(t.rows().map((r) => r.age)).toEqual([9, 20, 100]) // NOT [100, 20, 9]
  })

  it('switching column resets to asc', () => {
    const t = makeTable()
    t.toggleSort('name')
    t.toggleSort('name') // desc
    t.toggleSort('age') // new column → asc
    expect(t.sortColumn()).toBe('age')
    expect(t.sortDirection()).toBe('asc')
  })

  it('does not mutate the source data array', () => {
    const rows = seed.slice()
    const t = createTableState<Row>({ data: () => rows, columns: [{ id: 'name' }] })
    t.toggleSort('name')
    void t.rows()
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4]) // source untouched
  })
})

describe('createTableState — filtering', () => {
  it('filters case-insensitively across all columns and resets page', () => {
    const t = makeTable(seed, { pageSize: 2 })
    t.setPage(1)
    t.setFilter('a') // Ada, Grace, alan (name contains a)
    expect(t.page()).toBe(0) // reset
    expect(t.filteredCount()).toBe(3)
    expect(new Set(t.rows().map((r) => r.name))).toEqual(new Set(['Ada', 'Grace'])) // page 0, size 2
  })

  it('empty filter returns everything', () => {
    const t = makeTable()
    t.setFilter('x')
    expect(t.filteredCount()).toBe(0)
    t.setFilter('')
    expect(t.filteredCount()).toBe(4)
  })

  it('honours a custom filterFn', () => {
    const t = createTableState<Row>({
      data: () => seed,
      columns: [{ id: 'name' }],
      filterFn: (row, q) => row.age >= Number(q),
    })
    t.setFilter('45')
    expect(t.rows().map((r) => r.name).sort()).toEqual(['Grace', 'Linus'])
  })
})

describe('createTableState — pagination', () => {
  it('slices to pageSize and clamps navigation', () => {
    const t = makeTable(seed, { pageSize: 2 })
    expect(t.pageCount()).toBe(2)
    expect(t.rows().map((r) => r.id)).toEqual([1, 2])
    t.nextPage()
    expect(t.rows().map((r) => r.id)).toEqual([3, 4])
    t.nextPage() // clamp
    expect(t.page()).toBe(1)
    t.prevPage()
    t.prevPage() // clamp
    expect(t.page()).toBe(0)
  })

  it('pageSize 0 disables pagination (pageCount 1, all rows)', () => {
    const t = makeTable(seed, { pageSize: 0 })
    expect(t.pageCount()).toBe(1)
    expect(t.rows()).toHaveLength(4)
  })

  it('setPage clamps out-of-range', () => {
    const t = makeTable(seed, { pageSize: 2 })
    t.setPage(99)
    expect(t.page()).toBe(1)
    t.setPage(-5)
    expect(t.page()).toBe(0)
  })
})

describe('createTableState — selection', () => {
  it('toggles rows and reports selection by rowId', () => {
    const t = makeTable()
    expect(t.isSelected('1')).toBe(false)
    t.toggleSelected('1')
    t.toggleSelected('3')
    expect(t.isSelected('1')).toBe(true)
    expect(t.selectedIds().sort()).toEqual(['1', '3'])
    t.toggleSelected('1') // off
    expect(t.isSelected('1')).toBe(false)
    t.clearSelection()
    expect(t.selectedIds()).toEqual([])
  })

  it('rowId computes the id isSelected keys on', () => {
    const t = makeTable()
    const row = t.rows()[1]!
    const id = t.rowId(row, 1)
    t.toggleSelected(id)
    expect(t.isSelected(t.rowId(row, 1))).toBe(true)
  })

  it('defaults rowId to the index', () => {
    const t = createTableState<Row>({ data: () => seed, columns: [{ id: 'name' }] })
    expect(t.rowId(seed[2]!, 2)).toBe('2')
  })
})

describe('createTableState — reactivity', () => {
  it('rows() re-derives when the data signal changes', () => {
    const data = signal(seed.slice(0, 2))
    const t = createTableState<Row>({ data: () => data(), columns: [{ id: 'name' }] })
    const seen: number[] = []
    effect(() => { seen.push(t.rows().length) })
    expect(seen).toEqual([2])
    data.set(seed) // grow
    expect(seen).toEqual([2, 4])
  })

  it('rows() re-derives on sort/filter/page changes', () => {
    const t = makeTable(seed, { pageSize: 2 })
    const ids: number[][] = []
    effect(() => { ids.push(t.rows().map((r) => r.id)) })
    t.toggleSort('name')
    t.nextPage()
    expect(ids.length).toBeGreaterThanOrEqual(3) // initial + sort + page
    expect(ids.at(-1)).toEqual([3, 2]) // Grace(3), Linus(2) on page 1 after case-insensitive asc name sort
  })
})
