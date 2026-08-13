---
"@pyreon/native-compiler": minor
"@pyreon/table": minor
---

Lower `@pyreon/table`'s `createTableState` to native (iOS + Android).

`const t = createTableState({ data: () => rows(), columns: [{ id }], pageSize })`
in shared `.tsx` now compiles to the `@Observable` PyreonTableState engine —
sort / filter / paginate / select, rendered with `<For each={t.rows()}>` +
`@pyreon/primitives`.

- **Column cell accessors are codegen'd** from the row struct's inferred field
  types: a `String` field → `.string($0.name)`, a number → `.number(Double($0.age))`.
- **Swift** wires the reactive data source in `.onAppear` (`t.setData { rows }`),
  because a `@State` initializer can't capture the source signal; the table
  itself is a self-seeding `@State`. **Kotlin** passes it in the constructor
  (sequential `remember`).
- Use-sites: `t.rows()`/`t.toggleSort(id)`/`t.setFilter(q)`/… flow through as
  methods; `t.page()`/`t.sortColumn()`/… drop parens (property reads).
- The `PyreonTableState` port is now `@Observable` (Swift) / `mutableStateOf`-
  backed (Kotlin) so sort/filter/page mutations recompose.
- `@pyreon/table` declares a `nativeFrontend` and leaves WEB_ONLY_PACKAGES; the
  TanStack-backed `useTable` (row model / faceting / virtual sizing) stays web.

Verified: the actual emit type-checks against the real SwiftUI SDK + the real
port on macOS, and both targets validate against the compiler stubs. v1: scalar
columns with the default `row[id]` accessor; explicit accessors / rowId /
filterFn are follow-ups.
