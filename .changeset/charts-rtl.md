---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Right-to-left charts: `rtl` on `<PlotChart>` and every canvas host, and on the
static `chartToSvg` path.

RTL is implemented as a MIRROR of the finished draw list about the canvas's
vertical centreline rather than as a flag threaded through layout and every
mark. Mirroring about the CANVAS centreline (not the plot's) is what swaps the
gutters, so no layout code changes: a measured value-label gutter lands as a
right gutter of the same width. Bands run from the right, the legend's swatch
sits right of its label, and a line reads from the right — all of which are
the same fact, which is why one seam produces them together.

Text is repositioned, never reversed. What flips is the anchor, a rotated
label's angle, and a rect's corner radii.

Every pointer is mirrored back before it is hit tested, so a click, a hover,
the legend pager, the preset strip and a brush all still report the thing
under the finger. A chart that painted mirrored and reported unmirrored would
name the wrong bar in one locale only.

Native lowers through `pyreonMirrorCmds` in both runtimes, hand-written per
target for the same reason `pyreonShiftCmds` is (the draw command is a union
in TypeScript and a flat struct on native). All three implementations are
executed against the same commands and compared, so they cannot drift. `rtl`
on a family host is not lowered on native yet and warns by name rather than
being dropped.
