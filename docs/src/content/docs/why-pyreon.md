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

Pyreon is the **fastest framework on the standard synthetic row-list benchmark** (js-framework-benchmark ops, real Chromium via Playwright) — but read the numbers, not the headline. These are wall-clock milliseconds, lower is better, measured against the real published `react@19`, `solid-js@1.9`, `vue@3.5`, `svelte@5`, `preact@10`:

| Operation | **Pyreon** | Solid | Vue 3 | React 19 | Svelte 5 |
| --- | --- | --- | --- | --- | --- |
| Create 1,000 rows | **9.0** | 10.3 | 9.8 | 11.2 | 13.2 |
| Create 10,000 rows | **94.7** | 114.8 | 108.7 | 221.3 | 236.5 |
| Partial update (every 10th) | **0.8** | 4.9 | 1.6 | 1.1 | 2.2 |
| Select row | **0** | 0 | 0.7 | 0.3 | 0.4 |
| Remove row | **7.1** | 7.3 | 8.2 | 7.4 | 8.7 |

The honest read:

- **Pyreon co-leads Solid.** They're the same architecture (compiled fine-grained signals); on most ops they're tied within noise. Pyreon's reproducible edges are bulk-create and partial-update (its `_bindText` direct-subscriber path is ~5× leaner per update than Solid's effect-based `insert`).
- **The real, robust win is bulk-create at scale** — at 10,000 rows the VDOM frameworks pay a genuine 2.3–3.0× reconciliation cost (React 2.3×, Svelte 2.5×, Preact 3.0× slower than Pyreon).
- **`select`/`partial` favor signal frameworks structurally** — they update O(changed) while a VDOM re-runs render to diff O(total).

### Where Pyreon does *not* win

- **Memory.** On retained JS heap Pyreon is **6th of 7** (≈3.1 MB; only Vue is heavier). Per-row signal allocation + cleanup closures cost more than the VDOM frameworks. The benchmark measures and reports this honestly instead of hiding it.
- **This is a synthetic benchmark.** It's 1,000–10,000 rows of contrived data — exactly the shape fine-grained signals are best at. There is no op here where a VDOM might win (deep prop-diffing through large trees, concurrent rendering under input pressure). **A real-app head-to-head does not exist yet.** Until it does, "fastest" stops at this suite's evidence and does not extrapolate to your app.

So: genuinely fast where it counts for most UIs, honestly mid-pack on memory, and not yet proven on real-world app shapes.

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
- **Memory is your tightest constraint** (very large client-held lists). Virtualize, or measure first — Pyreon is mid-pack here.
- **You need the proof before the promise.** The real-app benchmark and an independent upstream submission don't exist yet. If "trust, but verify" means you need third-party verification, it isn't here yet — and we'd rather tell you that than pretend.

## How it compares, in one table

| | **Pyreon** | Solid | React | Vue | Svelte |
| --- | --- | --- | --- | --- | --- |
| Reactivity | fine-grained signals | fine-grained signals | VDOM + hooks | proxy + VDOM | compiled signals |
| Re-renders components | no | no | yes | yes | no |
| Full-stack meta-framework | built-in (zero) | SolidStart | Next/Remix | Nuxt | SvelteKit |
| AI-native docs (llms + MCP) | yes | no | no | no | no |
| Synthetic bench (this suite) | leads | co-leads | mid | mid | mid |
| Retained memory | mid-pack | low | low | high | low |
| Ecosystem maturity | young | growing | huge | huge | large |

Pick the framework whose trade-offs match your project. For a lot of apps that's still React or Vue, and that's a fine answer. Pyreon is built for the cases where fine-grained reactivity, an integrated full-stack story, and AI-native tooling matter more than ecosystem size — and it tries to be honest about the rest.
