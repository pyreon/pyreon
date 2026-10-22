---
'@pyreon/native-compiler': patch
---

Native (Swift): a signal seeded from a prop now compiles. `const n = signal(props.start)` emitted `@State private var n: Int = start`, a stored-property initializer reading another member, which `swiftc` rejects ("cannot use instance member 'start' within property initializer") — with no warning. Seeding local state from a prop is the `initialValue` / `defaultValue` pattern, one of the most common things a component does. Such a signal is now declared without an initializer and seeded in the component's generated `init`, where the prop is the init parameter: `_n = State(initialValue: start)`. A signal chained from it (`signal(n() * 2)`) is seeded there too. A persisted (`useStorage`) signal seeded from a prop, whose declaration the persistence plugin owns, now warns by name instead of emitting the same uncompilable initializer. Kotlin was already correct and is unchanged.
