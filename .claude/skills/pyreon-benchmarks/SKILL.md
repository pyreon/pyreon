---
name: pyreon-benchmarks
description: Pyreon's measured benchmark standings and the measurement protocol that produced them — the krausest-style DOM suite, core micro-benchmarks, per-library head-to-heads, retained-heap numbers, and the honest limits (author-judge, synthetic-not-real-app). Load before making, changing, or reviewing ANY performance claim, before running a benchmark, and before writing a perf number into docs. Carries the traps: never force GC in JSC, never run benches concurrently, NODE_ENV=production before framework imports.
---

# Pyreon Benchmark Results and Measurement Protocol

> Extracted verbatim from CLAUDE.md. This is the authoritative copy — edit it here.

**Pyreon (idiomatic JSX) leads a synthetic krausest-style row-list benchmark** (Chromium via Playwright), after a 2026-06 objectivity pass — but as of 2026-08 that lead is **narrow rather than uncontested**: [Octane](https://octanejs.dev) joined the suite and is the nearest rival — it ties Pyreon on several ops, takes `clear rows` outright (the one op Pyreon is behind on, by one timer quantum), and loses partial-update / remove / create-10k outright to Pyreon (see "Octane is now the nearest rival" below). Treat "fastest framework" as a claim about *this* suite with a live challenger, not a settled fact. On the first FULL-FIELD 8-framework `--repeat 5` runs (2026-08-04 — three same-day passes; the authoritative one at sustained load ~4, load-stamped in the log) the band is: **Pyreon outright on 4–6 ops (append [post-#2669] + partial-update + create-10k robustly; swap/remove/create-1k/replace under quiet load), best-FRAMEWORK-median tie-leader on the rest, and behind on at most ONE op: `clear rows` — one 100µs timer quantum behind Octane (200µs vs 100µs medians; outright Octane in 2 of 4 runs, CI-tied in the other 2 — it oscillates at the timer floor)**. That clear-rows quantum is DECOMPOSED, not mysterious: it is the per-row subscriber teardown (~2×1000 mandatory disposals — label signal + selector effect — measured ≈1ms/1000 rows in happy-dom ≈ the Chromium quantum); the disposal chain is already at the floor (`_d1` null-out, single Set.delete, lazy scope arrays) and the only further lever (epoch-based lazy pruning) would tax the HOT notify path to speed a rare op — declined as a pessimization (see architecture.md). `remove` stays won-or-tied (#2288's removal fast path); `append` is now **OUTRIGHT Pyreon** — #2669 (contiguous-INSERTION fast path, the #2288 mirror) MERGED 2026-08-04 and flipped it: leader 19.00ms on the 2026-08-05 quiet confirm run (load 2.6 stamped, cleanest run of the campaign), down from the pre-#2669 22.2–23.7ms tie band (~15%), and ALSO outright on a load-25 adverse run the same night (noise biases toward ties, so separation under load is the conservative direction). WHICH ops tie still shuffles with machine noise — under load CIs widen and ties multiply (a load-7 run the same day produced 2-outright/2-losses; the quiet run reversed it) — so treat per-op tie-vs-outright as a **band**, and NEVER update this section from a loaded-machine run (stamp `uptime` into the log). Robust signals: a tight cluster with Vue/Solid on small ops + create-1k; a genuine **2.4–3.0× edge over React/Svelte/Preact at bulk-create (10k)**; ~10× on React's keyed `swap`; 3.2–4.1× on Vue/Svelte `append`. Only measurable cost vs **Vanilla** is bulk-create (~6–7%, from per-row signal alloc + cleanup closure + keyed-For map). On **retained memory Pyreon is 3rd of 9 — 2nd among FRAMEWORKS, 0.04MB behind Preact and ahead of Solid, Octane, Svelte, React and Vue** (2026-08-04, identical ordering in 4/4 full-field runs (Pyreon 2.47–2.48): Vanilla 2.34 · Preact 2.44 · **Pyreon 2.48** · Solid 2.53 · Octane 2.56 · Svelte 2.68 · React 2.83 · Vue 3.70; the absolutes sit ~+0.2MB uniformly above the 2026-07 baseline of 2.26/2.22 — a Chromium/run-baseline shift, not a Pyreon regression, and the Preact gap is 0.04MB in both eras). **This line previously claimed 2.90-2.92MB / mid-pack / "the one dimension it does NOT lead" — that was OUR OWN BENCH SCORING US WRONG.** The retained metric read `usedJSHeapSize` after 3 SYNCHRONOUS `gc()` calls, which never yield: reclamation that completes on a later event-loop turn was still counted, so **garbage awaiting collection was reported as "retained"**. Pyreon read 2.90 and settled at 2.23 once given turns (0.67MB reproducibly, 3/3 runs); Preact/Solid/Svelte/React settle immediately and were unaffected — so the old recipe silently penalised ONLY the framework with deferred reclamation and manufactured a ~32% gap that did not exist. Fixed 2026-07-17 (`bench-fair.ts`: GC + yield until the counter stops moving, hard-capped): Vue also improved 3.98→3.48 and Vanilla 2.62→2.12, which is the evidence the fix is uniform rather than self-serving. **Attribution (heap snapshot, node self-size by type) also REFUTES the old stated cause** — Pyreon's `code` space is 579KB vs Preact's 596KB (we ship LESS code), and the JS-only object graphs are near-identical (1.50 vs 1.46MB); the gap was never bundle/code-space. Honest residual: Pyreon uniquely defers ~0.67MB of reclamation by one event-loop turn (released on the next turn in any real app — a latency, not a leak); worth understanding, not a standing loss. Retained has real cross-run variance (Solid measured 2.27–2.97 across same-day runs) — treat mid-table ranks as a band.

| Benchmark | Vanilla | **Pyreon** | Vue 3 | Solid | React 19 | Svelte 5 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 8.40 | **9.00** | 10.00 | 10.40 | 11.60 | 12.60 | 13.90 |
| Replace 1,000 | 8.50 | **9.00** | 9.90 | 10.20 | 11.30 | 12.90 | 13.80 |
| Partial update | 800µs | **700µs** | 1.60 | 4.50 | 1.10 | 2.30 | 1.30 |
| Select row | 0µs | **0µs** | 700µs | 0µs | 300µs | 400µs | 400µs |
| Swap rows | 800µs | **700µs** | 1.40 | 800µs | 7.10 | 2.40 | 1.10 |
| Remove row | 6.90 | **7.30** | 8.40 | 7.20 | 7.50 | 8.80 | 7.80 |
| Clear rows | 100µs | **200µs** | 400µs | 500µs | 1.00 | 400µs | 800µs |
| Create 10,000 | 89.80 | **95.00** | 110.50 | 115.50 | 226.20 | 237.70 | 288.20 |
| Append 1k→10k | 20.90 | **22.40** | 92.30 | 23.80 | 24.70 | 72.10 | 28.30 |

(ms unless noted. Median of 100 pooled samples, Apple M3 Max / Chromium 148. Reproduce: `cd examples/benchmark && bun bench:fair --repeat 5`. This table predates Octane joining the suite — see below.)

### Octane is now the nearest rival (added 2026-08, 8th framework)

[Octane](https://octanejs.dev) — Dominic Gannaway's compiled React framework, successor to Inferno — is in the suite as of PR #2635, and it is **by a clear margin the closest thing to Pyreon that has been measured here**. It displaces Solid as the nearest competitor on most ops.

Pooled head-to-head, `--repeat 3` (60 samples/op, same page-isolated + forced-GC + adaptive-warmup protocol):

| Benchmark | Vanilla | **Pyreon** | Octane |
| --- | --- | --- | --- |
| Create 1,000 | 10.50 | **10.30** | 10.90 |
| Replace 1,000 | 10.40 | **10.50** | 10.90 |
| Partial update | 1.00 | **900µs** | 1.00 |
| Select row | 0µs | **0µs** | 100µs |
| Swap rows | 1.00 | **1.00** | 1.10 |
| Remove row | 7.80 | **8.10** | 8.20 |
| Clear rows | 200µs | **300µs** | 100µs |
| Create 10,000 | 102.40 | **107.60** | 111.80 |
| Append 1k→10k | 25.40 | **27.20** | 29.40 |

**Verdict: Pyreon 4 outright (create-1k, replace, create-10k, append), 4 CI95-ties (partial update, swap, remove, clear), 1 unrankable (select — Pyreon under the timer floor, Octane at 100µs). Octane takes no op outright.** Retained heap after suite: Pyreon 2.48MB vs Octane 2.56MB.

**The one op where Octane genuinely IS better is `clear rows`** — across the three 2026-08-04 full-field runs its median is 100µs vs Pyreon's 200µs (one timer quantum), outright in 2 of 3 runs. This gap has been INVESTIGATED AND ACCEPTED, not left open: the quantum is the per-row subscriber teardown (2 mandatory disposals per row — the app-owned label signal + the selector-driven class effect; skipping them is a Class-B leak), the disposal chain is already at its floor, and the only further lever (epoch/lazy pruning) would add a per-notify branch to the hot path — a bad trade. If Octane clears cheaper, it is because its architecture carries less per-row subscription state, which is the same trade that loses it partial-update to Pyreon's fine-grained bindings.

Scope caveat SUPERSEDED (2026-08-04): the full 8-framework field now has three same-day `--repeat 5`-class runs, the authoritative one at 100 pooled samples/op under sustained load ~4 (load-stamped). Its verdicts: Pyreon outright on partial-update, remove, create-10k; best-framework-median CI-ties on create-1k, replace, swap, append (Pyreon 1.00× in the vs-best table on all four, tie partners Octane and/or Solid); select at the timer floor; clear outright Octane. The 7-framework table above predates Octane and is kept as the historical per-op medians record — the 8-field band in the header paragraph is the current ranking claim.

**Coverage is the bigger gap.** Octane's own suite runs 15 scenarios; ours meaningfully covers ~4 of them (js-framework ops, bundle size, SSR throughput, a Pyreon-vs-React TodoMVC). We have **no** cross-framework coverage for: hydration, streaming SSR, portals, deep context propagation, effect-heavy lists, memoization walls, async waterfalls, or dbmon-style sustained updates. "Fastest" claims from this suite are scoped to keyed row-list DOM work and should not be generalised past it.

**ONE honest Pyreon entry** = the idiomatic JSX users ship (`pyreon.tsx`). There is no manufactured "compiled" tier — the compiler already lowers idiomatic JSX to the same `_tpl()` cloneNode + fine-grained-binding output a hand-written `_tpl()` would (PR #1501 removed a per-row `_bind()` inefficiency for static `<For>`-item reads, making them byte-identical). Earlier "4–8× on small ops" claims were a harness artifact (an `rAF` commit wait inside the timed region + missing per-run resets), fixed by tightest-commit timing (`flushSync`/microtask/synchronous per framework) + per-run reset hooks.

**Methodology** (designed for objectivity): per-framework page isolation (`page.goto('?framework=X')`); forced GC between iterations (`--expose-gc`); adaptive warmup; 20 timed runs + median + 95% bootstrap CI + CV + CI95-overlap `🤝` tied-marker; real Chromium on production `vite build`; DOM verification per iteration; seeded RNG; real published deps; tightest-commit-per-framework (no `rAF`); per-run resets on every op; randomized + per-pass-reshuffled execution order; machine stamp printed; retained-heap metric (`--enable-precise-memory-info`, post-GC). **Honest limits**: this is CPU-objective, not real-world-async-latency (React's default path would be higher); the deepest limit is **author-judge** (the framework author writes + judges the bench) — only an upstream submission to the independent krausest/js-framework-benchmark fully resolves it (a ready-to-submit `frameworks/keyed/pyreon` implementation is staged at `contrib/krausest/pyreon-keyed/` — built + 8-op-smoked against PUBLISHED npm packages; submission steps in its README-SUBMISSION.md — the upstream PR itself is a human decision). A **real-app head-to-head does not exist yet** (the `cpa-pw-app-*` ports run on Pyreon compat shims, not the real frameworks) — "fastest" claims stop at this synthetic suite's evidence.

## Deeper detail — read on demand

| Topic | File | Size |
| --- | --- | --- |
| Core micro-benchmarks: router, reactivity, head, store, state-tree, machine, i18n, permissions, form, query head-to-heads | `references/core-micro-benchmarks.md` | ~4831 tok |

Read with the Read tool:
`.claude/skills/pyreon-benchmarks/references/core-micro-benchmarks.md`
