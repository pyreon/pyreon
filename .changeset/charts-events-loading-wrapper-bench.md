---
"@pyreon/charts": minor
---

feat(charts): general `onEvents` map, reactive `showLoading`, and `replaceMerge`

- **`onEvents`** — bind ANY ECharts event by name (`legendselectchanged`, `datazoom`, `brushselected`, `finished`, …), not just the three `onClick`/`onMouseover`/`onMouseout` shorthands (which now merge into the same map). Each handler receives `(params, instance)`. Binding is leak-safe: a changed handler swaps the listener (no pile-up) and all listeners are removed on unmount.
- **`showLoading` / `loadingOption`** — reactively toggle ECharts' built-in loading overlay (distinct from `useChart`'s module-`loading` signal).
- **`replaceMerge`** — forwarded to `setOption` so a signal change can REPLACE (not merge) named components/series.
- Perf: removed a redundant init-time `setOption` (the reactive-update effect already applies the first option with the configured merge opts) — one `setOption` per mount instead of two.

Event handler type widened from `(params) => void` to `(params, instance) => void` (extra optional arg — non-breaking). New export: `ChartEventHandler`.
