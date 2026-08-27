// A lightweight, dependency-free, reactive table-state core — the
// MULTIPLATFORM-portable alternative to `useTable` (which binds
// `@tanstack/table-core` and is web-only-rich).
//
// This is pure signal logic (no DOM, no npm table lib), so the SAME source
// runs on web AND — via PMTC — on iOS/Android: it drives sort / filter /
// paginate / row-selection over your data, and you render the resulting
// `rows()` with native `<For>` (tables ARE native — SwiftUI List / Compose
// LazyColumn). No WebView needed for the common table.
//
// Scope is the 80% every app needs: single-column sort (toggle asc → desc →
// none), a global text filter (per-column via `filterValue`), fixed-page
// pagination, and multi-row selection. Grouping / faceting / column pinning /
// virtual sizing stay on the full `useTable` (TanStack) web path.

import { computed, signal } from '@pyreon/reactivity'

/** A column: an id + how to read its value from a row (for sort + filter). */
export interface TableColumn<T> {
  /** Stable column id (what `toggleSort`/`sortColumn` use). */
  id: string
  /** Read the sortable/filterable value from a row. Defaults to `row[id]`. */
  accessor?: (row: T) => unknown
}

export type SortDirection = 'asc' | 'desc'

export interface TableStateOptions<T> {
  /** The rows — an ACCESSOR so a `signal()`/`computed()` source stays reactive. */
  data: () => readonly T[]
  /** Columns (optional). Sorting/filtering falls back to `row[columnId]` when omitted. */
  columns?: readonly TableColumn<T>[]
  /** Rows per page. `0` (default) disables pagination — `rows()` returns all matches. */
  pageSize?: number
  /** Stable row id for selection. Defaults to the row's index (as a string). */
  rowId?: (row: T, index: number) => string
  /** Custom filter predicate. Default: case-insensitive substring over every column value. */
  filterFn?: (row: T, query: string, columns: readonly TableColumn<T>[]) => boolean
}

export interface TableState<T> {
  // ── sorting ──────────────────────────────────────────────────────────────
  /** The sorted column id, or `null` when unsorted. */
  sortColumn: () => string | null
  /** The active sort direction (meaningful only when `sortColumn()` is non-null). */
  sortDirection: () => SortDirection
  /** Cycle a column's sort: none → asc → desc → none. */
  toggleSort(columnId: string): void

  // ── filtering ────────────────────────────────────────────────────────────
  /** The current filter query. */
  filterValue: () => string
  /** Set the filter query (resets to page 0). */
  setFilter(query: string): void

  // ── pagination ─────────────────────────────────────────────────────────────
  /** The current 0-based page. */
  page: () => number
  /** Total pages for the current filtered set (>= 1; always 1 when pagination is off). */
  pageCount: () => number
  /** Go to a page (clamped to `[0, pageCount()-1]`). */
  setPage(index: number): void
  /** Next page (clamped). */
  nextPage(): void
  /** Previous page (clamped). */
  prevPage(): void

  // ── selection ──────────────────────────────────────────────────────────────
  /** Is a row selected (by its `rowId`)? */
  isSelected(id: string): boolean
  /** Toggle a row's selection. */
  toggleSelected(id: string): void
  /** Clear all selection. */
  clearSelection(): void
  /** The selected row ids. */
  selectedIds: () => string[]
  /** Compute a row's stable id (the same one `isSelected`/`toggleSelected` key on). */
  rowId(row: T, index: number): string

  // ── derived (reactive) ──────────────────────────────────────────────────────
  /** The rows for the current view: filtered → sorted → paginated. */
  rows: () => T[]
  /** Match count AFTER filtering, BEFORE pagination (for "N of M" UIs). */
  filteredCount: () => number
}

/** Default accessor: read `row[column.id]`. */
const readValue = <T,>(row: T, column: TableColumn<T>): unknown =>
  column.accessor ? column.accessor(row) : (row as Record<string, unknown>)[column.id]

/** Default filter: case-insensitive substring across every column's value. */
const defaultFilter = <T,>(row: T, query: string, columns: readonly TableColumn<T>[]): boolean => {
  const q = query.toLowerCase()
  for (const column of columns) {
    const value = readValue(row, column)
    if (value != null && String(value).toLowerCase().includes(q)) return true
  }
  return false
}

/**
 * Stable, total comparison for mixed scalar values: numbers compare
 * numerically, everything else as a case-insensitive string (matching the
 * case-insensitive filter, and what users expect when sorting names).
 */
const compareValues = (a: unknown, b: unknown): number => {
  if (a === b) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const as = String(a).toLowerCase()
  const bs = String(b).toLowerCase()
  return as < bs ? -1 : as > bs ? 1 : 0
}

/**
 * Create a reactive, dependency-free table-state. Pure signal logic — runs
 * identically on web and (via PMTC) on native; render `rows()` with `<For>`.
 *
 * @example
 * ```ts
 * const data = signal([{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }])
 * const table = createTableState({
 *   data: () => data(),
 *   columns: [{ id: 'name' }],
 *   pageSize: 10,
 *   rowId: (r) => String(r.id),
 * })
 * table.toggleSort('name')      // asc
 * table.setFilter('li')         // → [{ id: 2, name: 'Linus' }]
 * // <For each={table.rows()} by={(r) => r.id}>…</For>
 * ```
 */
export function createTableState<T>(options: TableStateOptions<T>): TableState<T> {
  const pageSize = options.pageSize ?? 0
  const columns = options.columns ?? []
  const rowIdOf = options.rowId ?? ((_row: T, index: number): string => String(index))
  const filterFn = options.filterFn ?? defaultFilter

  const sortColumn = signal<string | null>(null)
  const sortDirection = signal<SortDirection>('asc')
  const filterValue = signal('')
  const page = signal(0)
  const selected = signal<readonly string[]>([])
  // Membership-test backing for `isSelected` — a lazy Set derived from
  // `selected()`. `isSelected` is the per-row selection predicate (called once
  // per rendered row inside a reactive scope); a raw `selected().includes(id)`
  // is O(k) per row → O(N·k) per selection change (O(N²) under select-all).
  // The Set rebuilds O(k) once per selection change (a rare gesture) and each
  // `isSelected` read becomes O(1). Same booleans, same reactivity (reads a
  // computed derived from `selected()`).
  const selectedSet = computed(() => new Set(selected()))

  // filtered → sorted (paginated is derived separately so pageCount can read it)
  const filtered = computed(() => {
    const q = filterValue()
    const all = options.data()
    if (q === '') return all.slice()
    return all.filter((row) => filterFn(row, q, columns))
  })

  const sorted = computed(() => {
    const col = sortColumn()
    const list = filtered().slice()
    if (col === null) return list
    const column = columns.find((c) => c.id === col) ?? { id: col }
    const dir = sortDirection() === 'asc' ? 1 : -1
    return list.sort((a, b) => compareValues(readValue(a, column), readValue(b, column)) * dir)
  })

  const pageCount = computed(() => {
    if (pageSize <= 0) return 1
    const count = filtered().length
    return count === 0 ? 1 : Math.ceil(count / pageSize)
  })

  const rows = computed(() => {
    const list = sorted()
    if (pageSize <= 0) return list
    const start = page() * pageSize
    return list.slice(start, start + pageSize)
  })

  const clampPage = (index: number): number => {
    const max = pageCount() - 1
    return index < 0 ? 0 : index > max ? max : index
  }

  return {
    sortColumn: () => sortColumn(),
    sortDirection: () => sortDirection(),
    toggleSort(columnId) {
      if (sortColumn() !== columnId) {
        sortColumn.set(columnId)
        sortDirection.set('asc')
      } else if (sortDirection() === 'asc') {
        sortDirection.set('desc')
      } else {
        sortColumn.set(null) // desc → none
      }
    },

    filterValue: () => filterValue(),
    setFilter(query) {
      filterValue.set(query)
      page.set(0) // a new filter can shrink the set — start at the first page
    },

    page: () => page(),
    pageCount: () => pageCount(),
    setPage(index) {
      page.set(clampPage(index))
    },
    nextPage() {
      page.set(clampPage(page() + 1))
    },
    prevPage() {
      page.set(clampPage(page() - 1))
    },

    isSelected: (id) => selectedSet().has(id),
    toggleSelected(id) {
      const current = selected()
      selected.set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
    },
    clearSelection() {
      selected.set([])
    },
    selectedIds: () => selected().slice(),
    rowId: (row, index) => rowIdOf(row, index),

    rows: () => rows(),
    filteredCount: () => filtered().length,
  }
}
