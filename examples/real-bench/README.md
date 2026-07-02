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
bun run dev          # open the page; ?framework=pyreon|react runs one in isolation
```

## Why this exists

Pyreon's published table (`examples/benchmark`) uses **real** framework runtimes
but measures **synthetic** ops (create 1 000 rows, swap, …). The "real-app"
ports (`examples/cpa-pw-app-*`) run on Pyreon's **compat shims** — the Pyreon
runtime wearing a React/Solid/Vue API, **not** the real framework — so they
cannot be a fair real-app comparison. `real-bench` closes that: the same app,
each framework's **real runtime**, measured under the same discipline.

## Representative run (developer-class hardware)

20 timed runs, median + coefficient of variation. **Machine-dependent ms — the
column-to-column ratios are the signal, not the absolute numbers.** Reproduce
with `bun bench`.

| Scenario | Pyreon | React 19 | Pyreon advantage | What it measures |
| --- | --- | --- | --- | --- |
| `add-100` | **500µs** (cv 13%) | 8.20ms (cv 6%) | ~16× | 100 rapid-succession appends. Pyreon: 100 incremental keyed-`<For>` inserts. React: 100 `setState`s → render(s) of the growing list. |
| `toggle-1000` | **300µs** (cv 23%) | 1.70ms (cv 6%) | ~5.7× | mark all 1 000 completed. Pyreon: flips 1 000 per-row `done` signals → 1 000 **in-place** checkbox/class patches, **no list reconciliation**. React: new 1 000-element array → whole-list re-render + VDOM diff. |
| `clear-1000` | **200µs** (cv 47%) | 1.30ms (cv 11%) | ~6.5× | clear-completed on a fully-completed 1 000-todo list. Pyreon: re-set the `rows` array (keyed `<For>` removes all). React: filter to `[]` → one render. |

**Honest reading:** Pyreon's fine-grained signal model is the structural reason
it wins `toggle`/`clear` decisively — flipping per-row signals patches only the
changed DOM, never re-rendering or diffing the list. React's `add` path is the
costliest cell (100 separate `setState` calls), the realistic shape of rapid
typed-in additions. This is **3 scenarios, 2 frameworks** — a genuine signal
that the harness works end-to-end and that the fine-grained advantage holds in
real-app shape, **not** a blanket "Pyreon beats React in real apps" claim (see
the acceptance bar below).

## Methodology (inherited from `bench:fair`)

- **Per-framework page isolation** — Playwright loads `?framework=<name>` in a
  fresh page per framework, so no cross-framework heap/JIT bias.
- **Forced GC between iterations** — Chromium launches with
  `--js-flags=--expose-gc`; the in-page runner calls `window.gc()` each iteration.
- **Adaptive warmup** (5–15 iters, stop when rolling p90 of the last 3 is within
  10% of the prior 3) + **20 timed runs**, **median + p90 + 95% bootstrap CI +
  CV**.
- **DOM-verified every iteration** (`expectRows` / `expectCompleted`) — a
  framework that "wins" by not committing **throws**, not passes.
- **Production build** (`vite build` → `vite preview`), real Chromium.
- **Per-framework commit-wait** — Pyreon's signals flush synchronously (no
  `commit` cost); React waits for its DefaultLane commit (`rAF → setTimeout(0)`),
  the same fairness contract `bench:fair` uses.

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
   (React via `createElement`, no second JSX transform — the same approach
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
│       └── react.ts    ← real React 19, useState + memo
```
