---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

An ECharts treemap option now lays out exactly as ECharts lays it out.

- **Squarify:** ECharts' own, with its golden-ratio `squareRatio` target, its
  row flushing and its `sort` (`'desc'` by default, `'asc'`, or input order
  when `sort` is `false`; any other value sorts descending, as ECharts does).
- **Box:** ECharts 6's 20 / 50 / 20 / 50 px, placed by `left` / `top` /
  `right` / `bottom` / `width` / `height`.
- **Borders and gaps:** `itemStyle.borderWidth` / `gapWidth` resolve per
  node from the datum, then `levels[depth]`, then the series, as ECharts'
  tree model does. `upperLabel` reserves its band.
- **Visibility:** `visibleMin` drops cells under the threshold,
  `childrenVisibleMin` hides grandchildren of a too-small parent, and
  `leafDepth` is honoured.
- **Values:** a parent's value is its own, else its children's sum, clamped
  at zero.

Parents paint a ground in `itemStyle.borderColor` (the chart background, else
white). Leaves are labelled at their centre, truncated as zrender truncates.
17 layout cases are differential-tested to within 1e-6 px against the
layouts ECharts' own model computes.

`<TreemapChart>` gains an `echarts` prop carrying this. Without it the
component keeps its own layout. Still open: `levels` colours and the visual
mapping, upper-label text, the breadcrumb, drill-down and roam. On iOS and
Android an option treemap still draws the component's layout; the native
engines are regenerated with the new functions.
