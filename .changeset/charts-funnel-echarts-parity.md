---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

An ECharts funnel option now draws exactly as ECharts draws it. Stage sizes
map values linearly from `min` / `max` onto `minSize` / `maxSize`. `orient:
'horizontal'` is supported, an ascending funnel is laid out from the far end,
`gap` and `funnelAlign` behave as in ECharts (including `top` / `bottom` on a
horizontal funnel), and per-item `itemStyle.height` / `width` is honoured.
Every stage gets a border in the chart background. Labels sit outside on
leader lines by default, and every ECharts label position is supported:
`inside`, `insideLeft`, `insideRight`, `left`, `leftTop`, `rightBottom`, …, a
`top` label on a vertical funnel moving to the left side as ECharts does. They
take zrender's automatic colours, `inherit`, a template or a function
`formatter`, and `labelLine.show` / `length`. The series box defaults to
ECharts' 80 / 60 / 80 / 65 margins, and `left` / `top` / `right` / `bottom` /
`width` / `height` place it. 32 cases are differential-tested against
ECharts' own SSR output.

`<FunnelChart>` gains an `echarts` prop carrying this layout; without it the
component keeps its own simpler layout. On iOS and Android an option funnel
still draws that simpler layout. The native chart engines are regenerated with
the new layout functions, which nothing native calls yet.
