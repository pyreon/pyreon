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

**This section was rewritten on 2026-08-18 to retract two overstated claims.** We found that our own benchmark harness had handicapped Octane — the nearest rival — on the row-list suite, and separately had let a browser engine artifact inflate the retained-memory rankings. Both bugs favored Pyreon; fixing them is what changed the numbers below, not a Pyreon regression (Pyreon's own medians are flat-to-better than the retracted run). The fixes are staged as open PRs (#2893, #2894, #2895, #2896, #2897, #2899) and have not merged as of this writing — treat the table below as the corrected destination, not yet the state of `main`.

Pyreon is **competitive with the fastest framework measured on the standard synthetic row-list benchmark** (js-framework-benchmark ops, real Chromium via Playwright) — but read the numbers, not a headline. These are wall-clock milliseconds, lower is better, measured against the real published `react@19`, `solid-js@1.9`, `vue@3.5`, `svelte@5`, `preact@10`:

| Operation | **Pyreon** | Octane | Vue 3 | Solid | Svelte 5 | React 19 |
| --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 rows | 8.41 | 🤝 8.45 | 8.48 | 9.16 | 9.23 | 10.46 |
| Create 10,000 rows | **88.91** | 90.37 | 91.95 | 105.70 | 103.91 | 215.06 |
| Partial update (every 10th) | 0.825 | 🤝 0.85 | 1.16 | 3.98 | 1.41 | 1.02 |
| Select row | at instrument floor | — | — | — | — | — |
| Remove row | 6.58 | 🤝 6.58 | 6.80 | 6.67 | 7.22 | 6.85 |
| Clear rows | 0.165 | **0.115** | 0.235 | 0.450 | 0.285 | 0.645 |

(`🤝` = statistical tie, CI95 overlaps. Bold = outright leader on that row. Measured on the corrected field, `--repeat 5`, load 1.58–2.81, every competitor on its own documented fast path — Vue on `shallowRef`, Svelte on `$state.raw`, Octane with the `String()` handicap removed. `Select row` has no published multiplier — see below.)

The honest read:

- **Octane is now the nearest rival, not Solid — and once the handicap is removed, it mostly ties Pyreon rather than trailing it.** Corrected verdicts: create-1,000, replace, partial-update, swap, and remove are all **statistical ties** with Octane; Pyreon **wins create-10,000 outright**; Octane **wins `clear rows`** (165µs vs 115µs, a real 1.43× loss, CI-disjoint). That is a genuine walk-back from the previous "outright on 5 of 9" claim — most of this suite is now a tie between two frameworks, not a Pyreon lead.
- **The real, robust win is bulk-create against the VDOM frameworks** — at 10,000 rows React is 2.4× and Preact 3.1× slower than Pyreon, and this margin is essentially unchanged by the correction (it was never affected by Octane's handicap or the retained-heap bug). This page previously also claimed ~2.5× over Svelte; that was **our own benchmark's fault**, not Svelte's — it ran Svelte on a deep `$state` proxy plus a redundant per-row copy inside the timed region. On its documented fast path Svelte is 1.19×, and Vue 1.06×. Signal frameworks cluster tightly here; only the VDOM ones pay a large reconciliation cost.
- **`select row` has no honest multiplier to publish.** Corrected timing (100/1,000/10,000 rows) puts Pyreon at 1.03/0.96/0.69µs and Octane at 1.37/1.53/1.15µs against a harness floor of 0.47–0.65µs — Octane is roughly flat across list length, which refutes an earlier claim that treated it as O(n) with a ~38× gap. The real gap is small (roughly 1.3–1.7×) and both frameworks are at the edge of what this instrument can resolve. We are publishing "Pyreon is at the floor; Octane is measurably but slightly above it," not a number.

### Where Pyreon does *not* win

- **Memory — corrected twice now, and this correction narrows the earlier claim.** This page first said Pyreon was 6th of 7 on retained heap; that was fixed in 2026-07 (a GC-timing bug in the harness) to "2nd among frameworks, 0.03MB behind Preact." **That "2nd" framing was also wrong** — a second harness bug let five implementations' `String(row.id)` calls inflate a shared V8 engine cache (`smi_string_cache`) that the metric then charged to the framework. Corrected: Vanilla 2.38 · Preact 2.50 = **Pyreon 2.50** · Solid 2.53 · Octane 2.69 · Svelte 2.70 · Vue 2.71 · React 2.89 MB. **Pyreon is 3rd of 8 and TIED with Preact — not 2nd, and not a win.** A tie has no ordinal. React/Vue/Svelte/Octane still carry the same ~63KB engine artifact from their own row-id text paths — a fixed cost every text-id implementation pays, unrelated to framework retention.
- **Octane is right behind — and mostly tied, not trailing.** [Octane](https://octanejs.dev) (compiled React, Inferno's successor) joined the suite in 2026-08. Once its own handicap is removed, it statistically ties Pyreon on five of the nine canonical ops (`create 1,000`, `replace`, `partial update`, `swap`, `remove`), sits at the same unresolvable floor as Pyreon on a sixth (`select row`), and **wins `clear rows` outright**. The lead we can honestly claim is narrower than previously published: one outright win (bulk-create), one tie-cluster, one loss.
- **Coverage, not just speed.** The suite now measures row-list ops, bundle size, SSR throughput, hydration, sustained wide updates (dbmon-style) and deep component-tree mount + context propagation. It still has no cross-framework measurement for streaming SSR, portals, effect-heavy lists, memoization walls, or async waterfalls, and it reports one memory figure where krausest reports five. Anything outside what is listed is simply unmeasured, not won.
- **And the expanded coverage found a loss.** On mounting a deep component tree (2,047 instances) Pyreon is **1.56× slower than Solid** — the only op in the suite where it is beaten outright. It is published rather than left out, because a benchmark that only contains your best shapes is marketing.
- **That loss was first published as 1.88×, and correcting it made us look better — which is exactly why it had to be checked.** Our Solid arm passed plain-object child props, skipping a cost Solid's own compiler output pays; compiling the snippet through `babel-preset-solid` showed it emits getter props. Fixing the arm moved Solid 2.70 → 3.20ms and the gap 1.88× → 1.56×. A benchmark you only audit when it flatters you is not a benchmark.
- **This is a synthetic benchmark.** It's 1,000–10,000 rows of contrived data — exactly the shape fine-grained signals are best at. There is no op here where a VDOM might win (deep prop-diffing through large trees, concurrent rendering under input pressure). **A real-app head-to-head does not exist yet.** Until it does, "fastest" stops at this suite's evidence and does not extrapolate to your app.

So: genuinely fast at bulk-create, mostly tied with the nearest rival elsewhere, tied (not ahead) on memory, and not yet proven on real-world app shapes.

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
- **Memory is your tightest constraint** (very large client-held lists). Virtualize, or measure first. Pyreon measures 3rd of 8 on retained heap, tied with Preact — not ahead of it — and it uniquely defers ~0.67 MB of reclamation by one event-loop turn — released in any real app, yet it means a snapshot taken at the wrong instant reads higher than the settled figure.
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
