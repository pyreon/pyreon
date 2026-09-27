---
'@pyreon/charts': minor
---

`<Chart>` bundles only the interactions and hosts its children use.

- **`<Toolbox>` replaces `<Chart toolbox={…}>`** (breaking). The child takes the same config: `<Toolbox saveAsImage restore magicType={['line', 'bar']} />`.
- `<Zoom>` carries the navigator, presets and range brush, and `<Toolbox>` carries the tool strip, SVG save, magic type and area brushes. A chart without them references none of that code.
- Every cartesian mark carries the plot host. A family-only chart, such as a pie through `<Arc>`, no longer bundles the cartesian plot.

Measured on the built main entry, gzipped: `<Chart>` + `<Line>` drops from 47.8 KB to 43.8 KB, and `<Chart>` + `<Arc>` from 52.7 KB to 24.5 KB. `<PlotChart>` (`/engine`) is unchanged and still carries every feature. On native, `<Toolbox>` desugars to the `toolbox` config the host already lowers, and the emit is identical to `<PlotChart toolbox>`.
