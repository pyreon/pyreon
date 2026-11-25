# Pyreon Benchmark Results — 2026-11-05, refreshed 2026-11-24 and 2026-11-25

**Machine:** Apple M3 Max · 14 logical cores · 96 GB · darwin 25.6.0 · bun 1.4.0 (JavaScriptCore) · node v26.1.0 (V8). Browser: **Chromium 159.0.8154.6 (Playwright 1.65.1)** for the 2026-11-24 refresh and the 2026-11-25 re-measurement; Chromium 156.0.8078.4 (Playwright 1.64.1) for the two 2026-11-05 runs.

This record combines four runs made on the same machine. Every section says which one its figures come from. A section a later run did not re-measure keeps the figures and the label of the run that last measured it; nothing is relabelled.

| run | code | time (CET) | load (1-min) | what it measured |
| --- | --- | --- | --- | --- |
| **Re-measurement** | `main` at `dfbdecfc7` (clean worktree, fresh `bun install`) | 2026-11-25 04:59–06:49 (kept passes) | below 4 in every kept pass (peak 3.77) | row board and its heap (§1); deep tree and context, effect list, memo wall, keyed `.map()` list, retained heap of one deep tree (§2) |
| **Refresh** | `main` at `a48a7cba1` plus the benchmark-app changes of #4776 (Solid 2.0 stable arms), committed unchanged as `fcccee261` | 2026-11-24 01:29–03:00 (kept passes) | below 4 in every kept pass (peak 3.69) | bundle (§7, a size build of the same commit at 04:25). Its row board, core scenarios, keyed list and tree heap are superseded by the re-measurement; what moved is in §0 |
| **Final pass** | `main` at `779a82f01` (includes #4114–#4128) | 2026-11-05 12:07–13:20 | 1.7–3.8 | dbmon, flow, table, virtual, charts, charts-libs (§2), crossover (§3), hydration and app page (§4), reactivity on V8 and JSC, router, validate (both benches), store, http, rx, table (happy-dom), charts engine |
| **Overnight run** | `main` at `d47fa5a2f` | 2026-11-05 02:37–04:15 | 1.2–3.9 | everything else: SSR, `renderToString`, TodoMVC, form-bench, charts and code bundles, head, styler, compiler, the other fundamentals packages, Pyreon-only throughput |

**Method (all runs).** Every suite ran **strictly one at a time**, gated on a 1-minute load below 4 with load stamped before and after. `NODE_ENV=production` everywhere; a production `vite build` for every browser suite; browser suites are cross-origin isolated (measured clock quantum 5 µs, not Chromium's 100 µs clamp); no forced GC under JavaScriptCore.

**How the refreshes were run.** Each item is **two runs**, and each run is five single-page-load passes (`--repeat 1`, framework order reshuffled every pass) per suite, queued so that a pass started only after the 1-minute load had stayed below 4 for two minutes. Load was sampled every 5 s during each pass; a pass whose load reached 4 was discarded and re-run. The five passes of a run were then pooled with the harnesses' own statistics: the pooled-sample median and a **cluster bootstrap over the five page loads** (1,000 resamples, seed 42; `examples/benchmark/cluster-bootstrap.ts`). Every refreshed CI, scenarios included, is page-load-aware.

- **2026-11-25:** no pass was discarded for load. One row-board pass (run 1, pass 2, peak load 1.99) was discarded because `bench-fair`'s bimodality guard flagged select row / Svelte 5 as an artifact-mode median; an extra pass replaced it. Row-board run 1, pass 4 saw another session's `vitest run` in its last 5-s load sample (peak 3.06) and was kept under the load rule. The 2026-11-25 run ran on a machine shared with one other benchmark queue, under one lock, one run at a time.
- **2026-11-24:** five row-board attempts were discarded for load, at peaks of 4.7–13.1.

**Repeats in the 2026-11-05 final pass.** dbmon, the table scenario, charts-libs, hydration and reactivity on both engines were **run twice**. Everything else in the final pass is **one run**, and is labelled so.

**How to read.** Every head-to-head passes a correctness gate before timing (all implementations must produce the same observable result). Figures are medians with bootstrap 95% CIs. 🤝 means the CIs overlap: *could not distinguish*, not *equal*. A result is called a **win** only when the CIs are disjoint **in both runs**; a result measured once says "one run". When the two runs disagree, both are reported and neither verdict is claimed. A per-op median below 10 clock quanta (50 µs) gets **no verdict**; batch-timed rows are exempt. **Absolute times are machine-dependent; compare ratios.** The harness notes in §14 limit how far some of the 2026-11-05 verdicts can be trusted; read them before quoting a close margin.

**Author-judge:** Pyreon's authors wrote and judge every bench here, on one machine, in one browser engine (Chromium; no Firefox or Safari). The only fully independent venue is krausest/js-framework-benchmark; a keyed implementation is staged at `contrib/krausest/pyreon-keyed/`.

**Synthetic:** these are synthetic micro- and scenario benchmarks. They do not predict the performance of your app.

**Competitor versions in the 2026-11-24 refresh and the 2026-11-25 re-measurement (installed, from `examples/benchmark/package.json` and `bun.lock`; no rival changed between the two):** react / react-dom 19.3.1 · vue 3.5.45 · Vue 3.6 Vapor `3.6.0-rc.11` · svelte 5.57.3 · solid-js 1.9.19 (compiled by babel-preset-solid 1.9.19) · **Solid 2.0: solid-js 2.0.3 + @solidjs/web 2.0.3, compiled by @solidjs/compiler 2.0.2** (the compiler `@solidjs/vite-plugin` runs) · preact 11.2.0 · octane 0.19.2. Solid 1.9 and Solid 2.0 are separate arms everywhere.

**Competitor versions in the 2026-11-05 runs (installed, verified; no dependency changed between `d47fa5a2f` and `779a82f01`):** react / react-dom 19.3.1 · vue 3.5.44 · Vue 3.6 Vapor `3.6.0-rc.11` · svelte 5.57.3 · solid-js 1.9.17 · SolidJS 2.0 `2.0.0-rc.15` · preact 11.0.2 · octane 0.16.0 · @xyflow/react 12.12.0 · echarts 6.1.0 · uplot 1.6.32 · chart.js 4.6.1 · recharts 3.10.1 · @tanstack/react-table 9.3.1 (table-core 9.3.1) · @tanstack/react-virtual 3.14.23 (virtual-core 3.19.8) · @tanstack/query-core 5.105.0 · @tanstack/form-core 1.33.5 · @preact/signals-core 1.14.4 · zod 4.6.7 · valibot 1.5.0 · arktype 2.2.9 · typia 15.2.1 · typebox 0.34.52 · yup 1.7.1 · joi 18.3.1 · zustand 5.0.16 · jotai 3.0.1 · mobx-state-tree 9.0.0 · mobx 7.1.1 · xstate 5.33.3 · i18next 26.5.11 · @casl/ability 7.0.2 · ky 2.2.0 · ofetch 1.5.1 · redaxios 0.5.1 · axios 1.20.0 · hotkeys-js 4.0.8 · tinykeys 4.0.1 · mousetrap 1.6.5 · nuqs 2.10.2 · react-hook-form 7.91.0 · formik 2.4.9 · react-hot-toast 2.6.1 · sonner 2.0.8 · rxjs 7.8.2 · unhead 3.4.3 · hono 4.13.14 · react-router 8.5.0 · vue-router 5.4.0 · find-my-way 9.10.0 · radix3 1.1.2 · @emotion/css 11.13.5 · goober 2.1.19 · styled-components 6.6.0.

This record **supersedes** the 2026-11-24 figures of every section the 2026-11-25 re-measurement repeated, the 2026-11-05 version of this file, the overnight version (`d47fa5a2f`), the 2026-09-24 run and the 2026-10-15 / 2026-10-20 refreshes. §0 lists every verdict that moved and every claim withdrawn.

---

## 0. What changed, and what is withdrawn

### Changed by the 2026-11-25 re-measurement (vs the 2026-11-24 refresh)

Same machine, same Chromium 159, same rival versions; the code moved from `fcccee261` to `dfbdecfc7`. Every move below is a comparison between two sessions on two days, not an interleaved A/B, and none is attributed to a change. Verdicts that did not move: create 1,000, replace all, remove row, create 10,000 and append on the row board (🤝 in both runs); context → 1,024 consumers (🤝); effect-list update (🤝 with Solid 2.0); effect-list dispose (no verdict); memo wall blocked (🤝 with Solid 2.0); maplist update, toggle and their batch rows (🤝).

| | previously published (2026-11-24) | 2026-11-25 re-measurement |
| --- | --- | --- |
| **worse** | row board: clear rows **win 1.12×** (both runs) | **split, not claimed:** 🤝 with Octane in run 1 (125 [123–130] vs 135 [127–145] µs), win 1.12× vs Vapor in run 2 |
| **worse** | row board: clear rows, batch cycle 🤝 (Octane) | **loss 1.02× to Octane in both runs** (7.76 / 7.80 vs 7.63 / 7.64 ms); Solid 1.9 now ties it. Pyreon read 7.57 / 7.66 ms on 2026-11-24 while the Vanilla control read 7.25 / 7.23 then and 7.24 / 7.21 now |
| **worse** | row board: select row, batch cycle, win 1.58× vs Octane | win **1.49–1.50×** vs Octane (both runs) |
| **worse** | deep-tree mount: 🤝 with Solid 1.9 in both runs | **split, not claimed:** 🤝 in run 1, Solid 1.9 1.05× ahead in run 2; Solid 1.9's median is 1.03–1.05× ahead in both runs |
| better | row board: partial update split (🤝 / Pyreon 1.09×) | 🤝 in both runs (Vapor, Octane) |
| — | row board: swap rows split (🤝 / Vapor 1.11× in run 2) | still split: Vapor 1.07× ahead in run 1, 🤝 in run 2 |
| better | row-board heap: **Preact 3.14 MB is the lightest framework**, Pyreon 3.21 MB (loss) | Pyreon 3.15–3.16 MB, Preact 3.15 MB: **level** at the printout's 0.01 MB resolution, no CI, so neither a loss nor a win. Against 2026-11-24 the other arms read the same or up to 0.01 MB higher (Vue 3 and Octane unchanged); Pyreon read 0.05–0.06 MB lower |
| better | deep-tree retained heap: Pyreon 531.7 KB, **loss** 1.30× to Solid 2.0 and 2.57–2.63× to Solid 1.9 | Pyreon 355.1 / 355.2 KB: **below Solid 2.0** (411.3 KB, 0.86×, sample ranges disjoint, no CI); still a **loss** to Solid 1.9 (207.0 / 206.2 KB, 1.72×) |
| better | maplist `<For>`: clear **loss 1.46× / 1.58×** to Vue 3 | **win 1.14–1.15×** vs Vue 3 (both runs) |
| better | maplist `<For>`: create loss 1.03×, replace loss 1.05–1.06× | both split, not claimed: a loss in run 1 (1.03× / 1.02×), 🤝 in run 2 |
| better | maplist `.map()`: create loss 1.18–1.19×, replace 1.27× | still losses, 1.07–1.08× and 1.03–1.04× |
| better | maplist `.map()`: swap loss 2.15–2.25×, remove 1.12–1.13× | 🤝 in both runs |
| better | maplist `.map()`: clear **loss 2.34–2.35×** | **win 1.19–1.20×** vs Vue 3 (both runs) |
| better | effect-list update vs Solid 1.9: 🤝 / Pyreon 1.11× | Pyreon 1.10–1.13× faster in both runs (the verdict against Solid 2.0, the fastest rival, is still 🤝) |
| better | row board, remove row vs Solid 1.9: 🤝 | Pyreon 1.03× faster in both runs (the verdict against the fastest rival is still 🤝) |
| — | memo wall passthrough: win 1.07× vs Svelte | win 1.07–1.08× (both runs) |

### Changed by the 2026-11-24 refresh (vs the 2026-11-05 final pass)

| previously published (2026-11-05) | 2026-11-24 refresh | why it moved |
| --- | --- | --- |
| deep-tree mount: **loss 1.15–1.18× to Solid**; React 🤝 Pyreon | **🤝 tie with Solid 1.9 in both runs**; Pyreon 1.09–1.11× faster than Solid 2.0 and 1.12–1.15× faster than React (both runs) | Bisected (two runs per commit, Chromium 156): `c5b2c4c48` still loses 1.16–1.17×, its child `2655fa3b4` (#4199, fold static component props and forward pass-through getters) ties. #4199 merged on 2026-11-10, after the 2026-11-05 record. A build labelled as the 2026-11-05 tree still lost 1.13–1.17× under both Chromium 156 and 159, so the browser update does not explain it (that log does not record its commit). |
| row heap: Pyreon 3.08 MB **ties Preact 3.09 MB as the lightest framework** | **Preact 3.14 MB is the lightest framework**; Pyreon 3.21 MB, Solid 1.9 3.22–3.23 MB | Measured in all ten passes. Not attributed to a change. |
| row board: create 10,000 and append, split (🤝 / win 1.02×) | 🤝 tie in both runs | Two runs agree. |
| row board: partial update 🤝, swap rows 🤝 (both runs) | both split: partial update 🤝 / Pyreon 1.09× vs Vapor; swap rows 🤝 / Vapor 1.11× | The two runs disagree, so neither is claimed. |
| row board: clear rows win 1.11–1.12× vs Vapor | win 1.12× (both runs; vs Octane in run 1, Vapor in run 2) | — |
| row board: select row, no verdict; batch select only from crossover (one run) | per-op still no verdict; the board's batch-cycle row: **win 1.58×** vs Octane (both runs) | The batch-cycle row is now ranked. |
| context → 1,024 consumers: win 1.05× in run 1, 🤝 in run 2 | 🤝 in both runs | — |
| effect list update 500: 🤝 / win 1.10× vs Solid | 🤝 in both runs (with Solid 2.0) | — |
| effect list dispose 500: **loss 1.11–1.13×** to Solid (one quantum) | **no verdict**: Pyreon, Solid 1.9 and Solid 2.0 all sit at 35–50 µs, below 10 clock quanta | The verdict floor the row board applies now applies here too. |
| memo wall blocked: **win 1.39–1.40×** vs Vue (11 vs 16 µs) | **🤝 with Solid 2.0** (12.6 / 12.8 vs 13.0 / 12.9 µs); 1.25× ahead of Vue | Solid 2.0 is a new arm in this scenario. |
| memo wall passthrough: win 1.08× vs Svelte | win 1.07× vs Svelte (both runs) | — |
| keyed `.map()` list (`maplist`): no published row | **published (§2)**: `<For>` loses create 1.03×, replace 1.05–1.06×, clear 1.46–1.58×; the `.map()` arm loses create, replace, swap, remove and clear | First two-run measurement. |
| retained heap of one deep tree: not published | **loss**: Pyreon 532 KB vs Solid 2.0 410 KB vs Solid 1.9 202–207 KB | First measurement (§2). |
| bundle: Pyreon 17.2 KB (2.30× Solid) | **18.5 KB** (2.41× Solid 7.7 KB) | Re-measured; the growth is not attributed to specific PRs. |
| Solid 2.0 arm: `2.0.0-rc.15` | `2.0.3` stable | Version bump (#4776). |

### Changed by the 2026-11-05 final pass (vs the overnight run, same day)

| previously published (overnight, `d47fa5a2f`) | final pass (`779a82f01`) |
| --- | --- |
| row board: swap rows 🤝 tie (both runs) | 🤝 tie (both runs, cluster CIs); the harness's pooled CI showed a 1.07× loss in run 1 |
| row board: create 10,000 🤝 tie | 🤝 in run 1, win (1.02×) in run 2 (cluster CIs) |
| row board: clear rows win 1.15× | win 1.11–1.12× (both runs, cluster CIs) |
| row board: append win 1.02× | 🤝 in run 1, win (1.02×) in run 2 (cluster CIs) |
| context → 1,024 consumers: Pyreon outright (both runs) | win in run 1 (1.05×), 🤝 in run 2 |
| effect list update 500: Pyreon outright (both runs) | 🤝 in run 1, win in run 2 (1.10×) |
| effect list dispose 500: 🤝 / Solid 1.3× | **Solid in both runs**, 1.11–1.13× (one 5 µs clock quantum) |
| deep-tree mount: Solid 1.16× | Solid 1.15–1.18×; React still ties Pyreon |
| table, real Chromium, mount: **react-table 1.12–1.13× faster** | **withdrawn**: 🤝 in run 1, Pyreon 1.03× in run 2 |
| table, real Chromium, update one cell: 🤝 | 🤝 in run 1, Pyreon 1.03× in run 2 |
| charts-libs, mount 1M, row input: 1.32× behind Chart.js | 1.16–1.20× behind Chart.js |
| crossover swap at 100 / 1,000 rows: no verdict | Octane 1.12× / 1.10× at the default target (one run; K-dependence in §3) |
| reactivity V8, computed diamond: **Preact 1.13×** | **withdrawn**: Pyreon 1.30–1.31× |
| reactivity JSC, computed diamond: **Preact 1.01×** | **withdrawn**: Pyreon 1.07–1.08× |
| reactivity V8: effect 1.31×, batch 1.53× | effect 2.04–2.13×, batch 1.94–1.95× |
| reactivity V8: deep chain Preact 1.88×, fan-out Preact 1.17× | deep chain Preact 1.42–1.43×, fan-out Preact 1.03–1.04× |
| reactivity JSC: fan-out 1.23×, deep chain Preact 1.16× | fan-out 1.33–1.38×, deep chain Preact 1.15–1.21× |
| validate megamorphic: **zod wins invalid scalar string 1.17×** | **withdrawn**: Pyreon 1.28× vs valibot, 1.40× vs zod (one run; disjoint by 0.1 ns) |
| store: setup 30.9× slower than Zustand; patch with a subscriber **1.3× slower** | setup 28.9× slower; patch with a subscriber 🤝 (87 vs 83 ns) |
| http: **create client 1.46× slower than redaxios**; GET → JSON 🤝 ofetch; middleware 1.19× vs ofetch | create client 🤝 redaxios; GET → JSON **1.17× vs ofetch**; middleware 🤝 ofetch |
| rx: `sortBy` 1.05× behind a hand computed | 1.03×, no CI printed, so no verdict |
| table (happy-dom): single-cell update 1.1–1.6× faster than memoized rows | 1.6× faster at 100 rows, **1.2× slower at 1,000** |
| charts engine vs ECharts SSR: 7.2–9.6× | 7.4–8.2× (one run) |
| bundle: 17.1 KB | 17.2 KB |
| router at 50 routes: 🤝 radix3 | Pyreon has the best average (1.00× vs radix3 1.01×); no CI on the average row, so still a tie |

### Withdrawn before today (still withdrawn)

| previously published | status | why |
| --- | --- | --- |
| "Vue 3.6 Vapor (RC) outright on replace all (1.02×) and swap rows (1.08×)" (2026-10-15) | withdrawn | Replace and swap are ties in both final-pass runs. |
| "Pyreon outright on create 1,000 / replace all / create 10,000" (page, 2026-09-23) | withdrawn | Create 1,000 and replace tie Vapor RC, Octane 0.16 and Vue 3 in both runs; create 10,000 is a tie in one run and a win in the other (§1). |
| "Pyreon has the lowest retained heap" (form-bench) | withdrawn | Solid modular-forms 2.33 MB < Pyreon 2.42 MB (overnight run). |
| "Pyreon fastest median on dbmon" (2026-10-15) | superseded | Three-way tie in both runs. dbmon is never a win for anyone (§2). |
| "cssVariables theming 1.16× / 1.22× faster" | reversed | Classic mode is 1.13× faster (§11, overnight run). |
| runtime-server throughput 629K / 177K / 10.8K / 29.4K renders/s (2026-09-24) | not comparable | The harness was re-added by #3642 after that run. |

---

## 1. DOM row-list suite — `bench:fair` (10 frameworks, real Chromium)

*Re-measurement · 2026-11-25 · `dfbdecfc7` · Apple M3 Max · Chromium 159 · **two runs** (run 1: passes at 06:05–06:28 plus a replacement pass at 06:47, peak load 3.44; run 2: 06:28–06:38, peak load 3.51).*

Each run is five `bun bench-fair.ts --repeat 1 --json …` passes → 100 samples per cell from 5 page loads of 20, framework order reshuffled every pass, pooled afterwards (statistics above). Per counted pass, the bimodality guard found no median captured by an artifact mode. Table = run 1.

| op | Vanilla | **Pyreon** | Vue 3.6 Vapor (RC) | Octane 0.19 | Vue 3 | Solid 1.9 | Solid 2.0 | Svelte 5 | React 19 | Preact |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create 1,000 | 6.66 | 7.24 | 7.38 | 7.27 | 7.27 | 8.04 | 7.95 | 8.11 | 9.22 | 10.61 |
| replace all | 6.64 | 7.17 | 7.15 | 7.12 | 7.27 | 8.04 | 7.91 | 8.00 | 9.02 | 10.56 |
| partial update | 685µs | 670µs | 675µs | 745µs | 1.02 | 1.28 | 1.33 | 800µs | 865µs | 925µs |
| select row | 5µs | 10µs | 20µs | 25µs | 370µs | 30µs | 70µs | 340µs | 250µs | 280µs |
| swap rows | 800µs | 810µs | 755µs | 800µs | 1.06 | 900µs | 810µs | 1.50 | 5.95 | 940µs |
| remove row | 5.61 | 5.62 | 5.66 | 5.64 | 5.89 | 5.79 | 5.69 | 6.40 | 5.95 | 5.86 |
| clear rows | 90µs | 125µs | 140µs | 135µs | 245µs | 510µs | 300µs | 335µs | 635µs | 255µs |
| create 10,000 | 66.84 | 72.96 | 73.67 | 75.13 | 74.19 | 78.86 | 79.43 | 87.52 | 195.70 | 286.52 |
| append 1k→10k | 11.97 | 13.10 | 62.08 | 13.45 | 63.46 | 13.88 | 14.09 | 19.63 | 15.43 | 17.11 |

(ms unless noted; no per-op cell is Pyreon outright in both runs, so nothing is bold.) Two batch-timed rows run on five arms only (Vanilla, Pyreon, Octane, Solid 1.9, Solid 2.0), per cycle, run 1: **select row** Vanilla 1.00 µs · **Pyreon 1.22** · Octane 1.83 · Solid 2.0 4.52 · Solid 1.9 15; **clear rows** Vanilla 7.24 ms · Octane 7.63 · Pyreon 7.76 · Solid 1.9 7.83 · Solid 2.0 8.13.

**Verdicts, Pyreon vs the fastest rival, run 1 / run 2, median [cluster CI95]:**

- **Win (CIs disjoint in both runs):** select row on the batch-cycle row, 1.22 [1.09–1.26] / 1.20 [0.98–1.25] µs vs Octane 1.83 [1.79–1.86] / 1.79 [1.73–1.88] (1.49–1.50×).
- **Tie (both runs):** create 1,000 (Octane, Vue 3, Vapor); replace all (Octane, Vapor, Vue 3); partial update, 670 [590–730] / 700 [683–720] µs vs Vapor 675 [650–710] / 690 [670–717] (Octane, + Svelte in run 2, also tied); remove row (Octane, Vapor, Solid 2.0, + Vue 3 in run 2); create 10,000, 72.96 [71.72–73.80] / 72.88 [72.40–74.12] vs Vapor 73.67 [73.11–74.19] / 73.75 [73.49–74.45] (Vue 3 and Octane also tied); append, 13.10 [12.95–13.30] / 13.17 [13.03–13.28] vs Octane 13.45 [13.11–17.61] / 13.44 [13.23–13.83].
- **Split, not claimed either way:** **clear rows**, 🤝 in run 1 (125 [123–130] vs Octane 135 [127–145] µs) and a Pyreon win in run 2 (125 [110–125] vs Vapor 140 [135–145] µs, 1.12×; Octane 140 [135–145]); **swap rows**, a **loss to Vapor in run 1** (810 [795–830] vs 755 [670–775] µs, Vapor 1.07×) and 🤝 in run 2 (780 [730–825] vs Octane 775 [690–830] µs; Vapor tied).
- **Loss (CIs disjoint in both runs):** clear rows on the batch-cycle row, 7.76 [7.71–7.84] / 7.80 [7.76–7.84] ms vs Octane 7.63 [7.54–7.69] / 7.64 [7.39–7.68] (Octane 1.02×).
- **No verdict:** select row per op, below 10 clock quanta (Pyreon 10 µs); the batch-cycle row above resolves it.

**Against Solid 1.9 and Solid 2.0** (both runs, CIs disjoint unless noted): Pyreon is faster than both on create 1,000 (1.08–1.11×), replace all (1.09–1.12×), partial update (1.90–1.98×), clear rows (Solid 2.0 2.36–2.40×, Solid 1.9 4.04–4.08×), create 10,000 (1.08–1.09×), append (1.05–1.08×) and the batch-cycle select (Solid 2.0 3.70–3.72×, Solid 1.9 12.3–12.5×). Remove row: Pyreon 1.03× faster than Solid 1.9 in both runs, 🤝 with Solid 2.0. Swap rows: vs Solid 1.9 🤝 in run 1 and Pyreon 1.26× in run 2; 🤝 with Solid 2.0 in both runs. Batch-cycle clear: Pyreon 1.04–1.05× faster than Solid 2.0, 🤝 with Solid 1.9 in both runs.

**Against hand-written Vanilla (run 1):** create 1.09×, replace 1.08×, partial 0.98×, swap 1.01×, remove 1.00×, create 10k 1.09×, append 1.09×, clear 1.39× (1.32× in run 2).

**Retained JS heap after the suite (post-GC, MB, one value per pass, all ten counted passes):** Vanilla 3.01 · **Preact 3.15** · **Pyreon 3.15–3.16** (3.16 in nine passes, 3.15 in one) · Solid 1.9 3.23–3.24 · Svelte 3.33–3.34 · Vue 3 3.36 · Solid 2.0 3.52–3.53 · React 3.56 · Vapor (RC) 4.15–4.16 (5.84 in two passes) · Octane 4.50 (5.27 in one pass). **Pyreon and Preact are level**: 0.00–0.01 MB apart, which is the printout's resolution, and the figure has no CI, so neither is called lighter. On 2026-11-24 the same measurement read Preact 3.14 and Pyreon 3.21 in every pass; this time the other arms read the same or up to 0.01 MB higher (Vue 3 and Octane unchanged) and Pyreon 0.05–0.06 MB lower. The move is not attributed to a change.

**Caveats:** create, replace, remove and append are dominated by browser layout every framework pays identically (§15). `create N rows` is a replace for 19 of 20 samples (no reset between runs). Pyreon and both Solid arms allocate a per-row signal inside the timed op that the plain-object frameworks (Vue, Vapor, Octane) do not. The 2026-11-24 board (`fcccee261`) and the 2026-11-05 board (Octane 0.16, Solid 2.0 RC, Chromium 156) are superseded by this one; their verdict changes are in §0.

## 2. Scenario suite — `bench:scenarios` (real Chromium)

### 2a. Core scenarios: deep tree and context, effect list, memo wall

*Re-measurement · 2026-11-25 · `dfbdecfc7` · Chromium 159 · **two runs**, each five `--repeat 1` passes (`--pass-offset 1…10`, so every pass has its own framework order), run 1 at 06:37–06:42 and run 2 at 06:42–06:47, peak load 3.77; 100 samples per cell (memo 60), cluster CIs over the five page loads.*

| scenario | **Pyreon** run 1 / run 2 | fastest rival run 1 / run 2 | verdict | others (run 1) |
| --- | ---: | ---: | --- | --- |
| mount deep tree (2,047 components) | 3.08 / 3.10 ms | Solid 1.9 3.00 / 2.96 | **split, not claimed:** 🤝 in run 1, **loss** (Solid 1.9 1.05×) in run 2 | Solid 2.0 3.35 / 3.32 (Pyreon 1.07–1.09×) · React 3.50 / 3.46 (Pyreon 1.12–1.13×) · Preact 4.55 · Vue 5.96 · Svelte 10.92 (Vanilla 2.25) |
| context → 1,024 consumers | 1.71 / 1.76 ms | Solid 1.9 1.82 / 1.78 | 🤝 tie (both runs, with both Solids) | Solid 2.0 1.83 / 1.79 · React 2.19 · Svelte 2.27 · Vue 2.40 · Preact 2.46 (Vanilla 1.58) |
| effect list: update 500 | 840 / 843 µs | Solid 2.0 865 / 858 | 🤝 tie (both runs) | Solid 1.9 953 / 923 (Pyreon 1.10–1.13×, both runs) · React 1,097 · Svelte 1,440 · Preact 1,587 · Vue 2,742 (Vanilla 710) |
| effect list: dispose 500 | 45 / 40 µs | Solid 2.0 40 / 37.5 | **no verdict** (below 10 clock quanta) | Solid 1.9 55 / 45 · Svelte 110 · Preact 125 · React 165 · Vue 200 (Vanilla 15) |
| memo wall: blocked | 12.4 / 12.5 µs | Solid 2.0 12.7 / 12.7 | 🤝 tie (both runs) | Vue 15.8 (Pyreon 1.26–1.28×) · Preact 16.2 · React 16.7 · Solid 1.9 22.7 (Pyreon 1.80–1.84×) · Svelte 36.0 |
| memo wall: passthrough | 408 / 406 µs | Svelte 436 / 439 | **win 1.07–1.08×** (both runs) | Solid 2.0 442 (Pyreon 1.08–1.09×) · Solid 1.9 451 (1.11×) · React 505 · Preact 707 · Vue 1,909 (Vanilla 366) |

- **Deep-tree mount is a split, not a tie.** Run 1: 3.080 [3.032–3.123] vs Solid 1.9 3.002 [2.935–3.072] ms (🤝); run 2: 3.097 [3.055–3.135] vs 2.958 [2.915–3.025] ms (disjoint, Solid 1.9 1.05×). Solid 1.9's median leads in both runs. The 2026-11-24 refresh measured 🤝 in both runs (3.09 / 3.03 vs 3.03 / 3.02 ms); that is a comparison across two sessions, and the move is not attributed. The 1.15–1.18× loss published on 2026-11-05 was measured before #4199 (fold static component props and forward pass-through getters) merged; the 2026-11-24 bisect, two runs per commit on Chromium 156: `4360a8ec0` and `c5b2c4c48` lose 1.16–1.18× (3.56–3.60 vs 3.04–3.09 ms), `2655fa3b4` (#4199, the next commit) ties (3.04 / 2.96 vs 3.11 / 2.99 ms). Diagnostic arms (unranked, run 1 / run 2): `SolidJS (eager props)` 2.54 / 2.52 ms, `Pyreon (tpl append)` 3.62 / 3.61 ms, `Pyreon (tpl slot)` 3.90 / 3.92 ms.
- **Dispose 500:** Pyreon and both Solid arms sit at 37.5–55 µs (CV 18–25% for the three) and the leading arm is below the 10-quantum (50 µs) floor, so there is no verdict. The 2026-11-05 "Solid by one quantum" loss stays withdrawn as a verdict, not reversed.
- The `Pyreon (bare computed)` memo arm ties the idiomatic arm in both runs (12.5 / 12.4 µs blocked, 407 / 408 µs passthrough). Solid 2.0 ties Pyreon on the blocked op, which in the 2026-11-05 record was a 1.39–1.40× win over Vue.
- **dbmon was not re-run.** Its 2026-11-05 result (final pass, two runs): Pyreon 1.71 / 1.70 ms, Octane 1.74 / 1.68, Svelte 1.75 / 1.71, a three-way 🤝 tie; Solid 1.82 · Vue 1.85 · React 1.86 · Preact 1.99 (Vanilla 1.55). dbmon changes every value every tick, which removes a signal graph's skip-unchanged advantage by construction; the field converges on the DOM-write floor. It is never quoted as a win for anyone.

### 2b. Retained heap of one mounted deep tree

*Re-measurement · 2026-11-25 · `dfbdecfc7` · Chromium 159 · two runs (06:47, load 2.12–2.42).* The same 2,047-component tree as the deep-tree scenario (`?profileTree=1`), production build. Three warm-up mount/unmount cycles, then per sample two `HeapProfiler.collectGarbage` calls and `Runtime.getHeapUsage` before and after one mount; the figure is the median of 7 samples. Script: the session's `treeheap` driver over `src/impl/profile-tree.tsx` (method of #4228 / #4682; not yet a committed harness).

| arm | run 1 | run 2 | sample range (both runs) |
| --- | ---: | ---: | --- |
| Solid 1.9 | **207.0 KB** | **206.2 KB** | 192.9–235.8 |
| **Pyreon** | 355.1 KB | 355.2 KB | 353.3–360.5 |
| Solid 2.0 | 411.3 KB | 411.3 KB | 400.1–427.6 |

**Loss to Solid 1.9, both runs:** Pyreon retains 1.72× Solid 1.9 for the same mounted tree. **Below Solid 2.0, both runs:** Pyreon retains 0.86× Solid 2.0. The three arms' sample ranges do not overlap. The driver computes no CI, and it is not committed to the repo yet, so this row cannot be reproduced from `main` alone. On 2026-11-24 the same driver read Pyreon 531.7 KB in both runs (Solid 2.0 410.2, Solid 1.9 202.0 / 207.0), a loss to both; that is a comparison across two sessions, and the move is not attributed here.

### 2c. Keyed `.map()` list with conditional slots — `bench:maplist`

*Re-measurement · 2026-11-25 · `dfbdecfc7` · Chromium 159 · **two runs** (run 1 04:59–05:43, run 2 05:43–06:05, peak load 2.63), each five `--repeat 1` passes; 100 samples per cell, batch rows 60; cluster CIs.* 1,000 rows; every op passed the correctness gate on every arm (no `✗ NOT TIMED`). Arms and method: `.agents/guides/benchmarks/README.md` ("Instruments without published rows"). The batch rows (one write + restore per cycle, K = 200) are the clock-independent cross-check for the single-row ops.

| op | **Pyreon `<For>`** run 1 / run 2 | **Pyreon `.map()`** run 1 / run 2 | fastest rival run 1 / run 2 | verdict, `<For>` · `.map()` |
| --- | ---: | ---: | ---: | --- |
| create 1,000 rows | 10.01 / 9.85 ms | 10.39 / 10.37 ms | Solid 1.9 9.68 / 9.56 | split (loss 1.03× in run 1, 🤝 in run 2), not claimed · **loss 1.07–1.08×** |
| replace all 1,000 rows | 10.98 / 10.89 ms | 11.19 / 11.06 ms | Solid 2.0 10.78 / 10.70 | split (loss 1.02× in run 1, 🤝 in run 2), not claimed · **loss 1.03–1.04×** |
| update one cell | 435 / 425 µs | 425 / 425 µs | Solid 1.9 445 / 438 | 🤝 · 🤝 |
| update one cell (batch cycle) | 839 / 827 µs | 835 / 835 µs | Solid 2.0 833 / 834 | 🤝 · 🤝 |
| toggle one conditional | 485 / 443 µs | 470 / 438 µs | Solid 1.9 448 / 455 | 🤝 · 🤝 |
| toggle one conditional (batch cycle) | 853 / 860 µs | 854 / 853 µs | Solid 2.0 852 / 855 | 🤝 · 🤝 |
| swap rows 2 ↔ 999 | 625 / 655 µs | 670 / 715 µs | Solid 2.0 698 / 655 | 🤝 · 🤝 |
| remove row 500 | 7.93 / 7.86 ms | 7.93 / 7.89 ms | Solid 2.0 7.93 / 7.87 | 🤝 · 🤝 |
| clear 1,000 rows | 280 / 283 µs | 270 / 270 µs | Vue 3 320 / 325 (Solid 2.0 325 / 325) | **win 1.14–1.15×** · **win 1.19–1.20×** |

- Clear, median [cluster CI95], run 1 / run 2: `<For>` 280 [280–285] / 283 [280–290] µs, `.map()` 270 [258–290] / 270 [255–300] µs, Vue 3 320 [305–335] / 325 [305–340] µs. `<For>` is also 1.15–1.16× ahead of Solid 2.0.
- Create and replace with `<For>`: 10.01 [9.93–10.06] vs Solid 1.9 9.68 [9.58–9.79] ms and 10.98 [10.92–11.06] vs Solid 2.0 10.78 [10.74–10.84] ms are disjoint in run 1; in run 2 the CIs overlap (9.85 [9.61–9.96] vs 9.56 [9.30–9.64]; 10.89 [10.62–10.99] vs 10.70 [10.65–10.84]). The medians are 1.02–1.03× behind in both runs.
- The `.map()` arm is Pyreon's keyed reconciliation of a plain `.map()` of JSX rows. It loses create (Solid 1.9, Vue 3 and Solid 2.0 all ahead, both runs) and replace (Solid 2.0, + Vue 3 in run 2), ties every single-row, batch, swap and remove op, and wins clear. Against Solid 1.9 its swap is 1.21× faster in run 1 and 🤝 in run 2; `<For>` swap is 1.25–1.30× faster than Solid 1.9 in both runs. Its unranked diagnostic twin, `Pyreon (.map, first render empty)`, tracks it on every op (clear 285 / 305 µs).
- Others, run 1: create — Vue 3 9.71, Solid 2.0 9.73, Svelte 10.80, React 11.04, Preact 13.06 ms; swap — Solid 1.9 813 µs, Preact 910 µs, Vue 3 1.04 ms, Svelte 1.66 ms, React 8.74 ms; clear — Solid 2.0 325 µs, Preact 435 µs, Svelte 470 µs, Solid 1.9 658 µs, React 2.04 ms.
- On 2026-11-24 this list published `<For>` clear as a 1.46× / 1.58× loss to Vue 3 and the `.map()` arm as a loss on create, replace, swap, remove and clear (§0). Those are comparisons across two sessions; the moves are not attributed here.

### 2d. Library and chart scenarios

*Final pass · 2026-11-05 · `779a82f01` · Chromium 156 · flow, virtual and charts **one run** (`--repeat 3`, 60 samples); table and charts-libs **two runs** (`--repeat 3`). Not re-measured by the refresh.*

**Flow — `@pyreon/flow` vs React Flow 12 (500 nodes / 499 edges)** — one run:

| op | Pyreon | React Flow 12 | verdict (one run) |
| --- | ---: | ---: | --- |
| mount | **17.19 ms** | 20.12 ms | Pyreon 1.17× |
| drag one node ×60 | **4.42 ms** | 32.05 ms | Pyreon 7.25× |
| select node | **188 µs** | 1.01 ms | Pyreon 5.39× |
| add 50 nodes + 50 edges | **4.15 ms** | 4.93 ms | Pyreon 1.19× |
| pan + zoom ×60 | **97 µs** | 20.48 ms | Pyreon 210× |
| unmount | **2.12 ms** | 8.19 ms | Pyreon 3.87× |

Neither arm synthesizes pointer events; both drive their public imperative API and verify the DOM each iteration. Drag/pan ratios are mostly React Flow re-rendering node wrappers on every store write.

**Table — `@pyreon/table` vs `@tanstack/react-table` (memoized rows), 1,000 rows × 6 columns, real Chromium** — two runs:

| op | Pyreon | react-table (memo rows) | verdict |
| --- | ---: | ---: | --- |
| mount | 25.64 / 25.55 ms | 25.81 / 26.36 ms | 🤝 in run 1, Pyreon 1.03× in run 2 |
| update one cell | 1.50 / 1.50 ms | 1.54 / 1.55 ms | 🤝 in run 1, Pyreon 1.03× in run 2 |
| replace 1,000 rows | **22.52 / 22.25 ms** | 24.95 / 26.36 ms | **Pyreon 1.11–1.18×** |
| sort 1,000 rows | **17.69 / 17.77 ms** | 19.32 / 19.52 ms | **Pyreon 1.09–1.10×** |
| unmount | **1.21 / 1.18 ms** | 1.75 / 1.69 ms | **Pyreon 1.42–1.45×** |

The overnight run's "react-table mounts 1.12–1.13× faster" does not reproduce on this build in either run and is withdrawn. Which change between the two commits moved it has not been isolated.

**Virtual list — `@pyreon/virtual` vs `@tanstack/react-virtual` (memoized rows), 10,000 rows, real Chromium** — one run:

| op | Pyreon | react-virtual | verdict (one run) |
| --- | ---: | ---: | --- |
| mount 10,000-row list | **777 µs** | 897 µs | Pyreon 1.15× |
| scroll 60 steps of 5 rows | **3.53 ms** | 3.68 ms | Pyreon 1.04× |
| jump to row 5,000 | **315 µs** | 345 µs | Pyreon 1.10× |
| unmount | **20 µs** | 65 µs | Pyreon 3.25× |

**Charts — `@pyreon/charts` vs ECharts 6 (line, 800×400 canvas)** — one run:

| op | PlotChart (default) | ECharts 6 | PlotChart, no a11y table (diagnostic) |
| --- | ---: | ---: | ---: |
| mount 1,000 points | **1.03 ms** | 4.06 ms (3.95×) | 1.04 ms |
| mount 100,000 points | **4.36 ms** | 37.95 ms (8.70×) | 4.23 ms |
| update 100k (every value) | **5.74 ms** | 29.56 ms (5.15×) | 2.84 ms |
| update 1k (one value) | **722 µs** | 1.82 ms (2.52×) | 415 µs |

**Charts — vs uPlot 1.6, Chart.js 4, Recharts 3 (800×300, first painted frame)** — two runs, CV 15–35% on the small cells. Two Pyreon arms are ranked: the default row-object input (`PlotChart`) and the columnar input (`PlotChart columns`, the same input shape uPlot takes).

| op | PlotChart (rows) | PlotChart (columns) | uPlot 1.6 | Chart.js 4 (decimation) | Recharts 3 | verdict (run 1 / run 2) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| mount line, 1,000 | 2.79 / 2.89 | 2.77 / 2.84 | 2.76 / 2.68 | 4.51 / 4.70 | 13.2 | 🤝 Pyreon = uPlot (both arms, both runs) |
| mount line, 10,000 | 3.84 / 3.99 | 3.77 / 3.64 | 3.19 / 3.42 | 5.44 / 5.26 | 70.6 | rows **1.17–1.20× slower** than uPlot; columns 1.18× slower in run 1, 🤝 in run 2 |
| mount line, 100,000 | 5.77 / 5.74 | 5.49 / 5.46 | 5.26 / 5.46 | 6.36 / 6.55 | 644 | 🤝 Pyreon = uPlot (both arms, both runs) |
| mount line, 1,000,000 | 14.92 / 15.39 | 12.11 / 11.77 | 13.47 / 13.59 | 12.81 / 12.86 | 6,726 | columns 🤝 Chart.js = uPlot; rows **1.16–1.20× slower than Chart.js** ¹ |
| update line, 10,000 | 1.17 / 1.17 | **1.09 / 1.06** | 2.25 / 2.21 | 3.71 / 3.92 | 24.2 | **Pyreon** (columns 2.06–2.08×, rows 1.89–1.92× vs uPlot) |
| update line, 100,000 | 2.64 / 2.69 | **2.07 / 2.12** | 4.62 / 4.75 | 3.83 / 3.88 | 184 | **Pyreon** (columns 1.83–1.85×, rows 1.44–1.45× vs Chart.js) |
| mount bars, 1,000 | 5.28 / 5.40 | **5.03 / 5.30** | 21.58 / 21.34 | 11.24 / 11.39 | 41.5 | **Pyreon** (2.11–2.23× vs Chart.js) |

(ms; run 1 / run 2; Recharts run 1 only.) The unranked `Vanilla canvas` control strokes every point with no axes and does not reduce points, so it is a drift control, not a floor. Pyreon draws an offscreen accessible data table by default; nobody else does.

¹ The harness prints 🤝 for the row-input 1M mount in run 1. That label is wrong: the harness ranks every arm against the leader, which here is the *other* Pyreon arm (columns, 12.11 [11.12–14.61] ms), whose wide CI overlaps the row arm. Against Chart.js (12.81 [12.71–12.91]) the row arm (14.92 [14.56–16.72]) is CI-disjoint in both runs (§14).

This build includes #4117 (the row accessor writes into a presized array). The overnight run's row-input figures (1M mount 17.17 / 16.96 ms, 1.32× behind Chart.js) predate it.

## 3. Scaling — `bench-crossover` (batch instrument, 100 → 20,000 rows)

*Final pass · 2026-11-05 · `779a82f01` · Apple M3 Max · **one run** (`--repeat 3`, 12:32–12:37, load 1.9–2.1).* Arms: Pyreon, Octane 0.16, Solid (the harness has no Vapor arm). Per-op figure = cycle ÷ 2, median.

| op | 100 rows | 1,000 | 5,000 | 10,000 | 20,000 |
| --- | --- | --- | --- | --- | --- |
| select — Pyreon / Octane / Solid | 426 ns / 868 ns / 1.8 µs | 442 ns / 900 ns / 7.5 µs | 431 ns / 826 ns / 36.3 µs | 439 ns / 832 ns / 60.8 µs | 442 ns / 823 ns / 109.9 µs |
| partial update — P / O / S | 60.1 / 64.8 / 62.5 µs | 518 / 578 / 555 µs | 3.21 / 3.37 / 3.32 ms | 6.83 / 7.32 / 7.29 ms | 15.98 / 16.93 / 16.91 ms |
| swap — P / O / S | 68.1 / 61.0 / 67.9 µs | 480 / 436 / 497 µs | 2.22 / 2.29 / 2.54 ms | 4.67 / 5.00 / 5.25 ms | 10.72 / 11.85 / 12.31 ms |

- **select:** O(1) for Pyreon and Octane, **Pyreon 1.86–2.04× faster than Octane at every size** (one run); O(n) for Solid (5.4 ns/row; Pyreon 248× faster at 20k).
- **partial update:** Pyreon 1.05–1.12× faster than Octane at every size; 1.03–1.07× faster than Solid except a tie at 1,000 rows (one run). OLS slope 801 / 849 / 848 ns per row.
- **swap:** Pyreon wins from 5,000 rows up (1.03 / 1.07 / 1.11× vs Octane at 5k / 10k / 20k; 1.12–1.15× vs Solid). **At 100 and 1,000 rows Octane leads, 1.12× and 1.10×** (one run, default 40 ms target). This is reported as a loss. One qualification from the overnight run, which this pass did not repeat: the harness's own soundness check (sweep `--target-ms`, which sweeps the batch size K; a sound per-cycle cost must not move) failed for swap at these sizes:

| `--target-ms` (overnight run, `d47fa5a2f`) | Pyreon @100 / @1,000 | Octane @100 / @1,000 | verdict @100 / @1,000 |
| ---: | --- | --- | --- |
| 10 | 62.2 / 425.0 µs | 70.2 / 436.9 µs | Pyreon 1.13× / Pyreon 1.03× |
| 20 | 64.5 / 425.1 µs | 61.3 / 435.2 µs | 🤝 / Pyreon 1.02× |
| 40 (default) | 69.0 / 481.0 µs | 58.9 / 436.7 µs | Octane 1.17× / Octane 1.10× |
| 80 | 64.3 / 453.6 µs | 65.3 / 464.5 µs | 🤝 / Pyreon 1.02× |
| 160 | 64.4 / 449.7 µs | 64.3 / 462.3 µs | 🤝 / 🤝 |

  Pyreon's per-cycle swap cost moved with K while Octane's barely did, which points at allocation/GC cadence inside the timed region. That makes the default-target loss instrument-dependent, not refuted: every default-target run so far has had Octane ahead at these two sizes.

## 4. Hydration — SSR HTML → interactive (real Chromium)

*Final pass · 2026-11-05 · `779a82f01` · Apple M3 Max · 1,000-row table **two runs** (`--repeat 5`, 100 samples each); app page **one run** (`--repeat 3`, 60 samples).*

**1,000-row table (`bench:hydration`)** — every framework adopted 1,000/1,000 server rows:

| | total, run 1 | total, run 2 | **walk** (framework work), run 1 / run 2 |
| --- | ---: | ---: | ---: |
| Vue 3 | 6.02 ms | 5.99 ms | 1.17 / 1.16 ms |
| **Pyreon** | 6.07 ms (🤝) | 6.04 ms | **1.16 / 1.19 ms (🤝 both runs)** |
| React 19 | 6.52 ms | 6.53 ms | 1.69 / 1.69 ms |
| Preact | 8.56 ms | 8.53 ms | 3.47 / 3.55 ms |

**Total:** Vue has the faster median in both runs. Run 1 is a tie (Pyreon 6.07 [6.03–6.08] vs Vue 6.02 [6.00–6.04]); in run 2 the CIs separate by 0.01 ms (6.04 [6.02–6.06] vs 5.99 [5.98–6.01]), Vue 1.01×. Not a win for either; Vue is marginally ahead. **Walk:** tie in both runs. About 100 µs of Pyreon's walk constructs per-row app state Vue's arm does not. Layout is about 80% of every total and identical in shape across frameworks.

**App page (`bench:apppage`, 320 statically composed components, 2,206 nodes)** — all four adopt 2,206/2,206: **Pyreon 4.02 ms** [3.98–4.05] · React 4.15 (1.03×) · Preact 4.30 (1.07×) · Vue 4.47 (1.11×). Pyreon wins, one run.

## 5. Server rendering

*Overnight run · 2026-11-05 02:37–04:15 · `d47fa5a2f` · Apple M3 Max · one run. Not re-measured by the final pass.*

**Compiled SSR, idiomatic per framework (`bench:ssr`, µs/render, 3 processes pooled):**

| rows | **Pyreon** | Vue 3 | Svelte 5 | React 19 | Pyreon `h()` walk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | **1.80** | 3.03 (1.68×) | 2.18 (1.21×) | 10.30 (5.72×) | 17.48 |
| 100 | **11.64** | 15.66 (1.35×) | 18.08 (1.55×) | 76.52 (6.57×) | 146.69 |
| 1,000 | **109.9** [108.1–120.0] | 124.9 [123.6–127.3] (1.14×) | 160.5 (1.46×) | 714.4 (6.50×) | 1,387.6 |

Pyreon leads at every size; at 1,000 rows the CIs are disjoint (one run). Vue's `renderToString` is async and awaited; the others are synchronous.

**`renderToString` vs React / Preact / Solid (`bench:ssr-cross`, byte-identical output enforced, one bun child per scenario):**

| scenario | Pyreon compiled | Solid | Pyreon `h()` | Preact | React |
| --- | ---: | ---: | ---: | ---: | ---: |
| card | **8.95M/s** | 1.91M (4.68×) | 1.66M | 1.40M | 784K |
| list-50 | **208K/s** | 127K (1.64×) | 39.5K | 28.3K | 29.8K |
| list-1000 | **11.3K/s** | 6.6K (1.72×) | 1.9K | 1.3K | 1.6K |
| layout (component children) | **194K/s** | 111K (1.74×) | 35.6K | 25.9K | 25.9K |

## 6. Real-app shapes

*Overnight run · 2026-11-05 · `d47fa5a2f` · Apple M3 Max · one run each. Not re-measured by the final pass.*

**`real-bench` — TodoMVC shape vs `react-dom@19`** (4 passes × 20 runs, order rotated):

| scenario | Pyreon | React 19 | verdict |
| --- | ---: | ---: | --- |
| add-100 | 765 µs | 1.53 ms (CV 24%) | Pyreon 1.99× |
| toggle-1000 | 4.60 ms | 11.41 ms | Pyreon 2.48× |
| clear-1000 | 320 µs | 1.00 ms | Pyreon 3.14× |

add-100 has read 1.14×, 1.38–1.51× and 1.99× on different days with the same harness; React's own add-100 moves (1.0 → 1.53 ms) while Pyreon's does not. Quote add-100 as **1.14–1.99×** until that is explained; toggle (about 2.4×) and clear (3–4×) are stable.

**`form-bench` — 12-field form vs six form libraries** (60 samples per scenario):

| scenario | **Pyreon** | Solid modular-forms | React Hook Form | Formik | Vue vee-validate | Svelte Felte | TanStack Form |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mount 12 fields | **210 µs** | 305 | 640 | 340 | 570 | 575 | 680 |
| keystroke (blur mode) | **60 µs** | 100 | 145 | 530 | 235 | 700 | 690 |
| keystroke (change mode, validates) | **460 µs** | 570 | 830 | 1,320 | 2,260 | 1,150 | 2,380 |
| reset dirty form | **20 µs** | 35 | 180 | 85 | 230 | 230 | 185 |

Retained heap: **Solid modular-forms 2.33 MB** · Pyreon 2.42 · Vue 2.99 · Svelte 2.99 · RHF 3.55 · Formik 3.62 · TanStack 4.05. Pyreon leads every timed scenario; it does not have the lowest heap.

## 7. Bundle size — the same keyed-table app per framework (gzip -9)

*Refresh · 2026-11-24 · `fcccee261` (the refresh's measured tree; a size build, run 04:25, sizes are deterministic) · one run.*

Vanilla 3.6 KB · **Solid 7.7 KB 🥇** · Preact 10.1 (1.32×) · Svelte 16.1 (2.10×) · **Pyreon 18.5 (2.41×)** · Vue 27.7 (3.62×) · Octane 33.9 (4.43×) · React 69.6 (9.10×). Every entry includes the same shared runner module. A **loss** to Solid, Preact and Svelte; React's build is 3.8× Pyreon's and Vue's 1.5×.

Pyreon was 16.6 KB on 2026-10-20, 17.1 KB in the 2026-11-05 overnight run and 17.2 KB in the 2026-11-05 final pass. The growth to 18.5 KB since 2026-11-05 is not attributed to specific PRs. Rival sizes moved with their versions (Solid 1.9.17 → 1.9.19: 7.5 → 7.7 KB; Vue 3.5.44 → 3.5.45: 27.4 → 27.7 KB; Octane 0.16 → 0.19.2: 43.1 → 33.9 KB).

*Overnight run (`d47fa5a2f`), not re-measured:*

**Charts (`bench:charts-bundle`, gzip, beyond a 12.1 KB Pyreon runtime baseline; re-measured 2026-11-19 for the cartesian-basics PR, a size build on a loaded machine, not the overnight run):** line chart 40.3 KB vs ECharts tree-shaken 155.9 KB (3.87×) / whole package 361.0 KB; bar + line + tooltip + legend 40.4 vs 176.8 KB (4.38×); pie 19.8 vs 117.2 KB (5.94×). Main at the same commit before that PR measured 38.8 KB for the line chart, so that PR moved the figure by +0.4 KB and the whole cartesian-basics campaign (bar width and gap, per-datum colour, `connectNulls`, the axis seam, `inverse`, grid, non-linear scales; consolidated, with the scale kinds as imported descriptors) by +1.5 KB (38.8 to 40.3 KB, with bars on a numeric x axis); the 38.0 / 19.1 / 11.2 KB of the 2026-11-05 record had already drifted on main.

**`@pyreon/code`:** core editor 131.0 KB gz vs `@uiw/react-codemirror` 126.4 KB (4% larger; both wrap CodeMirror 6). The monaco-editor row still fails to bundle.

## 8. Reactivity core — vs Preact Signals and Solid

*Final pass · 2026-11-05 · `779a82f01` · Apple M3 Max · **two runs per engine** (`scripts/bench/core/reactivity.ts`).*

ns/op, one process per cell, 3 rounds × 10 windows, order reshuffled per round, n = 30. `Pyreon-bundled` = `lib/` with `process.env.NODE_ENV` folded, as every bundler does for a browser app. Table = run 1; the verdict column covers both runs.

**V8 (node 26.1):**

| test | Pyreon-bundled | Preact | Solid | Pyreon unbundled | verdict vs Preact (both runs) |
| --- | ---: | ---: | ---: | ---: | --- |
| signal create+read+write | 63 | **13** | 20 | 601 | **loss 4.8×** |
| computed diamond (100 updates) | **4,424** | 5,761 | 38,021 | 58,983 | **win 1.30–1.31×** |
| effect propagation (100) | **1,407** | 2,874 | 15,910 | 34,444 | **win 2.04–2.13×** |
| batch 50 signals | **456** | 888 | 4,759 | 11,213 | **win 1.94–1.95×** |
| deep chain (depth 50, 100) | 107,237 | **75,639** | 677,221 | 652,797 | **loss 1.42–1.43×** |
| wide fan-out (1→100 effects) | 1,651 | **1,602** | 4,886 | 12,455 | **loss 1.03–1.04×** (CIs disjoint in both runs) |

Run 2 (bundled vs Preact): create 62 vs 13 · diamond 4,415 vs 5,783 · effect 1,408 vs 2,995 · batch 460 vs 891 · chain 108,214 vs 75,646 · fan-out 1,675 vs 1,616.

**JavaScriptCore (bun 1.4):**

| test | Pyreon | Pyreon-bundled | Preact | Solid | verdict vs Preact (both runs) |
| --- | ---: | ---: | ---: | ---: | --- |
| signal create+read+write | 30 | 31 | **6** | 30 | **loss about 5×** |
| computed diamond | 5,213 | **5,201** | 5,556 | 15,839 | **win 1.07–1.08×** |
| effect propagation | 1,583 | **1,573** | 4,269 | 7,417 | **win 2.5–2.7×** |
| batch 50 signals | **456** | **456** | 1,050 | 1,829 | **win 2.30–2.34×** |
| deep chain | 137,937 | 137,424 | **119,299** | 287,720 | **loss 1.15–1.21×** |
| wide fan-out | **1,587** | 1,590 | 2,202 | 3,015 | **win 1.33–1.38×** |

Run 2 (bundled vs Preact): create 32 vs 6 · diamond 5,174 vs 5,575 · effect 1,697 vs 4,282 · batch 457 vs 1,069 · chain 142,510 vs 118,154 · fan-out 1,599 vs 2,131.

**Honest read.** V8: Pyreon wins the diamond (1.30×), effect propagation (about 2.1×) and batching (1.95×); it loses signal creation (4.8×), deep unobserved chains (1.42–1.43×) and wide fan-out by 1.03–1.04×. JSC: Pyreon wins the diamond (1.07×), effect propagation, batching and fan-out; it loses creation (about 5×) and deep chains (1.15–1.21×). The diamond was a loss on both engines in the overnight run (1.13× V8, 1.01× JSC); #4124 and #4125 are in this build. Solid is behind Pyreon on every row except creation. Store read+write: 459–467 ns bundled on V8, 204–207 ns on JSC. The **unbundled** column is 6–25× slower on V8 because each dev-gate `process.env` read is live there (about 145 ns each, overnight measurement).

## 9. Other core packages

**Router** — *final pass, `779a82f01`, one run* (8 routers, 3 processes pooled, correctness gate over 1,344 cells; ns/op):

| row | Pyreon | best |
| --- | ---: | --- |
| 10 routes — average | 1.91× of best | Hono (wins 6 of 7 rows; Pyreon wins miss → catch-all) |
| 50 routes — average | **1.00×** (radix3 1.01×) | radix3 ×4 rows, find-my-way ×2, Pyreon ×1 |
| 200 routes — average | 1.03× | radix3 1.00× |

The average row prints no CI, so 50 and 200 routes are reported as ties with radix3, and 10 routes as a loss to Hono. Per row at 50/200 routes Pyreon wins miss → catch-all (26 vs find-my-way 57–59 ns) and trails on static (16 vs radix3 12–13 ns), nested static (21 vs radix3 10 ns), dynamic 1 param (78–79 vs find-my-way 61–62 ns), dynamic 2 params (133–134 vs radix3 102–103 ns), nested dynamic (135–142 vs radix3 100–105 ns) and splat (109 vs find-my-way 78–79 ns). Ahead of find-my-way on average (1.13–1.14×), Hono at 50/200 routes (3.3×), Next.js path-to-regexp (2.8–10.6×), Vue Router (7.7–19.0×), TanStack (7.7–8.3×) and React Router (885–3,763×).

> **Harness changed after these figures (PR #4142).** Hono's timed arm now also builds the params object from `router.match`'s raw captures, which every other arm already does inside its timed call; before, that construction ran only in the untimed correctness gate. The router figures above predate the change and will move (Hono's rows up) on the next quiet-machine run.

**Head** vs Unhead — *overnight run, `d47fa5a2f`*: serialize **1.50× / 1.27× / 1.22×** faster (5 / 20 / 50 tags).

**Styler** vs Emotion / goober / styled-components — *overnight run, `d47fa5a2f`*: cold insert 3.38× / 3.59×; warm dedup 6.34× / 3.81×; dynamic resolve 5.26× / 2.17×; SSR collect 3.56× / 3.99× / 2.30× (styled-components includes a React render pass). Pyreon fastest on all four.

**Validate — multi-schema megamorphic workload** vs zod / valibot / arktype — *final pass, `779a82f01`, one run*: Pyreon fastest on **all 12 cells**. The cell zod used to win, invalid scalar string, now reads Pyreon 34.9 [31.8–44.0] ns vs valibot 44.7 [44.1–49.8] (1.28×) and zod 48.7 (1.40×); the CIs are disjoint from valibot's by 0.1 ns, in one run, so treat that cell as the weakest of the twelve.

**Validate — 10-library protocol bench** — *final pass, `779a82f01`, one run*: the same six cells are lost as before. Parse axis: **zod compiled mode (`zod-c`) wins** email valid (24 vs 29 ns), int valid (3 vs 5 ns) and array-of-20 valid (107 vs 119 ns); **arktype wins** object.user valid (35 vs 43 ns; it returns the input aliased, no clone). Check axis: email valid (typia 21 / arktype 22 vs 27 ns) and email invalid (arktype 19 vs 22 ns). Pyreon wins or ties the other 18 cells, including every invalid-input parse.

**Compiler** (Vite 8 pipeline) — *overnight run, `d47fa5a2f`*: Pyreon's reactive pass on top of OXC costs 2.7× (1-element file) to 5.7× (100-row file) OXC alone. A build-time cost, disclosed.

## 10. Fundamentals — head-to-heads (bun/JavaScriptCore, one process per op × library)

The `run` column says which run each row comes from. Final-pass rows are one run each.

| package | vs | run | Pyreon wins | Pyreon loses / ties |
| --- | --- | --- | --- | --- |
| store | Zustand, Jotai | final | dispatch 5.5× / 26.0×, write→subscriber 1.9× / 9.3×, patch (no subscriber) 1.6× / 7.5× | **setup 28.9× slower than Zustand** (483 vs 17 ns; 2 signals + registry); read 1.7× slower than Zustand (5 vs 3 ns, single-digit); patch with a subscriber 🤝 Zustand (87 vs 83 ns); setup 🤝 Jotai |
| storage | Jotai atomWithStorage, Zustand persist | overnight | writes 10.1–29.7×, create 1.7–1.8× | **read 1.5× slower than Zustand** (4 vs 3 ns) |
| state-tree | MobX-State-Tree 9.0.0 | overnight | create (schema) 2.2×, action 9.5×, applySnapshot (schema) 6.8×, applyPatch 7.5×, observer 8.3× | — |
| machine | XState | overnight | create 11.4×, send 34.7×, can 6.0×, matches 4.7× | — |
| i18n | i18next 26.5.11 | overnight | t 12.0×, interpolation 5.1×, plural 3.6×, number 3.1×, date 2.7× | — |
| permissions | CASL | overnight | fair resolver race 1.3–1.9× | exact deny 🤝. Memo-hit rows (2.7–13.8×) are a cache read, not a race |
| http | ky, ofetch, redaxios, axios | final | GET → JSON 1.17× vs ofetch (1,056 vs 1,240 ns); vs ofetch POST 1.30×, query 2.38×; 4.9–20.6× vs ky; 1.77–1.90× vs redaxios; 9.1–56.3× vs axios | create client 🤝 redaxios (83 vs 70 ns) and 🤝 ofetch; 5 s-timeout GET 🤝 ofetch; middleware 🤝 ofetch |
| hotkeys | tinykeys, hotkeys-js, mousetrap | overnight | dispatch hit 1.7–7.5×, miss 6.0–118× (12 and 48 bindings); register + teardown 1.17× vs tinykeys, 9–14× vs the others | — |
| url-state | nuqs | overnight | boolean 1.8×, array parse 2.1×, array serialize 1.2×, float 1.7× | **integer parse 1.1× slower** (8.1 vs 7.0 ns); string, number serialize and round-trip 🤝 |
| form (headless store) | TanStack form-core | overnight | update 62.4×, reset 4.8×, read-all 1.2× | setup 🤝 |
| form (re-render count) | RHF, Formik | overnight | 0 re-renders / 10 keystrokes (RHF 0, Formik 10) | — |
| query ⚠ happy-dom | react-query (same core) | overnight | data change → DOM 5.6×; mount 1.2×; 1 vs 8 derivations | — |
| virtual ⚠ happy-dom | react-virtual (same core) | overnight | scroll → DOM 1.4× | **mount 10k list 1.1× slower** (real Chromium: Pyreon 1.15× faster, §2) |
| table ⚠ happy-dom | react-table (same core) | final | vs naive rows: single-cell update 12.8–18.5×, replace 1.5×, sort 1.7–1.8×; vs memoized rows: single-cell update 1.6× at 100 rows, replace 1.4–1.5× | **mount 1.3× slower at 1,000 rows** (🤝 at 100); **single-cell update 1.2× slower than memoized rows at 1,000**; **sort 1.3× slower than memoized rows at 100** (🤝 at 1,000). Real Chromium mount: 🤝 / Pyreon 1.03× (§2) |
| toast | react-hot-toast, sonner | overnight | headless 2.5–3.8×; cold create 3.3× / 2.5×; ⚠ happy-dom commit 21–31× | sonner excluded from commit rows |
| charts engine | ECharts 6.1 SSR | final | spec → SVG 8.2× (bars 1k), 7.5× (bars 10k), 7.4× (line 10k); median of 15, no CI | — |
| hooks | Solid / Preact counters | overnight | counter 1.27× / 1.47× | wrapper overhead vs raw signal 0–6% |
| rx | computed / Solid / RxJS | final | `pipe` fuses N nodes into 1 (exact count); filter, map and sum level with or ahead of a hand computed | **no verdict:** `pipe` of three stages 1.03× and `sortBy` 1.03× a hand computed, `groupBy` 1.02×; the harness prints medians with no CI |
| dnd ⚠ happy-dom | raw pragmatic-drag-and-drop | overnight | row-enter fan-out 20× | mount/unmount 🤝; monitor +82 ns; dispatch +5 ns |
| validation (wrapper tax) | raw zod / valibot / arktype | overnight | — | tax −24 to +436 ns over raw (largest: arktype invalid) |

> **Harness changed after the store and http figures above (PR #4142).** store: the `setup` op no longer builds Pyreon's store id string (`` `bench-${n}` ``) inside the timed loop; ids are pre-built untimed, so the arms do the same work. http: a new `GET → decoded JSON (library defaults)` row creates every client with no timeout or retry overrides, so Pyreon's and ky's default timeout cost is visible (every other row disables it). The store and http figures here predate the change; the next quiet-machine run replaces them.

⚠ happy-dom rows time a JavaScript DOM implementation, not a browser: counts and relative work are meaningful, absolute times are not. The table bench prints `table-core@9.0.0`; 9.3.1 is installed and measured (§14).

**Animation — `@pyreon/kinetic` vs Motion (real Chromium, 25 samples, overnight run) — PROVISIONAL, not a published claim:** enter 500 kinetic 2.42 / Motion 11.40 / CSS baseline 6.51 ms; enter 2,000 7.10 / 40.01 / 21.22; stagger 300 2.62 / 10.19 / 4.93; stagger 1,000 11.72 / 38.70 / 13.57. Still withheld: kinetic measures **below** the hand-written CSS baseline in every cell, which the same work cannot do.

### `@pyreon/time` vs Date, Temporal, date-fns, Day.js, Luxon: bundle size (2026-11-18, `main` + the time PR)

*Separate run from the 2026-11-05 record above; bun 1.4.0, one machine (Apple M3 Max). Bundle size does not depend on machine load.* Same ten operations in every arm (add days and months, diff in days, compare, start of week and month, month grid, parse ISO, instant to wall time and back in a zone), tree-shaken by the same Bun bundler settings (`minify`, `target: browser`, `NODE_ENV=production`), gzip -9. `cd packages/fundamentals/time && bun run bench:bundle`. date-fns 4.4.0 (+ `@date-fns/tz` 1.5.0), dayjs 1.11.23, luxon 3.7.2.

| arm | minified | gzip |
| --- | ---: | ---: |
| Temporal (native, adapter code only) | 0.9 kB | 0.41 kB |
| Date (hand-written UTC code) | 1.3 kB | 0.58 kB |
| Day.js + utc, timezone, isoWeek | 13.7 kB | 5.42 kB |
| **Pyreon (`@pyreon/time/core`)** | 15.7 kB | **5.90 kB** |
| date-fns + `@date-fns/tz` | 28.6 kB | 8.53 kB |
| Luxon | 71.4 kB | 21.89 kB |

**Loss:** Day.js is 8% smaller than Pyreon for this task set (5.42 vs 5.90 kB gzip), and the platform (`Date`, `Temporal`) is far smaller than any library. Pyreon is 1.4× smaller than date-fns and 3.7× smaller than Luxon. The Pyreon figure includes full DST disambiguation, ISO weeks and strict validation with fix-it error messages. One function alone: `add` is 2.65 kB gzip, a five-function typical set (`add`, `diff`, `startOf`, `monthGrid`, `toInstant`) 5.47 kB (locked in `scripts/size-budgets/packages/time.json`).

**Timing is not recorded here.** The head-to-head timing bench (`bun run bench:rivals`, and `bun run bench:fp` for the composition overhead) was written, gate-checked against Temporal on every input, and run during development while other sessions held the machine at a 1-minute load of 5 to 35 (the record's rule is below 4), so no timing figure is entered in this file. Run both on a quiet machine and replace this paragraph with the result.

## 11. Pyreon-only throughput (no competitor)

*Overnight run · 2026-11-05 · `d47fa5a2f` · not re-measured by the final pass.*

- **cssVariables theming** (300 components, 20 flips, 9 runs, Vite **dev** server): classic 8.46 ms [8.33–9.20] vs cssVariables 9.55 ms [9.31–10.56], **classic 1.13× faster**, CIs disjoint (earlier runs: "1.16×/1.22× faster", both actually ties). All perf counters read 0, so the counter rows are not evidence.
- **runtime-server** (`bench:ssr`, two runs): empty 504–515K renders/s · simple 124–126K · links-100 7.2–7.7K · layouts-26-params 27.1–27.3K. Not comparable to the 2026-09-24 figures (harness re-added in #3642).
- **server:** `processCompiledTemplate` 20.1M ops/s; handler 196K (1 route) / 175K (10 routes) / 109K (5 nested) req/s.
- **unistyle:** flat `styles()` 1.02M/s · responsive cold 183–576K/s · render-cache hit 17.8M/s (78.7× the cold breakpoint-object resolve).
- **sync (CRDT → signal):** presence publish tax 240 ns (1 peer) → 5.5 µs (200 peers); synced-text keystroke 3.8 µs (1k) → 72.8 µs (10k fragmented); inbound WS frame 59 ns.
- **document** (16 formats): 45.9K–505K docs/s small, 1.7K–36.8K docs/s large.
- **loom** scan of this monorepo: 374 ms warm (98.3% import scanning).

## 12. Per-op verdict summary

"Fastest rival" = the fastest non-Pyreon ranked arm. **Win** = Pyreon's CI disjoint and ahead in every run measured; "one run" marks a cell measured once. "N" = 2026-11-25 re-measurement (`dfbdecfc7`), "R" = 2026-11-24 refresh (`fcccee261`), "F" = 2026-11-05 final pass (`779a82f01`), "O" = 2026-11-05 overnight run (`d47fa5a2f`).

| suite · op | run | verdict | fastest rival |
| --- | --- | --- | --- |
| row · create 1,000 | N ×2 | 🤝 tie | Octane / Vue 3 / Vapor RC |
| row · replace all | N ×2 | 🤝 tie | Octane |
| row · partial update | N ×2 | 🤝 tie | Vapor RC |
| row · select row | N ×2 | no verdict per op (sub-resolution); batch cycle: **win** 1.49–1.50× | Octane |
| row · swap rows | N ×2 | split: **loss** (Vapor 1.07×) in run 1, 🤝 in run 2 — not claimed | Vapor RC / Octane |
| row · remove row | N ×2 | 🤝 tie | Octane |
| row · clear rows | N ×2 | split: 🤝 in run 1, win (1.12×) in run 2 — not claimed | Octane / Vapor RC |
| row · create 10,000 | N ×2 | 🤝 tie | Vapor RC |
| row · append 1k→10k | N ×2 | 🤝 tie | Octane |
| row · clear rows, batch cycle | N ×2 | **loss** 1.02× | Octane |
| crossover · select (100–20k) | F ×1 | **win** 1.86–2.04× (one run) | Octane |
| crossover · partial update (100–20k) | F ×1 | **win** 1.05–1.12× vs Octane; tie with Solid at 1k (one run) | Octane / Solid |
| crossover · swap 100 / 1,000 | F ×1 | **loss** 1.12× / 1.10× (one run; K-dependent) | Octane |
| crossover · swap 5k–20k | F ×1 | **win** 1.03–1.11× (one run) | Octane |
| dbmon | F ×2 | 🤝 tie | Octane / Svelte |
| deep-tree mount | N ×2 | split: 🤝 in run 1, **loss** (1.05×) in run 2 — not claimed (Solid 2.0 1.07–1.09× and React 1.12–1.13× slower) | Solid 1.9 |
| deep-tree retained heap | N ×2 | **loss** 1.72× to Solid 1.9; below Solid 2.0 (0.86×) (no CI) | Solid 1.9 |
| context → 1,024 consumers | N ×2 | 🤝 tie | Solid 1.9 |
| effect list: update 500 | N ×2 | 🤝 tie | Solid 2.0 |
| effect list: dispose 500 | N ×2 | no verdict (below 10 clock quanta) | Solid 2.0 |
| memo wall: blocked | N ×2 | 🤝 tie (Vue 1.26–1.28× slower) | Solid 2.0 |
| memo wall: passthrough | N ×2 | **win** 1.07–1.08× | Svelte |
| maplist `<For>`: clear | N ×2 | **win** 1.14–1.15× | Vue 3 |
| maplist `<For>`: create / replace | N ×2 | split: **loss** (1.03× / 1.02×) in run 1, 🤝 in run 2 — not claimed | Solid 1.9 / Solid 2.0 |
| maplist `<For>`: update, toggle (+ batch), swap, remove | N ×2 | 🤝 tie | Solid 1.9 / Solid 2.0 |
| maplist `.map()`: create / replace | N ×2 | **loss** 1.07–1.08× / 1.03–1.04× | Solid 1.9 / Solid 2.0 |
| maplist `.map()`: clear | N ×2 | **win** 1.19–1.20× | Vue 3 |
| maplist `.map()`: update, toggle (+ batch), swap, remove | N ×2 | 🤝 tie | Solid 1.9 / Solid 2.0 |
| flow (6 ops) | F ×1 | **win** all six, 1.17–210× (one run) | React Flow 12 |
| table Chromium: mount | F ×2 | 🤝 in run 1, win (1.03×) in run 2 | react-table (memo rows) |
| table Chromium: update one cell | F ×2 | 🤝 in run 1, win (1.03×) in run 2 | react-table |
| table Chromium: replace / sort / unmount | F ×2 | **win** 1.11–1.18× / 1.09–1.10× / 1.42–1.45× | react-table |
| virtual Chromium (4 ops) | F ×1 | **win** all four, 1.04–3.25× (one run) | react-virtual |
| charts vs ECharts (4 ops) | F ×1 | **win** all four, 2.5–8.7× (one run) | ECharts 6 |
| charts-libs · mount 1k | F ×2 | 🤝 tie | uPlot |
| charts-libs · mount 10k | F ×2 | **loss** 1.17–1.20× (rows); loss / tie (columns) | uPlot |
| charts-libs · mount 100k | F ×2 | 🤝 tie (both arms) | uPlot |
| charts-libs · mount 1M | F ×2 | 🤝 tie (columns); **loss** 1.16–1.20× (rows) | Chart.js (decimation) |
| charts-libs · update 10k / 100k, bars 1k | F ×2 | **win** 1.44–2.23× | uPlot / Chart.js |
| hydration 1,000 rows: total | F ×2 | 🤝 in run 1; Vue 1.01× in run 2 | Vue 3 |
| hydration 1,000 rows: walk | F ×2 | 🤝 tie | Vue 3 |
| hydration app page | F ×1 | **win** 1.03× (one run) | React 19 |
| compiled SSR 10 / 100 / 1,000 rows | O ×1 | **win** 1.21× / 1.35× / 1.14× (one run) | Svelte / Vue / Vue |
| `renderToString` (4 scenarios) | O ×1 | **win** 1.64–4.68× (one run) | Solid |
| TodoMVC (3 ops) | O ×1 | **win** 1.99–3.14× (one run; add-100 varies day to day) | React 19 |
| form-bench (4 ops) | O ×1 | **win** all four (one run) | Solid modular-forms |
| form-bench heap | O ×1 | **loss** (2.42 vs 2.33 MB) | Solid modular-forms |
| row-board heap | N ×2 | level (Pyreon 3.15–3.16 vs Preact 3.15 MB, 0.01 MB resolution, no CI) | Preact |
| bundle (same app) | R | **loss** 2.41× | Solid |
| reactivity V8: diamond / effect / batch | F ×2 | **win** 1.30× / 2.04–2.13× / 1.94–1.95× | Preact |
| reactivity V8: create / chain / fan-out | F ×2 | **loss** 4.8× / 1.42–1.43× / 1.03–1.04× | Preact |
| reactivity JSC: diamond / effect / batch / fan-out | F ×2 | **win** 1.07–1.08× / 2.5–2.7× / 2.3× / 1.33–1.38× | Preact |
| reactivity JSC: create / chain | F ×2 | **loss** about 5× / 1.15–1.21× | Preact |
| router 10 routes | F ×1 | **loss** 1.91× (average, no CI) | Hono |
| router 50 / 200 routes | F ×1 | 🤝 tie (average, no CI) | radix3 |
| head (3 sizes) | O ×1 | **win** 1.22–1.50× | Unhead |
| styler (4 ops) | O ×1 | **win** all four | goober / Emotion |
| validate megamorphic | F ×1 | **win** 12/12 (one run; invalid string by a 0.1 ns CI margin) | valibot / arktype |
| validate protocol | F ×1 | wins/ties 18 of 24 cells; **loss** on 6: parse — zod-c email/int/array-of-20 valid, arktype object.user valid; check — email valid (typia/arktype), email invalid (arktype) | zod-c / arktype / typia |

## 13. Where Pyreon is not outright fastest (collected)

Items 1–4 are from the 2026-11-25 re-measurement and the bundle from the 2026-11-24 refresh; the rest are 2026-11-05 figures (run named in each section).

1. **Memory per component** — one mounted 2,047-component tree retains 355.1 / 355.2 KB in Pyreon against Solid 1.9's 207.0 / 206.2 KB (1.72×), both runs, no CI (§2b); Pyreon is below Solid 2.0 (411.3 KB). On the row board Pyreon and Preact are level (3.15–3.16 vs 3.15 MB, no CI; §1): neither is called the lightest.
2. **Row board** — create 1,000, replace, partial update, remove, create 10,000 and append are statistical ties with Vue 3.6 Vapor (release candidate), Octane 0.19 and Vue 3; clear rows and swap split between runs (swap was a 1.07× loss to Vapor in run 1); the batch-timed clear-rows cycle is a **1.02× loss to Octane** in both runs. The batch-timed select (1.49–1.50× vs Octane) is the only outright row-board win.
3. **Keyed list with conditional slots (`maplist`)** — a plain `.map()` of JSX rows loses create (1.07–1.08×, to Solid 1.9, Vue 3 and Solid 2.0) and replace (1.03–1.04× to Solid 2.0). With `<For>`, create and replace split (a 1.02–1.03× loss in run 1, 🤝 in run 2). Both runs (§2c).
4. **Deep-tree mount** — split: 🤝 in run 1, Solid 1.9 1.05× ahead in run 2 (Solid 2.0 and React are slower in both). **Ties that are not wins:** context propagation, effect-list update and memo wall blocked tie in both runs; effect-list dispose has no verdict (below 10 clock quanta).
5. **Swap at 100 / 1,000 rows (crossover)** — Octane 0.16 1.12× / 1.10× at the default batch target, one run; the result moves with batch size.
6. **Charts line mounts** — the default row-object input loses 10k (1.17–1.20× vs uPlot) and 1M (1.16–1.20× vs Chart.js); the columnar input ties except a 1.18× loss to uPlot at 10k in run 1.
7. **Hydration of a keyed table** — tied with Vue on the walk; on the total, tied in run 1 and Vue 1.01× ahead in run 2.
8. **Signal creation** (about 5× vs Preact, both engines); deep unobserved chains (1.42–1.43× V8, 1.15–1.21× JSC); wide fan-out on V8 (1.03–1.04×).
9. **Bundle size** — 18.5 KB vs Solid 7.7 KB, Preact 10.1 KB, Svelte 16.1 KB (2026-11-24).
10. **Router at 10 routes** (Hono 1.91×) and per-row static, nested-static, dynamic, nested-dynamic and splat matches at every size; **validate protocol**: six cells (zod-c, arktype, typia).
11. **Store setup** (28.9× vs Zustand) and **store read** (1.7×, single-digit ns), **storage read** (1.5×, single-digit ns), **url-state integer parse** (1.1×), **form-bench heap** (Solid lighter), **table under happy-dom** (mount at 1,000 rows, single-cell update vs memoized rows at 1,000, sort vs memoized rows at 100), **virtual mount under happy-dom**.
12. **Other ties and splits that are not wins:** table mount and single-cell update in Chromium (a win in one run each), dbmon, router at 50/200 routes, http client creation, store patch with a subscriber, rx `pipe` / `sortBy` (no CI).
13. **Unbundled Node** — any process importing `lib/` without a bundler pays a live `process.env` read per dev gate (about 145 ns each on V8, overnight measurement).

## 14. Harness notes and open defects

Harness notes from the 2026-11-25 re-measurement:

- **The bimodality guard discarded a pass.** Row-board run 1, pass 2 exited 1 because select row / Svelte 5 had a median captured by an artifact mode (315 µs reported, 250 µs true cost, 50% of samples in a 1.8× slow mode). The pass was replaced, not edited. The guard passed on every counted pass.
- **The 10-quantum floor and the two-run rule were applied by a session script**, not by `bench-scenarios` (next bullet), over the pooled per-pass JSON; the row board's own pooling gives the same verdicts.
- **The cross-day moves in §0 are not A/Bs.** Clear-rows batch cycle, deep-tree mount and the batch select moved between two sessions on two commits; attributing any of them needs an interleaved A/B of `fcccee261` against `dfbdecfc7`, which this record does not contain.

Harness notes from the 2026-11-24 refresh:

- **Every refreshed CI is page-load-aware.** The cluster bootstrap (#4129) is merged and used by `bench-fair` and `bench-scenarios`; the refresh pooled its single-page passes with it. The 2026-11-05 scenario rows still shown (dbmon, table, charts-libs, flow, virtual, charts) were pooled before it; treat their close verdicts (table mount and single-cell update, charts-libs 10k mounts) as provisional until re-run.
- **The scenario harness has no verdict floor.** It printed `🤝` / `🥇` for effect-list dispose (35–50 µs). This record applies the row board's 10-quantum floor to scenario per-op rows by hand (§2a).
- **The deep-tree retained-heap driver is not committed** (§2b; still true on 2026-11-25), and the `router` scenario was run twice but is a Pyreon-only regression instrument with no published row (`.agents/guides/benchmarks/README.md`).

Three harness defects found while publishing the 2026-11-05 final pass:

- **Pooled CIs are too narrow.** `bench-fair` bootstrapped its 100 pooled samples as if they were independent, but they come from 5 page loads of 20 samples each, and per-page medians differ (swap: 620–860 µs per page for every arm). Fixed by #4129 (cluster bootstrap); the 2026-11-05 §1 verdicts had already been recomputed with it from the saved per-page samples.
- **The scenario harness can mislabel a tie.** `bench-scenarios` ranks every arm against the leader, and when the leader is another Pyreon arm (as with `PlotChart columns` at 1M points) a wide leader CI turns a CI-disjoint loss to a rival into 🤝. This record re-derives the 1M row-input verdict against Chart.js directly (§2, footnote ¹). Since #4129 it judges each Pyreon arm against the best non-Pyreon arm.
- **Stale version label:** `packages/fundamentals/table/bench/table-bench.ts` prints `table-core@9.0.0`; 9.3.1 is installed and is what runs. Likewise `packages/fundamentals/validate/bench/validation.ts` prints `typia 14` (15.2.1 is installed). Only the labels are stale.

Still open:

- **Crossover swap fails the harness's own K-independence check** (§3, overnight sweep). The default-target loss at 100/1,000 rows is reported as a loss with that qualification.
- **No CI on two summaries:** `rx-bench` prints medians only, and the router bench's average row has no CI. Neither yields a verdict.
- **`bench-cssvars`** runs against a Vite dev server and its perf counters read 0 in both modes.
- **form-bench** prints machine RAM as 103 GB (GiB/GB mix); the other harnesses print 96 GB.
- **`compileValidators` makes `.is()` about 2× slower** — still open from 2026-09-24 (not re-measured).
- **`@pyreon/code`**: the monaco-editor bundle row still fails to build.
- **real-bench add-100** day-to-day shift (§6) is unexplained.
- **Kinetic** vs Motion stays provisional (§10).

## 15. Caveats and not measured

- **Author-judged and synthetic.** Pyreon's authors wrote and judge every bench here, and every bench is a synthetic workload. Independent reproduction (krausest, above) is the only full answer to author bias.
- **Layout-bound ops.** The row board times `fn()` plus a forced `getBoundingClientRect()`; on create/replace/remove/append, layout is most of the op and identical across frameworks. Measured split for create 1,000 (production build, overnight analysis): Pyreon JS 1.19 ms + layout 7.04 ms vs Vanilla 0.68 + 7.03 ms, so the whole gap to Vanilla is JS. At 10,000 rows 55% of the gap is JS and 45% extra layout.
- **Per-row signals.** Pyreon and both Solid arms allocate a per-row signal the plain-object arms do not; it costs Pyreon about 100 µs of the hydration walk.
- **One machine, one engine.** Every browser figure is from one Apple M3 Max in Chromium; nothing here is measured in Firefox or Safari or on other hardware.
- **Not measured:** streaming SSR, portals, async waterfalls, startup metrics (script bootup, main-thread work), krausest's per-op memory metrics, Firefox/Safari, and any independent third-party run. Fundamentals run under bun (JavaScriptCore); only the reactivity bench has a V8 pass. Crossover has no Vapor arm.

## Reproduce

The 2026-11-25 re-measurement, against a checkout of `dfbdecfc7` (the 2026-11-24 refresh ran the same commands against `fcccee261`, plus `bun bench-bundle.ts`), one suite at a time on a 1-minute load below 4. Each run is five single-page-load passes per suite, then pooled (no rebuild, no timing):

```sh
cd examples/benchmark
# run 1 uses pass offsets 1–5, run 2 offsets 6–10; one pass at a time, in this order
for p in 1 2 3 4 5; do bun bench-scenarios.ts --scenario maplist --repeat 1 --pass-offset $p --raw-out maplist-p$p.json; done
for p in 1 2 3 4 5; do bun bench-fair.ts --repeat 1 --json board-p$p.json; done
for p in 1 2 3 4 5; do
  for s in tree effects memo; do bun bench-scenarios.ts --scenario $s --repeat 1 --pass-offset $p --raw-out $s-p$p.json; done
done
bun bench-scenarios.ts --scenario tree --pool tree-p1.json,tree-p2.json,tree-p3.json,tree-p4.json,tree-p5.json   # likewise effects, memo, maplist
```

(On 2026-11-24 each board pass was followed by one pass of each core scenario; on 2026-11-25 the suites ran in the order above. The tree-heap figure of §2b comes from a session script, not a committed driver.)

The row-board passes are pooled with the same statistics `bench-fair --repeat N` uses (pooled-sample median, `clusterBootstrapCI95` over the per-pass sample arrays in the `--json` files).

The 2026-11-05 final pass is one script run against a checkout of `779a82f01`; every suite below was run strictly sequentially, gated on load below 4.

```sh
cd examples/benchmark
bun bench-fair.ts --repeat 5 --wait-quiet 4
bun bench-scenarios.ts --scenario <dbmon|tree|effects|memo> --repeat 5 --wait-quiet 4   # second run: --pass-offset 5
bun bench-scenarios.ts --scenario <flow|table|virtual|charts|charts-libs> --repeat 3 --wait-quiet 4
bun bench-hydration.ts --repeat 5 --wait-quiet 4 && bun bench-apppage.ts --repeat 3 --wait-quiet 4
bun bench-crossover.ts --repeat 3            # add --target-ms 10|20|80|160 for the K check
bun bench-bundle.ts
bun bench-charts-libs-bundle.ts   # charts-libs rivals' minimal line-chart bundle (no timing)
cd ../.. && bun scripts/bench/core/reactivity.ts && bun scripts/bench/core/reactivity.ts --runtime node
bun scripts/bench/core/router.ts && bun scripts/bench/core/validate.ts
cd packages/fundamentals/validate && bun bench/validation.ts   # likewise store, http, rx, table, charts (bench/*.ts)
```

The library scenarios carry rival arms beyond the React adapter (`bun run bench:flow`, `bench:table`, `bench:virtual` in `examples/benchmark`, one scenario per run): flow — React Flow 12, Svelte Flow 1, Vue Flow 1, JointJS 4; table — TanStack Table on React, Solid, Vue and Svelte, AG Grid Community without row virtualisation (plus an unranked default, virtualised grid); virtual — TanStack Virtual on React, Solid and Vue, react-window 2, virtua, vue-virtual-scroller. Skipped rivals and dropped ops are listed in each scenario file's header.

Overnight-only suites: `bun bench-ssr.ts --wait-quiet 4 && bun bench-charts-bundle.ts` (in `examples/benchmark`), `cd ../real-bench && bun bench.ts --repeat 4 --wait-quiet 4`, `cd ../form-bench && bun bench-form.ts --repeat 3 --wait-quiet 4`, and from the root `bun run bench:ssr-cross && bun run bench:head && bun scripts/bench/core/styler.ts`.

Every fundamentals package: `cd packages/fundamentals/<pkg> && NODE_ENV=production bun bench/<file>.ts` (the package's `bench*` script).

Multi-library head-to-heads (shared harness `scripts/bench/rivals-harness.ts`: one process per op × arm × round, cluster-bootstrap CI95 over processes; not yet in the tables above): `bun run bench:rivals` in `packages/fundamentals/{i18n,machine,query,dnd}` (i18n vs i18next / FormatJS / vue-i18n / Lingui / Paraglide; machine vs XState / Robot; query vs react-query / SWR / Apollo, happy-dom; dnd vs dnd-kit, happy-dom), and `bun run bench:styler-floors` from the root (styler vs Emotion / goober with vanilla-extract, StyleX and Tailwind as non-ranking zero-runtime floors).

Full-stack meta-frameworks (`@pyreon/zero` vs React Router framework mode, Next.js App Router, SvelteKit, SolidStart, Nuxt, Astro, TanStack Start, Qwik City — the same list/detail/form/counter app, production builds on each framework's own Node server; SSR throughput and latency, TTFB, cold start, HTML and first-load JS bytes, hydration window and first click in Chromium): `cd examples/stacks-bench && bun setup.ts && bun bench-stacks.ts --wait-quiet 4 && bun bench-stacks.ts --report` (`bun run bench:stacks`; a subset: `bun bench-stacks.ts <id>`). `bun setup.ts` installs the zero arm from npm at the version its lockfile pins; `--zero=workspace` measures the workspace build instead, and each run records which. Method, known biases and per-arm audit notes: `examples/stacks-bench/README.md` and the docs page `docs/src/content/docs/benchmarks-full-stack.md`. Raw-output schema and the conditions a publishable run must meet: `examples/stacks-bench/results/README.md`. No result from it is published in this file yet.

Realistic client app across frameworks (one catalogue app — a filtered, sorted, paginated list over 5,000 records, a detail view, a validated form, client-side routing and app-wide state — in Pyreon, React, Vue, Solid, Svelte and Preact, each with its own router, state approach and production build; first-load bundle bytes, time to interactive under a 4× CPU / slow-network throttle, retained JS heap after load and after scripted sessions): `cd examples/real-bench/app && bun setup.ts && bun gate.ts && bun bench.ts --wait-quiet 4` (`bun run app:bench` from `examples/real-bench`). Method, metric definitions and known biases: `examples/real-bench/README.md`; the contract every arm implements: `examples/real-bench/app/CONTRACT.md`; raw-output schema and publishing conditions: `examples/real-bench/app/results/README.md`. No result from it is published in this file yet. The pyreon arm's npm pin is 0.54.0, which passes the app's correctness gate (0.53.0 failed it: its header `RouterLink`s mounted before `RouterProvider` ran; fixed by #4174).
