---
'@pyreon/native-compiler': patch
---

A file-level function that returns no value now lowers to a native function instead of being dropped.

`function notify(msg: string) { toast(msg) }` was classified as a component, reported as "Component notify: no return statement found; skipping.", and removed, while every call to it stayed in the output. The file then failed to compile on both iOS and Android. A component must return JSX, so a lowercase function with no value-returning `return` and no JSX is now a void helper: a Swift `func` / Kotlin `fun` with no result type. A PascalCase function with no return is still reported, since it is a component missing its JSX.
