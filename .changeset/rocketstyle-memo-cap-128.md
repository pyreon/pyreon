---
'@pyreon/rocketstyle': patch
---

fix(rocketstyle): raise `_rsMemo` LRU cap from 32 to 128 to eliminate cache thrashing on high-cardinality workloads

The dimension-prop memo's previous cap of 32 was sized for the E2 perf-
dashboard reference workload — true for that specific benchmark, NOT
true for any real app with:

- Data tables where every cell has a `(state, size, variant)` derived
  from row data
- Design systems with many named tokens crossed with size/variant axes
- Dashboards rendering many small interactive components

## Measurement (closed PR #761, branch `spike/rocketstyle-precompute`)

Real `<Button>` from `@pyreon/ui-components` mounted under real
`<PyreonUI>` provider, 200 mounts × 5 runs, real Chromium via
`@vitest/browser`:

| Profile | unique tuples | cap=32 timed | cap=128 timed | Δ | cold-getTheme (32 → 128) |
|---|---|---|---|---|---|
| HOT_1 | 1 | 5.10ms | 5.10ms | 0 | 0 → 0 |
| MIXED_12 | 12 | 4.90ms | 5.10ms | 0 | 6 → 0 |
| MEDIUM_32 | 32 | 5.40ms | 5.50ms | 0 | 25 → 0 |
| **COLD_60** | **60** | **9.40ms** | **5.10ms** | **−46%** | **888 → 0** |

For workloads ≤ cap, the LRU never evicts → bumping the cap has no
effect (proven by the HOT_1 / MIXED_12 / MEDIUM_32 cells above being
within noise). For workloads > cap, every mount past the cap thrashes
→ raising the cap closes that gap entirely.

## Trade-off

Memory cost is ~12KB per definition per theme at the new cap (128
entries × ~100 bytes per `RsMemoEntry`). For a typical real app with
30 rocketstyle definitions across 2 themes, that's ~720KB — negligible
vs the 46% wall-clock improvement on high-cardinality surfaces.

## Bisect verification

`packages/ui-system/rocketstyle/src/__tests__/memo-cap.test.ts` ships
3 specs:

- 64 unique tuples warm-pass must have ZERO cold resolves (cap ≥ 64)
- 100 unique tuples warm-pass must have ZERO cold resolves (cap ≥ 100)
- 200 unique tuples — control: still evicts (cap < 200), guards
  against an accidental "remove cap entirely" change that would let
  the memo grow unbounded

Reverted `RS_MEMO_CAP` to 32 → the first two specs fail with `expected
N to be 0` (N=64 and N=100 respectively); control spec stays green
(workload still exceeds cap=32, just by less). Restored to 128 →
3/3 pass.

## Surfaces updated

- `packages/ui-system/rocketstyle/src/rocketstyle.ts` — `RS_MEMO_CAP`
  32 → 128 + rationale comment
- `packages/ui-system/rocketstyle/src/__tests__/memo-cap.test.ts` —
  3 regression specs locking the cap behavior via the
  `rocketstyle.getTheme` counter
- `CLAUDE.md` — rocketstyle `_rsMemo` claim updated (32 → 128 +
  rationale + regression-test pointer)
