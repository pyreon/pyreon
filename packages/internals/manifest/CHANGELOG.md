# @pyreon/manifest

## 0.13.2

### Patch Changes

- [#1227](https://github.com/pyreon/pyreon/pull/1227) [`46c6ce8`](https://github.com/pyreon/pyreon/commit/46c6ce86568090b69a3b7fc71a41fd7a0bd164aa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock coverage thresholds at ≥95% statements / lines on internals tooling packages.

  - `ansi`: was reporting 0% (default exclude on `src/**/index.ts`). Set `includeIndexInCoverage: true` + v8-ignore on env-detection branches that need real TTY. Measured 100% statements / 66% branches (env-dep paths).
  - `manifest`: 98.73% statements / 90.47% branches — lock thresholds.
  - `vitest-config`: 96.92% statements / 77.77% branches — lock thresholds.

- [#1284](https://github.com/pyreon/pyreon/pull/1284) [`9c0b77d`](https://github.com/pyreon/pyreon/commit/9c0b77df1472a1b7873b60430fe98d6d1b1690ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 90.47% → 95.23%. Added `tests/branch-coverage-edges.test.ts` covering `defineManifest` with empty `api[]`, `getPackageCategories` workspaces shapes (object form, missing package.json, glob filter), and `renderApiReferenceEntries` stability + deprecated metadata trailers (no summary, no replacement, no notes). Bumped vitest threshold `branches: 90 → 95`.
