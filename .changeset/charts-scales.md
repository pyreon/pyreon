---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`@pyreon/charts/plot` grows the scale and mark vocabulary a production chart needs, in the engine so it crosses to iOS/Android:

- **Log y scale** (`yScale="log"` / `<Scale y="log">` / `<Axis y scale="log">`): every left-axis mark lays out in the log view, the axis draws real decades (with 2×/5× minors under two decades), non-positive values are gaps, bars grow from the axis floor; tooltip, table and value labels keep the real values.
- **Time y axis** (`yTime` / `<Scale y="time">`), the twin of `xTime`.
- **100% stacked bars** (`stackNormalize` / `<Scale normalize>`): each column drawn as shares over a `{0, 1}` domain labelled as percent; raw values stay on every read surface.
- **Waterfall** (`waterfall(y, { negativeColor })` / `<Bar waterfall>`): floating steps from running total to running total with dashed connectors, an entrance from each step's start level, hits by row.
- **Error bars** (`errorLow` / `errorHigh` accessors on `bars`, `line`, `area`, `points` and their grammar twins): capped whiskers through each datum, the bounds joining the domain.
- **Histogram** (`histogram(rows, x, { bins })` spread into `<PlotChart>`, or `<Histogram x bins>` in `<Plot>`) over the crossing `binValues` (nice-step edges, clamped extremes).
- **Axis titles** (`xTitle` / `yTitle` / `y2Title`, `<Axis title>`), each in its own gutter line, the y titles rotated along their axes.
- **Axis label thinning and rotation** (`xLabels`: `auto` slants overflowing category labels 45° and thins numeric ones; `rotate` / `thin` / `all` force one); the horizontal frame thins its category rows. The draw list's text command carries `rotate`, executed by the web canvas, the SVG serializer and both native canvases.
- **Locale** (`locale="de-DE"` on `<PlotChart>` / `<Plot>`): numbers and, under a time axis, dates format through `Intl` on every surface; an explicit `format` wins. Web only (Intl), named on native.
- **Facets** (`<Plot facet="region" facetColumns>`): small multiples in a grid, one titled panel per value, every panel sharing the y domain; a new value adds a panel, persisting values keep their panel.

Native: the spec switches (`yScale`, `yTime`, `stackNormalize`, the titles, `xLabels`) lower as literals on both targets through the generated engine, `<Scale>` / `<Axis title labels scale time>` desugar, the waterfall mark lowers, and error bars lower as a second per-row accessor pair (the bubble radius channel's shape); `<Histogram>`, `locale` and `facet` are named as web-only rather than dropped. The engine regenerates with `bin.ts` and compiles on the real toolchains.
