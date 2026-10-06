/**
 * The compile-gate stubs the `@pyreon/table` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the
 * `PyreonTableState` engine a `createTableState` declaration emits and the cell / column / sort types it takes.
 * They mirror the REAL runtimes (`@pyreon/table/native`) exactly — a superset stub masks real breakage, a narrower
 * one manufactures it.
 *
 * Appended to the bundle only for an emit that names the engine (see {@link tableStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const TABLE_SWIFT_STUBS = `// @pyreon/table — the PyreonTableState engine. Mirrors PyreonTableState.swift.
public enum PyreonCell { case string(String); case number(Double); case none }
public enum PyreonSortDirection { case asc, desc }
public struct PyreonTableColumn<T> {
  public init(id: String, accessor: @escaping (T) -> PyreonCell) {}
}
public final class PyreonTableState<T> {
  public init(data: (() -> [T])? = nil, columns: [PyreonTableColumn<T>] = [], pageSize: Int = 0, rowId: ((T, Int) -> String)? = nil, filterFn: ((T, String, [PyreonTableColumn<T>]) -> Bool)? = nil) {}
  public func setData(_ data: @escaping () -> [T]) {}
  public func rows() -> [T] { [] }
  public func pageCount() -> Int { 1 }
  public func filteredCount() -> Int { 0 }
  public func selectedIds() -> [String] { [] }
  public func toggleSort(_ c: String) {}
  public func setFilter(_ q: String) {}
  public func setPage(_ i: Int) {}
  public func nextPage() {}
  public func prevPage() {}
  public func isSelected(_ id: String) -> Bool { false }
  public func toggleSelected(_ id: String) {}
  public func clearSelection() {}
  public func rowId(_ row: T, _ index: Int) -> String { "" }
  public private(set) var page: Int = 0
  public private(set) var sortColumn: String?
  public private(set) var sortDirection: PyreonSortDirection = .asc
  public private(set) var filterValue: String = ""
  public private(set) var selected: [String] = []
}
`

export const TABLE_KOTLIN_STUBS = `// @pyreon/table — the PyreonTableState engine. Mirrors PyreonTableState.kt.
sealed class PyreonCell {
  data class Str(val v: String) : PyreonCell()
  data class Num(val v: Double) : PyreonCell()
  object None : PyreonCell()
}
class PyreonTableColumn<T>(val id: String, val accessor: (T) -> PyreonCell)
class PyreonTableState<T>(
  dataProvider: () -> List<T>,
  columns: List<PyreonTableColumn<T>> = emptyList(),
  pageSize: Long = 0L,
  rowId: ((T, Long) -> String)? = null,
  filterFn: ((T, String, List<PyreonTableColumn<T>>) -> Boolean)? = null,
) {
  fun rows(): List<T> = emptyList()
  fun pageCount(): Long = 1L
  fun filteredCount(): Long = 0L
  fun selectedIds(): List<String> = emptyList()
  fun toggleSort(c: String) {}
  fun setFilter(q: String) {}
  fun setPage(i: Long) {}
  fun nextPage() {}
  fun prevPage() {}
  fun isSelected(id: String): Boolean = false
  fun toggleSelected(id: String) {}
  fun clearSelection() {}
  fun rowId(row: T, index: Long): String = ""
  val page: Long get() = 0L
  val sortColumn: String? get() = null
  val sortDirection: String get() = "asc"
  val filterValue: String get() = ""
  val selected: List<String> get() = emptyList()
}
`

/** The `PyreonTableState` compile-gate stubs, appended only to an emit that names the engine. */
export const tableStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonTable(?:State|Column)\b/.test(source) ? TABLE_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreonTable(?:State|Column)\b/.test(source) ? TABLE_KOTLIN_STUBS : ''),
}
