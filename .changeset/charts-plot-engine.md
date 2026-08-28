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

The existing ECharts-backed `Chart` export is unchanged.
