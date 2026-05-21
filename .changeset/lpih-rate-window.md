---
'@pyreon/reactivity': minor
'@pyreon/compiler': minor
---

LPIH: sustained-rate hint via EWMA. Inlay-hint labels now show both cumulative fire count AND current fires/second when active — making hot-path debugging visible at a glance.

```tsx
const count = signal(0)             // 🔥 signal fired 240× (12/s) — active
const stable = signal(0)            // 🔥 signal fired 240×          — idle
```

**Why**: cumulative count alone can't distinguish "this is firing right now" from "this fired a lot a few minutes ago." For hot-path debugging (the LPIH #1 use case), the user needs to see _current_ rate. Adding a decayed-EWMA rate alongside the cumulative count gives both signals without bloating the label.

**Math**: per-node EWMA with 1-second time constant (`LPIH_RATE_TAU_MS = 1000`). On each fire:

```
dt = ts - lastFire
decay = exp(-dt / 1000)
rate1s = rate1s * decay + 1
```

At steady state of λ fires/sec, `rate1s → λ` (when λ·TAU ≫ 1 — true for any rate worth noticing). On read, decay-to-now applied: a node that stopped firing 1.5s ago shows ≈22% of its peak rate; 3s ago shows ≈5%; 5s ago shows ≈0.7% (below the visibility threshold).

**`@pyreon/reactivity`**:

- `FireSummary.rate1s: number` — new field, decayed to "now" at every `getFireSummaries()` call.
- `NodeRec.rate1s` — internal per-node EWMA state, updated on every fire.
- `LPIH_RATE_TAU_MS` — exported constant (1000 ms = 1 second time constant).
- Bridge `writeLpihCache` now includes `rate1s` in each fire entry's JSON.

**`@pyreon/compiler`**:

- `LPIHFireDatum.rate1s?: number` — optional field; older runtimes that don't emit it produce labels without the rate suffix (backward-compatible).
- `_LPIH_RATE_VISIBLE_THRESHOLD = 0.5` — rates below this are suppressed (don't show "0.1/s" or "0/s" noise from decayed-dormant nodes).
- Default label formatter: `signal fired 240× (12/s)` when active, `signal fired 240×` when below threshold or no rate field.
- Custom `formatDetail` callbacks receive the full `LPIHFireDatum` including `rate1s` for fully custom labels.
- Multiple fires at the same line have their rates summed (consistent with the existing count-summing behavior).

**`@pyreon/lint`**:

- `LPIHCacheEntry.rate1s?: number` — round-trips through the cache; no LSP-side logic change beyond the type extension. The compiler's default formatter picks up the new field automatically.

**Tests** (+12 new across all 3 packages, 2383 total, all green):

- @pyreon/reactivity: 367 (+5 — rate1s captured, rises with bursts, decays after TAU, sums at same location, constant value lock)
- @pyreon/compiler: 1316 (+7 — threshold-suppress, 1-decimal vs integer rounding, creation-site formatter, line-sum, custom formatter receives rate, missing-field passthrough)
- @pyreon/lint: 700 (no new tests — rate1s is data-only round-trip through the cache; existing integration tests cover the path)

**Memory + performance**: one extra `number` field per node (+8 bytes). One `Math.exp` per fire (~50 ns). One `Math.exp` per location per `getFireSummaries()` call. Bundle-budget impact: 0 (writeLpihCache code path was already in the subpath, this just adds one field to the JSON payload).

**Bisect-verified**: stashing the EWMA update in `_rdRecordFire` fails the new "rate1s rises with rapid fires" + "rate1s for many rapid fires reflects fire density" tests.

**Docs**: example block in `docs/docs/lpih.md` updated to show `(12/s)` rate suffix; new paragraph explaining the cumulative-count + current-rate split.
