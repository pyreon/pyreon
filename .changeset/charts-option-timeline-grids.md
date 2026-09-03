---
'@pyreon/charts': minor
---

ECharts facade: `timeline` (`baseOption` + `options[]` steps — series merged by index, a strip with one dot per step under the chart, `timelineIndex` to pick a step, out-of-range steps warn `timeline-step-out-of-range`) and multi-`grid` layouts (`gridRect` px/% parsing, axes and series assigned by `gridIndex`/`xAxisIndex`, one sub-chart per grid composed into ONE `<svg>`; `planOption` returns `{ kind: 'grids' }`). Pure functions in `option-composite.ts`.
