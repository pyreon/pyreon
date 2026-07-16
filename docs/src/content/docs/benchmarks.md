---
title: Benchmarks
---

# Benchmarks

Pyreon's performance work is benchmark-driven, and this page publishes the
numbers — the wins, the statistical ties, **and the losses**. The same honesty
bar as everywhere else in these docs: an inflated benchmark is worse than a
slow framework.

**How to read this page.** All numbers were measured on an idle Apple M3 Max
(darwin/arm64) against the real published competitor packages, current as of
2026-07 on `main`. Absolute times are machine-dependent — **the ratio is the
portable signal**. `🤝` marks a statistical tie (95% bootstrap confidence
intervals overlap). Every suite is reproducible from the repo with the
commands listed in each section.

**Author-judge caveat, stated up front:** these benchmarks are written and
judged by the Pyreon authors. The methodology is designed for objectivity —
per-cell process isolation, rotated inputs (so a JIT can't cache a constant
result), correctness gates that verify the measured effect before a number is
trusted, seeded randomized execution order, and competitor code compiled
through each framework's **own real compiler** at its idiomatic best — but
only independent reproduction fully resolves author bias. A ready-to-submit
`frameworks/keyed/pyreon` implementation for the independent
[krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
is staged in-repo at `contrib/krausest/pyreon-keyed/`.

## Flagship: keyed row-list DOM benchmark

A krausest-style row-list suite in real Chromium (Playwright), production
`vite build` per framework, forced GC between iterations, 20 timed runs with
median + CI95, DOM verified every iteration. The Pyreon entry is the
**idiomatic JSX users actually write** — no hand-tuned tier (the compiler
already lowers idiomatic JSX to the optimal `_tpl()` output; a hand-written
low-level entry measured statistically identical and was removed).

| Benchmark | Vanilla | **Pyreon** | Vue 3 | Solid | React 19 | Svelte 5 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 8.40 | **9.00** | 10.00 | 10.40 | 11.60 | 12.60 | 13.90 |
| Replace 1,000 | 8.50 | **9.00** | 9.90 | 10.20 | 11.30 | 12.90 | 13.80 |
| Partial update | 800µs | **700µs** | 1.60 | 4.50 | 1.10 | 2.30 | 1.30 |
| Select row | 0µs | **0µs** | 700µs | 0µs | 300µs | 400µs | 400µs |
| Swap rows | 800µs | **700µs** | 1.40 | 800µs | 7.10 | 2.40 | 1.10 |
| Remove row | 6.90 | **7.30** | 8.40 | 7.20 | 7.50 | 8.80 | 7.80 |
| Clear rows | 100µs | **200µs** | 400µs | 500µs | 1.00 | 400µs | 800µs |
| Create 10,000 | 89.80 | **95.00** | 110.50 | 115.50 | 226.20 | 237.70 | 288.20 |
| Append 1k→10k | 20.90 | **22.40** | 92.30 | 23.80 | 24.70 | 72.10 | 28.30 |

(ms unless noted; median of 100 pooled samples.)

On a proven `--repeat 5` pooled run Pyreon wins **7 of 9 framework verdicts
outright**, ties Solid on `select`, and Solid edges it on `remove` (7.20 vs
7.30ms). The only measurable cost vs hand-written vanilla JS is bulk-create
(~6–7% — per-row signal allocation plus the keyed-`<For>` map).

**The dimension Pyreon does *not* lead:** retained memory. After the full
suite Pyreon retains ~2.90MB — mid-pack (5th of 7), ahead of Solid (2.97) and
Vue (3.97), behind Preact/Svelte/React/Vanilla. Retained-heap has real
cross-run variance (Solid measured 2.27–2.97 across same-day runs), so treat
mid-table ranks as a band.

Reproduce: `cd examples/benchmark && bun bench:fair --repeat 5`

## Server-side rendering (cross-framework)

The same page (nav + heading + N-row keyed list + footer) rendered
server-side by each framework at its **compiled idiomatic best**: Pyreon
through `transformJSX` with the SSR compile-to-string fast path (the
vite-plugin default), React through `react-dom/server`, Vue through
`compileTemplate({ ssr: true })` (the `ssrRender` string-concat path Nuxt
runs), Svelte through `generate: 'server'`. Steady-state warm-process
throughput; per-render app creation; framework-independent correctness gate.

| rows | **Pyreon** | react-dom 19 | vue 3.5 | svelte 5 |
| --- | --- | --- | --- | --- |
| 10 | **4.05µs** | 9.08µs | 3.28µs | ★ 3.00µs |
| 100 | **22.3µs** | 61.3µs | ★ 17.0µs | 18.6µs |
| 1000 | **208.8µs** | 627.5µs | ★ 148.9µs | 175.3µs |

Honest reading: Pyreon renders **2.2–3× faster than React** at every size,
and currently sits **1.2–1.4× behind Vue and Svelte** — both compile SSR to
raw string concatenation, which is the bar Pyreon's compile-to-string fast
path is closing release by release. (This table is the newest suite in the
repo and the most actively moving target.)

Reproduce: `cd examples/benchmark && bun bench:ssr`

## Reactivity core

Bun-run micro-benchmarks against Preact Signals and Solid (resolved to their
real working builds, `NODE_ENV=production`):

- **Effect propagation**: Pyreon leads (~1.25× over Preact, ~3× over Solid).
- **Batched writes (batch-50)**: Pyreon leads (~1.06×).
- **Wide fan-out** (one signal, many effects): Pyreon leads (~1.03× —
  flipped from ~2.4–2.75× *behind* by the 2026-07 batch-queue rewrite).
- **Computed diamond**: near-tie with Preact (~1.07–1.10×, Preact ahead —
  down from 2.9×).
- **Deep computed chain**: Preact ahead ~1.25× (down from 2.1×).
- **Signal create**: Preact ahead ~1.4×.

The remaining diamond/chain/create gaps are a **documented trade-off**, not
an oversight: closing them requires Preact's lazy-pull version model, which
costs retained heap per primitive. Pyreon's per-primitive memory (signal
~152B, computed ~913B, effect ~930B) is part of its memory story, and that
trade was declined deliberately.

Reproduce: `bun run bench:reactivity`

## Router matching

8-router protocol (find-my-way, Hono, radix3, React Router, TanStack Router,
Vue Router, Next.js-style matcher), per-cell process isolation, rotated path
variants, identity-verified matches:

- **Static resolve is flat O(1)** (~16ns) at 10/50/200 routes — tied-fastest
  with radix3 at realistic sizes.
- **Pyreon wins the realistic-size table averages outright at both 50 and
  200 routes**, and wins `dynamic (1 param)` outright (~78ns).
- Hono's compiled mega-regex wins the 10-route toy table, then collapses at
  50/200 routes (150ns+).
- React Router's linear scan degrades with table size (10µs → 67µs → 280µs
  per resolve); Pyreon stays flat.
- **Losses, disclosed:** find-my-way/radix3 still edge the param-heavier
  rows (dynamic-2/nested-dynamic ~1.1×; splat/catch-all ~1.3–1.7×
  find-my-way) — while returning less than Pyreon's `ResolvedRoute` (params
  + parsed query + merged meta + matched chain).

Reproduce: `bun run bench:router`

## Head, compiler, styler

- **`@pyreon/head` vs unhead**: ~1.3–2.1× faster at 5/20/50 tags (fair
  comparison — both resolve *and* serialize to the HTML string).
- **Compiler**: the Rust (napi) backend transforms 3.7–8.9× faster than the
  JS fallback; both emit byte-identical output (locked by a 300-seed
  differential fuzzer across client/SSR/SSR-template modes).
- **Styler SSR fast path**: ~5× faster `renderToString` for styled
  components, byte-identical class names (no hydration mismatch).

Reproduce: `bun run bench:head`, `bun run bench:compiler`

## Fundamentals — vs the library each package targets

Each adapter/package is benchmarked head-to-head against the library it
wraps or competes with, idiomatic per library, correctness-gated,
process-isolated. Headline verdicts (losses included):

| Package | vs | Verdict |
| --- | --- | --- |
| `@pyreon/store` | Zustand / Jotai | Wins the per-field hot path (dispatch ~6.5×, write→1-subscriber ~2.4×, no-sub patch ~1.7×); 🤝 ties read. **Loses `setup` ~12.6×** (per-field signals, paid once per store id) and with-subscriber `patch` ~1.7× — the per-key event-model contract, documented trade-off. |
| `@pyreon/validate` | Zod / Valibot / ArkType | **Fastest or CI-tied on 11 of 12 rows** of the megamorphic multi-schema suite (arrays 1.41×, DU 1.25× over ArkType; error path 20–53× over ArkType, 33–44× over Zod). **The one loss:** bare scalar-string valid — Valibot's minimal pipe leads 1.44× (Result-envelope fixed cost). |
| `@pyreon/query` | @tanstack/react-query | Same query-core underneath. Intra-component data change: **1 field derivation + 0 re-renders vs 8 + 1 re-render**; ~4× faster data-flip→DOM. Cross-component tracked-props: 🤝 tie. Mount: 🤝 tie. |
| `@pyreon/table` | @tanstack/react-table | Same table-core. Single-cell edit **7–9× faster than naive react-table**, ~1.1× vs hand-memoized — with zero `React.memo` boilerplate. **Losses:** mount ~2× and replace ~1.1–1.3× (per-cell reactive-binding setup — the price of the update wins), sort ~2× vs memo-row. |
| `@pyreon/virtual` | @tanstack/react-virtual | Same virtual-core. Steady-state scroll **1.3× faster**; row-recycle counts tied with memoized React. **Loss:** fixed-size mount ~1.1× slower (one-time ~16µs on a 10k list). |
| `@pyreon/storage` | jotai / zustand persist | Wins every op vs jotai; wins read + write vs zustand (write 12×, write→sub 9×), 🤝 ties create. |
| `@pyreon/url-state` | nuqs-style parsing | Wins or CI-ties every row after parser-class matching (float vs int-scan disclosed). |
| `@pyreon/i18n` | i18next | Faster on every measured op (plural path memoized per locale). |
| `@pyreon/machine` | XState | Large constant-factor wins on common ops — XState buys statechart features Pyreon deliberately offloads to signals. |
| `@pyreon/state-tree` | MobX-State-Tree | Faster on the action/patch/reactive hot path. |
| `@pyreon/toast` | react-hot-toast / sonner | Mounted DOM-commit path **21–40× faster than react-hot-toast**. Cold-start ingest: sonner leads ~2× (smaller code path; labeled cold-start by construction — sonner can't be warmed cross-lib). |
| `@pyreon/dnd` | raw pragmatic-drag-and-drop | 🤝 no measurable wrapper tax on any lifecycle (draggable/droppable/sortable/monitor). |

Reproduce: `bun run --filter='@pyreon/<pkg>' bench` (per package), or the
root `bun run bench:validate` for the cross-schema suite.

## UI layer

- **`@pyreon/kinetic` vs Motion One** (real Chromium, bare-CSS floor
  disclosed): wins enter-500 (~1.8–2×) and stagger-300 (~1.3×),
  wins-or-ties enter-2000, 🤝 ties stagger-1000 (was a 1.27× loss before the
  2026-07 shared-frame batching). Kinetic is CSS-transition-based — springs,
  interruptible values, layout and gesture animation remain Motion
  One/Framer territory, by design.
- **`@pyreon/charts` vs echarts-for-react** (same ECharts engine): reactive
  update ~11–12× faster, dispose ~tied; **mount ~1.7–1.9× slower** — the
  lazy-loader price of keeping ECharts out of your bundle.
- **`@pyreon/code` vs @uiw/react-codemirror**: core editor ~138KB gz — at
  parity (react wrapper ~129KB); ~7× smaller than Monaco's ESM core.

## Bundle sizes

Gzipped, built `lib/`, production define, measured by the CI budget gate on
every PR (`scripts/bundle-budgets.json` locks every package):

- `mount`-only import of `@pyreon/runtime-dom`: **~7.4KB** (kitchen-sink ~9.8KB)
- Every published package ships source maps; main-entry size and canonical
  minimal-import size are both ratcheted in CI.

## What we don't win (the standing list)

Honesty section, kept current: retained memory is mid-pack (not leading);
SSR at scale trails Vue/Svelte's string-concat compilers ~1.2–1.4×; Preact
leads computed diamond/chain/create micro-ops; find-my-way keeps router
splat/catch-all; ArkType keeps monomorphic bare-scalar validation (~1.7×);
store setup and bulk-patch-with-subscribers favor Zustand's shallow-merge
contract; table/virtual/charts pay a mount premium for their fine-grained
update wins. Each of these is either actively being closed or is a priced,
documented trade-off — never hidden.
