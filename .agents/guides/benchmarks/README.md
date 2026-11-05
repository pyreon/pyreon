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
| mount deep tree (2,047 components) | Solid | **1.14–1.16× behind (3.57–3.59 vs 3.09–3.12 ms, 2026-11)** — clearest loss |
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

1. Deep component-tree mount — 1.14–1.16× behind Solid.
2. Signal creation (~5× vs Preact on both engines); deep computed chains, computed diamond, and (V8) wide fan-out.
3. Large-page SSR — Vue compiled SSR 1.06–1.09× faster.
4. dbmon — Svelte leads.
5. Bundle size.
6. Flow mount — React Flow 1.20× faster.
7. Store setup, hotkeys register/teardown, http client creation, url-state integer parse, form store setup, rx per-op overhead, table mount/sort (happy-dom), router at 10 routes.
8. Unbundled Node — importing `lib/` without a bundler pays ~145 ns per `process.env.NODE_ENV` read on dev-gated hot paths.

### Charts vs ECharts 6 (not in `BENCHMARKS.md`)

`bun run bench:charts` in `examples/benchmark`: real Chromium, production build, 800×400 canvas line chart. Arms: `PlotChart` and tree-shaken ECharts 6. Animation off, ECharts `showSymbol` off, no decimation. The timed region ends with a 1×1 `getImageData` to force rasterization. Per-iteration pixel gates fail a no-op arm. Measured at load ~12 → 9.7 — treat the absolutes as noisy; two earlier runs gave the same ordering with ratios within ±0.15×.

| op (ms, median) | PlotChart | ECharts 6 | PlotChart, no a11y table (diagnostic) |
| --- | --- | --- | --- |
| mount 1k | 10.36 | **4.54** | 1.45 |
| mount 100k | **28.23** | 46.47 | 19.34 |
| update 100k (every value) | **20.20** | 32.78 | 15.79 |
| update 1k (one value) | **1.63** | 2.14 | 0.69 |

- Pyreon wins three of four ops (100k update 1.6–2.3×, 100k mount 1.40–1.65×, 1k update 1.31–1.49×).
- Pyreon loses the 1k mount (2.28×). The whole loss is the default offscreen accessible data table; the chart alone mounts 3.1× faster than ECharts, which ships no table (`aria` off by default). Say "with the accessible table Pyreon renders by default" whenever quoting it. `accessibleTable={false}` removes it at an accessibility cost.
- The table is built in 50-row `<tbody>` blocks (the chunking is what saves time). `content-visibility:auto` on the table's wrapper would skip ~5 ms of layout but drops every row from the accessibility tree — rejected; `packages/fundamentals/charts/src/engine/a11y-table-chunks.browser.test.tsx` fails on that change. The table is deliberately not deferred to idle time; that would move work out of the timed region, not off the main thread.
- Category labels are sampled like ECharts' `calculateCategoryInterval` rather than measured per label (`large-series.test.ts`).
- Size (`bench:charts-bundle`, gzip, beyond the Pyreon runtime): line 40.9 KB vs ECharts tree-shaken 155.9 KB / whole 361.1 KB; pie 18.1 vs 117.3 KB. `PlotChart` does not tree-shake per cartesian mark.

## Measurement protocol

### DOM suites (`examples/benchmark`)

- One Pyreon entry: the idiomatic JSX users ship (`src/impl/pyreon.tsx`). No hand-tuned "compiled" tier — the compiler already emits `_tpl()` + fine-grained bindings.
- Per-framework page isolation (`page.goto('?framework=X')`), forced GC between iterations, adaptive warmup, 20 timed runs, median + 95% bootstrap CI + CV, `🤝` on CI overlap.
- Production `vite build`, real published competitor deps, seeded RNG, DOM verification every iteration (gates read the table back, not just a row count).
- Tightest commit per framework (`flushSync` / microtask / synchronous — never an `rAF` wait inside the timed window). Per-run resets on every op. Randomized, per-pass-reshuffled order.
- Cross-origin isolated pages (`examples/benchmark/vite.config.ts` sets COOP/COEP) give a 5 µs `performance.now()` quantum instead of Chromium's 100 µs clamp. `bench-fair` prints `crossOriginIsolated=` and the quantum; confirm it before trusting sub-millisecond rows.
- `--wait-quiet [maxLoad]` re-checks machine load before every framework and pass. Run benches strictly one at a time, never concurrently, and stamp load before and after every run.
- Async verify callbacks are awaited, outside the timed region (`src/runner.ts`); a verifier that is not awaited cannot fail a no-op arm.
- The bimodality guard (`examples/benchmark/bimodality-guard.ts`) flags cells whose samples split between two timing modes.
- Retained heap is read post-GC with `--enable-precise-memory-info`. `STABLE_DELTA` (16 KB) in `bench-fair.ts` is a GC-convergence threshold, not the metric's resolution.
- Standard run: `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 6`. Also `bench-scenarios.ts`, `bench-hydration.ts`, `bench-apppage.ts`, `bench-ssr.ts`, `bench-crossover.ts`.

### Fairness rules for competitor arms

- Every arm builds row data with the same helper, outside the timed window.
- Use each framework's real compiled output: Vue compiled templates (not hand-written `h()`, which disables patch flags), Solid byte-for-byte as `babel-preset-solid` emits (getter props, `_tmpl$()` clones, `_$insert`), React/Preact through the automatic `jsx()` runtime, Svelte 5 with per-row `$state`, Vanilla cloning a `<template>` row.
- When an arm is hand-written "at compiler-output level", compile the snippet through the real toolchain and diff the emit. Do not reason about what the compiler probably does.
- Competitors run on their documented optimizations: in the context scenario React/Preact build the tree once and pass it as reference-stable `children`, so only the consumers re-render (`src/impl/scenario-tree.ts`).
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
- **`table-layout: auto`.** Any op that widens a cell re-measures column widths across the whole table. It inflated `partial update` margins (disproportionately for Solid) and caused append bimodality. The fixture uses `table-layout: fixed` for every arm (`.bench-fixture table` in `examples/benchmark/index.html`) — less representative of real apps, deliberately.
- **Timer resolution.** Without cross-origin isolation, Chromium clamps `performance.now()` to 100 µs, so a sub-millisecond sample is a multiple of one tick. A zero-width CI with a huge CV is the signature of samples bouncing between adjacent quanta. Use the isolated 5 µs clock, or batch K ops per window (`bench:crossover`), before publishing any select/clear ratio.
- **Sampling attribution is not wall clock.** A CDP profile's per-function total is attribution. Check it against the op's measured wall time before quoting it (`bench-createprofile.ts` output once understated create-10k framework JS ~6×). Use a subtree-attributed profile rooted at the timed call: a flat self-time view also pools the untimed per-iteration reset, whose cost tracks SSR payload size.
- **V8 inlining double-counts.** An inlined callee's self time also appears in its caller's frame. Read profile frames as a tree; one cost can appear as two "independent floors".
- **Minified builds strip function names.** Attribution keyed on `Function.name` silently reads `0.0µs`. The attribution drivers refuse to report an empty attribution; keep that behaviour in any new driver.
- **Model checks under load.** A decomposition's sum-of-rungs check taken on a loaded box can look precise and be noise. Re-take it on a quiet box.
- **A plausible causal story is a hypothesis.** Measure it before changing the harness (a "residue from the previous op" theory for append bimodality was the opposite of what measurement showed).
- **Engine-internal caches in heap metrics.** V8's `smi_string_cache` grows when an arm stringifies many distinct integers in JS (`String(row.id)`) and is charged to whichever arm did it. Every arm renders the raw `row.id`. Bucket a heap snapshot by constructor and check GC-root-held entries (`bench-heapdiff.ts`) before attributing a heap delta to a framework. Node saturates this cache at startup, so only a fresh browser page shows it.
- **Competitor handicaps.** A non-idiomatic competitor shape (Octane's `{String(row.id)}` disabling its `forBlock` fast path, an `rAF` idle wait inside React's window, a Solid arm skipping getter props) silently inflates Pyreon's lead.
- **Dependency bumps move the board.** A competitor version bump can flip a verdict (Octane 0.2.x/0.4.x changed several ops). Attribute a change to Pyreon only after splitting "Pyreon moved" from "competitor moved".
- **Noisy load hides gaps.** A wide CI at high load can make a real gap look like a tie. Check CI width before publishing a tie; re-run on a quiet machine, and publish a verdict on a close op only after two runs agree.

## Standing findings not in `BENCHMARKS.md`

### Deep-tree mount

- The gap to Solid is per-component framework JS plus GC, not element creation.
- The ablation ladder (`examples/benchmark/bench-treeladder.ts` + `src/impl/profile-tree.tsx`) attributes the Pyreon-over-Solid gap to getter child props, and specifically to the O(depth) getter chain read three times per node. Solid pays the same class of cost (its eager-props diagnostic arm sits well below its real arm). Emitting getters directly instead of `_rp` + `makeReactiveProps` was measured and does not help; hand-written getters were slower than the shipped pipeline. `probe-getter-chain.ts` measures the chain in isolation.
- Component instantiation (`mountComponent` / `runWithHooks` / scope / owner) is cheap on the ladder.
- **Shipped 2026-11: null-prototype props.** Profiling with `TL_JSFLAGS=--no-turbo-inlining` (the inlined profile hides it inside `mountComponent`) showed `makeReactiveProps` at ~165 µs on-CPU: each `defineProperty` of a per-instance getter on a `{}` built a fresh V8 hidden class. A null-prototype result halves that; board 3.70–3.72 → 3.57–3.59 ms (two runs, interleaved `Pyreon (old props)` arm, disjoint CIs), Solid 3.09–3.12, so the gap went 1.19–1.20× → 1.14–1.16×. No change on effects/table/flow/memo (A/B, two rounds), row board, or retained heap.
- **Context leaf, measured 2026-11 (ladder arms I and J).** `useContext` lookup alone (J − C) is 40–80 µs on-CPU, noisy, ~20 µs self in a no-inline profile; not worth a semantic change to the owner walk. The wrapper-vs-signal cost (A − I, the provider handing `() => sig()` instead of `sig`) is 30–50 µs: a signal reaches `_bindText`'s direct tier, an arrow cannot. That is an idiom difference, not a framework lever — and the board's Pyreon arm passes a wrapper while its Solid arm passes the signal, an asymmetry that slightly handicaps Pyreon (left unchanged; see `bench-gaps` notes). Solid's leaf skips a text node for the empty initial value, but sets `textContent` for a non-empty one at the same on-CPU cost, so that is not a fairness issue.
- Insertion counts are equal (2,048 `insertBefore` vs Solid's 2,046 + 2 `appendChild`, no comment nodes); the ~40 µs `insertBefore` difference is not a structural lever. #4115's direct-insert change touches `<For>` only and does not reach this op.
- No single lever is left on this op. Measure any props-pipeline simplification on the ladder before proposing it.
- Refuted (2026-11), do not re-propose: moving runtime-dom / core mount-path module `let`s onto `const` holder objects — the lever that won −21% to −32% in `@pyreon/reactivity` (#4124). Converted `_elementDepth`/`_svgDepth`/`_mathmlDepth` (mount.ts), every `_tpl` frame field (`_freshBind`, `_tplAdopt*`, `_hydrationActive`, hole/slot hydrators), `bulkDetachParent`/`rowCollector`/`_pendingForAdoption` (nodes.ts), the verifier plan cache, and core's lifecycle `_current` + Suspense `_hydrating`. Two production builds, arms interleaved per page load with an in-run competitor control, load < 4, ms median [CI95], main → holders: deep-tree mount 3.732 [3.715–3.755] → 3.735 [3.710–3.753] (rerun 3.695 → 3.700); context → 1,024 consumers 1.877 → 1.883 (a first run's 1.850 → 1.800 did not reproduce); hydration walk 1.155 [1.135–1.180] → 1.170 [1.155–1.185], total 5.985 → 5.980; app page 3.950 [3.922–3.980] → 3.980 [3.963–3.995]; row list create 1k 7.237 → 7.233, create 10k 72.87 → 72.55, replace 7.09 → 7.15, partial 0.718 → 0.697 (overlapping), swap / remove / clear / append all tied. The reactivity win came from accesses inside functions that run in 5–30 ns; here each access (~0.2 ns of context load + hole check) sits in per-row / per-component work of ~1 µs dominated by DOM calls, a ceiling of roughly 0.1–0.3% — below every board's CI.
- `templatizeComponentChildren` is default-on in `@pyreon/vite-plugin`. The opt-in `tpl append` / `tpl slot` template variants in the scenario suite are reported in `BENCHMARKS.md` §2.

### Create/replace gap vs Vanilla

- Roughly half framework JS, half extra layout caused by Pyreon's own output DOM. The layout half may be addressable by emitting different per-row DOM; which differences matter is unverified.
- No single cliff: the JS splits across the `<For>` reconciler + `_tpl` clone, per-row `_bindText` + disposer, and selector subscribe + `_setClass` + cleanup wrapper.
- The `class=""` presence write on unselected rows is a documented contract (`[class]` selectors, SSR/hydration parity); it is not removed for speed.
- Refuted levers, do not re-propose: flattened `ForEntry`, deferred keyed Map, pooled cleanup closure. Lazy per-row signals are capped at ~0.7% of the op (`signal()` costs ~58 ns/row).
- Shipped (2026-11): `<For>` mounts fresh / replaced / contiguously inserted rows straight into the live parent instead of staging them in a `DocumentFragment` (every row was parented twice). In-run A/B, same build, arms interleaved per sample: 1k create JS 0.99 → 0.905 ms, replace 1.56 → 1.43 ms; 10k create 10.47 → 9.50 ms; layout unchanged. On the board it took create 10,000 rows from a tie to outright (73.1 [72.2–73.4] ms vs Vue Vapor RC 74.2 [73.8–74.7]); create 1,000 and replace are still CI-tied with Vue 3 / Vapor. With a subtree `MutationObserver` on `<body>` (one record per row instead of one per fragment) the JS half still came out ahead and totals were tied.
- Addressable ceiling (`scripts/bench/dom-micro.ts`): the JS any framework controls is ~7% of create-10k; ~93% is browser insert + layout. Treat a create-op change under ~0.5% as noise.

### Swap rows

- Refuted (2026-11), do not re-propose: reusing `<For>`'s per-update scratch on the swap path (double-buffered `newKeys`, a reused `diffs` buffer, a linear scan in place of `new Set(diffs)` in `smallKPlace`). In-run A/B as two arms of one build: `bench-crossover` batch cycle at 1,000 rows, K target 10/20/40/80/160 ms — before 850/888/961/921/898 µs, after 854/851/954/929/903 µs (CIs overlap at every K but 20 ms); fair-bench swap 805 [800–810] vs 795 [780–805] µs. The K-dependence is not Pyreon allocation: Octane moved the same way in the same run (882/873/908/927/924 µs).
- Vue Vapor RC led swap outright in two runs (745 vs Pyreon 805 µs). Its DOM ops for this op are the same as Pyreon's (two `insertBefore`, back row first; `planMoves` keeps rows 2–997 as the LIS), and a scratch probe found no swap-cost difference from `class=""` on every row or from the `<For>` comment markers. The lead is unexplained; it needs a CDP profile of the swap op, which no driver does yet.

### Clear rows

- The per-row signal-binding teardown is ~1% of the clear path. `replaceChildren` (native DOM, paid by Vanilla too) dominates.
- `createSelector` keeps its per-key registry behind holders so unsubscribing writes one field and touches no map; reclamation happens on insert, not during a teardown burst (`packages/core/reactivity/src/createSelector.ts`, `boundSubs`).
- Bulk clear uses an in-place `replaceChildren(...)`. A `cloneNode(false)` + `replaceChild` parent swap is faster on-CPU but replaces the parent element and drops its delegated handlers, refs, and listeners — a correctness bug, not a lever. `textContent = ''` and detach-clear-reinsert measured no better.

### Dispose-500 (effect list)

- Now a CI tie with Solid. Two changes got it there: a second inline tracking-subscriber slot before promoting to a `Set` (plus `deps.pop()` in the effect/`_bind` disposers), and `mountChildAsUnit` for static (non-accessor) slot values, so rows inside a cloned container get effect-only cleanups instead of 500 individual DOM removals. An accessor slot keeps the full remover because it must clear its own range.
- `bench-disposeprofile.ts` is on-CPU attribution; only the scenario board's wall-clock CI is a published verdict. Give the ladder an arm with the board's exact shape, or it can miss the lever the board needs.

### Table mount (Chromium, 1,000 rows × 6 cols)

- Driver: `examples/benchmark/bench-tableprofile.ts` (`?profileTable=1`).
  - `split` mode interleaves Pyreon and react-table mounts and times the mount's JS and its forced layout separately.
  - `profile` mode gives subtree CPU attribution under `__mountOnly`.
- **Layout is identical across arms** (~15 ms of the ~25 ms op). The whole gap is JS.
- **The gap was `<For>` fragment staging.** The DOM-op census on main:
  - Pyreon: 6,000 `td → DocumentFragment` inserts, 1,000 `fragment → tr`, 1,000 `tr → fragment`, and 2,000 inner-`<For>` marker comments.
  - react-table: 13,000 plain `appendChild` into detached nodes.
  - Pyreon's `insertBefore` was 3.1 ms self time against react-table's `appendChild` at 1.0 ms.
- **PR #4115 closes it** (`<For>` mounts new rows straight into the live parent, which here is the detached `<tr>`).
  - Cross-build interleaved JS: 12.02 [11.90–12.27] → 10.17 [10.10–10.23] ms. The react-table arm, identical in both builds, moved 10.27 → 10.08, so the drift between the two builds is about 0.2 ms.
  - Same build: Pyreon JS 10.36 [9.99–10.67] vs react-table 11.73 [11.54–11.83] ms.
  - Board (`bench-scenarios --scenario table --repeat 3`): main 27.89 [27.69–28.39] vs react-table 25.80 (1.08×); #4115 25.50 [25.24–25.79] vs 25.46 (tie). Mount is then layout-bound like every other create op.
- Remaining Pyreon-only JS: two `<For>` markers per row (2,000 `createComment` + inserts), plus the keyed-map duplicate check (`warnForKeyIn`, a `Map.has` per key, ~0.45 ms over 7,000 string keys). Neither is a lever on a layout-bound op.

### Charts row-object ingestion

- `resolveAccessor` (`packages/fundamentals/charts/src/engine/marks.ts`) grew its output with `push` despite #3912's comment and changeset saying it was presized. Presizing it took a fresh-page 1M line mount from 14.06 to 10.39 ms (interleaved, disjoint), which ties the columnar arm (PR #4117).
- On the charts-libs board the 1M cell runs after the smaller cells and moved only 16.55 → 15.65 ms, with overlapping CIs. Chart.js with decimation still leads there (1.22×).
- The remaining row cost on that warmed page is the million accessor calls and object reads (~8 ms of attribution with `--history`). Part of it was V8 calling the accessor out of line; that part is fixed (next bullet). The rest needs the columnar API, which remains the large-data path.
- `v - v === 0` versus `Number.isFinite` in that loop makes no difference (ablated).
- **Why the board's row arm stayed slow (2026-11):** the board forces a GC before every sample, and that GC collects the previous chart's accessor. V8 clears call feedback that points at a dead closure. When V8 compiled `resolveAccessor` at its next entry, it saw that empty feedback and called the accessor out of line for every row, permanently: the inlining trace showed no inlined accessor and no later deopt.
  - **Fix:** for at least 300,000 rows the loop runs in `fillAccessor`, entered for row 0 and then for the rest, so the compile sees the live accessor.
  - **Why shorter series keep the single loop:** code that inlines a closure is discarded when that closure is collected, so the split loop restarts from the interpreter after every GC. That costs more than out-of-line calls below about 300k rows. With the split at every length, the charts-vs-ECharts 100k mount measured 4.32 [4.28–4.37] → 4.48 [4.46–4.53] ms.
  - **In-loop resolve time**, split vs single loop: 100k worse, 200k about the same, 300k tied, 500k 3.10 → 2.50 ms, 1M 5.30 → 3.75 ms.
  - **charts-libs board** (6 passes, both arms interleaved in one build): 1M mount 15.52 [15.04–16.44] → 13.77 [13.05–14.83] ms (disjoint). Chart.js was 12.89 [12.84–12.95] ms, so the gap narrowed to 1.07× but did not close. 100k update 2.66 → 2.34 ms and 10k update 1.15 → 1.08 ms (both disjoint). Every other charts-libs and charts-vs-ECharts cell tied.
- Refuted or not worth it (2026-11), do not re-propose: keeping the last accessor alive in a module slot so the call site goes closure-agnostic. It fixed a blank-page micro (5.2 → 3.2 ms) but did nothing in the real mount (5.18 vs 5.28 ms), and it retains user data. Pinning `yDomain` to skip the extent pass is worth only ~0.4 ms at 1M (CIs overlap), not a native engine type change.
- The 10k mount gap to uPlot is NOT ingestion: the columnar arm loses by the same amount (1.91 vs uPlot 1.44 ms), and `density: 'device'` closes it. It is the default `'fine'` M4 density drawing about twice uPlot's points, which is a product choice.
- Open candidate, measured once and not shipped: in `m4CategoryPoints`, compute a point's y only when its raw value passes the column's current min or max. This is exact, because y is monotone in the value (fuzz: 0 mismatches in 3,000 cases). Results: V8 micro 2.37 → 1.83 ms at 1M; board update 100k columns 1.44 → 1.23 ms and rows 1.95 → 1.83 ms (both disjoint); 1M columns mount 9.94 → 8.42 ms (overlapping). It needs the native engine regenerated (`decimate-values.ts` crosses).

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
| Row list: swap diagnosis (layout-bound, identical DOM ops, the Vapor lead is per-page-load variance) and the create-1k residual after direct insertion | `.agents/guides/benchmarks/references/row-list-swap-and-create-residual.md` |
