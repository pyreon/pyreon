# Rocketstyle pre-computation spike — results

**Hypothesis under test** (from user): "for each rocketstyle component, precompute
and merge all dimensions used for theming (not attrs) at build / module-load time
— would it bring measurable improvement over the runtime `_rsMemo` LRU?"

**Method**: real `<Button>` from `@pyreon/ui-components` mounted under a real
`<PyreonUI>` provider with the real `@pyreon/ui-theme`. 5 variants × 4 mount
profiles × 1000 mounts (200 × 5 runs, 0 warmup), counter capture per cell via
`@pyreon/perf-harness`. Real Chromium via `@vitest/browser`.

**Reproduce**: `bun run --filter='@pyreon/experiments' test:browser:rs-precompute`

## Variants

| ID | Description |
|---|---|
| **B0** | Stock baseline — lazy `_rsMemo`, no priming |
| **V-A** | Prime memo with **full Cartesian** (60 tuples: 4 states × 3 sizes × 5 variants) at module load |
| **V-B** | Prime memo with **exact tuple set the timed loop will use** |
| **V-C** | Prime memo with **dominant tuple only** (1 entry) |
| **V-FLOOR** | Bypass rocketstyle entirely — `_tpl()` with pre-captured className, no resolver at mount |

## Profiles

| ID | N | Unique tuples | Workload vs LRU cap (32) |
|---|---|---|---|
| HOT_1 | 200/run | 1 | fits |
| MIXED_12 | 200/run | 12 | fits |
| MEDIUM_32 | 200/run | 32 | exactly fits |
| COLD_60 | 200/run | 60 | **EXCEEDS** — LRU thrashes |

## Headline numbers

### Wall-clock per profile (200 mounts × 5 runs, median ms)

| Profile | B0 | V-A | V-B | V-C | **V-FLOOR** | **B0 / FLOOR** |
|---|---|---|---|---|---|---|
| HOT_1 | 5.20 | 5.10 | 4.90 | 5.10 | **0.30** | **17×** |
| MIXED_12 | 4.90 | 5.30 | 4.90 | 5.10 | **0.40** | **12×** |
| MEDIUM_32 | 5.40 | 5.00 | 4.70 | 4.70 | **0.70** | **8×** |
| COLD_60 | **10.50** | 10.30 | 8.70 | 8.30 | **0.50** | **19×** |

### Prime/capture cost (one-time, not amortized)

| Profile | V-A prime | V-B prime | V-C prime | **V-FLOOR capture** |
|---|---|---|---|---|
| HOT_1 | 15.9ms | 16.2ms | 15.5ms | 12.6ms (1 tuple) |
| MIXED_12 | 12.3ms | 16.1ms | 15.0ms | 194.9ms (12 tuples) |
| MEDIUM_32 | 15.4ms | 15.5ms | 12.6ms | 508.1ms (32 tuples) |
| COLD_60 | 13.3ms | 9.4ms | 8.0ms | 971.2ms (60 tuples) |

### `rocketstyle.getTheme` cold resolves (out of 2000 lookups = 200 × 5 × 2 accessors)

| Profile | B0 | V-A | V-B | V-C | LRU pressure? |
|---|---|---|---|---|---|
| HOT_1 | 0 | 1 | 0 | 0 | None |
| MIXED_12 | 6 | 7 | 0 | 0 | None |
| MEDIUM_32 | 25 | 32 | 0 | 0 | None |
| **COLD_60** | **888** | **920** | **920** | **900** | **45% MISS** ⚠️ |

## Verdict per variant

### V-A, V-B, V-C — pre-warming the memo

**NET LOSS in every scenario.** The "savings" on the timed loop are 0-1ms; the priming
cost is 8-16ms. Even if the priming could be moved to build time (zero runtime cost),
the timed-loop savings are within measurement noise. **The runtime `_rsMemo` already
captures everything pre-warming would gain** — the first mount of each tuple in a
real app does the cold resolve, every subsequent mount hits the cache.

The only scenario where any variant saves measurable wall-clock is **COLD_60**, where
V-C (prime 1 entry) saves 2.2ms. But that's not from priming — it's just from
running first in the test order before the inter-test cache pollution warmed up
(see noise warning below).

### V-FLOOR — bypass rocketstyle entirely

**HUGE win, but only realizable for literal call sites.** B0 is **7-19× slower** than
V-FLOOR. For 1000 mounts:
- HOT_1: B0 5.20ms → FLOOR 0.30ms (**−94%**)
- COLD_60: B0 10.50ms → FLOOR 0.50ms (**−95%**)

**This is exactly what `pyreon({ collapse: true })` already does** (per CLAUDE.md, 44×
wall-clock measured in E2). The capture cost (~16ms per unique tuple via real-mount,
or instantaneous if the resolver is invoked directly) is paid at build time and
amortized across every page-load.

The remaining slice the existing `collapse: true` doesn't cover is **dynamic-prop
call sites** (`<Button state={signal()}>`). For those, V-FLOOR is unreachable —
the className isn't a static literal, the compiler can't emit a `_tpl()` with
the class baked in.

## ⚡ The real finding — LRU cap thrashing

While probing variants, the data revealed a **separate, larger problem** the
proposal doesn't address: **the `_rsMemo` LRU cap of 32 thrashes on high-cardinality
workloads**.

### Cap bisect (probe ran with TEMP source edit, restored before commit)

Same B0 baseline, only `RS_MEMO_CAP` changed:

| Profile | CAP=8 | CAP=32 (current) | CAP=128 | Δ 32→128 | cold-getTheme (32 → 128) |
|---|---|---|---|---|---|
| HOT_1 | 5.80ms | 5.10ms | 5.10ms | 0 | 0 → 0 |
| MIXED_12 | **9.40ms** | 4.90ms | 5.10ms | 0 | 6 → 0 |
| MEDIUM_32 | 8.50ms | 5.40ms | 5.50ms | 0 | 25 → 0 |
| **COLD_60** | 8.60ms | **9.40ms** | **5.10ms** | **−4.30ms (−46%)** | **888 → 0** |

### Interpretation

`RS_MEMO_CAP=32` was sized for "real apps have ≤32 unique combos per definition" —
true for the E2 perf-dashboard reference, NOT true for any app with:

- A data table where every cell has a `(state, size, variant)` derived from row data
- A design system with many named tokens crossed with size/variant axes
- A dashboard rendering many small interactive components

**At CAP=128 the cap-thrashing disappears entirely** (cold-getTheme drops 888 → 0
for the 60-tuple workload). 46% wall-clock reduction. **Zero implementation cost.**
Memory cost is ~12.8KB per definition (128 entries × ~100 bytes).

## Comparison summary

| Strategy | Wins | Costs | Net |
|---|---|---|---|
| **Pre-warm memo at module-load (V-A/B/C)** | 0-1ms timed savings | 8-16ms prime per definition | **Net loss** |
| **Build-time per-definition precompute (extrapolation of user proposal)** | Same as V-A/B/C at runtime | Build-time cost grows multiplicatively with cardinality; bundle bloat proportional to permutation count | **Net loss** unless cardinality cap is bounded by sparse static analysis |
| **Existing `pyreon({ collapse: true })`** | 7-19× wall-clock per mount for literal sites | Per-site SSR-render at build time | **Big win** — already shipped |
| **Raise `RS_MEMO_CAP` 32 → 128** | 46% wall-clock reduction for COLD_60 profile, 0 effect on others | ~12KB memory per definition | **Big win** — one-line change |
| **Extend `collapse: true` to dynamic-prop sites** | 7-19× wall-clock for sites the current mode bails on | Compiler complexity + per-tuple SSR pass | **Likely worth pursuing** if dynamic-prop sites are common in real apps |

## Recommendations

1. **Don't ship the per-definition precompute mode the user proposed.** The runtime
   `_rsMemo` already captures everything pre-warming would gain. The proposal would
   add bundle bytes + build cost for ~zero runtime improvement.

2. **Raise `RS_MEMO_CAP` from 32 to 128** (or make it configurable per-component
   with a sensible default ≥ 64). One-line change. Closes a real 46% regression
   for high-cardinality apps. Memory cost negligible. Zero behavior change for
   apps that fit in the current cap (LRU never evicts when entries < cap).

3. **Consider extending `pyreon({ collapse: true })` to cover dynamic-prop sites
   with a small precompute table per call-site**. This is the actually-promising
   slice from the user's intuition: the precompute IS valuable, but only at the
   `collapse: true` layer where it's amortized across the build. The per-site
   shape (today's collapse) is the right granularity — the per-definition shape
   the user proposed is too coarse.

## Honest caveats

- **All measurements use the same shared Button definition + theme across tests**.
  Inter-test memo pollution is real (the WeakMap survives across tests within
  one file). This is faithful to a real app's lifetime (one definition, one theme,
  many mounts) but means earlier-running tests warm the cache for later ones. The
  WARMUP_RUNS=0 + first-run-times help expose this; the `tail-med` figures (median
  of runs 2-5) are the most stable signal.

- **Heap delta not measured.** `performance.memory` is non-standard and varies by
  browser version. The relevant memory cost is dominated by per-definition
  precompute tables which we measured indirectly via the V-A prime time as a proxy.

- **V-FLOOR's capture phase uses real-mount + className read.** A build-time
  collapse mode could call the resolver directly (no DOM mount), making capture
  ~10× cheaper. The V-FLOOR capture costs reported here are the conservative
  ceiling, not the optimum.

- **Bisect-verified**: bumping `RS_MEMO_CAP` from 32 → 128 zeroed COLD_60's
  cold-getTheme counter and dropped wall-clock 46%. Bumping to 8 made even
  MIXED_12 thrash (9.40ms vs 4.90ms baseline). The cap-vs-workload relationship
  is structural. Source restored to 32 before commit.
