---
'@pyreon/native-compiler': minor
'@pyreon/feature': patch
---

PMTC: a `defineFeature` binding is now REACHABLE from the shared source that declares it

`const Todo = defineFeature({ name, schema })` lowered its DECLARATION on both
targets — a `Codable` struct plus `enum PyreonFeature_Todo` / `object
PyreonFeature_Todo` carrying `name` and `initialValues` — and emitted nothing
called `Todo`. Since the only reason to declare a feature is to use it, every
real shared-source app failed to build on **both** platforms the moment it wrote
`Todo.name`: swiftc `cannot find 'Todo' in scope`, kotlinc `unresolved
reference 'Todo'`, in a generated file the author never wrote.

The two sibling lowerings in the same emitter (`PyreonFieldMeta`,
`PyreonZodSchema`) have always emitted an alias under the source binding name.
The feature one did not. It now does: `let Todo = PyreonFeature_Todo.self`
(Swift) and `val Todo = PyreonFeature_Todo` (Kotlin).

It survived five green specs because every one of them asserts the emitted
DECLARATION and none ever writes the binding in a component body — and because
this test file made **zero** `swiftc`/`kotlinc` calls, so the whole
`@pyreon/feature` lowering had never been compiled by either toolchain. Both
halves are closed: the specs now reference the binding, and they compile the
result with the real compilers.

One limit is now DECLINED BY NAME rather than shipped broken. Swift and Kotlin
share a single namespace for types and values — unlike TypeScript, where
`interface Todo` and `const Todo` coexist — so a shared file declaring both a
feature binding and a TYPE of that name cannot emit both. Neither alias form
escapes it (a `typealias` and a value binding collide identically; both were
measured, which is why the value form is chosen for sibling symmetry and NOT
sold as collision-safe). The compiler now warns naming the binding and the
remedy instead of emitting a redeclaration error.
