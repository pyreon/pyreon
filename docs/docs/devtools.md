---
title: '@pyreon/devtools'
description: Chrome DevTools extension for inspecting Pyreon component trees, signals, and performance.
---

`@pyreon/devtools` is a Chrome DevTools extension for inspecting Pyreon applications. It provides a component tree view, signal inspection, and performance monitoring.

<PackageBadge name="@pyreon/devtools" href="/docs/devtools" status="beta" />

## Installation

Install from the [Chrome Web Store](https://chromewebstore.google.com/) or build from source:

```bash
git clone https://github.com/pyreon/devtools.git
cd devtools
bun install
bun run build
```

Then load the `dist/` folder as an unpacked extension in `chrome://extensions`.

## Overview

### Execution Contexts

The extension is composed of four execution contexts that work together:

1. **Page hook** — injected into the inspected page to instrument Pyreon's runtime, capturing component mounts, signal updates, and render timings.
2. **Content script** — bridges between the page hook and the extension background, forwarding messages across the isolated world boundary.
3. **Background service worker** — coordinates communication between the content script and any open DevTools panels, maintaining connection state.
4. **DevTools panel** — the UI you interact with inside Chrome DevTools, rendering the component tree, signal inspector, and performance graphs.

### Component Tree Visualization

The component tree panel shows every mounted Pyreon component in a collapsible hierarchy. Selecting a component reveals its current props, internal signals, and computed values. Components re-rendering in real time are highlighted so you can spot unnecessary updates.

### Signal State Inspection

The signals panel lists every signal and computed value in the selected component's scope. Each entry shows the current value, the number of subscribers, and a history of recent changes. You can manually set a signal's value from the panel for quick debugging.

### Performance Monitoring

The performance tab records render durations and signal propagation times. Use it to identify slow components or overly broad signal dependencies that trigger excessive re-renders.

## Programmatic API

The extension reads everything through a global hook the framework attaches in the browser — you can use the same surface directly (custom devtools, tests, an in-app debug panel) without the Chrome extension.

### The `window.__PYREON_DEVTOOLS__` hook

`@pyreon/runtime-dom` auto-installs the hook on the first browser `mount()` (idempotent, SSR-safe — a no-op when there is no `window`). It exposes the component-tree surface:

| Member | Description |
| --- | --- |
| `version` | Hook protocol version. |
| `getComponentTree()` | Root components as a collapsible hierarchy. |
| `getAllComponents()` | Flat list of every mounted component entry. |
| `highlight(id)` | Briefly outlines a component's DOM element. |
| `onComponentMount(cb)` / `onComponentUnmount(cb)` | Subscribe to mount/unmount. |
| `enableOverlay()` / `disableOverlay()` | Click-to-inspect element picker. |
| `reactive` | The opt-in reactive bridge (see below). |

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

This is the Foundation the extension's **Signals**, **Graph**, **Effects**, and **Console** tabs consume; the Profiler tab additionally needs per-frame duration instrumentation (deferred).
