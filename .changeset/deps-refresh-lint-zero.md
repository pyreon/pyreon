---
'@pyreon/lint': patch
'@pyreon/zero': patch
---

Dependency refresh.

- `@pyreon/lint`: bump the `@oxc-project/types` dependency `^0.133.0 → ^0.137.0` (aligns with the `oxc-parser`/`oxc-transform` 0.137 line).
- `@pyreon/zero`: widen the `sharp` peer-dependency range to `^0.33.0 || ^0.34.0 || ^0.35.0` (sharp's image API is stable across these minors) and refresh the dev dependency to `0.35.2` — keeps the dev-tested and consumer-supported sharp versions in sync.
