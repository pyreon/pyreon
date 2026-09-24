# Pyreon Benchmark Standings and Measurement Protocol

Read this before making, changing, or reviewing any performance claim.

**The repo root `BENCHMARKS.md` is the authoritative published record.** It holds the latest full run (every suite, every competitor at npm latest, after a harness-objectivity audit). This guide defers to it: quote every per-op figure from `BENCHMARKS.md`, and where anything below disagrees with it, `BENCHMARKS.md` wins. This guide adds the protocol, the known measurement traps, and findings `BENCHMARKS.md` does not cover.

Per-library micro-benchmark detail (router, reactivity, store, http, SSR harness, declined micro-optimizations) is in `.agents/guides/benchmarks/references/core-micro-benchmarks.md`.

## Current standings (summary of `BENCHMARKS.md`)

Absolute times are machine-dependent; ratios are the portable signal. 🤝 means the CI95s overlap ("could not distinguish"), not "equal".

### DOM row-list suite (`bench:fair`, 8 frameworks, real Chromium)

- **Pyreon outright:** create 1,000, replace all, clear rows (115 vs Octane 190 µs), create 10,000, append 1k→10k.
- **Tie:** Pyreon = Octane on partial update and swap rows; Solid = Octane = Pyreon on remove row.
- **No verdict:** select row (below 10 clock ticks — use the batch instrument, `bench:crossover`); `batch cycle` rows (only 4 of 8 implementations).
- **Vs hand-written Vanilla:** 1.03–1.10× on most ops, 1.19× swap, 1.21× clear.
- **Retained heap:** Pyreon ties Preact as the lightest framework (2.78 MB).
- Octane is the nearest rival. It is Octane 0.4.2; verdicts against earlier Octane versions are not comparable.

### Scaling (`bench:crossover`, 100 → 20,000 rows, batch-timed)

- **select** is O(1) for Pyreon and Octane (Pyreon ~1.85–1.95× faster at every size) and O(n) for Solid.
- **partial update:** Pyreon 1.08–1.13× faster than Octane; ~1.05–1.07× faster than Solid from 1,000 rows (tie at 100).
- **swap:** tie with Octane at 100 rows, Pyreon 1.03–1.18× faster from 1,000 up.
- Open instrument disagreement: Octane `select` at 10k/20k reads 50–60 µs on the per-op timer and ~0.9 µs on the batch instrument. The batch figure is used; the per-op one is unexplained.

### Scenario suite (`bench:scenarios`)

| scenario | leader | Pyreon |
| --- | --- | --- |
| dbmon tick (every value changes) | Svelte | 1.06× behind; whole field within 1.25× |
| mount deep tree (2,047 components) | Solid | **1.29× behind (4.20 vs 3.25 ms)** — clearest loss |
| context → 1,024 consumers | Pyreon | Solid 🤝 |
| effect list: update / dispose 500 | Solid | 🤝 on both |
| memo wall: blocked / passthrough | Pyreon | — |

**Flow — `@pyreon/flow` vs React Flow 12** (`bench:flow`, 500 nodes / 499 edges): React Flow wins mount (1.20×). Pyreon wins drag ×60 (7.4×), select (3.5×), pan+zoom ×60 (95×), unmount (3.5×). Add 50 nodes ties. Caveats:

- Neither arm synthesizes pointer events. The bench measures each library's update, not the gesture (hit testing, d3-drag).
- Both arms drive their public imperative API (`createFlow` + `updateNode`/`selectNode`/`addNode`/`viewport.set` vs `ReactFlowInstance` methods in `flushSync`) and verify the DOM effect every iteration.
- React Flow's mount excludes its deferred edge pass: it waits for ResizeObserver measurement before drawing edges, and the harness waits for those edges outside the timed region.
- Drag/pan ratios are mostly React Flow re-rendering node wrappers on every store write — its architecture.
- Not measured: rubber-band selection, edge reconnection, layout.

### Hydration and SSR

- **1,000-row table (`bench:hydration`):** Pyreon and Vue (compiled template) are statistically tied on both the total and the walk. React 1.08× behind on total, Preact 1.84×.
- **App-page shape (`bench:apppage`, 320 components, 2,206 nodes):** Pyreon leads (React 1.09×, Vue 1.18×, Preact 1.39×).
- **Compiled SSR (`bench:ssr` in `examples/benchmark`):** Pyreon leads at 10 rows; Vue leads at 100 and 1,000 rows (Pyreon 1.06× / 1.09× behind).
- **`renderToString` vs React/Preact/Solid (`bench:ssr-cross`):** Pyreon compiled leads every scenario (1.63–4.46× over Solid). The uncompiled `h()` walk is 5–6× slower than compiled.

### Other suites

- **TodoMVC shape vs `react-dom@19` (`real-bench`):** add-100 1.14×, toggle-1000 2.42×, clear-1000 4.24×.
- **Form (12 fields, 6 libraries):** Pyreon ties Solid modular-forms on mount; leads every other scenario; lowest retained heap.
- **Bundle (same keyed-table app):** Pyreon 16.6 KB vs Solid 7.5 KB, Preact 10.6 KB (Pyreon 2.22× Solid).
- **Reactivity core, fundamentals, router, head, styler, validate:** see `BENCHMARKS.md` §8–§11 and the reference file.

### Where Pyreon loses

Keep this list honest and current; it is `BENCHMARKS.md` §12:

1. Deep component-tree mount — 1.29× behind Solid.
2. Signal creation (~5× vs Preact on both engines); deep computed chains, computed diamond, and (V8) wide fan-out.
3. Large-page SSR — Vue compiled SSR 1.06–1.09× faster.
4. dbmon — Svelte leads.
5. Bundle size.
6. Flow mount — React Flow 1.20× faster.
7. Store setup, hotkeys register/teardown, http client creation, url-state integer parse, form store setup, rx per-op overhead, table mount/sort (happy-dom), router at 10 routes.
8. Unbundled Node — importing `lib/` without a bundler pays ~145 ns per `process.env.NODE_ENV` read on dev-gated hot paths.

### Charts vs ECharts 6 (not in `BENCHMARKS.md`)

`bun run bench:charts` in `examples/benchmark`: real Chromium, production build, 800×400 canvas line chart. Arms: `PlotChart`, `OptionChart` (the same ECharts option object), and tree-shaken ECharts 6. Animation off, ECharts `showSymbol` off, no decimation. The timed region ends with a 1×1 `getImageData` to force rasterization. Per-iteration pixel gates fail a no-op arm. Measured at load ~12 → 9.7 — treat the absolutes as noisy; two earlier runs gave the same ordering with ratios within ±0.15×.

| op (ms, median) | PlotChart | OptionChart | ECharts 6 | PlotChart, no a11y table (diagnostic) |
| --- | --- | --- | --- | --- |
| mount 1k | 10.36 | 10.54 | **4.54** | 1.45 |
| mount 100k | **28.23** | 33.10 (tie) | 46.47 | 19.34 |
| update 100k (every value) | 20.20 | **14.09** | 32.78 | 15.79 |
| update 1k (one value) | 1.63 | **1.43** | 2.14 | 0.69 |

- Pyreon wins three of four ops (100k update 1.6–2.3×, 100k mount 1.40–1.65×, 1k update 1.31–1.49×).
- Pyreon loses the 1k mount (2.28×). The whole loss is the default offscreen accessible data table; the chart alone mounts 3.1× faster than ECharts, which ships no table (`aria` off by default). Say "with the accessible table Pyreon renders by default" whenever quoting it. `accessibleTable={false}` removes it at an accessibility cost.
- The table is built in 50-row `<tbody>` blocks (the chunking is what saves time). `content-visibility:auto` on the table's wrapper would skip ~5 ms of layout but drops every row from the accessibility tree — rejected; `packages/fundamentals/charts/src/engine/a11y-table-chunks.browser.test.tsx` fails on that change. The table is deliberately not deferred to idle time; that would move work out of the timed region, not off the main thread.
- One plan per option change is enforced by a per-instance plan cache (`option-plan-memo.test.ts`). Category labels are sampled like ECharts' `calculateCategoryInterval` rather than measured per label (`large-series.test.ts`).
- Size (`bench:charts-bundle`, gzip, beyond the Pyreon runtime): line 40.9 KB vs ECharts tree-shaken 155.9 KB / whole 361.1 KB; pie 18.1 vs 117.3 KB. `OptionChart` is 128.9 KB. `PlotChart` does not tree-shake per cartesian mark.

## Measurement protocol

### DOM suites (`examples/benchmark`)

- One Pyreon entry: the idiomatic JSX users ship (`src/impl/pyreon.tsx`). No hand-tuned "compiled" tier — the compiler already emits `_tpl()` + fine-grained bindings.
- Per-framework page isolation (`page.goto('?framework=X')`), forced GC between iterations, adaptive warmup, 20 timed runs, median + 95% bootstrap CI + CV, `🤝` on CI overlap.
- Production `vite build`, real published competitor deps, seeded RNG, DOM verification every iteration (gates read the table back, not just a row count).
- Tightest commit per framework (`flushSync` / microtask / synchronous — never an `rAF` wait inside the timed window). Per-run resets on every op. Randomized, per-pass-reshuffled order.
- Cross-origin isolated pages (`examples/benchmark/vite.config.ts` sets COOP/COEP) give a 5 µs `performance.now()` quantum instead of Chromium's 100 µs clamp. `bench-fair` prints `crossOriginIsolated=` and the quantum; confirm it before trusting sub-millisecond rows.
- `--wait-quiet [maxLoad]` re-checks machine load before every framework and pass. Stamp load before and after every run.
- The bimodality guard (`examples/benchmark/bimodality-guard.ts`) flags cells whose samples split between two timing modes.
- Retained heap is read post-GC with `--enable-precise-memory-info`. `STABLE_DELTA` (16 KB) in `bench-fair.ts` is a GC-convergence threshold, not the metric's resolution.
- Standard run: `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 6`. Also `bench-scenarios.ts`, `bench-hydration.ts`, `bench-apppage.ts`, `bench-ssr.ts`, `bench-crossover.ts`.

### Fairness rules for competitor arms

- Every arm builds row data with the same helper, outside the timed window.
- Use each framework's real compiled output: Vue compiled templates (not hand-written `h()`, which disables patch flags), Solid byte-for-byte as `babel-preset-solid` emits (getter props, `_tmpl$()` clones, `_$insert`), React/Preact through the automatic `jsx()` runtime, Svelte 5 with per-row `$state`, Vanilla cloning a `<template>` row.
- When an arm is hand-written "at compiler-output level", compile the snippet through the real toolchain and diff the emit. Do not reason about what the compiler probably does.
- Per-framework idiomatic data modelling is deliberate: Pyreon and Solid allocate a per-row signal; plain-object frameworks re-render. Do not give Pyreon plain objects to shrink a gap. State the difference wherever it affects a number (it costs Pyreon ~95 µs in the hydration walk).
- Diagnostic arms (for example `SolidJS (eager props)`, the no-a11y-table chart arm) are excluded from ranking via `NON_RANKING` in `bench-scenarios.ts`.
- Audit a number with the same rigor whether it flatters Pyreon or not.

### Reporting rules

- Quote ratios with their CI verdict. A tie has no ordinal ("tied with Preact", never "2nd").
- For hydration, always say whether a figure is the **total** (walk + layout) or the **walk** (framework work).
- Never quote a dbmon result as a win for anyone: when every value changes each tick, the signal graph's skip-unchanged advantage is removed by construction and the field converges on the DOM-write floor.
- State the measurement, not a forecast. Do not call a competitor's advantage "architectural" or permanent — their code changes.
- Do not mark a gap "investigated and accepted" unless its cost attribution was independently re-profiled.

## Measurement traps

Each of these produced a wrong published figure at some point.

- **Layout-bound ops.** `bench()` in `examples/benchmark/src/runner.ts` times `fn()` plus a forced `getBoundingClientRect()` flush. On create/replace/remove/append, browser layout is most of the op and identical across frameworks, so wall clock cannot separate frameworks there. Append is ~90% layout, and all eight implementations emit byte-identical DOM — claim "end-to-end append cost including the layout it causes", never "the reconciler is N× faster".
- **Create measures a replace.** There is no reset between runs and row ids are monotonic, so 19 of 20 `create N rows` samples replace N live rows. That is why create and replace report near-identical medians.
- **Hydration total is ~80% layout.** The same forced flush makes layout ~80% of every hydration total and identical across frameworks; a small total ratio can hide a larger walk ratio. Report both.
- **`table-layout: auto`.** Any op that widens a cell re-measures column widths across the whole table. It inflated `partial update` margins (disproportionately for Solid) and caused append bimodality. The fixture uses `table-layout: fixed` for every arm (`examples/benchmark/src/main.ts`) — less representative of real apps, deliberately.
- **Timer resolution.** Without cross-origin isolation, Chromium clamps `performance.now()` to 100 µs, so a sub-millisecond sample is a multiple of one tick. A zero-width CI with a huge CV is the signature of samples bouncing between adjacent quanta. Use the isolated 5 µs clock, or batch K ops per window (`bench:crossover`), before publishing any select/clear ratio.
- **Sampling attribution is not wall clock.** A CDP profile's per-function total is attribution. Check it against the op's measured wall time before quoting it (`bench-createprofile.ts` output once understated create-10k framework JS ~6×).
- **V8 inlining double-counts.** An inlined callee's self time also appears in its caller's frame. Read profile frames as a tree; one cost can appear as two "independent floors".
- **Minified builds strip function names.** Attribution keyed on `Function.name` silently reads `0.0µs`. The attribution drivers refuse to report an empty attribution; keep that behaviour in any new driver.
- **Model checks under load.** A decomposition's sum-of-rungs check taken on a loaded box can look precise and be noise. Re-take it on a quiet box.
- **A plausible causal story is a hypothesis.** Measure it before changing the harness (a "residue from the previous op" theory for append bimodality was the opposite of what measurement showed).
- **Engine-internal caches in heap metrics.** V8's `smi_string_cache` grows when an arm stringifies many distinct integers in JS (`String(row.id)`) and is charged to whichever arm did it. Every arm renders the raw `row.id`. Bucket a heap snapshot by constructor and check GC-root-held entries (`bench-heapdiff.ts`) before attributing a heap delta to a framework. Node saturates this cache at startup, so only a fresh browser page shows it.
- **Competitor handicaps.** A non-idiomatic competitor shape (Octane's `{String(row.id)}` disabling its `forBlock` fast path, an `rAF` idle wait inside React's window, a Solid arm skipping getter props) silently inflates Pyreon's lead.
- **Dependency bumps move the board.** A competitor version bump can flip a verdict (Octane 0.2.x/0.4.x changed several ops). Attribute a change to Pyreon only after splitting "Pyreon moved" from "competitor moved".
- **Noisy load hides gaps.** A wide CI at high load can make a real gap look like a tie. Check CI width before publishing a tie; re-run on a quiet machine.

## Standing findings not in `BENCHMARKS.md`

### Deep-tree mount

- The gap to Solid is per-component framework JS plus GC, not element creation.
- The ablation ladder (`examples/benchmark/bench-treeladder.ts` + `src/impl/profile-tree.tsx`) attributes the Pyreon-over-Solid gap to getter child props, and specifically to the O(depth) getter chain read three times per node. Solid pays the same class of cost (its eager-props diagnostic arm sits well below its real arm). Emitting getters directly instead of `_rp` + `makeReactiveProps` was measured and does not help; hand-written getters were slower than the shipped pipeline. `probe-getter-chain.ts` measures the chain in isolation.
- Component instantiation (`mountComponent` / `runWithHooks` / scope / owner) is cheap on the ladder.
- No single lever is left on this op. Measure any props-pipeline simplification on the ladder before proposing it.
- `templatizeComponentChildren` is default-on in `@pyreon/vite-plugin`. The opt-in `tpl append` / `tpl slot` template variants in the scenario suite are reported in `BENCHMARKS.md` §2.

### Create/replace gap vs Vanilla

- Roughly half framework JS, half extra layout caused by Pyreon's own output DOM. The layout half may be addressable by emitting different per-row DOM; which differences matter is unverified.
- No single cliff: the JS splits across the `<For>` reconciler + `_tpl` clone, per-row `_bindText` + disposer, and selector subscribe + `_setClass` + cleanup wrapper.
- The `class=""` presence write on unselected rows is a documented contract (`[class]` selectors, SSR/hydration parity); it is not removed for speed.
- Refuted levers, do not re-propose: flattened `ForEntry`, deferred keyed Map, pooled cleanup closure. Lazy per-row signals are capped at ~0.7% of the op (`signal()` costs ~58 ns/row).
- Addressable ceiling (`scripts/bench/dom-micro.ts`): the JS any framework controls is ~7% of create-10k; ~93% is browser insert + layout. Treat a create-op change under ~0.5% as noise.

### Clear rows

- The per-row signal-binding teardown is ~1% of the clear path. `replaceChildren` (native DOM, paid by Vanilla too) dominates.
- `createSelector` keeps its per-key registry behind holders so unsubscribing writes one field and touches no map; reclamation happens on insert, not during a teardown burst (`packages/core/reactivity/src/createSelector.ts`, `boundSubs`).
- Bulk clear uses an in-place `replaceChildren(...)`. A `cloneNode(false)` + `replaceChild` parent swap is faster on-CPU but replaces the parent element and drops its delegated handlers, refs, and listeners — a correctness bug, not a lever. `textContent = ''` and detach-clear-reinsert measured no better.

### Dispose-500 (effect list)

- Now a CI tie with Solid. Two changes got it there: a second inline tracking-subscriber slot before promoting to a `Set` (plus `deps.pop()` in the effect/`_bind` disposers), and `mountChildAsUnit` for static (non-accessor) slot values, so rows inside a cloned container get effect-only cleanups instead of 500 individual DOM removals. An accessor slot keeps the full remover because it must clear its own range.
- `bench-disposeprofile.ts` is on-CPU attribution; only the scenario board's wall-clock CI is a published verdict. Give the ladder an arm with the board's exact shape, or it can miss the lever the board needs.

### Hydration

- The hydration fixture uses `<For>`, which is fully adopted on every framework (1,000/1,000). A keyed-list bench cannot measure template-adoption changes; use the app-page shape.
- Remaining Pyreon-side walk costs (`BENCH_PROFILE=1 bun bench-hydration-profile.ts --build`) are spread across `hydrateVNode`, the row-plan replay (`elByPath` + `replayAdoptPlan`), `_setChild`, per-row `signal`, and `_bindText`. No cliff. `bench-hydration-rowcost.ts` is the per-row cost ladder.
- Removing `$` markers wholesale is blocked: a non-uniform marker scheme regressed the SSR↔hydration parity fuzz (`packages/core/runtime-dom/src/tests/hydration-parity-fuzz.test.tsx`).
- Text fusion (`<p>Hello {name}!</p>` → one `_fuse(...)` child) does not affect the 1,000-row fixture (its rows are sole-child and already elide markers). It has no timing measurement yet.

## Honest limits

- **Author-judge.** Pyreon's authors wrote and judge every bench. The only independent venue is krausest/js-framework-benchmark; a keyed implementation is staged at `contrib/krausest/pyreon-keyed/` (submission steps in its `README-SUBMISSION.md`). Submitting is a human decision.
- **Synthetic.** No real-app head-to-head against real competing frameworks exists; the `cpa-pw-app-*` ports run on Pyreon compat shims. "Fastest" claims stop at what these suites measure.
- **CPU-objective, not async latency.** React's default scheduling path would read higher than its `flushSync` arm.
- **happy-dom rows** (query, virtual, table, toast, dnd, charts wrapper) time a JavaScript DOM implementation; relative work is meaningful, absolute times are not.
- **Not measured** (per `BENCHMARKS.md` §14): streaming SSR, portals, async waterfalls, startup metrics, krausest's per-op memory metrics, Firefox/Safari, independent third-party runs. Async waterfalls and portals were dropped as unfair to include (Svelte lacks Suspense and a built-in portal).

## Deeper detail

| Topic | File |
| --- | --- |
| Core micro-benchmarks: router, reactivity, head, store, state-tree, machine, i18n, permissions, form, query, http, SSR harness, `NODE_ENV` cost, declined micro-optimizations | `.agents/guides/benchmarks/references/core-micro-benchmarks.md` |
