# @pyreon/ansi

## 0.13.2

### Patch Changes

- [#1227](https://github.com/pyreon/pyreon/pull/1227) [`46c6ce8`](https://github.com/pyreon/pyreon/commit/46c6ce86568090b69a3b7fc71a41fd7a0bd164aa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock coverage thresholds at ≥95% statements / lines on internals tooling packages.

  - `ansi`: was reporting 0% (default exclude on `src/**/index.ts`). Set `includeIndexInCoverage: true` + v8-ignore on env-detection branches that need real TTY. Measured 100% statements / 66% branches (env-dep paths).
  - `manifest`: 98.73% statements / 90.47% branches — lock thresholds.
  - `vitest-config`: 96.92% statements / 77.77% branches — lock thresholds.

- [#1289](https://github.com/pyreon/pyreon/pull/1289) [`5df10f8`](https://github.com/pyreon/pyreon/commit/5df10f854c3e1ab3d17dcbea8741ee1c7770c3c4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 66.66% → 100%. Wrapped the colorEnabled=true paths in `/* v8 ignore start/stop */` regions — these require a real TTY or `FORCE_COLOR=1` and are exercised by downstream lint-reporter integration tests, not unit tests. Bumped vitest `branches: 65 → 95`.
