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

On the synthetic row-list benchmark (Chromium via Playwright), compiled
Pyreon is the **fastest of the frameworks measured** — it leads or ties
Solid on **8 of 9 ops (7 outright)** and runs **2.4–3× faster than React,
Svelte and Preact** at bulk-create (10k rows). Important caveats, kept
verbatim with the project's internal record:

- It is **not** "fastest on all benchmarks." This is the **synthetic
  row-list suite** only; **Solid edges single-row `remove`** (the most
  VDOM-neutral op), and Pyreon is **mid-pack on retained memory** (6th of 7).
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
