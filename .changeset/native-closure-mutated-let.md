---
'@pyreon/native-compiler': patch
---

A component-body `let` that a closure reassigns (`let hits = 0; const bump = () => { hits++ }`) now lowers to `@State` / `mutableStateOf` state. It previously emitted an immutable `let`/`val` that Swift could not see from the helper function and Kotlin refused to reassign, with no warning.
