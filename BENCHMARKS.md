# Pyreon Benchmark Results — 2026-11-05

**Machine:** Apple M3 Max · 14 logical cores · 96 GB · darwin 25.6.0 · bun 1.4.0 (JavaScriptCore) · node v26.1.0 (V8) · Chromium 156.0.8078.4 (Playwright 1.64.1).

This record combines two runs made on the same machine on the same day. Every section says which one its figures come from.

| run | code | time (CET) | load (1-min) | what it measured |
| --- | --- | --- | --- | --- |
| **Final pass** | `main` at `779a82f01` (includes #4114–#4128) | 2026-11-05 12:07–13:20 | 1.7–3.8 | row board, scenarios (dbmon, deep tree, effects, memo, flow, table, virtual, charts, charts-libs), hydration, app page, crossover, bundle, reactivity (V8 and JSC), router, validate (both benches), store, http, rx, table (happy-dom), charts engine |
| **Overnight run** | `main` at `d47fa5a2f` | 2026-11-05 02:37–04:15 | 1.2–3.9 | everything else: SSR, `renderToString`, TodoMVC, form-bench, charts and code bundles, head, styler, compiler, the other fundamentals packages, Pyreon-only throughput |

No dependency changed between the two commits, so the competitor versions below apply to both.

**Method (both runs).** Every suite ran **strictly one at a time**, each gated on a 1-minute load below 4 with load stamped before and after. `NODE_ENV=production` everywhere; a production `vite build` for every browser suite; browser suites are cross-origin isolated (measured clock quantum 5 µs, not Chromium's 100 µs clamp); no forced GC under JavaScriptCore.

**Repeats in the final pass.** The row board, the four core scenarios (dbmon, deep tree, effects, memo), the table scenario, charts-libs, hydration and reactivity on both engines were **run twice**. Everything else in the final pass is **one run**, and is labelled so.

**How to read.** Every head-to-head passes a correctness gate before timing (all implementations must produce the same observable result). Figures are medians with bootstrap 95% CIs; the row-board CIs in §1 are re-derived with a cluster bootstrap over page loads (§14). 🤝 means the CIs overlap: *could not distinguish*, not *equal*. A result is called a **win** only when the CIs are disjoint **in both runs**; a result measured once says "one run". When the two runs disagree, both are reported. **Absolute times are machine-dependent; compare ratios.** The three harness defects in §14 limit how far some of these verdicts can be trusted; read them before quoting a close margin.

**Author-judge:** Pyreon's authors wrote and judge every bench here. The only fully independent venue is krausest/js-framework-benchmark; a keyed implementation is staged at `contrib/krausest/pyreon-keyed/`.

**Synthetic:** these are synthetic micro- and scenario benchmarks. They do not predict the performance of your app.

**Competitor versions (installed, verified):** react / react-dom 19.3.1 · vue 3.5.44 · Vue 3.6 Vapor `3.6.0-rc.11` · svelte 5.57.3 · solid-js 1.9.17 · SolidJS 2.0 `2.0.0-rc.15` · preact 11.0.2 · octane 0.16.0 · @xyflow/react 12.12.0 · echarts 6.1.0 · uplot 1.6.32 · chart.js 4.6.1 · recharts 3.10.1 · @tanstack/react-table 9.3.1 (table-core 9.3.1) · @tanstack/react-virtual 3.14.23 (virtual-core 3.19.8) · @tanstack/query-core 5.105.0 · @tanstack/form-core 1.33.5 · @preact/signals-core 1.14.4 · zod 4.6.7 · valibot 1.5.0 · arktype 2.2.9 · typia 15.2.1 · typebox 0.34.52 · yup 1.7.1 · joi 18.3.1 · zustand 5.0.16 · jotai 3.0.1 · mobx-state-tree 9.0.0 · mobx 7.1.1 · xstate 5.33.3 · i18next 26.5.11 · @casl/ability 7.0.2 · ky 2.2.0 · ofetch 1.5.1 · redaxios 0.5.1 · axios 1.20.0 · hotkeys-js 4.0.8 · tinykeys 4.0.1 · mousetrap 1.6.5 · nuqs 2.10.2 · react-hook-form 7.91.0 · formik 2.4.9 · react-hot-toast 2.6.1 · sonner 2.0.8 · rxjs 7.8.2 · unhead 3.4.3 · hono 4.13.14 · react-router 8.5.0 · vue-router 5.4.0 · find-my-way 9.10.0 · radix3 1.1.2 · @emotion/css 11.13.5 · goober 2.1.19 · styled-components 6.6.0.

This record **supersedes** the overnight version of this file (`d47fa5a2f`), the 2026-09-24 run and the 2026-10-15 / 2026-10-20 refreshes. §0 lists every verdict that moved and every claim withdrawn.

---

## 0. What changed, and what is withdrawn

### Changed by the final pass (vs the overnight run, same day)

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

*Final pass · 2026-11-05 · `779a82f01` · Apple M3 Max · **two runs** (12:07–12:16, load 2.4–3.1; 12:53–13:02, load 1.7–3.1).*

`bun bench-fair.ts --repeat 5 --wait-quiet 4` → 100 samples per cell from 5 page loads of 20, framework order reshuffled every pass. Bimodality guard: no median captured by an artifact mode in either run. Table = run 1.

| op | Vanilla | **Pyreon** | Vue 3.6 Vapor (RC) | Octane 0.16 | Vue 3 | Solid | Solid 2.0 (RC) | Svelte 5 | React 19 | Preact |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create 1,000 | 6.78 | **7.26** | 7.35 | 7.47 | 7.33 | 7.88 | 8.28 | 8.07 | 9.04 | 9.87 |
| replace all | 6.69 | **7.13** | 7.11 | 7.29 | 7.38 | 7.83 | 8.24 | 8.02 | 8.89 | 9.80 |
| partial update | 710µs | **705µs** | 710µs | 735µs | 1.04 | 1.27 | 1.22 | 810µs | 885µs | 920µs |
| select row | 5µs | **10µs** | 25µs | 25µs | 380µs | 30µs | 60µs | 325µs | 260µs | 280µs |
| swap rows | 790µs | 805µs | 755µs | 765µs | 1.06 | 955µs | 925µs | 1.50 | 6.06 | 995µs |
| remove row | 5.73 | **5.70** | 5.76 | 5.74 | 5.89 | 5.76 | 5.83 | 6.35 | 5.78 | 5.90 |
| clear rows | 90µs | **130µs** | 145µs | 150µs | 255µs | 460µs | 640µs | 335µs | 920µs | 260µs |
| create 10,000 | 67.56 | 72.64 | 74.83 | 74.31 | 73.99 | 78.75 | 82.99 | 87.51 | 192.01 | 278.03 |
| append 1k→10k | 12.00 | 13.06 | 62.20 | 13.25 | 62.83 | 13.71 | 14.54 | 19.25 | 15.22 | 16.35 |

(ms unless noted.)

**CIs.** The harness prints a bootstrap CI that treats the 100 samples as independent, but they come from 5 page loads of 20, and page-to-page medians differ (swap: 620–860 µs per page for every arm). The verdicts below therefore use a **two-stage cluster bootstrap** (resample the 5 page loads, then samples within each; 1,000 resamples, seed 42; `examples/benchmark/cluster-bootstrap.ts` from #4129) recomputed from the per-page samples saved in the run's JSON. With only 5 clusters these intervals are themselves coarse.

**Verdicts, Pyreon vs the fastest rival, run 1 / run 2, median [cluster CI95]:**

- **Win (CIs disjoint in both runs):** clear rows only, 130 [125–135] / 135 [130–140] µs vs Vapor 145 [140–150] / 150 [147–155] µs (1.11–1.12×).
- **Split, tie in run 1 and win in run 2:** create 10,000, 72.65 [72.11–73.56] / 72.74 [72.14–73.54] vs Vue 3 74.01 [73.55–74.88] in run 1 (CIs touch) and Vapor 74.38 [73.57–75.09] in run 2 (1.02×); append, 13.06 [12.98–13.26] / 13.06 [12.94–13.16] vs Octane 13.26 [13.12–13.40] / 13.34 [13.25–13.51] (1.02× in run 2). Not claimed as wins.
- **Tie (both runs):** create 1,000 (with Vue 3 and Vapor, + Octane in run 2); replace all (Vapor, Octane, + Vue 3 in run 2); partial update (Vapor, Octane); remove row (Octane, Vapor, Solid, React, + Preact in run 1); **swap rows**, 805 [770–825] / 808 [670–835] µs vs Vapor 755 [718–815] / 775 [755–800] µs (Octane and Solid also tied).
- **No verdict:** select row is below 10 clock quanta; the batch instrument (§3) resolves it. The `batch cycle` rows run on only 5 of 10 arms and are not ranked.

**What the pooled CI said instead.** On the harness's own pooled CI, swap was a 1.07× loss to Vapor in run 1 (805 [795–815] vs 755 [735–770] µs) with CIs touching in run 2, and create 10,000 and append were wins in both runs. Neither survives the page-load correction, so neither is published as a verdict.

**Against hand-written Vanilla (run 1):** create 1.07×, replace 1.07×, partial 0.99×, swap 1.02×, remove 0.99×, create 10k 1.08×, append 1.09×, clear 1.44×.

**Retained JS heap after the suite (post-GC, MB, identical in both runs):** Vanilla 2.95 · **Pyreon 3.08** · Preact 3.09 · Solid 3.16 · Svelte 3.27 · Vue 3 3.30 · Solid 2.0 (RC) 3.44 · React 3.50 · Vapor (RC) 4.09 · Octane 4.50. One value per framework per run and no CI, so Pyreon and Preact are tied as the lightest framework.

**Caveats:** create, replace, remove and append are dominated by browser layout every framework pays identically (§15). `create N rows` is a replace for 19 of 20 samples (no reset between runs). Pyreon and Solid allocate a per-row signal inside the timed op that the plain-object frameworks (Vue, Vapor, Octane) do not.

## 2. Scenario suite — `bench:scenarios` (real Chromium)

*Final pass · 2026-11-05 · `779a82f01` · Apple M3 Max · dbmon, deep tree, effects and memo **two runs** (`--repeat 5`, 100 samples per cell; the second run with `--pass-offset 5`, so a different order); flow, virtual and charts **one run** (`--repeat 3`, 60 samples); table and charts-libs **two runs** (`--repeat 3`).*

| scenario | **Pyreon** run 1 / run 2 | fastest rival run 1 / run 2 | verdict | others (run 1) |
| --- | ---: | ---: | --- | --- |
| dbmon tick (100×6, all change) | 1.71 / 1.70 ms | Octane 1.74 / 1.68 | 🤝 tie (both runs; Svelte 1.75 / 1.71 also tied) | Solid 1.82 · Vue 1.85 · React 1.86 · Preact 1.99 (Vanilla 1.55) |
| mount deep tree (2,047 components) | 3.59 / 3.58 ms | Solid 3.06 / 3.10 | **loss 1.15–1.18×** | React 3.71 / 3.66 (🤝 Pyreon in both runs) · Preact 4.48 · Vue 6.16 · Svelte 10.80 (Vanilla 2.42) |
| context → 1,024 consumers | 1.87 / 1.89 ms | Solid 1.96 / 1.92 | win 1.05× in run 1, 🤝 in run 2 | React 2.24 · Svelte 2.34 · Preact 2.51 · Vue 2.57 (Vanilla 1.82) |
| effect list: update 500 | 835 / 797 µs | Solid 870 / 880 | 🤝 in run 1, win 1.10× in run 2 | React 1,130 · Svelte 1,440 · Preact 1,610 · Vue 2,740 (Vanilla 662) |
| effect list: dispose 500 | 50 / 45 µs | Solid 45 / 40 | **loss 1.11–1.13×** (both runs; one 5 µs quantum) | Svelte 105 · Preact 150 · React 195 · Vue 203 (Vanilla 15) |
| memo wall: blocked | 11 / 11 µs | Vue 16 / 16 | **win 1.39–1.40×** | Preact 16 · React 16 · Solid 22 · Svelte 35 |
| memo wall: passthrough | 450 / 451 µs | Svelte 487 / 487 | **win 1.08×** | Solid 492 · React 567 · Preact 735 · Vue 1,910 (Vanilla 422) |

- **dbmon** changes every value every tick, which removes a signal graph's skip-unchanged advantage by construction; the field converges on the DOM-write floor. It is never quoted as a win for anyone.
- **Deep-tree mount is Pyreon's clearest framework loss.** Diagnostic arms (unranked, run 1 / run 2): `SolidJS (eager props)` 2.66 / 2.66 ms, `Pyreon (tpl append)` 3.57 / 3.56 ms, `Pyreon (tpl slot)` 3.87 / 3.84 ms. The overnight run measured 1.16×.
- **Dispose 500** sits at 2–3 clock quanta with CV 21–28%. An on-CPU ablation ladder (overnight analysis, not re-run) measured Pyreon's board-shaped arm *below* Solid (14.3 vs 17.3 µs), so this wall-clock loss is not reproduced as a JS cost; it is still reported as a loss.
- The `Pyreon (bare computed)` memo arm ties the idiomatic arm in both runs (452 / 450 µs passthrough).

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

*Final pass · 2026-11-05 · `779a82f01` · one run (sizes are deterministic).*

Vanilla 3.6 KB · **Solid 7.5 KB 🥇** · Preact 10.1 (1.35×) · Svelte 16.1 (2.14×) · **Pyreon 17.2 (2.30×)** · Vue 27.4 (3.66×) · Octane 43.1 (5.76×) · React 69.6 (9.29×). Every entry includes the same shared runner module.

Pyreon was 16.6 KB on 2026-10-20 and 17.1 KB in the overnight run. The bundle-budget history attributes the 16.6 → 17.1 growth to #3946 (compact `<For>` SSR keys / hydration, runtime-dom budget +462 B), #4088 (named-accessor fix, +468 B) and #3943 (core +160 B); these are budget bumps, not measured per-commit deltas. The further 0.1 KB is not attributed to a specific PR.

*Overnight run (`d47fa5a2f`), not re-measured:*

**Charts (`bench:charts-bundle`, gzip, beyond an 11.2 KB Pyreon runtime baseline):** line chart 38.0 KB vs ECharts tree-shaken 155.9 KB (4.10×) / whole package 361.0 KB; bar + line + tooltip + legend 38.0 vs 176.7 KB (4.65×); pie 19.1 vs 117.2 KB (6.12×).

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

"Fastest rival" = the fastest non-Pyreon ranked arm. **Win** = Pyreon's CI disjoint and ahead in every run measured; "one run" marks a cell measured once. "F" = final pass (`779a82f01`), "O" = overnight run (`d47fa5a2f`).

| suite · op | run | verdict | fastest rival |
| --- | --- | --- | --- |
| row · create 1,000 | F ×2 | 🤝 tie | Vue 3 / Vapor RC |
| row · replace all | F ×2 | 🤝 tie | Vapor RC / Octane |
| row · partial update | F ×2 | 🤝 tie | Vapor RC / Octane |
| row · select row | F ×2 | no verdict (sub-resolution); batch: **win** | Octane (1.86–2.04× slower, one run) |
| row · swap rows | F ×2 | 🤝 tie (cluster CIs; pooled CI read a 1.07× loss in run 1) | Vapor RC / Octane |
| row · remove row | F ×2 | 🤝 tie | Octane / Vapor RC |
| row · clear rows | F ×2 | **win** 1.11–1.12× (cluster CIs) | Vapor RC |
| row · create 10,000 | F ×2 | 🤝 in run 1, win (1.02×) in run 2 | Vue 3 / Vapor RC |
| row · append 1k→10k | F ×2 | 🤝 in run 1, win (1.02×) in run 2 | Octane |
| crossover · select (100–20k) | F ×1 | **win** 1.86–2.04× (one run) | Octane |
| crossover · partial update (100–20k) | F ×1 | **win** 1.05–1.12× vs Octane; tie with Solid at 1k (one run) | Octane / Solid |
| crossover · swap 100 / 1,000 | F ×1 | **loss** 1.12× / 1.10× (one run; K-dependent) | Octane |
| crossover · swap 5k–20k | F ×1 | **win** 1.03–1.11× (one run) | Octane |
| dbmon | F ×2 | 🤝 tie | Octane / Svelte |
| deep-tree mount | F ×2 | **loss** 1.15–1.18× | Solid (React 🤝 Pyreon) |
| context → 1,024 consumers | F ×2 | win (1.05×) in run 1, 🤝 in run 2 | Solid |
| effect list: update 500 | F ×2 | 🤝 in run 1, win (1.10×) in run 2 | Solid |
| effect list: dispose 500 | F ×2 | **loss** 1.11–1.13× (one clock quantum) | Solid |
| memo wall: blocked / passthrough | F ×2 | **win** 1.39–1.40× / 1.08× | Vue / Svelte |
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
| row-board heap | F ×2 | 🤝 tie (lightest framework, with Preact) | Preact |
| bundle (same app) | F | **loss** 2.30× | Solid |
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

1. **Deep component-tree mount** — 1.15–1.18× behind Solid (3.59 / 3.58 vs 3.06 / 3.10 ms); React ties Pyreon.
2. **Row board** — create 1,000, replace, partial update, swap and remove are statistical ties with Vue 3.6 Vapor (release candidate), Octane 0.16 and (create) Vue 3; create 10,000 and append win only one of two runs. Pyreon wins only clear rows outright in both runs.
3. **Swap at 100 / 1,000 rows (crossover)** — Octane 1.12× / 1.10× at the default batch target, one run; the result moves with batch size.
4. **Effect-list dispose 500** — Solid ahead in both runs by one 5 µs clock quantum.
5. **Charts line mounts** — the default row-object input loses 10k (1.17–1.20× vs uPlot) and 1M (1.16–1.20× vs Chart.js); the columnar input ties except a 1.18× loss to uPlot at 10k in run 1.
6. **Hydration of a keyed table** — tied with Vue on the walk; on the total, tied in run 1 and Vue 1.01× ahead in run 2.
7. **Signal creation** (about 5× vs Preact, both engines); deep unobserved chains (1.42–1.43× V8, 1.15–1.21× JSC); wide fan-out on V8 (1.03–1.04×).
8. **Bundle size** — 17.2 KB vs Solid 7.5 KB, Preact 10.1 KB, Svelte 16.1 KB.
9. **Router at 10 routes** (Hono 1.91×) and per-row static, nested-static, dynamic, nested-dynamic and splat matches at every size; **validate protocol**: six cells (zod-c, arktype, typia).
10. **Store setup** (28.9× vs Zustand) and **store read** (1.7×, single-digit ns), **storage read** (1.5×, single-digit ns), **url-state integer parse** (1.1×), **form-bench heap** (Solid lighter), **table under happy-dom** (mount at 1,000 rows, single-cell update vs memoized rows at 1,000, sort vs memoized rows at 100), **virtual mount under happy-dom**.
11. **Ties and splits that are not wins:** row-board create 10,000 and append, context propagation and effect-list update (a win in one run each), table mount and single-cell update in Chromium (a win in one run each), dbmon, router at 50/200 routes, http client creation, store patch with a subscriber, rx `pipe` / `sortBy` (no CI).
12. **Unbundled Node** — any process importing `lib/` without a bundler pays a live `process.env` read per dev gate (about 145 ns each on V8, overnight measurement).

## 14. Harness notes and open defects

Three harness defects found while publishing the final pass:

- **Pooled CIs are too narrow.** `bench-fair` bootstraps its 100 pooled samples as if they were independent, but they come from 5 page loads of 20 samples each, and per-page medians differ (swap: 620–860 µs per page for every arm). #4129 (open) adds a cluster bootstrap. §1's verdicts are already recomputed with it from the saved per-page samples; on the pooled CI, swap read as a run-1 loss and create 10,000 and append as wins. `bench-scenarios` pools its passes the same way and its text logs do not keep per-pass samples, so the §2 scenario CIs are still pooled: treat the close scenario verdicts (context, effect-list update and dispose, table mount and single-cell update, charts-libs 10k mounts) as provisional until re-run with #4129.
- **The scenario harness can mislabel a tie.** `bench-scenarios` ranks every arm against the leader, and when the leader is another Pyreon arm (as with `PlotChart columns` at 1M points) a wide leader CI turns a CI-disjoint loss to a rival into 🤝. This record re-derives the 1M row-input verdict against Chart.js directly (§2, footnote ¹).
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
- **Per-row signals.** Pyreon and Solid allocate a per-row signal the plain-object arms do not; it costs Pyreon about 100 µs of the hydration walk.
- **Not measured:** streaming SSR, portals, async waterfalls, startup metrics (script bootup, main-thread work), krausest's per-op memory metrics, Firefox/Safari, and any independent third-party run. Fundamentals run under bun (JavaScriptCore); only the reactivity bench has a V8 pass. Crossover has no Vapor arm.

## Reproduce

The final pass is one script run against a checkout of `779a82f01`; every suite below was run strictly sequentially, gated on load below 4.

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

Overnight-only suites: `bun bench-ssr.ts --wait-quiet 4 && bun bench-charts-bundle.ts` (in `examples/benchmark`), `cd ../real-bench && bun bench.ts --repeat 4 --wait-quiet 4`, `cd ../form-bench && bun bench-form.ts --repeat 3 --wait-quiet 4`, and from the root `bun run bench:ssr-cross && bun run bench:head && bun scripts/bench/core/styler.ts`.

Every fundamentals package: `cd packages/fundamentals/<pkg> && NODE_ENV=production bun bench/<file>.ts` (the package's `bench*` script).
