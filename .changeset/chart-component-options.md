---
'@pyreon/charts': minor
---

feat(charts): `<Chart>` now forwards `onInit` / `locale` / `notMerge` / `lazyUpdate` to `useChart`. These were documented as `<Chart>` props in the README but were neither declared on `ChartProps` nor passed through — only `theme` and `renderer` reached `useChart` (which already supported all four). Setting them on `<Chart>` now works end-to-end.
