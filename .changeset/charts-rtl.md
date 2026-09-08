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
executed against the same commands and compared, so they cannot drift.

On native both halves live on the CHROME helper — `mirror` beside `tapX` —
so every host built through it (the plot, treemap, sankey, pie, polar, gantt,
radar, …) gets the paint and the pointer together rather than each emitter
remembering to take both. The three hosts whose emitters bypass the chrome
(gauge, candlestick, heatmap) name `rtl` as unlowered instead of dropping it,
and carry explicit prop lists so that adding a prop to the shared default can
never silently claim a host that does not read it.

Cost: the mirror is a static import of every canvas host, so a chart that
never sets `rtl` still carries it — measured +86 B gz on the pie import and
+31 B on the SVG one. That is the trade for `rtl` meaning the same thing on
every host: putting the mirror behind an opt-in import would make the prop
silently do nothing unless the consumer also imported the seam, which is the
typed-but-unimplemented shape this PR otherwise avoids.
