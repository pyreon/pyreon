---
title: Benchmarks
---

# Benchmarks

Pyreon's performance work is benchmark-driven, and this page publishes the
numbers — the wins, the statistical ties, **and the losses**. The same honesty
bar as everywhere else in these docs: an inflated benchmark is worse than a
slow framework.

**How to read this page.** All numbers come from the full run of 2026-09-23 on
an Apple M3 Max (darwin/arm64, bun 1.4 / node 26.1, Chromium 151 via
Playwright), against the real published competitor packages bumped to npm
latest before the run. Benches ran strictly one at a time, each gated on a
quiet machine, with `NODE_ENV=production` and production builds for every
browser suite. Absolute times are machine-dependent — **the ratio is the
portable signal**. `🤝` marks a statistical tie (95% bootstrap confidence
intervals overlap — *could not distinguish*, not *equal*). The authoritative,
complete record is [`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md)
at the repo root; where this page and that file disagree, the file wins.

**Author-judge caveat, stated up front:** these benchmarks are written and
judged by the Pyreon authors. The methodology is designed for objectivity —
per-cell process isolation, rotated execution order, correctness gates that
read the result back before a number is trusted, and competitor code compiled
through each framework's **own real compiler** at its idiomatic best — but
only independent reproduction fully resolves author bias. A ready-to-submit
`frameworks/keyed/pyreon` implementation for the independent
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
is staged in-repo at `contrib/krausest/pyreon-keyed/`.

**Before this run, every harness was audited, and most defects favoured
Pyreon.** Six competitor arms built their row data with a slower helper inside
the timed window, Vue arms were hand-written `h()` render functions that
disable Vue's compiled patch flags, Solid arms skipped the per-cell `insert()`
work its compiler emits, and several correctness gates only counted rows, so a
no-op could pass. All of it was fixed before measuring, and this run
supersedes every earlier figure this page published. Where a verdict flipped,
it is called out below.

## Flagship: keyed row-list DOM benchmark

A krausest-style row-list suite in real Chromium, production `vite build` per
framework, 100 pooled samples per cell (`--repeat 5`), load re-checked before
every framework and pass, cross-origin isolated (5µs clock). The Pyreon entry
is the **idiomatic JSX users actually write**.

| Benchmark | Vanilla | Pyreon | Octane | Vue 3 | Solid | Svelte 5 | React 19 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 8.07 | **8.83** | 9.27 | 9.30 | 9.47 | 9.73 | 11.25 | 12.88 |
| Replace all | 8.05 | **8.64** | 8.95 | 9.21 | 9.30 | 9.70 | 10.53 | 12.90 |
| Partial update | 620µs | 🤝 645µs | 🤝 675µs | 990µs | 1.30 | 725µs | 855µs | 980µs |
| Select row | 10µs | 15µs | 25µs | 305µs | 25µs | 380µs | 185µs | 230µs |
| Swap rows | 550µs | 🤝 655µs | 🤝 625µs | 865µs | 725µs | 1.36 | 6.66 | 805µs |
| Remove row | 6.80 | 🤝 7.02 | 🤝 6.81 | 7.18 | 🤝 6.79 | 7.37 | 7.06 | 7.14 |
| Clear rows | 95µs | **115µs** | 190µs | 225µs | 430µs | 315µs | 990µs | 860µs |
| Create 10,000 | 80.61 | **88.31** | 94.94 | 97.10 | 93.23 | 105.09 | 216.97 | 295.50 |
| Append 1k→10k | 14.64 | **15.71** | 18.87 | 76.86 | 17.55 | 24.72 | 19.23 | 20.52 |

(ms unless noted; `🤝` = CI95-overlap tie; **bold** = outright leader among
frameworks on that row.)

**Verdicts:** Pyreon outright on create 1,000, replace all, clear rows,
create 10,000 and append · tie Pyreon = Octane on partial update and swap rows ·
tie Solid = Octane = Pyreon on remove row · **no verdict** on select row, which
sits below 10 clock ticks (the batch instrument below resolves it).

**Two verdicts changed against earlier versions of this page.** `clear rows`
flipped from a loss to Octane to an outright Pyreon win (115 vs 190µs) — but
against **Octane 0.4.2**, not the 0.2.2 previously measured, so this is not a
like-for-like confirmation of any Pyreon change. `create 1,000` and `replace
all` moved from ties with Octane to outright.

**Against hand-written Vanilla**, Pyreon costs 1.04–1.10× on most ops
(create 1.09×, replace 1.07×, partial 1.04×, remove 1.03×, create-10k 1.10×,
append 1.07×), 1.19× on swap and 1.21× on clear.

Caveats that travel with these numbers:

- create/replace/remove/append are dominated by browser layout that every
  framework pays identically, so small gaps there are real but mostly not
  framework JavaScript.
- `create N rows` is a replace for 19 of 20 samples — there is no reset
  between runs, so only the first sample mounts into an empty list.
- Pyreon and Solid allocate a per-row signal that the plain-object
  frameworks do not.

### Scaling — select, partial update, swap at 100 → 20,000 rows

A batch instrument (K ops per timing window) resolves per-op cost below the
clock tick:

- **select** is O(1) for Pyreon and Octane — flat at roughly 0.5µs vs 0.9µs,
  Pyreon **1.85–1.95×** faster at every size — and O(n) for Solid, which
  Pyreon beats 247× at 20,000 rows.
- **partial update**: Pyreon 1.08–1.13× faster than Octane at every size;
  1.05–1.07× faster than Solid from 1,000 rows up (a tie at 100).
- **swap**: a tie with Octane at 100 rows, Pyreon 1.03–1.18× faster from
  1,000 up; 1.10–1.20× faster than Solid.
- Disclosed instrument disagreement: for Octane `select` at 10k/20k rows the
  per-op timer reads 50–60µs while the batch instrument reads about 0.9µs.
  The batch figure is used above; the per-op figure is unexplained.

**Retained heap after the suite** (post-GC, MB): Vanilla 2.65 · Preact 2.78 ·
**Pyreon 2.78** · Solid 2.87 · Svelte 2.98 · Vue 3.01 · Octane 3.15 ·
React 3.21 — Pyreon ties Preact for the lightest framework.

Reproduce: `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 6`
(and `bench-crossover.ts` for the scaling table).

## Scenarios beyond the row list

Real Chromium, 60 samples per cell.

| Scenario | Fastest | Pyreon |
| --- | --- | --- |
| dbmon tick (100×6 cells, all change) | Svelte 1.80ms | 1.90ms (1.06× slower) |
| mount deep tree (2,047 components) | Solid 3.25ms | 4.20ms (**1.29× slower**) |
| context → 1,024 consumers | **Pyreon 1.71ms** | Solid 1.79 🤝 |
| effect list: update 500 | Solid 1.02ms | 🤝 1.03ms |
| effect list: dispose 500 | Solid 40µs | 🤝 40µs |
| memo wall: blocked (300 consumers) | **Pyreon 13µs** | Vue 18 · React 19 |
| memo wall: passthrough | **Pyreon 565µs** | Svelte 595 · Solid 603 |

- **dbmon** changes every value every tick, which removes a signal graph's
  skip-unchanged advantage by construction; the whole field is within 1.25×
  and Pyreon is **not** the leader.
- **Deep-tree mount is Pyreon's clearest loss** — 1.29× behind Solid.
- The memo scenario's first pass started after a load spike settled; treat it
  as possibly contaminated.

**Flow diagrams — `@pyreon/flow` vs React Flow 12** (500 nodes, 499 edges):
React Flow wins **mount** (17.05 vs 20.38ms, Pyreon 1.20× slower); Pyreon wins
drag ×60 (7.4×), select (3.5×), pan+zoom ×60 (95×) and unmount (3.5×); adding
50 nodes is a tie.

Reproduce: `cd examples/benchmark && bun bench-scenarios.ts`

## Hydration

**1,000-row table** — every framework adopted 1,000/1,000 server rows:

| | total | walk (framework work) | layout |
| --- | ---: | ---: | ---: |
| Vue 3 | 6.91ms | 1.34ms | 5.57ms |
| **Pyreon** | 🤝 6.93ms | 🤝 1.38ms | 5.55ms |
| React 19 | 7.45ms | 2.12ms | 5.33ms |
| Preact | 12.69ms | 6.88ms | 5.81ms |

Pyreon and Vue are **statistically tied** on both the total and the walk,
with Vue now measured on its compiled template (its real fast path).

**App-page shape** (320 statically composed components, 2,206 nodes, all four
adopt every node): **Pyreon 4.26ms** · React 4.63 (1.09×) · Vue 5.02 (1.18×) ·
Preact 5.94 (1.39×).

Reproduce: `cd examples/benchmark && bun bench-hydration.ts` / `bench-apppage.ts`

## Server-side rendering (cross-framework)

The same page rendered server-side by each framework at its **compiled
idiomatic best**: Pyreon through the compile-to-string fast path (the
`@pyreon/vite-plugin` default), React through `react-dom/server`, Vue through
its compiled SSR, Svelte through `generate: 'server'`. µs per render, 3
processes pooled per cell.

| rows | Pyreon | Vue 3 | Svelte 5 | React 19 | Pyreon h() walk |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | **2.11** | 2.79 (1.32×) | 2.48 (1.18×) | 11.22 (5.32×) | 16.17 |
| 100 | 16.30 (1.06×) | **15.40** | 18.63 (1.21×) | 77.44 (5.03×) | 135.26 |
| 1,000 | 159.3 (1.09×) | **146.5** | 177.1 (1.21×) | 785.9 (5.36×) | 1,408.7 |

Honest reading: **Pyreon leads small pages; Vue leads at 100 and 1,000 rows**
(Pyreon 1.06× and 1.09× behind, CIs disjoint). This reverses an earlier
version of this page, which had Pyreon ahead at 100 rows and tied at 1,000.
Pyreon leads React 4.75–5.32× and Svelte 1.11–1.18× at every size (the
parenthesised ratios in the table are against each row's fastest). Vue's
`renderToString` is async and awaited (its real completion); the others are
synchronous. Pyreon also emits a per-row hydration-key marker Vue does not.

A second suite (`bench:ssr-cross`) compares `renderToString` against React,
Preact and Solid with byte-identical output enforced. Pyreon's compiled path
leads every scenario — card 4.46×, list-50 1.63×, list-1000 1.79×, layout
1.85× ahead of Solid, the next fastest. The uncompiled `h()` walk is 5–6×
slower than the compiled path, which is what an app actually ships.

Reproduce: `cd examples/benchmark && bun bench-ssr.ts`

## Real-app shapes

**TodoMVC vs real `react-dom@19`:** add-100 **1.14×**, toggle-1000 **2.42×**,
clear-1000 **4.24×** faster. An earlier "about 16× on add-100" figure was a
harness artifact — React's timed window included an idle frame — and is
withdrawn.

**12-field form vs six form libraries** (real Chromium): Pyreon leads
keystroke in blur mode (60µs vs Solid modular-forms 110), keystroke with
validation (460µs vs 525) and reset (25µs vs 40); mount is a 🤝 tie with Solid
modular-forms (250 vs 275µs). Retained heap is the lowest of the seven
(2.28MB).

## Reactivity core

Against Preact Signals and Solid, one process per cell. On V8 (node 26.1, the
engine Chrome uses), with `NODE_ENV` folded as every bundler does:

| test | Pyreon | Preact | Solid |
| --- | ---: | ---: | ---: |
| signal create+read+write | 67 | **14** | 20 |
| computed diamond (100 updates) | 9,146 | **6,408** | 40,503 |
| effect propagation (100) | **2,406** | 3,094 | 17,276 |
| batch 50 signals | **777** | 924 | 4,896 |
| deep chain (depth 50, 100) | 183,578 | **81,265** | 713,605 |
| wide fan-out (1→100 effects) | 3,003 | **1,703** | 5,052 |

(median ns/op.)

**Honest read:** Pyreon wins effect propagation and batching, and loses
signal create (about 5×), the computed diamond (1.43×), deep chains (2.26×)
and wide fan-out (1.76×) to Preact. On JavaScriptCore (bun 1.4) Pyreon leads
effect propagation (2.76×), batching (1.99×) and wide fan-out (1.09×), while
Preact leads create (about 5×), diamond (1.18×) and deep chain (1.35×). Solid
is behind Pyreon on every row except create.

The diamond and chain costs are partly the deliberate price of `computed`
gating on value with an `Object.is` compare, so a downstream cascade stops
when a derived value is unchanged — a synthetic bench that changes every value
every tick pays the compare without ever benefiting from it.

**Unbundled Node pays a tax.** A Node process that imports Pyreon's `lib/`
without a bundler (a custom server, a script) keeps live
`process.env.NODE_ENV` reads — about 145ns each under Node — and pays 10–20×
on these rows. Bundled apps do not.

Reproduce: `bun run bench:reactivity`

## Router matching

8 routers, 3 processes pooled, correctness gate over 1,344 cells:

- At **50 and 200 routes** Pyreon averages **1.00× / 1.01×** of the fastest
  (radix3) — effectively tied for first — ahead of find-my-way (1.27–1.29×),
  Hono (3.2×), Vue Router (8–20×), TanStack Router (10×) and React Router
  (865–3,894×).
- At **10 routes Hono leads** (Pyreon 4.66×), driven by one outlier cell:
  Pyreon's splat reads 1.23µs with a wide CI, against 108–112ns at 50/200
  routes. Load rose during this run.

Reproduce: `bun run bench:router`

## Head, compiler, styler

- **`@pyreon/head` vs Unhead**: serialize 1.07–1.26× faster at 5/20/50 tags.
- **Compiler** (Vite 8 pipeline): Pyreon's pass on top of OXC costs 2.4–7×
  OXC alone, and is still faster than esbuild/SWC/Babel's standalone JSX
  transforms on small and medium inputs. A build-time cost, disclosed.
- **Styler vs Emotion / goober / styled-components**: cold insert 3.18× /
  3.76×; warm dedup 5.14× / 3.24×; dynamic resolve 5.14× / 1.73×; SSR collect
  3.58× / 4.41× / 2.64× (styled-components includes a React render pass).

Reproduce: `bun run bench:head`, `bun run bench:compiler`

## Fundamentals — vs the library each package targets

Each package is benchmarked head-to-head against the library it wraps or
competes with, one process per op × library, under bun (JavaScriptCore).
Rows marked ⚠ run under happy-dom — a JavaScript DOM implementation, not a
browser — so their counts and relative work are meaningful but their absolute
times are not browser-representative. Headline verdicts, losses included:

| Package | vs | Verdict |
| --- | --- | --- |
| `@pyreon/store` | Zustand / Jotai | Wins dispatch 7.0× / 29.9×, write→subscriber 2.0× / 9.3×, patch 1.5× / 6.6×. **Loses `setup` 34.8× to Zustand** (a registry plus two signals); read and patch-with-subscriber are 1.1× slower than Zustand. |
| `@pyreon/validate` | Zod / Valibot / ArkType | Fastest or CI-tied on every cell of the megamorphic multi-schema workload. In the per-cell bench against nine libraries, **compiled Zod wins three valid-parse cells outright** (email 1.3×, int 1.7×, array-of-20 1.1×) and ArkType wins valid object parse (1.2×) and the invalid-email check (1.3×); Pyreon wins or ties everything else, including every invalid-input parse cell. |
| `@pyreon/query` ⚠ | @tanstack/react-query | Same query-core underneath. Data change → DOM 4.6× faster with 8× less derivation work; mount 🤝 tie. |
| `@pyreon/table` ⚠ | @tanstack/react-table | Same table-core. Single-cell update 1.2–1.4× vs memoized rows (a tie at 1,000), 11–29× vs naive. **Losses:** mount 1.6–1.7×, replace 1.4×, sort 2.2–2.6× slower than memoized rows. |
| `@pyreon/virtual` ⚠ | @tanstack/react-virtual | Same virtual-core. Scroll → DOM 1.3× faster. **Loss:** mounting a 10k list is 1.3× slower. |
| `@pyreon/storage` | jotai `atomWithStorage` / zustand persist | Writes 10–30×, create 1.7–1.8× faster; read is 1.1× slower than Zustand. |
| `@pyreon/url-state` | nuqs | Booleans 2.2×, arrays 2.8–7.9×, float 1.3× faster. **Losses:** integer parse 1.4× and round-trip 1.2× slower (nuqs uses a cheaper int parser). |
| `@pyreon/i18n` | i18next | `t` 18.2×, interpolation 6.4×, plural 4.5×, number 3.5×, date 2.9× faster. |
| `@pyreon/machine` | XState | create 12.7×, send 39.6×, can 11.9×, matches 4.4× faster. |
| `@pyreon/state-tree` | MobX-State-Tree | 3.5–34× faster on every op. |
| `@pyreon/toast` ⚠ | react-hot-toast / sonner | Headless 2.4–3.3×; create/update/dismiss → DOM 22–30×. Sonner is excluded from the commit rows (it does not render in happy-dom). |
| `@pyreon/form` | @tanstack/form-core | Headless store tier: update 69.5×, reset 5.7× faster. **Loss:** setup 1.4× slower. |
| `@pyreon/permissions` | CASL | Fair resolver race 1.6–2.1× faster; exact deny 🤝 tie. Memo-hit rows are a cache read, not a resolver race, and are not claimed. |
| `@pyreon/http` | ky / ofetch / redaxios / axios | 1.4–7.8× faster than ky/ofetch/redaxios, 12–20× faster than axios. **Loss:** creating a client is slower than ofetch and redaxios. |
| `@pyreon/hotkeys` | tinykeys / hotkeys-js / mousetrap | Dispatch hit/miss 1.5–32× faster. **Loss:** register + teardown is 4.3× slower than tinykeys. |
| `@pyreon/rx` | plain computed / Solid / RxJS | `pipe()` fuses N nodes into one. **Per op, `@pyreon/rx` is slower than a plain computed** (filter 4.0 vs 2.6µs, map 3.0 vs 1.6µs). |
| `@pyreon/dnd` ⚠ | raw pragmatic-drag-and-drop | Row-enter fan-out 24× (selector vs naive); mount/unmount 🤝 tie; dispatch adds 5ns. |
| `@pyreon/hooks` | Solid / Preact counters | Counter 1.21× faster. |
| `@pyreon/validation` | raw zod / valibot / arktype | Wrapper tax of 5–480ns over the raw library (largest on ArkType invalid). |

Reproduce: `bun run --filter='@pyreon/<pkg>' bench` (per package), or the
root `bun run bench:validate` for the cross-schema suite.

## UI layer

- **`@pyreon/kinetic` vs Motion** — the published comparison is
  **withdrawn**. The earlier harness closed its timing window before kinetic's
  enter state was applied and ran on a clamped clock. The re-run is
  provisional and is not published as a verdict: kinetic measured *below* the
  hand-written CSS baseline in every cell, which should be impossible for the
  same work and suggests the timed window does not capture CSS-transition work
  equally across arms.
- **`@pyreon/charts` engine vs ECharts 6.1 SSR**: spec → SVG 6.5–8.3× faster
  (bars 1k/10k, line 10k).
- **`@pyreon/charts` wrapper vs echarts-for-react** ⚠ happy-dom: update 9.4×,
  dispose 2.2× faster; mount 🤝 tie.
- **`@pyreon/code` vs @uiw/react-codemirror**: the core is 3% larger gzipped
  (same CodeMirror 6 core underneath). The Monaco comparison row is missing —
  monaco-editor failed to bundle in this run.

## Bundle sizes

The same keyed-table app built per framework, gzip -9: Vanilla 3.6KB ·
**Solid 7.5KB** · Preact 10.6 · Svelte 16.0 · **Pyreon 16.6** (2.22× Solid) ·
Vue 27.0 · Octane 65.8 · React 69.6. Every entry carries the same shared
runner module, a constant offset.

Every published package's main-entry size and canonical minimal-import size
are also locked by CI budget gates (`scripts/bundle-budgets.json`,
`scripts/import-budgets.json`), so growth cannot land unnoticed.

## Framework-internal suites

Not competitor claims — these are Pyreon-only regression harnesses that lock
hot paths against drift, run with the same discipline (production define,
isolation, correctness gates):

- **SSR handler throughput** (`bun run bench:ssr`, `bun run bench:server`) —
  TanStack-methodology scenarios (empty / 5-route / 100-link / 26-nested
  layouts) for `renderToString` and the full `createHandler` pipeline.
- **Styler / Unistyle engine** (`bun run bench:styler`, `bun run
  bench:unistyle`) — resolve → normalize → hash → insert hot paths and the
  responsive-breakpoint engine.
- **Sync (CRDT)** (`bun run bench:sync`) — synced-signal throughput and the
  presence-publish tax over the Yjs engine seam.
- **Document renderers** (`bun run bench:document`) — the render matrix
  across all 16 output formats.
- **Loom workspace scan** (`bun run bench:loom`) — phase timings for a real
  `loom scan` over an actual monorepo. About 98% of a scan is the import
  phase, so the phase split is the point; a total alone invites optimizing
  the other 2%.
- **Hooks wrapper tax** (`@pyreon/hooks` bench) — hook wrappers vs raw
  signals.
- **cssVariables theming** — cssVariables mode measures 1.16× faster than
  classic mode across 40 components and 4 flips, at the same heap.
- **Perf counters + leak sweep** — named dev-mode counters
  (`@pyreon/perf-harness`) and a nightly heap-slope leak sweep gate the
  memory story continuously.

## What we don't win (the standing list)

Honesty section, kept current against the 2026-09-23 run:

1. **Deep component-tree mount** — 1.29× behind Solid (4.20 vs 3.25ms).
2. **Signal creation** — about 5× slower than Preact on both engines; deep
   computed chains 1.35× (JSC) to 2.26× (V8); computed diamond 1.18–1.43×; on
   V8 also wide fan-out 1.76×.
3. **SSR of large pages** — Vue's compiled SSR is 1.06× (100 rows) to 1.09×
   (1,000 rows) faster.
4. **dbmon** — Svelte leads; Pyreon is 1.06× behind in a field that spans
   1.25×.
5. **Bundle size** — 16.6KB vs Solid 7.5KB and Preact 10.6KB for the same app.
6. **Flow mount** — React Flow mounts 500 nodes 1.20× faster.
7. **Package-level losses** — store setup (34.8× vs Zustand), hotkeys
   register/teardown (4.3× vs tinykeys), http client creation (vs
   ofetch/redaxios), url-state integer parse (1.4×), form store setup (1.4×),
   rx per-op overhead, table mount and sort, router at 10 routes.
8. **Unbundled Node** — any process importing `lib/` without a bundler pays
   about 145ns per dev-gate read.

Each of these is either actively being closed or is a priced, documented
trade-off — never hidden.
