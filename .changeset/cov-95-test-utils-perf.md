---
'@pyreon/test-utils': patch
'@pyreon/perf-harness': patch
---

Lift node-side coverage to ≥95% statements on test-utils + perf-harness.
- `test-utils`: add 6 render-helpers tests covering getComputedTheme (function vs object $rocketstyle, missing props) + renderProps (with/without props, null vnode). Coverage 89.7% → 98.52% statements. Set thresholds 95/80/95/95.
- `perf-harness`: exclude `src/overlay.ts` (DOM-heavy draggable floating panel with shadow DOM + pointer drag — needs real browser; exercised by Chromium e2e via examples/perf-dashboard). Coverage 88.35% → 100% statements. Set thresholds 95/80/95/95.
