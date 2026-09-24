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

**This section was rewritten against the full benchmark run of 2026-09-23**, which was preceded by an audit of every harness. Most of the defects that audit found favoured Pyreon — competitor arms paying a slower row-data helper inside the timed window, Vue measured through hand-written render functions instead of its compiled templates, Solid arms skipping the per-cell work its compiler emits, correctness gates that a no-op could pass. All of it was fixed before measuring. The complete, authoritative record is [`BENCHMARKS.md`](https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md) at the repo root; the [benchmarks page](/docs/benchmarks) summarises it.

On the krausest-style synthetic row-list suite (real Chromium via Playwright, production builds, 100 pooled samples per cell) Pyreon is the **fastest framework measured on most ops** — but read the numbers, not a headline. These are wall-clock milliseconds, lower is better, measured against the real published `react@19`, `solid-js@1.9`, `vue@3.5`, `svelte@5` and `octane@0.4`:

| Operation | **Pyreon** | Octane | Vue 3 | Solid | Svelte 5 | React 19 |
| --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 rows | **8.83** | 9.27 | 9.30 | 9.47 | 9.73 | 11.25 |
| Create 10,000 rows | **88.31** | 94.94 | 97.10 | 93.23 | 105.09 | 216.97 |
| Partial update (every 10th) | 🤝 645µs | 🤝 675µs | 990µs | 1.30 | 725µs | 855µs |
| Select row | 15µs | 25µs | 305µs | 25µs | 380µs | 185µs |
| Swap rows | 🤝 655µs | 🤝 625µs | 865µs | 725µs | 1.36 | 6.66 |
| Remove row | 🤝 7.02 | 🤝 6.81 | 7.18 | 🤝 6.79 | 7.37 | 7.06 |
| Clear rows | **115µs** | 190µs | 225µs | 430µs | 315µs | 990µs |
| Append 1k→10k rows | **15.71** | 18.87 | 76.86 | 17.55 | 24.72 | 19.23 |

(ms unless noted. `🤝` = statistical tie, CI95 overlaps. Bold = outright leader on that row. `Select row` sits below 10 clock ticks and gets no verdict from this instrument.)

The honest read:

- **Outright wins on five ops** — create 1,000, replace, clear rows, create 10,000 and append. **Ties** with Octane on partial update and swap, and a three-way tie with Octane and Solid on remove. Octane (compiled React, Inferno's successor) is the nearest rival.
- **`clear rows` flipped from a loss to a win — but not like-for-like.** Earlier versions of this page recorded a loss to Octane; this run measured Octane 0.4.2 rather than 0.2.2, so the flip is not a confirmation of any Pyreon change.
- **`select row` is resolved by a batch instrument instead.** Timing K selects per window, Pyreon is flat at roughly 0.5µs against Octane's 0.9µs (1.85–1.95× at every list size), while Solid's select is O(n) — Pyreon is 247× faster at 20,000 rows.
- **The VDOM frameworks pay the most at scale.** At 10,000 rows React is 2.46× and Preact 3.35× slower than Pyreon (216.97 and 295.50ms vs 88.31ms).
- **Against hand-written Vanilla**, Pyreon costs 1.04–1.10× on most ops, 1.19× on swap and 1.21× on clear.
- **Most of these ops are layout-bound.** Create, replace, remove and append are dominated by browser layout that every framework pays identically, so small gaps there are real but mostly not framework JavaScript. And `create 1,000 rows` is a replace for 19 of 20 samples — there is no reset between runs, so only the first sample mounts into an empty list.
- **Memory:** retained heap after the suite puts Pyreon at 2.78MB, **tied with Preact** for the lightest framework (Vanilla 2.65, Solid 2.87, React 3.21).

### Where Pyreon does *not* win

- **Deep component-tree mount is the clearest loss.** Mounting 2,047 components, Pyreon is **1.29× slower than Solid** (4.20ms vs 3.25ms, Vanilla floor 2.45ms).
- **dbmon-style updates**, where every cell changes every tick, remove a signal graph's skip-unchanged advantage by construction. Svelte leads; Pyreon is 1.06× behind in a field that spans 1.25×.
- **Server rendering of large pages**: Vue's compiled SSR is 1.06× faster at 100 rows and 1.09× at 1,000. Pyreon leads small pages.
- **Signal creation** is about 5× slower than Preact Signals, and Preact also leads computed diamonds and deep computed chains. Pyreon wins effect propagation and batching.
- **Bundle size**: the same keyed-table app is 16.6KB gzipped in Pyreon against Solid's 7.5KB and Preact's 10.6KB.
- **This is still mostly synthetic, and author-judged.** Real-app shapes are now measured too — a TodoMVC against real `react-dom@19` (1.14× on add-100, 2.42× on toggle-1000, 4.24× on clear-1000) and a 12-field form against six form libraries, where Pyreon leads keystroke and reset and ties mount — but Pyreon's authors wrote and judge every one of these benches, and no independent third-party run exists yet. Until one does, "fastest" stops at this evidence and does not extrapolate to your app.

So: fastest on most of the row-list suite, tied with the nearest rival on the rest, tied for lightest on memory, and behind on deep-tree mount, large-page SSR, signal creation and bundle size.

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
