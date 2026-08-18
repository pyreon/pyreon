---
title: Architecture & prior art
---

# Architecture & prior art

This page states, plainly and without superiority claims, where Pyreon sits
relative to the frameworks it shares ideas with. The goal is an accurate map,
not a sales pitch — the same honesty bar applied everywhere else in these
docs.

## Lineage: the signals family

Pyreon uses **fine-grained signals**: reactive reads are tracked, and a change
updates exactly the DOM that depends on it — no virtual-DOM diff, no
component re-render. This is an independent implementation of ideas with a
well-established history (Knockout's observables, MobX, S.js, Vue's reactivity,
Solid's signals). Pyreon did not invent this model and does not claim to; it
implements it from scratch and extends it full-stack.

## How it relates to the mainstream frameworks

- **Solid** — the closest architectural peer. Same core idea: signals plus a
  compiler that turns JSX into direct DOM operations, no VDOM. Pyreon's
  signal runtime and compiler are its own code, and the design space overlaps
  heavily by convergence, not derivation. If you know Solid, Pyreon's mental
  model will feel familiar.
- **Vue** — closest in *spirit* among the three mainstream options: a
  reactivity system (refs/computed) plus a template compiler. Vue's Vapor
  mode is moving its output toward the same fine-grained, no-VDOM shape.
  Different ecosystem and surface; shared philosophy.
- **Svelte** — also compiler-driven; Svelte 5's runes brought its reactivity
  close to signals semantics. Shared "do the work at compile time"
  philosophy, different authoring surface.
- **React** — a deliberately different model: virtual DOM with
  reconciliation and re-render-on-change. Pyreon is **not** React-shaped.
  `@pyreon/react-compat` exists for migration ergonomics, not to claim
  architectural kinship.

## What Pyreon adds (scope, not "better")

These are differences in *scope and trade-offs*, not assertions of
superiority:

- **Full-stack via `@pyreon/zero`** — file-system routing, SSR/SSG/ISR/SPA,
  API routes, server actions, adapters — in the same signal model.
- **A multi-dimensional styling system** (`@pyreon/rocketstyle`) — states,
  sizes, variants, themes, dark mode compiled together.
- **An AI-oriented surface** — MCP server, per-package manifests, a
  Pyreon-specific linter — aimed at making the framework legible to coding
  agents.

Other frameworks make different, equally valid scope choices (React's
ecosystem breadth, Vue's gradual-adoption story, Svelte's minimalism,
Solid's focus). None of the above implies Pyreon is the right choice for
every project.

## Performance, stated honestly

**Retracted and corrected 2026-08-18, twice — this section previously
overstated Pyreon's lead because our own benchmark harness had three bugs,
all of which flattered Pyreon:** it rendered Octane's row id as
`{String(row.id)}` (its own idiomatic form passes the raw number), which
disabled a compiler fast path and made Octane look slower than it is; it let
five implementations' `String(row.id)` calls inflate a shared V8 engine
cache that the retained-heap metric charged to the framework; and the bench
fixture used `table-layout: auto`, which forced Chromium to re-measure the
whole table's column widths whenever an op widened a cell — this caused
`append`'s erratic timing and separately inflated the published Pyreon-vs-Solid
`partial update` lead by more than 2×. None was a Pyreon regression —
Pyreon's own numbers are unchanged or slightly better throughout. The fixes
are staged as open PRs (#2893, #2894, #2895, #2897, #2899, #2901, #2903 —
#2896 is unrelated to this suite) and have not merged as of this writing.

On the synthetic row-list benchmark (Chromium via Playwright), compiled
Pyreon is **competitive with the fastest frameworks measured**, with one
clear win that WIDENED after the table-layout fix rather than narrowing: it
runs **~2.6× faster than React and ~3.3× than Preact** at bulk-create
(10,000 rows), up from ~2.4×/~3.1×. It also takes a second outright win at
`append`, which similarly widened to **~1.14–1.20×** (was ~1.04× before the
table-layout root cause was found and fixed). Elsewhere it is mostly a
**statistical tie with [Octane](https://octanejs.dev)**, the nearest rival —
plausible ties on `create 1,000`, `replace`, `partial update`, and `remove`;
Octane wins `clear rows` outright (~1.45×, unaffected by the layout fix);
and `select row` has no honest multiplier to publish (both frameworks sit at
the edge of what real-Chromium timing can resolve). **A retraction that
matters on its own: the previously-published `partial update` lead over
Solid (~4.9×) was itself a table-layout artifact — the corrected figure is
~2.1×**, still a real lead, less than half the size claimed. The `create
1,000`/`replace` tie is itself a browser-layout-bound measurement, not just
a CI overlap — a profiling pass found layout is ~86% of that op and
statistically identical between arms, so the instrument structurally cannot
separate the frameworks there; the only reproducible signal is a small
JS-only Pyreon cost (~+28%) invisible in wall clock (see `docs/benchmarks`
for the full split). Important caveats, kept verbatim with the project's
internal record:

- It is **not** "fastest on all benchmarks." This is the **synthetic
  row-list suite** only, and on it Pyreon wins two ops outright
  (bulk-create, append) rather than most of the field — and the append
  number carries its own caveat: even after the table-layout fix it is
  ~90% layout cost, and the honest claim is end-to-end append cost
  including the layout it causes, not a claim about the reconciler alone.
  The "mid-pack on retained memory (6th of 7)" this page used to state was **our
  own harness scoring us wrong** in one direction, and "2nd among frameworks"
  — the correction this page then carried — was **our own harness scoring us
  wrong again, in the same direction**. Measured correctly, Pyreon is **3rd
  of 8 and tied with Preact** (2.50 MB) — a tie, not a ranking.
- These are synthetic-benchmark numbers. **Real-app head-to-head
  measurements are still pending** — treat cross-framework performance
  claims accordingly.

## Trade-offs we name ourselves

- **Components run once.** The mental model differs from React's
  render-on-change; see [Reactivity Rules](/docs/reactivity-rules).
- **A compile step is required** (the [Vite plugin](/docs/vite-plugin)) —
  Pyreon is not usable as a no-build script include.
- **Source maps**: the compiler's JS backend emits a correct V3 map, but the
  native (Rust) backend does not yet — a scoped follow-up. See
  [Compiler › Source maps](/docs/compiler#source-maps).

If a comparison here ever drifts from reality, treat the reality as
authoritative and the doc as the bug.
