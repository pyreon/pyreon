// PyreonTableState behaviour assertions (Android). Byte-aligned with the TS
// state.test.ts + the Swift test: the SAME sort/filter/paginate/select results,
// so a table renders identically on web, iOS, and Android.

import com.pyreon.runtime.PyreonCell
import com.pyreon.runtime.PyreonSortDirection
import com.pyreon.runtime.PyreonTableColumn
import com.pyreon.runtime.PyreonTableState

private data class Row(val id: Int, val name: String, val age: Int)

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonTableStateTest: $msg")
}

private fun makeTable(rows: List<Row>, pageSize: Int = 0): PyreonTableState<Row> =
    PyreonTableState(
        dataProvider = { rows },
        columns = listOf(
            PyreonTableColumn("name") { PyreonCell.Str(it.name) },
            PyreonTableColumn("age") { PyreonCell.Num(it.age.toDouble()) },
        ),
        pageSize = pageSize,
        rowId = { row, _ -> row.id.toString() },
    )

fun main() {
    val seed = listOf(
        Row(1, "Ada", 36),
        Row(2, "Linus", 54),
        Row(3, "Grace", 45),
        Row(4, "alan", 41),
    )

    // 1. Sort cycles none → asc → desc → none (case-insensitive names).
    val t = makeTable(seed)
    check(t.rows().map { it.name } == listOf("Ada", "Linus", "Grace", "alan"), "unsorted order")
    t.toggleSort("name")
    check(t.sortDirection == PyreonSortDirection.ASC, "asc after first toggle")
    check(t.rows().map { it.name } == listOf("Ada", "alan", "Grace", "Linus"), "asc case-insensitive")
    t.toggleSort("name")
    check(t.rows().map { it.name } == listOf("Linus", "Grace", "alan", "Ada"), "desc")
    t.toggleSort("name")
    check(t.sortColumn == null, "none after third toggle")
    check(t.rows().map { it.id } == listOf(1, 2, 3, 4), "unsorted after cycle")

    // 2. Numbers sort numerically, not lexically.
    val nums = makeTable(listOf(Row(1, "a", 9), Row(2, "b", 100), Row(3, "c", 20)))
    nums.toggleSort("age")
    check(nums.rows().map { it.age } == listOf(9, 20, 100), "numeric sort")

    // 3. Filter case-insensitive, resets the page.
    val f = makeTable(seed, pageSize = 2)
    f.setPage(1)
    f.setFilter("a")
    check(f.page == 0, "filter resets page")
    check(f.filteredCount() == 3, "filtered count")

    // 4. Pagination slices + clamps.
    val p = makeTable(seed, pageSize = 2)
    check(p.pageCount() == 2, "page count")
    check(p.rows().map { it.id } == listOf(1, 2), "page 0")
    p.nextPage()
    check(p.rows().map { it.id } == listOf(3, 4), "page 1")
    p.nextPage()
    check(p.page == 1, "page clamps high")
    p.setPage(-5)
    check(p.page == 0, "page clamps low")

    // 5. Selection toggles by rowId.
    val s = makeTable(seed)
    check(!s.isSelected("1"), "not selected initially")
    s.toggleSelected("1")
    s.toggleSelected("3")
    check(s.selectedIds().sorted() == listOf("1", "3"), "selected ids")
    s.toggleSelected("1")
    check(!s.isSelected("1"), "deselected")
    s.clearSelection()
    check(s.selectedIds().isEmpty(), "cleared")

    println("[PyreonTableStateTest] all assertions passed")
}
