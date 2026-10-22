---
"@pyreon/native-compiler": patch
"@pyreon/http": patch
---

Native output that failed to compile with no warning now warns. A documented-example sweep (`scripts/native-example-sweep.ts`: every package's `api[].example` through the real compiler, then swiftc and kotlinc) found 134 such cases; this takes the count that names a Pyreon export to 4, all of them documentation fragments or Kotlin-specific. The "has NO native lowering" check is now decided per export instead of per module, so a module with a hand-kept `unsupported` list (`@pyreon/reactivity`, `@pyreon/core`) no longer lets `isClient`, `getCurrentScope`, `createRef<T>()` and similar through; it also covers generic calls, bare references, and a Pyreon type used as an annotation (`(s: TransitionStage) => …`). `@pyreon/http` names an imperative call on a `createHttp` client (`api.get(…)`) with the endpoint → `useFetch` alternative, and a `createHttp` declared inside a component body.

The native compile-validation cache no longer stores a killed compiler as a real rejection (`kotlinc`'s wrapper script exits 137 when its JVM is OOM-killed; the swiftc driver exits 1 with `compile command failed due to signal N`), and evicts such entries already stored, so one loaded run can no longer turn a passing compile into a permanent red test.
