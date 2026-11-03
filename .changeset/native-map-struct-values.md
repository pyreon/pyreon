---
'@pyreon/native-compiler': minor
---

PMTC: a `Map` whose values are structs now lowers to a native dictionary on Swift and Kotlin instead of warning. `new Map<string, Todo>()` (with `Todo` declared as a `type` / `interface` / string-literal union in the same file), the group-by `Map<string, Todo[]>`, and the index-by idiom `new Map(todos.map((t) => [t.id, t]))` all typecheck on both toolchains — the index-by form lowers to Swift `Dictionary(…, uniquingKeysWith:)` / Kotlin `associate { … }.toMutableMap()`, last value wins as in JS. Inline-object and imported value types, non-scalar keys, and index-by pairs with an anonymous object value still warn by name. Also fixes a key mis-emit on enum-valued maps: `m.get('a') === 'done'` emitted the key as an enum case (`m[.a]`).
