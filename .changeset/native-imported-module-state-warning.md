---
'@pyreon/native-compiler': patch
---

A module-scope `signal()` or `computed()` imported from another file is now a named warning on iOS and Android.

Module state lowers to one singleton per compiled file, so a file that imports it from another module emitted bare names that exist in neither Swift nor Kotlin, and `pyreon-native check` reported 0 warnings while the build failed. The warning names the import and says what to do instead (declare the state in the `.tsx` file whose components share it, or own it in one component and pass the value and a setter down as props). It covers named, aliased, default and namespace imports, and re-exports through a barrel. Cross-file module state still has no lowering.
