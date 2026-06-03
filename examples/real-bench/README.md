# `@pyreon/real-bench` — real-framework, real-app head-to-head (implementation spec)

> **Status: SPEC ONLY — no apps, no harness, no numbers yet.** This directory
> currently contains this document and nothing else. It is the executable
> plan for the multi-day work CLAUDE.md ("Benchmark Results" → the
> real-app head-to-head paragraph) scopes at **3–5 days**. Read it top to
> bottom before writing a line of code; each section maps to one follow-up PR.

## Why this exists (the gap, stated honestly)

Pyreon's published benchmark (`examples/benchmark`, `bun bench:fair`) is a
**synthetic** js-framework-benchmark-style harness: it times isolated DOM
operations (create 1 000 rows, swap rows, partial update, …) against **real**
`react@19` / `solid-js@1.9` / `vue@3.5` / `svelte@5` / `preact@10` runtimes.
That table is legitimate **for what it measures** — but it measures contrived
1 000-row operations, not the shape of an app a Pyreon user actually ships.

The real-app ports that *would* close the gap (`examples/cpa-pw-app-{react,solid,vue,preact}`)
run on Pyreon's **compat shims** — the Pyreon runtime wearing a React/Solid/Vue
API, **not** the real framework. So they cannot serve as a fair
Pyreon-vs-React *real-app* comparison. **The honest scope of "fastest in real
apps" stops at the synthetic benchmark's evidence and does not extrapolate.**

`real-bench` closes that: the **same canonical app**, ported to **each
framework's real runtime in its idiomatic build**, measured under the same
discipline as `bench:fair`. Until it lands, no "fastest in real apps" claim is
earned.

## Assets that already exist — reuse, do not rebuild

| Asset | Path | Reuse for |
| --- | --- | --- |
| Pyreon TodoMVC (real runtime) | `examples/native-todomvc-web/src/entry-client.tsx` | The **Pyreon** port's app logic — lift verbatim, only swap the harness entry. |
| Canonical TodoMVC source (multiplatform) | `examples/native-todomvc-ios/src/TodoApp.tsx` | The reference behaviour spec every port must match (filters, toggle-all, clear-completed, counts). |
| The bench harness | `examples/benchmark/bench-fair.ts` | Lift directly: per-framework `page.goto('?framework=…')` isolation, `--js-flags=--expose-gc` + per-iteration `globalThis.gc()`, adaptive warmup (`WARMUP_MIN=5`/`WARMUP_MAX=15`, rolling-p90 stabilisation), 20 timed runs, **median + p90 + 95 % bootstrap CI + CV**, `🤝` CI95-overlap tie detection. |
| In-page run loop | `examples/benchmark/src/runner.ts` | The warmup/timed-run/GC/`commit?`-hook loop — adapt the scenario shape, keep the methodology. |
| Real framework deps already in the workspace | `examples/benchmark/package.json` | `react@19.2.6`, `react-dom@19.2.6`, `solid-js@1.9.13`, `vue@3.5.35`, `svelte@5.55.10`, `preact@10.29.2` are already resolved — copy the exact pins so lockfile churn is minimal. |

## What does NOT exist yet (the work)

1. A real-app TodoMVC in **React 19 + react-dom** (idiomatic `useReducer`/`useState`).
2. … in **SolidJS** (`createSignal`/`createStore`, `solid-js/web` compiled).
3. … in **Vue 3** (`ref`/`reactive`, SFC compiler).
4. … in **Svelte 5** (`$state`, `.svelte` compiler).
5. A real-app **scenario** harness (the synthetic one times DOM ops; these time app interactions).
6. The cross-framework **results table** + **gzipped-bundle delta** column.

## Directory layout (target)

Each framework gets its **own** directory with its **own** idiomatic build —
NOT a shared Vite project. A shared build would let one framework's bundler
config (JSX transform, treeshake aggression, dev/prod define) bias another.
Separate builds is the whole point of "fair real-app".

```
examples/real-bench/
├── README.md                 ← this file
├── runner/                   ← framework-agnostic Playwright harness (lifted bench-fair.ts)
│   ├── bench.ts              ← launch Chromium --expose-gc, per-app page isolation, 20 runs, CI95
│   ├── scenarios.ts          ← the 6 scenario definitions (names + measurement boundaries)
│   ├── stats.ts              ← median + p90 + bootstrap-CI95 + CV (lift from runner.ts)
│   └── report.ts             ← table emitter (md) + bundle-size delta
├── pyreon/                   ← @pyreon/runtime-dom (real)            — lift native-todomvc-web
├── react/                    ← react@19 + react-dom@19 (Vite + @vitejs/plugin-react)
├── solid/                    ← solid-js@1.9 (Vite + vite-plugin-solid, compiled template)
├── vue/                      ← vue@3.5 (Vite + @vitejs/plugin-vue, SFC)
└── svelte/                   ← svelte@5 (Vite + @sveltejs/vite-plugin-svelte, .svelte compiler)
```

Each app builds to its own `dist/` via `vite build`; the runner drives each via
`vite preview` (production build, NOT dev mode) — exactly as `bench:fair` does.

## The canonical app: TodoMVC

TodoMVC is the industry reference and the fastest to bootstrap (CLAUDE.md
recommends starting here over the blog-with-routes alternative). Every port
**must** be behaviourally identical — diff against
`examples/native-todomvc-ios/src/TodoApp.tsx`:

- add todo (Enter in the input), toggle one, toggle-all, edit (double-click),
  delete, clear-completed, filter All/Active/Completed, live "N items left" count.
- **Each port uses its framework's idiomatic state**, no cross-framework
  patterns: Pyreon → `signal`; React → `useReducer`/`useState`; Solid →
  `createSignal`/`createStore`; Vue → `ref`/`reactive`; Svelte → `$state`.
  Do **not** make React use signals, etc. — idiomatic-per-framework is a
  fairness requirement, not a style preference.

## The 6 scenarios (one timed region each)

Real-app shape, not synthetic. Each is a single `performance.now()`-bounded
region driven from the runner; the boundary is stated so every port measures
the *same* work:

| # | Scenario | Timed region (start → end) |
| --- | --- | --- |
| a | **Cold start → interactive (TTI)** | `page.goto(preview-url)` → first paint of the seeded 100-todo list + input focusable. |
| b | **Toggle 100 completed** | click toggle-all (or 100 individual toggles) → all 100 rows show completed state committed to DOM. |
| c | **Filter All→Active→Completed cycle** | click Active → Completed → All → list reflects each filter (DOM-verified row counts). |
| d | **Add 10 todos rapid** | dispatch 10 add-todo sequences → 10 new rows present in DOM. |
| e | **Clear completed × 50** | mark 50 completed, click clear-completed → 50 rows removed from DOM. |
| f | **Drag-reorder 20** | reorder 20 rows (pointer or framework dnd) → final order committed to DOM. |

**Per-framework commit-wait discipline** (the `bench:fair` fairness fix — do not
regress it): sync frameworks (Pyreon, Solid) supply **no** `commit` hook and pay
no macrotask floor; async frameworks supply their scheduler wait (React:
`rAF + setTimeout(0)` for DefaultLane; Svelte 5: `flushSync()` + tick). DOM-verify
every iteration (`expectRows(N)` / `expectCompleted(N)`) so a framework that
"wins" by not committing **throws**, not passes.

## Methodology discipline (inherit from `bench:fair`, verbatim)

- Per-app **page isolation** — fresh `page.goto` per framework, no cross-suite heap/JIT bias.
- `--js-flags=--expose-gc` + **forced GC between iterations** (`runner.ts` pattern).
- **Adaptive warmup** 5–15 iters, stop when rolling p90 of last 3 within 10 % of prior 3.
- **20 timed runs**, median + p90 + **95 % bootstrap CI (1 000 resamples, non-parametric)** + CV.
- **`🤝` tie detection** — flag every app whose CI95 overlaps the leader's.
- Real Chromium via Playwright on the **production `vite build`** output (`vite preview`), DOM-verified.
- Optional `--throttle 4` (CDP `Emulation.setCPUThrottlingRate`) for mid-tier-device shape; off by default.

## Second deliverable: gzipped bundle-size delta

Real apps trade off framework overhead AND bundle weight. Report the **gzipped
main bundle per framework** next to the perf medians — this closes the second
half of the "fast in real apps" claim. Measure the same way
`scripts/check-bundle-budgets.ts` does (production define, gzip the built entry).

## PR sequencing (each row = one reviewable PR)

| PR | Scope | Verifiable green by |
| --- | --- | --- |
| 1 | `runner/` harness (lift `bench-fair.ts` + `stats.ts`) + `pyreon/` port (lift `native-todomvc-web`) + scenarios a/b/d wired for Pyreon → **real Pyreon numbers**. | `bun real-bench --only pyreon` emits a median+CI95 table. |
| 2 | `react/` port (real react-dom, idiomatic `useReducer`) + React commit-wait → first **2-framework head-to-head** (Pyreon vs React, scenarios a/b/d). | CI95-compared table, both DOM-verified. |
| 3 | `solid/` + `vue/` ports + their commit-waits. | 4-framework table. |
| 4 | `svelte/` port + scenarios c/e/f for all + bundle-size delta column. | Full 5-framework × 6-scenario table + gz column. |
| 5 | CI wiring (advisory job, nightly + `real-bench` label — mirror `perf.yml`), results checked into `perf-results/`, CLAUDE.md "Benchmark Results" updated to cite the real-app table. | Nightly artifact + sticky comment. |

## Acceptance bar (when can CLAUDE.md claim "fast in real apps"?)

Only after PR 4: a full, DOM-verified, CI95-reported table across **all five
real runtimes** on **all six scenarios**, with the **gzipped bundle delta**
column, reproduced across ≥2 machines (ratios portable, absolute ms machine-
dependent). Until then, every "fastest" statement stays scoped to the synthetic
benchmark — as it is today. **Do not publish a partial real-app table as if it
were the whole story; a 2-framework slice is evidence the harness works, not a
"Pyreon beats React in real apps" claim.**

---

_This spec deliberately lives in the example's README (a project doc), not in
`.claude/plans/` — plan substance belongs with the code it describes. It
converts the CLAUDE.md sketch into file-by-file, PR-by-PR executable steps so
the multi-day work can be picked up cold._
