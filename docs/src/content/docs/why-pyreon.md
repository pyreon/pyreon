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

**This section was rewritten on 2026-08-18, twice, to retract three overstated claims.** We found that our own benchmark harness had (1) handicapped Octane — the nearest rival — on the row-list suite, (2) let a browser engine artifact inflate the retained-memory rankings, and (3) used a CSS table-layout mode that forced Chromium to re-measure the whole table's column widths on any op that widened a cell — this is what caused `append`'s erratic timing AND inflated our published Pyreon-vs-Solid lead on `partial update` by more than 2×. All three bugs favored Pyreon; fixing them is what changed the numbers below, never a Pyreon regression. The fixes are staged as open PRs (#2893, #2894, #2895, #2897, #2899, #2901, #2903 — #2896 is unrelated, it only touches a different scenario) and have not merged as of this writing — treat the table below as the corrected destination, not yet the state of `main`.

Pyreon is **competitive with the fastest framework measured on the standard synthetic row-list benchmark** (js-framework-benchmark ops, real Chromium via Playwright) — but read the numbers, not a headline. These are wall-clock milliseconds, lower is better, measured against the real published `react@19`, `solid-js@1.9`, `vue@3.5`, `svelte@5`, `preact@10`:

| Operation | **Pyreon** | Octane | Vue 3 | Solid | Svelte 5 | React 19 |
| --- | --- | --- | --- | --- | --- | --- |
| Create 1,000 rows | 8.01 | 🤝 7.95 | 8.06 | 8.82 | 8.97 | 10.23 |
| Create 10,000 rows | **80.28** | 83.40 | 87.70 | 98.30 | 95.90 | 209.60 |
| Partial update (every 10th) | 650µs | 🤝 700µs | 1.03 | 1.39 | 1.25 | 890µs |
| Select row | at instrument floor | — | — | — | — | — |
| Remove row | 6.24 | 🤝 6.26 | 6.47 | 6.26 | 7.02 | 6.60 |
| Clear rows | 0.16 | **0.11** | 0.23 | 0.44 | 0.28 | 1.05 |
| Append 1k→10k rows | **14.24** | 16.27 | 70.98 | 16.17 | 21.22 | 17.75 |

(`🤝` = statistical tie, CI95 overlaps. Bold = outright leader on that row. Measured on the `table-layout: fixed` board (post-#2903) — see the retraction above. Rows without `🤝`/bold don't carry fresh CI in this handoff; treat as pending re-verification. `Select row` has no published multiplier — see below. **`Create 1,000 rows` is not what it sounds like — see below.**)

The honest read:

- **Octane is now the nearest rival, not Solid — and once the handicap is removed, it mostly ties Pyreon rather than trailing it.** Corrected verdicts: create-1,000, replace, partial-update, and remove are plausible **statistical ties** with Octane (pending fresh CI on this specific board); Pyreon **wins create-10,000 and append outright**, both WIDENED by the table-layout fix rather than narrowed; Octane **wins `clear rows`** (~1.45× loss, unaffected by the layout fix). That is a genuine walk-back from the previous "outright on 5 of 9" claim — most of this suite is a tie between two frameworks, not a Pyreon sweep, but it is now **two** real wins, not one.
- **`partial update` — our published ~4.9× lead over Solid was wrong by more than 2×, and this is the correction that matters most.** `partial update` widens a cell's text on every 10th row (appending `" !!!"`); under the fixture's OLD `table-layout: auto`, that forced Chromium to re-measure column widths across the whole table, and it penalized Solid disproportionately — Solid drops **4.03ms → 1.39ms (−66%)** on the fix, while every other framework drops only 15–24%. **We previously published "Solid ~3.90ms, ~4.9× Pyreon lead." That figure is retracted. The corrected lead is Pyreon 650µs vs Solid 1.39ms — ~2.1×.** The lead is still real, Solid's effect-based `insert` genuinely is slower than Pyreon's `_bindText` direct-subscriber path — just less than half of what we'd been claiming.
- **`Create 1,000 rows` and `replace` are, for 19 of 20 sampled runs, literally the same operation — and the tie between them is browser-bound, not a coincidence.** Two findings from a profiling pass (measured pre-table-layout-fix; the finding itself is unaffected, since it concerns the forced layout flush every `create`/`replace` pays regardless of table-layout mode). First: the suite has no reset between runs and row ids come from a monotonic counter, so only the FIRST of 20 timed runs mounts into an empty list — the other 19 hand the reconciler N brand-new keys against N rows still live in the DOM, which is structurally a replace. That's why `create` and `replace` report nearly identical numbers on both boards: they mostly *are* the same op. Second: splitting the timed region into its JS and forced-layout components (production build) found layout is ~86% of `create 1,000` and **statistically identical between Pyreon and Vanilla** — layout noise (±58–278µs across runs) is larger than the entire framework gap. The only real, reproducibly-measured signal is the JS term alone: a genuine ~+28% Pyreon-vs-Vanilla cost that is **invisible in wall clock** because the browser's own layout work swamps it. This is not a win claim or a loss claim for either op — it's a statement about what this instrument can and cannot see, and it's why we describe both as ties rather than pretending the wall-clock number resolves a framework difference.
- **The real, robust win is bulk-create against the VDOM frameworks — and it WIDENED after the table-layout fix** — at 10,000 rows React is **~2.6×** and Preact **~3.3×** slower than Pyreon (was ~2.4×/~3.1×; the whole board got faster, and the VDOM frameworks' relative gap grew, not shrank). This page previously also claimed ~2.5× over Svelte; that was **our own benchmark's fault**, not Svelte's — it ran Svelte on a deep `$state` proxy plus a redundant per-row copy inside the timed region. On its documented fast path Svelte is ~1.19×, and Vue ~1.09×. Signal frameworks cluster tightly here; only the VDOM ones pay a large reconciliation cost.
- **`append` is OUTRIGHT PYREON, and the margin WIDENED — its root cause is now identified.** It previously claimed an outright win (22.30ms), turned out to be measured on a bimodal-timing harness, and was briefly retracted to "unmeasured." **The bimodality's actual cause: the fixture's `table-layout: auto` forced a full-table column re-measure on every append (~93% of the op), and whether that expensive path fired depended on random label content and benchmark history — exactly why the timing mode mix differed per framework and per run.** Fixed to `table-layout: fixed` (identical policy for all eight impls). Two independent runs on the fixed board resolve it: Pyreon **14.24ms vs Octane 16.27ms (run 1) / 14.11ms vs 16.95ms (run 2) — a real, CI95-disjoint 1.14–1.20× win**, WIDER than the previously-published 1.04×. The bimodality guard (PR #2901) now shows **0 bimodal cells across the whole board** (was 7), and CV dropped from 29–43% to 3–7%. Because Vanilla's own median no longer straddles two timing modes, **a vs-Vanilla ratio is now honest and published**: Pyreon **+4.1% to +5.7%** over hand-written Vanilla — reversing the earlier instruction never to publish this ratio, specifically because the bimodality that made it dishonest is now fixed at the root. Two caveats travel with this number: even fixed, `append` is **~90% layout** and all eight frameworks emit byte-identical DOM, so the honest claim is *end-to-end append cost including the layout it causes*, not "Pyreon's reconciler is faster"; and the fixture is now less representative of real apps, which commonly do use auto-layout tables and pay this cost — the right trade for a controlled comparison, stated rather than hidden.
- **`select row` has no honest multiplier to publish.** Unaffected by the table-layout fix (no cell widens on this op). Timing (100/1,000/10,000 rows) puts Pyreon at 1.03/0.96/0.69µs and Octane at 1.37/1.53/1.15µs against a harness floor of 0.47–0.65µs — Octane is roughly flat across list length, which refutes an earlier claim that treated it as O(n) with a ~38× gap. The real gap is small (roughly 1.3–1.7×) and both frameworks are at the edge of what this instrument can resolve. We are publishing "Pyreon is at the floor; Octane is measurably but slightly above it," not a number.

### Where Pyreon does *not* win

- **Memory — corrected twice now, and this correction narrows the earlier claim.** This page first said Pyreon was 6th of 7 on retained heap; that was fixed in 2026-07 (a GC-timing bug in the harness) to "2nd among frameworks, 0.03MB behind Preact." **That "2nd" framing was also wrong** — a second harness bug let five implementations' `String(row.id)` calls inflate a shared V8 engine cache (`smi_string_cache`) that the metric then charged to the framework. Corrected: Vanilla 2.38 · Preact 2.50 = **Pyreon 2.50** · Solid 2.53 · Octane 2.69 · Svelte 2.70 · Vue 2.71 · React 2.89 MB. **Pyreon is 3rd of 8 and TIED with Preact — not 2nd, and not a win.** A tie has no ordinal. React/Vue/Svelte/Octane still carry the same ~63KB engine artifact from their own row-id text paths — a fixed cost every text-id implementation pays, unrelated to framework retention. This is unaffected by the table-layout fix (CSS layout mode has no bearing on JS heap retention).
- **Octane is right behind — and mostly tied, not trailing.** [Octane](https://octanejs.dev) (compiled React, Inferno's successor) joined the suite in 2026-08. Once its own handicap is removed, it plausibly ties Pyreon on most ops (pending fresh CI on the table-layout-fixed board) and **wins `clear rows` outright**. The lead we can honestly claim is narrower than previously published: two outright wins (bulk-create, append), a tie-cluster, one loss.
- **Coverage, not just speed.** The suite now measures row-list ops, bundle size, SSR throughput, hydration, sustained wide updates (dbmon-style) and deep component-tree mount + context propagation. It still has no cross-framework measurement for streaming SSR, portals, effect-heavy lists, memoization walls, or async waterfalls, and it reports one memory figure where krausest reports five. Anything outside what is listed is simply unmeasured, not won.
- **And the expanded coverage found a loss.** On mounting a deep component tree (2,047 instances) Pyreon is **1.36× slower than Solid** (2.31ms Vanilla floor, 3.26ms Solid, 4.44ms Pyreon) — the only op in the suite where it is beaten outright. It is published rather than left out, because a benchmark that only contains your best shapes is marketing.
- **That loss has been corrected twice, first upward against us, then downward in our favor — and both corrections were published with the same rigor.** It was first measured at 1.88×. Our Solid arm passed plain-object child props, skipping a cost Solid's own compiler output pays; compiling the snippet through `babel-preset-solid` showed it emits getter props. Fixing the arm moved Solid 2.70 → 3.20ms and the gap 1.88× → 1.56× — that correction made us look better, which is exactly why it had to be checked. **The 1.56× figure was then itself retracted**: it was measured against Pyreon's own PRE-fix code. A follow-up perf fix (`jsx()` zero-copy + single-pass `makeReactiveProps`) landed afterward, and re-measuring the full three-way comparison on current main narrows the honest gap to **1.36×**. The remaining 1.18ms gap has a measured breakdown: ~0.50ms (42%) is a compiler limitation (Pyreon bails its template fast path on any component child; Solid's doesn't) that a hand-written candidate fix cuts by ~11% — an implementation PR is in flight, not yet shipped; getter-shaped reactive props are a cost BOTH frameworks pay (~20% each, not a Pyreon-specific tax); and ~0.38ms looks like the genuine irreducible price of owner-based context and per-component disposal. A benchmark you only audit when it flatters you is not a benchmark — this correction runs in Pyreon's favor, unlike most of the ones on this page, and it's published anyway.
- **A bimodality guard (#2901) closes the class of contamination that let `append`'s figure ship wrong for as long as it did.** It computes `capture = median / fastModeCentre` per cell and fails the run when it exceeds a calibrated threshold, naming the offending op. It exists because every prior gate checked a cell's own internal consistency but nothing checked whether one op's slow-mode tail was leaking into its neighbours. Worth recording as a lesson on its own: the append bimodality was first (wrongly) attributed to residue from the preceding `create 10,000` op, and that theory was refuted by measurement — with NO preceding op append was 60/60 slow, with the full suite before it 90% fast, the opposite of what residue predicts. The actual cause (table-layout) was found only by measuring the theory instead of trusting it.
- **This is a synthetic benchmark.** It's 1,000–10,000 rows of contrived data — exactly the shape fine-grained signals are best at. There is no op here where a VDOM might win (deep prop-diffing through large trees, concurrent rendering under input pressure). **A real-app head-to-head does not exist yet.** Until it does, "fastest" stops at this suite's evidence and does not extrapolate to your app.

So: genuinely fast at bulk-create and at append, mostly tied with the nearest rival elsewhere, tied (not ahead) on memory, and not yet proven on real-world app shapes.

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
