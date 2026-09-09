---
'@pyreon/charts': minor
---

River's axis and tick labels now read the chart theme, and the SVG⇄canvas theme
gate is total over every family helper.

`riverToSvg` accepted a `theme` documented as "the canvas host reads the same
fields" and then passed only the palette, so a dark river drew its axis in a
fixed `#94a3b8` and its tick text in a fixed `#64748b` — 3.73:1 on the dark
ground, below the 4.5:1 text minimum. `RiverChart` did the same. Both now pass
`axisColor` and a new `tickColor`, and every value clears its WCAG minimum on
both grounds; on the light ground the axis moves from a failing 2.56:1 to
3.05:1. Band labels stay white, because they sit on a palette-filled band.

The reason it survived: `svg-theme-parity.test.ts` covered ten of the sixteen
`*ToSvg` helpers by hand, and all six it missed were where every remaining
unthemed literal lived. The table is now checked against the module's own
exports, so a helper with no case fails by name.
