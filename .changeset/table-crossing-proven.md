---
'@pyreon/native-compiler': patch
---

`@pyreon/table` was crossing and the gate could not see it

Its manifest has declared a `multiplatform.nativeFrontend` for
`createTableState` all along, but the coverage registry carried no snippet — so
the gate reported "native runtime ships" and the package read as
native-runtime-only, with `useTable` cited as proof that table does not cross.

`createTableState({ data, columns, pageSize })` lowers with ZERO warnings on
both targets, emits `PyreonTableState<Row>`, and compiles on real swiftc and
kotlinc. The registry now carries that snippet.

The reverse-direction check added earlier only covered `web-first` entries, so a
`native-container` entry could drift the same way — a declared frontend with
nothing proving it. The gate now rejects that for ANY mechanism.

`useTable` (the TanStack row model / faceting / virtual sizing) is still web,
which is what the manifest always said.
