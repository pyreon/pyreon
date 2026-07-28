---
name: pyreon-benchmarks
description: Pyreon's measured benchmark standings and the measurement protocol that produced them — the krausest-style DOM suite, core micro-benchmarks, per-library head-to-heads, retained-heap numbers, and the honest limits (author-judge, synthetic-not-real-app). Load before making, changing, or reviewing ANY performance claim, before running a benchmark, and before writing a perf number into docs. Carries the traps: never force GC in JSC, never run benches concurrently, NODE_ENV=production before framework imports.
---

# Pyreon Benchmark Results and Measurement Protocol

> Extracted verbatim from CLAUDE.md. This is the authoritative copy — edit it here.

**Pyreon (idiomatic JSX) is the fastest FRAMEWORK on a synthetic krausest-style row-list benchmark** (Chromium via Playwright), after a 2026-06 objectivity pass. On two independent `--repeat 5` pooled runs (2026-07-17, current main) it takes **6 of 9 verdicts outright, ties Solid on 3, and LOSES NONE** — `remove` is now a **tie** (leader 6.90ms; Pyreon held the better median in one run), NOT the loss this line previously recorded: #2288's pure-contiguous-removal fast path closed it. WHICH ops tie shuffles between runs (run 1: select/remove/append · run 2: select/swap/remove) — Pyreon and Solid sit in a tight cluster, so treat per-op tie-vs-outright as a **band**, not a fixed verdict. Robust signals: a tight cluster with Vue/Solid on small ops + create-1k; a genuine **2.4–3.0× edge over React/Svelte/Preact at bulk-create (10k)**; ~10× on React's keyed `swap`; 3.2–4.1× on Vue/Svelte `append`. Only measurable cost vs **Vanilla** is bulk-create (~6–7%, from per-row signal alloc + cleanup closure + keyed-For map). On **retained memory Pyreon is 3rd of 7 — 2nd among FRAMEWORKS, 0.04MB behind Preact (2.26 vs 2.22; Vanilla 2.12 · Solid 2.29 · Svelte 2.46 · React 2.61 · Vue 3.48)**, i.e. a tie with Preact and ahead of Solid. **This line previously claimed 2.90-2.92MB / mid-pack / "the one dimension it does NOT lead" — that was OUR OWN BENCH SCORING US WRONG.** The retained metric read `usedJSHeapSize` after 3 SYNCHRONOUS `gc()` calls, which never yield: reclamation that completes on a later event-loop turn was still counted, so **garbage awaiting collection was reported as "retained"**. Pyreon read 2.90 and settled at 2.23 once given turns (0.67MB reproducibly, 3/3 runs); Preact/Solid/Svelte/React settle immediately and were unaffected — so the old recipe silently penalised ONLY the framework with deferred reclamation and manufactured a ~32% gap that did not exist. Fixed 2026-07-17 (`bench-fair.ts`: GC + yield until the counter stops moving, hard-capped): Vue also improved 3.98→3.48 and Vanilla 2.62→2.12, which is the evidence the fix is uniform rather than self-serving. **Attribution (heap snapshot, node self-size by type) also REFUTES the old stated cause** — Pyreon's `code` space is 579KB vs Preact's 596KB (we ship LESS code), and the JS-only object graphs are near-identical (1.50 vs 1.46MB); the gap was never bundle/code-space. Honest residual: Pyreon uniquely defers ~0.67MB of reclamation by one event-loop turn (released on the next turn in any real app — a latency, not a leak); worth understanding, not a standing loss. Retained has real cross-run variance (Solid measured 2.27–2.97 across same-day runs) — treat mid-table ranks as a band.

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

(ms unless noted. Median of 100 pooled samples, Apple M3 Max / Chromium 148. Reproduce: `cd examples/benchmark && bun bench:fair --repeat 5`.)

**ONE honest Pyreon entry** = the idiomatic JSX users ship (`pyreon.tsx`). There is no manufactured "compiled" tier — the compiler already lowers idiomatic JSX to the same `_tpl()` cloneNode + fine-grained-binding output a hand-written `_tpl()` would (PR #1501 removed a per-row `_bind()` inefficiency for static `<For>`-item reads, making them byte-identical). Earlier "4–8× on small ops" claims were a harness artifact (an `rAF` commit wait inside the timed region + missing per-run resets), fixed by tightest-commit timing (`flushSync`/microtask/synchronous per framework) + per-run reset hooks.

**Methodology** (designed for objectivity): per-framework page isolation (`page.goto('?framework=X')`); forced GC between iterations (`--expose-gc`); adaptive warmup; 20 timed runs + median + 95% bootstrap CI + CV + CI95-overlap `🤝` tied-marker; real Chromium on production `vite build`; DOM verification per iteration; seeded RNG; real published deps; tightest-commit-per-framework (no `rAF`); per-run resets on every op; randomized + per-pass-reshuffled execution order; machine stamp printed; retained-heap metric (`--enable-precise-memory-info`, post-GC). **Honest limits**: this is CPU-objective, not real-world-async-latency (React's default path would be higher); the deepest limit is **author-judge** (the framework author writes + judges the bench) — only an upstream submission to the independent krausest/js-framework-benchmark fully resolves it (a ready-to-submit `frameworks/keyed/pyreon` implementation is staged at `contrib/krausest/pyreon-keyed/` — built + 8-op-smoked against PUBLISHED npm packages; submission steps in its README-SUBMISSION.md — the upstream PR itself is a human decision). A **real-app head-to-head does not exist yet** (the `cpa-pw-app-*` ports run on Pyreon compat shims, not the real frameworks) — "fastest" claims stop at this synthetic suite's evidence.

## Deeper detail — read on demand

| Topic | File | Size |
| --- | --- | --- |
| Core micro-benchmarks: router, reactivity, head, store, state-tree, machine, i18n, permissions, form, query head-to-heads | `references/core-micro-benchmarks.md` | ~4831 tok |

Read with the Read tool:
`.claude/skills/pyreon-benchmarks/references/core-micro-benchmarks.md`
