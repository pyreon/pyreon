---
title: Why Pyreon
description: An honest case for (and against) Pyreon — what it is, where it's genuinely fast, where it isn't, and when you should pick something else.
---

This page is deliberately honest, including about where Pyreon loses. A framework that only tells you its wins isn't giving you the information you need to choose one.

## What Pyreon is

A signal-based, full-stack UI framework. Components are plain functions that **run once**; reactivity comes from fine-grained signals, not a virtual DOM and not per-render diffing. When a signal changes, only the exact DOM nodes that read it update — never the component, never the tree.

If you know Solid, this will feel familiar — Pyreon is in the same fine-grained-reactivity family. If you know React, the biggest shift is that **components don't re-run on every state change** (see [Coming from React](/docs/migrating-from-react)).

## The core idea: reactivity knows where to fire

```tsx
const count = signal(0)

// This <span> is the ONLY thing that re-runs when count changes.
// The component function around it ran exactly once.
return <span>{count()}</span>
```

No VDOM, no reconciliation, no `useMemo` to stop re-renders you didn't want. The compiler lowers your JSX to `cloneNode` templates with per-node bindings, so a signal write is a direct `textNode.data = …`, not a render pass.

## Is it fast? Honestly.

**This section summarises the benchmark record as refreshed on 2026-11-24** (row board and core scenarios re-measured on `fcccee261`, two runs each, Apple M3 Max, Chromium 159; author-written suites, one machine, Chromium only). The complete, authoritative record is [`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) at the repo root; the [benchmarks page](/docs/benchmarks) summarises it with every number and caveat.

On the krausest-style synthetic row-list suite (real Chromium via Playwright, production builds, 10 frameworks) Pyreon is **not alone at the front**. Read the numbers, not a headline. Wall-clock, lower is better, first of two runs:

| Operation | **Pyreon** | Vue 3.6 Vapor (RC) | Octane 0.19 | Vue 3 | Solid 1.9 | Solid 2.0 | Svelte 5 | React 19 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 rows | 7.29 | 🤝 7.25 | 🤝 7.39 | 🤝 7.33 | 8.02 | 8.02 | 8.16 | 9.13 |
| Create 10,000 rows | 73.09 | 74.38 | 🤝 73.98 | 🤝 73.89 | 78.79 | 79.79 | 87.54 | 195.91 |
| Partial update (every 10th) | 680µs | 🤝 680µs | 🤝 680µs | 1.04 | 1.19 | 1.28 | 785µs | 910µs |
| Swap rows | 745µs | 🤝 750µs | 🤝 825µs | 1.06 | 🤝 965µs | 835µs | 1.49 | 5.92 |
| Remove row | 5.70 | 🤝 5.64 | 🤝 5.52 | 🤝 5.90 | 🤝 5.79 | 🤝 5.73 | 6.38 | 6.01 |
| Clear rows | **125µs** | 145µs | 140µs | 225µs | 525µs | 295µs | 345µs | 655µs |
| Append 1k→10k rows | 13.00 | 62.12 | 🤝 13.24 | 62.88 | 13.87 | 13.98 | 19.68 | 15.62 |

(ms unless noted. `🤝` = statistical tie with Pyreon in that run, cluster-bootstrap CI95 overlaps. Bold = Pyreon outright in both runs.)

The honest read:

- **Pyreon wins clear rows in both runs** (1.12×), plus the batch-timed select row (1.58× over Octane). It **ties** the Vue 3.6 Vapor release candidate, Octane and Vue 3 on create 1,000, replace, remove, create 10,000 and append. Partial update and swap split between the two runs (swap was a 1.11× loss to Vapor in one), so neither is claimed.
- **Against Solid 1.9 and Solid 2.0** Pyreon is faster on create, replace, partial update, clear, create 10,000 and append in both runs.
- **The margins are small.** Every interval here resamples whole page loads, because samples from one page load are not independent.
- **Most of these ops are layout-bound.** Create, replace, remove and append are dominated by browser layout that every framework pays identically.
- **Memory:** Preact has the lightest retained heap after the suite (3.14MB); Pyreon is 3.21MB, level with Solid 1.9.

### Where Pyreon does *not* win

- **Memory per component.** A mounted 2,047-component tree retains 531.7KB in Pyreon, against 410.2KB in Solid 2.0 and 202–207KB in Solid 1.9. Mounting that tree is now a statistical tie with Solid 1.9 (it was a 1.15–1.18× loss on 2026-11-05, before #4199), and faster than Solid 2.0 and React.
- **A keyed list with conditional cells** (the `maplist` scenario): `<For>` loses clearing 1,000 rows (about 1.5× behind Vue 3 and Solid 2.0), and a plain `.map()` of JSX rows loses every op that creates, moves or removes rows.
- **dbmon-style updates**, where every cell changes every tick, are a three-way tie with Octane and Svelte.
- **Signal creation** is about 5× slower than Preact Signals, and Preact also leads deep unobserved computed chains. Pyreon wins the computed diamond, effect propagation and batching on both V8 and JavaScriptCore.
- **Bundle size**: the same keyed-table app is 18.5KB gzipped in Pyreon against Solid's 7.7KB and Preact's 10.1KB.
- **This is synthetic, and author-judged.** Real-app shapes are measured too — TodoMVC against `react-dom@19`, a 12-field form against six form libraries, compiled SSR against Vue, Svelte and React, where Pyreon leads — but Pyreon's authors wrote and judge every one of these benches, on one machine in one browser engine, and no independent third-party run exists yet. Until one does, any performance claim stops at this evidence and does not extrapolate to your app.

So: a tie at the front of the row-list suite with two outright wins (clear rows, batch-timed select), behind Preact and Solid on memory, and behind on signal creation and bundle size.

## Full-stack, not just a renderer

[`@pyreon/zero`](/docs/zero) is the meta-framework — file-system routing, SSR/SSG/ISR/SPA (even per-route), server actions, image/font optimization, deploy adapters (Vercel/Cloudflare/Netlify/Node/Bun). You don't assemble a stack; one install gives you the routing, data, forms, and devtools, all signal-aware.

## AI-native by construction

Pyreon ships `llms.txt`, `llms-full.txt`, and a real [MCP server](/docs/mcp) (`get_api`, `get_pattern`, `validate`, `get_anti_patterns`) generated from the same manifests as these docs. An AI assistant can query Pyreon's API surface, validate your code against the framework's foot-guns, and pull canonical patterns — without scraping a docs site. If you build with AI tooling, this is the one thing here that's genuinely ahead of the field rather than a better-executed version of something React already has.

## When to choose Pyreon

- You want fine-grained reactivity (no re-render mental overhead, no `useMemo` ceremony) **and** a batteries-included full-stack story in one framework.
- You care about bulk-render performance and the `O(changed)`-update model.
- You build with AI assistants and want machine-first docs + validation.
- You're comfortable adopting a young framework and reading its source when you hit an edge.

## When *not* to choose Pyreon

- **You need a large, battle-tested ecosystem today.** React/Vue/Svelte/Solid have years of components, hiring pools, and corporate backing. Pyreon's ecosystem is young. Its compat layers (`@pyreon/react-compat` et al.) let you bring some existing code, but they're a migration aid, not a replacement for an ecosystem.
- **Memory is your tightest constraint** (very large client-held lists or very large component trees). Virtualize, or measure first. Preact retains less heap than Pyreon on the row-list suite, a mounted component tree costs Pyreon more memory than Solid, and, like Solid, Pyreon allocates a per-row signal that plain-object frameworks do not.
- **You need the proof before the promise.** Every benchmark here, including the real-app shapes, is written and judged by Pyreon's authors, and an independent upstream submission doesn't exist yet. If "trust, but verify" means you need third-party verification, it isn't here yet — and we'd rather tell you that than pretend.

## How it compares, in one table

| | **Pyreon** | Solid | React | Vue | Svelte |
| --- | --- | --- | --- | --- | --- |
| Reactivity | fine-grained signals | fine-grained signals | VDOM + hooks | proxy + VDOM | compiled signals |
| Re-renders components | no | no | yes | yes | no |
| Full-stack meta-framework | built-in (zero) | SolidStart | Next/Remix | Nuxt | SvelteKit |
| AI-native docs (llms + MCP) | yes | no | no | no | no |
| Synthetic bench (this suite) | leads most ops | close behind (leads deep-tree mount) | mid | mid | mid |
| Retained memory | lowest (tied with Preact) | low | highest of the suite | mid | mid |
| Ecosystem maturity | young | growing | huge | huge | large |

Pick the framework whose trade-offs match your project. For a lot of apps that's still React or Vue, and that's a fine answer. Pyreon is built for the cases where fine-grained reactivity, an integrated full-stack story, and AI-native tooling matter more than ecosystem size — and it tries to be honest about the rest.
