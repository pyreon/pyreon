package com.pyreon.runtime

import androidx.compose.runtime.mutableStateOf

// PyreonTableState — the Android-native port of @pyreon/table's dependency-free
// `createTableState`. Same sort / filter / paginate / row-selection behaviour
// as the TypeScript AND Swift engines, so a table author gets 1:1 results on
// web, iOS, and Android from one mental model — you render `rows()` with a
// Compose `LazyColumn`, no WebView.
//
// Values flow through a typed `PyreonCell` (the analogue of the TS `unknown`
// accessor return) so comparison is total + well-typed: numbers compare
// numerically, everything else as a case-insensitive string (matching the TS
// engine + its case-insensitive filter). Pure logic (no Compose import) so it
// compiles + unit-tests headlessly; the `mutableStateOf` binding layers on top.

/** A sortable/filterable cell value — the typed analogue of the TS `unknown`. */
sealed class PyreonCell {
    data class Str(val v: String) : PyreonCell()
    data class Num(val v: Double) : PyreonCell()
    object None : PyreonCell()

    /** The lowercased string form used for filtering + string comparison. */
    val text: String
        get() = when (this) {
            is Str -> v.lowercase()
            is Num -> numberText(v)
            None -> ""
        }

    companion object {
        fun numberText(n: Double): String =
            if (n == Math.rint(n) && Math.abs(n) < 1e15) n.toLong().toString() else n.toString()
    }
}

enum class PyreonSortDirection { ASC, DESC }

/** A column: an id + how to read its cell value from a row. */
class PyreonTableColumn<T>(val id: String, val accessor: (T) -> PyreonCell)

/** Local table state: filter → sort → paginate over `List<T>`, plus multi-row
 *  selection. Behaviour-identical to the TS/Swift engines. */
class PyreonTableState<T>(
    private val dataProvider: () -> List<T>,
    private val columns: List<PyreonTableColumn<T>> = emptyList(),
    private val pageSize: Int = 0,
    rowId: ((T, Int) -> String)? = null,
    filterFn: ((T, String, List<PyreonTableColumn<T>>) -> Boolean)? = null,
) {
    private val rowIdOf: (T, Int) -> String = rowId ?: { _, index -> index.toString() }
    private val filterImpl: (T, String, List<PyreonTableColumn<T>>) -> Boolean =
        filterFn ?: ::defaultFilter

    // Compose-observable state (direct mutableStateOf backing, like PyreonMachine)
    // so a mutation (toggleSort/setFilter/setPage/select) recomposes a reader.
    private val _sortColumn = mutableStateOf<String?>(null)
    val sortColumn: String?
        get() = _sortColumn.value
    private val _sortDirection = mutableStateOf(PyreonSortDirection.ASC)
    val sortDirection: PyreonSortDirection
        get() = _sortDirection.value
    private val _filterValue = mutableStateOf("")
    val filterValue: String
        get() = _filterValue.value
    private val _page = mutableStateOf(0)
    val page: Int
        get() = _page.value
    private val _selected = mutableStateOf<List<String>>(emptyList())
    val selected: List<String>
        get() = _selected.value

    // ── default filter: case-insensitive substring across every column ────────
    private fun defaultFilter(row: T, query: String, cols: List<PyreonTableColumn<T>>): Boolean {
        val q = query.lowercase()
        return cols.any { it.accessor(row).text.contains(q) }
    }

    // ── total comparison: numeric for numbers, else case-insensitive string ───
    private fun compare(a: PyreonCell, b: PyreonCell): Int {
        if (a == b) return 0
        if (a is PyreonCell.None) return -1
        if (b is PyreonCell.None) return 1
        if (a is PyreonCell.Num && b is PyreonCell.Num) return a.v.compareTo(b.v)
        return a.text.compareTo(b.text)
    }

    // ── sorting ───────────────────────────────────────────────────────────────
    /** Cycle a column's sort: none → asc → desc → none. */
    fun toggleSort(columnId: String) {
        if (sortColumn != columnId) {
            _sortColumn.value = columnId
            _sortDirection.value = PyreonSortDirection.ASC
        } else if (sortDirection == PyreonSortDirection.ASC) {
            _sortDirection.value = PyreonSortDirection.DESC
        } else {
            _sortColumn.value = null
        }
    }

    // ── filtering ─────────────────────────────────────────────────────────────
    fun setFilter(query: String) {
        _filterValue.value = query
        _page.value = 0
    }

    // ── pagination ──────────────────────────────────────────────────────────────
    fun pageCount(): Int {
        if (pageSize <= 0) return 1
        val count = filtered().size
        return if (count == 0) 1 else (count + pageSize - 1) / pageSize
    }
    private fun clampPage(index: Int): Int {
        val maxPage = pageCount() - 1
        return if (index < 0) 0 else if (index > maxPage) maxPage else index
    }
    fun setPage(index: Int) { _page.value = clampPage(index) }
    fun nextPage() { _page.value = clampPage(page + 1) }
    fun prevPage() { _page.value = clampPage(page - 1) }

    // ── selection ────────────────────────────────────────────────────────────────
    fun isSelected(id: String): Boolean = selected.contains(id)
    fun toggleSelected(id: String) {
        _selected.value = if (selected.contains(id)) selected.filter { it != id } else selected + id
    }
    fun clearSelection() { _selected.value = emptyList() }
    fun selectedIds(): List<String> = selected
    fun rowId(row: T, index: Int): String = rowIdOf(row, index)

    // ── derived ────────────────────────────────────────────────────────────────
    private fun filtered(): List<T> {
        val all = dataProvider()
        if (filterValue.isEmpty()) return all
        return all.filter { filterImpl(it, filterValue, columns) }
    }
    private fun sorted(): List<T> {
        val col = sortColumn ?: return filtered()
        val column = columns.firstOrNull { it.id == col }
            ?: PyreonTableColumn<T>(col) { PyreonCell.None }
        val dir = if (sortDirection == PyreonSortDirection.ASC) 1 else -1
        return filtered().sortedWith { a, b -> compare(column.accessor(a), column.accessor(b)) * dir }
    }
    /** The rows for the current view: filtered → sorted → paginated. */
    fun rows(): List<T> {
        val list = sorted()
        if (pageSize <= 0) return list
        val start = page * pageSize
        if (start >= list.size) return emptyList()
        return list.subList(start, minOf(start + pageSize, list.size))
    }
    /** Match count AFTER filtering, BEFORE pagination. */
    fun filteredCount(): Int = filtered().size
}
