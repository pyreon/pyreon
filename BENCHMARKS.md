# Pyreon Benchmark Results — Full Run (2026-09-24)

**Machine:** Apple M3 Max · 14 logical cores · 96 GB · darwin 25.6.0 · bun 1.4.0 (JavaScriptCore) · node v26.1.0 (V8) · Chromium 151.0.7922.34 (Playwright).
**Code:** `main` at `4c6f14698` (includes #3586, #3593, #3594).
**Config:** `NODE_ENV=production` everywhere · production builds for every browser suite · 54 benches run **strictly one at a time**, each gated on a quiet machine (1-min load < 6, sustained) with load stamped before and after · browser suites run cross-origin isolated (5 µs clock, not the 100 µs clamp). No emulator, dev server or other bench was running. Load across the whole run: **2.0–5.8** (yesterday: 4.6–9.9).

**How to read:** every head-to-head passes a correctness gate before timing (all implementations must produce the same observable result). Medians with bootstrap 95% CIs; 🤝 = the CIs overlap, i.e. *could not distinguish*, not *equal*. **Absolute times are machine-dependent and moved ~5–10% for every framework between the two runs because today's machine was quieter — compare ratios, not milliseconds.** "Author-judge" applies to every row: Pyreon's authors wrote and judge these benches. The only fully independent venue is krausest/js-framework-benchmark (a submission is staged at `contrib/krausest/pyreon-keyed/`).

This run **supersedes** the 2026-09-23 run. Where a verdict changed, it is called out in §0.

**Competitor versions (npm latest, verified installed):** react/react-dom 19.3.0 · vue 3.5.43 · svelte 5.57.1 · solid-js 1.9.15 · preact 10.29.8 · octane 0.4.2 · @preact/signals-core 1.14.4 · zod 4.6.5 · valibot 1.5.0 · arktype 2.2.3 · typia 15.0.0 · joi 18.2.9 · yup 1.7.1 · typebox 0.34.52 · jotai 3.0.0 · zustand 5.0.15 · mobx 7.0.4 · mobx-state-tree 8.0.0 · xstate 5.33.2 · i18next 26.4.2 · @casl/ability 7.0.1 · **@tanstack/query-core 5.103.2** · **@tanstack/virtual-core 3.17.11** (was 3.17.4 yesterday — the `@pyreon/virtual` fix #3594 let the override move) · @tanstack/table-core 9.2.4 · @tanstack/form-core 1.33.5 · react-hook-form 7.88.0 · formik 2.4.9 · react-hot-toast 2.6.1 · sonner 2.0.8 · hotkeys-js 4.0.8 · tinykeys 4.0.0 · mousetrap 1.6.5 · nuqs 2.10.1 · ky 2.1.0 · ofetch 1.5.1 · axios 1.20.0 · redaxios 0.5.1 · unhead 3.4.1 · hono 4.13.8 · react-router 8.4.0 · vue-router 5.3.1 · find-my-way 9.9.0 · radix3 1.1.2 · echarts 6.1.0 · motion 13.4.1 · @emotion/css 11.13.5 · goober 2.1.19 · styled-components 6.5.3 · rxjs 7.8.2.

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

## 1. DOM row-list suite — `bench:fair` (8 frameworks, real Chromium)

`--repeat 5 --wait-quiet 6` → 100 pooled samples per cell, order rotated per pass, load re-checked before every framework (2.1–3.9 throughout). Bimodality guard: one cell flagged (Solid `clear rows`, fast mode holds 5% of samples — median stands).

| op | Vanilla | **Pyreon** | Octane | Vue 3 | Solid | Svelte 5 | React 19 | Preact |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create 1,000 | 7.34 | **7.93** | 8.38 | 8.13 | 8.51 | 8.90 | 9.81 | 11.53 |
| replace all | 7.32 | **7.86** | 8.12 | 8.08 | 8.37 | 8.79 | 9.69 | 11.55 |
| partial update | 745µs | **660µs** | 710µs | 1.03 | 1.45 | 765µs | 830µs | 930µs |
| select row | 5µs | 10µs | 25µs | 365µs | 25µs | 445µs | 230µs | 275µs |
| swap rows | 755µs | **785µs** | 825µs | 1.02 | 905µs | 1.53 | 6.05 | 955µs |
| remove row | 6.15 | **6.23** | 6.24 | 6.38 | 6.27 | 6.90 | 6.46 | 6.69 |
| clear rows | 85µs | **130µs** | 180µs | 260µs | 475µs | 305µs | 595µs | 825µs |
| create 10,000 | 74.63 | **80.01** | 85.92 | 86.54 | 85.42 | 95.83 | 201.24 | 276.14 |
| append 1k→10k | 12.87 | **13.93** | 16.59 | 69.27 | 14.41 | 21.91 | 16.19 | 17.97 |

(ms unless noted.)

**Verdicts (CI95):** **Pyreon outright** on create 1,000, replace all, partial update, clear rows, create 10,000, append · **tie** Pyreon = Octane on swap rows · **tie** Pyreon = Octane = Solid on remove row · **no verdict** on select row (below 10 clock ticks — §3 resolves it) · `batch cycle` rows are implemented by only 4 of 8 arms, so no verdict.

**Pyreon vs hand-written Vanilla:** create 1.08×, replace 1.07×, swap 1.04×, remove 1.01×, create-10k 1.07×, append 1.08×, clear 1.53×. `partial update` reads **0.89×** (Pyreon faster than Vanilla) — Vanilla's arm sets `textContent` on the cell, which replaces the text node, while Pyreon writes the existing text node's `.data` — so that cell compares against an untuned floor. Read it as "Pyreon at the floor", not "faster than hand-written DOM".

**Retained heap after the suite (post-GC, MB):** Vanilla 2.65 · **Pyreon 2.78** · Preact 2.78 · Solid 2.87 · Svelte 2.99 · Octane 3.15 · React 3.21 · Vue 3.51.

Caveats: create/replace/remove/append are dominated by browser layout that every framework pays identically; `create N rows` is a replace for 19 of 20 samples (no reset between runs); Pyreon and Solid allocate a per-row signal the plain-object frameworks do not.

## 2. Scenario suite — `bench:scenarios` (real Chromium, 60 samples per cell)

3 passes, order rotated, load 3.3–5.5 (all under the ceiling).

| scenario | fastest | **Pyreon** | others |
| --- | --- | --- | --- |
| dbmon tick (100×6, all change) | Svelte 1.84 ms 🥇 | 1.89 ms 🤝 | Solid 1.87 🤝 · React 1.95 · Vue 2.04 · Octane 2.10 · Preact 2.11 |
| mount deep tree (2,047 components) | Solid 3.17 ms 🥇 | **4.09 ms (1.29× slower)** | React 4.31 · Preact 7.49 · Vue 8.18 · Svelte 12.34 |
| context → 1,024 consumers | Solid 1.77 ms 🥇 | 1.81 ms 🤝 | React 2.19 · Svelte 2.45 · Vue 2.52 · Preact 2.65 |
| effect list: update 500 | Solid 1.03 ms 🥇 | 1.04 ms 🤝 | React 1.31 · Svelte 1.63 · Preact 1.81 · Vue 2.89 |
| effect list: dispose 500 | **Pyreon 40 µs 🥇** | — | Solid 40 🤝 · Svelte 100 · React 225 · Vue 235 · Preact 295 |
| memo wall: blocked | **Pyreon 12 µs 🥇** | — | Vue 16 · Preact 17 · React 17 · Solid 20 · Svelte 46 |
| memo wall: passthrough | Pyreon (bare computed) 508 µs 🥇 | 528 µs 🤝 | Svelte 529 🤝 · Solid 535 🤝 · React 572 · Preact 877 · Vue 2,000 |

- Deep-tree mount remains **Pyreon's clearest framework loss** (Vanilla floor 2.40 ms). The template diagnostic arms measure 4.09 ms (`tpl append`) and 4.27 ms (`tpl slot`); `SolidJS (eager props)` 2.70 ms is a diagnostic, unranked.

**Flow — `@pyreon/flow` vs React Flow 12 (500 nodes / 499 edges):**

| op | Pyreon | React Flow 12 | verdict |
| --- | ---: | ---: | --- |
| mount | 19.97 ms | **16.01 ms** | React Flow 1.25× faster |
| drag one node ×60 | **4.72 ms** | 33.82 ms | Pyreon 7.2× |
| select node | **273 µs** | 1.11 ms | Pyreon 4.1× |
| add 50 nodes + 50 edges | 4.42 ms | 4.48 ms | 🤝 |
| pan + zoom ×60 | **210 µs** | 22.27 ms | Pyreon 106× |
| unmount | **2.92 ms** | 9.14 ms | Pyreon 3.1× |

**Charts — `@pyreon/charts` vs ECharts 6 (line, 800×400 canvas) — NEW:**

| op | PlotChart (default) | OptionChart | ECharts 6 | PlotChart, no a11y table (diagnostic) |
| --- | ---: | ---: | ---: | ---: |
| mount 1,000 points | 8.74 ms (**2.11× slower**) | 8.42 ms (**2.04× slower**) | **4.14 ms 🥇** | 1.13 ms |
| mount 100,000 points | **25.25 ms 🥇** | 30.04 ms | 41.52 ms (1.64× slower) | 17.39 ms |
| update 100k (every value) | 18.69 ms | **12.98 ms 🥇** | 30.06 ms (2.32× slower) | 14.39 ms |
| update 1k (one value) | 1.27 ms | **1.02 ms 🥇** | 1.93 ms (1.89× slower) | 550 µs |

The small-chart mount loss is the accessible data table PlotChart renders by default (the diagnostic arm without it mounts 3.7× faster than ECharts). ECharts has no equivalent table, so the default arms do more work — but the default is what users get, so it is ranked as a loss.

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

| | total | **walk** (framework work) | layout |
| --- | ---: | ---: | ---: |
| Vue 3 | **6.20 ms 🥇** | **1.20 ms 🥇** | 5.00 ms |
| **Pyreon** | 6.32 ms (1.02×) | 1.27 ms 🤝 | 5.06 ms |
| React 19 | 6.98 ms (1.13×) | 2.00 ms (1.66×) | 4.99 ms |
| Preact | 11.67 ms (1.88×) | 6.38 ms (5.32×) | 5.29 ms |

Vue now leads the total by 2% with CIs just disjoint ([6.17–6.24] vs [6.25–6.39]); the framework-attributable walk remains a tie. 85 µs of Pyreon's walk is constructing per-row signals Vue's arm does not.

**App page (`bench:apppage`, 320 statically composed components, 2,206 nodes)** — all four adopt 2,206/2,206: **Pyreon 3.67 ms 🥇** · React 4.07 (1.11×) · Vue 4.45 (1.21×) · Preact 5.16 (1.40×).

## 5. Server rendering

**Compiled SSR, idiomatic per framework (`bench:ssr`, µs/render, 3 processes pooled):**

| rows | **Pyreon** | Vue 3 | Svelte 5 | React 19 | Pyreon h() walk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | **2.06 🥇** | 3.14 (1.52×) | 2.47 (1.20×) | 10.63 (5.16×) | 15.26 |
| 100 | 14.68 🤝 | **14.58 🥇** | 17.79 (1.22×) | 70.17 (4.81×) | 121.63 |
| 1,000 | 135.9 (1.05×) | **128.8 🥇** | 169.4 (1.32×) | 717.4 (5.57×) | 1,208.1 |

Vue's `renderToString` is async and awaited (its real completion); the others are synchronous.

**`renderToString` vs React / Preact / Solid (`bench:ssr-cross`, byte-identical output enforced):**

| scenario | Pyreon compiled | Solid | Pyreon h() | Preact | React |
| --- | ---: | ---: | ---: | ---: | ---: |
| card | **8.60M/s 🥇** | 1.86M (4.63×) | 1.65M | 1.43M | 733K |
| list-50 | **185.7K/s 🥇** | 121.0K (1.53×) | 38.8K | 27.0K | 27.7K |
| list-1000 | **11.0K/s 🥇** | 6.4K (1.72×) | 1.9K | 1.4K | 1.5K |
| layout (component children) | **197.2K/s 🥇** | 110.1K (1.79×) | 36.8K | 25.3K | 26.1K |

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

**V8 (node 26.1 — the engine Chrome uses):**

| test | Pyreon-bundled | Preact | Solid | Pyreon unbundled |
| --- | ---: | ---: | ---: | ---: |
| signal create+read+write | 64 | **13 🥇** | 20 | 610 |
| computed diamond (100 updates) | 8,853 | **5,823 🥇** | 37,903 | 73,468 |
| effect propagation (100) | **2,274 🥇** | 2,929 | 16,531 | 37,405 |
| batch 50 signals | **735 🥇** | 891 | 4,840 | 13,723 |
| deep chain (depth 50, 100) | 173,568 | **76,294 🥇** | 694,622 | 601,122 |
| wide fan-out (1→100 effects) | 2,859 | **1,606 🥇** | 4,908 | 20,125 |

**JavaScriptCore (bun 1.4):**

| test | Pyreon | Pyreon-bundled | Preact | Solid |
| --- | ---: | ---: | ---: | ---: |
| signal create+read+write | 31 | 32 | **6 🥇** | 28 |
| computed diamond | 6,618 | 6,949 | **5,525 🥇** | 16,112 |
| effect propagation | 1,639 🤝 | **1,560 🥇** | 4,290 | 7,386 |
| batch 50 signals | **538 🥇** | 539 🤝 | 1,024 | 1,787 |
| deep chain | 163,322 | 163,486 | **118,577 🥇** | 295,327 |
| wide fan-out | **2,039 🥇** | 2,045 🤝 | 2,636 | 2,972 |

**Honest read:** on V8 Pyreon wins effect propagation (1.29× vs Preact) and batching (1.21×) and loses create (~5×), diamond (1.52×), deep chains (2.27×) and wide fan-out (1.78×) to Preact. On JSC Pyreon also wins fan-out (1.29×). Solid is behind Pyreon everywhere except create. The **unbundled** column — a Node process importing `lib/` without a bundler — is 10–20× slower on V8 because each dev-gate `process.env` read costs ~145 ns there (#3586 fixed Vite production SSR builds; unbundled Node remains open).

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
| hotkeys | tinykeys, hotkeys-js, mousetrap | dispatch hit 2.2–10×, miss 1.4–29× | **register + teardown 4.3× slower than tinykeys** |
| url-state | nuqs | boolean 2.2×, array parse 7.9×, array serialize 2.7×, float 1.3× | **integer parse 1.6× slower, round-trip 1.2× slower** |
| form (headless store) | TanStack form-core | update 62.6×, reset 5.4× | **setup 1.4× slower** |
| form (re-render count) | RHF, Formik | 0 re-renders / 10 keystrokes (RHF 0, Formik 10) | — |
| query ⚠ happy-dom | react-query (same core) | data change → DOM 5.3×; 1 vs 8 derivations | mount 🤝 |
| virtual ⚠ happy-dom | react-virtual (same core, 3.17.11) | scroll → DOM 1.2× | **mount 10k list 1.2× slower** |
| table ⚠ happy-dom | react-table (same core) | single-cell update 1.1–1.5× vs memoized rows, 11.7–22.3× vs naive | **mount 1.5–1.9× slower, replace 1.2–1.4×, sort 2.2–2.7× slower than memoized rows** |
| toast | react-hot-toast, sonner | headless 2.1–3.1×; ⚠ happy-dom commit create/update/dismiss 18.6–27×; cold create 2.3× vs sonner | sonner excluded from commit rows (no render under happy-dom) |
| charts engine | ECharts 6.1 SSR | spec → SVG 7.5× (bars 1k), 7.6× (bars 10k), 8.0× (line 10k) | — |
| charts wrapper ⚠ happy-dom | echarts-for-react | update 10.0×, dispose 1.9× | mount 🤝 |
| hooks | Solid / Preact counters | counter 1.20× / 1.23× | wrapper overhead vs raw signal: 0–6% |
| rx | computed / Solid / RxJS | `pipe` fuses N nodes into 1 (exact count) | **per-op, `@pyreon/rx` is slower than a plain computed** (filter 3.6 vs 2.3 µs, map 2.9 vs 1.5 µs) |
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

1. **Deep component-tree mount** — 1.29× behind Solid (4.09 vs 3.17 ms).
2. **Signal creation** — ~5× slower than Preact on both engines; on V8 also deep chains 2.27×, fan-out 1.78×, diamond 1.52×; on JSC deep chains 1.38×, diamond 1.20×.
3. **Charts mount at 1,000 points** — 2.0–2.1× slower than ECharts (the default accessible table).
4. **Flow mount** — React Flow 1.25× faster to mount 500 nodes.
5. **SSR of large pages** — Vue 1.05× faster at 1,000 rows (tie at 100).
6. **Hydration total** — Vue 1.02× ahead (walk tied).
7. **Bundle size** — 16.6 KB vs Solid 7.5 KB and Preact 10.6 KB for the same app.
8. **Swap at 1,000 rows** — Octane 1.08× faster (batch instrument).
9. **Router at 10 routes** (Hono), **validate** invalid-string (zod 1.19×) and several zod-c/arktype protocol cells.
10. **Store setup** (29.8× vs Zustand), **storage read** (1.3×), **hotkeys register/teardown** (4.3×), **http client creation**, **url-state integer parse** (1.6×), **form store setup** (1.4×), **rx per-op**, **table/virtual mount under happy-dom**.
11. **Unbundled Node** — any process importing `lib/` without a bundler pays ~145 ns per dev-gate read.

## 13. Defects (open)

- **`compileValidators` makes `.is()` ~2× slower** — reproduced a third time: 0.53–0.68× of the runtime `.is()`. The documented claim is already withdrawn; fix (rebuild on the verdict-only JIT, or retire) is pending a decision.
- **Unbundled Node `NODE_ENV` cost** — see §8.
- **`@pyreon/code` bundle bench**: monaco-editor still fails to bundle, so the Monaco row is missing; `@pyreon/code` core is 3% larger gzipped than `@uiw/react-codemirror` (same CodeMirror 6 core).
- **real-bench add-100 day-to-day shift** (§6) and the **JSC bundled-store anomaly** (§8) are unexplained.
- **Kinetic** vs Motion stays provisional (§10).

## 14. Not measured

Streaming SSR, portals, async waterfalls, startup metrics (script bootup, main-thread work), krausest's per-op memory metrics, Firefox/Safari, and any independent third-party run. The fundamentals benches run under bun (JavaScriptCore); only the reactivity bench has a V8 pass. The Atlas pipeline bench is a profiling tool, not a comparison, and was not run. Reproduce the cross-framework suites with `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 6` (and `bench-scenarios.ts --repeat 3 --wait-quiet 6`, `bench-hydration.ts`, `bench-apppage.ts`, `bench-ssr.ts`, `bench-crossover.ts`); every package bench via its `bench` script.
