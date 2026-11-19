---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Consolidation of the cartesian-basics campaign in `@pyreon/charts`, with no change in behaviour: the grid lines share one builder (`tickLines`), the scale-view dispatch moves into the descriptors (`apply` skips an axis it already applied; the layout calls the descriptor's `ticks` directly), and the axis domains carry `inverse` without a helper. A chart that imports none of `fillBy`, `shadeBy`, `sqrt`, `symlog` or `log` bundles none of their code (locked by `plot-treeshake` for the `PlotChart`, `chartToSvg` and `<Chart>` entries).
