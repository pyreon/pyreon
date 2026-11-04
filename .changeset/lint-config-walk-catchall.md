---
'@pyreon/lint': patch
---

`loadConfig` now really walks up to the nearest `.pyreonlintrc.json` in a parent directory (it stopped before reading the parent), stopping at the repository root. `no-missing-fallback` recognises the documented `(.*)` catch-all route.
