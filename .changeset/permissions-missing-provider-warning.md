---
'@pyreon/permissions': patch
'@pyreon/native-compiler': patch
---

Native `usePermissions()` with no `<PermissionsProvider>` above it now warns once per process instead of silently denying every check. The SwiftUI environment default and the Compose CompositionLocal default are a distinguished deny-all instance (`isUnprovidedFallback`); the first `can()` against it prints a warning naming the missing provider (Swift: `#if DEBUG` only; Kotlin: once via `System.err`, since a library cannot read the host app's `BuildConfig`). An explicit `usePermissions([])` is unchanged and never warns. Web already threw on a missing provider. Validation stubs mirrored.
