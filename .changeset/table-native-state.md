---
"@pyreon/table": minor
---

Add `createTableState` — a dependency-free, reactive table-state core: the multiplatform-portable alternative to `useTable` (which binds `@tanstack/table-core` and is web-only-rich). Pure signal logic for sort / filter / paginate / row-selection, so the same source drives a table on web AND — via native Swift/Kotlin ports (follow-up) — on iOS/Android, rendered with native `<For>` (tables ARE native). `data` is an accessor so a signal source stays reactive; `rows()` re-derives filtered → sorted → paginated; `toggleSort` cycles none → asc → desc → none; the filter is case-insensitive across every column (override with `filterFn`); selection is keyed by `rowId`. A `createTableState`-only import tree-shakes TanStack out entirely (`sideEffects: false`).
