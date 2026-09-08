---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

Two marks the cartesian surface was missing, and two that were unreachable.

**`band(low, high)`** — a filled REGION between two value channels: a
confidence interval, a min/max range, a forecast cone. Distinct from `area`,
which closes to the axis floor; a band's two edges are both data. Distinct
from the `errorLow`/`errorHigh` whiskers too — those decorate a value per
datum, this is the mark. A datum joins the band only when BOTH bounds are
finite, because half a bound is not a region.

**`stackedArea(y)`** — `stackedBars`' continuous sibling. Each series fills
between the running total below it and its own top, so the outline of the
topmost series is the total. Only non-negative values stack, on the same
reasoning as the bars.

Both carry their own second-channel plumbing: `Series.values2` is the band's
lower bound, kept apart from `errLow`/`errHigh` deliberately so that "draw a
whisker" and "draw a region" are not the same request. Both lower to native,
and both real toolchains compile the emit.

**`waterfall` and `histogram` were documented as importable and were not
exported.** They existed, they lowered to native, the manifest named them as
importable bindings — and `import { waterfall } from '@pyreon/charts/plot'`
was `undefined`. Nothing caught it because the only code importing them was
the native compiler's own tests, and PMTC parses its input rather than
resolving it, so those imports never had to exist. Both are exported now, and
a TOTAL test over the marks module locks the surface: a mark added later has
to be reachable rather than silently joining them.

**`showValues` now works on every mark kind.** It was documented as "draw each
value above its bar" and honoured by bars and waterfall only; on line, area,
points, stacked, grouped and stackedArea it was a silent no-op — which reads
as "the option does not apply here" and was really "nobody wrote the branch".
Each kind labels where its geometry allows: outside the free edge for bars,
grouped and waterfall, above the point for line, area and points, and INSIDE
the segment for stacked and stackedArea, which have no free edge to hang a
label from. A stack prints the segment's OWN value, not the running total the
outline already shows. The lock is total over the mark kinds, so a kind added
later has to answer the question.

**`markers` now draw on the horizontal frame and on stacked / grouped
series.** They were skipped on all three — a silent no-op on shapes where
`annotations` drew perfectly well. The skip was not arbitrary: a stacked datum
is drawn at its RUNNING TOTAL in a band-centred segment, so pushing it through
the point-like placement would have put the marker where the data never
appears, and refusing beat lying. The invariant worth keeping is therefore "a
marker never lands somewhere the datum is not", not "these shapes have no
markers" — so the anchor is now read back from the same layout the paint used:
the top centre of a vertical segment, the right end of a horizontal one.

**The grammar got `<Layer>` and `<Band>` too — and that gap was self-inflicted.**
`stackedArea` was added to the native compiler's tag map first, which quietly
claimed a `<Layer>` the web grammar had never heard of: the same source would
have compiled natively and rendered nothing in a browser. Both tags now exist
as components, `<Band low high>` has its own desugar branch (a region has two
bounds and no single `y`, so the generic path rejected it), and the two copies
of the tag set — the grammar's and the compiler's — are asserted against each
other from both ends, since the compiler cannot import the package that really
owns them.
