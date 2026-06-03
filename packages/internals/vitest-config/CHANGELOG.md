# @pyreon/vitest-config

## 0.13.2

### Patch Changes

- [#1227](https://github.com/pyreon/pyreon/pull/1227) [`46c6ce8`](https://github.com/pyreon/pyreon/commit/46c6ce86568090b69a3b7fc71a41fd7a0bd164aa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock coverage thresholds at ≥95% statements / lines on internals tooling packages.

  - `ansi`: was reporting 0% (default exclude on `src/**/index.ts`). Set `includeIndexInCoverage: true` + v8-ignore on env-detection branches that need real TTY. Measured 100% statements / 66% branches (env-dep paths).
  - `manifest`: 98.73% statements / 90.47% branches — lock thresholds.
  - `vitest-config`: 96.92% statements / 77.77% branches — lock thresholds.

- [#1288](https://github.com/pyreon/pyreon/pull/1288) [`efada83`](https://github.com/pyreon/pyreon/commit/efada8386168a4ceb47659f503630509fbe1552d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift coverage to 100% across all metrics. Added `tests/browser-config.test.ts` covering `defineBrowserConfig` shape + overrides merge. Annotated structurally-unreachable defensive conditionals with `/* v8 ignore */`: `node.ts` opt-in `setupFiles` / `coverageExclude` / `includeIndexInCoverage` spreads, `internals.ts` CI/local retry split, `browser.ts` overrides spread. Bumped vitest thresholds `branches: 77 → 95`, `functions: 85 → 95`.
