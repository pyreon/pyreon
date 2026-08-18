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

> **2026-08-18 retraction.** The table and verdicts this section published
> through 2026-08-17 were partly wrong, and every error flattered Pyreon. We
> found our own harness had (1) handicapped [Octane](https://octanejs.dev) —
> the nearest rival — by rendering its row id as `{String(row.id)}` where its
> own idiomatic form (and the `react.ts` reference it ports) passes the raw
> number; that wrapper dropped Octane's compiler `forBlock` eligibility flags
> from 30 to 26 and routed every row through its slow path, and (2) let five
> implementations' `String(row.id)` calls inflate a shared V8 engine cache
> (`smi_string_cache`) that our retained-heap metric then charged to the
> framework. **This is not a Pyreon regression** — Pyreon's own medians are
> flat-to-better than the retracted run (e.g. `swap` 900µs → 860µs). What
> changed is that the competitor stopped being handicapped. The fixes are
> staged as open pull requests
> ([#2893](https://github.com/pyreon/pyreon/pull/2893),
> [#2894](https://github.com/pyreon/pyreon/pull/2894),
> [#2895](https://github.com/pyreon/pyreon/pull/2895),
> [#2896](https://github.com/pyreon/pyreon/pull/2896),
> [#2897](https://github.com/pyreon/pyreon/pull/2897),
> [#2899](https://github.com/pyreon/pyreon/pull/2899)) and had **not merged**
> as of this writing — the corrected table below is the destination once they
> land, not yet the state of `main`.

A krausest-style row-list suite in real Chromium (Playwright), production
`vite build` per framework, forced GC between iterations, 100 pooled samples
per op (`--repeat 5`), DOM verified every iteration. The Pyreon entry is the
**idiomatic JSX users actually write** — no hand-tuned tier (the compiler
already lowers idiomatic JSX to the optimal `_tpl()` output; a hand-written
low-level entry measured statistically identical and was removed).

| Benchmark | Vanilla | Pyreon | Octane | Vue 3 | Solid | Svelte 5 | React 19 | Preact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 | 7.83 | 🤝 8.41 | 🤝 8.45 | 8.48 | 9.16 | 9.23 | 10.46 | 12.12 |
| Replace 1,000 | 7.82 | 🤝 8.31 | 🤝 8.33 | 8.47 | 9.03 | 9.11 | 10.39 | 12.05 |
| Partial update | 780µs | 🤝 825µs | 🤝 850µs | 1.16 | 3.98 | 1.41 | 1.02 | 1.14 |
| Select row | — | at floor (no ratio) | at floor (no ratio) | — | — | — | — | — |
| Swap rows | 830µs | 🤝 860µs | 🤝 870µs | 1.23 | 🤝 905µs | 1.58 | 6.55 | 1.08 |
| Remove row | 6.43 | 🤝 6.58 | 🤝 6.58 | 6.80 | 6.67 | 7.22 | 6.85 | 7.09 |
| Clear rows | 85µs | 165µs | **115µs** | 235µs | 450µs | 285µs | 645µs | 760µs |
| Create 10,000 | 82.45 | **88.91** | 90.37 | 91.95 | 105.70 | 103.91 | 215.06 | 274.19 |
| Append 1k→10k | bimodal — no ratio (see below) | **18.89–19.02ms** | 19.69–19.81ms | 76.2 | 20.5 | 26.4 | 22.1 | 22.5 |

(ms unless noted; `🤝` = statistical CI95-overlap tie; **bold** = outright
leader on that row. Median of 100 pooled samples, load 1.58–2.81 — the
quietest window measured to date.)

**Corrected tally: Pyreon wins 2 ops outright (`create 10,000`, `append`),
statistically ties Octane on 6 (`create 1,000`, `replace`, `partial update`,
`swap`, `remove`, `select row`), and loses 1 (`clear rows`, a real 1.43× gap
— 165µs vs 115µs, CI-disjoint, not a timer-quantum artifact).** That is a
genuine walk-back from the previous "7 of 9 outright" claim: most of this
suite is now a statistical tie between two frameworks, not a Pyreon sweep —
but it is now two real wins, not one. The measurable wall-clock cost vs
hand-written vanilla JS is bulk-create (~6–7% — per-row signal allocation
plus the keyed-`<For>` map) and, computed from fast-mode-only samples (never
a raw ratio — see below), append (+3.8% to +4.9%); **the create/create-10k
figures are real but layout-dominated, not a clean JS-cost signal — see
below for the JS-only ~+28% term that is invisible in this wall-clock
number.**

**`select row` has no published multiplier.** Corrected timing at
100/1,000/10,000 rows: Pyreon 1.03/0.96/0.69µs vs Octane 1.37/1.53/1.15µs,
against a harness floor of 0.47–0.65µs. Octane is roughly flat across list
length — this refutes an earlier claim that treated it as O(n) with a large
multiplier. Both frameworks sit at the edge of what real-Chromium timing can
resolve; we publish "Pyreon is at the floor, Octane measurably but slightly
above it," never a precise ratio, and never `0µs` again.

**`Create 1,000` and `replace` are, 19 times out of 20, literally the same operation — and their tie is browser-bound, not a coincidence.** A 2026-08-18 profiling pass split `bench()`'s timed region (which times the framework's `fn()` PLUS a forced `getBoundingClientRect()` layout flush, in the SAME window) into JS and layout, on a production build:

| | JS | layout | total |
| --- | ---: | ---: | ---: |
| Pyreon | 1.13ms | 7.12ms | 8.24ms |
| Vanilla | 810µs | 7.26ms | 8.07ms |
| Δ | +317µs | −145µs | +172µs |

Layout is ~86% of `create 1,000` and **statistically identical between
Pyreon and Vanilla** — layout Δ across three reproductions (−58µs, −278µs,
−145µs) is noise around zero, LARGER than the entire framework JS gap. The
honest statement about the `create 1,000`/`replace` ties is therefore not
merely "within CI" — **this op is browser-layout-bound and the instrument
structurally cannot separate the frameworks there.** The only real,
tightly-reproducing signal is the JS term alone (Δ +318µs/+285µs/+317µs
across three runs): a genuine ~+28% Pyreon-vs-Vanilla cost on the JS
term that is **invisible in wall clock**, swamped by ~7ms of layout neither
framework controls. This is not a win claim, and not a loss claim — it's a
statement about what this instrument can and cannot see; do not quote a
wall-clock create/replace percentage as a framework cost without this
caveat. Separately: the suite has no `reset` between runs and row ids come
from a monotonic counter, so of the 20 timed runs per op only the FIRST
mounts into an empty list — the other 19 hand the reconciler N brand-new
keys against N rows STILL LIVE, which is structurally a replace. That's why
`create` (8.41ms) and `replace` (8.31ms) report nearly identical medians —
for 19 of 20 sampled runs they are, literally, the same operation. State
this plainly: a reader of "Create 1,000: 8.41ms" reasonably assumes a fresh
empty-DOM mount, and for the vast majority of sampled runs that assumption
is wrong.

A profiling driver used for the JS/layout split above initially printed
`0.0µs` for every sample — its attribution keyed on `Function.name`, which a
minified production build strips, so every lookup silently missed and fell
back to a plausible-looking zero. Same class as this repo's "gate that could
not fail" entries: it now refuses to report an empty attribution instead of
printing one.

**`append` is re-adjudicated OUTRIGHT PYREON, not void.** It previously read
"OUTRIGHT Pyreon, 22.40ms," which turned out to be measured on a contaminated,
bimodal harness and was briefly retracted to "unmeasured" while under
investigation. Two independent corrected `--repeat 5` runs (100 pooled
samples/op, load stamped 1.79→2.80, `crossOriginIsolated=true` verified, a
genuine 5.0µs timer quantum, Octane un-handicapped) resolve it: Pyreon
**18.89–19.02ms vs Octane 19.69–19.81ms — a narrow but real, CI95-disjoint
~1.04× win**, confirmed twice per run — once on the all-samples median, once
on the fast-mode cluster with slow-mode samples excluded entirely — same
verdict all four ways. Runner-up field: Solid 20.5ms · React 22.1ms ·
Preact 22.5ms · Svelte 26.4ms · Vue 76.2ms.

Three constraints travel with this number and must not be dropped when it is
quoted elsewhere: **(1)** do NOT publish a vs-Vanilla append ratio — Vanilla's
own median straddles the same two timing modes (35–60% slow-mode share
across three runs, swinging between ~18.8ms and ~48.7ms), so a naive ratio at
the 60%-slow run reads 0.39–0.46× (nonsensically implying frameworks are
faster than hand-written DOM); the only valid cost-over-Vanilla figure is the
fast-mode-only **+3.8% to +4.9%** quoted above. **(2)** the ~38% coefficient
of variation on this cell is disclosed bimodality, not measurement jitter — a
~10% slow-mode tail inflates CV/CI95 for every framework's append cell, not
just Pyreon's; say so whenever quoting it. **(3)** 1.04× is real and
CI-disjoint, but narrow — treat it as a narrow win on this synthetic
keyed-row-list suite under the standing author-judge limit, not as a general
performance claim.

A **bimodality guard** now exists precisely so a contaminated cell like the
original append figure can't reach these numbers unnoticed again (open PR,
not yet merged): it computes `capture = median / fastModeCentre` per cell and
fails the run when it crosses a calibrated threshold, naming the offending
op. It exists because every prior gate checked a cell's own internal
consistency but nothing checked whether one op's slow-mode tail was leaking
into its *neighbours* — which is exactly how the append corruption went
unnoticed until a human plausibility check caught it.

Per-op tie-vs-outright still shuffles with machine noise even on the
corrected field, so treat it as a band rather than a fixed scoreboard; the
current per-op record lives in
`.claude/skills/pyreon-benchmarks/SKILL.md`.

**Retained memory, corrected** (post-suite, post-GC): Vanilla 2.38 ·
Preact 2.50 = **Pyreon 2.50** · Solid 2.53 · Octane 2.69 · Svelte 2.70 ·
Vue 2.71 · React 2.89 MB — **3rd of 8, and TIED with Preact, not "2nd among
frameworks."** A tie has no ordinal; the previous "2nd, 0.04MB behind Preact"
framing on this page implied a ranking the numbers don't support. A sibling
run measured 2.45/2.48 for the same pair — both deltas sit inside a 10–20KB
noise floor, consistent with a tie rather than a gap.

The correction is a second fix layered on the same metric. This page first
said Pyreon was mid-pack (~2.90MB) because a GC-timing bug in the harness
counted not-yet-collected garbage as retained — fixed in
[#2391](https://github.com/pyreon/pyreon/pull/2391) (GC, yield, repeat until
the counter stops moving; see the still-accurate mechanism below). That fix
produced the "2nd among frameworks" claim this section is now retracting: a
second, separate bug let five implementations' `String(row.id)` calls grow a
shared V8 engine cache (`smi_string_cache`) that the metric attributed to the
framework rather than the engine. React/Vue/Svelte/Octane still carry the
same ~63KB artifact from their own row-id text paths — a fixed cost every
text-id implementation pays, not framework retention.

Heap-snapshot attribution still refutes the original cause this page used to
give ("tracks code-space/bundle size"): Pyreon's `code` space is **579KB vs
Preact's 596KB** — Pyreon ships *less* code — and the JS-only object graphs
are near-identical (1.50 vs 1.46MB). The gap was never bundle size, and the
GC-timing mechanism below is unaffected by this correction — only the
ranking claim ("2nd") is retracted.

Honest residual: Pyreon uniquely defers ~0.67MB of reclamation by one
event-loop turn. In any real app that memory returns on the next turn — a
latency, not a leak — but it is a real difference from Preact/Solid, and the
mechanism is not yet explained. **Beating Vanilla is structurally
impossible for a framework**; the honest target was always Preact/Solid, a
tie Pyreon now genuinely holds rather than beats.

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
| 10 | **★ 1.99µs** | 10.09µs | 3.16µs | 2.76µs |
| 100 | **★ 15.56µs** | 60.67µs | 16.63µs | 18.56µs |
| 1000 | **★ 137.9µs** | 628.8µs | 🤝 140.6µs | 175.2µs |

(median µs/render, 3 processes pooled per cell, CI95, randomized cell order,
8 rotated datasets, correctness-gated. `🤝` = CI95 overlaps the fastest, i.e.
a tie the numbers cannot separate.)

Honest reading: **Pyreon is the fastest of the five at 10 and 100 rows** —
outright, with CI95 clear of Vue — and **ties Vue at 1000 rows** (137.9 vs
140.6µs, CI95 overlapping: a tie, not a win). It leads React 4.6–5.1× and
Svelte 1.25–1.4× at every size. What got it here: each `<For>` row and
`.map` item now compiles to one fused string concat (Vue's shape) instead of
a per-item call + per-hole dispatch walk — worth ~29% at 1000 rows and
turning a prior ~1.24× Vue deficit into a tie.

The remaining 1000-row profile is now dominated by the same irreducible
`escapeHtml` work Vue spends its time on, plus one honest architectural cost
Vue does not pay: Pyreon emits a per-row `<!--k:KEY-->` hydration-key marker
(~8% of self time at 1000 rows). That is a feature, not slack.

A second, runtime-tree variant (`bun run bench:ssr-cross`) compares
`renderToString` implementations on the same logical VNode/element tree
without each framework's template compiler — useful for isolating renderer
overhead from compiler wins.

Reproduce: `cd examples/benchmark && bun bench:ssr`

## Real-app TodoMVC

A complete TodoMVC (store + list + filters + edits) driven headlessly
against real `react-dom@19`: **~5.7–16× faster** per interaction. µs-scale
and high-variance by nature — the magnitude, not the exact ratio, is the
signal (disclosed in the suite).

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
- **`miss → catch-all` flipped to an outright Pyreon win** (first-char
  fail-fast mask: ★25–27ns vs find-my-way's 41–47 — the first-character
  fail a radix tree gets for free, now table-driven).
- **Losses, disclosed:** find-my-way/radix3 still edge the param-heavier
  rows (dynamic-2/nested-dynamic ~1.1×; splat ~1.35× find-my-way) — while
  returning less than Pyreon's `ResolvedRoute` (params + parsed query +
  merged meta + matched chain); the splat residual is quantified as that
  richer return envelope.

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
| `@pyreon/store` | Zustand / Jotai | Wins the per-field hot path (dispatch ~6.5×, write→1-subscriber ~2.4×, no-sub patch ~1.7×); 🤝 ties read. **Loses `setup` ~12.6×** (per-field signals, paid once per store id — documented trade-off). The former with-subscriber `patch` ~1.7× loss flipped to a **~1.2× win** (sole-subscriber detector suspension + cached detach closure). |
| `@pyreon/validate` | Zod / Valibot / ArkType | **Fastest or CI-tied on all 12 rows** of the megamorphic multi-schema suite (flat-object 1.46×, arrays 1.37×, scalar-int 2.4×, DU 1.89× over ArkType; error path 20–53× over ArkType, 33–44× over Zod). The former last loss — bare scalar-string valid vs Valibot's minimal pipe — closed to a 🤝 CI-tie (8.8 vs 8.0ns) by the pure-JIT reused-ctx seam; the monomorphic scalar losses flipped in the same pass. |
| `@pyreon/query` | @tanstack/react-query | Same query-core underneath. Intra-component data change: **1 field derivation + 0 re-renders vs 8 + 1 re-render**; ~4× faster data-flip→DOM. Cross-component tracked-props: 🤝 tie. Mount: 🤝 tie. |
| `@pyreon/table` | @tanstack/react-table | Same table-core. Single-cell edit **7–9× faster than naive react-table**, ~1.1× vs hand-memoized — with zero `React.memo` boilerplate. **Losses:** mount ~2× and replace ~1.1–1.3× (per-cell reactive-binding setup — the price of the update wins), sort ~2× vs memo-row. |
| `@pyreon/virtual` | @tanstack/react-virtual | Same virtual-core. Steady-state scroll **1.3× faster**; row-recycle counts tied with memoized React. **Loss:** fixed-size mount ~1.1× slower (one-time ~16µs on a 10k list). |
| `@pyreon/storage` | jotai / zustand persist | Wins every op vs jotai; wins read + write vs zustand (write 12×, write→sub 9×), 🤝 ties create. |
| `@pyreon/url-state` | nuqs-style parsing | Wins or CI-ties every row after parser-class matching (float vs int-scan disclosed). |
| `@pyreon/i18n` | i18next | Faster on every measured op (plural path memoized per locale). |
| `@pyreon/machine` | XState | Large constant-factor wins on common ops — XState buys statechart features Pyreon deliberately offloads to signals. |
| `@pyreon/state-tree` | MobX-State-Tree | Faster on the action/patch/reactive hot path. |
| `@pyreon/toast` | react-hot-toast / sonner | Mounted DOM-commit path **21–40× faster than react-hot-toast**. Cold-start ingest: sonner leads ~2× (smaller code path; labeled cold-start by construction — sonner can't be warmed cross-lib). |
| `@pyreon/form` | @tanstack/form-core | Store-primitive tier (disclosed: not the full keystroke→paint path): update-field **~94× faster** (40ns vs 3.8µs), reset ~7.6×, read-all ~2.4×; setup 🤝 tied. |
| `@pyreon/permissions` | CASL | Exact allow/deny ~4.5×, wildcard/broad-grant ~19×, multi-check ~3.7× faster — correctness-gated (both systems agree on every check); the two permission MODELS differ (flat keys + predicates vs ability rules), disclosed in the bench header. |
| `@pyreon/hotkeys` | tinykeys / hotkeys-js / mousetrap | Dispatch hit 120ns (fastest; tinykeys 743, mousetrap 213), miss 72ns (🤝 with mousetrap's 83 — and Pyreon runs a scope + input-focus filter per event that tinykeys/mousetrap don't), register+teardown fastest. |
| `@pyreon/rx` | chained per-op computeds | `pipe()` collapses an N-step chain into ONE computed — exactly N× fewer nodes and recomputes per change (a structural win, measured per-N in the bench). |
| `@pyreon/rich-text` | @tiptap/react | Wrapper glue **1.5KB vs 8.5KB gz** (both lazy-load the same TipTap engine); content computeds don't re-run on pure cursor moves (split doc/selection version counters). |
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
- **Sync (CRDT)** (`bun run bench:sync`) — synced-signal throughput sanity
  over the Yjs engine seam.
- **Document renderers** (`bun run bench:document`) — the 18-primitive /
  20-format render matrix.
- **Loom workspace scan** (`bun run bench:loom`) — phase timings for a real
  `loom scan` (walk / graph / import scan / detectors) over an actual
  monorepo. ~98% of a scan is the import phase, so the phase split is the
  point; a total alone invites optimizing the other 2%. Warm-cache, median of
  N, with a correctness gate that refuses to print timings for a scan that
  found nothing.
- **Hooks wrapper tax** (`@pyreon/hooks` bench) — hook wrappers vs raw
  signals (the deltas mirror the reactivity standings above).
- **Compiler rocketstyle collapse** — the opt-in build-time collapse
  measures 44× on eligible literal-prop mounts (styler resolves 22 → 0).
- **Perf counters + leak sweep** — 66 named dev-mode counters
  (`@pyreon/perf-harness`) and a nightly heap-slope leak sweep gate the
  memory story continuously.

## What we don't win (the standing list)

Honesty section, kept current: retained memory ties Preact (3rd of 8, corrected 2026-08-18 — an earlier pass had this as "2nd among frameworks," which a second harness bug made wrong; see the flagship section above) — it is no longer a standing loss, though Pyreon still defers ~0.67MB by one event-loop turn;
SSR at 1000 rows is a **tie** with Vue (CI95 overlapping) rather than a win —
Pyreon leads outright only at 10 and 100 rows; Preact
leads computed chain (~1.25×) and signal create (~1.4×) — both structurally
priced (chain by the eager-push model whose lazy-pull alternative costs
retained heap; create by the callable-signal API itself, a closure per
signal vs Preact's class instance) — with diamond now a near-tie; find-my-way
keeps router splat (~1.35×, the richer ResolvedRoute envelope; catch-all
flipped to a Pyreon win); store `setup` favors Zustand's single-object
contract; table/virtual/charts pay a mount premium for their fine-grained
update wins. Each of these is either actively being closed or is a priced,
documented trade-off — never hidden.
