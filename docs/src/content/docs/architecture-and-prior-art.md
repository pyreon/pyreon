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

**Restated against the full benchmark run of 2026-09-23.** That run was
preceded by an audit of every harness, and most of the defects it found
flattered Pyreon — competitor arms paying a slower helper inside the timed
window, Vue measured through hand-written render functions instead of its
compiled templates, Solid arms skipping work its compiler emits. All were
fixed before measuring. The authoritative record is `BENCHMARKS.md` at the
repo root; the [benchmarks page](/docs/benchmarks) summarises it.

On the krausest-style synthetic row-list benchmark (Chromium via
Playwright), compiled Pyreon is **the fastest framework measured on five of
nine ops outright** — create 1,000, replace, clear rows, create 10,000 and
append — and **statistically tied with [Octane](https://octanejs.dev)**, the
nearest rival, on partial update and swap, and with Octane and Solid on
remove. `select row` sits below the clock resolution of that instrument; a
batch-timed run resolves it at roughly 0.5µs for Pyreon against 0.9µs for
Octane. The VDOM frameworks pay the most at scale: at 10,000 rows React is
2.46× and Preact 3.35× slower. Against hand-written Vanilla, Pyreon costs
1.04–1.10× on most ops. Important caveats, stated as the project's
record:

- It is **not** "fastest on all benchmarks." Mounting a deep component tree
  (2,047 components) is **1.29× slower than Solid**; Vue's compiled SSR is
  1.06–1.09× faster on 100- and 1,000-row pages; Preact Signals creates
  signals about 5× faster; and the same app ships 16.6KB gzipped against
  Solid's 7.5KB.
- Create, replace, remove and append are dominated by browser layout every
  framework pays identically, so small gaps there are mostly not framework
  JavaScript. Retained heap after the suite ties Preact for the lightest
  framework (2.78 MB) — a tie, not a ranking.
- These are author-judged benchmarks, and no independent third-party run
  exists yet — treat cross-framework performance claims accordingly.

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
