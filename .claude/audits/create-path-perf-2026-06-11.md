# Create-path perf audit — closing the bulk-create gap vs Vanilla (2026-06-11)

## Why this audit

The fair benchmark (post-objectivity-pass) shows Pyreon at-or-faster-than Vanilla on
every list operation EXCEPT bulk-create: **+800µs at create-1k (1.10×), +7.4ms at
create-10k (1.085×)** (iteration-0 baseline, 40 pooled samples, Vanilla 8.20/87.30ms
vs Pyreon 9.00/94.70ms). This audit profiled WHERE that gap lives (CDP CPU +
allocation sampling against the real production bench page) and validated three
candidates by measurement — per the standing rule: characterize the workload first,
no speculative micro-opts (the hybrid Set+Array null result is the cautionary tale).

## Profiling method

- `examples/benchmark/bench-cpuprofile.ts` — CDP `Profiler` (50µs samples) over a full
  single-framework suite run on the production build, self-time attribution.
- `examples/benchmark/bench-allocprofile.ts` — CDP `HeapProfiler.startSampling` (16KB),
  allocation-site attribution. Run against an UNMINIFIED build for readable names
  (`vite build` with `build.minify: false` in a throwaway config).
- Comparative: Pyreon vs Vanilla under the IDENTICAL harness — the deltas are the
  framework-attributable cost (harness noise — layout-forcing verification +
  forced GC + idle — is ~86% of samples and cancels out).

## Where the gap lives (iteration-0 profile)

| Self-time | Pyreon | Vanilla | Δ |
|---|---|---|---|
| Total samples | 121,140 | 109,619 | +10.5% (matches the bench delta) |
| **GC** | 32,468 | 27,093 | **+5,375 (~269ms) — HALF the entire delta is allocation pressure** |
| replaceChild | 5,295 | 0 | the deliberate swap-parent bulk-teardown (browser detachment cost, not a bug) |
| cloneNode+insertBefore+createTextNode | 2,368 | ~0 | template instantiation |
| subscribe | 1,366 | 0 | per-row subscriptions |

Top JS allocators (unminified): `_tpl` 28.9% (clone + NativeItem wrapper), native
`Set.add` 14.1% (selector per-key buckets), V8-API DOM wrappers 31%.

## The iterations (all measured on the same machine/session, `--repeat 2` = 40 pooled samples)

| | Vanilla create-10k | Pyreon create-10k | gap | create-1k gap |
|---|---|---|---|---|
| iter-0 baseline | 87.30 | 94.70 | **7.4ms** | 800µs |
| iter-1: selector inline-first-subscriber | 87.70 | 93.70 | **6.0ms** | 600µs |
| iter-2: + baked text placeholder (hand-emulated) | 88.20 | 93.90 | **5.7ms** | 300µs |
| iter-3: + hoisted bind fn (hand-emulated) | 89.00 | 91.20 | **2.2ms** | ~700µs (cv5%, noisy) |

(iters 2–3 were quantified by hand-writing the row factory in the bench impl to the
shape the compiler WOULD emit, then REVERTED — the committed benchmark measures real
compiler output only.)

## What shipped now

**Iteration 1 — selector inline-first-subscriber** (`createSelector.ts`): `boundSubs`
becomes `Map<T, fn | Set<fn>>` — the first subscriber per key is stored as a bare
function; a Set is allocated only when a SECOND subscriber arrives for the same key
(the signal `_d1` trick, PR #1177). The dominant `<For>` + per-row
`isSelected.subscribe(row.id, …)` shape has EXACTLY ONE subscriber per key, so a 10k-row
create previously allocated 10k single-entry Sets (the measured 14.1% `Set.add` line).
Dispose of a sole inline subscriber now DELETES the key (also fixes unbounded Map
growth across create/clear cycles with fresh keys — previously empty Sets accumulated).
**Measured: −1.0ms create-10k, −300µs create-1k (CI-clean), −600µs replace, −800µs
append.** Bisect-verified: reverting the dispose-cleanup fails 2 specs.

## Validated follow-up candidates (compiler emit changes — NOT shipped here)

Both require dual-backend work (JS `jsx.ts` + Rust `native/src/lib.rs` byte-identical
output + native-equivalence specs), which is why they're follow-ups, but both are
QUANTIFIED on the real bench:

1. **Baked text-node placeholder (~0.3ms create-1k gap, ~0.3–0.5ms @10k).** Current
   emit for a dynamic text child: `<td></td>` template + per-row
   `document.createTextNode("") + appendChild`. Emit `<td> </td>` (single-space text
   node survives innerHTML parsing) + `__e.firstChild` instead — `_bindText` writes the
   initial value synchronously, so the space never renders. Saves 2 DOM calls/row.
2. **Hoisted bind function (~3.5ms @10k — the BIG one).** Current emit allocates a
   fresh `bind` closure per row (captures `row`) + a cleanup closure. Hoist the bind
   body to a module-scope function taking `(root, row)` and have the For-row protocol
   pass the item as an argument — kills 1–2 closure allocations per row and was worth
   3.5ms of the 5.7ms remaining gap when hand-emulated. Needs scope analysis (the bind
   body may only reference the row param + module-scope names; bail to the current
   emit when it captures other locals).

## The residual ~2.2ms @10k (after all three)

Remaining allocators: `_tpl`'s NativeItem wrapper + clone (~30%), the For reconciler's
key Set + cache Map adds (12.5%), per-row `signal(label)` (~152B/row — user data,
irreducible), V8 DOM wrappers. Diminishing returns past this point — the swap-parent
`replaceChild` self-time is browser node-detachment work both frameworks pay in some
form.

## Reproduce

```bash
cd examples/benchmark
bun bench-fair.ts --frameworks "Vanilla JS,Pyreon" --repeat 2   # gap measurement
bun bench-cpuprofile.ts Pyreon                                   # CPU self-time
bun bench-allocprofile.ts Pyreon                                 # allocation sites
```
