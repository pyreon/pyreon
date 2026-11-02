---
"@pyreon/validate": patch
---

Raise the `joi` devDependency floor to `^18.3.1`, which fixes GHSA-4528-x5fx-h6hg (quadratic-time `string().email({ multiple: true })`). `joi` is used only by this package's benchmarks and differential tests, so nothing in the published package changes.
