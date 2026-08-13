// PyreonTableState behaviour assertions (iOS). Byte-aligned with the TS
// state.test.ts + the Kotlin test: the SAME sort/filter/paginate/select
// results, so a table renders identically on web, iOS, and Android.

import Foundation

struct Row {
    let id: Int
    let name: String
    let age: Int
}

@main
struct PyreonTableStateTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonTableStateTests: \(m)") }
    }

    static func makeTable(_ rows: [Row], pageSize: Int = 0) -> PyreonTableState<Row> {
        PyreonTableState(
            data: { rows },
            columns: [
                PyreonTableColumn(id: "name", accessor: { .string($0.name) }),
                PyreonTableColumn(id: "age", accessor: { .number(Double($0.age)) }),
            ],
            pageSize: pageSize,
            rowId: { row, _ in String(row.id) }
        )
    }

    static func main() {
        let seed = [
            Row(id: 1, name: "Ada", age: 36),
            Row(id: 2, name: "Linus", age: 54),
            Row(id: 3, name: "Grace", age: 45),
            Row(id: 4, name: "alan", age: 41),
        ]

        // 1. Sort cycles none → asc → desc → none (case-insensitive names).
        let t = makeTable(seed)
        check(t.rows().map { $0.name } == ["Ada", "Linus", "Grace", "alan"], "unsorted order")
        t.toggleSort("name")
        check(t.sortDirection == .asc, "asc after first toggle")
        check(t.rows().map { $0.name } == ["Ada", "alan", "Grace", "Linus"], "asc case-insensitive")
        t.toggleSort("name")
        check(t.rows().map { $0.name } == ["Linus", "Grace", "alan", "Ada"], "desc")
        t.toggleSort("name")
        check(t.sortColumn == nil, "none after third toggle")
        check(t.rows().map { $0.id } == [1, 2, 3, 4], "unsorted after cycle")

        // 2. Numbers sort numerically, not lexically.
        let nums = makeTable([
            Row(id: 1, name: "a", age: 9),
            Row(id: 2, name: "b", age: 100),
            Row(id: 3, name: "c", age: 20),
        ])
        nums.toggleSort("age")
        check(nums.rows().map { $0.age } == [9, 20, 100], "numeric sort")

        // 3. Filter case-insensitive, resets the page.
        let f = makeTable(seed, pageSize: 2)
        f.setPage(1)
        f.setFilter("a") // Ada, Grace, alan
        check(f.page == 0, "filter resets page")
        check(f.filteredCount() == 3, "filtered count")

        // 4. Pagination slices + clamps.
        let p = makeTable(seed, pageSize: 2)
        check(p.pageCount() == 2, "page count")
        check(p.rows().map { $0.id } == [1, 2], "page 0")
        p.nextPage()
        check(p.rows().map { $0.id } == [3, 4], "page 1")
        p.nextPage() // clamp
        check(p.page == 1, "page clamps high")
        p.setPage(-5)
        check(p.page == 0, "page clamps low")

        // 5. Selection toggles by rowId.
        let s = makeTable(seed)
        check(!s.isSelected("1"), "not selected initially")
        s.toggleSelected("1")
        s.toggleSelected("3")
        check(s.selectedIds().sorted() == ["1", "3"], "selected ids")
        s.toggleSelected("1")
        check(!s.isSelected("1"), "deselected")
        s.clearSelection()
        check(s.selectedIds().isEmpty, "cleared")

        print("[PyreonTableStateTests] all assertions passed")
    }
}
