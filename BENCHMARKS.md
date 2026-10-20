# Pyreon Benchmark Results — Full Run (2026-09-24)

**Machine:** Apple M3 Max · 14 logical cores · 96 GB · darwin 25.6.0 · bun 1.4.0 (JavaScriptCore) · node v26.1.0 (V8) · Chromium 151.0.7922.34 (Playwright).
**Code:** `main` at `4c6f14698` (includes #3586, #3593, #3594).
**Config:** `NODE_ENV=production` everywhere · production builds for every browser suite · 54 benches run **strictly one at a time**, each gated on a quiet machine (1-min load < 6, sustained) with load stamped before and after · browser suites run cross-origin isolated (5 µs clock, not the 100 µs clamp). No emulator, dev server or other bench was running. Load across the whole run: **2.0–5.8** (yesterday: 4.6–9.9).

**How to read:** every head-to-head passes a correctness gate before timing (all implementations must produce the same observable result). Medians with bootstrap 95% CIs; 🤝 = the CIs overlap, i.e. *could not distinguish*, not *equal*. **Absolute times are machine-dependent and moved ~5–10% for every framework between the two runs because today's machine was quieter — compare ratios, not milliseconds.** "Author-judge" applies to every row: Pyreon's authors wrote and judge these benches. The only fully independent venue is krausest/js-framework-benchmark (a submission is staged at `contrib/krausest/pyreon-keyed/`).

This run **supersedes** the 2026-09-23 run. Where a verdict changed, it is called out in §0.

**Competitor versions (npm latest, verified installed):** react/react-dom 19.3.0 · vue 3.5.43 · svelte 5.57.1 · solid-js 1.9.15 · preact 10.29.8 · octane 0.4.2 · @preact/signals-core 1.14.4 · zod 4.6.5 · valibot 1.5.0 · arktype 2.2.3 · typia 15.0.0 · joi 18.2.9 · yup 1.7.1 · typebox 0.34.52 · jotai 3.0.0 · zustand 5.0.15 · mobx 7.0.4 · mobx-state-tree 8.0.0 · xstate 5.33.2 · i18next 26.4.2 · @casl/ability 7.0.1 · **@tanstack/query-core 5.103.2** · **@tanstack/virtual-core 3.17.11** (was 3.17.4 yesterday — the `@pyreon/virtual` fix #3594 let the override move) · @tanstack/table-core 9.2.4 · @tanstack/form-core 1.33.5 · react-hook-form 7.88.0 · formik 2.4.9 · react-hot-toast 2.6.1 · sonner 2.0.8 · hotkeys-js 4.0.8 · tinykeys 4.0.0 · mousetrap 1.6.5 · nuqs 2.10.1 · ky 2.1.0 · ofetch 1.5.1 · axios 1.20.0 · redaxios 0.5.1 · unhead 3.4.1 · hono 4.13.8 · react-router 8.4.0 · vue-router 5.3.1 · find-my-way 9.9.0 · radix3 1.1.2 · echarts 6.1.0 · motion 13.4.1 · @emotion/css 11.13.5 · goober 2.1.19 · styled-components 6.5.3 · rxjs 7.8.2.

---

## Refresh — 2026-10-15

**Code:** `main` at `3f1009eb6` — after the 2026-10-14/15 performance PRs (#3885 direct-tier binding through literal indexes and casts, #3886 table cell context, #3887 React Flow edges inside the timed window, #3889 release-candidate arms, #3890 SSR conditional-attribute bake, #3891 write-once compiled styles, #3892/#3895/#3896 reactivity notify path, #3893 hotkeys registration, #3894 url-state number parse) and #3884, which moved every rival to its latest release (react 19.3.1 · vue 3.5.44 · svelte 5.57.2 · solid-js 1.9.17 · preact 11.0.1 · octane 0.13.5 · motion 14.2.0 · zod 4.6.7 · @tanstack/table-core 9.3.1 · @tanstack/query-core 5.104.2 · @tanstack/virtual-core 3.19.4).
**New arms:** Vue 3.6 Vapor (`3.6.0-rc.11`) and SolidJS 2.0 (`2.0.0-rc.15`) release candidates on the row board, ranked like any other arm.
**Run:** same machine and protocol, 49 suites one at a time, load 1.6–4.8, Chromium 153.0.8010.12.

Sections §1, §2 (scenarios, flow, charts), §4, §5, §8, §10 (hotkeys, url-state, virtual, table) and §12 below are from this run. Everything else is still the 2026-09-24 run.

| bench | 2026-09-24 | 2026-10-15 |
| --- | --- | --- |
| dbmon | 🤝 tie with Svelte | Pyreon fastest median (1.83 vs Svelte 1.84 ms) |
| effect list: update 500 | Solid 🥇, Pyreon 🤝 | **Pyreon 🥇** (0.97 vs Solid 1.02 ms) |
| flow: mount 500 nodes | React Flow 1.25× faster | **Pyreon** (19.5 vs 21.1 ms) — the React Flow arm drew 0 of 499 edges inside the timed window until #3887 |
| charts vs ECharts: mount 1,000 points | ECharts 2.11× faster | **Pyreon 3.8× faster** (1.12 vs 4.23 ms) |
| SSR 1,000 rows vs Vue | Vue 1.05× faster | 🤝 (CIs overlap) |
| SSR 100 rows vs Vue | 🤝 | **Pyreon 1.13× faster** |
| reactivity, V8: diamond / wide fan-out / batch | 8,853 / 2,859 / 735 ns | 6,542 / 2,181 / 626 ns |
| reactivity, JSC: diamond | Preact 1.20× faster | 🤝 tie with Preact |
| hotkeys register + teardown | 4.3× slower than tinykeys | 1.07–1.32× faster (2.3× slower before the registration-list change) |
| url-state integer parse / round-trip | 1.6× / 1.2× slower than nuqs | 1.14× slower / Pyreon 1.08× faster |
| table mount 1,000 rows (happy-dom) | 2.1× slower than memoized react-table | 2.0× slower; replace and sort 1,000 rows now 1.2× and 2.2× (were 1.9× and 3.3×) |
| table, 1,000 rows, **real Chromium** (new `--scenario table`) | not measured | mount 1.15× slower, replace 1.07×, sort 1.22×, unmount 1.44× slower than memoized react-table; single-cell update **Pyreon 1.07× faster**. happy-dom overstated the mount gap ~2× |

---

## 0. What changed since 2026-09-23

### Harness fixes made during this run (in this PR)

- `query` and `virtual` benches printed hard-coded engine versions (`query-core 5.101.2`, `virtual-core 3.17.4`) while the run used 5.103.2 and 3.17.11. They now print the installed version.
- `real-bench` shuffled its two arms per pass; React landed first in all 3 passes of the queued run. It now rotates (each arm leads equally often). Re-run with `--repeat 4` — no change in the verdict (see §6).
- `bench-cssvars` printed a "speedup" without checking the CIs. Both runs' "speedups" (1.16× yesterday, 1.22× today) had **overlapping** CIs, so both are ties; yesterday's report called it a win. It now prints the tie, flags that all its perf counters read 0, and no longer leaks its Vite dev server (the wrapper was killed, its `vite` grandchild kept `:5210`, and every later run failed on `--strictPort`).

### Verdicts that moved

| bench | 2026-09-23 | 2026-09-24 |
| --- | --- | --- |
| row suite: partial update | 🤝 Pyreon = Octane | **Pyreon outright** (660 vs 710 µs) |
| row suite: swap rows | 🤝, Octane median ahead | 🤝, Pyreon median ahead (785 vs 825 µs) |
| dbmon | Pyreon 1.06× behind Svelte | 🤝 tie with Svelte (1.89 vs 1.84 ms) |
| context → 1,024 consumers | Pyreon 🥇, Solid 🤝 | Solid 🥇, Pyreon 🤝 (same tie, leader swapped) |
| memo wall: passthrough | Pyreon outright | 🤝 Pyreon = Svelte = Solid |
| hydration 1,000 rows (total) | 🤝 Pyreon = Vue | **Vue 1.02× ahead**, CIs just disjoint (6.20 vs 6.32 ms); walk still 🤝 |
| SSR 100 rows vs Vue | Vue 1.06× ahead | 🤝 tie (14.68 vs 14.58 µs) |
| SSR 1,000 rows vs Vue | Vue 1.09× ahead | Vue 1.05× ahead |
| router @ 10 routes | Pyreon 4.66× of best (splat outlier) | Pyreon 1.86× of best (outlier gone; Hono leads) |
| validate: invalid string | 🤝 with zod | **zod 1.19× ahead** |
| form-bench mount | 🤝 Pyreon = Solid | Pyreon outright (210 vs 330 µs) |
| real-bench add-100 | Pyreon 1.14× | Pyreon **1.38–1.51×** (4 runs) — unexplained, see §6 |
| cssVariables theming | "1.16× faster" | 🤝 tie — and yesterday's was a tie too |

**New coverage:** the `charts` scenario (Pyreon PlotChart/OptionChart vs ECharts 6 in Chromium), which landed after yesterday's run.

---

## 1. DOM row-list suite — `bench:fair` (10 frameworks, real Chromium) — 2026-10-15

`--repeat 5` → 100 pooled samples per cell, order rotated per pass, load 1.6–4.8. Bimodality guard: no median captured by an artifact mode.

| op | Vanilla | **Pyreon** | Vue 3.6 Vapor (RC) | Octane | Vue 3 | Solid | Solid 2.0 (RC) | Svelte 5 | React 19 | Preact |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create 1,000 | 7.16 | **7.73** | 7.65 | 7.98 | 7.91 | 8.26 | 8.58 | 8.46 | 9.77 | 10.60 |
| replace all | 7.19 | **7.69** | 7.56 | 7.87 | 7.89 | 8.14 | 8.55 | 8.35 | 9.42 | 10.54 |
| partial update | 700µs | **700µs** | 715µs | 740µs | 1.05 | 1.45 | 1.48 | 810µs | 895µs | 950µs |
| select row | 5µs | **10µs** | 25µs | 25µs | 365µs | 30µs | 60µs | 385µs | 285µs | 280µs |
| swap rows | 755µs | **815µs** | 755µs | 825µs | 1.06 | 950µs | 905µs | 1.51 | 6.06 | 985µs |
| remove row | 6.00 | **6.06** | 6.03 | 6.05 | 6.19 | 6.07 | 6.06 | 6.70 | 6.25 | 6.22 |
| clear rows | 95µs | **135µs** | 150µs | 205µs | 280µs | 515µs | 655µs | 340µs | 730µs | 305µs |
| create 10,000 | 71.14 | **77.35** | 76.98 | 83.12 | 84.26 | 81.85 | 86.10 | 91.34 | 199.51 | 308.57 |
| append 1k→10k | 12.33 | **13.27** | 65.46 | 15.19 | 66.85 | 14.06 | 14.88 | 19.58 | 15.70 | 16.79 |

(ms unless noted.)

**Verdicts (CI95):** **Pyreon outright** on clear rows and append · **tie** Pyreon = Vue 3.6 Vapor (RC) on create 1,000, partial update and create 10,000 · **tie** Pyreon = Vapor = Octane = Solid 2.0 (RC) on remove row · **Vapor (RC) outright** on replace all (7.56 vs 7.69 ms, 1.02×) and swap rows (755 vs 815 µs, 1.08×) · **no verdict** on select row (below 10 clock ticks).

Against the stable releases alone, Pyreon is outright or tied first on every op. The Vapor release candidate is the first arm to take ops from Pyreon on this board; both margins are under 10%.

**Retained heap after the suite (post-GC, MB):** Vanilla 2.96 · **Pyreon 3.09** · Preact 3.10 · Solid 3.17 · Svelte 3.29 · Vue 3.32 · Octane 3.43 · Solid 2.0 (RC) 3.46 · React 3.52 · Vue 3.6 Vapor (RC) 4.10.

Caveats: create/replace/remove/append are dominated by browser layout that every framework pays identically; `create N rows` is a replace for 19 of 20 samples (no reset between runs); Pyreon and Solid allocate a per-row signal inside the timed op that the plain-object frameworks (Vue, Vapor) do not.

## 2. Scenario suite — `bench:scenarios` (real Chromium, 60 samples per cell)

3 passes, order rotated, load 3.3–5.5 (all under the ceiling).

| scenario | fastest | **Pyreon** | others |
| --- | --- | --- | --- |
| dbmon tick (100×6, all change) | **Pyreon 1.83 ms** | — | Svelte 1.84 · Octane 1.88 · React 1.92 · Solid 1.96 · Vue 2.01 · Preact 2.10 |
| mount deep tree (2,047 components) | Solid 3.07 ms 🥇 | **3.78 ms (1.23× slower)** | React 3.73 · Preact 4.66 · Vue 6.34 · Svelte 10.88 |
| context → 1,024 consumers | **Pyreon 1.91 ms** | — | Solid 2.00 · React 2.29 · Svelte 2.34 · Preact 2.58 · Vue 2.63 |
| effect list: update 500 | **Pyreon 0.97 ms 🥇** | — | Solid 1.02 · React 1.25 · Svelte 1.50 · Preact 1.70 · Vue 2.86 |
| effect list: dispose 500 | Solid 45 µs 🥇 | 55 µs | Svelte 95 · Preact 170 · React 192 · Vue 210 |
| memo wall: blocked | **Pyreon 12 µs 🥇** | — | Vue 16 · Preact 17 · React 17 · Solid 20 · Svelte 38 |
| memo wall: passthrough | Pyreon (bare computed) 469 µs 🥇 | 471 µs | Svelte 502 · Solid 503 · React 572 · Preact 768 · Vue 1,900 |

- Scenario rows above are the 2026-10-15 run (60 samples per cell; 🥇 = fastest median — check CIs in the raw output before reading a sub-3% gap as a win).
- Deep-tree mount remains **Pyreon's clearest framework loss** (Vanilla floor 2.53 ms). The template diagnostic arms measure 3.81 ms (`tpl append`) and 4.05 ms (`tpl slot`); `SolidJS (eager props)` 2.66 ms is a diagnostic, unranked. Profiled again on 2026-10-15: GC share is the same as Solid's (19.4% vs 19.1%) and no single lever remains.

**Flow — `@pyreon/flow` vs React Flow 12 (500 nodes / 499 edges):**

| op | Pyreon | React Flow 12 | verdict |
| --- | ---: | ---: | --- |
| mount | **19.51 ms** | 21.05 ms | Pyreon 1.08× |
| drag one node ×60 | **5.01 ms** | 31.41 ms | Pyreon 6.3× |
| select node | **213 µs** | 980 µs | Pyreon 4.6× |
| add 50 nodes + 50 edges | **4.45 ms** | 4.83 ms | Pyreon 1.09× |
| pan + zoom ×60 | **190 µs** | 20.47 ms | Pyreon 108× |
| unmount | **2.68 ms** | 8.42 ms | Pyreon 3.1× |

The React Flow arm now declares node handles (#3887), its documented render-without-measuring path. Before that it drew 0 of 499 edges inside the timed mount window, so the 2026-09-24 "React Flow 1.25× faster" compared a complete graph against nodes only.

**Charts — `@pyreon/charts` vs ECharts 6 (line, 800×400 canvas):**

| op | PlotChart (default) | ECharts 6 | PlotChart, no a11y table (diagnostic) |
| --- | ---: | ---: | ---: |
| mount 1,000 points | **1.12 ms 🥇** | 4.23 ms (3.8× slower) | 1.10 ms |
| mount 100,000 points | **6.94 ms 🥇** | 38.49 ms (5.5× slower) | 6.90 ms |
| update 100k (every value) | **7.33 ms 🥇** | 29.52 ms (4.0× slower) | 5.00 ms |
| update 1k (one value) | **848 µs 🥇** | 1.86 ms (2.2× slower) | 445 µs |

The 2026-09-24 small-chart loss is gone: the accessible data table now fills after the first paint, so it no longer sits in the mount window. (OptionChart was not re-measured in this run.)

**Charts — vs uPlot 1.6, Chart.js 4, Recharts 3 (800×300, first painted frame):**

| op | **Pyreon** | uPlot 1.6 | Chart.js 4 (decimation) | Recharts 3 |
| --- | ---: | ---: | ---: | ---: |
| mount line, 1,000 | 3.16 ms | **2.93 ms 🥇** | 4.60 ms | 13.50 ms |
| mount line, 10,000 | 5.02 ms | **3.39 ms 🥇** | 5.46 ms | 72.48 ms |
| mount line, 100,000 | 8.76 ms | **5.64 ms 🥇** | 6.46 ms | 664 ms |
| mount line, 1,000,000 | 22.0 ms | 15.29 ms | **12.75 ms 🥇** | 6.96 s |
| update line 10,000 | **1.71 ms 🥇** | 2.33 ms | 3.95 ms | 24.34 ms |
| update line 100,000 | 4.40 ms | 5.24 ms | **3.96 ms 🥇** | 184 ms |
| mount bars, 1,000 | **5.74 ms 🥇** | 23.72 ms | 11.43 ms | 42.10 ms |

uPlot leads line mounts; its main-thread time ties Pyreon's (2.73 vs 2.70 ms, measured 2026-10-14), so the remaining wall-clock gap is outside JS (raster/read-back) and is open.

## 3. Scaling — `bench-crossover` (batch instrument, 100 → 20,000 rows)

One pass per cell, load 3.9–5.8, no cell discarded.

| op | 100 rows | 1,000 | 5,000 | 10,000 | 20,000 |
| --- | --- | --- | --- | --- | --- |
| select — Pyreon / Octane / Solid | 450 ns / 884 ns / 1.8 µs | 444 ns / 896 ns / 7.2 µs | 431 ns / 871 ns / 41.4 µs | 463 ns / 835 ns / 59.0 µs | 448 ns / 827 ns / 111.1 µs |
| partial update — P / O / S | 63.9 / 66.5 / 65.0 µs | 542 / 600 / 571 µs | 3.46 / 3.97 / 3.72 ms | 7.79 / 8.61 / 8.41 ms | 18.18 / 19.47 / 20.95 ms |
| swap — P / O / S | 63.7 / 67.3 / 70.0 µs | 486 / **449** / 508 µs | 2.31 / 2.74 / 2.71 ms | 5.12 / 5.57 / 5.60 ms | 12.71 / 14.98 / 14.84 ms |

- **select**: O(1) for Pyreon and Octane — Pyreon **1.80–2.02× faster than Octane at every size**; O(n) for Solid (5.4 ns/row, Pyreon 248× faster at 20k).
- **partial update**: tie with Octane at 100 and 1,000 rows, Pyreon 1.07–1.15× faster from 5,000 up; 1.05–1.15× faster than Solid from 1,000 up.
- **swap**: **Octane wins at 1,000 rows (1.08×)**; Pyreon wins at every other size (1.06–1.19×).
- Per-row slope (OLS): partial update Pyreon 914 / Octane 979 / Solid 1,051 ns per row; swap 633 / 745 / 737.
- Disclosed: for Octane `select` at 20k the per-op timer reads 50 µs against a batch reading of 0.83 µs (60×). The batch figure is used.

## 4. Hydration — SSR HTML → interactive (real Chromium, 60 samples)

**1,000-row table (`bench:hydration`)** — every framework adopted 1,000/1,000 server rows.

| | total | **walk** (framework work) |
| --- | ---: | ---: |
| Vue 3 | **6.00 ms 🥇** | **1.19 ms 🥇** |
| **Pyreon** | 6.12 ms (1.02×) | 1.25 ms (1.05×) |
| React 19 | 6.71 ms (1.12×) | 1.88 ms (1.58×) |
| Preact | 8.63 ms (1.44×) | 3.59 ms (3.02×) |

Vue leads by 2% on the total and 5% on the walk. About 100 µs of Pyreon's walk is constructing the per-row signals Vue's arm does not, which accounts for the walk gap.

**App page (`bench:apppage`, 320 statically composed components, 2,206 nodes)** — all four adopt 2,206/2,206: **Pyreon 4.08 ms 🥇** · React 4.22 (1.03×) · Preact 4.36 (1.07×) · Vue 4.48 (1.10×).

## 5. Server rendering

**Compiled SSR, idiomatic per framework (`bench:ssr`, µs/render, 3 processes pooled):**

| rows | **Pyreon** | Vue 3 | Svelte 5 | React 19 |
| --- | ---: | ---: | ---: | ---: |
| 10 | **1.85 🥇** | 2.83 (1.53×) | 2.36 (1.28×) | 10.44 (5.64×) |
| 100 | **12.35 🥇** | 13.92 (1.13×) | 16.74 (1.36×) | 71.67 (5.80×) |
| 1,000 | 133.6 🤝 | **126.0** | 160.8 (1.28×) | 690.0 (5.48×) |

At 1,000 rows the CIs overlap ([123.8–138.2] vs [124.8–129.4]). #3890 (bake attributes that choose between two string literals) took Pyreon from 1.05× behind to this tie.

Vue's `renderToString` is async and awaited (its real completion); the others are synchronous.

**`renderToString` vs React / Preact / Solid (`bench:ssr-cross`, byte-identical output enforced):**

| scenario | Pyreon compiled | Solid | Pyreon h() | Preact | React |
| --- | ---: | ---: | ---: | ---: | ---: |
| card | **10.8M/s 🥇** | 1.90M (5.7×) | 1.70M | 1.41M | 780K |
| list-50 | **201K/s 🥇** | 127K (1.58×) | 41.6K | 28.0K | 29.6K |
| list-1000 | **11.1K/s 🥇** | 6.5K (1.71×) | 1.9K | 1.3K | 1.6K |
| layout (component children) | **185K/s 🥇** | 113K (1.63×) | 37.5K | 25.6K | 27.3K |

## 6. Real-app shapes

**`real-bench` — TodoMVC shape vs `react-dom@19` (rotated order, 4 passes × 20 runs):**

| scenario | Pyreon | React 19 | verdict |
| --- | ---: | ---: | --- |
| add-100 | 810 µs | 1.22 ms | Pyreon 1.51× |
| toggle-1000 | 5.05 ms | 12.30 ms | Pyreon 2.44× |
| clear-1000 | 265 µs | 1.11 ms | Pyreon 4.21× |

Two more rotated runs: add-100 1.40× and 1.38×, toggle 2.43×/2.50×, clear 4.11×/4.87×. **add-100 moved from 1.14× (two runs yesterday, same code and versions) to 1.38–1.51× (four runs today)** — React's add-100 went from ~1.0 ms to ~1.15–1.22 ms while Pyreon barely moved. Pass order was ruled out (rotation did not change it). Quote add-100 as **1.14–1.51×** until the shift is explained; toggle (~2.4×) and clear (~4×) are stable.

**`form-bench` — 12-field form vs 6 form libraries (real Chromium, 60 samples):**

| scenario | **Pyreon** | Solid modular-forms | React Hook Form | Formik | Vue vee-validate | Svelte Felte | TanStack Form |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mount 12 fields | **210 µs** | 330 | 480 | 320 | 510 | 495 | 690 |
| keystroke (blur mode) | **60 µs** | 110 | 135 | 510 | 235 | 590 | 725 |
| keystroke (change mode, validates) | **425 µs** | 510 | 860 | 1,270 | 3,010 | 1,030 | 2,420 |
| reset dirty form | **20 µs** | 35 | 165 | 65 | 195 | 160 | 150 |

Retained heap: **Pyreon 2.28 MB** · Solid 2.33 · Vue 2.95 · Svelte 2.98 · RHF 3.42 · Formik 3.57 · TanStack 3.96. vee-validate's 5 ms debounce is excluded from its samples.

## 7. Bundle size — the same keyed-table app per framework (gzip -9)

Vanilla 3.6 KB · **Solid 7.5 KB 🥇** · Preact 10.6 · Svelte 16.0 · **Pyreon 16.6 (2.22×)** · Vue 27.0 · Octane 65.8 · React 69.6. Unchanged from yesterday. Pyreon packages alone: reactivity 7.6 KB · core 8.4 · runtime-dom 23.7 · router 15.9 (gzipped main entry).

## 8. Reactivity core — vs Preact Signals and Solid

Median ns/op, one process per cell, 3 rounds × 10 windows, order reshuffled per round. `Pyreon-bundled` = `lib/` with `process.env.NODE_ENV` folded, as every bundler does for a browser app; `Pyreon unbundled` = `lib/` imported directly by Node.

**V8 (node 26.1 — the engine Chrome uses), 2026-10-15:**

| test | Pyreon-bundled | Preact | Solid | Pyreon unbundled |
| --- | ---: | ---: | ---: | ---: |
| signal create+read+write | 63 | **13 🥇** | 19 | 709 |
| computed diamond (100 updates) | 6,542 | **5,795 🥇** | 38,404 | 67,707 |
| effect propagation (100) | **2,196 🥇** | 2,888 | 16,784 | 40,411 |
| batch 50 signals | **626 🥇** | 887 | 4,797 | 13,521 |
| deep chain (depth 50, 100) | 143,663 | **75,867 🥇** | 683,929 | 749,574 |
| wide fan-out (1→100 effects) | 2,181 | **1,586 🥇** | 4,909 | 14,878 |

**JavaScriptCore (bun 1.4), 2026-10-15:**

| test | Pyreon | Pyreon-bundled | Preact | Solid |
| --- | ---: | ---: | ---: | ---: |
| signal create+read+write | 32 | 32 | **6 🥇** | 30 |
| computed diamond | 5,620 | **5,558 🤝** | 5,566 🤝 | 16,034 |
| effect propagation | **1,437 🥇** | 1,607 | 4,332 | 7,375 |
| batch 50 signals | 524 | **522 🥇** | 1,043 | 1,807 |
| deep chain | 142,060 | 137,393 | **120,490 🥇** | 303,014 |
| wide fan-out | 1,813 | **1,793 🥇** | 2,197 | 3,022 |

**Honest read:** since 2026-09-24, #3892 (skip propagation with nothing to reach), #3895 (computed notifies marked with a field) and #3896 (skip empty effect cleanup) moved V8 diamond −26%, wide fan-out −24%, batch −15% and deep chain −17%. On V8 Pyreon wins effect propagation (1.32× vs Preact) and batching (1.42×) and still loses create (~5×), deep chains (1.89×), wide fan-out (1.38×) and diamond (1.13×). On JSC the diamond is now a tie with Preact and Pyreon wins fan-out (1.23×), batching (2.0×) and effect propagation (2.7×); it loses create and deep chains (1.14×). Signal creation stays bound by `Object.setPrototypeOf` (~47 of ~57 ns on V8); per-instance methods (+72 B per signal, ~40% slower `.set()` dispatch) and a bound-function variant (slower reads on JSC) were measured and declined on 2026-10-15. The **unbundled** column is still 10–20× slower on V8 because each dev-gate `process.env` read costs ~145 ns there.

Unexplained, disclosed: under JSC the `Pyreon-bundled` store read+write (209 ns) is slower than unbundled (172 ns); the fold should be neutral there.

## 9. Other core packages

- **Router** (8 routers, 3 processes pooled, correctness gate over 1,344 cells): at 50 and 200 routes Pyreon averages **1.00×** of the fastest (radix3 1.00–1.02×), ahead of find-my-way (1.25–1.27×), Hono (3.2–3.3×), Next.js path-to-regexp (2.9–10.7×), Vue Router (8–19×), TanStack (10–11×), React Router (884–3,909×). Pyreon wins `miss → catch-all` at every size. **At 10 routes Hono leads** (Pyreon 1.86× of best): Hono wins 6 of 7 rows there.
- **Head** vs Unhead: serialize 1.36× / 1.14× / 1.08× faster (5 / 20 / 50 tags).
- **Styler** vs Emotion / goober / styled-components: cold insert 2.94× / 3.84×; warm dedup 7.02× / 4.14×; dynamic resolve 5.09× / 2.19×; SSR collect 3.79× / 4.17× / 2.43× (styled-components includes a React render pass).
- **Validate — multi-schema megamorphic workload** vs zod / valibot / arktype: Pyreon fastest on 11 of 12 cells (valibot CI-tied on valid string, zod CI-tied on invalid discriminated union). **zod wins invalid scalar string (1.19×).**
- **Validate — 10-library protocol bench** (parse axis): **zod compiled mode (`zod-c`) wins** number.int valid (3 vs 5 ns), array-of-20 valid (109 vs 118 ns) and ties email valid (Pyreon 1.2× behind); **arktype wins** object.user valid (35 vs 40 ns, arktype returns the input aliased, no clone). Pyreon wins every invalid-input parse cell and deep-nested valid. Check axis: Pyreon wins or ties everything except invalid-email check (arktype 18 vs 22 ns).
- **Compiler** (Vite 8 pipeline): Pyreon's reactive pass on top of OXC costs 2.5× (1-element file) to 6.5× (100-row file) OXC alone. A build-time cost, disclosed.

## 10. Fundamentals — head-to-heads (bun/JavaScriptCore, one process per op × library)

| package | vs | Pyreon wins | Pyreon loses / ties |
| --- | --- | --- | --- |
| store | Zustand, Jotai | dispatch 5.8× / 26.5×, write→subscriber 2.0× / 9.6×, patch 1.5× / 6.8× | **setup 29.8× slower than Zustand** (2 signals + registry); read 🤝 Zustand |
| storage | Jotai atomWithStorage, Zustand persist | writes 10.7–30.1×, create 1.6–1.7× | **read 1.3× slower than Zustand** |
| state-tree | MobX-State-Tree | every op: schema create 5.4×, action 35.7×, applySnapshot (schema) 17.0×, observer 27.3× | — |
| machine | XState | create 12.2×, send 42.0×, can 11.9×, matches 4.4× | — |
| i18n | i18next | t 18.2×, interpolation 6.3×, plural 4.5×, number 3.3×, date 2.6× | — |
| permissions | CASL | fair resolver race 1.7–2.0× | exact deny: 🤝. Memo-hit rows (3.4–14.1×) are a cache read, not a race |
| http | ky, ofetch, redaxios, axios | 1.4–7.7× vs ky/ofetch/redaxios, 12.8–19.4× vs axios | **creating a client is slower than ofetch (0.84×) and redaxios (0.46×)** |
| hotkeys | tinykeys, hotkeys-js, mousetrap | dispatch hit 1.5–7.8×, miss 6.1–18× vs tinykeys/hotkeys-js; register + teardown 3.2–5.0× vs hotkeys-js/mousetrap | register + teardown 1.07–1.32× faster than tinykeys (≈930 vs 1000–1160 ns, four interleaved rounds; was 4.3× slower before #3893, 2.3× after); dispatch miss 6–7× faster than mousetrap (≈10 vs 58–69 ns; was 1.17× slower, 77 vs 66 ns) |
| url-state | nuqs | boolean 1.8×, array parse 2.1×, array serialize 1.2×, float 1.7×, round-trip 1.08× | **integer parse 1.14× slower** (was 1.6×; #3894) |
| form (headless store) | TanStack form-core | update 62.6×, reset 5.4× | **setup 1.4× slower** |
| form (re-render count) | RHF, Formik | 0 re-renders / 10 keystrokes (RHF 0, Formik 10) | — |
| query ⚠ happy-dom | react-query (same core) | data change → DOM 5.3×; 1 vs 8 derivations | mount 🤝 |
| virtual ⚠ happy-dom | react-virtual (same core) | scroll → DOM 1.2× | **mount 10k list 1.1× slower** (was 1.2×; #3891) |
| virtual, real Chromium (`--scenario virtual`) | react-virtual (same core), memoized rows | **mount 10k list 1.13–1.17× faster**, **jump to row 5,000 1.09–1.15× faster**, **60 small scroll steps 1.11–1.12× faster**, unmount 2.4–2.8× faster (2026-10-20, after #3921's static text fusion — jump had been 1.13–1.41× slower, scroll 1.03–1.08× slower) | — happy-dom had the mount backwards |
| table ⚠ happy-dom | react-table (same core) | single-cell update 1.6× vs memoized rows at 100 (🤝 at 1,000), 12.2–22.3× vs naive | **mount 1.5–2.0× slower, replace 1.2×, sort 2.2× slower than memoized rows** |
| table, real Chromium | react-table (same core), memoized rows | replace 1.14×, sort 1.08×, unmount 1.52× faster; single-cell update 🤝 (2026-10-20 full run, after #3913–#3917) | **mount 1.03× slower** |
| toast | react-hot-toast, sonner | headless 2.1–3.1×; ⚠ happy-dom commit create/update/dismiss 18.6–27×; cold create 2.3× vs sonner | sonner excluded from commit rows (no render under happy-dom) |
| charts engine | ECharts 6.1 SSR | spec → SVG 7.5× (bars 1k), 7.6× (bars 10k), 8.0× (line 10k) | — |
| charts wrapper ⚠ happy-dom | echarts-for-react | update 10.0×, dispose 1.9× | mount 🤝 |
| hooks | Solid / Preact counters | counter 1.20× / 1.23× | wrapper overhead vs raw signal: 0–6% |
| rx | computed / Solid / RxJS | `pipe` fuses N nodes into 1 (exact count); per-op `filter` 2.1–2.2 µs, `map` 1.4–1.5 µs and `sum` 0.86 µs, level with or ahead of a hand computed (2.3–2.4 / 1.5 / 2.2) and Solid memo (2.5 / 1.6–1.7 / 0.98) — were 3.6 / 2.7 / 2.2 µs before the Array builtins became plain loops | **`pipe` of three stages 1.06× behind a hand computed** (29.5 vs 27.8 µs), `sortBy` 1.03× |
| dnd ⚠ happy-dom | raw pragmatic-drag-and-drop | row-enter fan-out 24× | mount/unmount 🤝; dispatch +6 ns |
| validation (wrapper tax) | raw zod / valibot / arktype | — | tax −20 to +278 ns over raw (largest: arktype invalid, zod invalid 173 ns) |

⚠ happy-dom rows time a JavaScript DOM implementation, not a browser — counts and relative work are meaningful, absolute times are not browser-representative.

**Animation — `@pyreon/kinetic` vs Motion (real Chromium, 25 samples) — PROVISIONAL, not a published claim:** enter 500 — kinetic 1.98 ms, Motion 4.97, CSS baseline 5.30; enter 2,000 — 7.50 / 18.05 / 21.65; stagger 300 — 2.16 / 8.70 / 7.13; stagger 1,000 — 12.52 / 43.23 / 13.96 (kinetic 2.4–4.0× faster than Motion). Still withheld: kinetic again measures **below** the hand-written CSS baseline in every cell, which the same work cannot do, so the window likely does not capture CSS-transition work equally across arms.

## 11. Pyreon-only throughput (no competitor)

- **cssVariables theming** (40 components, 4 flips, 3 runs): 0.59 vs 0.67 ms — **🤝 not distinguishable** (CIs overlap). All perf counters read 0, so the counter rows are not evidence of anything.
- **runtime-server**: empty 629K renders/s · simple 177K · links-100 10.8K · layouts-26-params 29.4K.
- **server**: compiled template 20.1M ops/s · handler 105–234K req/s.
- **unistyle**: flat `styles()` 1.01M/s · responsive cold 175–498K/s · render-cache hit 21.6M/s (98.9× cold).
- **sync (CRDT → signal)**: presence publish tax 207 ns (1 peer) → 4.0 µs (200 peers); synced-text keystroke 3.5 µs (1k) → 74 µs (10k fragmented); inbound WS frame 63 ns.
- **document** (16 formats): 47K–504K docs/s small, 1.8K–36K docs/s large.
- **loom** scan of this monorepo: 281 ms warm (97.8% import scanning). **lathe**: parse and generate scale linearly (exponent 0.88–1.12).

## 12. Where Pyreon loses (collected)

1. **Deep component-tree mount** — 1.23× behind Solid (3.78 vs 3.07 ms).
2. **Vue 3.6 Vapor (release candidate)** — replace all 1.02× and swap rows 1.08× faster than Pyreon; create and partial update are ties.
3. **Signal creation** — ~5× slower than Preact on both engines; on V8 also deep chains 1.89×, fan-out 1.38×, diamond 1.13×; on JSC deep chains 1.14×.
4. **Charts line mounts vs uPlot** — 1.08–1.55× slower for 1k–100k points (main-thread time ties; the gap is outside JS); Chart.js with decimation leads at 1M points and 100k updates.
5. **Hydration** — Vue 1.02× ahead on the total, 1.05× on the walk.
6. **Bundle size** — 16.6 KB vs Solid 7.5 KB and Preact 10.6 KB for the same app (2026-09-24).
7. **Router at 10 routes** (Hono), **validate** invalid-string (zod 1.19×) and several zod-c/arktype protocol cells (2026-09-24).
8. **Store setup** (29.8× vs Zustand), **storage read** (1.3×), **http client creation**, **url-state integer parse** (1.14×), **form store setup** (1.4×), **table/virtual mount under happy-dom**.
9. **Unbundled Node** — any process importing `lib/` without a bundler pays ~145 ns per dev-gate read.

## 13. Defects (open)

- **`compileValidators` makes `.is()` ~2× slower** — reproduced a third time: 0.53–0.68× of the runtime `.is()`. The documented claim is already withdrawn; fix (rebuild on the verdict-only JIT, or retire) is pending a decision.
- **Unbundled Node `NODE_ENV` cost** — see §8.
- **`@pyreon/code` bundle bench**: monaco-editor still fails to bundle, so the Monaco row is missing; `@pyreon/code` core is 3% larger gzipped than `@uiw/react-codemirror` (same CodeMirror 6 core).
- **real-bench add-100 day-to-day shift** (§6) and the **JSC bundled-store anomaly** (§8) are unexplained.
- **Kinetic** vs Motion stays provisional (§10).

## 14. Not measured

Streaming SSR, portals, async waterfalls, startup metrics (script bootup, main-thread work), krausest's per-op memory metrics, Firefox/Safari, and any independent third-party run. The fundamentals benches run under bun (JavaScriptCore); only the reactivity bench has a V8 pass. The Atlas pipeline bench is a profiling tool, not a comparison, and was not run. Reproduce the cross-framework suites with `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 6` (and `bench-scenarios.ts --repeat 3 --wait-quiet 6`, `bench-hydration.ts`, `bench-apppage.ts`, `bench-ssr.ts`, `bench-crossover.ts`); every package bench via its `bench` script.
