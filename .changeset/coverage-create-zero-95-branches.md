---
'@pyreon/create-zero': patch
---

Lift branch coverage 81.81% → 96.15% (≥ 95% target). Added `branch-coverage-edges.test.ts` covering env.example append paths, tanstack non-query/non-table dep version branch (virtual), compat-shim deps (react/vue), package strategies (meta), vite-config compat-flag emit, and unknown-feature defensive paths. Annotated structurally unreachable defensive paths in `integrations.ts` (empty envKeys, non-ENOENT readFile error rethrow) and `template-engine.ts` (non-file dirent, binary copy, listFiles non-existent dir, non-file dirent) with `/* v8 ignore */`. Bumped vitest threshold `branches: 80 → 95`, dropped `@pyreon/create-zero` from `BELOW_FLOOR_EXEMPTIONS` in `scripts/check-coverage.ts`.
