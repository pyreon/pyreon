---
"@pyreon/router": patch
---

perf: zero-allocation active-link segment matching

`isSegmentPrefix` (RouterLink's `activeClass`) and `matchSegments` (`useIsActive`)
both did `current.split('/').filter(Boolean)` and `pattern.split('/').filter(Boolean)`
then `.every(...)` — two array allocations plus a filter and an every closure per
call. These run inside the reactive `activeClass()` / `useIsActive` accessors,
which re-execute for EVERY mounted RouterLink on EVERY navigation (an N-link nav
sidebar = N calls per navigation).

Rewritten as zero-allocation `charCodeAt` offset-walks that compare the two paths'
non-empty '/'-delimited segments in lockstep (the same style the router's
`matchFlattenedFast` / `scanCleanPath` already use) — 2 arrays + 3 closures → 0
per call. Byte-identical semantics, including `:param` wildcards, exact-vs-prefix,
the `/`-target guard, and empty-segment (leading/trailing/double-slash) dropping.

Differential-verified: a new test reproduces both the old split-based oracle and
the new offset-walk and asserts they agree over 10,000+ (current, pattern, exact)
combinations plus the prefix matrix (bisect-verified — breaking the param check
or the empty-segment skip fails it). The existing useIsActive + RouterLink-active
suites exercise the shipped functions unchanged.
