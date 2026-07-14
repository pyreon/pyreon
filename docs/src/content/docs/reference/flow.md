---
title: "Flow Diagrams — API Reference"
description: "Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout via elkjs"
---

# @pyreon/flow — API Reference

> **Generated** from `flow`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [flow](/docs/flow).

Reactive flow diagrams for Pyreon. Signal-native nodes and edges, pan/zoom via pointer events + CSS transforms, auto-layout via lazy-loaded elkjs. No D3 dependency. Each node mounts exactly once across the lifetime of the graph; drags and selection patches are O(1) via per-node reactive accessors, so a 60fps drag in a 1000-node graph stays cheap.

> **Peer dependencies:** `@pyreon/runtime-dom` — install alongside this package.

## Features

- createFlow&lt;TData&gt; generic over node data shape
- useFlow(config) component-scoped wrapper that auto-disposes on unmount
- Custom node/edge renderers with reactive accessor props
- Pan/zoom via pointer events + CSS transforms (no D3)
- Auto-layout via lazy-loaded elkjs
- toJSON / fromJSON round-trip serialization
- Configurable edge markers (arrow / arrowclosed, per-edge markerStart/markerEnd, deduped &lt;defs&gt;)
- Render virtualization via onlyRenderVisibleElements (cull off-screen nodes/edges, re-filter on pan/zoom)
- Opt-out object-snapping (snapToObjects: false) — skips the O(N)/frame helper-line scan, ~3-4x faster drags on large graphs

## Complete example

A full, end-to-end usage of the package:

```tsx
import { createFlow, useFlow, Flow, Background, Controls, MiniMap, Handle, Position, type NodeComponentProps } from '@pyreon/flow'

// createFlow is generic over node `data` shape — typed consumers
// pass their data type explicitly and `node.data.kind` narrows
// correctly without any index signature on the data interface.
interface WorkflowData {
  kind: 'trigger' | 'filter' | 'transform' | 'notify'
  label: string
}

const flow = createFlow<WorkflowData>({
  nodes: [
    { id: '1', type: 'custom', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } },
    { id: '2', type: 'custom', position: { x: 200, y: 100 }, data: { kind: 'notify', label: 'End' } },
  ],
  edges: [{ id: 'e1', source: '1', target: '2', animated: true }],
})

flow.addNode({ id: '3', type: 'custom', position: { x: 100, y: 200 }, data: { kind: 'transform', label: 'New' } })
flow.addEdge({ source: '1', target: '3' })
await flow.layout('layered', { direction: 'RIGHT', nodeSpacing: 50, layerSpacing: 100 })  // lazy-loaded elkjs
// `direction`/`layerSpacing`/`edgeRouting` apply to layered/tree only —
// `force`/`stress`/`radial`/`box`/`rectpacking` silently ignore them.
// `nodeSpacing` is the only LayoutOptions field respected by every algorithm.

// Prefer `useFlow` inside components — it's `createFlow` + auto-dispose
// on unmount. Use `createFlow` only for singleton/app-store flows that
// outlive the component tree.
const MyDiagram = () => {
  const flow = useFlow<WorkflowData>({ nodes: [], edges: [] })
  return <Flow instance={flow}><Background /></Flow>
}

// Custom node renderers — every prop except `id` is a REACTIVE
// ACCESSOR (`() => T`), not a plain value. Read inside reactive
// scopes (JSX expression thunks, effect, computed) so the node
// patches in place when ANY underlying state changes. Each node
// mounts EXACTLY ONCE across the lifetime of the graph regardless
// of how many drags, selection clicks, or updateNode mutations
// happen — internally <Flow> uses <For> keyed by node.id plus
// per-node accessors that read live state from instance.nodes().
function CustomNode(props: NodeComponentProps<WorkflowData>) {
  return (
    <div
      class={props.selected() ? 'selected' : ''}
      style={() => `cursor: ${props.dragging() ? 'grabbing' : 'grab'}`}
    >
      <Handle type="target" position={Position.Left} />
      {props.data().label}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

<Flow instance={flow} nodeTypes={{ custom: CustomNode }}>
  <Background variant="dots" gap={20} />
  <Controls position="bottom-left" />
  <MiniMap nodeColor={(node) => '#6366f1'} />
</Flow>

// Serialization round-trips for sidecar editors / persistence:
const json = flow.toJSON()         // { nodes, edges, viewport }
flow.fromJSON({ nodes, edges })    // restore from saved state
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`createFlow`](#createflow) | function | Create a reactive flow instance. |
| [`useFlow`](#useflow) | hook | Component-scoped wrapper around `createFlow` — identical shape plus an implicit `onUnmount(() => flow.dispose())`. |
| [`Flow`](#flow) | component | Main flow container. |
| [`Background`](#background) | component | Grid background inside a `<Flow>`. |
| [`Controls`](#controls) | component | Zoom / fit-view button cluster plus a live zoom-level readout. |
| [`MiniMap`](#minimap) | component | Overview minimap of the full graph. |
| [`Handle`](#handle) | component | Connection handle on a custom node — exposes a connectable point that edges attach to. |
| [`Panel`](#panel) | component | Overlay panel positioned absolutely relative to the flow viewport. |
| [`NodeResizer`](#noderesizer) | component | Render drag handles inside a custom node to resize it. |
| [`NodeToolbar`](#nodetoolbar) | component | A floating toolbar placed beside its host node (default `position: "top"`, `offset` 8px). |
| [`MarkerType / Position`](#markertype-position) | constant | The two flow enums. |
| [`edge-path-helpers`](#edge-path-helpers) | function | SVG-path builders for CUSTOM edge components. |
| [`computeLayout`](#computelayout) | function | Auto-layout via a lazy-loaded `elkjs` (cached singleton — zero bundle cost until first call). |

## API

### createFlow `function`

```ts
<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>
```

Create a reactive flow instance. Generic over node data shape — `createFlow<MyData>(...)` returns `FlowInstance<MyData>` so `node.data.kind` narrows correctly without an `[key: string]: unknown` index signature on consumer types. Defaults to `Record<string, unknown>` when no generic is supplied. The returned instance owns signal-native nodes / edges and exposes CRUD, selection, viewport (zoom / pan / fitView), and auto-layout via lazy-loaded elkjs (first `.layout()` call fetches a ~1.4MB chunk). Pan / zoom uses pointer events + CSS transforms — no D3.

**Example**

```tsx
// Generic over node data shape — typed consumers get strong narrowing
interface WorkflowData {
  kind: 'trigger' | 'filter' | 'transform' | 'notify'
  label: string
}

const flow = createFlow<WorkflowData>({
  nodes: [
    { id: '1', type: 'custom', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } },
    { id: '2', type: 'custom', position: { x: 200, y: 100 }, data: { kind: 'notify', label: 'End' } },
  ],
  edges: [{ id: 'e1', source: '1', target: '2', animated: true }],
})

// node.data.kind narrows to the typed union, not unknown
const trigger = flow.findNodes((n) => n.data.kind === 'trigger')

flow.addNode({ id: '3', type: 'custom', position: { x: 100, y: 200 }, data: { kind: 'transform', label: 'New' } })
await flow.layout('layered', { direction: 'RIGHT', nodeSpacing: 50, layerSpacing: 100 })
// LayoutOptions applicability: direction / layerSpacing / edgeRouting apply to layered/tree only;
// force/stress/radial/box/rectpacking silently ignore them. nodeSpacing applies to all algorithms.
const json = flow.toJSON(); flow.fromJSON(json)       // round-trip serialization
```

**Common mistakes**

- Forgetting to declare `@pyreon/runtime-dom` in consumer app deps — flow's JSX emits `_tpl()` which needs runtime-dom imports
- Reading `NodeComponentProps.data` / `.selected` / `.dragging` as plain values — all three are REACTIVE ACCESSORS: `props.data()`, `props.selected()`, `props.dragging()`
- Calling `props.data()` OUTSIDE a reactive scope — captures the value once at component setup, defeating the per-node reactivity. Read it inside JSX expression thunks, `effect`, or `computed`
- Adding `[key: string]: unknown` index signature to your node data interface — no longer needed now that `createFlow` is generic. Pass `createFlow<MyData>(...)` instead
- Setting `LayoutOptions.direction` (or `layerSpacing`, or `edgeRouting`) on a force / stress / radial / box / rectpacking layout and expecting a directional result — these options are namespaced under ELK's layered / tree pipelines and silently ignored by the geometric algorithms. Dev-mode `console.warn` fires when this happens
- Missing `<Flow nodeTypes={{ key: Component }}>` registration — `node.type` strings dispatch to that map, unregistered types fall through to the default renderer
- Using `createFlow` inside a component body without `onUnmount(() => flow.dispose())` — prefer `useFlow` which auto-disposes
- Using `direction: 'row'` on flow's containing Element layout — Pyreon `Element` accepts `'inline'` / `'rows'` / `'reverseInline'` / `'reverseRows'`, not CSS flex-direction values like `'row'` or `'column'`
- Confusing `markerEnd: null` with omitting it — `null` is the explicit "no end arrow" opt-out that overrides `config.defaultMarkerEnd`; OMITTING it falls back to the flow default (a closed arrowhead). Set `config.defaultMarkerEnd: null` to make every edge arrowless by default
- Expecting `onlyRenderVisibleElements` to cull an edge whose line crosses the viewport while BOTH its endpoint nodes are off-screen — only nodes (and the edges touching at least one visible node) are kept; a long edge spanning two off-screen nodes is culled (rare; matches React Flow)
- Leaving object-snapping on for very large graphs — `snapToObjects` (default `true`) runs an O(N) align-to-other-nodes scan on EVERY drag frame; on big graphs it dominates per-frame cost. Set `snapToObjects: false` to skip it (≈3-4× faster drags) when you don't need helper-line alignment

**See also:** `useFlow` · `FlowInstance` · `Flow`

---

### useFlow `hook`

```ts
<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>
```

Component-scoped wrapper around `createFlow` — identical shape plus an implicit `onUnmount(() => flow.dispose())`. Prefer inside component bodies; use `createFlow` directly only for flows owned outside the component tree (app stores, singletons, SSR-shared state) where you'll dispose at the correct lifecycle point yourself.

**Example**

```tsx
// Component-scoped flow — auto-disposes when the component unmounts.
// Identical shape to createFlow, plus an implicit onUnmount(() => flow.dispose()).
const MyDiagram = () => {
  const flow = useFlow<WorkflowData>({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } }],
    edges: [],
  })
  return (
    <Flow instance={flow}>
      <Background />
    </Flow>
  )
}
```

**Common mistakes**

- Using `useFlow` outside a component body — the `onUnmount` hook registration requires an active component setup context, same constraint as every `useX` hook
- Using `createFlow` inside a component and forgetting `onUnmount(() => flow.dispose())` — that was the footgun `useFlow` exists to prevent
- Storing the returned instance in a module-level variable — bypasses the auto-dispose guarantee; use `createFlow` for that pattern

**See also:** `createFlow`

---

### Flow `component`

```ts
(props: FlowComponentProps) => VNodeChild
```

Main flow container. Accepts a `FlowInstance` via the `instance` prop plus optional `nodeTypes` / `edgeTypes` maps for custom renderers, `style` / `class`, and `ariaLabel` (the accessible name for the focusable canvas — defaults to `"Flow diagram"`; the container is `role="group"` + `tabindex=0`, so set a specific name like `"Pipeline editor"`). Internally uses `<For>` keyed by `node.id` plus per-node reactive accessors that read live state from `instance.nodes()` — each node mounts EXACTLY ONCE across the lifetime of the graph regardless of drags, selection clicks, or `updateNode` mutations. A 60fps drag in a 1000-node graph stays O(1) per frame. JSX components are NOT generic at the call site (`<Flow<MyData> />` is invalid JSX); `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass `FlowInstance<MyData>` without casting.

**Example**

```tsx
<Flow instance={flow} ariaLabel="Pipeline editor" nodeTypes={{ custom: MyNode }} edgeTypes={{ arrow: ArrowEdge }}>
  <Background variant="dots" gap={20} />
  <Controls position="bottom-left" />
  <MiniMap nodeColor={(node) => '#6366f1'} />
</Flow>

// Custom node renderer — every prop except id is a REACTIVE ACCESSOR
function MyNode(props: NodeComponentProps<WorkflowData>) {
  return (
    <div
      class={props.selected() ? 'selected' : ''}
      style={() => `cursor: ${props.dragging() ? 'grabbing' : 'grab'}`}
    >
      {props.data().label}
    </div>
  )
}
```

**Common mistakes**

- `<Flow<MyData> />` is invalid JSX — the component is not generic at the call site; pass a typed `FlowInstance<MyData>` via `instance` prop
- Missing `nodeTypes` entry for a `node.type` string — falls through to the default renderer
- Mutating `instance.nodes()` return value directly — use `instance.addNode` / `updateNode` / `removeNode` so the internal signals fire

**See also:** `createFlow` · `Background` · `Controls` · `MiniMap` · `Handle`

---

### Background `component`

```ts
(props?: { variant?: "dots" | "lines" | "cross"; gap?: number; size?: number; color?: string }) => VNodeChild
```

Grid background inside a `<Flow>`. Place as a direct child. `variant` is `"dots"` (default), `"lines"`, or `"cross"`; `gap` is the pattern spacing (default `20`); `size` is the dot radius / line thickness (default `1`); `color` sets the pattern color (default `"#ddd"`). Renders as an SVG `<pattern>` at the back of the z-order.

**Example**

```tsx
<Flow instance={flow}>
  <Background variant="dots" gap={24} size={1} color="#e5e7eb" />
</Flow>
```

**See also:** `Flow` · `Controls` · `MiniMap`

---

### Controls `component`

```ts
(props?: { showZoomIn?: boolean; showZoomOut?: boolean; showFitView?: boolean; showLock?: boolean; position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) => VNodeChild
```

Zoom / fit-view button cluster plus a live zoom-level readout. Renders absolutely inside the flow viewport at the configured corner (default `"bottom-left"`). `showZoomIn` / `showZoomOut` / `showFitView` default to `true` and dispatch to `instance.zoomIn()` / `zoomOut()` / `fitView()`; `showLock` (default `false`) adds a lock/unlock toggle. Each button is `title`-labelled for accessibility.

**Example**

```tsx
<Flow instance={flow}>
  <Controls position="bottom-right" showLock />
</Flow>
```

**See also:** `Flow` · `Background` · `MiniMap`

---

### MiniMap `component`

```ts
(props?: { nodeColor?: string | ((node: FlowNode) => string); maskColor?: string; width?: number; height?: number; style?: string; class?: string }) => VNodeChild
```

Overview minimap of the full graph. `nodeColor` is a flat color string OR a per-node color function (default a `--pyreon-flow-minimap-node` CSS var); `maskColor` fills the area outside the current viewport (default a `--pyreon-flow-minimap-mask` var). `width` / `height` size the minimap box (default `200` × `150`). Clicks on the minimap recenter the main viewport.

**Example**

```tsx
<Flow instance={flow}>
  <MiniMap nodeColor={(node) => node.data.highlighted ? '#f59e0b' : '#6366f1'} />
</Flow>
```

**See also:** `Flow` · `Background` · `Controls`

---

### Handle `component`

```ts
(props: { type: "source" | "target"; position: Position; id?: string; style?: string; class?: string }) => VNodeChild
```

Connection handle on a custom node — exposes a connectable point that edges attach to. `type` picks direction (`"source"` emits edges, `"target"` receives), `position` is a `Position` enum (`Top` / `Right` / `Bottom` / `Left`). Provide a distinct `id` when a node has multiple source or target handles so edges can reference the specific one via `edge.sourceHandle` / `edge.targetHandle`. `style` / `class` restyle the handle dot.

**Example**

```tsx
function CustomNode(props: NodeComponentProps<MyData>) {
  return (
    <div>
      <Handle type="target" position={Position.Left} />
      {props.data().label}
      <Handle type="source" position={Position.Right} id="out-primary" />
      <Handle type="source" position={Position.Bottom} id="out-fallback" />
    </div>
  )
}

// Edge referencing a specific source handle by id
flow.addEdge({ source: '1', sourceHandle: 'out-primary', target: '2' })
```

**Common mistakes**

- Multiple `source` / `target` handles on one node without distinct `id` values — edges cannot disambiguate which handle they connect to
- Nesting a `<Handle>` inside a non-node component (a `<Background>` child, a `<Panel>`, etc.) — the connection machinery expects handles to live inside a node renderer

**See also:** `Flow` · `Position`

---

### Panel `component`

```ts
(props: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right"; style?: string; class?: string; children?: VNodeChild }) => VNodeChild
```

Overlay panel positioned absolutely relative to the flow viewport. Use for toolbars, legend badges, or contextual action buttons. Pass any JSX as children — the panel is a plain positioned container, not a predefined chrome component. `style` / `class` customise the container.

**Example**

```tsx
<Flow instance={flow}>
  <Panel position="top-right">
    <button onClick={() => flow.fitView()}>Fit</button>
    <button onClick={() => flow.toJSON()}>Export</button>
  </Panel>
</Flow>
```

**See also:** `Flow` · `Controls`

---

### NodeResizer `component`

```ts
NodeResizer(props: { nodeId: string; instance: FlowInstance; minWidth?: number; minHeight?: number; handleSize?: number; showEdgeHandles?: boolean }) => VNodeChild
```

Render drag handles inside a custom node to resize it. Draws absolutely-positioned corner handles (`nw`/`ne`/`sw`/`se`) — plus edge handles when `showEdgeHandles` — that drag via pointer-capture (no document listeners), convert the client delta by the current `viewport.zoom`, and call `instance.updateNode(nodeId, { width, height, position })`. `w`/`n`-side drags also shift `position` so the opposite edge stays fixed. Defaults: `minWidth` 50, `minHeight` 30, `handleSize` 8px.

**Example**

```tsx
import { NodeResizer } from '@pyreon/flow'

const ResizableNode = (props) => (
  <div style={{ position: 'relative' }}>          {/* required — see mistakes */}
    <NodeResizer nodeId={props.id} instance={flow} minWidth={80} />
    {props.data.label}
  </div>
)
```

**Common mistakes**

- Expecting it to read the flow from context like React Flow — it does NOT; you MUST pass `instance={flow}` (your `createFlow()` handle) AND `nodeId` explicitly.
- Mounting it in a node whose host element is not `position: relative` — the handles are `position: absolute` and will anchor to the wrong ancestor. Wrap the node content in a `position: relative` element.

**See also:** `NodeToolbar` · `Handle` · `useFlow`

---

### NodeToolbar `component`

```ts
NodeToolbar(props: { position?: 'top' | 'bottom' | 'left' | 'right'; offset?: number; showOnSelect?: boolean; selected?: boolean | (() => boolean); style?: string; class?: string; children?: VNodeChild }) => VNodeChild
```

A floating toolbar placed beside its host node (default `position: "top"`, `offset` 8px). Returns a REACTIVE thunk that reads `selected` and renders `null` when `showOnSelect` (default true) and the node is not selected — so it shows/hides with live selection. Put action buttons for a node (delete, duplicate, edit) here.

**Example**

```tsx
import { NodeToolbar } from '@pyreon/flow'

const NodeWithToolbar = (props) => (
  <div style={{ position: 'relative' }}>
    <NodeToolbar selected={props.selected}>       {/* pass the accessor */}
      <button onClick={() => flow.removeNode(props.id)}>Delete</button>
    </NodeToolbar>
    {props.data.label}
  </div>
)
```

**Common mistakes**

- Expecting it to escape node clipping like React Flow — it is NOT a portal; it renders inline as an absolutely-positioned div, so an ancestor `overflow: hidden` CLIPS it. The host node must be `position: relative`.
- Passing a bare boolean `selected={someValue}` — that snapshots selection and never updates. Pass the reactive accessor (the custom node's `props.selected`, which is `() => boolean`) so show/hide tracks live selection.

**See also:** `NodeResizer` · `Handle`

---

### MarkerType / Position `constant`

```ts
enum MarkerType { Arrow = 'arrow', ArrowClosed = 'arrowclosed' } · enum Position { Top = 'top', Right = 'right', Bottom = 'bottom', Left = 'left' }
```

The two flow enums. `MarkerType` is the edge-arrowhead shape — `Arrow` (open stroked chevron) or `ArrowClosed` (filled triangle, the default edge-end marker). `Position` is a node's handle/edge attachment side — `Top`/`Right`/`Bottom`/`Left` — consumed by the edge-path helpers and `getHandlePosition`. Both match React Flow's enums exactly.

**Example**

```tsx
import { MarkerType, Position } from '@pyreon/flow'

const edges = [{ id: 'e1', source: 'a', target: 'b',
  markerEnd: { type: MarkerType.ArrowClosed } }]
```

**See also:** `edge-path-helpers` · `Handle`

---

### edge-path-helpers `function`

```ts
getBezierPath / getSmoothStepPath / getStraightPath / getStepPath / getWaypointPath / getEdgePath => { path: string; labelX: number; labelY: number } · getHandlePosition / getSmartHandlePositions
```

SVG-path builders for CUSTOM edge components. `getBezierPath`, `getSmoothStepPath`, `getStraightPath`, `getStepPath`, `getWaypointPath` take a single OPTIONS object (`{ sourceX, sourceY, sourcePosition?, targetX, targetY, targetPosition?, … }`) and return an `EdgePathResult` object `{ path, labelX, labelY }`. `getEdgePath(type, sourceX, sourceY, sourcePos, targetX, targetY, targetPos)` is the POSITIONAL-arg dispatcher (unknown type → bezier). `getHandlePosition(position, nodeX, nodeY, nodeW, nodeH)` returns the `{ x, y }` anchor on a node edge; `getSmartHandlePositions(sourceNode, targetNode)` auto-picks the closest facing sides.

**Example**

```tsx
import { getBezierPath } from '@pyreon/flow'

const MyEdge = (props) => {
  const { path, labelX, labelY } = getBezierPath({
    sourceX: props.sourceX, sourceY: props.sourceY,
    targetX: props.targetX, targetY: props.targetY,
  })
  return <path d={path} />
}
```

**Common mistakes**

- Destructuring the return as a TUPLE (`const [path, labelX, labelY] = getBezierPath(...)`) — React Flow returns an array, but @pyreon/flow returns an OBJECT `{ path, labelX, labelY }`. Destructure by NAME.
- Calling `getEdgePath` / `getHandlePosition` with an options object — those two take POSITIONAL args (unlike the five object-param helpers). `getStraightPath` also takes no `*Position` params.

**See also:** `MarkerType / Position` · `Handle`

---

### computeLayout `function`

```ts
computeLayout<TData>(nodes: FlowNode<TData>[], edges: FlowEdge[], algorithm?: 'layered' | 'force' | 'stress' | 'tree' | 'radial' | 'box' | 'rectpacking', options?: { direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; nodeSpacing?: number; layerSpacing?: number; edgeRouting?: 'orthogonal' | 'splines' | 'polyline' }) => Promise<Array<{ id: string; position: { x: number; y: number } }>>
```

Auto-layout via a lazy-loaded `elkjs` (cached singleton — zero bundle cost until first call). Runs the ELK `algorithm` (default `layered`) over the graph and returns a NEW array of `{ id, position }` pairs (positions only). Async.

**Example**

```tsx
import { computeLayout } from '@pyreon/flow'

const positioned = await computeLayout(flow.nodes(), flow.edges(), 'layered', { direction: 'DOWN' })
for (const { id, position } of positioned) flow.updateNode(id, { position })
```

**Common mistakes**

- Forgetting to `await` it — `computeLayout` is ASYNC (it lazy-loads elkjs).
- Expecting it to move your nodes — it does NOT mutate `nodes`; it returns only `{ id, position }` pairs (no width/height/data). Map the positions back onto your node objects (e.g. via `updateNode`).
- Passing `direction` / `layerSpacing` / `edgeRouting` to a non-`layered` algorithm — those apply only to `layered` (and `direction` to `tree`); ELK silently ignores them (a dev-mode warning fires).

**See also:** `createFlow` · `useFlow`

---

## Package-level notes

> **Note:** LayoutOptions.direction / layerSpacing / edgeRouting apply to layered/tree only — force/stress/radial/box/rectpacking silently ignore them. nodeSpacing is the only field respected by every algorithm. Dev-mode console.warn fires when an option is set on an algorithm that ignores it.

> **Mount once:** Each node mounts exactly once across the lifetime of the graph — drags, selection, and updateNode mutations patch via per-node reactive accessors, not remount.

> **Peer dep rationale:** `@pyreon/runtime-dom` is required in consumer apps because flow JSX components emit `_tpl()` / `_bind()` calls — declare it as a direct dependency, not a transitive one.

> **JSX generics:** Pyreon JSX components cannot be parameterised at the call site (`<Flow<MyData> />` is not valid JSX). `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass their `FlowInstance<MyData>` without casting.
