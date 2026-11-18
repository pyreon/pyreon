---
'@pyreon/native-cli': patch
---

An Android build that uses a `slide-*` or `scale-in` `<Transition>` now compiles. The Kotlin emit called `slideInHorizontally`, `scaleIn` and the other enter/exit builders without importing them, so the real Gradle build failed with "Unresolved reference". Every Compose transition builder the emit names is now imported.
