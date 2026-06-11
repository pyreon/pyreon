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

1. **Baked text-node placeholder — SHIPPED (compiler PR, both backends).** Emit
   `<td> </td>` + `__e.firstChild` instead of per-row
   `document.createTextNode("") + appendChild`. The within-tree paired bench
   (same tree, ONLY the emit flipped, 60 pooled samples/op, bundle shapes verified
   in the artifact) measured BETTER than the hand-emulated estimate: the
   **create-1k gap closes to ZERO** (Pyreon 9.30ms [9.20–9.40] = Vanilla 9.30ms;
   OFF-state Pyreon [9.80–10.20] — CI-clean), **replace-all gap to zero**
   (−500µs), append −1.2ms; create-10k inconclusive under thermal noise,
   trending positive. Lesson recorded: cross-WORKTREE pairing was contaminated
   (trees differed by merged refactors) — within-tree emit-flip is the honest
   protocol for compiler changes.
2. **Hoisted bind function — NULL RESULT, do not re-propose.** The initial
   hand-emulation suggested ~3.5ms @10k, but the PROPERLY-paired re-quantification
   (same tree, same session, --repeat 3, on top of the shipped placeholder emit)
   measured: create-1k gap IDENTICAL (800µs both states), create-10k hoisted WORSE
   (4.7ms vs 3.3ms gap), replace/append within noise. The original "win" was
   cross-run machine drift — exactly the contamination the within-tree paired
   protocol exists to catch. V8 shares bytecode across closure instantiations of
   the same function literal, so the per-row closure cost the hoist was supposed to
   kill is already near-free; joining the hybrid-Set+Array null result in the
   "plausible mechanism, measured dead end" file. The ≥2ms reproduce-gate
   (set BEFORE building) is what kept this from becoming a wasted dual-backend
   compiler transform.

## The residual gap (after selector + placeholder)

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
