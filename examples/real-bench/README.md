# `@pyreon/example-real-bench` — real-framework, real-app head-to-head

A **real-app-shape** benchmark against **real framework runtimes** (no compat
shims). Today it runs a TodoMVC-shape stateful list in **Pyreon** (real
`@pyreon/runtime-dom` + fine-grained signals) vs **React 19** (real `react-dom`,
`useState` + `memo`) across three render scenarios, under the same page-isolated
/ GC-forced / CI95 methodology as `examples/benchmark`'s `bench:fair`.

```bash
cd examples/real-bench
bun bench            # vite build → vite preview → drive each framework, print table
bun bench --runs 40  # more timed runs per scenario (default 20)
bun bench --runs 3   # quick correctness smoke (gates run every iteration)
bun bench --repeat 3 --wait-quiet   # 3 reshuffled passes on a quiet machine
bun run dev          # open the page; ?framework=pyreon|react runs one in isolation
```

## Why this exists

Pyreon's published table (`examples/benchmark`) uses **real** framework runtimes
but measures **synthetic** ops (create 1 000 rows, swap, …). The "real-app"
ports (`examples/cpa-pw-app-*`) run on Pyreon's **compat shims** — the Pyreon
runtime wearing a React/Solid/Vue API, **not** the real framework — so they
cannot be a fair real-app comparison. `real-bench` closes that: the same app,
each framework's **real runtime**, measured under the same discipline.

## Results — none published

The table that used to sit here (Pyreon ~16× / ~5.7× / ~6.5× ahead) is
**withdrawn**: it was measured with React's commit barrier
(`requestAnimationFrame → setTimeout(0)`) INSIDE React's timed window, so the
React column included up to a frame of idle per sample, while Pyreon's
`commit()` was a resolved promise. On the same machine with React committed via
`flushSync` (what `examples/benchmark` uses), `add-100` comes out roughly even —
the "16×" was the scheduler wait. It was also taken on a 100µs clock (the page
was not cross-origin isolated), which quantized Pyreon's sub-ms cells to a few
ticks. Re-run `bun bench --repeat 3 --wait-quiet` on a quiet machine before
quoting any number; the harness now refuses to run on a coarse clock.

## Methodology (inherited from `bench:fair`)

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

## Idiomatic-per-framework (a fairness requirement)

Each port uses its framework's **real** state model — never a forced common
pattern. Pyreon → fine-grained `signal` (per-row `done` signal); React →
`useState<Todo[]>` + `memo`. The benchmark measures the shapes users actually
ship. See `src/impl/pyreon.tsx` and `src/impl/react.ts`.

## What does NOT exist yet (follow-ups)

This is the working first slice of the full real-app benchmark CLAUDE.md scopes
at 3–5 days. The remaining work, each a well-scoped follow-up PR:

1. **`solid/`** port (real `solid-js`, `createSignal`/`createStore`, compiled template).
2. **`vue/`** port (real `vue`, `ref`/`reactive`, SFC).
3. **`svelte/`** port (real `svelte@5`, `$state`, `.svelte` compiler).
4. **More scenarios** — `filter-cycle` (needs a commit between sub-actions so
   React doesn't auto-batch the 3 `setFilter`s into one render), `drag-reorder`
   (per-framework dnd), `cold-start TTI` (per-framework page-isolated mount).
5. **Idiomatic separate builds** — today Pyreon + React share one Vite build
   (React written as the `jsx()` runtime output, no second JSX transform — the same approach
   `examples/benchmark` uses). The strict-fair refinement is one build per
   framework (`@vitejs/plugin-react`, `vite-plugin-solid`, SFC, `.svelte`), so
   no framework's bundler config biases another.
6. **Gzipped bundle-size delta** — report each framework's gzipped main bundle
   next to the perf medians (closes the second half of "fast in real apps").

## Acceptance bar (when can CLAUDE.md claim "fast in real apps"?)

Only after the full matrix: all five real runtimes × all six scenarios, with the
gzipped bundle-size column, reproduced across ≥2 machines. Until then every
"fastest" statement stays scoped to the synthetic benchmark, as it is today.
**Do not publish a partial table as if it were the whole story** — a 2-framework
slice is evidence the harness works, not a finished claim.

## Files

```
real-bench/
├── bench.ts            ← Playwright harness: build → preview → per-framework page isolation → table
├── index.html
├── src/
│   ├── types.ts        ← Todo + the TodoApp contract every port implements
│   ├── scenarios.ts    ← the 3 timed scenarios (setup/act/verify)
│   ├── runner.ts       ← in-page warmup + 20-run loop + forced GC
│   ├── stats.ts        ← median + p90 + bootstrap-CI95 + CV
│   ├── main.ts         ← ?framework= page-isolation entry + results table
│   └── impl/
│       ├── pyreon.tsx  ← real Pyreon, fine-grained signals
│       └── react.ts    ← real React 19, useState + memo (flushSync commit, jsx() shape)
```
