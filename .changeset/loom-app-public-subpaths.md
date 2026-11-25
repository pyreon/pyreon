---
'@pyreon/loom': patch
---

`loom build` works from an installed package. The shipped observatory app imported `../../src/ui/Observatory`, but the publish strips `src/` from the package, so `loom build` failed in every install with `UNRESOLVED_IMPORT`. The app now imports the package's own public subpaths (`@pyreon/loom/ui`, `@pyreon/loom/core`).
