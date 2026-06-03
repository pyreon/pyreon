---
'@pyreon/perf-harness': patch
---

Lift branch coverage 83.87% → 96.55%. Added `tests/branch-coverage-edges.test.ts` covering `formatDiff` ternary branches (negative delta, null pct, positive sign) and `perfHarness.record()` preserved-counter-restore path (L68 nonzero branch). Annotated structurally-unreachable ragged-array fallbacks in `formatDiff` with `/* v8 ignore */`. Bumped vitest `branches: 80 → 95`.
