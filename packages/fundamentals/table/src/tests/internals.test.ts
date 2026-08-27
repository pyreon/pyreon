/**
 * Branch-level contracts for two internals the v9 migration introduced whose
 * failure modes are silent rather than loud.
 *
 * `columnSignature` decides whether a column list "changed". Get it wrong in
 * one direction and every data edit coarse-invalidates the whole table
 * (fine-grained updates gone, still visually correct); get it wrong in the
 * other and a real column change renders stale cells. Neither throws.
 *
 * `flexRenderCell`'s degradation paths are the same shape: a missing row, a
 * missing cell, or a feature set without column visibility must return `null`
 * or fall back — never throw into a render.
 */
import type { RowData, Table, TableFeatures } from '@tanstack/table-core'
import { describe, expect, it } from 'vitest'
import { flexRenderCell } from '../flex-render'
import { columnSignature } from '../use-table'

describe('columnSignature', () => {
  it('returns an empty key for an absent column list', () => {
    expect(columnSignature(undefined)).toBe('')
  })

  it('returns an empty key for an empty list', () => {
    expect(columnSignature([])).toBe('')
  })

  it('is STABLE across two structurally identical inline literals', () => {
    // The whole reason the signature exists: an inline `columns: [...]` in the
    // options function is a fresh array on every run, so an identity check
    // reports "columns changed" on every data edit.
    const a = [{ accessorKey: 'name', header: 'Name' }]
    const b = [{ accessorKey: 'name', header: 'Name' }]
    expect(a).not.toBe(b)
    expect(columnSignature(a)).toBe(columnSignature(b))
  })

  it('distinguishes a renamed header', () => {
    expect(columnSignature([{ accessorKey: 'name', header: 'Name' }])).not.toBe(
      columnSignature([{ accessorKey: 'name', header: 'Full name' }]),
    )
  })

  it('distinguishes reordered columns', () => {
    const cols = [{ accessorKey: 'a' }, { accessorKey: 'b' }]
    expect(columnSignature(cols)).not.toBe(columnSignature([...cols].reverse()))
  })

  it('tolerates a column with NO id and NO accessorKey', () => {
    // A display column (`{ header, cell }`) has neither. It must contribute a
    // slot rather than throw or collapse into its neighbour.
    expect(() => columnSignature([{ header: 'Actions' }])).not.toThrow()
    expect(columnSignature([{ header: 'Actions' }])).not.toBe(columnSignature([]))
  })

  it('accepts a NUMERIC accessorKey (tuple-shaped rows)', () => {
    expect(columnSignature([{ accessorKey: 0 }])).not.toBe(columnSignature([{ accessorKey: 1 }]))
  })

  it('ignores a NON-STRING header rather than stringifying it', () => {
    // A function/JSX header has no stable string form — `String(fn)` would
    // embed the source text and churn the signature on every re-render.
    const fnHeader = columnSignature([{ accessorKey: 'a', header: () => 'X' }])
    const otherFn = columnSignature([{ accessorKey: 'a', header: () => 'Y' }])
    expect(fnHeader).toBe(otherFn)
  })

  it('does not let adjacent columns bleed into one another', () => {
    // Fields are NUL-separated, so `id: 'ab'` + `id: ''` must not collide with
    // `id: 'a'` + `id: 'b'`.
    expect(columnSignature([{ id: 'ab' }, { id: '' }])).not.toBe(
      columnSignature([{ id: 'a' }, { id: 'b' }]),
    )
  })
})

/** Minimal table stub — `flexRenderCell` only reaches `getRowModel()`. */
function stubTable(rowsById: Record<string, unknown>): Table<TableFeatures, RowData> {
  return { getRowModel: () => ({ rowsById }) } as unknown as Table<TableFeatures, RowData>
}

const cell = (columnId: string, value: string): unknown => ({
  column: { id: columnId, columnDef: { cell: () => value } },
  getContext: () => ({}),
})

describe('flexRenderCell — degradation', () => {
  it('falls back to getAllCells when the feature set has no column visibility', () => {
    // `getVisibleCells` only exists once the visibility feature is registered.
    // Without the fallback, a table built from a minimal feature set throws
    // "getVisibleCells is not a function" mid-render.
    const row = { getAllCells: () => [cell('c1', 'FALLBACK')] }
    expect(flexRenderCell(stubTable({ r1: row }), 'r1', 'c1')).toBe('FALLBACK')
  })

  it('prefers getVisibleCells when the feature IS present', () => {
    const row = {
      getVisibleCells: () => [cell('c1', 'VISIBLE')],
      getAllCells: () => [cell('c1', 'ALL')],
    }
    expect(flexRenderCell(stubTable({ r1: row }), 'r1', 'c1')).toBe('VISIBLE')
  })

  it('uses the O(1) getVisibleCellsByColumnId map, not an O(C) cell scan', () => {
    // table-core v9 memoizes a by-id map with the same visible-column filter as
    // getVisibleCells. When it is present, `renderCell` must do an O(1) lookup
    // and NEVER scan the cell array. If it fell back to a `.find` over
    // getVisibleCells, this row's throwing scans would fire.
    const row = {
      getVisibleCellsByColumnId: () => ({ c1: cell('c1', 'BY_ID') }),
      getVisibleCells: () => {
        throw new Error('should not scan getVisibleCells when the by-id map exists')
      },
      getAllCells: () => {
        throw new Error('should not scan getAllCells when the by-id map exists')
      },
    }
    // Bisect: the pre-fix `renderCell` calls getVisibleCells().find(...) → throws.
    expect(flexRenderCell(stubTable({ r1: row }), 'r1', 'c1')).toBe('BY_ID')
  })

  it('returns null for an unknown row id', () => {
    expect(flexRenderCell(stubTable({}), 'missing', 'c1')).toBeNull()
  })

  it('returns null for an unknown column id', () => {
    const row = { getAllCells: () => [cell('c1', 'X')] }
    expect(flexRenderCell(stubTable({ r1: row }), 'r1', 'nope')).toBeNull()
  })
})
