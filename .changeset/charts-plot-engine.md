---
'@pyreon/charts': minor
---

New `@pyreon/charts/plot` — Pyreon's own charting engine, with no third-party
chart library behind it.

The geometry (scales, nice ticks, axis layout, bar/line/area/point marks, hit
testing) is pure TypeScript over plain data, and renders to a flat `DrawCmd[]`
that a short platform backend executes. The web backend ships here as ~120 lines
against a 2D canvas; the same command list is what will drive SwiftUI `Canvas`
and Compose `Canvas`.

Authoring is marks over data rather than one nested option object:

```tsx
import { PlotChart, bars, line } from '@pyreon/charts/plot'

<PlotChart
  data={() => sales()}
  x={(d) => d.month}
  marks={[bars((d) => d.revenue), line((d) => d.target, { color: '#b45309' })]}
  height={240}
/>
```

Every mark is an imported binding, so a bundler drops the ones you never import
— tree-shaking by construction rather than by configuration. Accessors are typed
against your row type, so a wrong field is a compile error instead of a blank
chart.

The existing ECharts-backed `Chart` export is unchanged and keeps the full
feature set for the long tail.
