---
'@pyreon/manifest': patch
---

Lift branch coverage 90.47% → 95.23%. Added `tests/branch-coverage-edges.test.ts` covering `defineManifest` with empty `api[]`, `getPackageCategories` workspaces shapes (object form, missing package.json, glob filter), and `renderApiReferenceEntries` stability + deprecated metadata trailers (no summary, no replacement, no notes). Bumped vitest threshold `branches: 90 → 95`.
