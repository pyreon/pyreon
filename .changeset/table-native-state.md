---
"@pyreon/table": minor
---

Add `createTableState` — a dependency-free, reactive table-state core, plus co-located native Swift/Kotlin ports (`PyreonTableState`): the multiplatform-portable alternative to `useTable` (which binds `@tanstack/table-core` and is web-only-rich).

Pure signal logic for sort / filter / paginate / row-selection, so the same behaviour runs on web AND — via the native ports — on iOS/Android, where you render `rows()` with native `<For>` (tables ARE native: SwiftUI `List` / Compose `LazyColumn`), no WebView. `data` is an accessor so a signal source stays reactive; `rows()` re-derives filtered → sorted → paginated; `toggleSort` cycles none → asc → desc → none; the filter is case-insensitive across every column (override with `filterFn`); selection is keyed by `rowId`. A `createTableState`-only import tree-shakes TanStack out entirely (`sideEffects: false`).

The native ports are behaviour-identical to the TS engine (same sort/filter/paginate/select results) and are compile-and-run verified by the co-source gate (`swiftc` + `kotlinc` compile the runtime and run the assertion tests).
