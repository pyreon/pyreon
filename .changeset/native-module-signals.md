---
'@pyreon/native-compiler': minor
---

A module-level `signal()` or `computed()`, which holds state shared by the whole file, now works on iOS and Android. Before, it was skipped with a warning ("these belong inside a component"), and every read of it broke the native build.

Each file gets one observable singleton: an `@Observable` class on iOS and an `object` backed by `mutableStateOf` on Android. Store state uses the same shape, so every component that reads the value re-renders when it changes. Components, handlers, helpers and the state's own computeds all read and write through the singleton, and a local with the same name takes precedence. The singleton's name includes the file's suffix, so two files never collide.
