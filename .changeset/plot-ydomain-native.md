---
'@pyreon/native-compiler': minor
---

`yDomain` lowers to iOS and Android

`<PlotChart yDomain={{ min, max }}>` pins the y-axis range. It is a `ChartSpec`
field the geometry engine already consumes, and its sibling `y2Domain` has
lowered as a one-liner since the second axis landed — but `yDomain` sat in
`PLOT_UNLOWERED_PROPS`, so a native chart warned and drew an auto-scaled axis
instead. A fixed range is basic charting and nothing about it is web-specific.

The position matters as much as the presence: Swift's memberwise init takes
arguments in declaration order, and `yDomain` is `ChartSpec` field 9 — before
`yFormat`, not appended after `progress` where the batch-2 literal props go.
That order is read off the generated struct rather than restated, so a
regeneration cannot silently invalidate it.

Both toolchains compile the emit.
