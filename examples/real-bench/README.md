# `@pyreon/example-real-bench` — real-framework, real-app head-to-head

Realistic-application benchmarks against **real framework runtimes** (no compat
shims). Two parts:

1. **The catalogue app** (`app/`): one small multi-view client app — a
   filtered, sorted, paginated list over 5,000 records, a detail view, a
   validated form, client-side routing and app-wide state — built six times,
   in Pyreon, React, Vue, Solid, Svelte and Preact, each with its own router
   and state approach and its own production build. It measures **first-load
   bundle bytes, time to interactive and retained memory**.
2. **The render scenarios** (`src/`, below): a TodoMVC-shape list in Pyreon vs
   React 19, timing three render operations.

**The catalogue app has no published result.** The render scenarios' current
record is `BENCHMARKS.md` §6. Read "Run conditions" before running anything you
intend to quote.

## The catalogue app (`app/`)

```bash
cd examples/real-bench/app
bun setup.ts                      # npm ci + production build of every arm (pyreon from npm)
bun setup.ts pyreon --pyreon=workspace   # the pyreon arm from the monorepo's built lib/
bun gate.ts                       # correctness gate only, prints no timing (CI runs this)
bun bench.ts --wait-quiet 4       # gate, then bundle + time to interactive + memory → results/<runId>/
bun bench.ts --report [runId]     # re-print a run and its publishability
```

(`bun run app:setup`, `app:gate` and `app:bench` from `examples/real-bench` do the same.)

**State of the arms.** All six pass the gate, the pyreon arm from npm (the
published `@pyreon/*@0.54.0` its lockfile pins) and from the workspace; CI
(`Real Bench App Smoke`) gates both sources. On 0.53.0 the pyreon arm failed it:
the compiler templates the header `<nav>` (a component child of
`RouterProvider`), and 0.53.0 built that template, mounting the two header
`RouterLink`s, while `App` evaluated `RouterProvider`'s children, before the
provider had run, so the links found no router, fell back to plain anchors, and
a click was a full page load ("the session replaced the document"). #4174 builds
such templates on mount, inside the provider, with a regression test
(`packages/core/runtime-dom/src/tests/remountable-tpl-owner.test.ts`); 0.54.0 is
the first release with it. The arm was not changed to work around it. To move
the pin after a release, move every `@pyreon/*` together (their peer ranges are
`^0.x`, so one at a time fails with ERESOLVE; if npm still reports ERESOLVE
inside the old lockfile, delete `node_modules` and `package-lock.json` first):
`cd app/arms/pyreon && npm install --save-exact @pyreon/core@<v> @pyreon/reactivity@<v> @pyreon/router@<v> @pyreon/runtime-dom@<v> @pyreon/store@<v> @pyreon/vite-plugin@<v> && npm ci`,
then `bun setup.ts && bun gate.ts` from `app/`.

### Design

- **One contract, six arms.** [`app/CONTRACT.md`](./app/CONTRACT.md) fixes the
  routes, the exact DOM every view renders, the behaviour, and which router and
  state approach each arm uses. Each arm (`app/arms/<id>/`) is an ordinary
  project with its own `package.json` (exact versions; the other frameworks'
  packages each published at least two weeks before they were pinned, the
  pyreon arm on the latest `@pyreon/*` release), its own `package-lock.json` and its own Vite
  build with its framework's own plugin, so every arm ships real compiled output
  (Vue's template compiler, `vite-plugin-solid`, the Svelte compiler, the React
  and Preact JSX runtimes, Pyreon's compiler). The arms sit outside the bun
  workspace, like `examples/stacks-bench/apps`.
- **Idiomatic stacks, no tuning.** Pyreon: `@pyreon/router` + `@pyreon/store`.
  React: React Router (declarative) + `useReducer`/context. Vue: Vue Router +
  Pinia. Solid: `@solidjs/router` + `createStore`/context. Svelte: SvelteKit in
  SPA mode + a `$state` class. Preact: `preact-iso` + `@preact/signals`. No
  `memo`, `shallowRef`, `$state.raw`, `createSelector` or other size-specific
  optimisation in any arm; each arm's `arm.json` names the docs pages it
  follows and its known differences.
- **Shared work is shared code.** `app/shared/data.ts` (seeded records, the
  filter predicate and comparators, the aggregate, the validation rules, every
  visible string) and `app/shared/app.css` are copied verbatim into every arm;
  the harness refuses a copy that differs. The harness computes every expected
  value from the same file.
- **One server.** Every arm is served by `app/harness/serve.ts`: precompressed
  brotli/gzip by `Accept-Encoding`, SPA fallback, cross-origin isolated, no
  caching. No arm's hosting defaults move a number.
- **Gate first.** `app/gate.ts` (and `bench.ts`, before measuring) drives each
  arm through six direct loads and two scripted sessions (search, category,
  sort, paginate, re-sort back to page 1, favourite, detail, unfavourite, back
  with state kept, form submitted empty, fixed field by field, created, found,
  reset), checks the full DOM state after every step, and fails on any page
  error, console error or full page load. It was proven against five
  deliberately broken copies (a no-op search box, favourites mutated in place
  so the signal never notified, a filter change that kept the page, errors
  shown before submit, an edited shared file); each failed with the expected
  message.

### App metrics

Every page is a fresh browser context (empty cache, no code cache): a first
visit. Arms are measured in rounds, one page per arm per round, the arm order
rotated every round.

- **Bundle.** An untimed, unthrottled first load of `/products`: every
  same-origin request until the list shows its full count and the network is
  idle. Each file is fetched again uncompressed and sized by the harness: raw,
  gzip level 9, brotli quality 11. Reported per kind (JS, CSS, HTML) as
  `firstLoadTotals`, plus every `.js`/`.css` file in the build output (`build`),
  which shows what an arm defers to later routes (SvelteKit splits per route by
  itself; the other arms ship one entry chunk).
- **Time to interactive.** A first load of `/products` under the `mobile`
  throttle: CPU slowed 4× (`Emulation.setCPUThrottlingRate`) and the network
  emulated at 150 ms round trip, 1.6 Mbit/s down, 0.75 Mbit/s up
  (`Network.emulateNetworkConditions`), both applied by Chromium per page. A
  probe installed before any page script watches `#count`. When it first shows
  the unfiltered count (the list is in the DOM, `firstRenderMs`), the probe
  types the search query in a new task (the native value setter, then an
  `input` event) and **time to interactive is navigation start → the moment
  `#count` shows the filtered count** (a MutationObserver callback; paint is not
  included). If the app has not reacted 50 ms later the probe types again and
  counts the attempt; a run with any retry is not publishable. Also recorded:
  first contentful paint, DOMContentLoaded, load event, every long task, and
  bytes over the wire.
- **Memory.** An unthrottled page loads `/products`, waits for the list and an
  idle network, then forces full collections through the DevTools protocol
  (`HeapProfiler.collectGarbage`) until two in a row differ by under 16 KB, and
  reads `Runtime.getHeapUsage` (`usedBytes`) and the DOM counters
  (`Memory.getDOMCounters`): **retained JS heap after load**. The same page
  then runs the scripted session; the same reading is taken after one session
  and after `sessions` (default 5) sessions in that page. Every page also
  measures `/__blank` (no script) on the same server the same way, and the
  report shows each heap net of it. Forcing GC is right here: the benchmarks
  guide's "never force GC" rule is about JavaScriptCore under bun, not V8.
- **Session step timings** (recorded, not a headline metric). During the memory
  pages, each scripted step's time from its first action to the moment its whole
  expected DOM state holds, unthrottled, on the 5 µs clock.

### Run conditions

`bench.ts` **refuses** to measure when the page is not cross-origin isolated or
its timer is coarser than 20 µs, and refuses an arm that fails the gate. Its
report checks the rest and prints **NOT PUBLISHABLE** with the reason: load
average above 4 at any stamp, a missing arm, lowered knobs, a non-default
throttle, an uncommitted tree, the pyreon arm from the workspace, or a retried
probe. A verdict needs two complete runs that each meet them, with disjoint
intervals in both. The raw-output schema and the full list:
[`app/results/README.md`](./app/results/README.md).

### Known biases

- **The probe types a synthetic event.** `input` dispatched from script is
  untrusted and skips the browser's input pipeline; it is the same for every
  arm, and React treats it as the discrete event a keystroke is.
- **Time to interactive ends at the DOM, not the screen.** Frameworks that
  commit in a microtask or later task are caught at their commit; none is
  charged a paint.
- **"Typing as soon as the list appears"** is the model. An arm that renders the
  list early and attaches more work after it is charged that work only if it
  delays the input's handling.
- **DevTools throttling is not a phone.** CPU slowdown scales the main thread's
  work, not the GPU, and network emulation is per request in Chromium, not a
  real radio.
- **Idiomatic means differences.** Each arm holds state the way its docs do:
  Vue and Svelte make the 5,000 records deeply reactive (proxied lazily); Solid
  keeps favourites in a per-id store; Pyreon, React and Preact replace a `Set`.
  These are the stacks being compared, not noise; each arm's `notes` states them.
- **Router defaults differ.** Pyreon's router runs navigations through View
  Transitions where supported; SvelteKit preloads on hover (no hover happens);
  React Router, Vue Router, Solid Router and preact-iso do neither.
- **SvelteKit ships a framework runtime** (router, data loading, version
  polling) because Svelte's docs point apps with routing at SvelteKit; it is
  the only arm whose first load is split across several chunks by default.
- **Author-judged.** Pyreon's authors wrote every arm. Each follows its
  framework's docs pages named in `arm.json`; review by people who ship those
  frameworks is the remaining check.

### Not measured

Server rendering and hydration (every arm is client-rendered; the full-stack
comparison is `examples/stacks-bench`), Firefox and Safari, real devices,
repeat visits with a warm cache or a service worker, interaction latency under
throttling, input delay from real user input (INP), long-session memory beyond
`sessions` repeats, and arms beyond these six (Angular, Qwik, Lit, Vue Vapor
mode, Solid 2, …).

## The render scenarios (`src/`)

```bash
cd examples/real-bench
bun bench            # vite build → vite preview → drive each framework, print table
bun bench --runs 40  # more timed runs per scenario (default 20)
bun bench --runs 3   # quick correctness smoke (gates run every iteration)
bun bench --repeat 3 --wait-quiet   # 3 reshuffled passes on a quiet machine
bun run dev          # open the page; ?framework=pyreon|react runs one in isolation
```

A TodoMVC-shape stateful list in **Pyreon** (real `@pyreon/runtime-dom` +
fine-grained signals) vs **React 19** (real `react-dom`, `useState` + `memo`)
across three render scenarios, under the same page-isolated / GC-forced / CI95
methodology as `examples/benchmark`'s `bench:fair`.

### Why this exists

Pyreon's published table (`examples/benchmark`) uses **real** framework runtimes
but measures **synthetic** ops (create 1 000 rows, swap, …). The "real-app"
ports (`examples/cpa-pw-app-*`) run on Pyreon's **compat shims** — the Pyreon
runtime wearing a React/Solid/Vue API, **not** the real framework — so they
cannot be a fair real-app comparison. `real-bench` closes that: the same app,
each framework's **real runtime**, measured under the same discipline.

### Results

The current record of these scenarios is `BENCHMARKS.md` §6 ("Real-app
shapes"): one overnight run with the harness below, React committed through
`flushSync` on the isolated clock. Quote it from there, with its caveat that
`add-100` moves from day to day.

An earlier table that sat here is **withdrawn**: it was measured with React's
commit barrier (`requestAnimationFrame → setTimeout(0)`) inside React's timed
window, so the React column included up to a frame of idle per sample, and on
a 100 µs clock (the page was not cross-origin isolated). The harness now
commits React with `flushSync` and refuses to run on a coarse clock. Re-run
`bun bench --repeat 4 --wait-quiet 4` on a quiet machine before quoting a new
number.

### Methodology (inherited from `bench:fair`)

- **Per-framework page isolation** — Playwright loads `?framework=<name>` in a
  fresh browser context per framework, and each page dynamic-imports ONLY that
  framework's chunk, so no cross-framework heap/JIT bias. Framework order is
  reshuffled every pass (`--repeat N`); samples are pooled across passes.
- **Timer preflight** — COOP/COEP make the page cross-origin isolated (5µs
  `performance.now()`); the driver measures the quantum and aborts otherwise.
  `--strictPort` + announced-port check; load average stamped before/after
  (`--wait-quiet [load]` to wait for a quiet machine).
- **Forced GC between iterations** — Chromium launches with
  `--js-flags=--expose-gc`; the in-page runner calls `window.gc()` each iteration.
- **Adaptive warmup** (5–15 iters, stop when rolling p90 of the last 3 is within
  10% of the prior 3) + **20 timed runs**, **median + p90 + 95% bootstrap CI +
  CV**.
- **DOM-verified every iteration** (row count + each row's text for `add`;
  `.completed` class AND checked checkbox for `toggle`; empty list for `clear`)
  — a framework that "wins" by not committing **throws**, and the driver exits
  non-zero naming it.
- **Production build** (`vite build` → `vite preview`), real Chromium.
- **Per-framework tightest commit, inside the timed region** — Pyreon's signals
  patch synchronously; React's action runs in `flushSync` (reconcile + commit
  synchronously, no scheduler wait) — the same contract `bench:fair` uses. A
  forced layout (`getBoundingClientRect`) ends every timed region.
- **`add-100` is batching vs non-batching**: React batches the 100 `setState`s
  into one render; Pyreon's un-batched `rows.set` reconciles 100 times. Each is
  that framework's default for the same input — read the cell as that, not as
  per-insert cost.

### Idiomatic-per-framework (a fairness requirement)

Each port uses its framework's **real** state model — never a forced common
pattern. Pyreon → fine-grained `signal` (per-row `done` signal); React →
`useState<Todo[]>` + `memo`. The benchmark measures the shapes users actually
ship. See `src/impl/pyreon.tsx` and `src/impl/react.ts`.

### What does NOT exist yet (follow-ups)

The catalogue app above now covers Solid, Vue and Svelte ports, separate
idiomatic builds per framework, bundle size and time to interactive. What is
left for the render scenarios:

1. **More arms** — the scenarios still run Pyreon and React only.
2. **More scenarios** — `filter-cycle` (needs a commit between sub-actions so
   React doesn't auto-batch the 3 `setFilter`s into one render) and
   `drag-reorder` (per-framework dnd).
3. **Separate builds** — Pyreon + React share one Vite build here (React
   written as the `jsx()` runtime output, as `examples/benchmark` does).

### Acceptance bar (when can the docs claim "fast in real apps"?)

Only after the catalogue app has two complete runs that meet
`app/results/README.md` on a quiet machine, reproduced on a second machine, and
the maintainer decides to publish. Until then every
"fastest" statement stays scoped to the synthetic benchmark, as it is today.
**Do not publish a partial table as if it were the whole story** — a 2-framework
slice is evidence the harness works, not a finished claim.

## Files

```
real-bench/
├── bench.ts            ← render scenarios: build → preview → per-framework page isolation → table
├── index.html
├── src/                ← render scenarios (Pyreon vs React, TodoMVC shape)
│   ├── types.ts · scenarios.ts · runner.ts · stats.ts · main.ts
│   └── impl/pyreon.tsx · impl/react.ts
└── app/                ← the catalogue app
    ├── CONTRACT.md     ← what every arm implements
    ├── setup.ts        ← npm ci + production build per arm (--pyreon=npm|workspace)
    ├── gate.ts         ← correctness gate, no timing
    ├── bench.ts        ← gate, timer check, bundle, time to interactive, memory, report
    ├── shared/         ← data.ts + app.css, copied verbatim into every arm
    ├── harness/        ← arms, serve, session (gate + memory steps), gate, measure, run, result
    ├── arms/<id>/      ← pyreon · react · vue · solid · svelte · preact (own package-lock.json each)
    └── results/        ← README.md (schema, publishing conditions); runs are git-ignored
```
