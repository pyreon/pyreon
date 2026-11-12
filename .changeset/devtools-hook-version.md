---
'@pyreon/runtime-dom': patch
---

`window.__PYREON_DEVTOOLS__.version` is the real `@pyreon/runtime-dom` version instead of a hard-coded `0.1.0`, so the devtools extension can show which Pyreon a page runs. The build inlines it from the same `package.json` field the package already ships for its duplicate-instance check, so production output is unchanged.
