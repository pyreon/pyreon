# E-autosplit: compiler-driven automatic code-splitting (reachability + weight graph)

## Question

Can a static reachability+weight pass automatically identify the
code-split boundaries a competent dev would hand-write (`lazy()` /
`island()`), well enough that auto-splitting matches or beats the
manual baseline on initial transferred bytes for a real app — with
**zero developer annotations** and **no new render-path waterfalls**?

(Origin: user asked "can the compiler be smart enough to auto-create
chunks so the user never writes async?" + "would a dependency graph +
analyses over it help?". This experiment tests the *detection* half —
the crux. If detection fails, the transform is moot.)

## GRADUATE / KILL / DEFER criteria (frozen before measuring)

- **GRADUATE**: on `examples/app-showcase`, the analyzer's auto-split
  candidate set hits **≥90% precision AND ≥90% recall** vs a frozen
  hand-labeled ground truth of correct split boundaries, AND projected
  initial-eager-bytes reduction ≥ the manual baseline (no regression),
  AND **zero** candidates that would split a synchronously-rendered
  (render-reachable) dependency.
- **KILL**: precision <70% (would split render-path deps → waterfalls)
  **OR** recall <70% (misses heavy deferrable deps → no real win)
  **OR** any candidate that splits a render-reachable dependency.
- **DEFER**: directionally right, detection works but below the
  GRADUATE bar, with no regression.

## Method

1. Analyzer (`src/analyze.ts`, `oxc-parser`, own-recursion walk — oxc
   passes no parent) over `examples/app-showcase/src` (95 files).
2. Reuse the **exact conservative deferral taxonomy** of
   `@pyreon/lint`'s `no-eager-import` /
   `no-heavy-import-only-in-handler`: a heavy `@pyreon/*` import is an
   auto-split candidate iff **every** reference to its bindings is in a
   deferred position (JSX `on*` handler, `onMount`/`onUnmount`/
   `onCleanup`, dynamic `import()`, timer/IO/idle callback). **Any**
   render-reachable reference disqualifies it (`effect`/`renderEffect`
   run at setup ⇒ render-reachable — same stance as the lint rule).
3. Heavy-package gz weights lifted verbatim from
   `scripts/bundle-budgets.json` (flow 15872, code 7168, document
   3328, document-primitives 2816, dnd 2816, charts 2048).
4. Hand-labeled ground truth (frozen): the *one* app-showcase site
   where a heavy dep is genuinely deferred-only is
   `sections/{invoice,resume}/ExportButtons.tsx` — `download()` from
   `@pyreon/document` is reachable only via the export-button click
   path. Every other heavy import (Chart, CodeEditor, Flow `<Handle>`,
   etc.) is **render-reachable within its own module**; its correct
   split boundary is the route/section, not the import site.

## Baseline

- Baseline SHA: `259b46e76` (origin/main HEAD at experiment start).
- App: `examples/app-showcase` (uses charts/code/document/
  document-primitives/flow/dnd — ≈110 KB gz of heavy deps).
- Measurement: deterministic static analysis (no wall-clock); raw at
  `results/analysis.json`. macOS, Bun 1.3.

## Experiment runs

| Metric | Value |
|---|---|
| app-showcase src files scanned | 95 |
| heavy `@pyreon/*` import sites | 15 |
| **auto-split candidates found** | **0** |
| eager-heavy sites (render-reachable) | 11 |
| projected initial bytes removable (gz) | **0** |
| total heavy gz referenced | 112,384 |
| precision vs ground truth | n/a (empty set) |
| **recall vs ground truth** | **0%** (the 1 true positive — `ExportButtons` `download` — was missed) |

Blind-spot evidence (`sections/invoice/ExportButtons.tsx`): `download`
is called inside `async function exportAs(ext)` (an **extracted named
handler**) wired via `onClick={() => exportAs(fmt.ext)}`. It is a
*genuine* deferred-only candidate, but the analyzer scores it
`renderRefs: 1` — the inline-JSX-handler taxonomy cannot see through
the extraction. Idiomatic handlers are extracted functions, not inline
arrows, so import-site reachability under-detects the *one* real case.

## Decision

**Outcome: KILL** (for the framed approach) **+ DEFER → redirected
follow-up** (for the real lever).

**Reasoning (with numbers):**

- Recall 0% (< 70% KILL threshold) — and not by accident. Two
  structural reasons, both measured here:
  1. **Wrong granularity.** In a real app, heavy deps are the
     *rendered content* of their section (Chart, CodeEditor, Flow
     handles) — render-reachable *within their module*. The correct
     split boundary is the **route/component subtree** that mounts
     them, not the import site. Pyreon's Zero fs-router **already**
     auto-splits at the route boundary — so the headline DX ("you
     don't hand-write `lazy()` for routes") **already exists**; the
     import-graph pass adds nothing there.
  2. **Fragile where it could apply.** The lone genuine candidate
     (`ExportButtons` deferred `download`) needs intraprocedural
     call-graph / data-flow ("is `exportAs` reachable only from a
     deferred position?"), not import-site inspection. The
     conservative inline taxonomy that ships in the lint rule misses
     it. Making it precise = a real escape-analysis pass, not "a
     smarter import graph."
- Net: a static **import-dependency** graph + analyses over it is
  **empirically ~0-surface and brittle** for auto-chunking on a real
  Pyreon app. This kills the attractive "make the compiler smart over
  imports" framing as a *new innovation lever* — the data says the
  bytes aren't reachable that way.

**This is a high-value negative**, in the same shape as the
resumability E1 kill: it prevents a multi-week speculative build by
disproving the hypothesis with measurement.

**Follow-up (filed, NOT folded in):** the real residual opportunity is
narrow and must be *sized before built*:

- **F1 — quantify what Zero's route-split already captures.** Measure
  app-showcase initial-chunk gz with route-splitting on vs a forced
  no-split build. If route-level already removes ~all 110 KB, the
  remaining lever is marginal and this whole direction is closeable.
- **F2 — escape-analysis auto-split of *non-route* deferred subtrees
  + extracted-handler heavy calls** (the `ExportButtons` shape):
  call-graph reachability, not import-site. Separate experiment;
  GRADUATE only if F1 shows the addressable bytes justify the
  correctness risk of an auto-inserted Suspense/`import()` boundary.

Verdict for the original question: **the compiler cannot get
meaningfully smarter at the import level — there is almost nothing
there in real apps, and Zero already auto-splits the layer that
matters (routes).** Genuine added leverage exists only in a smaller,
different bet (F2) whose payoff must be measured (F1) before any code.
