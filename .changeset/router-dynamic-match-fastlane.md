---
"@pyreon/router": patch
---

perf(router): faster dynamic route matching — win the realistic-size averages

Two semantics-preserving cuts to the `resolveRoute` fast lane (`match.ts`),
both hot on every param-bearing / splat / catch-all match:

- **Fold `firstSegmentOf` into `scanCleanPath`.** The clean-path scan already
  walks past the first internal `/` while counting segments; it now records
  that offset so the fast lane slices the dispatch-map key directly instead of
  re-scanning with `indexOf('/', 1)`.
- **Skip the segment-0 re-comparison in `matchFlattenedFast`.** Every candidate
  reached through `segmentDispatch`/`segmentMap` is keyed by its static
  `firstSegment` (=== the path's first segment), so segment 0 is a proven
  match; matching now resumes at segment 1, eliding one `indexOf('/')` + one
  `startsWith` per matched dynamic route. `dynamicFirst` (param-first) routes
  still match from the top.

Measured (200-route table, 8-router pooled-CI95 protocol, `scripts/bench/core/router.ts`,
Apple M3 Max / Bun 1.3): `dynamic (1 param)` 102→78ns — now an OUTRIGHT win
(find-my-way 85, radix3 88); dynamic-2 157→139, nested-dynamic 156→140,
splat 120→102, catch-all 86→81. Pyreon now wins the realistic-size **averages
outright at both 50 and 200 routes** (1.00× vs find-my-way 1.05–1.10× / radix3
1.12×; was 3rd at 200 routes). Static/nested-static unchanged (already fastest).

Byte-identical to the prior implementation over a 300k-random-path differential
(query/hash/`//`/`%`/trailing-slash/optional/splat/nested/param-first/miss);
all 680 router tests pass.
