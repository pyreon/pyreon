---
title: '@pyreon/devtools'
description: Chrome DevTools extension for inspecting Pyreon component trees, the reactive graph, effects, and performance.
---

`@pyreon/devtools` is a Chrome DevTools extension for inspecting Pyreon applications — a component tree, a live reactive graph (signals / computeds / effects), fire timeline, and a page-world console. It is a private workspace package (`packages/tools/devtools`), built and loaded unpacked.

<PackageBadge name="@pyreon/devtools" href="/docs/devtools" status="beta" />

## Installation

It lives in the Pyreon monorepo — build it from there:

```bash
bun install
bun run --filter='@pyreon/devtools' build
```

Then open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `packages/tools/devtools/dist/`. A **Pyreon** panel appears in Chrome DevTools.

## How it connects

The framework installs a hook automatically on the first `mount()` in the browser (no-op on the server, tree-shaken in production):

```ts
window.__PYREON_DEVTOOLS__
// component tree:  getComponentTree() · getAllComponents() · highlight(id)
//                  onComponentMount(cb) · onComponentUnmount(cb)
//                  enableOverlay() · disableOverlay()   (also Ctrl+Shift+P)
// reactive bridge: reactive.activate() · reactive.deactivate()
//                  reactive.getGraph() · reactive.getFires()
```

`$p` is a console helper for the same data (`$p.tree()`, `$p.components()`, `$p.help()`).

Four isolated execution contexts cooperate: a **page hook** (reads `__PYREON_DEVTOOLS__`), a **content script** (bridges the isolated-world boundary), a **background service worker** (routes panel ↔ page), and the **DevTools panel** UI.

## Panel tabs

The panel is skinned on the Pyreon brand identity (ink/ember/cyan, JetBrains Mono + Space Grotesk).

- **Components** — the mounted component tree (rebuilt from `parentId` — the framework registers post-order, so a parent's own `childIds` is empty when its children register first). A freshly-mounted component pulses with the signature ember signal-propagation animation (reduced-motion gated). Click to highlight the DOM node; the inspector shows id / parent / children. The toolbar **Inspect** toggle drives the element-picker overlay.
- **Signals** — every tracked signal / computed / effect: name, kind, value preview, subscriber count, fire count, sorted by activity; hot rows ember-tinted.
- **Graph** — a layered SVG dependency diagram (signals → derived → effects), ember edges on the recently-fired path.
- **Effects** — per-node fire lanes across the observed time window.
- **Profiler** — fires bucketed into 100 ms frames with a peak/frame summary.
- **Console** — evaluates expressions in the inspected page's own world (e.g. `__PYREON_DEVTOOLS__.reactive.getGraph()`), result streamed back.

## Programmatic API

The extension reads everything through a global hook the framework attaches in the browser — you can use the same surface directly (custom devtools, tests, an in-app debug panel) without the Chrome extension.

### The `window.__PYREON_DEVTOOLS__` hook

`@pyreon/runtime-dom` auto-installs the hook on the first browser `mount()` (idempotent, SSR-safe — a no-op when there is no `window`). It exposes the component-tree surface:

| Member                                            | Description                                 |
| ------------------------------------------------- | ------------------------------------------- |
| `version`                                         | Hook protocol version.                      |
| `getComponentTree()`                              | Root components as a collapsible hierarchy. |
| `getAllComponents()`                              | Flat list of every mounted component entry. |
| `highlight(id)`                                   | Briefly outlines a component's DOM element. |
| `onComponentMount(cb)` / `onComponentUnmount(cb)` | Subscribe to mount/unmount.                 |
| `enableOverlay()` / `disableOverlay()`            | Click-to-inspect element picker.            |
| `reactive`                                        | The opt-in reactive bridge (see below).     |

### Reactive bridge (opt-in)

The reactive bridge is a **leak-free, opt-in** introspection layer over the live signal / computed / effect graph, exported from `@pyreon/reactivity` and proxied onto `__PYREON_DEVTOOLS__.reactive`:

```ts
import {
  activateReactiveDevtools,
  deactivateReactiveDevtools,
  isReactiveDevtoolsActive,
  getReactiveGraph,
  getReactiveFires,
} from '@pyreon/reactivity'

activateReactiveDevtools() // attach — start recording the graph
const graph = getReactiveGraph() // { nodes, edges } snapshot, derived fresh
const fires = getReactiveFires() // bounded ring buffer of recent fires
deactivateReactiveDevtools() // detach — drops all retained state
```

Snapshot shapes:

```ts
type ReactiveNodeKind = 'signal' | 'derived' | 'effect'

interface ReactiveNode {
  id: number
  kind: ReactiveNodeKind
  name: string // signal `.label`, else synthetic (`derived#12` / `effect#7`)
  value: string // bounded preview (signals/derived only)
  subscribers: number // live downstream subscriber count
  fires: number // total fires/recomputes since activation
  lastFire: number | null // performance.now() of the last fire
}

interface ReactiveEdge {
  from: number // the reactive value being read
  to: number // the computed/effect that read it
}

interface ReactiveGraph {
  nodes: ReactiveNode[]
  edges: ReactiveEdge[]
}

interface ReactiveFire {
  id: number
  ts: number // performance.now() at fire time
}
```

**Zero cost until attached.** Every instrumentation point early-returns until `activateReactiveDevtools()` is called, and the single call site per node creation / fire sits inside the standard `process.env.NODE_ENV !== 'production'` gate, so it is fully tree-shaken from production builds. **No retention.** Nodes are held via `WeakRef` and pruned by a `FinalizationRegistry` — the registry never keeps a signal/computed/effect alive; edges and the fire buffer hold only numeric ids and timestamps, never node references or values. `getReactiveGraph()` recomputes edges fresh from the live subscriber sets on each call, so it never drifts out of sync.

This is the Foundation the extension's **Signals**, **Graph**, **Effects**, **Profiler**, and **Console** tabs consume. The Profiler tab buckets fire timestamps into 100 ms frames; a true per-frame _duration_ flamegraph additionally needs run-duration instrumentation in the Foundation (deferred).

Only user `signal()` / `computed()` / `effect()` are tracked — compiler-emitted DOM-binding plumbing (`renderEffect` / `_bind`) is intentionally excluded so the graph stays meaningful and the hottest path untouched. The extension consumes `reactive` defensively: a page running an older `@pyreon/runtime-dom` (no Foundation) shows an explicit "needs the Foundation" notice rather than a fake/empty surface — Components works regardless, and polling runs only while a reactive tab is open.
