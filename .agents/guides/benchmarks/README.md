# Pyreon Benchmark Standings and Measurement Protocol

Read this before making, changing, or reviewing any performance claim.

**The repo root `BENCHMARKS.md` is the authoritative published record.** It holds the latest full run (every suite, every competitor at npm latest, after a harness-objectivity audit). This guide defers to it: quote every per-op figure from `BENCHMARKS.md`, and where anything below disagrees with it, `BENCHMARKS.md` wins. This guide adds the protocol, the known measurement traps, and findings `BENCHMARKS.md` does not cover.

Per-library micro-benchmark detail (router, reactivity, store, http, SSR harness, declined micro-optimizations) is in `.agents/guides/benchmarks/references/core-micro-benchmarks.md`.

## Current standings (summary of `BENCHMARKS.md`: row board, core scenarios, `maplist` and bundle refreshed 2026-11-24; the rest from 2026-11-05)

Absolute times are machine-dependent; ratios are the portable signal. 🤝 means the CI95s overlap ("could not distinguish"), not "equal". A **win** needs disjoint CIs in every run measured; CIs are cluster-bootstrapped over page loads (`BENCHMARKS.md` §14). Every browser figure is one machine (Apple M3 Max), Chromium only, on author-written suites. The full per-op table is `BENCHMARKS.md` §12 and the collected losses are §13 — quote those, not this summary.

### DOM row-list suite (`bench:fair`, 10 arms, real Chromium 159; 2026-11-24, two runs)

- **Pyreon outright (both runs):** clear rows, 125 µs vs Octane / Vue 3.6 Vapor RC 140 µs (1.12×); select row on the batch-cycle row, 1.17 vs Octane 0.19 1.84 µs per cycle (1.58×).
- **Tie (both runs):** create 1,000, replace all, remove row, create 10,000, append 1k→10k — against Vapor RC, Octane 0.19 and Vue 3.
- **Split (not claimed either way):** partial update (🤝 / Pyreon 1.09×), swap rows (🤝 / Vapor 1.11×).
- **No verdict:** select row per op (below 10 clock quanta).
- **Vs Solid 1.9 and Solid 2.0 (2.0.3):** Pyreon faster on create 1k, replace, partial update, clear, create 10k and append in both runs; remove ties; swap splits.
- **Vs hand-written Vanilla:** 0.98–1.10× on every op except clear (1.32×).
- **Retained heap:** Preact 3.14 MB is the lightest framework; Pyreon 3.21 MB, level with Solid 1.9 (3.22–3.23).

### Scaling (`bench:crossover`, batch-timed, one run, 2026-11-05)

- **select:** Pyreon 1.86–2.04× faster than Octane 0.16 at every size.
- **partial update:** 1.05–1.12× vs Octane; tie with Solid at 1,000 rows.
- **swap:** Octane 1.12× / 1.10× at 100 / 1,000 rows (fails the harness's K-independence check); Pyreon 1.03–1.11× from 5,000 up.

### Elsewhere

- **Core scenarios (2026-11-24, two runs):** deep-tree mount **ties Solid 1.9** (Solid 2.0 1.09–1.11× and React 1.12–1.15× slower); context and effect-list update tie; effect-list dispose no verdict (below 10 quanta); memo wall blocked ties Solid 2.0, passthrough wins 1.07× vs Svelte. dbmon three-way tie (2026-11-05).
  - **Unequal fixture, re-measure pending:** the deep-tree mount and retained-heap figures, the Svelte rows of the deep tree, memo wall and `maplist`, were measured before the DOM-shape gate. The tree mounted with `''` (Pyreon, Preact and Vanilla rendered 1,024 empty text nodes; React, Vue and both Solids none) and three Svelte templates kept whitespace text nodes no other arm renders (1,023 in the tree, 2 in the memo wall, 1 in `maplist`). See "Cross-arm DOM-shape gate" below.
- **Retained heap of one 2,047-component tree (2026-11-24, two runs, no CI):** Pyreon 532 KB vs Solid 2.0 410 KB vs Solid 1.9 202–207 KB — a loss (measured on the `''` fixture; see the note above).
- **`maplist` (2026-11-24, two runs):** `<For>` loses clear 1.46–1.58× (Vue 3 / Solid 2.0), replace 1.05–1.06× and create 1.03×, ties the rest; the `.map()` arm loses create, replace, swap, remove and clear.
- **Library scenarios (2026-11-05):** flow, virtual and charts-vs-ECharts win every op (one run); charts-libs line mounts lose at 10k (uPlot) and 1M rows (Chart.js).
- **Hydration (2026-11-05):** 1,000-row table — walk tie with Vue, total tie / Vue 1.01×; app page — Pyreon 4.02 ms, React 1.03×, Preact 1.07×, Vue 1.11× (one run).
- **SSR (overnight run, one run):** compiled SSR leads at 10 / 100 / 1,000 rows (1.21× / 1.35× / 1.14×); `renderToString` 1.64–4.68× over Solid.
- **Bundle (same app, 2026-11-24):** Pyreon 18.5 KB vs Solid 7.7, Preact 10.1, Svelte 16.1 — a loss.

### Where Pyreon loses

Keep this list honest and current; it mirrors `BENCHMARKS.md` §13:

1. Memory per component — one mounted deep tree retains 1.30× Solid 2.0 and 2.6× Solid 1.9; on the row board Preact is lighter.
2. Keyed list with conditional slots (`maplist`) — `<For>` clear, replace and create; every row-moving op of a plain `.map()`.
3. Swap at 100 / 1,000 rows on the batch instrument (Octane, K-dependent); swap on the row board split (Vapor 1.11× in one run).
4. Charts line mounts at 10k (uPlot) and 1M rows (Chart.js) on row-object input.
5. Signal creation (~5× vs Preact Signals); deep unobserved chains; wide fan-out on V8.
6. Bundle size.
7. Router at 10 routes (Hono 1.91×); some validate-protocol cells; store setup and read; storage read; url-state integer parse; form-bench heap; table and virtual under happy-dom.
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
- Size (`bench:charts-bundle`, gzip, beyond the Pyreon runtime): line 40.3 KB vs ECharts tree-shaken 155.9 KB / whole 361.0 KB; pie 19.8 vs 117.2 KB (2026-11-19, 12.1 KB runtime baseline). `PlotChart` does not tree-shake per cartesian mark.

## Measurement protocol

### DOM suites (`examples/benchmark`)

- One Pyreon entry: the idiomatic JSX users ship (`src/impl/pyreon.tsx`). No hand-tuned "compiled" tier — the compiler already emits `_tpl()` + fine-grained bindings.
- Per-framework page isolation (`page.goto('?framework=X')`), forced GC between iterations, adaptive warmup, 20 timed runs per page-load, median + 95% CI + CV, `🤝` on CI overlap.
- The CI is a **cluster bootstrap** (`examples/benchmark/cluster-bootstrap.ts`): resample the page-loads (or processes) with replacement, then the samples within each. Samples from one page share its JIT and heap state, and page-to-page spread is large (per-page `swap rows` medians 620–860 µs for every arm, Vanilla included), so bootstrapping 5 × 20 pooled samples as 100 independent draws gave intervals several times too narrow. `bench-fair`, `bench-scenarios` and `table-bench` use it. With one page-load per arm (`--repeat 1`) the CI cannot contain page-load variance, and the harness flags the verdicts as provisional.
- In `bench-scenarios`, each ranked Pyreon arm is judged against the best ranked **non-Pyreon** arm, never against a sibling Pyreon variant that happens to lead.
- Production `vite build`, real published competitor deps, seeded RNG, DOM verification every iteration (gates read the table back, not just a row count).
- Tightest commit per framework (`flushSync` / microtask / synchronous — never an `rAF` wait inside the timed window). Per-run resets on every op. Randomized, per-pass-reshuffled order.
- Cross-origin isolated pages (`examples/benchmark/vite.config.ts` sets COOP/COEP) give a 5 µs `performance.now()` quantum instead of Chromium's 100 µs clamp. `bench-fair` prints `crossOriginIsolated=` and the quantum; confirm it before trusting sub-millisecond rows.
- `--wait-quiet [maxLoad]` re-checks machine load before every framework and pass. Run benches strictly one at a time, never concurrently, and stamp load before and after every run.
- Async verify callbacks are awaited, outside the timed region (`src/runner.ts`); a verifier that is not awaited cannot fail a no-op arm.
- The bimodality guard (`examples/benchmark/bimodality-guard.ts`) flags cells whose samples split between two timing modes.
- Retained heap is read post-GC with `--enable-precise-memory-info`. `STABLE_DELTA` (16 KB) in `bench-fair.ts` is a GC-convergence threshold, not the metric's resolution.
- Standard run: `cd examples/benchmark && bun bench-fair.ts --repeat 5 --wait-quiet 6`. Also `bench-scenarios.ts`, `bench-hydration.ts`, `bench-apppage.ts`, `bench-ssr.ts`, `bench-crossover.ts`.
- A scenario with an explicit pre-timing correctness gate (`maplist`, `router`) reports a failing op as `✗ NOT TIMED` rather than aborting the arm (`gateThenTime` in `src/impl/scenario-gated.ts`, `BenchSuite.gateFailures`); a failure during timing still aborts.
- **Cross-arm DOM-shape gate** (`examples/benchmark/dom-shape.ts`, `domGate` in `bench-scenarios.ts`; on for `dbmon`, `tree`, `effects`, `memo`, `maplist`). A per-arm verifier checks an arm against the scenario's model; it cannot see what the other arms built. After each op's FIRST iteration (a state every arm reaches deterministically) the page records the DOM below the scenario container: elements, content text nodes (non-empty, or empty and the only child of their element), empty content slots, anchor text nodes (empty with siblings), comments, a hash of the tag sequence, and the text's length and hash. The driver compares every arm (and every pass of one arm) per op on elements, content text nodes, empty slots, tag hash and text, prints each differing field with the arms on each side, and **exits 1**: a timing table over arms that built different DOMs compares different work. Comments and anchor text nodes are framework bookkeeping (Pyreon's `<For>` markers, Vue's fragment anchors, Svelte's `<!>` and block anchors) and are reported, not compared. Svelte 5 also keeps an empty `{#each}` anchor as a parent's only child, so for the arms in `EMPTY_TEXT_ANCHOR_ARMS` every empty text node counts as an anchor; an asymmetric empty value still fails through the other arms. Blind spot: an empty text node beside other nodes counts as an anchor, so fixtures must never render an empty value (the tree's mount verify reads every leaf's text).
- `bun bench-scenarios.ts --scenario <id> --gate-only` runs every arm's ops once (op, commit, verify, or one batch cycle with its probes), prints the per-arm DOM census and fails on any correctness or DOM-shape difference. It times nothing. Run it for every gated scenario after any fixture or arm change.

### Path instruments: `maplist` and `router`

Two `bench-scenarios.ts` scenarios exist to time specific code paths. `maplist` has a published two-run measurement (`BENCHMARKS.md` §2c, 2026-11-24). `router` has none: it was run twice on 2026-11-24, but it is a Pyreon-only regression instrument, so quote it only as an A/B between builds.

- **`maplist`** (`bun run bench:maplist`, `src/impl/scenario-maplist*.ts`, `MapList.svelte`). A keyed `.map()` of JSX rows inside an element, with conditional JSX in two slots (each row's status cell, the list's empty state): the shapes every other list in the suite lacks. 1,000 rows; ops: create into the mounted empty list, replace all, update one cell, toggle one conditional, swap 2 ↔ 999, remove row 500, clear. The single-row ops' per-op samples are dominated by the forced layout of the 1,000-row table (identical for every arm); each has a batch twin (one cycle = write + restore = two updates, each with a forced layout, K = 200) as the clock-independent cross-check. Quote a single-row verdict only where both rows agree.
  - Arms: `Pyreon (.map)` (mounted with its rows, so the slot is classified keyed), `Pyreon (.map, first render empty)` (unranked diagnostic: the same component mounted empty; since #4736 it also reconciles by key), `Pyreon (<For>)` (reference), React 19 and Preact (`rows.map(row => <Row key …/>)` with a `memo` row, immutable updates), Vue 3 (compiled keyed `v-for` + `v-if`/`v-else`, `shallowRef`), SolidJS 1.9 (`<For>` + ternary through the real `babel-preset-solid`) and SolidJS 2.0 (the same source through `@solidjs/compiler`; Solid has no keyed `.map()`, so equal observable work with a different source shape), Svelte 5 (keyed `{#each}` + `{#if}`, `$state.raw` list with `$state` fields).
  - Correctness gate before timing: every op runs once on a prepared list and the DOM is checked against the harness model (row count, empty-state slot, id/label/status branch of a spread of rows). An op that fails is **not timed** for that arm and the report prints `✗ NOT TIMED — failed the correctness gate` in its place. Every timed iteration is re-verified.
  - On `main` of 2026-11-19, `Pyreon (.map)` failed the gate on both single-row ops: a signal read inside a keyed `.map()` item (`{row.label()}`) was evaluated by the list's accessor, the keyed reconciler kept the row for the unchanged key, and the cell stayed stale. Since #4736 every arm passes the gate on every op (2026-11-24 refresh).
- **`router`** (`bun run bench:router`, `src/impl/scenario-router*.ts`). `@pyreon/router` `push()` through resolve, guards, commit, `history.pushState` and the `<RouterView>` swap, in real Chromium, history mode, no loaders, `meta.viewTransition: false` on every route (a View Transition makes `push()` frame-bound). Ops: route change, push through one `beforeEnter` guard, param change; each has a batch twin whose cycle is the reset plus the op (two pushes for the first two, three for the param change), always through `/home`. Arms `Pyreon` and `Pyreon (tabs)` (two tabs; every reset goes through the tab root, so the stack stays bounded — the gate fails if it grows).
  - A **regression instrument, Pyreon only**: the report prints each arm's ratio to the faster arm and no verdicts. The installed rival routers do not share this guard/commit model, so an equal-work arm is not a straight port.
  - The scenario pushes thousands of times. Its browser is launched with `--disable-ipc-flooding-protection` (`chromiumArgs` in `bench-scenarios.ts`) as a safeguard against Chromium's `pushState` flood throttle, which did not trigger on the 2026-11-19 Playwright Chromium even without the flag. Every per-op iteration and every batch cycle checks `location.pathname`, so a dropped push fails instead of timing.
  - Use the batch rows for an A/B. The per-op rows (one push after a forced GC and an event-loop yield) were slower per push and noisier than the warm batch rows in the smoke run.
  - The tabs option is passed through `Reflect.get(router, 'routerTabs')` so the same source builds before and after #4702 (bare array vs `routerTabs([...])`). Replace it with a direct call once #4702 merges.

#### A/B of a compiler or runtime PR

`examples/benchmark` resolves `@pyreon/reactivity`, `core`, `runtime-dom` and `router` from `src/` (the `bun` condition) and only `@pyreon/compiler` from `lib/` plus the native binary. Swapping `lib/` alone builds identical bundles. Build each side in its own worktree checked out at the ref (`bun install` rebuilds `lib/` and the native binary), copy the scenario files in if the ref predates them, and confirm the two builds differ where the PR does (the chunk that holds the changed code, and for a compiler PR the compiled scenario component) before timing anything. Two sides with the same chunk hashes is a broken setup, not a result. Then time them with the interleaved A/B runner below and report only rows where both runs agree.

#### Interleaved A/B runner (`scripts/bench/ab/`)

The one implementation of the A/B protocol; do not hand-roll a queue script. `run.ts` executes a jobs file, `analyze.ts` pools and judges the results, `lib.ts` holds the rules (unit-tested in `packages/internals/test-utils/src/tests/bench-ab.test.ts`; nothing there boots a browser).

- **Jobs file** (JSON): `name`; `arms` — per arm an absolute worktree `dir`, `entry` globs of its BUILT artifact (for example `examples/benchmark/dist/assets/index-*.js`, or `packages/core/reactivity/lib/index.js` for the micro harness) and an optional `build` (`{ cwd, command }`); `jobs` — `label`, `cwd` (relative to the arm dir) and `command` with the placeholders `{out}` (required: the JSON the job writes), `{pass}`, `{run}`, `{arm}`; `runs` (default 2) and `passes` per run (default 5).
- **Schedule**: runs → passes → jobs → arms, the arm order rotating every pass (A,B / B,A / …), each job run once per arm per pass. A retried attempt keeps its slot.
- **Arm identity**: a preflight, under the lock, runs each arm's `build` and hashes its `entry` files by content. Identical hashes abort the queue before anything is timed. After every job the entry is re-hashed; a changed or missing entry makes that attempt invalid.
- **Lock**: `--lock PATH` (or `PYREON_BENCH_LOCK`), the file every timing session on the machine shares. Created atomically (`O_EXCL`), held only while a job (or the preflight) runs, released only if its content is still ours. Its first line is `<owner> <pid>`, the format the older queues wrote. A lock whose pid is dead is reclaimed (renamed aside and identity-checked, so two reclaimers cannot both win); a lock whose pid is alive, or whose pid cannot be read, is never touched. After each job the runner yields `--yield` seconds (default 5) so a waiting session can take the lock.
- **Start gate**: a job starts only when the lock is free and the 1-minute load has stayed below `--max-load` (default 4) for `--quiet-for` seconds (default 30), counting every sample the runner takes, including those during the previous job.
- **Validity** (per attempt): exit 0; an output file written; load sampled at the start, at the end and at least every max(1 s, duration ÷ 5) (+ 500 ms timer allowance; the runner samples every second); every sample below the threshold; no foreign bench process; the arm's entry unchanged. A **foreign bench** is a process outside the runner's own process tree (its ancestors and descendants are excluded) whose command line matches a timing driver (`DEFAULT_FOREIGN_PATTERNS`: `bench-fair.ts`, `bench-scenarios.ts`, the profile and tree drivers, `scripts/bench/core/*.ts`, another A/B runner, `treeheap`, …; extend with `--foreign-pattern`). The process table is scanned at the start, the end and every 5 s. Builds and test suites are not foreign benches; their cost shows up in the load average. An invalid attempt is retried up to `--attempts` (default 3).
- **Deadline**: `--deadline` takes `+2h30m`, `HH:MM` (the next occurrence after the queue starts, so a queue started at 23:50 with `07:30` stops tomorrow morning) or an ISO date-time. It is resolved once to an absolute timestamp; no attempt starts after it.
- **Results** (`--out`, default `bench-ab-results/<name>`): `manifest.json` (jobs, schedule, arm hashes, settings), per attempt `<job>-<arm>-r<run>-p<pass>.a<k>.json` (status, reasons, command, cwd, timestamps, duration, exit code, entry hash, peak load, the full load trace, foreign processes seen, data path), `.log` (output) and `.data.json` (the job's `{out}`), and `queue.log`.
- **Analysis**: `bun scripts/bench/ab/analyze.ts <out> [--base A] [--rows REGEX] [--json FILE]`. Only VALID attempts count; missing passes are listed. Per row (op × framework for the Chromium suites, section × library for the micro harness) and per run it prints each arm's median, cluster-bootstrap CI95 (page loads or processes as clusters), CV, clock-quanta count (median ÷ the finest step between distinct samples; `n/a` for the micro harness's window averages) and the run's direction. Verdict: **WIN/LOSS** only when the CIs are disjoint in the same direction in every run (at least two); **NO VERDICT** below 10 quanta in any run or with a single run; otherwise **TIE**.
- Example jobs file for a deep-tree A/B:

  ```json
  {
    "name": "tree-ab",
    "arms": {
      "A": { "dir": "/tmp/wt-base.noindex", "entry": ["examples/benchmark/dist/assets/index-*.js"], "build": { "cwd": "examples/benchmark", "command": "bun run build" } },
      "B": { "dir": "/tmp/wt-pr.noindex", "entry": ["examples/benchmark/dist/assets/index-*.js"], "build": { "cwd": "examples/benchmark", "command": "bun run build" } }
    },
    "jobs": [{ "label": "tree", "cwd": "examples/benchmark", "command": "bun bench-scenarios.ts --scenario tree --only 'Pyreon,SolidJS' --repeat 1 --pass-offset {pass} --raw-out {out}" }],
    "runs": 2,
    "passes": 5
  }
  ```

  `bun scripts/bench/ab/run.ts tree-ab.json --lock <shared lock> --deadline 07:30`, then `bun scripts/bench/ab/analyze.ts bench-ab-results/tree-ab`. `bench-fair.ts --repeat 1 --json {out}` and `scripts/bench/core/reactivity.ts --json {out}` jobs work the same way.

### Full-stack suite (`examples/stacks-bench`)

- **No result is published**, and none may be written into `BENCHMARKS.md`, the docs or the site until a run meets `examples/stacks-bench/results/README.md` and the maintainer decides to publish. The method is public: `docs/src/content/docs/benchmarks-full-stack.md` and the suite's `README.md`. Keep both free of result numbers.
- Nine arms in `apps/<id>/`, each with exact versions and its own `package-lock.json`, installed with `npm ci` by `bun setup.ts`. They are outside the bun workspace.
- The zero arm has two sources: npm (default; the published packages its lockfile pins, the only source a published result may use) and `--zero=workspace` (the monorepo's built `lib/`, for development). `run.json` records which. The npm pin moves by hand after a release.
- A run writes `results/<runId>/run.json` (`RunManifest`, `lib/run.ts`) and one `<arm>.json` (`ArmResult`, `lib/result.ts`). `--report` checks the single-run conditions (`runConditions`) and prints `NOT PUBLISHABLE` with the reason. A published run is committed unchanged under `results/published/<runId>/`.
- `bun gate.ts` is the correctness gate alone and prints no timing; `Stacks Bench Smoke` (`.github/workflows/stacks-bench-smoke.yml`) runs setup and the gate on Linux so the arms stay buildable. It must never time anything.
- A change to an arm follows its framework's docs, keeps `CONTRACT.md` and passes the gate; no arm-specific tuning, zero included.

### Catalogue app (`examples/real-bench/app`)

- **No result is published**, and none may be written into `BENCHMARKS.md`, the docs or the site until a run meets `examples/real-bench/app/results/README.md` and the maintainer decides to publish. Method, metric definitions, known biases and what is not measured: `examples/real-bench/README.md` ("The catalogue app"). Keep it free of result numbers.
- One client-rendered app (list over 5,000 records with search/category/sort/pagination, detail, validated form, routing, app-wide state) specified in `CONTRACT.md`, in six arms under `arms/<id>/`: Pyreon (`@pyreon/router` + `@pyreon/store`), React (React Router + `useReducer`/context), Vue (Vue Router + Pinia), Solid (`@solidjs/router` + `createStore`), Svelte (SvelteKit SPA mode + a `$state` class), Preact (`preact-iso` + `@preact/signals`). Each has exact versions, its own `package-lock.json` (installed with `npm ci` by `bun setup.ts`) and its own Vite build; they are outside the bun workspace and ignored by oxlint/oxfmt.
- `shared/data.ts` and `shared/app.css` are copied verbatim into every arm (the harness refuses a drifted copy); every visible string, including every number, is produced there, so V8's number-string cache is charged equally.
- Metrics: first-load JS/CSS/HTML bytes (raw, gzip -9, brotli 11, sized by the harness); time to interactive (fresh context, CPU 4× + 150 ms / 1.6 Mbit/s, navigation start → a probe's search input is reflected in `#count`); retained JS heap after load, after one and after five scripted sessions (DevTools-protocol GC until two readings differ by under 16 KB, net of a blank page on the same server).
- The pyreon arm has two sources: npm (default; the only one a published result may use) and `--pyreon=workspace`. The npm pin moves by hand after a release, all `@pyreon/*` together in one `npm install --save-exact` (their peer ranges are `^0.x`, so moving them one at a time fails with ERESOLVE), then `npm ci` and `bun setup.ts && bun gate.ts`. On `@pyreon/*@0.53.0` the arm failed the gate (header `RouterLink`s mounted before `RouterProvider` ran and did full page loads; fixed by #4174, `remountable-tpl-owner.test.ts`); from 0.54.0 the published packages pass it.
- `bun gate.ts` is the correctness gate alone and prints no timing; `Real Bench App Smoke` (`.github/workflows/real-bench-app-smoke.yml`) runs setup and the gate on Linux, the pyreon arm from npm and again from the workspace. It must never time anything.
- `bench.ts` refuses a non-isolated page or a timer coarser than 20 µs and any arm that fails the gate, and its report prints `NOT PUBLISHABLE` for load above 4, a missing arm, lowered knobs, a non-default throttle, a dirty tree, the workspace pyreon source, or a retried probe.
- A change to an arm follows its framework's docs (named in its `arm.json`), keeps `CONTRACT.md` and passes the gate; no arm-specific tuning, Pyreon included.

### Fairness rules for competitor arms

- Every arm builds row data with the same helper, outside the timed window.
- Every arm ends every op with the same DOM: the same elements, content text nodes and text (the DOM-shape gate fails the run otherwise). Fixture values are never empty (frameworks disagree on whether `''` gets a text node), and Svelte templates carry no whitespace between siblings that the other arms' markup lacks (Svelte keeps it as a `" "` text node).
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
- **An empty fixture value is not neutral.** The deep tree mounted with `''`: Pyreon, Preact and Vanilla rendered 1,024 empty text nodes, React, Vue and both Solids none, so the mount compared different DOMs while every per-arm verifier (leaf count) passed. Template whitespace did the same to three Svelte arms. Only a cross-arm comparison catches this class; it is the DOM-shape gate.
- **Pooled bootstrap overstates certainty.** CIs published before the cluster bootstrap (2026-11-05) resampled pooled samples as independent and are too narrow; an "outright" from that era on a close op needs a re-run before it is quoted again. The reactivity micro harness pooled 30 windows from 3 processes the same way until 2026-11-25; it now clusters by process (`references/core-micro-benchmarks.md`).
- **Noisy load hides gaps.** A wide CI at high load can make a real gap look like a tie. Check CI width before publishing a tie; re-run on a quiet machine, and publish a verdict on a close op only after two runs agree.

## Standing findings not in `BENCHMARKS.md`

### Deep-tree mount

- **Closed on time, open on memory (2026-11-24).** The mount now ties Solid 1.9 in both runs and beats Solid 2.0 and React (`BENCHMARKS.md` §2a). Bisected: `c5b2c4c48` still lost 1.16–1.17×, the next commit `2655fa3b4` (#4199, fold static component props and forward pass-through getters) ties. The retained heap of the mounted tree is the open gap: 1.30× Solid 2.0, about 2.6× Solid 1.9 (§2b). The bullets below are the pre-#4199 analysis, kept for the levers they refute.
- The gap to Solid was per-component framework JS plus GC, not element creation.
- The ablation ladder (`examples/benchmark/bench-treeladder.ts` + `src/impl/profile-tree.tsx`) attributes the Pyreon-over-Solid gap to getter child props, and specifically to the O(depth) getter chain read three times per node. Solid pays the same class of cost (its eager-props diagnostic arm sits well below its real arm). Emitting getters directly instead of `_rp` + `makeReactiveProps` was measured and does not help; hand-written getters were slower than the shipped pipeline. `probe-getter-chain.ts` measures the chain in isolation.
- Component instantiation (`mountComponent` / `runWithHooks` / scope / owner) is cheap on the ladder.
- **Shipped 2026-11: null-prototype props.** Profiling with `TL_JSFLAGS=--no-turbo-inlining` (the inlined profile hides it inside `mountComponent`) showed `makeReactiveProps` at ~165 µs on-CPU: each `defineProperty` of a per-instance getter on a `{}` built a fresh V8 hidden class. A null-prototype result halves that; board 3.70–3.72 → 3.57–3.59 ms (two runs, interleaved `Pyreon (old props)` arm, disjoint CIs), Solid 3.09–3.12, so the gap went 1.19–1.20× → 1.14–1.16×. No change on effects/table/flow/memo (A/B, two rounds), row board, or retained heap.
- **Context leaf, measured 2026-11 (ladder arms I and J).** `useContext` lookup alone (J − C) is 40–80 µs on-CPU, noisy, ~20 µs self in a no-inline profile; not worth a semantic change to the owner walk. The wrapper-vs-signal cost (A − I, the provider handing `() => sig()` instead of `sig`) is 30–50 µs: a signal reaches `_bindText`'s direct tier, an arrow cannot. That is an idiom difference, not a framework lever — and the board's Pyreon arm passes a wrapper while its Solid arm passes the signal, an asymmetry that slightly handicaps Pyreon (left unchanged; see `bench-gaps` notes). The scenario's initial context value was `''`, for which Solid (and React and Vue) create no leaf text node while Pyreon creates 1,024 empty ones; a profile on 2026-11-25 attributed about 145 µs per mount of browser clone/insert work to that difference (not re-measured as a wall-clock A/B), so the fixture now mounts with a non-empty value and the DOM-shape gate enforces equal DOMs. Mount figures measured before that change compare unequal work.
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

- No verdict on the 2026-11-24 board: Pyreon, Solid 1.9 and Solid 2.0 all read 35–50 µs, below the 10-quantum floor (`BENCHMARKS.md` §2a). Two changes brought it down to that level: a second inline tracking-subscriber slot before promoting to a `Set` (plus `deps.pop()` in the effect/`_bind` disposers), and `mountChildAsUnit` for static (non-accessor) slot values, so rows inside a cloned container get effect-only cleanups instead of 500 individual DOM removals. An accessor slot keeps the full remover because it must clear its own range.
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

- **Author-judge.** Pyreon's authors wrote and judge every bench. The only independent venue is krausest/js-framework-benchmark; a keyed implementation is staged at `contrib/krausest/pyreon-keyed/`. It passes upstream's own build, smoke, keyed and CSP checks (`references/krausest-submission.md`), but it has not been submitted and has no official number. Submitting is the maintainer's decision.
- **Synthetic.** No real-app head-to-head against real competing frameworks has a published result. The catalogue app (`examples/real-bench/app`) is the harness for one (six real runtimes, bundle, time to interactive, memory) but has no run that meets its publishing conditions; the `cpa-pw-app-*` ports run on Pyreon compat shims. "Fastest" claims stop at what these suites measure.
- **One machine, one engine.** Every browser figure comes from one Apple M3 Max in Chromium. No Firefox, Safari or second-machine run exists.
- **CPU-objective, not async latency.** React's default scheduling path would read higher than its `flushSync` arm.
- **happy-dom rows** (query, virtual, table, toast, dnd, charts wrapper) time a JavaScript DOM implementation; relative work is meaningful, absolute times are not.
- **Not measured** (per `BENCHMARKS.md` §14): streaming SSR, portals, async waterfalls, startup metrics (the catalogue app can measure first-load bytes and time to interactive for client-rendered apps, unpublished), krausest's per-op memory metrics, Firefox/Safari, independent third-party runs. Async waterfalls and portals were dropped as unfair to include (Svelte lacks Suspense and a built-in portal).

## Deeper detail

| Topic | File |
| --- | --- |
| Core micro-benchmarks: router, reactivity, head, store, state-tree, machine, i18n, permissions, form, query, http, SSR harness, `NODE_ENV` cost, declined micro-optimizations | `.agents/guides/benchmarks/references/core-micro-benchmarks.md` |
| The official js-framework-benchmark entry: upstream's rules and flags, what `check-krausest-entry` enforces, re-running upstream's checks, submission steps | `.agents/guides/benchmarks/references/krausest-submission.md` |
| Row list: swap diagnosis (layout-bound, identical DOM ops, the Vapor lead is per-page-load variance) and the create-1k residual after direct insertion | `.agents/guides/benchmarks/references/row-list-swap-and-create-residual.md` |
