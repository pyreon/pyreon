---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
---

Two capability rows close, and the direct-native chart ledger is now at 100%.

- `data.transforms`: the built-in `filter`/`sort` transforms and every dataset-chaining shape (`datasetIndex`/`datasetId`, `fromDatasetIndex`/`fromDatasetId`, `fromTransformResult`) already resolved at native compile time through the same `resolveDataset` the web runs — this was proven, not fixed, with a new chained (`fromDatasetIndex`) native compile test. A registered transform is an arbitrary JS closure that cannot run outside JS on any target, so it stays named as web-only rather than silently dropped.
- `presentation.universal-transition`: `OptionChart` already forwarded ECharts' `universalTransition` to its shared canvas host, but `PlotChart` — the more common, array-of-marks API — never exposed the prop at all, so a real app could never reach it there. `PlotChart` now runs its own command-level morph for a series/row-count change (the same `cmd-tween.ts` machinery the canvas host uses), so a shape change tweens instead of snapping when `universalTransition` is set. Native's runtime canvas is shape-agnostic and already emitted the flag for both facades.

Every row in the direct-native capability inventory (`CHART_CAPABILITY_CONTRACT`, now `.41`) is `'complete'`.
