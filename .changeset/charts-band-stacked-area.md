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
