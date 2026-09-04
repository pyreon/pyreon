---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Parallel coordinates join the generated native chart engine — the last chart family to cross. BREAKING (pre-1.0, clean API): the engine takes NUMERIC rows (`Double[][]`; a category as its index in the axis's `categories`, a gap as `NaN`) — the web `ParallelRow` (`(number | string | null)[]`) is converted with the new `parallelRows(axes, rows)` (`<ParallelChart>`, `parallelToSvg` and the ECharts facade do this for you); `ParallelAxis.domain` and `ParallelLayoutAxis.domain` are `Domain` structs; the per-axis `place` closure is the function `parallelPlace(axis, value)` → `{ ok, y }`; `ParallelLine.points` is `Pt[]` with a parallel `present: boolean[]` (a gap is an absent point, not `null`) and `lineRuns(points, present)` matches; `ParallelOptions.lineColor` is a string only, with the per-row callback expressed as `lineColors: string[]` (`parallelLineColors(rows, fn)`, or `<ParallelChart rowColor={fn}>`). `hitParallelIndex` is the engine's hit; the nullable `hitParallel`, `parallelRows`, `parallelLineColors` and `lineRuns` live in `engine/parallel-web.ts`; `parallelToSvg` in `family-svg.ts`. The `@pyreon/charts/plot` re-exports are unchanged.
