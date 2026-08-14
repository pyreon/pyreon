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

| Operation | **Pyreon** | Octane | Vue 3 | Solid | Svelte 5 | React 19 |
| --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 rows | **8.3** | 8.5 | 8.5 | 9.2 | 9.2 | 10.4 |
| Create 10,000 rows | **87.0** | 89.7 | 92.3 | 104.7 | 103.2 | 212.2 |
| Partial update (every 10th) | **0.8** | 0.9 | 1.1 | 3.9 | 1.4 | 1.0 |
| Select row | **0** | 0.1 | 0.4 | 0 | 0.4 | 0.3 |
| Remove row | **6.6** | 6.7 | 6.9 | 6.6 | 7.3 | 6.9 |
| Clear rows | 0.2 | **0.1** | 0.2 | 0.4 | 0.3 | 0.7 |

(Bold = the leader on that row, lower-is-better. Measured 2026-08-14 at load 2.7–9.2, with every competitor on its own documented fast path — Vue on `shallowRef`, Svelte on `$state.raw`. Pyreon leads or ties every op except **clear rows**, where Octane wins outright.)

The honest read:

- **Octane is now the nearest rival, not Solid.** On the 2026-08-14 run Pyreon is outright on 5 of 9 ops and tie-leader on 2 more; Octane takes `clear rows` outright and ties `replace` and `remove`. Pyreon's reproducible edges are bulk-create and partial-update (its `_bindText` direct-subscriber path is ~5× leaner per update than Solid's effect-based `insert`).
- **The real, robust win is bulk-create against the VDOM frameworks** — at 10,000 rows React is 2.4× and Preact 3.1× slower than Pyreon. This page previously also claimed ~2.5× over Svelte; that was **our own benchmark's fault**, not Svelte's — it ran Svelte on a deep `$state` proxy plus a redundant per-row copy inside the timed region. On its documented fast path Svelte is 1.19×, and Vue 1.06×. Signal frameworks cluster tightly here; only the VDOM ones pay a large reconciliation cost.
- **`select`/`partial` favor signal frameworks structurally** — they update O(changed) while a VDOM re-runs render to diff O(total).

### Where Pyreon does *not* win

- **Memory — correcting what this page used to say.** It claimed Pyreon was **6th of 7 on retained JS heap (≈3.1 MB)**. That was wrong, and the fault was our own harness: it read `usedJSHeapSize` after three *synchronous* `gc()` calls, which never yield, so memory awaiting collection was counted as retained. That penalised only the framework which defers reclamation by an event-loop turn — Pyreon. With the harness fixed to GC-and-yield until the counter settles, Pyreon measures **2.50 MB, 3rd of 8 and 2nd among frameworks** (2026-08-14: Vanilla 2.38 · Preact 2.47 · **Pyreon 2.50** · Solid 2.56 · Octane 2.60 · Svelte 2.66 · Vue 2.69 · React 2.86). Vue and Vanilla improved under the same fix, which is the evidence it was uniform rather than self-serving. The honest residual is that Pyreon uniquely defers ~0.67 MB by one turn — a latency, not a leak.
- **Octane is right behind — and this page should say so.** [Octane](https://octanejs.dev) (compiled React, Inferno's successor) joined the suite in 2026-08. On the 2026-08-14 full-field run it takes **`clear rows` outright** (100µs vs 200µs) and **ties `replace` and `remove`**; Pyreon takes 5 outright (create-1k, partial-update, swap, create-10k, append). Octane is second-closest on nearly every remaining row — 8.50 vs 8.30 at create-1k, 89.70 vs 87.00 at create-10k. The lead here is real but narrow, against one specific rival, on one workload shape.
- **Coverage, not just speed.** Octane's own suite runs 15 scenarios; this one meaningfully covers about 4. There is no cross-framework measurement here for hydration, streaming SSR, portals, deep context propagation, effect-heavy lists, or async waterfalls. Anything outside keyed row-list DOM work is simply unmeasured, not won.
- **This is a synthetic benchmark.** It's 1,000–10,000 rows of contrived data — exactly the shape fine-grained signals are best at. There is no op here where a VDOM might win (deep prop-diffing through large trees, concurrent rendering under input pressure). **A real-app head-to-head does not exist yet.** Until it does, "fastest" stops at this suite's evidence and does not extrapolate to your app.

So: genuinely fast where it counts for most UIs, 2nd among frameworks on memory, and not yet proven on real-world app shapes.

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
- **Memory is your tightest constraint** (very large client-held lists). Virtualize, or measure first. Pyreon measures 2nd among frameworks on retained heap, but it uniquely defers ~0.67 MB of reclamation by one event-loop turn — released in any real app, yet it means a snapshot taken at the wrong instant reads higher than the settled figure.
- **You need the proof before the promise.** The real-app benchmark and an independent upstream submission don't exist yet. If "trust, but verify" means you need third-party verification, it isn't here yet — and we'd rather tell you that than pretend.

## How it compares, in one table

| | **Pyreon** | Solid | React | Vue | Svelte |
| --- | --- | --- | --- | --- | --- |
| Reactivity | fine-grained signals | fine-grained signals | VDOM + hooks | proxy + VDOM | compiled signals |
| Re-renders components | no | no | yes | yes | no |
| Full-stack meta-framework | built-in (zero) | SolidStart | Next/Remix | Nuxt | SvelteKit |
| AI-native docs (llms + MCP) | yes | no | no | no | no |
| Synthetic bench (this suite) | leads | co-leads | mid | mid | mid |
| Retained memory | low | low | low | high | low |
| Ecosystem maturity | young | growing | huge | huge | large |

Pick the framework whose trade-offs match your project. For a lot of apps that's still React or Vue, and that's a fine answer. Pyreon is built for the cases where fine-grained reactivity, an integrated full-stack story, and AI-native tooling matter more than ecosystem size — and it tries to be honest about the rest.
