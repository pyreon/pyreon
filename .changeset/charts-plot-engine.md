---
'@pyreon/charts': minor
---

New `@pyreon/charts/plot` — Pyreon's own charting engine, with no third-party
chart library behind it.

The geometry is pure TypeScript over plain data and renders to a flat
`DrawCmd[]` that a short platform backend executes. The web backend ships here
as ~120 lines against a 2D canvas; the same command list is what will drive
SwiftUI `Canvas` and Compose `Canvas`.

Covers bars, lines, areas, points, scatter with real x/y channels, stacked and
grouped bars, pie and donut, gauge, and radar; linear, log and time scales; nice
ticks, legends with wrapping, tooltips with edge flipping, and compact/currency/
percent formatting. Large series decimate with LTTB, which preserves spikes that
nth-sampling drops.

Authoring is marks over data rather than one nested option object:

```tsx
import { PlotChart, bars, line } from '@pyreon/charts/plot'

<PlotChart
  data={() => sales()}
  x={(d) => d.month}
  marks={[bars((d) => d.revenue), line((d) => d.target, { color: '#b45309' })]}
  title="Monthly revenue"
  seriesLabels={['Revenue', 'Target']}
  height={240}
/>
```

Every mark is an imported binding, so a bundler drops the ones you never import
— a bar chart pays nothing for the radial trigonometry or the time scales.
Accessors are typed against your row type, so a wrong field is a compile error
rather than a blank chart.

Charts are accessible by default: the canvas carries a generated description
naming the trend and range, and an offscreen data table lets a screen reader
navigate the numbers by row and column. Opt out with `accessibleTable={false}`.

Three components ship: `<PlotChart>` for the cartesian family, `<PieChart>`
for pie and donut, and `<GaugeChart>`. They are separate rather than one
component with a `type` prop, because a pie has no cartesian plot — no axes, no
gutters, no shared domain — and folding them together would make every bar chart
carry the radial trigonometry it never uses.

`<PlotChart>` also does legends, hover tooltips, stacked and grouped bars, a
per-series default palette, and fills its container when no width is given.

A second backend renders the same command list to an `<svg>` string. It is a
pure function, so `chartToSvg(...)` produces a chart in an SSG build, a
serverless function or an email pipeline — no DOM, no canvas, no measurement
context — and its output is deterministic, which makes an SVG snapshot a real
assertion rather than a flake.

`<PlotChart>` fills its container and follows it: the width comes from the
container via a `ResizeObserver`, not from the canvas the chart itself sizes.

A single `format` prop covers the y-axis ticks, the tooltip and the spoken
description — `plain`, `compact`, `currency`, `percent` and `fixed` ship with
it.

The existing ECharts-backed `Chart` export is unchanged.
