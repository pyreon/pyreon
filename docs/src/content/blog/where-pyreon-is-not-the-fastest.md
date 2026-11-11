---
title: "Every result, on the table: Pyreon against ten frameworks"
description: "The full scoreboard from our benchmark record: an outright win on clear rows, 2.6× faster than React at 10,000 rows, tied for the lightest heap, then every tie and every loss with its cause. Don’t trust us. Run it."
date: 2027-02-22
slug: where-pyreon-is-not-the-fastest
tags: [javascript, performance, benchmarks, webdev]
cover: /blog/covers/where-pyreon-is-not-the-fastest.png
---

::: bench
- **130 µs** to clear 1,000 rows, the fastest of ten frameworks in both runs
- **2.6×** faster than React 19 building 10,000 rows
- **Lightest** retained heap on the board, tied
:::

That is the top of the scoreboard. This post puts the whole thing on the table: every win, every tie and every loss in our benchmark record, with the numbers and the causes. We publish where we lose, so you can trust where we win.

> **All figures:** `BENCHMARKS.md`, run of 2026-11-05, Apple M3 Max, real Chromium 156 unless stated. Medians with bootstrap 95% intervals; "loss" means the intervals are disjoint; "one run" where marked. Synthetic and author-run. Every number reproduces from [pyreon.dev/docs/benchmarks](/docs/benchmarks). The benchmark record is the source of truth; if it differs from this post, the record wins.

## The wins

| where | Pyreon | against |
| --- | --- | --- |
| clear rows, row board of 10 frameworks | 130 µs, outright win in both runs | Vue 3.6 Vapor RC 145 µs (1.11–1.12×) |
| create 10,000 rows | 72.6 ms | React 19 192.0 ms (2.6×), Preact 278.0 ms (3.8×) |
| retained heap, row board | 3.08 MB, tied lightest | Preact 3.09 MB |
| select row (batch instrument) | 1.86–2.04× ahead, one run | Octane |
| TodoMVC shape | toggle 1,000 about 2.4×, clear 1,000 3–4× | React 19 |
| hydration, 320-component app page | 4.02 ms, fastest, one run | React 4.15, Preact 4.30, Vue 4.47 |
| compiled SSR, 10 / 100 / 1,000 rows | fastest at all three (1.21× / 1.35× / 1.14× vs next), one run | the field |
| `renderToString`, 4 scenarios | 1.64–4.68×, byte-identical output, one run | Solid |
| 12-field form, 4 timed ops | fastest on all four, one run | six form libraries |
| charts, 4 ops | 2.5–8.7× faster; line chart 38.0 KB vs 155.9 KB, one run | ECharts 6 |
| node graph / virtual list | all 6 ops / all 4 ops, one run | React Flow 12 / react-virtual |
| reactivity core (V8) | effect 2.04–2.13×, batch 1.94–1.95×, diamond 1.30× | Preact Signals |

> **Don’t trust us. Run it. Every number on this page reproduces from the commands in the record.**

## Everything else, on the same table

A scoreboard that only lists wins is an advert. Here is the rest, walked with the same care we give a win: the number, the cause as far as we have traced it, whether it follows from a design choice, and what we have already measured or shipped.

Two ground rules first. **We wrote and judge every one of these benchmarks**, so read them as the author's report. A keyed implementation for krausest/js-framework-benchmark is staged in the repo (`contrib/krausest/pyreon-keyed/`) for the independent check. And **a tie is not a loss, but it is not a win either**, so the ties where we once claimed wins are on this list too. The story of how those claims came down is in [We caught our own benchmarks lying](/blog/we-keep-retracting-our-benchmark-wins).

## The rest of the board on one screen

| # | where | margin | design choice? |
| --- | --- | --- | --- |
| 1 | deep component-tree mount | Solid 1.15–1.18× | largely: it is the price of live props |
| 2 | row board (create, replace, partial, swap, remove) | ties with Vue Vapor RC, Octane, Vue 3 | no: most of each op is browser layout |
| 3 | swap at 100 / 1,000 rows (batch instrument) | Octane 1.12× / 1.10×, one run | open: the result moves with batch size |
| 4 | effect-list dispose 500 | Solid 1.11–1.13× | at the clock's resolution |
| 5 | chart line mounts, row-object input | uPlot 1.17–1.20× (10k), Chart.js 1.16–1.20× (1M) | partly a quality default |
| 6 | hydrating a 1,000-row keyed table | tie on the walk; Vue 1.01× on the total in one run | marginal |
| 7 | signal creation; deep chains; V8 fan-out | Preact ~5×; 1.42–1.43× (V8); 1.03–1.04× | creation: yes, an API choice |
| 8 | bundle, same app | 17.2 KB vs Solid 7.5 KB | partly |
| 9 | router at 10 routes; six validate cells | Hono 1.91×; zod compiled mode, arktype, typia | mixed |
| 10 | store setup and smaller fundamentals rows | Zustand 28.9× on setup | yes, by design |

## 1. Deep trees cost us the most

Mount a tree of 2,047 nested components in real Chromium. Solid does it in 3.06 ms; Pyreon takes 3.59 ms. That is our clearest loss to another framework, and it holds in both runs at 1.15–1.18×.

| | run 1 | run 2 |
| --- | ---: | ---: |
| Solid | 3.06 ms | 3.10 ms |
| **Pyreon** | 3.59 ms | 3.58 ms |
| React 19 | 3.71 ms (tie with Pyreon) | 3.66 ms (tie) |

*Synthetic, author-run, Apple M3 Max. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

**Why.** An ablation ladder, a bench that adds one cost at a time, puts the gap in per-component framework JavaScript, not in element creation. Specifically: child props are getters. A reactive prop passed down N levels is a chain of getters, read three times per node. That chain is how a parent's signal reaches a deep child without the child ever re-running, so it is the price of components that run once.

Solid pays the same class of cost. Its own unranked "eager props" diagnostic arm mounts in 2.66 ms, well under its real 3.06 ms.

**What we tried.** We shipped null-prototype props objects in November 2026. Each per-instance getter on a plain `{}` was building a fresh V8 hidden class; a null-prototype object halves that work, and the gap went from 1.19–1.20× to 1.14–1.16× in an interleaved A/B. We measured and refuted two more ideas: emitting getters directly instead of going through the props pipeline (hand-written getters were slower), and moving mount-path module variables onto holder objects, the trick that sped up the reactivity core by 21–32%. Our internal benchmark guide now records that no single lever is left on this op.

After the record, we merged a compiler change aimed straight at that chain (#4199). A prop built only from static values is now evaluated once, and a prop passed straight through is forwarded instead of wrapped again, so a value threaded down N levels is one call deep instead of N. Its own A/B ran on a shared, noisy machine, which the record does not accept, so the number in this post is the 2026-11-05 loss above.

## 2. On the row board, we tie the leaders

On the ten-framework row-list board, Pyreon **wins one op outright in both runs**: clear rows, 130 µs against Vue 3.6 Vapor RC's 145 µs (1.11–1.12×). Create 1,000, replace, partial update, swap and remove are **statistical ties** with the fastest rivals. Create 10,000 and append tie in one run and win by 1.02× in the other, so we do not claim them.

| op | Pyreon | fastest rival | verdict |
| --- | ---: | ---: | --- |
| create 1,000 | 7.26 ms | Vue 3 7.33 / Vapor 7.35 | tie |
| replace all | 7.13 ms | Vapor 7.11 | tie |
| partial update | 705 µs | Vapor 710 | tie |
| swap rows | 805 µs | Vapor 755 | tie (cluster intervals) |
| remove row | 5.70 ms | Octane 5.74 | tie |

*Run 1 shown. Synthetic, author-run, Apple M3 Max. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

**Why.** Most of these ops are browser layout that every framework pays equally. For create 1,000 we measured Pyreon's JavaScript at 1.19 ms and layout at 7.04 ms; hand-written vanilla JS was 0.68 ms plus 7.03 ms. The whole gap to vanilla is JavaScript, but that JavaScript is a small slice of the total, so the leading frameworks land inside each other's intervals. Pyreon and Solid also allocate a signal per row inside the timed op, which the plain-object frameworks (Vue, Vapor, Octane) skip.

**Swap shows how thin these margins are.** Vapor's median is lower, so we went looking for why. A dedicated profiling driver ran Pyreon, Vapor and Vanilla in one page on the board's exact markup. Every arm issues exactly two `insertBefore` calls per swap, and layout cost is identical across arms. The difference came from the board's page loads: Vapor had one pass at 520 µs while its other passes sat at 778 and 810. That per-page-load spread is exactly what the cluster bootstrap now accounts for, and with it, swap is a tie.

## 3. Swap at small sizes: a loss we report and cannot yet explain

A second harness times ops in batches, to get below the clock's resolution. From 5,000 to 20,000 rows Pyreon leads Octane on swap by 1.03–1.11×. At **100 and 1,000 rows Octane leads, 1.12× and 1.10×** (one run). We report that as a loss, with one qualification. The harness's soundness check changes the batch size, and a sound per-cycle cost should not move when you do that. At these sizes, it moved:

| batch target | Pyreon @100 / @1,000 | Octane @100 / @1,000 |
| ---: | --- | --- |
| 10 ms | 62.2 / 425.0 µs | 70.2 / 436.9 µs |
| 40 ms (default) | 69.0 / 481.0 µs | 58.9 / 436.7 µs |
| 160 ms | 64.4 / 449.7 µs | 64.3 / 462.3 µs |

*Overnight run of the same day; synthetic, author-run, Apple M3 Max. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

So the loss depends on the instrument, but nothing has refuted it: every run at the default target so far has had Octane ahead at these two sizes. Our first guess was allocation inside Pyreon's swap path. We tested it by reusing the swap path's scratch buffers, and it changed nothing. In that same run Octane's numbers moved with batch size the same way, so the cause is not Pyreon's allocation. It is still open.

## 4. Disposing 500 effects: one clock tick

Pyreon 50 / 45 µs, Solid 45 / 40 µs: **Solid ahead by 1.11–1.13× in both runs**. That is one 5 µs clock tick, with 21–28% variation between samples. An on-CPU ablation measured Pyreon's equivalent arm *below* Solid's (14.3 vs 17.3 µs), so we cannot reproduce the wall-clock loss as JavaScript cost. We still list it as a loss, because the wall clock is what we publish.

## 5. Chart line mounts

Against uPlot, Chart.js and Recharts, measured at the first painted frame:

| mount | Pyreon (rows) | Pyreon (columns) | uPlot | Chart.js |
| --- | ---: | ---: | ---: | ---: |
| 10,000 points | 3.84 ms | 3.77 ms | 3.19 ms | 5.44 ms |
| 1,000,000 points | 14.92 ms | 12.11 ms | 13.47 ms | 12.81 ms |

*Run 1. Synthetic, author-run, Apple M3 Max. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).*

The default row-object input loses at 10k (1.17–1.20× vs uPlot) and at 1M (1.16–1.20× vs Chart.js with decimation). The columnar input, which takes the same shape uPlot takes, ties except a 1.18× loss to uPlot at 10k in one run.

**Why.** At 1M points the remaining cost is a million accessor calls and object reads. Columns avoid it, and they are the documented large-data path. At 10k the cause is not ingestion, because the columnar arm loses by the same amount. Our default point density draws about twice as many points as uPlot does, which is a quality choice; `density: 'device'` closes the gap. Pyreon also draws an off-screen accessible data table by default, which none of the other libraries does.

Updates go the other way: Pyreon leads uPlot and Chart.js by 1.44–2.23× on 10k and 100k updates and on mounting 1,000 bars.

## 6. Hydrating a keyed table

Every framework adopts all 1,000 server rows. The walk, the framework's own work, is a **tie with Vue in both runs** (1.16 / 1.19 ms vs 1.17 / 1.16 ms). On the total, run 1 ties, and in run 2 Vue is ahead by 0.05 ms, 1.01×. About 100 µs of Pyreon's walk builds per-row app state that Vue's arm does not, and layout is about 80% of every total.

On a 320-component app page, the shape most real pages look like, Pyreon hydrates in 4.02 ms against React's 4.15, Preact's 4.30 and Vue's 4.47 (one run). The keyed table is the shape where we are not ahead. How hydration adopts the server's DOM in the first place is in [Type before the page hydrates. Pyreon keeps every character](/blog/hydration-that-adopts-the-server-dom).

## 7. The reactivity core

| test (V8) | Pyreon (bundled) | Preact Signals | verdict |
| --- | ---: | ---: | --- |
| signal create + read + write | 63 ns | 13 ns | **loss 4.8×** |
| deep chain (depth 50) | 107,237 ns | 75,639 ns | **loss 1.42–1.43×** |
| wide fan-out (1 → 100 effects) | 1,651 ns | 1,602 ns | **loss 1.03–1.04×** |
| effect propagation | 1,407 ns | 2,874 ns | win 2.04–2.13× |
| batch 50 signals | 456 ns | 888 ns | win 1.94–1.95× |

*Synthetic, author-run, Apple M3 Max. Reproduce: [pyreon.dev/docs/benchmarks](/docs/benchmarks).* On JavaScriptCore, creation is about 5× and deep chains 1.15–1.21× behind Preact, while fan-out turns into a 1.33–1.38× win.

**Signal creation is a design choice, and we made it on purpose.** A Pyreon signal is a function you call to read, with `.set()`, `.update()` and `.peek()` methods. Giving a function shared methods takes one `Object.setPrototypeOf` per signal, and that call is most of the creation cost. We measured the alternative, copying the methods onto every instance. Creation gets a little cheaper, but every `.set()` dispatch gets about 2× slower and every signal carries about 95 extra bytes. You create a signal once and write it many times, so we kept the prototype.

**Deep chains are the other side of a trade.** Every `computed` compares its new value with the old one, so a cascade stops the moment a derived value is unchanged. That check is what wins our memo-wall scenario by 1.39–1.40×. This benchmark changes every value on every tick, so the check never short-circuits and only adds a compare per hop. Our profile puts most of the remaining cost in the read side of the pull. A Preact-style versioned pull would remove the write share, at extra memory per signal and per edge; we evaluated it and did not build it. Fan-out on V8 is a 3–4% loss with disjoint intervals, and its sign flips with engine and machine load.

## 8. Bundle size

The same keyed-table app, gzip -9: Solid 7.5 KB, Preact 10.1 KB, Svelte 16.1 KB, **Pyreon 17.2 KB**, Vue 27.4 KB, React 69.6 KB. We are 2.30× Solid. The README's "~6 kB core + runtime-dom" is a real figure, but the same-app number is the fair comparison, so it is the one we lead with.

The figure has grown: 16.6 KB on 2026-10-20, 17.2 KB now. Our bundle-budget history attributes most of that to compact `<For>` server-render keys for hydration (#3946) and a named-accessor correctness fix (#4088), both deliberate trades. We have not published a per-feature breakdown of the 17.2 KB, so we cannot yet tell you how much of the gap to Solid is fixed cost.

## 9. Router and validation

**Router**, 10 routes: Hono averages 1.91× faster and wins 6 of 7 rows (one run). At 50 and 200 routes Pyreon averages within 1.00–1.03× of radix3, a tie because the average row has no interval. Per row, Pyreon trails the best matcher on static, nested-static, dynamic, nested-dynamic and splat matches at every size, and wins miss → catch-all.

The harness has changed since that run. A fix (#4142) makes Hono's arm build its params object inside the timed call, as every other arm already did, so the Hono rows above come from the harness as it was before that fix.

**Validation**, ten-library protocol bench: six of 24 cells are lost. Zod's compiled mode wins three valid-input parses (email, int, array of 20). Arktype wins `object.user` valid, partly because it returns the input aliased instead of cloning it. typia and arktype win the email checks. Pyreon wins or ties the other 18, including every invalid-input parse.

## 10. Store setup and the smaller rows

`@pyreon/store` takes **28.9× longer than Zustand to set up a store** (483 vs 17 ns), because each store creates two signals and registers itself. It is paid once per store, and it buys reactive reads. Part of that figure was the harness building Pyreon's store id string inside the timed loop; #4142 moved that out after the run quoted here.

The rest: store reads 1.7× slower (5 vs 3 ns), storage reads 1.5× (4 vs 3 ns), `url-state` integer parsing 1.1×. In the form benchmark, Solid's modular-forms retains less heap (2.33 vs 2.42 MB), even though Pyreon leads all four timed operations. Under happy-dom, `@pyreon/table` mounts 1,000 rows 1.3× slower than react-table and `@pyreon/virtual` mounts 1.1× slower; in real Chromium, table mount ties or wins by 1.03× and virtual mount wins by 1.15×. happy-dom is not a browser, so those rows measure relative work only.

One for server authors: importing Pyreon's `lib/` in Node **without a bundler** pays a live `process.env` read on every dev-only check, about 145 ns each on V8. Every bundler folds these reads away. An unbundled server path does not.

> **A tie is not a loss, but it is not a win either. So the ties are on this list too.**

## What this list does not cover

- **Not measured at all:** streaming SSR, portals, async waterfalls, startup metrics, krausest's memory metrics, Firefox and Safari, and any independent third-party run. A full-stack suite (`@pyreon/zero` against eight meta-frameworks) lives in the repo; this post quotes no result from it.
- **Several scenario intervals are still pooled.** The cluster-bootstrap fix covers the row board. The close scenario verdicts quoted here (context, effect-list update and dispose, table mount, the 10k chart mounts) come from pooled intervals, so read them as provisional.
- **Some of the "why" is internal analysis.** The profiles behind sections 1, 2, 3 and 7 come from our benchmark guide, not from the published record.
- **Some losses will not close.** Deep-tree mount and signal creation follow from choices we made for the programming model. We would rather explain them than hide them.

## Read the record, then try it on your own app

Every number above, both runs, the competitor versions and the exact commands to reproduce are in the record, together with §0, the list of claims we have withdrawn: [pyreon.dev/docs/benchmarks](/docs/benchmarks).

A synthetic benchmark cannot tell you how your app will feel. Building one can:

```bash
npm create @pyreon/zero@latest
```

- Docs: [pyreon.dev/docs](/docs). The rules that keep an app on the fast path: [the seven rules of fine-grained reactivity](/blog/seven-rules-of-fine-grained-reactivity).
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord) or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues). Found a harness bug? That is our favourite kind of issue.
