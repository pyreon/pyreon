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

**How to read this page.** The numbers come from five runs on an Apple M3
Max (darwin/arm64, bun 1.4.0, node 26.1.0), against the competitor packages
installed at the time:

- the **2026-11-26 fair-fixture re-measurement** on `main` at `28d24b6ed`, in
  Chromium 159 via Playwright 1.65 (load below 4 throughout), the first run on
  fixtures where every framework builds the same DOM (#4862). It re-measured
  the row-list board and its heap, the core scenarios (deep tree and context,
  effect list, memo wall), the keyed `.map()` list and the retained heap of one
  deep tree. Its row board ran the small operations on a shifted baseline, so
  the verdicts it alone flipped in Pyreon's favour are held back (below);
- the **2026-11-25 re-measurement** on `main` at `dfbdecfc7`, same browser,
  whose verdicts stand for those held-back rows;
- the **2026-11-24 refresh** on `fcccee261` (`main` at `a48a7cba1` plus the
  Solid 2.0 stable arms), same browser and rival versions, kept for the bundle
  size;
- the **2026-11-05 final pass** on `main` at `779a82f01` (Chromium 156, load
  1.7–3.8), kept for dbmon, the library and chart scenarios, hydration,
  scaling, reactivity, router, validation, store, http, rx and table;
- the **2026-11-05 overnight run** on `main` at `d47fa5a2f` (load 1.2–3.9),
  kept for everything neither re-measured: server rendering, TodoMVC, the form
  benchmark, head, styler, the compiler, the remaining fundamentals packages
  and the charts and code bundles.

Each section names its run and how many times it was measured. Benches ran
strictly one at a time, with `NODE_ENV=production`, production builds for every
browser suite, and a cross-origin-isolated page so the browser clock resolves
5µs instead of 100µs. Figures are medians with bootstrap 95% confidence
intervals (a cluster bootstrap over page loads for everything the refreshes
and re-measurements measured; see [Harness caveats](#harness-caveats)). A per-op median below 10
clock ticks (50µs) gets no verdict. A result is a **win** only when the intervals do not overlap **in
both runs**; a cell measured once says "one run". `🤝` marks a statistical tie
(*could not distinguish*, not *equal*). When two runs disagree, both are
reported. Absolute times are machine-dependent — **the ratio is the portable
signal**. The authoritative, complete record is
[`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) at
the repo root; where this page and that file disagree, the file wins.

**Author-judge caveat, stated up front:** these benchmarks are written and
judged by the Pyreon authors, run on one machine in one browser engine
(Chromium), and they are synthetic workloads that do not predict the
performance of your app. The methodology is designed for
objectivity — per-cell process isolation, rotated execution order, correctness
gates that read the result back before a number is trusted, and competitor code
compiled through each framework's own compiler at its idiomatic best — but only
independent reproduction fully resolves author bias. A ready-to-submit
`frameworks/keyed/pyreon` implementation for the independent
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
is staged in-repo at `contrib/krausest/pyreon-keyed/`.

**Harness notes limit some 2026-11-05 verdicts below** (details in
[Harness caveats](#harness-caveats)): the scenario rows kept from 2026-11-05
were pooled before the page-load-aware bootstrap, the scenario harness can label
a loss as a tie, and the table bench prints a stale `table-core` version.

## Summary

- **Wins (both runs, or one run where marked):** batch-timed select on the
  row-list board, context propagation to 1,024 consumers, the memo wall's
  passthrough update, clear 1,000 rows on the keyed list with conditional slots
  (with `<For>` and with a plain `.map()`), select and partial update vs Octane
  at every list size (one run), compiled SSR and `renderToString`, an
  app-shaped hydration page (one run), TodoMVC vs React, a 12-field form vs six
  form libraries, `@pyreon/flow` vs React Flow, `@pyreon/virtual` vs
  react-virtual and `@pyreon/charts` vs ECharts (one run each), chart updates
  vs uPlot and Chart.js, the computed diamond, effect propagation and batching
  vs Preact Signals, head, styler, and most fundamentals packages.
- **Statistical ties:** create 1,000, replace, partial update, remove and
  append on the row-list board against the Vue 3.6 Vapor release candidate,
  Octane 0.19 and Vue 3; the deep component-tree mount against Solid 1.9;
  effect-list updates; dbmon; the 1,000-row hydration walk vs Vue; router
  matching at 50/200 routes. **Split** (the two runs disagree, so not
  claimed): clear rows, swap and create 10,000 on the row-list board, the memo
  wall's blocked update, `.map()` remove on the keyed list, and data-table
  mount and single-cell update vs memoized react-table. The row-list retained
  heap is level with Preact's (0.01MB apart, no confidence interval).
- **Held back:** the 2026-11-26 session measured two-run wins on the row-list
  board's partial update (1.06–1.07×), clear rows (1.16–1.21×) and append
  (1.02–1.03×), a two-run tie on swap, and a 1.05× win on the keyed list's
  `<For>` swap. Every arm, hand-written Vanilla included, ran those small
  operations much faster in that session than the day before, for a reason not
  yet found, so they are published with the previous verdicts until a second
  session agrees.
- **Losses:** retained memory per component (a mounted 2,047-component tree
  holds 1.72× Solid 1.9's heap), create and replace on the keyed list (with
  `<For>` and with a plain `.map()`), swap at 100/1,000 rows in the scaling
  run, some line-chart mounts, signal creation, deep computed chains and V8
  wide fan-out vs Preact Signals, bundle size, router at 10 routes, and a
  handful of package micro-ops. The row-list board's batch-timed clear cycle
  lost 1.02× to Octane in the 2026-11-25 session and tied in the 2026-11-24
  and 2026-11-26 sessions; it is listed with the losses, not claimed either
  way. All listed at the end.

**What changed in the 2026-11-25 and 2026-11-26 re-measurements.** The
2026-11-26 run is the first in which every framework builds the same DOM: the
deep tree and the context scenario used to mount with an empty value, for which
Pyreon, Preact and Vanilla created 1,024 empty text nodes that React, Vue and
both Solids did not, and three Svelte templates kept whitespace text nodes no
other framework renders. On equal DOMs the deep-tree mount ties Solid 1.9 in
both runs (it split on 2026-11-25), context propagation becomes a two-run win
(1.03–1.07× over Solid 2.0), and the memo wall's passthrough lead grows to
1.11×. Some results got worse and are published that way: the keyed list's
`<For>` create and replace became two-run losses (they split), the `.map()`
arm's clear lead shrank to 1.09–1.10×, `.map()` remove now splits, and the memo
wall's blocked update splits instead of tying. Since 2026-11-24, clear rows on
the row-list board went from a win to a split, the batch-timed select moved
from 1.58× to 1.49–1.50× and then 1.78–1.85×, the deep tree retains 356KB
instead of 532KB (below Solid 2.0, still 1.72× Solid 1.9), and the row-list
heap is level with Preact instead of 0.07MB heavier. These are comparisons
between sessions on different commits, not A/B runs, so the page does not
attribute them to a change.

**What changed in the 2026-11-24 refresh.** The deep-tree mount loss to Solid
(1.15–1.18×) of 2026-11-05 was bisected to #4199 (static component props
folded at compile time), merged after the 2026-11-05 record. Effect-list
dispose stopped being a loss and has no verdict (below 10 clock ticks), the
memo wall's blocked update ties the new Solid 2.0 arm, and the keyed `.map()`
list and the deep tree's retained heap were published for the first time. The
bundle grew from 17.2 to 18.5KB. The 2026-11-05 withdrawals stay withdrawn:
Pyreon is not outright on create 1,000, replace all or create 10,000, Vapor is
not outright on replace all, Pyreon does not have the lowest form-benchmark
heap, and cssVariables theming is 1.13× *slower* than classic mode.

## Flagship: keyed row-list DOM benchmark

*2026-11-26 fair-fixture re-measurement, two runs.* A krausest-style row-list
suite in real Chromium, a production `vite build` per framework, 100 samples
per cell (5 page loads of 20, order reshuffled every page load). The Pyreon
entry is the **idiomatic JSX users write**.

**Read the small operations as ratios.** In this session every framework,
hand-written Vanilla included, ran partial update, swap and clear much faster
than on 2026-11-25 (Vanilla 685 → 525µs, 800 → 455µs, 90 → 65µs), while
create 1,000 got slightly slower (6.66 → 6.84ms). Nothing the board runs
changed between the two commits, and the cause is not found. Comparisons inside
the session are valid, but the verdicts it flipped in Pyreon's favour are held
back until a second session agrees; the last column says what is published.

| Benchmark | Vanilla | Pyreon | Vue 3.6 Vapor (RC) | Octane 0.19 | Vue 3 | Solid 1.9 | Solid 2.0 | Svelte 5 | React 19 | Preact | Published verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 6.84 | 7.40 | 7.50 | 7.46 | 7.42 | 8.09 | 8.07 | 8.23 | 9.44 | 10.70 | 🤝 tie |
| Replace all | 6.84 | 7.28 | 7.40 | 7.31 | 7.44 | 8.09 | 7.95 | 8.16 | 9.26 | 10.53 | 🤝 tie |
| Partial update | 525µs | 505µs | 535µs | 540µs | 840µs | 1.08 | 1.05 | 625µs | 750µs | 820µs | 🤝 tie (held back) |
| Select row | 5µs | 5µs | 15µs | 15µs | 280µs | 15µs | 35µs | 255µs | 185µs | 200µs | no verdict |
| Swap rows | 455µs | 480µs | 490µs | 500µs | 730µs | 625µs | 510µs | 1.18 | 5.89 | 695µs | split (held back) |
| Remove row | 5.75 | 5.78 | 5.78 | 5.76 | 6.01 | 5.84 | 5.81 | 6.50 | 6.08 | 6.03 | 🤝 tie |
| Clear rows | 65µs | 95µs | 115µs | 115µs | 190µs | 440µs | 255µs | 300µs | 610µs | 240µs | split (held back) |
| Create 10,000 | 68.75 | 74.33 | 76.31 | 76.41 | 75.94 | 80.45 | 82.08 | 89.92 | 198.63 | 288.14 | split |
| Append 1k→10k | 12.26 | 13.11 | 63.19 | 13.47 | 64.14 | 14.10 | 14.09 | 19.47 | 15.51 | 16.67 | 🤝 tie (held back) |

(ms unless noted; first of two runs shown. No per-op row is a published Pyreon
win.) A batch-timed select row (five arms) resolves what the per-op row cannot:
Pyreon 0.87µs per cycle against Octane 1.61, Solid 2.0 4.45 and Solid 1.9 16µs.
A batch-timed clear cycle on the same five arms: Octane 7.43ms, Pyreon 7.53,
Solid 1.9 7.75, Solid 2.0 8.03 (Vanilla 7.08).

**Verdicts, run 1 / run 2.** Intervals come from a cluster bootstrap that
resamples whole page loads:

- **Pyreon wins the batch-timed select** in both runs (0.87 / 0.89 vs Octane
  1.61 / 1.57µs, 1.78–1.85×; it was 1.49–1.50× on 2026-11-25). It is the only
  published outright row-board win.
- **Statistical tie for first** on create 1,000, replace all and remove row,
  against the Vue 3.6 Vapor release candidate, Octane 0.19 and Vue 3.
- **Split**, so not claimed: create 10,000 (a win in run 1, a tie in run 2;
  Pyreon's median 1.02× ahead in both).
- **Held back** (this session alone flipped them; the 2026-11-25 verdict is
  published): partial update stays a tie (this session 505 / 500 vs Vapor
  535 / 535µs, a 1.06–1.07× win in both runs); clear rows stays a split (this
  session 95 / 95 vs Octane 115 / 110µs, 1.16–1.21× in both runs); append stays
  a tie (13.11 / 13.22 vs Octane 13.47 / 13.51ms, 1.02–1.03× in both runs);
  swap stays a split (on 2026-11-25 Vapor was 1.07× ahead in one run; this
  session tied in both).
- **Sessions disagree**, not claimed either way: the batch-timed clear cycle
  tied Octane in this session (7.53 / 7.58 vs 7.43 / 7.41ms, Octane's median
  1.01–1.02× ahead), lost 1.02× in both runs on 2026-11-25 and tied on
  2026-11-24.
- **No verdict** on the per-op select row, which sits below 10 clock ticks.

**Against Solid 1.9 and Solid 2.0**, Pyreon is faster in both runs on create
1,000 (1.09×), replace (1.09–1.11×), partial update (2.08–2.13×), clear
(2.5–4.7×), create 10,000 (1.08–1.10×), append (1.06–1.08×) and the batch-timed
select (5.0–18×); remove row ties both; swap splits with Solid 2.0, and its
1.30–1.34× lead over Solid 1.9 in this session is held back (it split in the
two earlier sessions).

**Against hand-written Vanilla**, Pyreon costs 0.96–1.08× on every op except
clear and select row, which is below the clock resolution (create 1.08×,
replace 1.06×, partial update 0.96×, swap 1.05×, remove 1.01×, create 10k
1.08×, append 1.07×), and 1.46× on clear.

**Retained heap after the suite** (post-GC, MB, every pass of both runs):
Vanilla 3.01 · **Preact 3.15** · **Pyreon 3.16** · Solid 1.9 3.23–3.24 ·
Svelte 3.33–3.34 · Vue 3.37 · Solid 2.0 3.53 · React 3.56 · Vapor (RC) 4.16 ·
Octane 4.51. Pyreon and Preact are level: 0.01MB apart, the printout's
resolution, with no confidence interval, so neither is called the lightest.
(On 2026-11-24 Preact read 3.14 and Pyreon 3.21MB.)

Caveats that travel with these numbers:

- Create, replace, remove and append are dominated by browser layout that every
  framework pays identically. For create 1,000 the measured split (overnight
  analysis) is Pyreon JS 1.19ms + layout 7.04ms against Vanilla's 0.68ms +
  7.03ms: the gap to Vanilla is entirely JavaScript, and it is about 7% of the
  operation.
- `create N rows` is a replace for 19 of 20 samples; only the first sample
  mounts into an empty list.
- Pyreon and both Solid arms allocate a per-row signal that the plain-object
  frameworks (Vue, Vapor, Octane) do not.

### Scaling — select, partial update, swap at 100 → 20,000 rows

*2026-11-05 final pass, one run (Octane 0.16, Solid 1.9.17).* A batch
instrument (K operations per timing window) resolves per-op cost below the
clock tick. It has Pyreon, Octane and Solid arms (no Vapor arm).

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

*2026-11-26 fair-fixture re-measurement, two runs, real Chromium, 100 samples
per cell (memo 60). Every framework passed the cross-framework DOM-shape gate:
the same elements, text nodes and text.*

| Scenario | Pyreon (run 1 / run 2) | Fastest rival (run 1 / run 2) | Verdict |
| --- | --- | --- | --- |
| mount deep tree (2,047 components) | 3.51 / 3.50ms | Solid 1.9 3.48 / 3.53ms | 🤝 tie; Solid 2.0 (1.10–1.11×) and React (1.13–1.14×) slower |
| context → 1,024 consumers | 1.54 / 1.52ms | Solid 2.0 1.59 / 1.62ms | **Pyreon 1.03–1.07×**; Solid 1.9 1.07–1.08× slower |
| effect list: update 500 | 790 / 780µs | Solid 2.0 810 / 822.5µs | 🤝 tie; Solid 1.9 1.11–1.15× slower |
| effect list: dispose 500 | 40 / 40µs | Solid 2.0 35 / 35µs | no verdict (below 10 clock ticks) |
| memo wall: blocked (300 consumers) | 12.5 / 12.5µs | Solid 2.0 12.7 / 12.9µs | split: 🤝, then Pyreon 1.03× — not claimed; Vue 1.26–1.27× slower |
| memo wall: passthrough | 403 / 402µs | Svelte 449 / 448µs | **Pyreon 1.11×** |
| dbmon tick (100×6 cells, all change) | 1.71 / 1.70ms | Octane 1.74 / 1.68ms | 🤝 tie, Svelte tied too (2026-11-05) |

- **Deep-tree mount ties Solid 1.9 on equal DOMs.** The medians are within 1%
  and lead in opposite directions in the two runs. Every arm but Svelte is
  0.43–0.59ms slower than on 2026-11-25 because every arm now renders the leaf
  text; the 2026-11-25 split (Solid 1.9 1.05× ahead in one run) was measured
  while Pyreon created 1,024 empty text nodes that Solid did not. The
  1.15–1.18× loss of 2026-11-05 was bisected on 2026-11-24 to #4199, which
  folds static component props at compile time and forwards pass-through
  getters: the commit before it still lost 1.16–1.17×, #4199 tied.
- **Context propagation** is a two-run win for the first time (1.03× in run 1,
  1.07× in run 2). Until #4862 the context value was empty, and only Pyreon
  among the leaders created a text node for it.
- **Memory is where the deep tree still loses.** One mounted 2,047-component
  tree retains 355.7KB in Pyreon, 409.8KB in Solid 2.0 and 207.2 / 206.8KB in
  Solid 1.9 (two runs, median of 7 samples each, no confidence interval): 1.72×
  Solid 1.9, and below Solid 2.0 (0.87×). The fixture change does not move it.
  On 2026-11-24 Pyreon read 531.7KB.
- **Memo wall passthrough:** Svelte lost two whitespace text nodes in the
  fixture change and read slower (436–439 → 448–449µs), so the lead grew from
  1.07–1.08× to 1.11×; Solid 2.0 is now level with Svelte.
- **Dispose 500** reads 35–45µs for Pyreon and both Solids, under 10 clock
  ticks, so it gets no verdict; the 2026-11-05 "Solid by one tick" loss stays
  withdrawn as a verdict.
- **dbmon** (not re-run) changes every value every tick, which removes a signal
  graph's skip-unchanged advantage by construction; the field converges on the
  DOM-write floor, and it is never quoted as a win for anyone.

**Keyed list with conditional slots (`maplist`)** — 1,000 rows, a keyed list
whose rows carry a conditional status cell and an empty-state slot (2026-11-26
fair-fixture re-measurement, two runs). Pyreon is measured with `<For>` and
with a plain keyed `.map()` of JSX rows:

| op | Pyreon `<For>` | Pyreon `.map()` | Fastest rival | Verdict, `<For>` · `.map()` |
| --- | ---: | ---: | --- | --- |
| create 1,000 | 9.92ms | 10.33ms | Solid 1.9 9.62ms | **loss 1.03–1.04×** · **loss 1.07–1.08×** |
| replace all | 10.99ms | 11.07ms | Solid 2.0 10.74ms | **loss 1.02–1.03×** · **loss 1.03×** |
| update one cell | 430µs | 428µs | Solid 1.9 435µs | 🤝 · 🤝 |
| toggle one conditional | 440µs | 440µs | Solid 1.9 450µs | 🤝 · 🤝 |
| swap rows 2 ↔ 999 | 610µs | 650µs | Solid 2.0 640µs | 🤝 (held back) · 🤝 |
| remove one row | 7.93ms | 8.00ms | Solid 2.0 7.88ms | 🤝 · split (loss 1.02×, then 🤝) |
| clear 1,000 | 240µs | 260µs | Vue 3 283µs | **win 1.18–1.19×** · **win 1.09–1.10×** |

(first run shown; ratios span both runs.) The single-row ops also tie on their
batch-timed twins. `<For>` swap was ahead of Solid 2.0 in both runs (1.05×),
but it tied in both earlier sessions and the rivals' swap times moved down in
this session the way the row board's did, so it is held back. In the timed
passes the DOM-shape gate failed on the rows' text and tag hashes only: row ids
come from a counter that never repeats, so each framework's ids (and the
id-dependent "done" cell) depend on how many rows its warm-up built. Element and
text-node counts never differed, and those passes were counted; a harness fix
is pending. On 2026-11-24 `<For>` clear was a 1.46–1.58× loss and the `.map()`
arm lost create, replace, swap, remove and clear; that is a comparison across
sessions, not attributed to a change.

*The library scenarios below are from the 2026-11-05 final pass.*

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
(`dbmon`, `tree`, `effects`, `memo`, `maplist`, `flow`, `table`, `virtual`).

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
cost beyond the runtime (`bench:charts-bundle`, re-measured 2026-11-19): a line
chart is 40.3KB gzipped vs ECharts tree-shaken 155.9KB (3.87×); a pie is 19.8
vs 117.2KB.

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

**A realistic client app across six frameworks** (a filtered, paginated
catalogue with routing, a form and app-wide state, in Pyreon, React, Vue, Solid,
Svelte and Preact; first-load bytes, time to interactive and memory) has a
harness but no published result yet. Its method: [Real-app benchmark
method](/docs/benchmarks-real-app).

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

*2026-11-24 refresh.* The same keyed-table app built per framework, gzip -9:
Vanilla 3.6KB · **Solid 7.7KB** · Preact 10.1 · Svelte 16.1 · **Pyreon 18.5**
(2.41× Solid) · Vue 27.7 · Octane 33.9 · React 69.6. Every entry carries the
same shared runner module. Pyreon was 16.6KB on 2026-10-20 and 17.2KB on
2026-11-05; the growth since is not attributed to specific changes.

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

- **Page-load-aware intervals.** Since #4129 the harnesses resample whole page
  loads instead of treating 100 samples from 5 page loads as independent (on
  swap, per-page medians range from 620 to 860µs for every framework). Every
  figure the 2026-11-24, 2026-11-25 and 2026-11-26 runs measured uses it. The scenario rows kept from
  2026-11-05 (dbmon, table, charts, flow, virtual) were pooled before it, so
  their close verdicts (table mount and single-cell update, the 10k line-chart
  mounts) stay provisional until they are re-run.
- **A shifted baseline on 2026-11-26.** Every framework, hand-written Vanilla
  included, ran the row board's partial update, swap and clear much faster than
  on 2026-11-25, with no change to the board's code; the cause is not found.
  Verdicts that flipped in Pyreon's favour only in that session are held back.
- **The DOM-shape gate misfires on timed `maplist` passes.** It compares the
  DOM after each operation's first iteration, but `maplist` row ids come from a
  counter that never repeats, so the text depends on each framework's warm-up
  count. Passes whose only differences were the text and tag hashes were
  counted (element and text-node counts never differed); a fix is pending. The
  untimed `--gate-only` check is unaffected and passed for every scenario.
- **No verdict floor in the scenario harness.** It prints a verdict for
  effect-list dispose at 35–55µs; this page applies the row board's 10-tick
  floor by hand.
- **The scenario harness could label a loss as a tie** when the leader was
  another Pyreon arm with a wide interval (the columnar chart arm at 1,000,000
  points). The 2026-11-05 chart verdicts above are taken against the rival
  directly; since #4129 the harness itself judges against the best rival.
- **A stale version label.** The table bench prints `table-core@9.0.0`; 9.3.1
  is installed and is what runs. Only the label is wrong.

## What we don't win (the standing list)

Kept current against the 2026-11-26 fair-fixture re-measurement (items 1–3,
with the 2026-11-25 verdicts that stand for held-back rows), the 2026-11-24
refresh (item 8) and the 2026-11-05 runs (the rest):

1. **Memory per component** — a mounted 2,047-component tree retains 355.7KB
   in Pyreon against Solid 1.9's 207.2 / 206.8KB (1.72×); it is below Solid
   2.0's 409.8KB. On the row-list board Pyreon and Preact are level (3.16 vs
   3.15MB, no confidence interval), so neither is the lightest.
2. **Keyed row-list board** — tied for first, not outright, on create 1,000,
   replace, partial update, remove and append (Vue 3.6 Vapor release candidate,
   Octane 0.19, Vue 3); clear rows, swap and create 10,000 split between runs
   (swap with a 1.07× loss to Vapor in one run on 2026-11-25); the batch-timed
   clear cycle lost 1.02× to Octane in both runs on 2026-11-25 and tied on
   2026-11-24 and 2026-11-26. The batch-timed select is the only published
   outright row-board win.
3. **Keyed list with conditional slots** — create and replace lose in both runs,
   with `<For>` (1.03–1.04× and 1.02–1.03×) and with a plain `.map()` of JSX
   rows (1.07–1.08× and 1.03×); `.map()` remove splits.
4. **Swap at 100 and 1,000 rows** — Octane 1.12× and 1.10× at the default batch
   window, one run; the result moves with the window size.
5. **Line-chart mounts** — with row-object input, 10k points is 1.17–1.20×
   behind uPlot and 1M points 1.16–1.20× behind Chart.js; with columnar input
   these are ties except one 1.18× loss to uPlot at 10k.
6. **Hydration of a keyed table** — tied with Vue on the walk; on the total Vue
   is marginally ahead (tied in one run, 1.01× in the other).
7. **Signal creation** — about 5× slower than Preact on both engines; deep
   computed chains 1.15–1.21× (JSC) to 1.42–1.43× (V8); on V8 also wide fan-out
   by 3–4%.
8. **Bundle size** — 18.5KB vs Solid 7.7KB, Preact 10.1KB and Svelte 16.1KB for
   the same app.
9. **Router at 10 routes** (Hono), and individual static/dynamic/splat matches
   against radix3 and find-my-way.
10. **Package-level losses** — store setup (28.9× vs Zustand), url-state
    integer parse (1.1×), six compiled-Zod / ArkType / typia validation cells,
    form-benchmark heap (Solid modular-forms is lighter), and table and virtual
    mount under happy-dom, plus table single-cell update and sort against
    memoized rows at some sizes under happy-dom.
11. **Not wins, despite a good run** — on the row-list board, partial update,
    clear rows and append won both runs of the 2026-11-26 session and `<For>`
    swap on the keyed list did too, but that session's baseline shifted, so
    they wait for a second session; create 10,000, and data-table mount and
    single-cell update, each won one run and tied the other.
12. **Unbundled Node** — any process importing `lib/` without a bundler pays
    about 145ns per dev-gate read.

Each of these is either actively being closed or is a priced, documented
trade-off — never hidden.
