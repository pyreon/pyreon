---
'@pyreon/charts': minor
'@pyreon/mcp': patch
---

Several charts in one ECharts option now render, as they do in ECharts.

The option facade used to route on `series[0]` and draw one series for most
families, dropping the rest with a warning. `planOption` now splits an option
into layers (`splitLayers`, a new `layers` plan kind): the cartesian series
over the whole box (several grids still split inside it), series that share a
coordinate system together (radar, polar, geo, single axis, parallel,
calendar), and every other family series as its own layer, placed by its
`center` / `radius` (pie, gauge, sunburst, chord) or its `left` / `top` /
`right` / `bottom` / `width` / `height` box with ECharts' defaults. Two pies
side by side, a pie in the corner of a line chart, a gauge beside a radar all
draw.

`<OptionChart>` paints the cartesian part on its canvas and mounts each family
layer's own interactive host over it, in its box and without a background;
a layer of unchanged shape stays mounted across updates, so it tweens. A
multi-grid option with a family series on one grid (candlesticks over volume
bars) now takes the same path instead of falling back to static SVG.
`optionToSvg` composes the layers into one document. A multi-grid option's
`backgroundColor` now covers the whole canvas.

Still open: a family series sharing ONE grid with line or bar series
(candles with moving-average lines on the same axes), and native
`<OptionChart>`, which lowers `series[0]` only.
