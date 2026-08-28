---
'@pyreon/native-compiler': patch
---

The real-SDK gate now also compiles every crossing package's registry snippet
(`defineStore`, `useQuery<T>`, `useForm`, `PyreonTableState`, …) against the real
runtime — 37 of them. Those snippets were checked for warnings and typechecked
against stubs, neither of which answers whether the runtime types they name
exist with the signatures the emit uses.

Also fixes the corpus walker, which excluded a directory literally named `Tests`
while the real one is lowercase `tests` — so test fixtures were quietly in the
compile set, and a fixture type named `Row` collides with an app's own `Row`.
