// PyreonTableState — the iOS-native port of @pyreon/table's dependency-free
// `createTableState`. Same sort / filter / paginate / row-selection behaviour
// as the TypeScript engine, so a table author gets 1:1 results on web AND
// native from one mental model — you render `rows()` with SwiftUI (a `List` /
// `ForEach`), no WebView.
//
// Values flow through a typed `PyreonCell` (the native analogue of the TS
// `unknown` accessor return) so comparison is total + well-typed on Swift:
// numbers compare numerically, everything else as a case-insensitive string
// (matching the TS engine + its case-insensitive filter). Pure logic, no
// SwiftUI import, so it compiles + unit-tests headlessly; the `@Observable`
// binding layers on top.

import Foundation

/// A sortable/filterable cell value — the typed analogue of the TS `unknown`.
public enum PyreonCell: Equatable {
    case string(String)
    case number(Double)
    case none

    /// The lowercased string form used for filtering + string comparison.
    var text: String {
        switch self {
        case .string(let s): return s.lowercased()
        case .number(let n): return PyreonCell.numberText(n)
        case .none: return ""
        }
    }

    static func numberText(_ n: Double) -> String {
        n == n.rounded() && abs(n) < 1e15 ? String(Int64(n)) : String(n)
    }
}

public enum PyreonSortDirection: Equatable {
    case asc
    case desc
}

/// A column: an id + how to read its cell value from a row.
public struct PyreonTableColumn<T> {
    public let id: String
    public let accessor: (T) -> PyreonCell
    public init(id: String, accessor: @escaping (T) -> PyreonCell) {
        self.id = id
        self.accessor = accessor
    }
}

/// LWW-free, local table state: filter → sort → paginate over `[T]`, plus
/// multi-row selection. Behaviour-identical to the TS `createTableState`.
public final class PyreonTableState<T> {
    private let dataProvider: () -> [T]
    private let columns: [PyreonTableColumn<T>]
    private let pageSize: Int
    private let rowIdOf: (T, Int) -> String
    private let filterFn: (T, String, [PyreonTableColumn<T>]) -> Bool

    public private(set) var sortColumn: String?
    public private(set) var sortDirection: PyreonSortDirection = .asc
    public private(set) var filterValue: String = ""
    public private(set) var page: Int = 0
    public private(set) var selected: [String] = []

    public init(
        data: @escaping () -> [T],
        columns: [PyreonTableColumn<T>] = [],
        pageSize: Int = 0,
        rowId: ((T, Int) -> String)? = nil,
        filterFn: ((T, String, [PyreonTableColumn<T>]) -> Bool)? = nil
    ) {
        self.dataProvider = data
        self.columns = columns
        self.pageSize = pageSize
        self.rowIdOf = rowId ?? { _, index in String(index) }
        self.filterFn = filterFn ?? PyreonTableState.defaultFilter
    }

    // ── default filter: case-insensitive substring across every column ────────
    private static func defaultFilter(
        _ row: T, _ query: String, _ columns: [PyreonTableColumn<T>]
    ) -> Bool {
        let q = query.lowercased()
        for column in columns where column.accessor(row).text.contains(q) {
            return true
        }
        return false
    }

    // ── total comparison: numeric for numbers, else case-insensitive string ───
    private static func compare(_ a: PyreonCell, _ b: PyreonCell) -> Int {
        if a == b { return 0 }
        if case .none = a { return -1 }
        if case .none = b { return 1 }
        if case .number(let an) = a, case .number(let bn) = b {
            return an < bn ? -1 : an > bn ? 1 : 0
        }
        let at = a.text
        let bt = b.text
        return at < bt ? -1 : at > bt ? 1 : 0
    }

    // ── sorting ───────────────────────────────────────────────────────────────
    /// Cycle a column's sort: none → asc → desc → none.
    public func toggleSort(_ columnId: String) {
        if sortColumn != columnId {
            sortColumn = columnId
            sortDirection = .asc
        } else if sortDirection == .asc {
            sortDirection = .desc
        } else {
            sortColumn = nil
        }
    }

    // ── filtering ─────────────────────────────────────────────────────────────
    public func setFilter(_ query: String) {
        filterValue = query
        page = 0
    }

    // ── pagination ──────────────────────────────────────────────────────────────
    public func pageCount() -> Int {
        if pageSize <= 0 { return 1 }
        let count = filtered().count
        return count == 0 ? 1 : (count + pageSize - 1) / pageSize
    }
    private func clampPage(_ index: Int) -> Int {
        let maxPage = pageCount() - 1
        return index < 0 ? 0 : (index > maxPage ? maxPage : index)
    }
    public func setPage(_ index: Int) { page = clampPage(index) }
    public func nextPage() { page = clampPage(page + 1) }
    public func prevPage() { page = clampPage(page - 1) }

    // ── selection ────────────────────────────────────────────────────────────────
    public func isSelected(_ id: String) -> Bool { selected.contains(id) }
    public func toggleSelected(_ id: String) {
        if let i = selected.firstIndex(of: id) {
            selected.remove(at: i)
        } else {
            selected.append(id)
        }
    }
    public func clearSelection() { selected = [] }
    public func selectedIds() -> [String] { selected }
    public func rowId(_ row: T, _ index: Int) -> String { rowIdOf(row, index) }

    // ── derived ────────────────────────────────────────────────────────────────
    private func filtered() -> [T] {
        let all = dataProvider()
        if filterValue.isEmpty { return all }
        return all.filter { filterFn($0, filterValue, columns) }
    }
    private func sorted() -> [T] {
        guard let col = sortColumn else { return filtered() }
        let column = columns.first(where: { $0.id == col })
            ?? PyreonTableColumn<T>(id: col, accessor: { _ in .none })
        let dir = sortDirection == .asc ? 1 : -1
        return filtered().sorted {
            PyreonTableState.compare(column.accessor($0), column.accessor($1)) * dir < 0
        }
    }
    /// The rows for the current view: filtered → sorted → paginated.
    public func rows() -> [T] {
        let list = sorted()
        if pageSize <= 0 { return list }
        let start = page * pageSize
        if start >= list.count { return [] }
        let end = min(start + pageSize, list.count)
        return Array(list[start..<end])
    }
    /// Match count AFTER filtering, BEFORE pagination.
    public func filteredCount() -> Int { filtered().count }
}
