# Auto-split: compiler-driven automatic lazy boundaries

## Question

Can a **static reachability analysis** automatically identify which heavy
imports are reachable *only* through a deferred boundary (event handler /
`onMount`/`onCleanup`/`effect` callback) — at precision/recall high enough
to transform automatically — so the developer never hand-writes
`lazy()` / dynamic `import()`, **with no render-path waterfall**?

Scope is deliberately narrow: the *additional* deferral **beyond** what
Pyreon already auto-splits (fs-router route chunks, island registry).
i.e. heavy code imported on a route's render path but actually used only
behind an in-route interaction.

## GRADUATE / KILL / DEFER criteria (frozen before measurement)

Measured on a real app (`examples/app-showcase` — statically imports the
four `HEAVY_PACKAGES` with no manual intra-route splitting) against a
hand-labelled, frozen ground-truth set.

- **GRADUATE**: precision **≥ 0.90** AND recall **≥ 0.90** vs ground
  truth, AND every auto-split candidate is provably render-path-free
  (zero waterfall by construction), AND the incremental initial-JS
  reduction is **≥ 20%** of the heavy-dep weight that is not already
  route-split.
- **KILL**: precision **< 0.70** (can't be trusted to auto-transform —
  would defer code that renders → broken UI / waterfall) OR recall
  **< 0.70** OR any candidate is actually render-path.
- **DEFER**: between the two — the analysis is *correct* (no false
  positives that would break render) but the incremental reach over
  existing route/island auto-splitting is small on real code.

Frozen rationale: a false positive here is a **correctness bug** (defers
code the first paint needs → waterfall/blank), so the precision bar is
deliberately higher than recall. An auto-transform that is merely
"usually right" is unshippable; "always safe, sometimes limited reach"
is a DEFER, not a KILL.

## Method

1. **Analyzer** (`analyze.ts`, `oxc-parser` Visitor — the repo's standard,
   no regex): build the per-module import graph for `app-showcase/src`.
   For every module importing a `HEAVY_PACKAGES` member, classify each
   imported binding's **use sites** as:
   - *render-path* — referenced in JSX, component-body/setup scope, a
     `computed`/`renderEffect`, or module top-level; OR
   - *deferred-only* — referenced **exclusively** inside an event-handler
     arrow (`on*={...}`), `onMount`/`onUnmount`/`onCleanup` callback, a
     `setTimeout`/`requestIdleCallback`/`.then()` callback, or a
     `lazy(() => import())` thunk.
   A module is an **auto-split candidate** iff *every* heavy binding it
   imports is deferred-only (one render-path use disqualifies it —
   conservative by construction, matching `pyreon/no-eager-import` /
   `no-heavy-import-only-in-handler` context semantics).
2. **Detection quality**: `ground-truth.ts` hand-labels every
   heavy-importing module in `app-showcase` as `split` or `keep`, with a
   one-line rationale derived from reading the actual usage. Compute
   precision / recall / confusion of the analyzer's candidate set vs it.
3. **Outcome**: for the candidate set, estimate the incremental
   initial-JS saved if those imports become dynamic — bundled gzip
   weight via the same `Bun.build` shape as
   `scripts/check-bundle-budgets.ts` (workspace + bare deps externalised;
   gzip is the budgeted dimension). Cross-check no candidate is
   render-path (waterfall guard).
4. Record raw numbers in `results/<baseline-sha>.json`; write the verdict
   here. No production package is modified — the deliverable is this
   verdict, per the experiments framework.

## Baseline

- Baseline SHA: `259b46e76` (origin/main HEAD at experiment start)
- Target: `examples/app-showcase/src`
- `HEAVY_PACKAGES` (from `@pyreon/lint` `utils/imports.ts`, reused as the
  canonical oracle): `@pyreon/charts`, `@pyreon/code`,
  `@pyreon/document`, `@pyreon/flow`
- Hardware/OS: macOS, Bun bundler, noisy (many concurrent worktrees) —
  byte counts are deterministic, not wall-clock, so noise is irrelevant.

## Experiment runs

Target `examples/app-showcase/src` @ `259b46e76`. 10 modules statically
import a `HEAVY_PACKAGES` member. Frozen ground truth (`ground-truth.ts`,
hand-labelled by reading actual usage): **2 `split`** (resume +
invoice `ExportButtons` — `download` reachable only via `onClick`),
**8 `keep`** (render-path: `<Chart/>`, `<Flow/>`, `<CodeEditor/>`,
live `render()`, `createFlow()` at setup, …).

| Analyzer | Candidates | TP | FP | FN | TN | Precision | Recall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **v1 — lexical only** | (none) | 0 | 0 | 2 | 8 | n/a | **0.00** |
| **v2 — + call-graph** | resume + invoice `ExportButtons` | 2 | **0** | 0 | 8 | **1.00** | **1.00** |

Bug found + fixed mid-run (recorded for honesty): the first v1/v2 pass
returned 0/0 because `import { download }`'s specifier identifier was
miscounted as a render-path use of `download`, failing every
`every()`. After excluding import-specifier identifiers, v2 is exact.

Deferrable mass (the eager weight the resume/invoice **route chunk**
ships today via the static `@pyreon/document` import; same externals as
`scripts/check-bundle-budgets.ts`): **~367 KB gzip across 24 chunks**
(1.26 MB raw). See `results/259b46e76.json`.

## Verdict — **DEFER**

- **v1 (cheap, lint-style lexical detection): KILLed.** Recall **0.00**
  on real code — the dominant real pattern is a heavy call inside a
  component-scope async helper invoked only from a handler
  (`async exportAs(){ download(...) }` ← `onClick={() => exportAs()}`),
  which lexical context cannot see. A naive auto-transform here would
  defer **nothing**. This is the decisive finding: the cheap version
  does not work.
- **v2 (intra-module call-graph reachability): detection is perfect** —
  precision 1.00, recall 1.00, **zero false positives** ⇒ zero
  render-path module flagged ⇒ **no waterfall by construction**. The
  bet's core ("can a static pass safely auto-defer?") is **YES — but
  only with interprocedural reachability**. That quantifies the real
  cost: this is Qwik-Optimizer-class analysis, not a heuristic.
- **The incremental-win clause is NOT met → DEFER (not GRADUATE).**
  `app-showcase` is already **Zero fs-router route-split**, so
  `@pyreon/document` sits in the resume/invoice **route chunk**, never
  the initial entry. v2's win is **route-chunk-local** (~367 KB gz
  moved off those routes to an on-export-click sub-chunk), **not an
  initial-JS reduction**. The frozen GRADUATE clause ("≥20 % of
  heavy-dep weight *not already route-split*") has denominator ≈ 0:
  Pyreon's existing auto-route/island splitting already captures the
  initial-entry win this experiment hypothesised.

**Recommendation.** Do **not** ship the cheap version and do **not**
market "you never write `lazy()` / big initial-JS cut" — that is
inaccurate for a Zero app (already route-split). The honest, narrower
opportunity worth a follow-up: a **per-route-chunk optimiser for
interaction-only heavy deps**, built on **v2 call-graph reachability**
(v1 is dead), measured per-route with this same kill-gate, and
explicitly **decoupled from resumability** (E1 — already
measured-and-killed). Net: the analysis is real and safe; the payoff is
real but materially narrower than the pitch. Park it (P3 backlog) until
a route with a genuinely heavy interaction-only dep justifies the
compiler complexity.
