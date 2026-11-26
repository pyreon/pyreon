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

**This section summarises the benchmark record as re-measured on 2026-11-26** (row board, core scenarios and keyed list re-measured on `28d24b6ed` with fixtures where every framework builds the same DOM, two runs each, Apple M3 Max, Chromium 159; author-written suites, one machine, Chromium only). The complete, authoritative record is [`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) at the repo root; the [benchmarks page](/docs/benchmarks) summarises it with every number and caveat.

On the krausest-style synthetic row-list suite (real Chromium via Playwright, production builds, 10 frameworks) Pyreon is **not alone at the front**. Read the numbers, not a headline. Wall-clock, lower is better, first of two runs:

| Operation | **Pyreon** | Vue 3.6 Vapor (RC) | Octane 0.19 | Vue 3 | Solid 1.9 | Solid 2.0 | Svelte 5 | React 19 | Published verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 rows | 7.40 | 7.50 | 7.46 | 7.42 | 8.09 | 8.07 | 8.23 | 9.44 | tie |
| Create 10,000 rows | 74.33 | 76.31 | 76.41 | 75.94 | 80.45 | 82.08 | 89.92 | 198.63 | split, not claimed |
| Partial update (every 10th) | 505µs | 535µs | 540µs | 840µs | 1.08 | 1.05 | 625µs | 750µs | tie (held back) |
| Swap rows | 480µs | 490µs | 500µs | 730µs | 625µs | 510µs | 1.18 | 5.89 | split (held back) |
| Remove row | 5.78 | 5.78 | 5.76 | 6.01 | 5.84 | 5.81 | 6.50 | 6.08 | tie |
| Clear rows | 95µs | 115µs | 115µs | 190µs | 440µs | 255µs | 300µs | 610µs | split (held back) |
| Append 1k→10k rows | 13.11 | 63.19 | 13.47 | 64.14 | 14.10 | 14.09 | 19.47 | 15.51 | tie (held back) |

(ms unless noted. The verdict compares Pyreon with the fastest rival across both runs; no row is a published Pyreon win.) In this session every framework, hand-written Vanilla included, ran partial update, swap and clear much faster than the day before, for a reason not yet found. Pyreon's intervals cleared every rival's on partial update, clear rows and append in both runs, but because the session's baseline moved, those rows keep the previous session's verdict until a second session agrees.

The honest read:

- **Pyreon wins one row-board result outright: the batch-timed select row** (1.78–1.85× over Octane, both runs). It **ties** the Vue 3.6 Vapor release candidate, Octane and Vue 3 on create 1,000, replace, partial update, remove and append. Clear rows, swap and create 10,000 split between runs, so none is claimed. The batch-timed clear cycle lost 1.02× to Octane in both runs of one session and tied in the other two; it is not claimed either way.
- **Against Solid 1.9 and Solid 2.0** Pyreon is faster on create, replace, partial update, clear, create 10,000 and append in both runs.
- **The margins are small.** Every interval here resamples whole page loads, because samples from one page load are not independent.
- **Most of these ops are layout-bound.** Create, replace, remove and append are dominated by browser layout that every framework pays identically.
- **Memory:** after the suite Pyreon (3.16MB) and Preact (3.15MB) are level, 0.01MB apart with no confidence interval, so neither is called the lightest.

### Where Pyreon does *not* win

- **Memory per component.** A mounted 2,047-component tree retains 356KB in Pyreon against 207KB in Solid 1.9 (1.72×); it is below Solid 2.0's 410KB. Mounting that tree ties Solid 1.9 in both runs (not a win) and is faster than Solid 2.0 and React in both.
- **A keyed list with conditional cells** (the `maplist` scenario): create and replace lose in both runs, with `<For>` (1.02–1.04×) and with a plain `.map()` of JSX rows (1.03–1.08×). Clearing 1,000 rows is a win with either (1.09–1.19× over Vue 3).
- **dbmon-style updates**, where every cell changes every tick, are a three-way tie with Octane and Svelte.
- **Signal creation** is about 5× slower than Preact Signals, and Preact also leads deep unobserved computed chains. Pyreon wins the computed diamond, effect propagation and batching on both V8 and JavaScriptCore.
- **Bundle size**: the same keyed-table app is 18.5KB gzipped in Pyreon against Solid's 7.7KB and Preact's 10.1KB.
- **This is synthetic, and author-judged.** Real-app shapes are measured too — TodoMVC against `react-dom@19`, a 12-field form against six form libraries, compiled SSR against Vue, Svelte and React, where Pyreon leads — but Pyreon's authors wrote and judge every one of these benches, on one machine in one browser engine, and no independent third-party run exists yet. Until one does, any performance claim stops at this evidence and does not extrapolate to your app.

So: a tie at the front of the row-list suite with one outright win (batch-timed select) and one batch-timed loss (clear cycle), level with Preact on the row-list heap and behind Solid 1.9 on memory per component, and behind on signal creation and bundle size.

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
