---
"@pyreon/router": patch
---

perf(router): `captureSplat` fast path — wildcard route resolution +24%

`captureSplat` (called for `:path*` splat routes) previously allocated
a fresh `string[]`, pushed `decodeSafe(segment)` per part, and joined
with `'/'`. The intermediate array + per-segment function-call
overhead dominated wildcard match cost.

Now builds the joined string directly via concatenation, with an
inlined `indexOf('%')` per-segment decode check that skips
`decodeURIComponent` on clean paths (the overwhelming majority of
real URLs). No allocation, no per-segment function call, no array
round-trip.

Companion lazy `params` initialization in `matchFlattened`: starts as
`null` and materializes on first param write, so candidates that fail
on a static-segment mismatch don't pay the `{}` allocation cost.

Both changes are semantic-equivalent — no public API change, no
behavior change on URL decoding (existing `%`-encoded tests pass
plus 4 new regression tests covering clean + encoded splat paths).
552 → 556 router tests, all green.

**Measured impact** (microbench, 50-route table, 7 trials × 1s, median):

| Test | Before | After | Δ |
|---|---|---|---|
| static `/` (fast path) | 27.5M ops/s | 27.4M ops/s | flat |
| dynamic 1-param | 8.00M | 7.95M | flat |
| dynamic 2-params | 6.04M | 5.98M | flat |
| nested 3-deep | 5.59M | 5.67M | flat |
| **wildcard 4-segment** | **4.28M** | **5.29M** | **+23.6%** |

Public bench (`scripts/bench/core/router.ts`) confirms the win
holds across 10 / 50 / 200-route tables (+25-27% on wildcard rows;
all other rows flat).

Bisect-verified: reverting `captureSplat` only → wildcard drops back
to 4.30M baseline; restoring → climbs to 5.29M. Static and dynamic
rows unaffected in both states.
