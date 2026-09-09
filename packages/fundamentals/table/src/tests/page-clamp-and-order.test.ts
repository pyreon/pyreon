import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { createTableState } from '../state'

// Two properties a paginated, sortable table has to hold no matter what the
// data underneath it does.

describe('the page never falls off the end of the data', () => {
  const make = (n: number) => {
    const rows = signal(Array.from({ length: n }, (_, i) => ({ id: i, name: `row-${i}` })))
    const table = createTableState({
      data: () => rows(),
      columns: [{ id: 'name' }],
      pageSize: 10,
      rowId: (r) => String(r.id),
    })
    return { rows, table }
  }

  it('a data shrink does not blank the table', () => {
    // `setFilter` resets to page 0, but nothing else does — and a filter is not
    // the only way the row set gets smaller. Deleting rows, or a refetch that
    // returns fewer, left the raw page pointing past the end: `rows()` sliced
    // an empty window and the table rendered nothing at all.
    const { rows, table } = make(25)
    table.setPage(2)
    expect(table.rows().length).toBe(5)

    rows.set(rows().slice(0, 12)) // 3 pages → 2

    expect(table.pageCount()).toBe(2)
    expect(table.page(), 'page reported past the last page').toBe(1)
    expect(table.rows().length, 'the table went blank after a shrink').toBe(2)
    expect(table.rows()[0]?.id).toBe(10)
  })

  it('shrinking to empty settles on page 0, not a negative page', () => {
    const { rows, table } = make(25)
    table.setPage(2)
    rows.set([])
    expect(table.pageCount()).toBe(1)
    expect(table.page()).toBe(0)
    expect(table.rows()).toEqual([])
  })

  it('a transient shrink restores the reader to where they were', () => {
    // The deliberate consequence of DERIVING the page rather than writing the
    // signal back: a filter typed and cleared, or a refetch that briefly
    // returns less, does not silently strand the reader on the last page.
    const { rows, table } = make(25)
    table.setPage(2)
    const all = rows()
    rows.set(all.slice(0, 5))
    expect(table.page()).toBe(0)
    rows.set(all)
    expect(table.page(), 'the reader lost their place across a transient shrink').toBe(2)
  })

  it('paging from a stale page steps from where the reader actually is', () => {
    const { rows, table } = make(25)
    table.setPage(2)
    rows.set(rows().slice(0, 12)) // effective page is now 1
    table.prevPage()
    expect(table.page()).toBe(0)
  })
})

describe('empty cells sort as one rank', () => {
  it('null and undefined do not reorder against each other', () => {
    // Ranking `null` above `undefined` made the comparator answer -1 to BOTH
    // `cmp(null, undefined)` and `cmp(undefined, null)` — each hits the same
    // `a == null` arm. A sort given a comparator that claims two rows each
    // precede the other is free to reorder them, so rows with empty cells
    // shuffled for no reason and the result depended on their input positions.
    const rows = signal<{ v: unknown }[]>([{ v: null }, { v: undefined }, { v: 1 }])
    const table = createTableState({ data: () => rows(), columns: [{ id: 'v' }] })
    table.toggleSort('v')

    expect(table.rows().map((r) => r.v)).toEqual([null, undefined, 1])

    // The same multiset in the other order keeps ITS order: they are tied, and
    // a stable sort leaves tied rows alone.
    rows.set([{ v: undefined }, { v: null }, { v: 1 }])
    expect(table.rows().map((r) => r.v)).toEqual([undefined, null, 1])
  })

  it('empty cells stay contiguous among many rows', () => {
    const input = [
      { v: undefined },
      { v: undefined },
      { v: null },
      { v: 2 },
      { v: 1 },
      { v: undefined },
      { v: null },
    ]
    const rows = signal<{ v: unknown }[]>(input)
    const table = createTableState({ data: () => rows(), columns: [{ id: 'v' }] })
    table.toggleSort('v')

    const out = table.rows().map((r) => r.v)
    expect(out.slice(0, 5), 'the empty block was reordered').toEqual([
      undefined,
      undefined,
      null,
      undefined,
      null,
    ])
    expect(out.slice(5)).toEqual([1, 2])
  })
})
