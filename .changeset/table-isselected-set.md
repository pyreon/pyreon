---
"@pyreon/table": patch
---

perf(table): make `isSelected` O(1) instead of an O(k) per-row scan

`createTableState`'s `isSelected(id)` was `selected().includes(id)` — an O(k)
linear scan of the selected-ids array. It's the per-row selection-checkbox
predicate (called once per rendered row inside a reactive scope), so with k rows
selected it cost O(N·k) per selection change, and O(N²) under a select-all over
N rendered rows.

It now reads a lazily-derived `Set` (`computed(() => new Set(selected()))`): the
Set rebuilds O(k) once per selection change (a rare gesture) and each read is
O(1) via `Set.has`. Same booleans, same reactivity (the Set is a computed
derived from `selected()`). This is the pure-signal, native-portable
`createTableState` — it does NOT touch the `@tanstack/table-core` seam.

Bisect-verified with an operation-count lock: reading the predicate once for each
of 200 selected rows makes ZERO `Array.includes` calls (Set-backed); the old
`.includes` form makes one per read (200).
