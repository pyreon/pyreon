---
title: Benchmarks
---

Pyreon's performance work is benchmark-driven. This page publishes the numbers:
the wins, the statistical ties, **and the losses**. The same honesty bar applies
here as everywhere else in these docs: an inflated benchmark is worse than a slow
framework.

For the same record as charts you can switch between, product by product, see
[the benchmarks page](/benchmarks). This guide carries the full tables, the
method and every command to reproduce them.

**How to read this page.** The numbers come from two runs made on
**2026-11-05** on an Apple M3 Max (darwin/arm64, bun 1.4.0, node 26.1.0,
Chromium 156 via Playwright 1.64), against the competitor packages installed at
npm latest:

- the **final pass** on `main` at `779a82f01` (load 1.7–3.8), which measured the
  row-list board, the scenarios, charts, hydration, scaling, bundle size,
  reactivity, router, validation, store, http, rx and table;
- the **overnight run** on `main` at `d47fa5a2f` (load 1.2–3.9), whose figures
  are kept for everything the final pass did not re-measure: server rendering,
  TodoMVC, the form benchmark, head, styler, the compiler, the remaining
  fundamentals packages and the charts and code bundles.

Each section names its run and how many times it was measured. Benches ran
strictly one at a time, with `NODE_ENV=production`, production builds for every
browser suite, and a cross-origin-isolated page so the browser clock resolves
5µs instead of 100µs. Figures are medians with bootstrap 95% confidence
intervals (for the row-list board, a cluster bootstrap over page loads; see
[Harness caveats](#harness-caveats)). A result is a **win** only when the intervals do not overlap **in
both runs**; a cell measured once says "one run". `🤝` marks a statistical tie
(*could not distinguish*, not *equal*). When two runs disagree, both are
reported. Absolute times are machine-dependent — **the ratio is the portable
signal**. The authoritative, complete record is
[`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) at
the repo root; where this page and that file disagree, the file wins.

**Author-judge caveat, stated up front:** these benchmarks are written and
judged by the Pyreon authors, and they are synthetic workloads that do not
predict the performance of your app. The methodology is designed for
objectivity — per-cell process isolation, rotated execution order, correctness
gates that read the result back before a number is trusted, and competitor code
compiled through each framework's own compiler at its idiomatic best — but only
independent reproduction fully resolves author bias. A ready-to-submit
`frameworks/keyed/pyreon` implementation for the independent
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
is staged in-repo at `contrib/krausest/pyreon-keyed/`.

**Three harness defects limit some verdicts below** (details in
[Harness caveats](#harness-caveats)): the harness confidence intervals are too
narrow (the row-list board below is already recomputed with a corrected
bootstrap; the scenario suites are not), the scenario harness can label a loss as a tie, and the table
bench prints a stale `table-core` version.

## Summary

- **Wins (both runs, or one run where marked):** clear rows on the row-list
  board, select and partial update
  vs Octane at every list size (one run), memoization, compiled SSR and
  `renderToString`, an app-shaped hydration page (one run), TodoMVC vs React, a
  12-field form vs six form libraries, `@pyreon/flow` vs React Flow,
  `@pyreon/virtual` vs react-virtual and `@pyreon/charts` vs ECharts (one run
  each), chart updates vs uPlot and Chart.js, the computed diamond, effect
  propagation and batching vs Preact Signals, head, styler, and most
  fundamentals packages.
- **Statistical ties:** create 1,000, replace, partial update, swap and remove
  on the row-list board against the Vue 3.6 Vapor release candidate, Octane 0.16 and
  Vue 3; dbmon; the 1,000-row hydration walk vs Vue; router matching at 50/200
  routes. **Split** (a win in one run, a tie in the other): create 10,000 and
  append on the row-list board, context propagation, effect-list updates, and data-table mount and single-cell update
  vs memoized react-table.
- **Losses:** swap at 100/1,000 rows in the scaling run, deep component-tree mount (Solid
  1.15–1.18×), effect-list dispose (Solid, by one clock tick), some line-chart
  mounts, signal creation, deep computed chains and V8 wide fan-out vs Preact
  Signals, bundle size, router at 10 routes, and a handful of package
  micro-ops. All listed at the end.

**What changed since the overnight version of this page (same day).** The
final pass withdraws five published losses and adds two. Withdrawn: "memoized
react-table mounts 1.12× faster" (now a tie, then Pyreon 1.03×); "Preact Signals
wins the computed diamond" (Pyreon now leads it, 1.30× on V8 and 1.07× on
JavaScriptCore); "Zod wins invalid scalar strings 1.17×" (Pyreon now leads all
12 cells, one run); "creating an http client is 1.46× slower than redaxios" and "a store patch with
a subscriber is 1.3× slower than Zustand" (both now ties). New loss: swap at
100/1,000 rows in the scaling run, which had been "no verdict"; effect-list
dispose, a tie in
one run before, is now Solid's in both. Earlier withdrawals stay
withdrawn: Pyreon is not outright on create 1,000, replace all or create 10,000, Vapor is not
outright on replace all, Pyreon does not have the lowest form-benchmark heap,
and cssVariables theming is 1.13× *slower* than classic mode.

## Flagship: keyed row-list DOM benchmark

*Final pass, two runs.* A krausest-style row-list suite in real Chromium, a
production `vite build` per framework, 100 samples per cell (5 page loads of
20, order reshuffled every pass). The Pyreon entry is the **idiomatic JSX users
write**.

| Benchmark | Vanilla | Pyreon | Vue 3.6 Vapor (RC) | Octane | Vue 3 | Solid | Solid 2.0 (RC) | Svelte 5 | React 19 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 6.78 | 7.26 | 🤝 7.35 | 7.47 | 🤝 7.33 | 7.88 | 8.28 | 8.07 | 9.04 | 9.87 |
| Replace all | 6.69 | 7.13 | 🤝 7.11 | 🤝 7.29 | 7.38 | 7.83 | 8.24 | 8.02 | 8.89 | 9.80 |
| Partial update | 710µs | 705µs | 🤝 710µs | 🤝 735µs | 1.04 | 1.27 | 1.22 | 810µs | 885µs | 920µs |
| Select row | 5µs | 10µs | 25µs | 25µs | 380µs | 30µs | 60µs | 325µs | 260µs | 280µs |
| Swap rows | 790µs | 805µs | 🤝 755µs | 🤝 765µs | 1.06 | 🤝 955µs | 925µs | 1.50 | 6.06 | 995µs |
| Remove row | 5.73 | 5.70 | 🤝 5.76 | 🤝 5.74 | 5.89 | 🤝 5.76 | 5.83 | 6.35 | 🤝 5.78 | 🤝 5.90 |
| Clear rows | 90µs | **130µs** | 145µs | 150µs | 255µs | 460µs | 640µs | 335µs | 920µs | 260µs |
| Create 10,000 | 67.56 | 72.64 | 74.83 | 74.31 | 🤝 73.99 | 78.75 | 82.99 | 87.51 | 192.01 | 278.03 |
| Append 1k→10k | 12.00 | 13.06 | 62.20 | 🤝 13.25 | 62.83 | 13.71 | 14.54 | 19.25 | 15.22 | 16.35 |

(ms unless noted; first of two runs shown; `🤝` = confidence interval overlaps
Pyreon's in that run; **bold** = Pyreon outright in both runs.)

**Verdicts, run 1 / run 2.** These use a cluster bootstrap that resamples whole
page loads, recomputed from the samples each run saved, because the harness's
own intervals are too narrow (see [Harness caveats](#harness-caveats)):

- **Pyreon wins clear rows** in both runs (130 / 135µs vs Vapor 145 / 150µs,
  1.11–1.12×). It is the only outright win on this board.
- **Split** on create 10,000 and append: a tie in run 1, a 1.02× win in run 2.
  Not claimed as wins.
- **Statistical tie for first** on create 1,000, replace all, partial update,
  swap rows and remove row, against the Vue 3.6 Vapor release candidate, Octane
  0.16 and, on some ops, Vue 3, Solid and React.
- **No verdict** on select row, which sits below 10 clock ticks (the batch
  instrument below resolves it).

On the harness's own (too narrow) intervals, swap read as a 1.07× loss to Vapor
in run 1, and create 10,000 and append as wins in both runs. Neither reading
survives the page-load correction, so neither is published.

**Against hand-written Vanilla**, Pyreon costs 0.99–1.09× on every op except
clear and select row, which is below the clock resolution (create 1.07×, replace 1.07×, partial update 0.99×, swap 1.02×, remove
0.99×, create 10k 1.08×, append 1.09×), and 1.44× on clear.

**Retained heap after the suite** (post-GC, MB, the same in both runs): Vanilla
2.95 · **Pyreon 3.08** · Preact 3.09 · Solid 3.16 · Svelte 3.27 · Vue 3.30 ·
Solid 2.0 (RC) 3.44 · React 3.50 · Vapor (RC) 4.09 · Octane 4.50. Pyreon and
Preact are tied as the lightest framework.

Caveats that travel with these numbers:

- Create, replace, remove and append are dominated by browser layout that every
  framework pays identically. For create 1,000 the measured split (overnight
  analysis) is Pyreon JS 1.19ms + layout 7.04ms against Vanilla's 0.68ms +
  7.03ms: the gap to Vanilla is entirely JavaScript, and it is about 7% of the
  operation.
- `create N rows` is a replace for 19 of 20 samples; only the first sample
  mounts into an empty list.
- Pyreon and Solid allocate a per-row signal that the plain-object frameworks
  (Vue, Vapor, Octane) do not.

### Scaling — select, partial update, swap at 100 → 20,000 rows

*Final pass, one run.* A batch instrument (K operations per timing window)
resolves per-op cost below the clock tick. It has Pyreon, Octane and Solid arms
(no Vapor arm).

- **Select** is O(1) for Pyreon and Octane — flat at about 0.43µs vs 0.83µs,
  Pyreon **1.86–2.04×** faster at every size — and O(n) for Solid, which
  Pyreon beats 248× at 20,000 rows.
- **Partial update:** Pyreon **1.05–1.12×** faster than Octane at every size,
  and 1.03–1.07× faster than Solid except a tie at 1,000 rows.
- **Swap:** Pyreon wins from 5,000 rows up (1.03–1.11× vs Octane). **At 100
  and 1,000 rows Octane wins, 1.12× and 1.10×.** One qualification, from the
  overnight run and not repeated here: changing the window size (and so K)
  moved Pyreon's own per-swap figure between 425µs and 481µs and flipped the
  result, which the instrument's soundness condition forbids. The loss is
  reported because every default-window run so far has had Octane ahead.

Reproduce: `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 4`
and `bun bench-crossover.ts --repeat 3` (add `--target-ms 10|20|80|160` for the
window check).

## Scenarios beyond the row list

*Final pass, two runs, real Chromium, 100 samples per cell.*

| Scenario | Pyreon (run 1 / run 2) | Fastest rival (run 1 / run 2) | Verdict |
| --- | --- | --- | --- |
| dbmon tick (100×6 cells, all change) | 1.71 / 1.70ms | Octane 1.74 / 1.68ms | 🤝 tie (Svelte tied too) |
| mount deep tree (2,047 components) | 3.59 / 3.58ms | Solid 3.06 / 3.10ms | **Solid 1.15–1.18×**; React 🤝 Pyreon |
| context → 1,024 consumers | 1.87 / 1.89ms | Solid 1.96 / 1.92ms | Pyreon 1.05× in run 1, 🤝 in run 2 |
| effect list: update 500 | 835 / 797µs | Solid 870 / 880µs | 🤝 in run 1, Pyreon 1.10× in run 2 |
| effect list: dispose 500 | 50 / 45µs | Solid 45 / 40µs | **Solid 1.11–1.13×** (one clock tick) |
| memo wall: blocked (300 consumers) | 11 / 11µs | Vue 16 / 16µs | **Pyreon 1.4×** |
| memo wall: passthrough | 450 / 451µs | Svelte 487 / 487µs | **Pyreon 1.08×** |

- **dbmon** changes every value every tick, which removes a signal graph's
  skip-unchanged advantage by construction; the field converges on the
  DOM-write floor, and it is never quoted as a win for anyone.
- **Deep-tree mount is Pyreon's clearest loss** — 1.15–1.18× behind Solid;
  React and Pyreon are a statistical tie.
- **Dispose 500** sits at two or three clock ticks, and Solid is ahead by one
  tick in both runs. An earlier on-CPU profile put Pyreon's teardown below
  Solid's, so the wall-clock gap is not reproduced as JavaScript cost; it is
  still a loss on this board.

**Flow diagrams — `@pyreon/flow` vs React Flow 12** (500 nodes, 499 edges, one
run): Pyreon wins every op — mount 1.17× (17.19 vs 20.12ms), drag ×60 7.25×,
select 5.4×, add 50 nodes 1.19×, pan+zoom ×60 210×, unmount 3.9×. Neither arm
synthesizes pointer events; both drive their public imperative API and verify
the DOM every iteration.

**Data table — `@pyreon/table` vs `@tanstack/react-table`** (memoized rows,
1,000 rows × 6 columns, real Chromium, two runs): mount is a tie in run 1 and
Pyreon 1.03× in run 2 (25.64 / 25.55 vs 25.81 / 26.36ms); single-cell update
likewise (tie, then 1.03×). Pyreon wins replace (1.11–1.18×), sort
(1.09–1.10×) and unmount (1.42–1.45×). The overnight "react-table mounts 1.12×
faster" did not reproduce in either run and is withdrawn.

**Virtual list — `@pyreon/virtual` vs `@tanstack/react-virtual`** (10,000
rows, real Chromium, one run): Pyreon wins mount (1.15×), 60 scroll steps
(1.04×), jump-to-row (1.10×) and unmount (3.25×).

Reproduce: `cd examples/benchmark && bun bench-scenarios.ts --scenario <name>`
(`dbmon`, `tree`, `effects`, `memo`, `flow`, `table`, `virtual`).

## Charts

**`@pyreon/charts` vs ECharts 6** (line, 800×400 canvas, final pass, one run):
Pyreon wins all four — mount 1,000 points 3.95× (1.03 vs 4.06ms), mount 100,000
points 8.7×, update 100,000 points 5.15×, update 1 of 1,000 points 2.5×.

**vs uPlot 1.6, Chart.js 4 (with decimation) and Recharts 3** (first painted
frame, final pass, two runs). Pyreon is measured with its default row-object
input and with columnar input (the shape uPlot takes):

| op | Pyreon (rows) | Pyreon (columns) | uPlot | Chart.js | Recharts | verdict (both runs) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| mount line, 1,000 | 2.79 | 2.77 | 2.76 | 4.51 | 13.2 | 🤝 Pyreon = uPlot |
| mount line, 10,000 | 3.84 | 3.77 | 3.19 | 5.44 | 70.6 | uPlot ahead: rows input 1.17–1.20× slower; columns 1.18× slower in run 1, tied in run 2 |
| mount line, 100,000 | 5.77 | 5.49 | 5.26 | 6.36 | 644 | 🤝 Pyreon = uPlot |
| mount line, 1,000,000 | 14.92 | 12.11 | 13.47 | 12.81 | 6,726 | 🤝 columns = Chart.js = uPlot; rows input 1.16–1.20× slower than Chart.js |
| update line, 10,000 | 1.17 | **1.09** | 2.25 | 3.71 | 24.2 | **Pyreon** (1.9–2.1× vs uPlot) |
| update line, 100,000 | 2.64 | **2.07** | 4.62 | 3.83 | 184 | **Pyreon** (1.44–1.85× vs Chart.js) |
| mount bars, 1,000 | 5.28 | **5.03** | 21.58 | 11.24 | 41.5 | **Pyreon** (2.1–2.2× vs Chart.js) |

(ms, first run.) The harness prints a tie for the row-input 1M mount in run 1;
that label is wrong, because it compares against the leading *columns* arm
rather than Chart.js (see [Harness caveats](#harness-caveats)). Pyreon renders
an offscreen accessible data table by default; none of the others do. Bundle
cost beyond the runtime (overnight run): a line chart is 38.0KB gzipped vs
ECharts tree-shaken 155.9KB (4.10×); a pie is 19.1 vs 117.2KB.

Reproduce: `bun bench-scenarios.ts --scenario charts` / `--scenario charts-libs`,
`bun bench-charts-bundle.ts`.

## Hydration

**1,000-row table** — final pass, two runs of 100 samples; every framework
adopted 1,000/1,000 server rows:

| | total | walk (framework work) |
| --- | ---: | ---: |
| Vue 3 | 6.02 / 5.99ms | 1.17 / 1.16ms |
| **Pyreon** | 6.07 / 6.04ms | 🤝 1.16 / 1.19ms |
| React 19 | 6.52 / 6.53ms | 1.69 / 1.69ms |
| Preact | 8.56 / 8.53ms | 3.47 / 3.55ms |

Pyreon and Vue are **statistically tied** on the walk in both runs. On the total
Vue has the faster median in both runs: the intervals overlap in run 1 and
separate by 0.01ms in run 2, so Vue is marginally ahead, not a win for either.
Layout is about 80% of every total. About 100µs of Pyreon's walk builds the
per-row state Vue's arm does not.

**App-page shape** (320 statically composed components, 2,206 nodes, all four
adopt every node; final pass, one run): **Pyreon 4.02ms** · React 4.15 (1.03×)
· Preact 4.30 (1.07×) · Vue 4.47 (1.11×).

Reproduce: `cd examples/benchmark && bun bench-hydration.ts` / `bench-apppage.ts`

## Server-side rendering (cross-framework)

*Overnight run, one run.* The same page rendered server-side by each framework
at its **compiled idiomatic best**: Pyreon through the compile-to-string fast
path (the `@pyreon/vite-plugin` default), React through `react-dom/server`, Vue
through its compiled SSR, Svelte through `generate: 'server'`. µs per render, 3
processes pooled per cell.

| rows | Pyreon | Vue 3 | Svelte 5 | React 19 | Pyreon h() walk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | **1.80** | 3.03 (1.68×) | 2.18 (1.21×) | 10.30 (5.72×) | 17.48 |
| 100 | **11.64** | 15.66 (1.35×) | 18.08 (1.55×) | 76.52 (6.57×) | 146.69 |
| 1,000 | **109.9** | 124.9 (1.14×) | 160.5 (1.46×) | 714.4 (6.50×) | 1,387.6 |

**Pyreon leads at every size**, with disjoint intervals at 1,000 rows. Vue's
`renderToString` is async and awaited (its real completion); the others are
synchronous.

A second suite (`bench:ssr-cross`) compares `renderToString` against React,
Preact and Solid with byte-identical output enforced. Pyreon's compiled path
leads every scenario — card 4.68×, list-50 1.64×, list-1000 1.72×, layout 1.74×
ahead of Solid, the next fastest. The uncompiled `h()` walk is 5–6× slower than
the compiled path, which is what an app actually ships.

Reproduce: `cd examples/benchmark && bun bench-ssr.ts`, `bun run bench:ssr-cross`

## Real-app shapes

*Overnight run, one run each.*

**TodoMVC vs `react-dom@19`:** add-100 **1.99×**, toggle-1000 **2.48×**,
clear-1000 **3.14×** faster. The add-100 ratio has read 1.14×, 1.38–1.51× and
1.99× on different days with the same harness, because React's own figure moves
(its CV was 24%); quote it as **1.14–1.99×**.

**12-field form vs six form libraries** (real Chromium): Pyreon leads every
scenario — mount 210µs vs Solid modular-forms 305, keystroke in blur mode 60 vs
100, keystroke with validation 460 vs 570, reset 20 vs 35. Retained heap:
Solid modular-forms 2.33MB, **Pyreon 2.42MB**, then Vue and Svelte at 2.99MB.

## Reactivity core

*Final pass, two runs per engine.* Against Preact Signals and Solid, one process
per cell. On V8 (node 26.1, the engine Chrome uses), with `NODE_ENV` folded as
every bundler does:

| test | Pyreon | Preact | Solid | verdict (both runs) |
| --- | ---: | ---: | ---: | --- |
| signal create+read+write | 63 | **13** | 20 | Preact 4.8× |
| computed diamond (100 updates) | **4,424** | 5,761 | 38,021 | **Pyreon 1.30×** |
| effect propagation (100) | **1,407** | 2,874 | 15,910 | **Pyreon 2.0–2.1×** |
| batch 50 signals | **456** | 888 | 4,759 | **Pyreon 1.95×** |
| deep chain (depth 50, 100) | 107,237 | **75,639** | 677,221 | Preact 1.42–1.43× |
| wide fan-out (1→100 effects) | 1,651 | **1,602** | 4,886 | Preact 1.03–1.04× |

(median ns/op, run 1.)

**Honest read:** on V8 Pyreon wins the computed diamond, effect propagation
and batching, and loses signal create (about 5×), deep chains (1.42–1.43×) and
wide fan-out by 3–4% to Preact. On JavaScriptCore (bun 1.4) Pyreon leads the
diamond (1.07×), effect propagation (2.5–2.7×), batching (2.3×) and wide fan-out
(1.33–1.38×), while Preact leads create (about 5×) and deep chains
(1.15–1.21×). Solid is behind Pyreon on every row except create. The diamond
was a loss on both engines in the overnight run.

The deep-chain loss is specific to an **unobserved** chain (no effect at the
tail): Preact leaves unobserved computeds unsubscribed and validates them on
read, while Pyreon keeps every computed subscribed. With an effect at the tail —
the shape an app renders — the gap is smaller (1.44× when last decomposed,
2026-10-20, before the changes measured here). Signal creation is bound by
prototype setup; per-instance methods were measured and declined (more memory
per signal, slower `.set()`).

**Unbundled Node pays a tax.** A Node process that imports Pyreon's `lib/`
without a bundler (a custom server, a script) keeps live `process.env.NODE_ENV`
reads — about 145ns each under Node — and pays 6–25× on these rows. Bundled
apps do not.

Reproduce: `bun run bench:reactivity` (add `--runtime node` for V8)

## Router matching

*Final pass, one run.* 8 routers, 3 processes pooled, correctness gate over
1,344 cells:

- At **50 and 200 routes** Pyreon averages **1.00× / 1.03×** of the fastest
  (Pyreon and radix3 trade first place; the average row has no confidence
  interval, so this is a tie) — ahead of find-my-way (1.13–1.14×), Hono (3.3×),
  Next.js path-to-regexp (2.8–10.6×), TanStack Router (7.7–8.3×), Vue Router
  (7.7–19×) and React Router (885–3,763×). Per row, Pyreon wins the catch-all
  miss and trails radix3 or find-my-way on static, dynamic, nested-dynamic and
  splat matches by 1.2–1.4×, and on nested static by about 2× (21 vs 10ns).
- At **10 routes Hono leads** (Pyreon 1.91× of best); Hono wins 6 of 7 rows.

Reproduce: `bun run bench:router`

## Head, compiler, styler, validation

- **`@pyreon/head` vs Unhead** (overnight run): serialize 1.22–1.50× faster at
  5/20/50 tags.
- **Styler vs Emotion / goober / styled-components** (overnight run): fastest on
  all four ops — cold insert 3.38× / 3.59×; warm dedup 6.34× / 3.81×; dynamic
  resolve 5.26× / 2.17×; SSR collect 3.56× / 3.99× / 2.30× (styled-components
  includes a React render pass).
- **`@pyreon/validate`** (final pass, one run): fastest on all 12 cells of the
  multi-schema workload. The cell Zod used to win, invalid scalar string, is now
  Pyreon 1.28× ahead of Valibot and 1.40× ahead of Zod, though its interval
  clears Valibot's by only 0.1ns. In the per-cell bench against nine libraries
  the same six cells are lost as before: compiled Zod wins three valid-parse
  cells (email, integer, array of 20), ArkType wins valid object parse (it
  returns the input without cloning) and the invalid-email check, and
  typia/ArkType win the valid-email check. Pyreon wins or ties the other 18,
  including every invalid-input parse.
- **Compiler** (Vite 8 pipeline, overnight run): Pyreon's reactive pass on top
  of OXC costs 2.7–5.7× OXC alone. A build-time cost, disclosed.

Reproduce: `bun run bench:head`, `bun run bench:validate`, `bun run bench:compiler`

## Fundamentals — vs the library each package targets

Each package is benchmarked head-to-head against the library it wraps or
competes with, one process per op × library, under bun (JavaScriptCore). Store,
http, table, rx and the charts engine come from the final pass (one run); the
rest from the overnight run. Rows marked ⚠ run under happy-dom — a JavaScript
DOM implementation, not a browser — so their counts and relative work are
meaningful but their absolute times are not browser-representative.

| Package | vs | Verdict |
| --- | --- | --- |
| `@pyreon/store` | Zustand / Jotai | Wins dispatch 5.5× / 26×, write→subscriber 1.9× / 9.3×, patch 1.6× / 7.5×. **Loses `setup` 28.9× to Zustand** (two signals plus a registry entry); patch-with-subscriber now ties Zustand; read is single-digit ns for both. |
| `@pyreon/storage` | jotai `atomWithStorage` / zustand persist | Writes 10–30×, create 1.7–1.8× faster. Read is 1.5× slower than Zustand (4 vs 3ns). |
| `@pyreon/state-tree` | MobX-State-Tree 9 | 2.2–9.8× faster on every op. |
| `@pyreon/machine` | XState | create 11.4×, send 34.7×, can 6.0×, matches 4.7× faster. |
| `@pyreon/i18n` | i18next | `t` 12.0×, interpolation 5.1×, plural 3.6×, number 3.1×, date 2.7× faster. |
| `@pyreon/permissions` | CASL | Fair resolver race 1.3–1.9× faster; exact deny 🤝 tie. Memo-hit rows are a cache read, not a resolver race, and are not claimed. |
| `@pyreon/http` | ky / ofetch / redaxios / axios | A plain GET is 1.17× faster than ofetch; POST 1.3× and query params 2.4× faster than ofetch; 4.9–21× faster than ky, 1.8–1.9× than redaxios, 9–56× than axios. Creating a client ties redaxios and ofetch; the 5s-timeout GET and middleware tie ofetch. |
| `@pyreon/hotkeys` | tinykeys / hotkeys-js / mousetrap | Dispatch hit 1.7–7.5×, miss 6–118× faster; register + teardown 1.17× faster than tinykeys. |
| `@pyreon/url-state` | nuqs | Booleans 1.8×, arrays 1.2–2.1×, float 1.7× faster. **Loss:** integer parse 1.1× slower (nuqs uses a cheaper integer parser). |
| `@pyreon/form` | @tanstack/form-core | Headless store: update 62×, reset 4.8× faster; setup 🤝 tie. |
| `@pyreon/query` ⚠ | @tanstack/react-query | Same query-core underneath. Data change → DOM 5.6× faster with 8× less derivation work; mount 1.2× faster. |
| `@pyreon/virtual` ⚠ | @tanstack/react-virtual | Scroll → DOM 1.4× faster; mount 1.1× slower here, but 1.15× **faster** in real Chromium. |
| `@pyreon/table` ⚠ | @tanstack/react-table | Against naive rows: single-cell update 13–18×, replace 1.5×, sort 1.7–1.8× faster. Against memoized rows: single-cell update 1.6× faster at 100 rows, replace 1.4–1.5× faster. **Losses here:** mount 1.3× slower at 1,000 rows, single-cell update 1.2× slower than memoized rows at 1,000, sort 1.3× slower than memoized rows at 100. In real Chromium mount ties or wins (above). |
| `@pyreon/toast` | react-hot-toast / sonner | Headless 2.5–3.8×; ⚠ create/update/dismiss → DOM 21–31×. Sonner is excluded from the commit rows (it does not render in happy-dom). |
| `@pyreon/rx` | plain computed / Solid / RxJS | `pipe()` fuses N nodes into one. Per op, filter/map/sum are level with or ahead of a hand-written computed; `pipe` of three stages and `sortBy` read 1.03× a hand computed, but the harness prints no confidence interval, so there is no verdict. |
| `@pyreon/dnd` ⚠ | raw pragmatic-drag-and-drop | Row-enter fan-out 20× (selector vs naive); mount/unmount 🤝 tie; dispatch adds 5ns. |
| `@pyreon/hooks` | Solid / Preact counters | Counter 1.27× / 1.47× faster. |
| `@pyreon/validation` | raw zod / valibot / arktype | Wrapper tax of −24 to +436ns over the raw library (largest on ArkType invalid). |

Reproduce: `cd packages/fundamentals/<pkg> && NODE_ENV=production bun bench/<file>.ts`
(the package's `bench*` script).

## UI layer

- **`@pyreon/kinetic` vs Motion** — the published comparison stays
  **withdrawn**. The current harness measures kinetic *below* the hand-written
  CSS baseline in every cell, which should be impossible for the same work and
  suggests the timed window does not capture CSS-transition work equally across
  arms.
- **`@pyreon/charts` engine vs ECharts 6.1 SSR** (final pass, one run, medians
  without intervals): spec → SVG 7.4–8.2× faster (bars 1k/10k, line 10k).
- **`@pyreon/code` vs @uiw/react-codemirror** (overnight run): the core is 4%
  larger gzipped (same CodeMirror 6 core). The Monaco row is missing —
  monaco-editor failed to bundle.
- **cssVariables theming** (Pyreon-only, measured against a Vite dev server,
  overnight run): classic mode is 1.13× faster than cssVariables mode across 300
  components and 20 flips.

## Bundle sizes

*Final pass.* The same keyed-table app built per framework, gzip -9: Vanilla
3.6KB · **Solid 7.5KB** · Preact 10.1 · Svelte 16.1 · **Pyreon 17.2** (2.30×
Solid) · Vue 27.4 · Octane 43.1 · React 69.6. Every entry carries the same
shared runner module. Pyreon was 16.6KB on 2026-10-20 and 17.1KB in the
overnight run; the bundle-budget history points the first 0.5KB at
runtime-dom changes for hydration and compiled-accessor correctness.

Every published package's main-entry size and canonical minimal-import size are
also gated in CI (ceilings in `scripts/size-budgets/`): a pull request that
grows one by more than 2% has to accept the growth explicitly, so growth cannot
land unnoticed.

Reproduce: `cd examples/benchmark && bun bench-bundle.ts`

## Framework-internal suites

Not competitor claims — these are Pyreon-only regression harnesses that lock hot
paths against drift, run with the same discipline (production define,
isolation, correctness gates). Figures are from the overnight run:

- **SSR handler throughput** (`bun run bench:ssr`, `bun run bench:server`) —
  about 510K empty / 125K five-route / 7.5K hundred-link / 27K 26-nested-layout
  renders per second; the full `createHandler` pipeline serves 109–196K req/s.
- **Styler / Unistyle engine** (`bun run bench:styler`, `bun run
  bench:unistyle`) — resolve → normalize → hash → insert hot paths and the
  responsive-breakpoint engine (a render-cache hit is 79× a cold resolve).
- **Sync (CRDT)** (`bun run bench:sync`) — synced-signal throughput and the
  presence-publish tax over the Yjs engine seam.
- **Document renderers** (`bun run bench:document`) — the render matrix across
  all 16 output formats.
- **Loom workspace scan** (`bun run bench:loom`) — phase timings for a real
  `loom scan` over an actual monorepo. About 98% of a scan is the import phase,
  so the phase split is the point; a total alone invites optimizing the other
  2%.
- **Hooks wrapper tax** (`@pyreon/hooks` bench) — hook wrappers vs raw signals
  (0–6%).
- **Perf counters + leak sweep** — named dev-mode counters
  (`@pyreon/perf-harness`) and a nightly heap-slope leak sweep gate the memory
  story continuously.

## Harness caveats

Three defects in the benchmark harnesses were found while publishing the
2026-11-05 final pass. They are disclosed here rather than fixed silently:

- **The harness confidence intervals are too narrow.** `bench-fair` bootstraps
  its 100 samples as if they were independent, but they come from 5 page loads
  of 20, and page-to-page medians differ (on swap, 620–860µs for every
  framework). A fix that resamples whole page loads is in review (#4129). The
  row-list verdicts on this page are already recomputed that way from the saved
  samples. The scenario suites pool their passes the same way and their logs do
  not keep per-pass samples, so the close scenario verdicts (context,
  effect-list update and dispose, table mount and single-cell update, the 10k
  line-chart mounts) stay provisional until they are re-run.
- **The scenario harness can label a loss as a tie.** It ranks every arm against
  the leader; when the leader is another Pyreon arm with a wide interval (the
  columnar chart arm at 1,000,000 points), a loss to a rival is printed as
  `🤝`. The chart verdicts above are taken against the rival directly.
- **A stale version label.** The table bench prints `table-core@9.0.0`; 9.3.1
  is installed and is what runs. Only the label is wrong.

## What we don't win (the standing list)

Kept current against the 2026-11-05 final pass:

1. **Deep component-tree mount** — 1.15–1.18× behind Solid (3.59 vs 3.06ms);
   React ties Pyreon.
2. **Keyed row-list board** — tied for first, not outright, on create 1,000,
   replace, partial update, swap and remove (Vue 3.6 Vapor release candidate,
   Octane 0.16, Vue 3); create 10,000 and append win only one of two runs.
   Clear rows is the only outright win.
3. **Swap at 100 and 1,000 rows** — Octane 1.12× and 1.10× at the default batch
   window, one run; the result moves with the window size.
4. **Effect-list dispose** — Solid ahead in both runs, by one clock tick.
5. **Line-chart mounts** — with row-object input, 10k points is 1.17–1.20×
   behind uPlot and 1M points 1.16–1.20× behind Chart.js; with columnar input
   these are ties except one 1.18× loss to uPlot at 10k.
6. **Hydration of a keyed table** — tied with Vue on the walk; on the total Vue
   is marginally ahead (tied in one run, 1.01× in the other).
7. **Signal creation** — about 5× slower than Preact on both engines; deep
   computed chains 1.15–1.21× (JSC) to 1.42–1.43× (V8); on V8 also wide fan-out
   by 3–4%.
8. **Bundle size** — 17.2KB vs Solid 7.5KB, Preact 10.1KB and Svelte 16.1KB for
   the same app.
9. **Router at 10 routes** (Hono), and individual static/dynamic/splat matches
   against radix3 and find-my-way.
10. **Package-level losses** — store setup (28.9× vs Zustand), url-state
    integer parse (1.1×), six compiled-Zod / ArkType / typia validation cells,
    form-benchmark heap (Solid modular-forms is lighter), and table and virtual
    mount under happy-dom, plus table single-cell update and sort against
    memoized rows at some sizes under happy-dom.
11. **Not wins, despite a good run** — create 10,000 and append on the row-list
    board, context propagation, effect-list updates, and data-table mount and single-cell update each won one run and tied the
    other.
12. **Unbundled Node** — any process importing `lib/` without a bundler pays
    about 145ns per dev-gate read.

Each of these is either actively being closed or is a priced, documented
trade-off — never hidden.
