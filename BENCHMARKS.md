# Pyreon Benchmark Results — Full Run (2026-09-23)

**Machine:** Apple M3 Max · 14 logical cores · 96 GB · darwin 25.6.0 · bun 1.4.0 (JavaScriptCore) · node v26.1.0 (V8) · Chromium 151.0.7922.34 (Playwright).
**Config:** `NODE_ENV=production` everywhere · production builds for every browser suite · benches run **strictly one at a time**, each gated on a quiet machine (1-min load < 6, sustained) with load stamped before and after · browser suites run cross-origin isolated (5 µs clock, not the 100 µs clamp).

**How to read:** every head-to-head passes a correctness gate before timing (all implementations must produce the same observable result). Medians with bootstrap 95% CIs; 🤝 = the CIs overlap, i.e. *could not distinguish*, not *equal*. **Absolute times are machine-dependent; the ratios are the portable signal.** "Author-judge" applies to every row: Pyreon's authors wrote and judge these benches. The only fully independent venue is krausest/js-framework-benchmark (a submission is staged at `contrib/krausest/pyreon-keyed/`).

This run **supersedes** the 2026-07-01 snapshot and every per-op figure in older notes. Where a verdict flipped, it is called out.

---

## 0. What was fixed before measuring

The run was preceded by an objectivity audit of every harness. Most defects favoured Pyreon; a few favoured competitors. All were fixed first:

**Cross-framework row suite (`examples/benchmark`)**
- Six arms (Vanilla, React, Preact, Vue, Svelte, Octane) built their row data with a slower helper *inside the timed window*; Pyreon and Solid used a preallocated loop. Now one helper for all.
- Vue arms were hand-written `h()` render functions, which disables Vue's compiled patch flags and forces a full diff. Now real compiled templates (row suite, scenarios, hydration, app-page).
- Solid arms skipped the per-cell `insert()` computation babel-preset-solid emits. Now byte-for-byte the compiler's output.
- Vanilla used three `createElement` calls per row; the standard krausest Vanilla clones a `<template>` row. Now it clones.
- React/Preact passed rows as spread varargs; now the automatic `jsx()` runtime shape a compiled app ships.
- Svelte 5 `partial update` replaced the whole array; now a per-row `$state` label (the same per-row reactive cost Pyreon and Solid pay).
- Correctness gates only counted rows, so a no-op swap/update would pass; they now read the table back.
- An op some frameworks don't implement (`batch cycle` rows) no longer gets a winner; ops below 10 clock ticks get no verdict.
- `--wait-quiet` now re-checks load before **every framework / pass**, not once at start (a mid-run spike to load 19.7 was observed).

**Micro benches**
- `reactivity`: all three libraries ran in one process with Pyreon always first; Solid's arm wrapped every iteration in `createRoot`+`dispose` (work the others never did); reads were not sunk. Now one process per cell, rotated order, CIs, result sinks, correctness gates, and a Node (V8) pass.
- `machine`, `i18n`, `permissions`, `state-tree`, `form`: Pyreon measured first in a shared process → now one process per op × library, rotated.
- `kinetic` vs Motion: the timing window closed before kinetic's enter state was applied, "enter" revealed one element instead of N, the CSS baseline never animated, and the page ran on the 100 µs clamped clock. **The Kinetic-vs-Motion claim is withdrawn** (see §12).
- `real-bench`: React's timed window included a `requestAnimationFrame → setTimeout` idle wait. **The published "~16× on add-100" was that wait** — it measures 1.14×.
- `form-bench`: keystroke gates could not fail; making them real exposed arms doing no work (Pyreon remounting every field via `.map()`, Formik/Felte rendering no errors), Vue/Svelte merging 12 keystrokes into one render, and validation running outside the window.
- `compare.ts` judged ops/s rows backwards; `run-all` now records engine/CPU/load; `server`/`compiler` benches force production; `toast` runs its TSX with Pyreon's JSX runtime (bun fell back to React's); `table`/`virtual` no longer crash in esbuild under happy-dom; `ssr` injects every compiler helper (it had stopped running Pyreon at all); `sync` exits.

**Competitor versions** — bumped to npm latest before the run: react/react-dom 19.3.0, vue 3.5.43, svelte 5.57.1, solid-js 1.9.15, preact 10.29.8, **octane 0.4.2** (was 0.2.2), @preact/signals-core 1.14.4, zod 4.6.5, valibot 1.5.0, arktype 2.2.3, typia 15.0.0, joi 18.2.9, yup 1.7.1, typebox 0.34.52, **jotai 3.0.0**, zustand 5.0.15, mobx 7.0.4, mobx-state-tree 8.0.0, xstate 5.33.2, i18next 26.4.2, @casl/ability 7.0.1, @tanstack/query-core 5.103.2, @tanstack/virtual-core 3.17.11, @tanstack/table-core 9.2.4, @tanstack/form-core 1.33.5, react-hook-form 7.88.0, formik 2.4.9, react-hot-toast 2.6.1, sonner 2.0.8, hotkeys-js 4.0.8, tinykeys 4.0.0, mousetrap 1.6.5, nuqs 2.10.1, ky 2.1.0, ofetch 1.5.1, axios 1.20.0, redaxios 0.5.1, unhead 3.4.1, hono 4.13.8, react-router 8.4.0, vue-router 5.3.1, find-my-way 9.9.0, radix3 1.1.2, echarts 6.1.0, motion 13.4.1, @emotion/css 11.13.5, goober 2.1.19, styled-components 6.5.3, rxjs 7.8.2.

---

## 1. DOM row-list suite — `bench:fair` (8 frameworks, real Chromium)

`--repeat 5 --wait-quiet 6` → 100 pooled samples per cell. Load stayed 4.6–5.7 for the whole run (every framework start re-checked). Bimodality guard clean.

| op | Vanilla | **Pyreon** | Octane | Vue 3 | Solid | Svelte 5 | React 19 | Preact |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| create 1,000 | 8.07 | **8.83** | 9.27 | 9.30 | 9.47 | 9.73 | 11.25 | 12.88 |
| replace all | 8.05 | **8.64** | 8.95 | 9.21 | 9.30 | 9.70 | 10.53 | 12.90 |
| partial update | 620µs | **645µs** | 675µs | 990µs | 1.30 | 725µs | 855µs | 980µs |
| select row | 10µs | 15µs | 25µs | 305µs | 25µs | 380µs | 185µs | 230µs |
| swap rows | 550µs | 655µs | **625µs** | 865µs | 725µs | 1.36 | 6.66 | 805µs |
| remove row | 6.80 | 7.02 | 6.81 | 7.18 | **6.79** | 7.37 | 7.06 | 7.14 |
| clear rows | 95µs | **115µs** | 190µs | 225µs | 430µs | 315µs | 990µs | 860µs |
| create 10,000 | 80.61 | **88.31** | 94.94 | 97.10 | 93.23 | 105.09 | 216.97 | 295.50 |
| append 1k→10k | 14.64 | **15.71** | 18.87 | 76.86 | 17.55 | 24.72 | 19.23 | 20.52 |

(ms unless noted.)

**Verdicts (CI95):** **Pyreon outright** on create 1,000, replace all, clear rows, create 10,000, append · **tie** Pyreon = Octane on partial update and swap rows · **tie** Solid = Octane = Pyreon on remove row · **no verdict** on select row (below 10 clock ticks; the batch instrument in §3 resolves it) · `batch cycle` rows are measured by only 4 of 8 implementations, so no verdict.

**Pyreon vs hand-written Vanilla:** 1.04–1.10× on most ops (create 1.09×, replace 1.07×, partial 1.04×, remove 1.03×, create-10k 1.10×, append 1.07×), 1.19× swap, 1.21× clear.

**Verdict changes vs the published record:** `clear rows` flipped from a ~1.45× loss to Octane to an **outright Pyreon win** (115 vs 190 µs) — against **Octane 0.4.2**, not 0.2.2, so this is not a like-for-like confirmation of any Pyreon change. `create 1,000` and `replace all` moved from "tie with Octane" to outright.

**Retained heap after the suite (post-GC, MB):** Vanilla 2.65 · Preact 2.78 · **Pyreon 2.78** · Solid 2.87 · Svelte 2.98 · Vue 3.01 · Octane 3.15 · React 3.21 — Pyreon ties Preact for the lightest framework.

Caveats that travel with these numbers: create/replace/remove/append are dominated by browser layout that every framework pays identically, so small gaps there are real but mostly not framework JS; `create N rows` is a replace for 19 of 20 samples (no reset between runs); Pyreon and Solid allocate a per-row signal the plain-object frameworks do not.

## 2. Scenario suite — `bench:scenarios` (real Chromium, 60 samples)

⚠ The run printed "above ceiling" at its end (load 6.65); the memo scenario's first pass started after a 185 s wait for a spike to 13.7 to settle. Treat memo pass 1 as possibly contaminated; other scenarios ran at load ≤ 6.

| scenario | fastest framework | **Pyreon** | others |
| --- | --- | --- | --- |
| dbmon tick (100×6 cells, all change) | Svelte 1.80 ms 🥇 | 1.90 ms (1.06× slower) | Solid-per-attr 1.86 🤝 · React 1.89 🤝 · Vue(h) 1.97 · Solid 2.01 · Vue 2.02 · Octane 2.05 · Preact 2.25 |
| mount deep tree (2,047 components) | Solid 3.25 ms 🥇 | 4.20 ms (1.29× slower) | React 4.60 · Preact 8.14 · Vue 8.25 · Svelte 13.30 |
| context → 1,024 consumers | **Pyreon 1.71 ms 🥇** | — | Solid 1.79 🤝 · React 2.25 · Svelte 2.50 · Vue 2.61 · Preact 2.77 |
| effect list: update 500 | Solid 1.02 ms 🥇 | 1.03 ms 🤝 | React 1.22 · Svelte 1.50 · Preact 1.67 · Vue 2.80 |
| effect list: dispose 500 | Solid 40 µs 🥇 | 40 µs 🤝 | Svelte 105 · React 210 · Vue 255 · Preact 290 |
| memo wall: blocked (300 consumers) | **Pyreon 13 µs 🥇** | — | Vue 18 · React 19 · Preact 19 · Solid 21 · Svelte 50 |
| memo wall: passthrough | **Pyreon 565 µs 🥇** | — | Svelte 595 · Solid 603 · React 640 · Preact 937 · Vue 2,100 |

- **dbmon**: every value changes every tick, so a signal graph's skip-unchanged advantage is removed by construction; the whole field is within 1.25×. Pyreon is **not** the leader here.
- **Deep-tree mount remains Pyreon's clearest loss** (1.29× behind Solid; Vanilla floor 2.45 ms). The opt-in template variants measure 4.05 ms (`tpl append`) and 4.50 ms (`tpl slot`). The `SolidJS (eager props)` diagnostic arm (2.70 ms) shows Solid's getter-prop cost; it is excluded from ranking.
- **Flow diagram — `@pyreon/flow` vs React Flow 12 (500 nodes / 499 edges):** React Flow wins **mount** (17.05 vs 20.38 ms, Pyreon 1.20× slower); Pyreon wins drag ×60 (4.64 vs 34.30 ms, 7.4×), select (267 µs vs 945 µs, 3.5×), pan+zoom ×60 (230 µs vs 21.95 ms, 95×), unmount (2.58 vs 9.13 ms, 3.5×); add 50 nodes is a tie (4.46 vs 4.48 ms).

## 3. Scaling — `bench-crossover` (batch instrument, 100 → 20,000 rows)

Batch-timed (K ops per window) so per-op cost resolves below the clock tick. One pass per cell; all cells at load ≤ 6.46.

| op | 100 rows | 1,000 | 10,000 | 20,000 |
| --- | --- | --- | --- | --- |
| select — Pyreon / Octane / Solid | 495 ns / 925 ns / 1.9 µs | 491 ns / 912 ns / 8.0 µs | 489 ns / 903 ns / 61.8 µs | 459 ns / 896 ns / 113.6 µs |
| partial update — Pyreon / Octane / Solid | 67.0 / 75.8 / 64.2 µs | 562 / 628 / 592 µs | 9.25 / 10.09 / 9.93 ms | 20.39 / 21.95 / 21.79 ms |
| swap — Pyreon / Octane / Solid | 73.2 / 72.9 / 80.5 µs | 500 / 514 / 600 µs | 6.03 / 6.65 / 6.62 ms | 14.86 / 17.59 / 16.82 ms |

- **select** is O(1) for Pyreon and Octane (flat ~0.5 µs vs ~0.9 µs — Pyreon **1.85–1.95×** faster at every size) and O(n) for Solid (5.5 ns/row; Pyreon 247× faster at 20k).
- **partial update**: Pyreon 1.08–1.13× faster than Octane at every size; ~1.05–1.07× faster than Solid from 1,000 rows up (tie at 100).
- **swap**: tie with Octane at 100 rows, Pyreon 1.03–1.18× faster from 1,000 up; 1.10–1.20× faster than Solid.
- **Instrument disagreement (disclosed):** for Octane `select` at 10k/20k rows the per-op timer reads 50–60 µs while the batch instrument reads ~0.9 µs (55–67×). The batch figure is used above; the per-op figure for that cell is unexplained.

## 4. Hydration — SSR HTML → interactive (real Chromium, 60 samples)

**1,000-row table (`bench:hydration`)** — every framework adopted 1,000/1,000 server rows.

| | total | **walk** (framework work) | layout |
| --- | ---: | ---: | ---: |
| Vue 3 | 6.91 ms 🥇 | 1.34 ms 🥇 | 5.57 ms |
| **Pyreon** | 6.93 ms 🤝 | 1.38 ms 🤝 | 5.55 ms |
| React 19 | 7.45 ms (1.08×) | 2.12 ms (1.58×) | 5.33 ms |
| Preact | 12.69 ms (1.84×) | 6.88 ms (5.12×) | 5.81 ms |

**Verdict changes:** the record said Vue led the *walk* by 13–16%; with Vue now on its **compiled** template (its real fast path, which the old hand-written arm denied it) and today's runtime, Pyreon and Vue are **statistically tied** on both the total and the walk. 95 µs of Pyreon's walk is constructing per-row signals Vue's arm does not.

**App-page shape (`bench:apppage`, 320 statically composed components, 2,206 nodes)** — all four adopt 2,206/2,206: **Pyreon 4.26 ms 🥇** · React 4.63 (1.09×) · Vue 5.02 (1.18×) · Preact 5.94 (1.39×). The record had Vue ahead here; note Vue's arm is now compiled stateful components (idiomatic SFC shape), which costs per instance compared with the old hand-written functional components.

## 5. Server rendering

**Compiled SSR, idiomatic per framework (`bench:ssr`, µs/render, 3 processes pooled):**

| rows | **Pyreon** | Vue 3 | Svelte 5 | React 19 | Pyreon h() walk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | **2.11 🥇** | 2.79 (1.32×) | 2.48 (1.18×) | 11.22 (5.32×) | 16.17 |
| 100 | 16.30 (1.06×) | **15.40 🥇** | 18.63 (1.21×) | 77.44 (5.03×) | 135.26 |
| 1,000 | 159.3 (1.09×) | **146.5 🥇** | 177.1 (1.21×) | 785.9 (5.36×) | 1,408.7 |

Vue leads at 100 and 1,000 rows (Pyreon 1.06× and 1.09× behind, CIs disjoint); Pyreon leads small pages. Vue's `renderToString` is async and awaited (its real completion); the others are synchronous.

**`renderToString` vs React / Preact / Solid (`bench:ssr-cross`, byte-identical output enforced):**

| scenario | Pyreon compiled | Solid | Pyreon h() | Preact | React |
| --- | ---: | ---: | ---: | ---: | ---: |
| card | **7.93M/s 🥇** | 1.78M (4.46×) | 1.54M | 1.30M | 714K |
| list-50 | **185K/s 🥇** | 114K (1.63×) | 36.5K | 26.6K | 27.0K |
| list-1000 | **10.9K/s 🥇** | 6.1K (1.79×) | 1.9K | 1.3K | 1.5K |
| layout (component children) | **186K/s 🥇** | 101K (1.85×) | 33.4K | 23.7K | 24.5K |

The compile-to-string path (default-on in `@pyreon/vite-plugin`) is what an app ships; the `h()` row is the uncompiled walk, 5–6× slower.

**Runtime found during this run (fixed in #3586, merged):** production SSR bundles kept live `process.env.NODE_ENV` reads inside Pyreon's own code. Under Node each read is ~145 ns (bun ~1 ns), and the dev gates sit on hot paths: signal create+read+write 950 → 158 ns and a 1,000-row stateful SSR render 1.44 → 0.74 ms once folded. A Node server loading `lib/` unbundled still pays it (§8).

## 6. Real-app shapes

**`real-bench` — TodoMVC shape vs real `react-dom@19` (3 passes, 60 samples):** add-100 **1.14×** (865 µs vs 990 µs) · toggle-1000 **2.42×** (5.59 vs 13.53 ms) · clear-1000 **4.24×** (330 µs vs 1.40 ms). The previously published add-100 "~16×" was a harness artifact (React's window included an idle frame) and is withdrawn.

**`form-bench` — 12-field form vs 6 form libraries (real Chromium, 60 samples):**

| scenario | **Pyreon** | Solid modular-forms | React Hook Form | Formik | Vue vee-validate | Svelte Felte | TanStack Form |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mount 12 fields | 250 µs 🤝 | 275 µs 🤝 | 590 | 350 | 575 | 610 | 740 |
| keystroke (blur mode) | **60 µs** | 110 | 145 | 565 | 245 | 675 | 775 |
| keystroke (change mode, validates) | **460 µs** | 525 | 895 | 1,500 | 960 | 1,220 | 2,590 |
| reset dirty form | **25 µs** | 40 | 165 | 70 | 185 | 170 | 155 |

Retained heap: Pyreon 2.28 MB (lowest) · Solid 2.33 · Vue 2.94 · Svelte 2.96 · RHF 3.44 · Formik 3.57 · TanStack 3.96. vee-validate's 5 ms validation debounce is excluded from its samples, so its column under-counts.

## 7. Bundle size — the same keyed-table app per framework (gzip -9)

Vanilla 3.6 KB · **Solid 7.5 KB 🥇** · Preact 10.6 · Svelte 16.0 · **Pyreon 16.6 (2.22×)** · Vue 27.0 · Octane 65.8 · React 69.6. Every entry carries the same shared runner module (a constant offset).

## 8. Reactivity core — vs Preact Signals and Solid

Median ns/op, one process per cell, 30 windows. `Pyreon` = `lib/` loaded unbundled; `Pyreon-bundled` = same `lib/` with `process.env.NODE_ENV` folded, as every bundler does for a browser app.

**V8 (node 26.1, the engine Chrome uses):**

| test | Pyreon-bundled | Preact | Solid | Pyreon unbundled |
| --- | ---: | ---: | ---: | ---: |
| signal create+read+write | 67 | **14 🥇** | 20 | 658 |
| computed diamond (100 updates) | 9,146 | **6,408 🥇** | 40,503 | 81,301 |
| effect propagation (100) | **2,406 🥇** | 3,094 | 17,276 | 39,198 |
| batch 50 signals | **777 🥇** | 924 | 4,896 | 14,764 |
| deep chain (depth 50, 100) | 183,578 | **81,265 🥇** | 713,605 | 645,673 |
| wide fan-out (1→100 effects) | 3,003 | **1,703 🥇** | 5,052 | 21,987 |

**JavaScriptCore (bun 1.4):** Pyreon leads effect propagation (1,729 vs Preact 4,780 — 2.76×), batch (570 vs 1,136 — 1.99×) and wide fan-out (2,158 vs 2,353 — 1.09×); Preact leads create (7 vs 34 — Pyreon ~5× slower), diamond (5,967 vs 7,033 — 1.18×) and deep chain (124,662 vs 168,890 — 1.35×). Solid is behind Pyreon on every row except create.

**Honest read:** on V8 Pyreon wins effects and batching, and loses create (~5×), diamond (1.43×), deep chains (2.26×) and wide fan-out (1.76×) to Preact. The **unbundled** column is the cost any Node process pays when it imports Pyreon's `lib/` without a bundler (custom servers, node scripts) — 10–20× — see §5.

## 9. Other core packages

- **Router** (8 routers, 3 processes pooled, correctness gate over 1,344 cells): at 50 and 200 routes Pyreon averages **1.00× / 1.01×** of the fastest (radix3), ahead of find-my-way (1.27–1.29×), Hono (3.2×), Vue Router (8–20×), TanStack (10×), React Router (865–3,894×). At 10 routes **Hono leads** (Pyreon 4.66×), driven by one outlier: Pyreon splat 1.23 µs with a wide CI [0.94–1.77 µs], against 108–112 ns at 50/200 routes. Load rose to 8.86 during this run.
- **Head** vs Unhead: serialize 1.07–1.26× faster (5/20/50 tags: 2.63 vs 3.32 µs, 8.67 vs 9.32 µs, 18.99 vs 21.00 µs).
- **Styler** vs Emotion / goober / styled-components: cold insert 3.18× / 3.76×; warm dedup 5.14× / 3.24×; dynamic resolve 5.14× / 1.73×; SSR collect 3.58× / 4.41× / 2.64× (styled-components includes a React render pass).
- **Validate** vs zod / valibot / arktype (megamorphic multi-schema workload): Pyreon fastest or CI-tied on every cell. Tied with valibot on valid strings; zod 1.14× ahead of Pyreon (CI-tied) on invalid strings. In the per-cell protocol bench against 9 libraries, **zod's compiled mode (`zod-c`) wins 3 parse cells outright** (email valid 1.3×, int valid 1.7×, array-of-20 valid 1.1× ahead of Pyreon) and ties Pyreon on two more; arktype wins valid object parse (1.2×) and invalid-email check (1.3×); typebox/typia tie Pyreon on several check cells. Pyreon wins or ties everything else, and wins every invalid-input parse cell.
- **Compiler** (Vite 8 pipeline): Pyreon's pass on top of OXC costs 2.4–7× OXC alone (small → 100-row inputs), and is still faster than esbuild/SWC/Babel's standalone JSX transforms on small/medium inputs. A build-time cost, disclosed.

## 10. Fundamentals — head-to-heads (bun/JavaScriptCore, one process per op × library)

| package | vs | Pyreon wins | Pyreon loses / ties |
| --- | --- | --- | --- |
| store | Zustand, Jotai | dispatch 7.0× / 29.9×, write→subscriber 2.0× / 9.3×, patch 1.5× / 6.6× | **setup 34.8× slower than Zustand** (registry + 2 signals); read and patch-with-subscriber 1.1× slower than Zustand |
| storage | Jotai atomWithStorage, Zustand persist | writes 10–30×, create 1.7–1.8× | read 1.1× slower than Zustand |
| state-tree | MobX-State-Tree | 3.5–34× on every op (schema create 5.7×, action 34.4×) | — |
| machine | XState | create 12.7×, send 39.6×, can 11.9×, matches 4.4× | — |
| i18n | i18next | t 18.2×, interpolation 6.4×, plural 4.5×, number 3.5×, date 2.9× | — |
| permissions | CASL | fair resolver race: 1.6–2.1× | exact deny: tie. Memo-hit rows (4–14×) are a cache read, not a resolver race |
| http | ky, ofetch, redaxios, axios | 1.4–7.8× vs ky/ofetch/redaxios, 12–20× vs axios | **creating a client is slower than ofetch (0.78×) and redaxios (0.41×)** |
| hotkeys | tinykeys, hotkeys-js, mousetrap | dispatch hit/miss 1.5–32× | **register + teardown 4.3× slower than tinykeys** |
| url-state | nuqs | booleans 2.2×, arrays 2.8–7.9×, float 1.3× | **integer parse 1.4× slower, round-trip 1.2× slower** (nuqs uses a cheaper int parser) |
| form (headless store) | TanStack form-core | update 69.5×, reset 5.7× | **setup 1.4× slower** |
| query ⚠ happy-dom | react-query (same core) | data change → DOM 4.6×; 8× less derivation work | mount: tie |
| virtual ⚠ happy-dom | react-virtual (same core) | scroll → DOM 1.3× | **mount 10k list 1.3× slower** |
| table ⚠ happy-dom | react-table (same core) | single-cell update 1.2–1.4× vs memoized rows (tie at 1,000), 11–29× vs naive | **mount 1.6–1.7× slower, replace 1.4× slower, sort 2.2–2.6× slower than memoized rows** |
| toast ⚠ happy-dom (commit) | react-hot-toast, sonner | headless 2.4–3.3×; create/update/dismiss → DOM 22–30× | sonner excluded from commit rows (doesn't render in happy-dom) |
| charts engine | ECharts 6.1 SSR | spec → SVG 6.5–8.3× faster (bars 1k/10k, line 10k) | — |
| charts wrapper ⚠ happy-dom | echarts-for-react | update 9.4×, dispose 2.2× | mount: tie |
| hooks | Solid / Preact counters | counter 1.21× faster | — |
| rx | computed / Solid / RxJS | pipe fuses N nodes into 1 | **per-op, `@pyreon/rx` is slower than a plain computed** (filter 4.0 vs 2.6 µs, map 3.0 vs 1.6 µs) |
| dnd ⚠ happy-dom | raw pragmatic-drag-and-drop | row-enter fan-out 24× (selector vs naive) | mount/unmount: tie; dispatch +5 ns |
| validation (wrapper tax) | raw zod / valibot / arktype | — | tax 5–480 ns over raw (largest on arktype invalid) |

⚠ happy-dom rows time a JavaScript DOM implementation, not a browser — the counts and relative work are meaningful, the absolute times are not browser-representative.

## 11. Pyreon-only throughput (no competitor)

- **cssVariables theming** (40 components, 4 flips): cssVariables mode **1.16× faster** than classic (0.46 vs 0.53 ms), same heap. (All perf counters read 0 in both modes, so the "zero-work" mechanism is not visible in this run.)
- **runtime-server**: empty 564K renders/s · simple 155K · links-100 9.6K · layouts-26-params 26.3K.
- **server**: compiled template 19.7M ops/s · handler 110–225K req/s.
- **unistyle**: flat `styles()` 972K/s · responsive cold 197–636K/s · render-cache hit 18.2M/s (81.8× the cold resolve).
- **sync (CRDT → signal)**: presence publish tax over raw y-protocols 250 ns (1 peer) → 4.6 µs (200 peers); synced-text keystroke 3.9 µs (1k chars) → 82.5 µs (10k fragmented); inbound WS frame 66 ns.
- **document** (16 output formats): 43K–436K docs/s small, 1.7K–33K docs/s large.
- **loom** scan of this monorepo: 319 ms warm (97.7% import scanning). **lathe**: parse and generate scale linearly (exponent 0.93–1.07).

## 12. Where Pyreon loses (collected)

1. **Deep component-tree mount** — 1.29× behind Solid (4.20 vs 3.25 ms).
2. **Signal creation** — ~5× slower than Preact on both engines; deep computed chains 1.35× (JSC) – 2.26× (V8); computed diamond 1.18–1.43×; on V8 also wide fan-out 1.76×.
3. **SSR of large pages** — Vue's compiled SSR is 1.06× (100 rows) – 1.09× (1,000 rows) faster.
4. **dbmon** — Svelte leads; Pyreon 1.06× behind in a field that spans 1.25×.
5. **Bundle size** — 16.6 KB vs Solid 7.5 KB and Preact 10.6 KB for the same app.
6. **Flow mount** — React Flow 1.20× faster to mount 500 nodes.
7. **Store setup** (34.8× vs Zustand), **hotkeys register/teardown** (4.3× vs tinykeys), **http client creation** (vs ofetch/redaxios), **url-state integer parse** (1.4×), **form store setup** (1.4×), **rx per-op overhead**, **table mount/sort under happy-dom**, **router at 10 routes**.
8. **Unbundled Node** — any process importing `lib/` without a bundler pays ~145 ns per dev-gate read (§5, §8).

## 13. Defects found by this run

- **`compileValidators` makes `.is()` ~2× slower (0.42–0.63×, reproduced in two runs).** The runtime `.is()` gained its own verdict-only JIT; the build-emitted verdict is an issues-array validator in a `try/catch`. Its documented "1.6–3× faster" is withdrawn in the docs. Fix options: rebuild the emitter on the verdict-only JIT, or retire the option (it remains useful only where a CSP forbids runtime `new Function`).
- **SSR `NODE_ENV` reads** — fixed for Vite production builds in #3586; unbundled Node remains.
- **`@pyreon/kinetic` vs Motion** — withdrawn. After the harness fixes the full run still stalls in the Motion arm at 2,000 elements, and the quick run (which now runs on the isolated clock) is not a valid comparison, so no figure is published.
- **Atlas pipeline bench** is a profiling tool, not a comparison: run without a target it scans atlas's own components, 302 of 449 of whose scenarios need props a bare scan does not supply.
- **`@pyreon/code` bundle bench**: monaco-editor failed to bundle, so the Monaco comparison row is missing; `@pyreon/code` core is 3% larger gzipped than `@uiw/react-codemirror` (same CodeMirror 6 core).

## 14. Not measured

Streaming SSR, portals, async waterfalls, startup metrics (script bootup, main-thread work), krausest's per-op memory metrics, Firefox/Safari, and any independent third-party run. `@pyreon/validate`'s 10-library protocol bench prints CIs only in JSON. The fundamentals benches run under bun (JavaScriptCore); only the reactivity bench has a V8 pass. Reproduce any row with the command in its package's `bench` script; the cross-framework suites are `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 6` (and `bench-scenarios.ts`, `bench-hydration.ts`, `bench-apppage.ts`, `bench-ssr.ts`, `bench-crossover.ts`).
