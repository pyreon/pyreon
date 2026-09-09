---
'@pyreon/charts': minor
'@pyreon/native-compiler': patch
---

Decimation crosses to iOS and Android, and LTTB stops duplicating its last point

**The bug, found by writing the differential.** LTTB's buckets were indexed one
place to the right of the canonical formulation, with two consequences. The
first interior bucket was never considered at all, so a spike near the start of
a series could not be selected however prominent it was. And the last bucket
spanned the empty range `[n-1, n-1)` — no candidates, so `best` kept its initial
value of `n - 1` and the pinned final row was emitted TWICE. Measured across
3,781 (size, threshold) pairs, **3,608 ended in a duplicate**, so `maxPoints={N}`
drew `N - 1` distinct rows. The same shift made the third triangle vertex the
centroid of the bucket being selected FROM rather than the next one, which is
not the LTTB criterion — the comment beside it said "next bucket" while the
indices said otherwise. All three are fixed, so the selection changes.

**The arithmetic now crosses.** `decimate-values.ts` joins the generated chart
engine, the same split `indicator-values.ts` made out of `indicators.ts` — the
`Pt[]` wrapper cannot lower, and one non-crossing signature takes the whole file
web-only. Bucket edges are advanced by integer accumulation rather than
`Math.floor(i * every)`, because a Double cannot bound a native loop or
subscript an array, and there is no integer division to fall back on (the
emitters wrap both operands of `/` in `Double`). As a side effect the edges are
now exact: the float form could floor one row early where `span / count` is
unrepresentable, in 0.066% of edge computations.

**The native navigator thins its strip.** It passed every row to
`renderNavigator` on every frame; it now buckets to one min/max pair per 2px
column, exactly as the web host has since the host-parity pass. A 36px overview
never needed 100k points, least of all on a phone.

`lttbIndices` is exported from `@pyreon/charts/plot` alongside `lttb`, which
keeps its `Pt[]` signature and its real-x semantics — collapsing the two would
silently change what "largest triangle" means for unevenly spaced data.
