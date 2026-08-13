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

  it('uses the default accessor (row[id]) and handles null + equal values', () => {
    const rows = [
      { id: 1, name: 'b', age: 0, score: null as number | null },
      { id: 2, name: 'a', age: 0, score: 5 },
      { id: 3, name: 'a', age: 0, score: 5 }, // equal to id 2 on both keys
    ]
    // columns WITHOUT accessors → readValue falls back to row[id]
    const t = createTableState<(typeof rows)[number]>({
      data: () => rows,
      columns: [{ id: 'name' }, { id: 'score' }],
      rowId: (r) => String(r.id),
    })
    t.toggleSort('score') // null sorts first (asc), then the equal 5s stay stable
    expect(t.rows().map((r) => r.id)).toEqual([1, 2, 3])
    t.toggleSort('score') // desc → 5, 5, null
    expect(t.rows().map((r) => r.id)).toEqual([2, 3, 1])
    t.toggleSort('name') // 'a','a','b' — equal names stable
    expect(t.rows().map((r) => r.name)).toEqual(['a', 'a', 'b'])
  })

  it('sorting a column not in `columns` is a stable no-op sort', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const t = createTableState<{ id: number }>({ data: () => rows, columns: [] })
    t.toggleSort('missing') // fallback column → every value is .none/equal → stable
    expect(t.rows().map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('works with no `columns` option (default [] + row[id] sort)', () => {
    const rows = [{ id: 3 }, { id: 1 }, { id: 2 }]
    const t = createTableState<{ id: number }>({ data: () => rows }) // no columns
    t.toggleSort('id') // fallback column, accessor reads row.id
    expect(t.rows().map((r) => r.id)).toEqual([1, 2, 3])
    expect(t.filteredCount()).toBe(3)
  })

  it('undefined/missing column values sort first (nullish handling both directions)', () => {
    const rows = [
      { id: 1, v: undefined as number | undefined },
      { id: 2, v: 5 },
      { id: 3, v: 3 },
    ]
    const t = createTableState<(typeof rows)[number]>({
      data: () => rows,
      columns: [{ id: 'v', accessor: (r) => r.v }],
      rowId: (r) => String(r.id),
    })
    t.toggleSort('v') // undefined (nullish) first, then 3, 5
    expect(t.rows().map((r) => r.id)).toEqual([1, 3, 2])
    t.toggleSort('v') // desc → 5, 3, undefined
    expect(t.rows().map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('a number vs a string value falls to case-insensitive string compare', () => {
    const rows = [
      { id: 1, v: 5 as number | string },
      { id: 2, v: 'apple' },
    ]
    const t = createTableState<(typeof rows)[number]>({
      data: () => rows,
      columns: [{ id: 'v' }],
      rowId: (r) => String(r.id),
    })
    t.toggleSort('v') // 5 vs 'apple' → not both numbers → '5' < 'apple' → 5 first
    expect(t.rows().map((r) => String(r.v))).toEqual(['5', 'apple'])
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
    expect(t.filterValue()).toBe('a')
    expect(t.page()).toBe(0) // reset
    expect(t.filteredCount()).toBe(3)
    expect(new Set(t.rows().map((r) => r.name))).toEqual(new Set(['Ada', 'Grace'])) // page 0, size 2
  })

  it('default filter skips null column values without matching them', () => {
    const rows = [
      { id: 1, name: null as string | null },
      { id: 2, name: 'apple' },
    ]
    const t = createTableState<(typeof rows)[number]>({
      data: () => rows,
      columns: [{ id: 'name' }],
      rowId: (r) => String(r.id),
    })
    t.setFilter('app') // the null-name row must not throw or match
    expect(t.rows().map((r) => r.id)).toEqual([2])
  })

  it('pageCount is 1 when the filter matches nothing', () => {
    const t = makeTable(seed, { pageSize: 2 })
    t.setFilter('zzz') // no matches
    expect(t.filteredCount()).toBe(0)
    expect(t.pageCount()).toBe(1)
    expect(t.rows()).toEqual([])
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
