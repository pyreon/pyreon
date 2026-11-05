# Pyreon Benchmark Results — Full Run (2026-11-05)

**Machine:** Apple M3 Max · 14 logical cores · 96 GB · darwin 25.6.0 · bun 1.4.0 (JavaScriptCore) · node v26.1.0 (V8) · Chromium 156.0.8078.4 (Playwright 1.64.1).
**Code:** `main` at `d47fa5a2f` (2026-11-05).
**Run:** 2026-11-05 02:37–04:15 CET. Every suite ran **strictly one at a time** on an otherwise idle machine, gated on 1-minute load ≤ 4 (`--wait-quiet 4`) where the harness supports it, with load stamped before and after. Load across the whole run: **1.2–3.9**, mostly about 2. `NODE_ENV=production` everywhere; production `vite build` for every browser suite; browser suites cross-origin isolated (measured clock quantum 5.0 µs, not Chromium's 100 µs clamp).

**How to read.** Every head-to-head passes a correctness gate before timing (all implementations must produce the same observable result). Figures are medians with bootstrap 95% CIs. 🤝 means the CIs overlap — *could not distinguish*, not *equal*. A result is called a win only when the CIs are disjoint. Close cells on the row board, the scenario board, hydration, the table scenario and charts-libs were **run twice**; a verdict is only stated where both runs agree, and disagreements are reported as such. **Absolute times are machine-dependent — compare ratios.**

**Author-judge:** Pyreon's authors wrote and judge every bench here. The only fully independent venue is krausest/js-framework-benchmark; a keyed implementation is staged at `contrib/krausest/pyreon-keyed/`.

**Competitor versions (installed, verified):** react / react-dom 19.3.1 · vue 3.5.44 · Vue 3.6 Vapor `3.6.0-rc.11` · svelte 5.57.3 · solid-js 1.9.17 · SolidJS 2.0 `2.0.0-rc.15` · preact 11.0.2 · **octane 0.16.0** (was 0.13.5 on 2026-10-15) · @xyflow/react 12.12.0 · echarts 6.1.0 · uplot 1.6.32 · chart.js 4.6.1 · recharts 3.10.1 · @tanstack/react-table 9.3.1 (table-core 9.3.1) · @tanstack/react-virtual 3.14.23 (virtual-core 3.19.8) · @tanstack/query-core 5.105.0 · @tanstack/form-core 1.33.5 · @preact/signals-core 1.14.4 · zod 4.6.7 · valibot 1.5.0 · arktype 2.2.9 · typia 15.2.1 · typebox 0.34.52 · yup 1.7.1 · joi 18.3.1 · zustand 5.0.16 · jotai 3.0.1 · **mobx-state-tree 9.0.0** (was 8.0.0) · mobx 7.1.1 · xstate 5.33.3 · **i18next 26.5.11** · @casl/ability 7.0.2 · ky 2.2.0 · ofetch 1.5.1 · redaxios 0.5.1 · axios 1.20.0 · hotkeys-js 4.0.8 · tinykeys 4.0.1 · mousetrap 1.6.5 · nuqs 2.10.2 · react-hook-form 7.91.0 · formik 2.4.9 · react-hot-toast 2.6.1 · sonner 2.0.8 · rxjs 7.8.2 · unhead 3.4.3 · hono 4.13.14 · react-router 8.5.0 · vue-router 5.4.0 · find-my-way 9.10.0 · radix3 1.1.2 · @emotion/css 11.13.5 · goober 2.1.19 · styled-components 6.6.0.

This run **supersedes** the 2026-09-24 run and the 2026-10-15 / 2026-10-20 refreshes. §0 lists every verdict that moved and every claim withdrawn.

---

## 0. What changed, and what is withdrawn

### Withdrawn claims

| previously published | status now | why |
| --- | --- | --- |
| "Octane wins swap at 1,000 rows (1.08×)" (crossover, 2026-10-15) | **withdrawn — unresolved** | The batch instrument's per-cycle swap cost depends on the batch size K (§3). Octane leads only at the default 40 ms target; at 10/20 ms Pyreon leads and at 80/160 ms they tie. |
| "Vue 3.6 Vapor (RC) outright on replace all (1.02×) and swap rows (1.08×)" (2026-10-15) | **withdrawn** | Both are statistical ties in both of today's runs. |
| "Pyreon outright on create 1,000 / replace all / create 10,000" (page, 2026-09-23) | **withdrawn** | Ties with Vapor RC, Octane 0.16 and Vue 3 in both runs. |
| "Pyreon has the lowest retained heap" (form-bench) | **withdrawn** | Solid modular-forms 2.33 MB < Pyreon 2.42 MB. |
| "Pyreon fastest median on dbmon" (2026-10-15) | superseded | Three-way tie; Svelte has the fastest median in run 2. dbmon is never a win for anyone (§2). |
| JSC "bundled store read+write slower than unbundled" anomaly | **gone** | 206 vs 207 ns, CI-tied. |
| "cssVariables theming 1.16× / 1.22× faster" and "🤝 tie" | **reversed** | Classic mode is now 1.13× faster, CIs disjoint (§11). |
| runtime-server throughput 629K / 177K / 10.8K / 29.4K renders/s (2026-09-24) | **not comparable** | `scripts/bench/core/runtime-server.ts` was re-added in full by #3642 after that run; today's figures (§11) come from a different harness, so no regression or improvement is claimed. |

### Verdicts that moved since 2026-10-15/20

| bench | 2026-10-15/20 | 2026-11-05 |
| --- | --- | --- |
| row board: create 1k, partial update, create 10k | 🤝 Pyreon = Vapor | 🤝 Pyreon = Vapor = Octane (= Vue 3 on create) — Octane 0.16 closed the gap |
| row board: replace all, swap rows | Vapor outright | 🤝 ties (both runs) |
| row board: remove row | 🤝 | 🤝 (unchanged) |
| row board: clear rows, append | Pyreon outright | Pyreon outright (unchanged) |
| crossover: swap at 1,000 rows | Octane 1.08× | instrument-dependent, no verdict (§3) |
| deep-tree mount | Solid 1.23× | Solid 1.20×; React ≈ Pyreon (tie in run 2, disjoint by 0.01 ms in run 1) |
| context → 1,024 consumers | Pyreon fastest median | **Pyreon outright** (both runs) |
| effect list: update 500 | Pyreon fastest median | **Pyreon outright** (both runs) |
| effect list: dispose 500 | Solid 45 vs 55 µs | 🤝 in run 1, Solid outright in run 2 (38 vs 50 µs) — at the clock's resolution |
| hydration 1,000 rows, total | Vue 1.02× | 🤝 (5-pass run); run 1 disjoint by 0.01 ms |
| hydration 1,000 rows, walk | Vue 1.05× | 🤝 |
| compiled SSR, 1,000 rows | 🤝 with Vue | **Pyreon 1.14×** |
| table, real Chromium, mount 1,000 rows | 1.03× slower (2026-10-20) | **1.12× slower** (two runs) |
| real-bench add-100 | 1.14–1.51× | 1.99× (React CV 24%) |
| bundle (same app) | 16.6 KB | **17.1 KB** (grew 0.5 KB, §7) |
| reactivity JSC: computed diamond | 🤝 with Preact | Preact 1.01× (CIs disjoint) |
| reactivity V8: wide fan-out | Preact 1.38× | Preact 1.17× |
| form store setup vs TanStack | 1.4× slower | **🤝** (#3938) |
| hotkeys register + teardown vs tinykeys | 1.07–1.32× faster | 1.17× faster |
| state-tree vs MST | 5.4–35.7× | 2.2–9.8× (MST 8 → 9.0.0) |
| i18n vs i18next | t 18.2× | t 12.0× (i18next 26.4 → 26.5.11) |

---

## 1. DOM row-list suite — `bench:fair` (10 frameworks, real Chromium)

`bun bench-fair.ts --repeat 5 --wait-quiet 4` → 100 pooled samples per cell, framework order reshuffled every pass. Two complete runs (02:39–02:49, load 1.4–2.4; 02:49–02:58, load 1.9–2.3). Bimodality guard: no median captured by an artifact mode in either run. Table = run 1.

| op | Vanilla | **Pyreon** | Vue 3.6 Vapor (RC) | Octane 0.16 | Vue 3 | Solid | Solid 2.0 (RC) | Svelte 5 | React 19 | Preact |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create 1,000 | 6.74 | **7.49** | 7.37 | 7.49 | 7.42 | 7.93 | 8.32 | 8.12 | 9.31 | 9.94 |
| replace all | 6.85 | **7.34** | 7.22 | 7.31 | 7.36 | 7.80 | 8.31 | 8.06 | 9.32 | 9.86 |
| partial update | 720µs | **675µs** | 690µs | 715µs | 1.06 | 1.30 | 1.29 | 805µs | 870µs | 905µs |
| select row | 5µs | **10µs** | 25µs | 25µs | 385µs | 30µs | 65µs | 365µs | 280µs | 280µs |
| swap rows | 760µs | **790µs** | 775µs | 860µs | 1.07 | 1.03 | 885µs | 1.53 | 6.05 | 990µs |
| remove row | 5.69 | **5.80** | 5.75 | 5.80 | 5.90 | 5.82 | 5.87 | 6.47 | 6.02 | 6.00 |
| clear rows | 85µs | **130µs** | 150µs | 155µs | 250µs | 465µs | 645µs | 335µs | 660µs | 275µs |
| create 10,000 | 67.52 | **74.88** | 74.45 | 74.59 | 74.46 | 78.11 | 82.67 | 87.83 | 195.31 | 278.42 |
| append 1k→10k | 12.08 | **13.07** | 62.45 | 13.34 | 63.18 | 13.64 | 14.45 | 19.21 | 15.34 | 16.08 |

(ms unless noted.)

**Verdicts (CI95, both runs agree):**

- **Pyreon outright:** clear rows (130 vs Vapor 150 µs, 1.15×), append 1k→10k (13.07 vs Octane 13.34 ms, 1.02×).
- **Tie:** create 1,000 (Pyreon = Vapor = Vue 3, + Octane in run 1), replace all (Pyreon = Vapor = Octane, + Vue 3 in run 2), partial update (Pyreon = Vapor = Octane; Pyreon has the fastest median in run 1, Octane and Pyreon share it in run 2), swap rows (Pyreon = Vapor in run 1, + Octane in run 2), remove row (Pyreon = Vapor = Octane, + Solid in run 1), create 10,000 (Pyreon = Vapor = Vue 3 = Octane).
- **No verdict:** select row is below 10 clock quanta; the batch instrument (§3) resolves it. The `batch cycle` rows run on only 5 of 10 arms and are not ranked.

**Run 2, Pyreon vs that run's leader:** create 7.40 vs Vapor 7.36 · replace 7.29 vs Vapor 7.19 · partial 690 vs Octane 690 µs · swap 815 vs Vapor 800 µs · remove 5.78 vs Octane 5.77 · clear 130 vs Vapor 150 µs (Pyreon outright) · create 10k 74.47 vs Vue 74.38 · append 13.07 vs Octane 13.36 (Pyreon outright).

**Against hand-written Vanilla (run 1):** create 1.11×, replace 1.07×, partial 0.94×, swap 1.04×, remove 1.02×, create 10k 1.11×, append 1.08×, clear 1.53×.

**Retained JS heap after the suite (post-GC, MB, both runs):** Vanilla 2.94 · **Pyreon 3.08** · Preact 3.08 · Solid 3.16 · Svelte 3.27 · Vue 3 3.30 · Solid 2.0 (RC) 3.44 · React 3.50 · Vapor (RC) 4.08 · Octane 4.50. Pyreon ties Preact as the lightest framework.

**Caveats:** create, replace, remove and append are dominated by browser layout every framework pays identically (§13). `create N rows` is a replace for 19 of 20 samples (no reset between runs). Pyreon and Solid allocate a per-row signal inside the timed op that the plain-object frameworks (Vue, Vapor, Octane) do not.

## 2. Scenario suite — `bench:scenarios` (real Chromium, 60 samples per cell)

`--repeat 3`, two runs (second with `--pass-offset 3`, so a different order). Load 1.2–2.1. Table = run 1.

| scenario | fastest | **Pyreon** | others |
| --- | --- | --- | --- |
| dbmon tick (100×6, all change) | 🤝 **Pyreon 1.71** = Octane 1.71 = Svelte 1.75 | — | Solid 1.81 · React 1.82 · Vue 1.92 · Preact 1.99 (Vanilla 1.58) |
| mount deep tree (2,047 components) | Solid 3.09 ms | **3.59 ms (1.16× slower)** ¹ | React 3.63 ¹ · Preact 4.44 · Vue 6.15 · Svelte 10.83 (Vanilla 2.41) |
| context → 1,024 consumers | **Pyreon 1.88 ms** | — | Solid 1.94 · React 2.25 · Svelte 2.36 · Preact 2.52 · Vue 2.60 (Vanilla 1.84) |
| effect list: update 500 | **Pyreon 820 µs** | — | Solid 907 · React 1,140 · Svelte 1,440 · Preact 1,600 · Vue 2,800 |
| effect list: dispose 500 | 🤝 Pyreon 45 = Solid 45 µs | — | Svelte 105 · Preact 165 · React 185 · Vue 205 |
| memo wall: blocked | **Pyreon 11 µs** | — | Vue 16 · Preact 17 · React 17 · Solid 22 · Svelte 36 |
| memo wall: passthrough | **Pyreon (bare computed) 450 µs** | 450 µs | Svelte 493 · Solid 496 · React 564 · Preact 745 · Vue 1,900 |

**Run 2:** dbmon — Svelte 1.66, Octane 1.68, Pyreon 1.73, Solid 1.75, React 1.78 all 🤝 (Vue 1.89, Preact 2.04 behind). Deep tree — Solid 3.11, React 3.66, Pyreon 3.75 (React = Pyreon 🤝). Context — Pyreon 1.84 outright, Solid 1.93. Update 500 — Pyreon 808 outright, Solid 865. **Dispose 500 — Solid 38 µs outright, Pyreon 50 µs.** Memo blocked — Pyreon 11 µs outright. Passthrough — Pyreon (bare computed) 449, Pyreon 461, Svelte 487.

- **dbmon** changes every value every tick, which removes a signal graph's skip-unchanged advantage by construction; the field converges on the DOM-write floor. It is never quoted as a win for anyone.
- ¹ Re-measured 2026-11-05 after null-prototype reactive props (`--scenario tree --only Pyreon,SolidJS,React 19,Vanilla JS` plus a same-build `Pyreon (old props)` arm running the previous pipeline, repeat 5, two runs): Pyreon 3.57 [3.50–3.61] / 3.59 [3.54–3.62] ms vs old pipeline 3.72 [3.67–3.76] / 3.70 [3.66–3.74], Solid 3.12 / 3.09, React 3.64 / 3.63 (🤝 with Pyreon). The 3.72 / 3.75 ms in this refresh (and in Run 2 above) is the pre-change pipeline. Preact/Vue/Svelte were not re-run.
- **Deep-tree mount is Pyreon's clearest framework loss.** Diagnostic arms (unranked): `SolidJS (eager props)` 2.63 ms, `Pyreon (tpl append)` 3.74 ms, `Pyreon (tpl slot)` 4.00 ms.
- **Dispose 500** sits at 2–3 clock quanta with CV 21–41%. The on-CPU ablation ladder measures Pyreon's board-shaped arm *below* Solid (14.3 vs 17.3 µs), so the wall-clock lead is not reproduced as a JS cost (see the gap notes in §12).

**Flow — `@pyreon/flow` vs React Flow 12 (500 nodes / 499 edges)** — one run, load 1.9–2.8:

| op | Pyreon | React Flow 12 | verdict |
| --- | ---: | ---: | --- |
| mount | **17.15 ms** | 20.26 ms | Pyreon 1.18× |
| drag one node ×60 | **4.28 ms** | 31.43 ms | Pyreon 7.3× |
| select node | **200 µs** | 992 µs | Pyreon 5.0× |
| add 50 nodes + 50 edges | **4.16 ms** | 4.92 ms | Pyreon 1.18× |
| pan + zoom ×60 | **100 µs** | 20.63 ms | Pyreon 206× |
| unmount | **2.14 ms** | 8.13 ms | Pyreon 3.8× |

Neither arm synthesizes pointer events; both drive their public imperative API and verify the DOM each iteration. Drag/pan ratios are mostly React Flow re-rendering node wrappers on every store write.

**Table — `@pyreon/table` vs `@tanstack/react-table` (memoized rows), 1,000 rows × 6 columns, real Chromium** — two runs:

| op | Pyreon | react-table (memo rows) | verdict (both runs) |
| --- | ---: | ---: | --- |
| mount | 28.90 / 28.29 ms | **25.51 / 25.26 ms** | **react-table 1.12–1.13×** |
| update one cell | 1.53 / 1.50 ms | 1.58 / 1.52 ms | 🤝 |
| replace 1,000 rows | **22.17 / 21.95 ms** | 25.34 / 24.59 ms | Pyreon 1.12–1.14× |
| sort 1,000 rows | **17.73 / 17.63 ms** | 19.42 / 19.56 ms | Pyreon 1.10–1.11× |
| unmount | **1.23 / 1.20 ms** | 1.72 / 1.69 ms | Pyreon 1.40× |

**Virtual list — `@pyreon/virtual` vs `@tanstack/react-virtual` (memoized rows), 10,000 rows, real Chromium** — one run:

| op | Pyreon | react-virtual | verdict |
| --- | ---: | ---: | --- |
| mount 10,000-row list | **782 µs** | 905 µs | Pyreon 1.16× |
| scroll 60 steps of 5 rows | **3.50 ms** | 3.68 ms | Pyreon 1.05× |
| jump to row 5,000 | **303 µs** | 330 µs | Pyreon 1.09× |
| unmount | **25 µs** | 68 µs | Pyreon 2.7× |

**Charts — `@pyreon/charts` vs ECharts 6 (line, 800×400 canvas)** — one run:

| op | PlotChart (default) | ECharts 6 | PlotChart, no a11y table (diagnostic) |
| --- | ---: | ---: | ---: |
| mount 1,000 points | **1.07 ms** | 4.12 ms (3.9×) | 1.01 ms |
| mount 100,000 points | **4.92 ms** | 38.72 ms (7.9×) | 4.84 ms |
| update 100k (every value) | **6.25 ms** | 29.65 ms (4.7×) | 3.42 ms |
| update 1k (one value) | **720 µs** | 1.83 ms (2.5×) | 430 µs |

**Charts — vs uPlot 1.6, Chart.js 4, Recharts 3 (800×300, first painted frame)** — two runs, CV 15–30% on the small cells. Two Pyreon arms are ranked: the default row-object input (`PlotChart`) and the columnar input (`PlotChart columns`, the same input shape uPlot takes).

| op | PlotChart (rows) | PlotChart (columns) | uPlot 1.6 | Chart.js 4 (decimation) | Recharts 3 | verdict (both runs) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| mount line, 1,000 | 2.73 / 2.75 | 2.70 / 2.77 | 2.45 / 2.88 | 4.34 / 4.78 | 13.2 | 🤝 Pyreon = uPlot |
| mount line, 10,000 | 3.89 / 4.02 | 3.42 / 3.86 | 3.48 / 3.48 | 5.50 / 5.44 | 70.9 | columns 🤝 uPlot in run 1, **uPlot 1.11× in run 2**; rows **1.12–1.16× slower** than uPlot |
| mount line, 100,000 | 6.53 / 6.00 | 5.07 / 5.88 | 5.34 / 5.27 | 6.32 / 6.34 | 645 | columns 🤝 uPlot; rows 1.22× slower in run 1, 🤝 in run 2 |
| mount line, 1,000,000 | 17.17 / 16.96 | 12.65 / 12.14 | 14.03 / 13.92 | 12.94 / 12.83 | 6,740 | columns 🤝 Chart.js = uPlot; **rows 1.32× slower than Chart.js** |
| update line, 10,000 | 1.15 / 1.18 | **1.12 / 1.14** | 1.92 / 2.32 | 3.83 / 2.72 | 24.1 | **Pyreon** (1.7–2.0× vs uPlot) |
| update line, 100,000 | 2.84 / 2.88 | **2.10 / 2.09** | 4.51 / 4.57 | 3.85 / 3.98 | 183 | **Pyreon** (columns 1.8–1.9×, rows 1.36–1.38× vs Chart.js) |
| mount bars, 1,000 | 5.33 / 5.30 | **5.01 / 4.95** | 21.62 / 21.60 | 11.06 / 11.22 | 41.4 | **Pyreon** (2.1–2.3× vs Chart.js) |

(ms; run 1 / run 2.) The unranked `Vanilla canvas` control strokes every point with no axes and does not reduce points, so it is a drift control, not a floor. Pyreon draws an offscreen accessible data table by default; nobody else does.

2026-11-05, row-object input only: the row accessor now writes into a presized array (#3912 described this change, but the code never made it). These figures come from a focused run, not the full set. That run used `--only`, 4 passes, interleaved arms, and a temporary push arm as the in-run control.
- **1M mount:** 16.55 → 15.65 ms. The CIs overlap, and Chart.js at 12.79 ms still leads (1.22×).
- **100k update:** 2.83 → 2.66 ms, a disjoint win.
- **Fresh page:** the 1M mount is 14.06 → 10.39 ms (interleaved, disjoint) and ties the columnar arm. On the board the remaining row cost is the 1M accessor calls themselves.

## 3. Scaling — `bench-crossover` (batch instrument, 100 → 20,000 rows)

`--repeat 3`, one run 02:58–03:03, load 1.9–2.5. Arms: Pyreon, Octane 0.16, Solid (the harness has no Vapor arm). Per-op figure = cycle ÷ 2, median [CI95].

| op | 100 rows | 1,000 | 5,000 | 10,000 | 20,000 |
| --- | --- | --- | --- | --- | --- |
| select — Pyreon / Octane / Solid | 430 ns / 842 ns / 1.8 µs | 441 ns / 903 ns / 7.6 µs | 429 ns / 814 ns / 37.8 µs | 434 ns / 818 ns / 61.0 µs | 435 ns / 832 ns / 112.2 µs |
| partial update — P / O / S | 59.5 / 66.2 / 62.5 µs | 519 / 574 / 551 µs | 3.21 / 3.38 / 3.31 ms | 6.85 / 7.38 / 7.30 ms | 15.97 / 17.31 / 17.01 ms |
| swap — P / O / S | 69.7 / 60.2 / 68.5 µs | 481 / 437 / 495 µs | 2.23 / 2.30 / 2.55 ms | 4.67 / 5.05 / 5.26 ms | 10.72 / 11.84 / 12.29 ms |

- **select:** O(1) for Pyreon and Octane — **Pyreon 1.88–2.04× faster than Octane at every size**; O(n) for Solid (5.5 ns/row; Pyreon 258× faster at 20k).
- **partial update:** **Pyreon 1.05–1.11× faster than Octane and 1.03–1.07× faster than Solid at every size.** OLS slope 800 / 867 / 853 ns per row.
- **swap:** Pyreon wins from 5,000 rows up (1.03–1.10× vs Octane, 1.13–1.15× vs Solid). **At 100 and 1,000 rows there is no verdict.** At the default 40 ms target Octane leads (1.16× and 1.10×, reproduced in a second run: 1.17× / 1.10×). The harness's own soundness check — sweep `--target-ms`, which sweeps K; per-cycle cost must not move — fails for swap:

| `--target-ms` | Pyreon @100 / @1,000 | Octane @100 / @1,000 | verdict @100 / @1,000 |
| ---: | --- | --- | --- |
| 10 | 62.2 / 425.0 µs | 70.2 / 436.9 µs | Pyreon 1.13× / Pyreon 1.03× |
| 20 | 64.5 / 425.1 µs | 61.3 / 435.2 µs | 🤝 / Pyreon 1.02× |
| 40 (default) | 69.0 / 481.0 µs | 58.9 / 436.7 µs | Octane 1.17× / Octane 1.10× |
| 80 | 64.3 / 453.6 µs | 65.3 / 464.5 µs | 🤝 / Pyreon 1.02× |
| 160 | 64.4 / 449.7 µs | 64.3 / 462.3 µs | 🤝 / 🤝 |

  Pyreon's per-cycle swap cost moves 425 → 481 → 450 µs with K; Octane's barely moves. That points at allocation/GC cadence inside the timed region, not at a stable per-swap cost. The direct per-op timer in the same run reads Pyreon 755 vs Octane 810 µs at 1,000 rows, and the row board (§1) has swap as a tie.
- The partial-update and select verdicts are stable across all five targets.

## 4. Hydration — SSR HTML → interactive (real Chromium)

**1,000-row table (`bench:hydration`)** — every framework adopted 1,000/1,000 server rows. Run 1 (`--repeat 3`, 60 samples) and run 2 (`--repeat 5`, 100 samples):

| | total, run 1 | total, run 2 | **walk** (framework work), run 1 / run 2 |
| --- | ---: | ---: | ---: |
| Vue 3 | 5.92 ms | 5.98 ms | 1.16 / 1.18 ms |
| **Pyreon** | 5.97 ms | 6.03 ms (🤝) | **1.16 / 1.17 ms (🤝)** |
| React 19 | 6.46 ms | 6.45 ms | 1.66 / 1.64 ms |
| Preact | 8.45 ms | 8.53 ms | 3.39 / 3.47 ms |

**Total:** Vue has the fastest median in both runs; the CIs are disjoint by 0.01 ms in run 1 and overlap in run 2 → **tie**. **Walk:** tie in both runs. About 100–105 µs of Pyreon's walk constructs per-row signals Vue's arm does not. Layout is ~80% of every total and identical in shape across frameworks.

**App page (`bench:apppage`, 320 statically composed components, 2,206 nodes, one run)** — all four adopt 2,206/2,206: **Pyreon 4.02 ms** · React 4.14 (1.03×) · Preact 4.33 (1.08×) · Vue 4.47 (1.11×). Pyreon outright.

## 5. Server rendering

**Compiled SSR, idiomatic per framework (`bench:ssr`, µs/render, 3 processes pooled):**

| rows | **Pyreon** | Vue 3 | Svelte 5 | React 19 | Pyreon `h()` walk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | **1.80** | 3.03 (1.68×) | 2.18 (1.21×) | 10.30 (5.72×) | 17.48 |
| 100 | **11.64** | 15.66 (1.35×) | 18.08 (1.55×) | 76.52 (6.57×) | 146.69 |
| 1,000 | **109.9** [108.1–120.0] | 124.9 [123.6–127.3] (1.14×) | 160.5 (1.46×) | 714.4 (6.50×) | 1,387.6 |

Pyreon leads at every size; at 1,000 rows the CIs are disjoint (was a tie on 2026-10-15). Vue's `renderToString` is async and awaited; the others are synchronous. One run.

**`renderToString` vs React / Preact / Solid (`bench:ssr-cross`, byte-identical output enforced, one bun child per scenario):**

| scenario | Pyreon compiled | Solid | Pyreon `h()` | Preact | React |
| --- | ---: | ---: | ---: | ---: | ---: |
| card | **8.95M/s** | 1.91M (4.68×) | 1.66M | 1.40M | 784K |
| list-50 | **208K/s** | 127K (1.64×) | 39.5K | 28.3K | 29.8K |
| list-1000 | **11.3K/s** | 6.6K (1.72×) | 1.9K | 1.3K | 1.6K |
| layout (component children) | **194K/s** | 111K (1.74×) | 35.6K | 25.9K | 25.9K |

## 6. Real-app shapes

**`real-bench` — TodoMVC shape vs `react-dom@19`** (4 passes × 20 runs, order rotated):

| scenario | Pyreon | React 19 | verdict |
| --- | ---: | ---: | --- |
| add-100 | 765 µs | 1.53 ms (CV 24%) | Pyreon 1.99× |
| toggle-1000 | 4.60 ms | 11.41 ms | Pyreon 2.48× |
| clear-1000 | 320 µs | 1.00 ms | Pyreon 3.14× |

add-100 has now read 1.14×, 1.38–1.51× and 1.99× on different days with the same harness; React's own add-100 moves (1.0 → 1.53 ms) while Pyreon's does not. Quote add-100 as **1.14–1.99×** until that is explained; toggle (~2.4×) and clear (3–4×) are stable.

**`form-bench` — 12-field form vs six form libraries** (60 samples per scenario):

| scenario | **Pyreon** | Solid modular-forms | React Hook Form | Formik | Vue vee-validate | Svelte Felte | TanStack Form |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mount 12 fields | **210 µs** | 305 | 640 | 340 | 570 | 575 | 680 |
| keystroke (blur mode) | **60 µs** | 100 | 145 | 530 | 235 | 700 | 690 |
| keystroke (change mode, validates) | **460 µs** | 570 | 830 | 1,320 | 2,260 | 1,150 | 2,380 |
| reset dirty form | **20 µs** | 35 | 180 | 85 | 230 | 230 | 185 |

Retained heap: **Solid modular-forms 2.33 MB** · Pyreon 2.42 · Vue 2.99 · Svelte 2.99 · RHF 3.55 · Formik 3.62 · TanStack 4.05. Pyreon leads every timed scenario; it no longer has the lowest heap.

## 7. Bundle size — the same keyed-table app per framework (gzip -9)

Vanilla 3.6 KB · **Solid 7.5 KB 🥇** · Preact 10.1 (1.35×) · Svelte 16.1 (2.14×) · **Pyreon 17.1 (2.28×)** · Vue 27.4 (3.66×) · Octane 43.1 · React 69.6. Every entry includes the same shared runner module.

Pyreon grew 0.5 KB since 2026-10-20 (16.6 KB). The bundle-budget history attributes the runtime growth to #3946 (compact `<For>` SSR keys / hydration, runtime-dom budget +462 B), #4088 (named-accessor fix, +468 B) and #3943 (core +160 B); these are budget bumps, not measured per-commit deltas.

**Charts (`bench:charts-bundle`, gzip, beyond an 11.2 KB Pyreon runtime baseline):** line chart 38.0 KB vs ECharts tree-shaken 155.9 KB (4.10×) / whole package 361.0 KB; bar + line + tooltip + legend 38.0 vs 176.7 KB (4.65×); pie 19.1 vs 117.2 KB (6.12×).

**`@pyreon/code`:** core editor 131.0 KB gz vs `@uiw/react-codemirror` 126.4 KB (4% larger; both wrap CodeMirror 6). The monaco-editor row still fails to bundle.

## 8. Reactivity core — vs Preact Signals and Solid

Median ns/op, one process per cell, 3 rounds × 10 windows, order reshuffled per round, n = 30. `Pyreon-bundled` = `lib/` with `process.env.NODE_ENV` folded, as every bundler does for a browser app.

**V8 (node 26.1):**

| test | Pyreon-bundled | Preact | Solid | Pyreon unbundled |
| --- | ---: | ---: | ---: | ---: |
| signal create+read+write | 62 | **13** | 19 | 721 |
| computed diamond (100 updates) | 6,555 | **5,781** | 37,572 | 69,244 |
| effect propagation (100) | **2,187** | 2,863 | 15,868 | 40,172 |
| batch 50 signals | **584** | 892 | 5,136 | 13,713 |
| deep chain (depth 50, 100) | 143,587 | **76,367** | 719,298 | 776,516 |
| wide fan-out (1→100 effects) | 1,889 | **1,614** | 4,888 | 14,815 |

**JavaScriptCore (bun 1.4):**

| test | Pyreon | Pyreon-bundled | Preact | Solid |
| --- | ---: | ---: | ---: | ---: |
| signal create+read+write | 31 | 30 | **6** | 28 |
| computed diamond | 5,579 | 5,647 | **5,532** | 15,782 |
| effect propagation | **1,637** | 1,708 🤝 | 4,258 | 7,512 |
| batch 50 signals | **522** | 524 🤝 | 1,054 | 1,775 |
| deep chain | 139,461 | 138,434 | **119,216** | 292,144 |
| wide fan-out | 1,800 | **1,786** | 2,194 | 3,009 |

**Honest read.** V8: Pyreon wins effect propagation (1.31× vs Preact) and batching (1.53×); loses create (4.8×), deep chains (1.88×), wide fan-out (1.17×) and the diamond (1.13×). JSC: Pyreon wins effect propagation (2.6×), batching (2.0×) and fan-out (1.23×); loses create (5×), deep chains (1.16×) and now the diamond by 1.01× (CIs disjoint; it was a tie). Against 2026-10-15 on V8: batch −7% (626 → 584 ns) and wide fan-out −13% (2,181 → 1,889 ns, so that loss narrowed from 1.38× to 1.17×); the other four rows are within ±1%. Store read+write: 470 ns bundled on V8, 206 ns on JSC (the JSC bundled/unbundled anomaly is gone). The **unbundled** column is 10–20× slower on V8 because each dev-gate `process.env` read costs ~145 ns there.

## 9. Other core packages

**Router** (8 routers, 3 processes pooled, correctness gate over 1,344 cells; ns/op):

| row | Pyreon | best |
| --- | ---: | --- |
| 10 routes — average | 1.89× of best | Hono (wins 6 of 7 rows; Pyreon wins miss → catch-all) |
| 50 routes — average | **1.00×** (🤝 radix3 1.00×) | radix3 ×4 rows, find-my-way ×2, Pyreon ×1 |
| 200 routes — average | 1.01× | radix3 1.00× |

Per row at 50/200 routes Pyreon wins miss → catch-all (25 vs find-my-way 55 ns) and trails on static (16 vs radix3 12 ns), dynamic 1 param (78 vs find-my-way 62–63 ns), nested dynamic (134–136 vs radix3 100–101 ns) and splat (105–110 vs find-my-way 84–85 ns). Far ahead of Hono (3.3×), Next.js path-to-regexp (2.9–10.7×), Vue Router (8–19×), TanStack (8×) and React Router (885–3,898×).

**Head** vs Unhead: serialize **1.50× / 1.27× / 1.22×** faster (5 / 20 / 50 tags).

**Styler** vs Emotion / goober / styled-components: cold insert 3.38× / 3.59×; warm dedup 6.34× / 3.81×; dynamic resolve 5.26× / 2.17×; SSR collect 3.56× / 3.99× / 2.30× (styled-components includes a React render pass). Pyreon fastest on all four.

**Validate — multi-schema megamorphic workload** vs zod / valibot / arktype: Pyreon fastest on 11 of 12 cells. **zod wins invalid scalar string (1.17×, 43.8 vs 51.2 ns)**; valibot is CI-tied with zod there.

**Validate — 10-library protocol bench** (parse axis): **zod compiled mode (`zod-c`) wins** email valid (23 vs 29 ns), int valid (3 vs 5 ns) and array-of-20 valid (106 vs 116 ns); **arktype wins** object.user valid (35 vs 41 ns; it returns the input aliased, no clone); Pyreon wins or ties every invalid-input parse and the deep-nested / array-of-objects / union cells. Check axis: Pyreon wins or ties everything except email (arktype = typia on valid, arktype outright on invalid, 18 vs 21 ns).

**Compiler** (Vite 8 pipeline): Pyreon's reactive pass on top of OXC costs 2.7× (1-element file) to 5.7× (100-row file) OXC alone. A build-time cost, disclosed.

## 10. Fundamentals — head-to-heads (bun/JavaScriptCore, one process per op × library)

| package | vs | Pyreon wins | Pyreon loses / ties |
| --- | --- | --- | --- |
| store | Zustand, Jotai | dispatch 5.8× / 26.3×, write→subscriber 2.1× / 10.4×, patch (no subscriber) 1.5× / 7.3× | **setup 30.9× slower than Zustand** (566 vs 18 ns; 2 signals + registry); **patch with a subscriber 1.3× slower than Zustand** (90 vs 71 ns); read 1.7× slower than Zustand (5 vs 3 ns, single-digit); setup 🤝 Jotai |
| storage | Jotai atomWithStorage, Zustand persist | writes 10.1–29.7×, create 1.7–1.8× | **read 1.5× slower than Zustand** (4 vs 3 ns) |
| state-tree | MobX-State-Tree 9.0.0 | create (schema) 2.2×, action 9.5×, applySnapshot (schema) 6.8×, applyPatch 7.5×, observer 8.3× | — (ratios fell from 5.4–35.7×; MST moved 8.0.0 → 9.0.0 in between, and the move was not split into Pyreon vs MST) |
| machine | XState | create 11.4×, send 34.7×, can 6.0×, matches 4.7× | — |
| i18n | i18next 26.5.11 | t 12.0×, interpolation 5.1×, plural 3.6×, number 3.1×, date 2.7× | — (t was 18.2× against i18next 26.4.2; not split into Pyreon vs i18next) |
| permissions | CASL | fair resolver race 1.3–1.9× | exact deny 🤝. Memo-hit rows (2.7–13.8×) are a cache read, not a race |
| http | ky, ofetch, redaxios, axios | 4.9–21.5× vs ky; vs ofetch POST 1.21×, query 2.18×, middleware 1.19×; 1.8–1.9× vs redaxios; 8.7–42.7× vs axios | **create client 1.46× slower than redaxios** (108 vs 74 ns); create and 5 s-timeout GET 🤝 ofetch; GET → JSON 🤝 ofetch |
| hotkeys | tinykeys, hotkeys-js, mousetrap | dispatch hit 1.7–7.5×, miss 6.0–118× (12 and 48 bindings); register + teardown 1.17× vs tinykeys (879 vs 1,031 ns), 9–14× vs the others | — |
| url-state | nuqs | boolean 1.8×, array parse 2.1×, array serialize 1.2×, float 1.7× | **integer parse 1.1× slower** (8.1 vs 7.0 ns); string, number serialize and round-trip 🤝 |
| form (headless store) | TanStack form-core | update 62.4×, reset 4.8×, read-all 1.2× | setup 🤝 (was 1.4× slower) |
| form (re-render count) | RHF, Formik | 0 re-renders / 10 keystrokes (RHF 0, Formik 10) | — |
| query ⚠ happy-dom | react-query (same core) | data change → DOM 5.6×; mount 1.2×; 1 vs 8 derivations | — |
| virtual ⚠ happy-dom | react-virtual (same core) | scroll → DOM 1.4× | **mount 10k list 1.1× slower** (real Chromium: Pyreon 1.16× faster, §2) |
| table ⚠ happy-dom | react-table (same core) | single-cell update 1.1–1.6× vs memoized rows, 13–23× vs naive; replace 1.4–1.6× | **mount 1.2–1.5× slower; sort 1.0–1.1× slower than memoized rows** |
| toast | react-hot-toast, sonner | headless 2.5–3.8×; cold create 3.3× / 2.5×; ⚠ happy-dom commit 21–31× | sonner excluded from commit rows |
| charts engine | ECharts 6.1 SSR | spec → SVG 8.0× (bars 1k), 7.2× (bars 10k), 9.6× (line 10k) | — |
| hooks | Solid / Preact counters | counter 1.27× / 1.47× | wrapper overhead vs raw signal 0–6% |
| rx | computed / Solid / RxJS | `pipe` fuses N nodes into 1 (exact count); filter, map, sum level with or ahead of a hand computed | **`pipe` of three stages 1.07× behind a hand computed** (29.6 vs 27.7 µs), `sortBy` 1.05×, `groupBy` 1.01× |
| dnd ⚠ happy-dom | raw pragmatic-drag-and-drop | row-enter fan-out 20× | mount/unmount 🤝; monitor +82 ns; dispatch +5 ns |
| validation (wrapper tax) | raw zod / valibot / arktype | — | tax −24 to +436 ns over raw (largest: arktype invalid) |

⚠ happy-dom rows time a JavaScript DOM implementation, not a browser — counts and relative work are meaningful, absolute times are not.

**Animation — `@pyreon/kinetic` vs Motion (real Chromium, 25 samples) — PROVISIONAL, not a published claim:** enter 500 kinetic 2.42 / Motion 11.40 / CSS baseline 6.51 ms; enter 2,000 7.10 / 40.01 / 21.22; stagger 300 2.62 / 10.19 / 4.93; stagger 1,000 11.72 / 38.70 / 13.57. Still withheld: kinetic measures **below** the hand-written CSS baseline in every cell, which the same work cannot do.

## 11. Pyreon-only throughput (no competitor)

- **cssVariables theming** (300 components, 20 flips, 9 runs, Vite **dev** server): classic 8.46 ms [8.33–9.20] vs cssVariables 9.55 ms [9.31–10.56] — **classic 1.13× faster**, CIs disjoint (earlier runs: "1.16×/1.22× faster", both actually ties). All perf counters read 0, so the counter rows are not evidence.
- **runtime-server** (`bench:ssr`, two runs): empty 504–515K renders/s · simple 124–126K · links-100 7.2–7.7K · layouts-26-params 27.1–27.3K. Not comparable to the 2026-09-24 figures (harness re-added in #3642).
- **server:** `processCompiledTemplate` 20.1M ops/s; handler 196K (1 route) / 175K (10 routes) / 109K (5 nested) req/s.
- **unistyle:** flat `styles()` 1.02M/s · responsive cold 183–576K/s · render-cache hit 17.8M/s (78.7× the cold breakpoint-object resolve).
- **sync (CRDT → signal):** presence publish tax 240 ns (1 peer) → 5.5 µs (200 peers); synced-text keystroke 3.8 µs (1k) → 72.8 µs (10k fragmented); inbound WS frame 59 ns.
- **document** (16 formats): 45.9K–505K docs/s small, 1.7K–36.8K docs/s large.
- **loom** scan of this monorepo: 374 ms warm (98.3% import scanning).

## 12. Per-op verdict summary

"Fastest rival" = the fastest non-Pyreon ranked arm. Win = Pyreon's CI disjoint and ahead in every run measured.

| suite · op | verdict | fastest rival |
| --- | --- | --- |
| row · create 1,000 | 🤝 tie | Vapor RC / Octane / Vue 3 |
| row · replace all | 🤝 tie | Vapor RC / Octane |
| row · partial update | 🤝 tie | Vapor RC / Octane |
| row · select row | no verdict (sub-resolution); batch: **win** | Octane (1.88–2.04× slower) |
| row · swap rows | 🤝 tie | Vapor RC / Octane |
| row · remove row | 🤝 tie | Vapor RC / Octane |
| row · clear rows | **win** 1.15× | Vapor RC |
| row · create 10,000 | 🤝 tie | Vapor RC / Vue 3 / Octane |
| row · append 1k→10k | **win** 1.02× | Octane |
| crossover · select (100–20k) | **win** 1.88–2.04× | Octane |
| crossover · partial update (100–20k) | **win** 1.03–1.11× | Solid / Octane |
| crossover · swap 100 / 1,000 | no verdict (K-dependent) | Octane |
| crossover · swap 5k–20k | **win** 1.03–1.10× | Octane |
| dbmon | 🤝 tie | Octane / Svelte |
| deep-tree mount | **loss** 1.16× (1.20× before #4123) | Solid (React 🤝 Pyreon) |
| context → 1,024 consumers | **win** 1.03–1.05× | Solid |
| effect list: update 500 | **win** 1.07–1.11× | Solid |
| effect list: dispose 500 | 🤝 / **loss** (run 2, 1.3×) | Solid |
| memo wall: blocked / passthrough | **win** 1.4× / 1.06–1.10× | Vue / Svelte |
| flow (6 ops) | **win** all six | React Flow 12 |
| table Chromium: mount | **loss** 1.12–1.13× | react-table (memo rows) |
| table Chromium: update one cell | 🤝 tie | react-table |
| table Chromium: replace / sort / unmount | **win** 1.10–1.40× | react-table |
| virtual Chromium (4 ops) | **win** all four | react-virtual |
| charts vs ECharts (4 ops) | **win** all four | ECharts 6 |
| charts-libs · mount 1k | 🤝 tie | uPlot |
| charts-libs · mount 10k | **loss** / tie (columns); **loss** 1.12–1.16× (rows) | uPlot |
| charts-libs · mount 100k | 🤝 tie (columns); loss/tie (rows) | uPlot |
| charts-libs · mount 1M | 🤝 tie (columns); **loss** 1.32× (rows) | Chart.js (decimation) |
| charts-libs · update 10k / 100k, bars 1k | **win** | uPlot / Chart.js |
| hydration 1,000 rows: total / walk | 🤝 / 🤝 | Vue 3 |
| hydration app page | **win** 1.03× | React 19 |
| compiled SSR 10 / 100 / 1,000 rows | **win** 1.21× / 1.35× / 1.14× | Svelte / Vue / Vue |
| `renderToString` (4 scenarios) | **win** 1.64–4.68× | Solid |
| TodoMVC (3 ops) | **win** 1.99–3.14× | React 19 |
| form-bench (4 ops) | **win** all four | Solid modular-forms |
| form-bench heap | **loss** (2.42 vs 2.33 MB) | Solid modular-forms |
| row-board heap | 🤝 tie (lightest framework) | Preact |
| bundle (same app) | **loss** 2.28× | Solid |
| reactivity V8: effect / batch | **win** | Preact |
| reactivity V8: create / diamond / chain / fan-out | **loss** 4.8× / 1.13× / 1.88× / 1.17× | Preact |
| reactivity JSC: effect / batch / fan-out | **win** | Preact |
| reactivity JSC: create / diamond / chain | **loss** 5× / 1.01× / 1.16× | Preact |
| router 10 routes | **loss** 1.89× (average) | Hono |
| router 50 / 200 routes | 🤝 tie (average) | radix3 |
| head (3 sizes) | **win** 1.22–1.50× | Unhead |
| styler (4 ops) | **win** all four | goober / Emotion |
| validate megamorphic | **win** 11/12; **loss** invalid string 1.17× | zod |
| validate protocol | wins/ties 18 of 24 cells; **loss** on 6: parse — zod-c email/int/array-of-20 valid, arktype object.user valid; check — email valid (arktype = typia), email invalid (arktype) | zod-c / arktype / typia |

## 13. Where Pyreon is not outright fastest (collected)

1. **Deep component-tree mount** — 1.20× behind Solid (3.72 vs 3.09 ms); React ties Pyreon.
2. **Row board ties** — create 1k, replace, partial update, swap, remove and create 10k are statistical ties with Vue 3.6 Vapor (release candidate), Octane 0.16 and (create) Vue 3. Pyreon is not behind on any row-board op, but outright only on clear and append.
3. **Swap at 100 / 1,000 rows (crossover)** — no stable verdict; Octane leads at the default batch target.
4. **Table mount, real Chromium** — 1.12–1.13× behind memoized react-table.
5. **Charts line mounts** — the default row-object input loses 10k (1.12–1.16× vs uPlot) and 1M (1.32× vs Chart.js); the columnar input ties.
6. **Effect list dispose 500** — tie in one run, Solid 1.3× in the other, at the clock's resolution.
7. **Signal creation** (~5× vs Preact, both engines); on V8 deep chains 1.88×, fan-out 1.17×, diamond 1.13×; on JSC deep chains 1.16×, diamond 1.01×.
8. **Hydration** — tied with Vue on total and walk.
9. **Bundle size** — 17.1 KB vs Solid 7.5 KB, Preact 10.1 KB, Svelte 16.1 KB.
10. **Router at 10 routes** (Hono) and per-row static/dynamic/splat matches at every size; **validate** invalid string (zod 1.17×) and six protocol cells (zod-c, arktype, typia).
11. **Store setup** (30.9× vs Zustand) and **patch with a subscriber** (1.3×), **storage read** (1.5×, single-digit ns), **http client creation** (vs redaxios), **url-state integer parse** (1.1×), **rx `pipe`/`sortBy`** (1.05–1.07× vs a hand computed), **form-bench heap** (Solid lighter), **table/virtual mount under happy-dom**.
12. **Unbundled Node** — any process importing `lib/` without a bundler pays ~145 ns per dev-gate read.

## 14. Harness notes and open defects

- **Crossover swap fails the harness's own K-independence check** (§3). Until the cause is fixed, swap at 100/1,000 rows has no verdict.
- **Hard-coded version banners:** `packages/fundamentals/table/bench/table-bench.ts` prints `table-core@9.0.0` (9.3.1 is installed); `packages/fundamentals/validate/bench/validation.ts` prints `typia 14` (15.2.1 is installed). The measured libraries are the installed ones; only the labels are stale.
- **`bench-cssvars`** runs against a Vite dev server and its perf counters read 0 in both modes.
- **form-bench** prints machine RAM as 103 GB (GiB/GB mix); the other harnesses print 96 GB.
- **`compileValidators` makes `.is()` ~2× slower** — still open from 2026-09-24 (not re-measured in this run).
- **`@pyreon/code`**: the monaco-editor bundle row still fails to build.
- **real-bench add-100** day-to-day shift (§6) is unexplained.
- **Kinetic** vs Motion stays provisional (§10).

## 15. Caveats and not measured

- **Layout-bound ops.** The row board times `fn()` plus a forced `getBoundingClientRect()`; on create/replace/remove/append, layout is most of the op and identical across frameworks. Measured split for create 1,000 (production build): Pyreon JS 1.19 ms + layout 7.04 ms vs Vanilla 0.68 + 7.03 ms — the whole gap to Vanilla is JS. At 10,000 rows 55% of the gap is JS and 45% extra layout.
- **Per-row signals.** Pyreon and Solid allocate a per-row signal the plain-object arms do not; it costs Pyreon ~100 µs of the hydration walk.
- **Not measured:** streaming SSR, portals, async waterfalls, startup metrics (script bootup, main-thread work), krausest's per-op memory metrics, Firefox/Safari, and any independent third-party run. Fundamentals run under bun (JavaScriptCore); only the reactivity bench has a V8 pass. Crossover has no Vapor arm.

## Reproduce

```
cd examples/benchmark
bun bench-fair.ts --repeat 5 --wait-quiet 4
bun bench-crossover.ts --repeat 3            # add --target-ms 10|20|80|160 for the K check
bun bench-scenarios.ts --scenario <dbmon|tree|effects|memo|flow|table|virtual|charts|charts-libs> --repeat 3 --wait-quiet 4
bun bench-hydration.ts --repeat 5 --wait-quiet 4 && bun bench-apppage.ts --repeat 3
bun bench-ssr.ts --wait-quiet 4 && bun bench-bundle.ts && bun bench-charts-bundle.ts
cd ../real-bench && bun bench.ts --repeat 4 --wait-quiet 4
cd ../form-bench && bun bench-form.ts --repeat 3 --wait-quiet 4
cd ../.. && bun run bench:reactivity && bun scripts/bench/core/reactivity.ts --runtime node
bun run bench:ssr-cross && bun run bench:router && bun run bench:head && bun scripts/bench/core/styler.ts && bun run bench:validate
```

Every fundamentals package: `cd packages/fundamentals/<pkg> && NODE_ENV=production bun bench/<file>.ts` (the package's `bench*` script).
