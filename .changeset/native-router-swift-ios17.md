---
'@pyreon/native-router-swift': minor
---

`Package.swift` declares iOS 17 / macOS 14, like `@pyreon/native-runtime-swift`. It declared iOS 16 / macOS 13, but every public type of the router already required iOS 17 (`@available(iOS 17.0, macOS 14.0, *)`, for `@Observable`), so nothing ran below 17. An app whose deployment target is below iOS 17 now gets a SwiftPM resolution error instead of availability errors in the router's types: raise the target to 17.0, the floor of Pyreon's support matrix.
