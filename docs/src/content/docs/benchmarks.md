---
title: Benchmarks
---

# Benchmarks

Pyreon's performance work is benchmark-driven. This page publishes the numbers:
the wins, the statistical ties, **and the losses**. The same honesty bar applies
here as everywhere else in these docs: an inflated benchmark is worse than a slow
framework.

**How to read this page.** Every number comes from the full run of **2026-11-05**
on an Apple M3 Max (darwin/arm64, bun 1.4.0, node 26.1.0, Chromium 156 via
Playwright 1.64), against the competitor packages installed at npm latest.
Benches ran strictly one at a time on an idle machine (load 1.2–3.9, mostly
about 2), with `NODE_ENV=production`, production builds for every browser
suite, and a cross-origin-isolated page so the browser clock resolves 5µs
instead of 100µs. Figures are medians with bootstrap 95% confidence
intervals. A result is a **win** only when the intervals do not overlap; `🤝`
marks a statistical tie (*could not distinguish*, not *equal*). Close cells
were measured twice, and a verdict is stated only where both runs agree.
Absolute times are machine-dependent — **the ratio is the portable signal**.
The authoritative, complete record is
[`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) at
the repo root; where this page and that file disagree, the file wins.

**Author-judge caveat, stated up front:** these benchmarks are written and
judged by the Pyreon authors. The methodology is designed for objectivity —
per-cell process isolation, rotated execution order, correctness gates that read
the result back before a number is trusted, and competitor code compiled through
each framework's own compiler at its idiomatic best — but only independent
reproduction fully resolves author bias. A ready-to-submit
`frameworks/keyed/pyreon` implementation for the independent
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
is staged in-repo at `contrib/krausest/pyreon-keyed/`.

## Summary

- **Wins outright:** clear rows, append, select (batch instrument), partial
  update at every list size (batch instrument), context propagation, effect
  updates, memoization, hydration of an app-shaped page, compiled SSR at every
  page size, `renderToString`, TodoMVC vs React, a 12-field form vs six form
  libraries, `@pyreon/flow` vs React Flow, `@pyreon/virtual` vs react-virtual,
  `@pyreon/charts` vs ECharts, head, styler, and most fundamentals packages.
- **Statistical ties:** most of the keyed row-list board (create, replace,
  partial update, swap, remove, create 10k) against the Vue 3.6 Vapor release
  candidate, Octane 0.16 and Vue 3; dbmon; 1,000-row hydration vs Vue; router
  matching at 50/200 routes.
- **Losses:** deep component-tree mount (Solid 1.20×), data-table mount vs
  memoized react-table (1.12×), some large line-chart mounts, signal creation
  and deep computed chains vs Preact Signals, bundle size, router at 10 routes,
  and a handful of package micro-ops. All listed at the end.

**What changed since the previous version of this page (2026-09-23).** The
page was out of date; several of its verdicts no longer hold. Withdrawn:
"Pyreon outright on create 1,000, replace all and create 10,000" (now ties —
Octane 0.16 and the Vapor release candidate caught up); "React Flow mounts
1.20× faster" (Pyreon mounts 1.18× faster); "Vue's compiled SSR is faster on
large pages" (Pyreon now leads at 10, 100 and 1,000 rows); "Pyreon has the
lowest retained heap in the form benchmark" (Solid modular-forms is lighter);
"cssVariables theming is 1.16× faster" (it was a tie, and is now 1.13×
*slower* than classic mode). The later "Octane wins swap at 1,000 rows" and
"Vapor wins replace all and swap" claims in `BENCHMARKS.md` are withdrawn too
(see below).

## Flagship: keyed row-list DOM benchmark

A krausest-style row-list suite in real Chromium, a production `vite build` per
framework, 100 pooled samples per cell (`--repeat 5`, order reshuffled every
pass), run twice. The Pyreon entry is the **idiomatic JSX users write**.

| Benchmark | Vanilla | Pyreon | Vue 3.6 Vapor (RC) | Octane | Vue 3 | Solid | Solid 2.0 (RC) | Svelte 5 | React 19 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 6.74 | 🤝 7.49 | 🤝 7.37 | 🤝 7.49 | 🤝 7.42 | 7.93 | 8.32 | 8.12 | 9.31 | 9.94 |
| Replace all | 6.85 | 🤝 7.34 | 🤝 7.22 | 🤝 7.31 | 7.36 | 7.80 | 8.31 | 8.06 | 9.32 | 9.86 |
| Partial update | 720µs | 🤝 675µs | 🤝 690µs | 🤝 715µs | 1.06 | 1.30 | 1.29 | 805µs | 870µs | 905µs |
| Select row | 5µs | 10µs | 25µs | 25µs | 385µs | 30µs | 65µs | 365µs | 280µs | 280µs |
| Swap rows | 760µs | 🤝 790µs | 🤝 775µs | 860µs | 1.07 | 1.03 | 885µs | 1.53 | 6.05 | 990µs |
| Remove row | 5.69 | 🤝 5.80 | 🤝 5.75 | 🤝 5.80 | 5.90 | 🤝 5.82 | 5.87 | 6.47 | 6.02 | 6.00 |
| Clear rows | 85µs | **130µs** | 150µs | 155µs | 250µs | 465µs | 645µs | 335µs | 660µs | 275µs |
| Create 10,000 | 67.52 | 🤝 74.88 | 🤝 74.45 | 🤝 74.59 | 🤝 74.46 | 78.11 | 82.67 | 87.83 | 195.31 | 278.42 |
| Append 1k→10k | 12.08 | **13.07** | 62.45 | 13.34 | 63.18 | 13.64 | 14.45 | 19.21 | 15.34 | 16.08 |

(ms unless noted; first of two runs shown; `🤝` = tied with the fastest
framework; **bold** = outright leader among frameworks.)

**Verdicts (both runs agree):** Pyreon outright on **clear rows** (1.15×) and
**append** (1.02×) · a statistical tie for first on create 1,000, replace all,
partial update, swap rows, remove row and create 10,000 — against the Vue 3.6
Vapor release candidate, Octane 0.16 and, on the create ops, Vue 3 · **no
verdict** on select row, which sits below 10 clock ticks (the batch instrument
below resolves it).

Pyreon is not behind on any row of this board, but it is no longer alone at the
front: Octane's 0.13 → 0.16 update and the Vapor release candidate both reach
the same layout-bound floor.

**Against hand-written Vanilla**, Pyreon costs 1.02–1.11× on most ops (create
1.11×, replace 1.07×, swap 1.04×, remove 1.02×, create 10k 1.11×, append
1.08×), and 1.53× on clear. Partial update measures 0.94× — slightly faster
than the Vanilla reference.

**Retained heap after the suite** (post-GC, MB): Vanilla 2.94 · **Pyreon 3.08**
· Preact 3.08 · Solid 3.16 · Svelte 3.27 · Vue 3.30 · Solid 2.0 (RC) 3.44 ·
React 3.50 · Vapor (RC) 4.08 · Octane 4.50 — Pyreon ties Preact as the
lightest framework.

Caveats that travel with these numbers:

- Create, replace, remove and append are dominated by browser layout that every
  framework pays identically. For create 1,000 the measured split is Pyreon JS
  1.19ms + layout 7.04ms against Vanilla's 0.68ms + 7.03ms: the gap to Vanilla
  is entirely JavaScript, and it is about 7% of the operation.
- `create N rows` is a replace for 19 of 20 samples; only the first sample
  mounts into an empty list.
- Pyreon and Solid allocate a per-row signal that the plain-object frameworks
  (Vue, Vapor, Octane) do not.

### Scaling — select, partial update, swap at 100 → 20,000 rows

A batch instrument (K operations per timing window) resolves per-op cost below
the clock tick. It has Pyreon, Octane and Solid arms (no Vapor arm).

- **Select** is O(1) for Pyreon and Octane — flat at about 0.43µs vs 0.83µs,
  Pyreon **1.88–2.04×** faster at every size — and O(n) for Solid, which
  Pyreon beats 258× at 20,000 rows.
- **Partial update:** Pyreon **1.05–1.11×** faster than Octane and
  **1.03–1.07×** faster than Solid at every size.
- **Swap:** Pyreon wins from 5,000 rows up (1.03–1.10× vs Octane). At 100 and
  1,000 rows there is **no verdict**: at the default window Octane leads by
  1.10–1.17×, but changing the window size (and so K) moves Pyreon's own
  per-swap figure between 425µs and 481µs and flips the result — Pyreon leads at
  a 10ms window, they tie at 80–160ms. That violates the instrument's own
  soundness condition, so neither direction is claimed. The single-op timer and
  the row board both read swap as a tie.

Reproduce: `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 4`
and `bun bench-crossover.ts --repeat 3` (add `--target-ms 10|20|80|160` for the
window check).

## Scenarios beyond the row list

Real Chromium, 60 samples per cell, run twice.

| Scenario | Fastest | Pyreon |
| --- | --- | --- |
| dbmon tick (100×6 cells, all change) | 🤝 Pyreon 1.71ms = Octane 1.71 = Svelte 1.75 | — |
| mount deep tree (2,047 components) | Solid 3.09ms | 3.72ms (**1.20× slower**; React 3.64 🤝) |
| context → 1,024 consumers | **Pyreon 1.88ms** | Solid 1.94 |
| effect list: update 500 | **Pyreon 820µs** | Solid 907µs |
| effect list: dispose 500 | 🤝 Pyreon 45µs = Solid 45µs | second run: Solid 38µs vs Pyreon 50µs |
| memo wall: blocked (300 consumers) | **Pyreon 11µs** | Vue 16 · Preact 17 · React 17 |
| memo wall: passthrough | **Pyreon 450µs** | Svelte 493 · Solid 496 |

- **dbmon** changes every value every tick, which removes a signal graph's
  skip-unchanged advantage by construction; the field converges on the
  DOM-write floor, and it is never quoted as a win for anyone.
- **Deep-tree mount is Pyreon's clearest loss** — 1.20× behind Solid; React and
  Pyreon are a statistical tie.
- **Dispose 500** sits at two or three clock ticks; the runs disagree (tie, then
  Solid 1.3×), and an on-CPU profile puts Pyreon's teardown below Solid's.

**Flow diagrams — `@pyreon/flow` vs React Flow 12** (500 nodes, 499 edges):
Pyreon wins every op — mount 1.18× (17.15 vs 20.26ms), drag ×60 7.3×, select
5.0×, add 50 nodes 1.18×, pan+zoom ×60 206×, unmount 3.8×. Neither arm
synthesizes pointer events; both drive their public imperative API and verify
the DOM every iteration.

**Data table — `@pyreon/table` vs `@tanstack/react-table`** (memoized rows,
1,000 rows × 6 columns, real Chromium, two runs): react-table **mounts 1.12×
faster**; single-cell update is a tie; Pyreon is faster at replace (1.12–1.14×),
sort (1.10–1.11×) and unmount (1.40×).

**Virtual list — `@pyreon/virtual` vs `@tanstack/react-virtual`** (10,000
rows, real Chromium): Pyreon wins mount (1.16×), 60 scroll steps (1.05×),
jump-to-row (1.09×) and unmount (2.7×).

Reproduce: `cd examples/benchmark && bun bench-scenarios.ts --scenario <name>`
(`dbmon`, `tree`, `effects`, `memo`, `flow`, `table`, `virtual`).

## Charts

**`@pyreon/charts` vs ECharts 6** (line, 800×400 canvas): Pyreon wins all four
— mount 1,000 points 3.9× (1.07 vs 4.12ms), mount 100,000 points 7.9×, update
100,000 points 4.7×, update 1 of 1,000 points 2.5×.

**vs uPlot 1.6, Chart.js 4 (with decimation) and Recharts 3** (first painted
frame, two runs). Pyreon is measured with its default row-object input and with
columnar input (the shape uPlot takes):

| op | Pyreon (rows) | Pyreon (columns) | uPlot | Chart.js | Recharts | verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| mount line, 1,000 | 2.73 | 2.70 | 2.45 | 4.34 | 13.2 | 🤝 Pyreon = uPlot |
| mount line, 10,000 | 3.89 | 3.42 | 3.48 | 5.50 | 70.9 | uPlot ahead or tied; rows input 1.12–1.16× slower |
| mount line, 100,000 | 6.53 | 5.07 | 5.34 | 6.32 | 645 | 🤝 columns = uPlot |
| mount line, 1,000,000 | 17.17 | 12.65 | 14.03 | 12.94 | 6,740 | 🤝 columns = Chart.js = uPlot; rows input 1.32× slower |
| update line, 10,000 | 1.15 | **1.12** | 1.92 | 3.83 | 24.1 | **Pyreon** (1.7–2.0×) |
| update line, 100,000 | 2.84 | **2.10** | 4.51 | 3.85 | 183 | **Pyreon** (1.4–1.9×) |
| mount bars, 1,000 | 5.33 | **5.01** | 21.62 | 11.06 | 41.4 | **Pyreon** (2.1–2.3×) |

(ms, first run.) Pyreon renders an offscreen accessible data table by default;
none of the others do. Bundle cost beyond the runtime: a line chart is 38.0KB
gzipped vs ECharts tree-shaken 155.9KB (4.10×); a pie is 19.1 vs 117.2KB.

Reproduce: `bun bench-scenarios.ts --scenario charts` / `--scenario charts-libs`,
`bun bench-charts-bundle.ts`.

## Hydration

**1,000-row table** — every framework adopted 1,000/1,000 server rows (two
runs, 60 and 100 samples):

| | total | walk (framework work) |
| --- | ---: | ---: |
| Vue 3 | 5.92 / 5.98ms | 1.16 / 1.18ms |
| **Pyreon** | 🤝 5.97 / 6.03ms | 🤝 1.16 / 1.17ms |
| React 19 | 6.46 / 6.45ms | 1.66 / 1.64ms |
| Preact | 8.45 / 8.53ms | 3.39 / 3.47ms |

Pyreon and Vue are **statistically tied** on the walk in both runs; on the total
Vue has the faster median and the intervals separate by 0.01ms in one run and
overlap in the other, so it is a tie. Layout is about 80% of every total. About
100µs of Pyreon's walk builds the per-row signals Vue's arm does not.

**App-page shape** (320 statically composed components, 2,206 nodes, all four
adopt every node): **Pyreon 4.02ms** · React 4.14 (1.03×) · Preact 4.33 (1.08×)
· Vue 4.47 (1.11×).

Reproduce: `cd examples/benchmark && bun bench-hydration.ts` / `bench-apppage.ts`

## Server-side rendering (cross-framework)

The same page rendered server-side by each framework at its **compiled
idiomatic best**: Pyreon through the compile-to-string fast path (the
`@pyreon/vite-plugin` default), React through `react-dom/server`, Vue through its
compiled SSR, Svelte through `generate: 'server'`. µs per render, 3 processes
pooled per cell.

| rows | Pyreon | Vue 3 | Svelte 5 | React 19 | Pyreon h() walk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | **1.80** | 3.03 (1.68×) | 2.18 (1.21×) | 10.30 (5.72×) | 17.48 |
| 100 | **11.64** | 15.66 (1.35×) | 18.08 (1.55×) | 76.52 (6.57×) | 146.69 |
| 1,000 | **109.9** | 124.9 (1.14×) | 160.5 (1.46×) | 714.4 (6.50×) | 1,387.6 |

**Pyreon leads at every size**, with disjoint intervals at 1,000 rows. This
reverses the previous version of this page, which had Vue ahead at 100 and
1,000 rows. Vue's `renderToString` is async and awaited (its real completion);
the others are synchronous.

A second suite (`bench:ssr-cross`) compares `renderToString` against React,
Preact and Solid with byte-identical output enforced. Pyreon's compiled path
leads every scenario — card 4.68×, list-50 1.64×, list-1000 1.72×, layout 1.74×
ahead of Solid, the next fastest. The uncompiled `h()` walk is 5–6× slower than
the compiled path, which is what an app actually ships.

Reproduce: `cd examples/benchmark && bun bench-ssr.ts`, `bun run bench:ssr-cross`

## Real-app shapes

**TodoMVC vs `react-dom@19`:** add-100 **1.99×**, toggle-1000 **2.48×**,
clear-1000 **3.14×** faster. The add-100 ratio has read 1.14×, 1.38–1.51× and
1.99× on different days with the same harness, because React's own figure moves
(its CV was 24% today); quote it as **1.14–1.99×**.

**12-field form vs six form libraries** (real Chromium): Pyreon leads every
scenario — mount 210µs vs Solid modular-forms 305, keystroke in blur mode 60 vs
100, keystroke with validation 460 vs 570, reset 20 vs 35. Retained heap:
Solid modular-forms 2.33MB, **Pyreon 2.42MB**, then Vue and Svelte at 2.99MB.

## Reactivity core

Against Preact Signals and Solid, one process per cell. On V8 (node 26.1, the
engine Chrome uses), with `NODE_ENV` folded as every bundler does:

| test | Pyreon | Preact | Solid |
| --- | ---: | ---: | ---: |
| signal create+read+write | 62 | **13** | 19 |
| computed diamond (100 updates) | 6,555 | **5,781** | 37,572 |
| effect propagation (100) | **2,187** | 2,863 | 15,868 |
| batch 50 signals | **584** | 892 | 5,136 |
| deep chain (depth 50, 100) | 143,587 | **76,367** | 719,298 |
| wide fan-out (1→100 effects) | 1,889 | **1,614** | 4,888 |

(median ns/op.)

**Honest read:** on V8 Pyreon wins effect propagation (1.31×) and batching
(1.53×), and loses signal create (about 5×), the computed diamond (1.13×),
deep chains (1.88×) and wide fan-out (1.17×) to Preact. On JavaScriptCore
(bun 1.4) Pyreon leads effect propagation (2.6×), batching (2.0×) and wide
fan-out (1.23×), while Preact leads create (about 5×), deep chains (1.16×) and
the diamond by 1%. Solid is behind Pyreon on every row except create.

The deep-chain loss is specific to an **unobserved** chain (no effect at the
tail): Preact leaves unobserved computeds unsubscribed and validates them on
read, while Pyreon keeps every computed subscribed. With an effect at the tail —
the shape an app renders — the gap is smaller (1.44× when last decomposed, 2026-10-20). Signal creation is bound by
prototype setup; per-instance methods were measured and declined (more memory
per signal, slower `.set()`).

**Unbundled Node pays a tax.** A Node process that imports Pyreon's `lib/`
without a bundler (a custom server, a script) keeps live `process.env.NODE_ENV`
reads — about 145ns each under Node — and pays 10–20× on these rows. Bundled
apps do not.

Reproduce: `bun run bench:reactivity` (add `--runtime node` for V8)

## Router matching

8 routers, 3 processes pooled, correctness gate over 1,344 cells:

- At **50 and 200 routes** Pyreon averages **1.00× / 1.01×** of the fastest
  (radix3) — tied for first — ahead of find-my-way (1.14–1.15×), Hono (3.3×),
  Next.js path-to-regexp (2.9–10.7×), TanStack Router (8×), Vue Router (8–19×)
  and React Router (885–3,898×). Per row, Pyreon wins the catch-all miss and
  trails radix3 or find-my-way on static, dynamic, nested-dynamic and splat
  matches by 1.24–1.34×.
- At **10 routes Hono leads** (Pyreon 1.89× of best); Hono wins 6 of 7 rows.

Reproduce: `bun run bench:router`

## Head, compiler, styler, validation

- **`@pyreon/head` vs Unhead**: serialize 1.22–1.50× faster at 5/20/50 tags.
- **Styler vs Emotion / goober / styled-components**: fastest on all four ops —
  cold insert 3.38× / 3.59×; warm dedup 6.34× / 3.81×; dynamic resolve
  5.26× / 2.17×; SSR collect 3.56× / 3.99× / 2.30× (styled-components includes
  a React render pass).
- **`@pyreon/validate`**: fastest on 11 of 12 cells of the multi-schema
  workload; **Zod wins invalid scalar string (1.17×)**. In the per-cell bench
  against nine libraries, compiled Zod wins three valid-parse cells, ArkType
  wins valid object parse (it returns the input without cloning) and the
  invalid-email check, and ArkType/typia win the valid-email check; Pyreon
  wins or ties the rest, including every invalid-input parse.
- **Compiler** (Vite 8 pipeline): Pyreon's reactive pass on top of OXC costs
  2.7–5.7× OXC alone. A build-time cost, disclosed.

Reproduce: `bun run bench:head`, `bun run bench:validate`, `bun run bench:compiler`

## Fundamentals — vs the library each package targets

Each package is benchmarked head-to-head against the library it wraps or
competes with, one process per op × library, under bun (JavaScriptCore). Rows
marked ⚠ run under happy-dom — a JavaScript DOM implementation, not a browser —
so their counts and relative work are meaningful but their absolute times are
not browser-representative.

| Package | vs | Verdict |
| --- | --- | --- |
| `@pyreon/store` | Zustand / Jotai | Wins dispatch 5.8× / 26.3×, write→subscriber 2.1× / 10.4×, patch 1.5× / 7.3×. **Loses `setup` 30.9× to Zustand** (two signals plus a registry entry) and **patch-with-subscriber 1.3×**; read is single-digit ns for both. |
| `@pyreon/storage` | jotai `atomWithStorage` / zustand persist | Writes 10–30×, create 1.7–1.8× faster. Read is 1.5× slower than Zustand (4 vs 3ns). |
| `@pyreon/state-tree` | MobX-State-Tree 9 | 2.2–9.8× faster on every op. |
| `@pyreon/machine` | XState | create 11.4×, send 34.7×, can 6.0×, matches 4.7× faster. |
| `@pyreon/i18n` | i18next | `t` 12.0×, interpolation 5.1×, plural 3.6×, number 3.1×, date 2.7× faster. |
| `@pyreon/permissions` | CASL | Fair resolver race 1.3–1.9× faster; exact deny 🤝 tie. Memo-hit rows are a cache read, not a resolver race, and are not claimed. |
| `@pyreon/http` | ky / ofetch / redaxios / axios | 4.9–21.5× faster than ky, 1.2–2.2× than ofetch on POST, query params and middleware, 1.8–1.9× than redaxios, 8.7–43× than axios. **Loss:** creating a client is 1.46× slower than redaxios; a plain GET ties ofetch. |
| `@pyreon/hotkeys` | tinykeys / hotkeys-js / mousetrap | Dispatch hit 1.7–7.5×, miss 6–118× faster; register + teardown 1.17× faster than tinykeys. |
| `@pyreon/url-state` | nuqs | Booleans 1.8×, arrays 1.2–2.1×, float 1.7× faster. **Loss:** integer parse 1.1× slower (nuqs uses a cheaper integer parser). |
| `@pyreon/form` | @tanstack/form-core | Headless store: update 62×, reset 4.8× faster; setup 🤝 tie. |
| `@pyreon/query` ⚠ | @tanstack/react-query | Same query-core underneath. Data change → DOM 5.6× faster with 8× less derivation work; mount 1.2× faster. |
| `@pyreon/virtual` ⚠ | @tanstack/react-virtual | Scroll → DOM 1.4× faster; mount 1.1× slower here, but 1.16× **faster** in real Chromium. |
| `@pyreon/table` ⚠ | @tanstack/react-table | Single-cell update 1.1–1.6× vs memoized rows, 13–23× vs naive; replace 1.4–1.6×. **Losses:** mount 1.2–1.5× slower here (1.12× in real Chromium), sort ties memoized rows. |
| `@pyreon/toast` | react-hot-toast / sonner | Headless 2.5–3.8×; ⚠ create/update/dismiss → DOM 21–31×. Sonner is excluded from the commit rows (it does not render in happy-dom). |
| `@pyreon/rx` | plain computed / Solid / RxJS | `pipe()` fuses N nodes into one. Per op, filter/map/sum are level with a hand-written computed; `pipe` of three stages is ~1.03× (inside run-to-run noise; an earlier 1.07× included an extra array copy only the rx arm made, now fixed in the harness). **`sortBy` is 1.05× behind**, because its comparator is a generic key compare rather than a numeric subtraction. |
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
- **`@pyreon/charts` engine vs ECharts 6.1 SSR**: spec → SVG 7.2–9.6× faster
  (bars 1k/10k, line 10k).
- **`@pyreon/code` vs @uiw/react-codemirror**: the core is 4% larger gzipped
  (same CodeMirror 6 core). The Monaco row is missing — monaco-editor failed to
  bundle.
- **cssVariables theming** (Pyreon-only, measured against a Vite dev server):
  classic mode is 1.13× faster than cssVariables mode across 300 components and
  20 flips.

## Bundle sizes

The same keyed-table app built per framework, gzip -9: Vanilla 3.6KB ·
**Solid 7.5KB** · Preact 10.1 · Svelte 16.1 · **Pyreon 17.1** (2.28× Solid) ·
Vue 27.4 · Octane 43.1 · React 69.6. Every entry carries the same shared runner
module. Pyreon grew 0.5KB since 2026-10-20 (16.6KB); the bundle-budget history
points at runtime-dom changes for hydration and compiled-accessor correctness.

Every published package's main-entry size and canonical minimal-import size are
also locked by CI budget gates (`scripts/bundle-budgets.json`,
`scripts/import-budgets.json`), so growth cannot land unnoticed.

Reproduce: `cd examples/benchmark && bun bench-bundle.ts`

## Framework-internal suites

Not competitor claims — these are Pyreon-only regression harnesses that lock hot
paths against drift, run with the same discipline (production define,
isolation, correctness gates):

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

## What we don't win (the standing list)

Kept current against the 2026-11-05 run:

1. **Deep component-tree mount** — 1.20× behind Solid (3.72 vs 3.09ms); React
   ties Pyreon.
2. **Keyed row-list board** — tied for first, not outright, on create, replace,
   partial update, swap, remove and create 10k (Vue 3.6 Vapor release
   candidate, Octane 0.16, Vue 3).
3. **Swap at 100 and 1,000 rows** — no stable verdict against Octane.
4. **Data-table mount** — memoized react-table mounts 1.12× faster.
5. **Line-chart mounts** — with row-object input, 10k points is 1.12–1.16×
   behind uPlot and 1M points 1.32× behind Chart.js; with columnar input these
   are ties.
6. **Effect-list dispose** — a tie in one run, Solid 1.3× in the other, at the
   clock's resolution.
7. **Signal creation** — about 5× slower than Preact on both engines; deep
   computed chains 1.16× (JSC) to 1.88× (V8); computed diamond 1.01–1.13×; on
   V8 also wide fan-out 1.17×.
8. **Hydration of a keyed table** — tied with Vue.
9. **Bundle size** — 17.1KB vs Solid 7.5KB, Preact 10.1KB and Svelte 16.1KB for
   the same app.
10. **Router at 10 routes** (Hono), and individual static/dynamic/splat matches
    against radix3 and find-my-way.
11. **Package-level losses** — store setup (30.9× vs Zustand) and
    patch-with-subscriber (1.3×), http client creation (vs redaxios), url-state
    integer parse (1.1×), Zod on invalid strings (1.17×) and a few compiled-Zod
    / ArkType validation cells, rx `sortBy` (1.05× vs a hand
    computed), form-benchmark heap (Solid modular-forms is lighter), table and
    virtual mount under happy-dom.
12. **Unbundled Node** — any process importing `lib/` without a bundler pays
    about 145ns per dev-gate read.

Each of these is either actively being closed or is a priced, documented
trade-off — never hidden.
