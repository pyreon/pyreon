---
'@pyreon/charts': minor
---

Stacked and grouped bars now render on the HORIZONTAL frame.

They were filtered out of the horizontal render entirely, so
`<PlotChart horizontal marks={[stackedBars(...), stackedBars(...)]} />` drew
its axes and nothing else — and said nothing about it. A population pyramid, a
ranked breakdown, a survey result: every one of them an empty box. The
combination typechecked, the marks were accepted, and the only symptom was a
chart with no bars in it.

`layoutStackedBarsH` and `layoutGroupedBarsH` are the flipped-frame twins of
the existing layouts: bands run down the y axis, values along x. They are
separate functions rather than a flag inside the vertical ones because the two
differ in every term — which plot dimension the band divides, which scale the
value maps through, which rect edge a segment starts at — so a shared body
would be a branch on `horizontal` at each of those points rather than shared
arithmetic.

The hit test moved with the paint. `stackedHitIn` returned -1 for any
horizontal spec, which was correct while nothing was drawn and a dead control
the moment something was; it now reads the same layout the paint used.

The domain already handled this: a stack scales to its tallest TOTAL, and that
calculation is frame-agnostic, so a horizontal stack whose total exceeds every
individual series still fits inside the plot.

Vertical output is byte-identical — no existing golden moved.
