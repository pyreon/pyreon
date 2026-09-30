---
'@pyreon/native-compiler': patch
'@pyreon/native-router-swift': patch
'@pyreon/native-router-kotlin': patch
'@pyreon/permissions': patch
---

PMTC no longer emits per-file helper declarations that collide when two files share a Swift module or Kotlin package. `PyreonUrlState`, the number-string helper and the permissions environment key/CompositionLocal moved into the runtimes (stubs mirrored, parity-tested); synthesized `__ObjN` structs carry a per-module suffix. A `<PermissionsProvider>` with no readers in its file now compiles, and a bare `usePermissions()` no longer warns per file since the provider is app-wide.
