---
'@pyreon/sized-map': patch
---

Fix coverage measurement gap. The package's logic lives entirely in `src/index.ts`; the `@pyreon/vitest-config` default excludes `src/**/index.ts`, so the package was reporting 0% coverage despite having a comprehensive test suite. Set `includeIndexInCoverage: true` — coverage now reports the true 100% statements / 90% branches.
