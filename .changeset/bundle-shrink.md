---
'@pyreon/reactivity': patch
'@pyreon/core': patch
'@pyreon/runtime-dom': patch
'@pyreon/router': patch
'@pyreon/server': patch
'@pyreon/rocketstyle': patch
'@pyreon/styler': patch
'@pyreon/unistyle': patch
'@pyreon/elements': patch
'@pyreon/attrs': patch
'@pyreon/coolgrid': patch
'@pyreon/ui-core': patch
---

Bundle-size shrink across browser-shipped packages — **~7 KB gzipped saved** total. A typical Pyreon app shipping `runtime-dom + reactivity + core + router` is now **~5.7 KB lighter**.

## Wins (gzipped, measured at the production-define bundle level)

| Package                | Before | After  | Saved          |
| ---------------------- | ------ | ------ | -------------- |
| `@pyreon/runtime-dom`  | 12,655 | 9,719  | **−2,936 B (−23%)** |
| `@pyreon/reactivity`   | 7,870  | 6,328  | **−1,542 B (−20%)** |
| `@pyreon/core`         | 4,972  | 4,191  | **−781 B (−16%)**   |
| `@pyreon/router`       | 10,148 | 9,582  | **−566 B (−6%)**    |
| `@pyreon/rocketstyle`  | 4,390  | 3,992  | **−398 B (−9%)**    |
| `@pyreon/styler`       | 5,624  | 5,453  | **−171 B (−3%)**    |
| `@pyreon/server`       | 3,575  | 3,431  | **−144 B (−4%)**    |
| `@pyreon/attrs`        | 1,017  | 915    | **−102 B (−10%)**   |
| (8 more)               | ...    | ...    | smaller wins (1–98 B each) |

17 packages shrunk total. Net **−7,153 B** gzipped across the published Pyreon footprint.

## Two complementary fixes

**1. `check-bundle-budgets.ts` now measures the PRODUCTION-stripped size.** The script's `Bun.build` invocation was missing `define: { 'process.env.NODE_ENV': '"production"' }`. As a result, the budget measurement INCLUDED every `if (process.env.NODE_ENV !== 'production') console.warn(...)` string from `lib/` — overstating the real consumer bundle by 5–20% per package and forcing budget bumps for dev-only diagnostic growth that never reaches end users. Real consumers (Vite/Webpack/esbuild) all set this define at their build time; the measurement now matches what they actually ship.

**2. Removed the `const __DEV__ = process.env.NODE_ENV !== 'production'` alias** from 22 files across 7 browser-shipped packages, in favor of the bare gate `if (process.env.NODE_ENV !== 'production')` at the use site. The alias pattern is recognized by `dev-guard-warnings` lint rule but is silently worse for downstream bundle size — Bun.build and several esbuild configurations don't propagate the const-folded value through the alias even when the production define is set. The bare gate folds reliably at the use site because the bundler replaces the expression with a literal `false` directly. This is the bundler-agnostic library convention used by React, Vue, Preact, Solid.

Pure internal optimization — no API change, no behavior change. DEV mode behavior unchanged (warnings still fire identically in development). The migration is locked in by `pyreon/no-process-dev-gate` lint rule and the regenerated `scripts/bundle-budgets.json` floor.

## QA

- All 1,378 compiler tests + 680 runtime-dom tests + 521 router tests + 168 server tests + 998 zero tests pass (storage test failures are pre-existing on main, unrelated to this PR)
- Whole-repo `bun run lint` + `typecheck` clean
- `gen-docs --check` clean
- `bench:fair` (real-Chromium across 8 frameworks): Pyreon at top of tied cluster on 4 of 7 tests (create-1k, replace-all, partial-update, create-10k), tied in cluster on the other 3 — no regression
- One pre-existing test (`dev-gate-treeshake.test.ts non-Vite consumer runtime correctness`) updated to reflect the new bare-gate contract: esbuild's `platform: 'browser'` default replacement (`process.env.NODE_ENV = "development"`) folds the bare gate AND the minifier strips the warn body — strictly better than the old `__DEV__` alias pattern the test was guarding
