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

**This section summarises the benchmark run of 2026-11-05** (`main` at `779a82f01`, Apple M3 Max, close cells measured twice). The complete, authoritative record is [`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) at the repo root; the [benchmarks page](/docs/benchmarks) summarises it with every number and caveat.

On the krausest-style synthetic row-list suite (real Chromium via Playwright, production builds, 10 frameworks) Pyreon is **not alone at the front**. Read the numbers, not a headline. Wall-clock, lower is better, first of two runs:

| Operation | **Pyreon** | Vue 3.6 Vapor (RC) | Octane 0.16 | Vue 3 | Solid | Svelte 5 | React 19 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 rows | 🤝 7.26 | 🤝 7.35 | 7.47 | 🤝 7.33 | 7.88 | 8.07 | 9.04 |
| Create 10,000 rows | **72.64** | 74.83 | 74.31 | 73.99 | 78.75 | 87.51 | 192.01 |
| Partial update (every 10th) | 🤝 705µs | 🤝 710µs | 🤝 735µs | 1.04 | 1.27 | 810µs | 885µs |
| Swap rows | 805µs | **755µs** | 765µs | 1.06 | 955µs | 1.50 | 6.06 |
| Remove row | 🤝 5.70 | 🤝 5.76 | 🤝 5.74 | 5.89 | 🤝 5.76 | 6.35 | 🤝 5.78 |
| Clear rows | **130µs** | 145µs | 150µs | 255µs | 460µs | 335µs | 920µs |
| Append 1k→10k rows | **13.06** | 62.20 | 13.25 | 62.83 | 13.71 | 19.25 | 15.22 |

(ms unless noted. `🤝` = statistical tie with the leader, CI95 overlaps. Bold = outright leader on that row.)

The honest read:

- **Pyreon wins three ops in both runs** — clear rows (1.11–1.12×), create 10,000 and append (both by 1–2%). It **ties** the Vue 3.6 Vapor release candidate, Octane and Vue 3 on create 1,000, replace, partial update and remove.
- **It loses swap rows** to Vapor by 1.07× in one run; in the other the intervals touch.
- **The margins are small and the harness overstates its own precision**: its confidence intervals treat samples from the same page load as independent, so the 1–2% wins and the swap loss may not survive a corrected bootstrap.
- **`select row` is resolved by a batch instrument.** Pyreon is flat at about 0.43µs against Octane's 0.83µs at every list size (1.86–2.04×), while Solid's select is O(n).
- **Most of these ops are layout-bound.** Create, replace, remove and append are dominated by browser layout that every framework pays identically.
- **Memory:** retained heap after the suite ties Pyreon (3.08MB) with Preact (3.09MB) as the lightest framework.

### Where Pyreon does *not* win

- **Deep component-tree mount is the clearest loss.** Mounting 2,047 components, Pyreon is **1.15–1.18× slower than Solid** (3.59ms vs 3.06ms); React ties Pyreon.
- **dbmon-style updates**, where every cell changes every tick, are a three-way tie with Octane and Svelte.
- **Signal creation** is about 5× slower than Preact Signals, and Preact also leads deep unobserved computed chains. Pyreon wins the computed diamond, effect propagation and batching on both V8 and JavaScriptCore.
- **Bundle size**: the same keyed-table app is 17.2KB gzipped in Pyreon against Solid's 7.5KB and Preact's 10.1KB.
- **This is synthetic, and author-judged.** Real-app shapes are measured too — TodoMVC against `react-dom@19`, a 12-field form against six form libraries, compiled SSR against Vue, Svelte and React, where Pyreon leads — but Pyreon's authors wrote and judge every one of these benches, and no independent third-party run exists yet. Until one does, any performance claim stops at this evidence and does not extrapolate to your app.

So: a three-way tie at the front of the row-list suite with small outright wins on clear, create 10,000 and append, tied for lightest on memory, and behind on deep-tree mount, swap, signal creation and bundle size.

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
- **Memory is your tightest constraint** (very large client-held lists). Virtualize, or measure first. Pyreon ties Preact for the lightest retained heap on the row-list suite — tied, not ahead — and, like Solid, it allocates a per-row signal that plain-object frameworks do not.
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
