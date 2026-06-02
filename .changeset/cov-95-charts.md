---
'@pyreon/charts': patch
---

Lift node-side coverage to ≥95% statements. Add loader error-path tests (`_wrapTslibError` happy/passthrough/non-Error cases + `getCoreSync` peek). Exclude `use-chart.ts` from node-side coverage — its `ResizeObserver` callback + chart init/setOption error paths require real Chromium, already covered by `charts.browser.test.tsx` in `@vitest/browser`. Bump `coverageThresholds.statements` 94 → 95.
