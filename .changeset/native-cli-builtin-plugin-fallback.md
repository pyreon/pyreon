---
"@pyreon/native-cli": patch
---

A package whose native plugin the compiler already carries a built-in copy of (today `@pyreon/hooks`) no longer breaks a native build when its declared plugin file is missing or fails to load: discovery warns and the build uses the compiler's built-in copy. A third-party plugin has no such fallback, so a bad plugin file from it is still an error naming the package and file.
