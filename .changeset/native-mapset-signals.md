---
"@pyreon/native-compiler": minor
---

Lower reactive `Map`/`Set` signals to native collections (iOS + Android).

`signal(new Set<string>())` / `signal(new Map<string, number>())` previously
inferred to `Any`, so every read (`.size`/`.has`/`.get`) passed through
verbatim and failed swiftc/kotlinc. The signal-declaration type path
(`inferTypeFromInitial`) now maps a `new-collection` initializer to the
`set`/`map` TypeIR the type mapper and the already-wired Map/Set method
vocabulary consume, so the annotation and its reads agree on one native
collection type — `@State private var seen: Set<String>` (Swift) /
`mutableStateOf(mutableSetOf<String>())` (Kotlin).

v1 scope (scalar element/key/value — number/string/boolean): reads
(`.size`→`.count`, `.has`→`.contains`/`.containsKey`, `.get`→`map[k]`),
construction (`new Set<T>()`, `new Set([...])`, `new Map<K,V>()`), and the
mutation vocabulary (`.add`/`.delete`/`.set`/`.clear`) all type-check on both
real toolchains. Non-scalar element/key/value types (`Set<{...}>`,
`Map<string, {...}>`) and seeded `new Map([...])` now WARN by name instead of
silently mis-emitting uncompilable native code (a non-scalar Swift `Set`
element is a hard `does not conform to Hashable` error).
