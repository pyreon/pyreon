---
'@pyreon/table': minor
---

Add `flexRenderCell` for fine-grained per-cell updates. Inside a keyed `<For>`, the
captured `cell` freezes on an in-place value change (the reconciler reuses the DOM node
and never re-runs the cell body); `flexRenderCell(table, row.id, cell.column.id)` inside an
accessor re-navigates to the live cell each read. Passing the `table` **accessor** (not
`table()`) makes the cell subscribe to only its own row's version signal, so an in-place
data edit re-runs just the changed rows' cells — matching a hand-`React.memo`'d
`@tanstack/react-table` row with zero memoization boilerplate.

`useTable` now maintains per-row version signals under the hood (additive; the returned
`Computed<Table>` is unchanged). A no-op TanStack auto-reset `onStateChange` on a data
change is distinguished from a real state change via a value comparison, so the fine-grained
path isn't defeated by spurious re-emits.

Adds a benchmark suite (`bench:table` deterministic re-render/DOM-write counts, and
`bench:table:wall` wall-clock) vs `@tanstack/react-table` — both wrap the same
`@tanstack/table-core@8.21.3`. Single-cell edit re-runs 6 cell units (only the changed row)
= idiomatic memoized react-table, but N-independent and with no memo boilerplate; 7-8×
faster than naive react-table on a single-cell update.
