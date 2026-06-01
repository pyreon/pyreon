---
'@pyreon/reactivity': patch
---

fix(reactivity): defer `_rdRecordFire` EWMA from always-on capture path to read-time reconstruction

`_rdRecordFire` runs on every signal write / computed recompute / effect run in `__DEV__`, regardless of whether a devtools panel is attached. Pre-fix it maintained an incremental EWMA via `Math.exp(-dt/TAU)` on every fire, plus a `rec.rate1s` field on each `NodeRec`. A 60Hz animation signal in dev burned 60 `Math.exp` calls per second when devtools was closed — multiplicatively worse than the per-creation `_rdRegister` overhead (already deferred per `[deferred-parse-for-always-on-capture]`).

The naive fix ("restore `if (!_active) return`") would break the attach-after-mount workflow that PR #913 deliberately enabled — the panel needs to see fires that happened BEFORE it opened. Identified in the post v0.25.1 framework audit as the remaining always-on cost.

**Fix**: move EWMA computation from capture to read time. The pre-existing fire ring buffer (`_fireBuf`, 512 entries) already stores per-fire `(id, ts)` pairs. `getFireSummaries()` now builds a per-id EWMA accumulator in one pass over the buffer at read time — only when devtools is active (the function is `_active`-gated). The incremental recurrence `r_n = r_{n-1} * exp(-dt/TAU) + 1` unfolds to `sum_i exp(-(t_n - t_i) / TAU)`; decay-to-now then yields `sum_i exp(-(now - t_i) / TAU)` — exactly what the read-time loop computes. **Mathematically identical to the pre-fix value** within FP rounding, modulo fires evicted by the 512-entry ring buffer window (fires older than ~5×TAU contribute <0.7% of their weight, and 512 fires in <5s implies >100Hz — structurally bounded undercount at extreme rates, identical at typical rates).

Capture path is now `rec.fires++` + ring-buffer write only — zero float ops, zero branches per fire.

## API contract

Unchanged on the public surface:
- `FireSummary.rate1s` field preserved.
- `getFireSummaries()` returns the same shape.
- `getReactiveGraph()` / `getReactiveFires()` unchanged.

Internal-only changes:
- `NodeRec.rate1s` field removed (no longer needed — rate is reconstructed at read time).
- `_rdRecordFire` body simplified.

Verified consumer surfaces still work: `@pyreon/compiler` (1429 specs), `@pyreon/lint` (921 specs), `@pyreon/vite-plugin` (252 specs) — all read `FireSummary.rate1s` via LPIH integration; all green post-fix.

## Bisect-verify

3 new structural specs in `packages/core/reactivity/src/tests/rdrecord-fire-microbench.test.ts` that count `Math.exp` calls during fire capture (via patched-prototype interception). Each asserts the capture path makes ZERO calls to `Math.exp`. Reverting the EWMA block inside `_rdRecordFire` fails the specs with `AssertionError: expected 999 to be +0` (1000 fires = 999 EWMA decays, one skipped on the first-fire `lastFire === null` branch) and `AssertionError: expected 9900 to be +0` (10000 fires - 100 first-fires = 9900). Restoring → 3/3 microbench specs green, 464/464 reactivity green, all 23 `LPIH — rate1s EWMA tracking` specs in `lpih-source-location.test.ts` still pass (proving the read-time reconstruction is mathematically equivalent).
