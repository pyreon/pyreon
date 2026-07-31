---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`useFieldArray` lowers to native on both targets — dynamic form lists with
stable keys, device-proven.

- **Runtimes**: `PyreonFieldArray` (Swift `@Observable` / Kotlin
  `SnapshotStateList`) mirrors the web `@pyreon/form` surface one-for-one:
  `items` (keyed rows), `length`, `append`, `prepend`, `insert`, `remove`,
  `update`, `move`, `swap`, `replace`, `values`. Keys are monotone and never
  reused — a removal never re-keys survivors (row identity/focus survives),
  `replace` always re-keys. Byte-aligned contract suites on both platforms.
- **Compiler**: `useFieldArray(['a'])` lowers on both targets (String-
  specialized v1 — the PMTC form vocabulary is String-typed; initial must be
  an array literal, the useWebSocket literal rule). The load-bearing seam is
  the ACCESSOR UNWRAP: on web `tags.items()` / `tags.length()` /
  `item.value()` are signal calls, natively they are properties — the emit
  strips the parens (For-item params tracked through
  `<For each={tags.items()} by={i => i.key}>`, which lowers to
  `ForEach(tags.items, id: \.key)` / `items(tags.items, key = { it.key })`),
  and the validate stubs mirror the property shape so a paren-keeping emit
  fails both toolchain gates by construction. `move` emits with Swift labels
  (`move(from:to:)`).

Device-proven in router-demo on both platforms (add renders the row,
remove-first drops exactly row 0 with the survivor still rendered, count
tracks length) and bisect-verified by no-oping the runtime `remove()` on
both.
