# @pyreon/perf-harness

## 0.13.2

### Patch Changes

- [#1228](https://github.com/pyreon/pyreon/pull/1228) [`9b80d3e`](https://github.com/pyreon/pyreon/commit/9b80d3e4de7565515ce5bea603f6636e086af456) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements on test-utils + perf-harness.

  - `test-utils`: add 6 render-helpers tests covering getComputedTheme (function vs object $rocketstyle, missing props) + renderProps (with/without props, null vnode). Coverage 89.7% → 98.52% statements. Set thresholds 95/80/95/95.
  - `perf-harness`: exclude `src/overlay.ts` (DOM-heavy draggable floating panel with shadow DOM + pointer drag — needs real browser; exercised by Chromium e2e via examples/perf-dashboard). Coverage 88.35% → 100% statements. Set thresholds 95/80/95/95.

- [#1286](https://github.com/pyreon/pyreon/pull/1286) [`5c99286`](https://github.com/pyreon/pyreon/commit/5c99286d96bfdaea9603fc197c61f39b7fcaae5e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 83.87% → 96.55%. Added `tests/branch-coverage-edges.test.ts` covering `formatDiff` ternary branches (negative delta, null pct, positive sign) and `perfHarness.record()` preserved-counter-restore path (L68 nonzero branch). Annotated structurally-unreachable ragged-array fallbacks in `formatDiff` with `/* v8 ignore */`. Bumped vitest `branches: 80 → 95`.
