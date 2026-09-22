---
'@pyreon/charts': minor
---

A single family chart in `<OptionChart>` now sits where ECharts places it in the whole chart. A pie, gauge, sunburst or chord takes its `center` and a 75% default `radius`, and a funnel, treemap, tree or sankey takes ECharts' default margins or its own `left`/`top`/`right`/`bottom`/`width`/`height`. The title and legend draw over it. Before, the family filled the box. The canvas host gains a `frame` prop for this.
