---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

**Every `@pyreon/charts/plot` host gets the interaction stack.** Seventeen hosts now share one canvas host (`canvas-host.tsx`): `showTitle` / `subtitle`, `showLegend`, `tooltip`, `animate` (an entrance tween honouring `prefers-reduced-motion`), the resize observer, the accessible table and the theme resolution are one implementation instead of seventeen copies — and Treemap, Sunburst, Tree, Sankey, Graph, River, Polar, Gantt, Calendar, Parallel, Map, Funnel, Pie, Radar, Boxplot, Heatmap and Candlestick all draw a title, a legend (where the family has named entries) and a pointer tooltip for the first time. Selection is uniform: every host carries `onSelectIndex` (the engine's index — what the native tap reports) beside its rich `onSelect`; `<RadarChart>` gains a hit test (`hitRadarIndex` → `{ series, axis }`) and so its first `onSelect`.

Bars are rounded by default: `theme.radius` (3) rounds the corners AWAY from the baseline on plain bars (top for positive, bottom for negative, right/left when horizontal); a mark's own `borderRadius` still wins; `radius: 0` restores square bars. Stacked and grouped segments keep only their mark radii.

`<PlotChart maxPoints>` thins the visible slice with LTTB on the first mark when it exceeds the cap (rows stay aligned across marks); hits, tooltips and selection report the GLOBAL index of the row actually drawn.

`bun run --filter=@pyreon/charts bench:engine` measures layout + render throughput of the engine itself (bars/line/area/points at 1k–100k, treemap, sankey, LTTB), with a command-count correctness gate.

Native: the compiler warns BY NAME for chrome props a target does not draw yet (`tooltip` / `animate` everywhere; `showTitle` / `showLegend` outside PlotChart / Pie / Radar) and for `maxPoints`, instead of dropping them silently; the rounded default crosses through the generated engine.
