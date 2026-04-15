import { defineManifest } from '@pyreon/manifest'

/**
 * First real manifest — validates the shape end-to-end.
 * Scoped to the API surface documented in today's llms.txt + CLAUDE.md
 * to keep the first-generator diff minimal. Additional entries (edge
 * path helpers, layout options types) come in a follow-up.
 */
export default defineManifest({
  name: '@pyreon/flow',
  title: 'Flow Diagrams',
  tagline:
    'Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout via elkjs',
  description:
    'Reactive flow diagrams for Pyreon. Signal-native nodes and edges, pan/zoom via pointer events + CSS transforms, auto-layout via lazy-loaded elkjs. No D3 dependency. Each node mounts exactly once across the lifetime of the graph; drags and selection patches are O(1) via per-node reactive accessors, so a 60fps drag in a 1000-node graph stays cheap.',
  category: 'browser',
  peerDeps: ['@pyreon/runtime-dom'],
  longExample: `import { createFlow, useFlow, Flow, Background, Controls, MiniMap, Handle, Position, type NodeComponentProps } from '@pyreon/flow'

// createFlow is generic over node \`data\` shape — typed consumers
// pass their data type explicitly and \`node.data.kind\` narrows
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
// \`direction\`/\`layerSpacing\`/\`edgeRouting\` apply to layered/tree only —
// \`force\`/\`stress\`/\`radial\`/\`box\`/\`rectpacking\` silently ignore them.
// \`nodeSpacing\` is the only LayoutOptions field respected by every algorithm.

// Prefer \`useFlow\` inside components — it's \`createFlow\` + auto-dispose
// on unmount. Use \`createFlow\` only for singleton/app-store flows that
// outlive the component tree.
const MyDiagram = () => {
  const flow = useFlow<WorkflowData>({ nodes: [], edges: [] })
  return <Flow instance={flow}><Background /></Flow>
}

// Custom node renderers — every prop except \`id\` is a REACTIVE
// ACCESSOR (\`() => T\`), not a plain value. Read inside reactive
// scopes (JSX expression thunks, effect, computed) so the node
// patches in place when ANY underlying state changes. Each node
// mounts EXACTLY ONCE across the lifetime of the graph regardless
// of how many drags, selection clicks, or updateNode mutations
// happen — internally <Flow> uses <For> keyed by node.id plus
// per-node accessors that read live state from instance.nodes().
function CustomNode(props: NodeComponentProps<WorkflowData>) {
  return (
    <div
      class={() => (props.selected() ? 'selected' : '')}
      style={() => \`cursor: \${props.dragging() ? 'grabbing' : 'grab'}\`}
    >
      <Handle type="target" position={Position.Left} />
      {() => props.data().label}
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
flow.fromJSON({ nodes, edges })    // restore from saved state`,
  features: [
    'createFlow<TData> generic over node data shape',
    'useFlow(config) component-scoped wrapper that auto-disposes on unmount',
    'Custom node/edge renderers with reactive accessor props',
    'Pan/zoom via pointer events + CSS transforms (no D3)',
    'Auto-layout via lazy-loaded elkjs',
    'toJSON / fromJSON round-trip serialization',
  ],
  // Enriched to MCP density — each summary is a dense 2-3 sentence
  // paragraph that feeds the MCP api-reference `notes` field; each
  // mistakes list enumerates the real foot-guns consumers hit. The
  // llms-full.txt section uses `longExample` (above), not these
  // per-API examples, so the extra density here is strictly for the
  // MCP surface.
  api: [
    {
      name: 'createFlow',
      kind: 'function',
      signature:
        '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
      summary:
        'Create a reactive flow instance. Generic over node data shape — `createFlow<MyData>(...)` returns `FlowInstance<MyData>` so `node.data.kind` narrows correctly without an `[key: string]: unknown` index signature on consumer types. Defaults to `Record<string, unknown>` when no generic is supplied. The returned instance owns signal-native nodes / edges and exposes CRUD, selection, viewport (zoom / pan / fitView), and auto-layout via lazy-loaded elkjs (first `.layout()` call fetches a ~1.4MB chunk). Pan / zoom uses pointer events + CSS transforms — no D3.',
      example: `// Generic over node data shape — typed consumers get strong narrowing
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
const json = flow.toJSON(); flow.fromJSON(json)       // round-trip serialization`,
      mistakes: [
        'Forgetting to declare `@pyreon/runtime-dom` in consumer app deps — flow\'s JSX emits `_tpl()` which needs runtime-dom imports',
        'Reading `NodeComponentProps.data` / `.selected` / `.dragging` as plain values — all three are REACTIVE ACCESSORS: `props.data()`, `props.selected()`, `props.dragging()`',
        'Calling `props.data()` OUTSIDE a reactive scope — captures the value once at component setup, defeating the per-node reactivity. Read it inside JSX expression thunks, `effect`, or `computed`',
        'Adding `[key: string]: unknown` index signature to your node data interface — no longer needed now that `createFlow` is generic. Pass `createFlow<MyData>(...)` instead',
        'Setting `LayoutOptions.direction` (or `layerSpacing`, or `edgeRouting`) on a force / stress / radial / box / rectpacking layout and expecting a directional result — these options are namespaced under ELK\'s layered / tree pipelines and silently ignored by the geometric algorithms. Dev-mode `console.warn` fires when this happens',
        'Missing `<Flow nodeTypes={{ key: Component }}>` registration — `node.type` strings dispatch to that map, unregistered types fall through to the default renderer',
        'Using `createFlow` inside a component body without `onUnmount(() => flow.dispose())` — prefer `useFlow` which auto-disposes',
      ],
      seeAlso: ['useFlow', 'FlowInstance', 'Flow'],
    },
    {
      name: 'useFlow',
      kind: 'hook',
      signature:
        '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
      summary:
        'Component-scoped wrapper around `createFlow` — identical shape plus an implicit `onUnmount(() => flow.dispose())`. Prefer inside component bodies; use `createFlow` directly only for flows owned outside the component tree (app stores, singletons, SSR-shared state) where you\'ll dispose at the correct lifecycle point yourself.',
      example: `// Component-scoped flow — auto-disposes when the component unmounts.
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
}`,
      mistakes: [
        'Using `useFlow` outside a component body — the `onUnmount` hook registration requires an active component setup context, same constraint as every `useX` hook',
        'Using `createFlow` inside a component and forgetting `onUnmount(() => flow.dispose())` — that was the footgun `useFlow` exists to prevent',
        'Storing the returned instance in a module-level variable — bypasses the auto-dispose guarantee; use `createFlow` for that pattern',
      ],
      seeAlso: ['createFlow'],
    },
    {
      name: 'Flow',
      kind: 'component',
      signature: '(props: FlowComponentProps) => VNodeChild',
      summary:
        'Main flow container. Accepts a `FlowInstance` via the `instance` prop plus optional `nodeTypes` / `edgeTypes` maps for custom renderers. Internally uses `<For>` keyed by `node.id` plus per-node reactive accessors that read live state from `instance.nodes()` — each node mounts EXACTLY ONCE across the lifetime of the graph regardless of drags, selection clicks, or `updateNode` mutations. A 60fps drag in a 1000-node graph stays O(1) per frame. JSX components are NOT generic at the call site (`<Flow<MyData> />` is invalid JSX); `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass `FlowInstance<MyData>` without casting.',
      example: `<Flow instance={flow} nodeTypes={{ custom: MyNode }} edgeTypes={{ arrow: ArrowEdge }}>
  <Background variant="dots" gap={20} />
  <Controls position="bottom-left" />
  <MiniMap nodeColor={(node) => '#6366f1'} />
</Flow>

// Custom node renderer — every prop except id is a REACTIVE ACCESSOR
function MyNode(props: NodeComponentProps<WorkflowData>) {
  return (
    <div
      class={() => (props.selected() ? 'selected' : '')}
      style={() => \`cursor: \${props.dragging() ? 'grabbing' : 'grab'}\`}
    >
      {() => props.data().label}
    </div>
  )
}`,
      mistakes: [
        '`<Flow<MyData> />` is invalid JSX — the component is not generic at the call site; pass a typed `FlowInstance<MyData>` via `instance` prop',
        'Missing `nodeTypes` entry for a `node.type` string — falls through to the default renderer',
        'Mutating `instance.nodes()` return value directly — use `instance.addNode` / `updateNode` / `removeNode` so the internal signals fire',
      ],
      seeAlso: ['createFlow', 'Background', 'Controls', 'MiniMap', 'Handle'],
    },
    {
      name: 'Background',
      kind: 'component',
      signature: '(props: { variant?: "dots" | "lines"; gap?: number; color?: string }) => VNodeChild',
      summary:
        'Dot or line grid background inside a `<Flow>`. Place as a direct child. `variant` defaults to `"dots"`, `gap` controls pattern spacing, `color` sets the pattern color. Renders as an SVG pattern at the back of the z-order.',
      example: `<Flow instance={flow}>
  <Background variant="dots" gap={24} color="#e5e7eb" />
</Flow>`,
      seeAlso: ['Flow', 'Controls', 'MiniMap'],
    },
    {
      name: 'Controls',
      kind: 'component',
      signature:
        '(props?: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) => VNodeChild',
      summary:
        'Zoom in / zoom out / fit-view button cluster. Renders absolutely inside the flow viewport at the configured corner (default `"bottom-right"`). Each button dispatches to the corresponding `FlowInstance` viewport method.',
      example: `<Flow instance={flow}>
  <Controls position="bottom-left" />
</Flow>`,
      seeAlso: ['Flow', 'Background', 'MiniMap'],
    },
    {
      name: 'MiniMap',
      kind: 'component',
      signature:
        '(props?: { nodeColor?: (node: FlowNode) => string; maskColor?: string }) => VNodeChild',
      summary:
        'Overview minimap of the full graph. `nodeColor` is a per-node color function (default grey), `maskColor` fills the area outside the current viewport (default semi-transparent black). Clicks on the minimap recenter the main viewport.',
      example: `<Flow instance={flow}>
  <MiniMap nodeColor={(node) => node.data.highlighted ? '#f59e0b' : '#6366f1'} />
</Flow>`,
      seeAlso: ['Flow', 'Background', 'Controls'],
    },
    {
      name: 'Handle',
      kind: 'component',
      signature:
        '(props: { type: "source" | "target"; position: Position; id?: string }) => VNodeChild',
      summary:
        'Connection handle on a custom node — exposes a connectable point that edges attach to. `type` picks direction (`"source"` emits edges, `"target"` receives), `position` is a `Position` enum (`Top` / `Right` / `Bottom` / `Left`). Provide a distinct `id` when a node has multiple source or target handles so edges can reference the specific one via `edge.sourceHandle` / `edge.targetHandle`.',
      example: `function CustomNode(props: NodeComponentProps<MyData>) {
  return (
    <div>
      <Handle type="target" position={Position.Left} />
      {() => props.data().label}
      <Handle type="source" position={Position.Right} id="out-primary" />
      <Handle type="source" position={Position.Bottom} id="out-fallback" />
    </div>
  )
}

// Edge referencing a specific source handle by id
flow.addEdge({ source: '1', sourceHandle: 'out-primary', target: '2' })`,
      mistakes: [
        'Multiple `source` / `target` handles on one node without distinct `id` values — edges cannot disambiguate which handle they connect to',
        'Nesting a `<Handle>` inside a non-node component (a `<Background>` child, a `<Panel>`, etc.) — the connection machinery expects handles to live inside a node renderer',
      ],
      seeAlso: ['Flow', 'Position'],
    },
    {
      name: 'Panel',
      kind: 'component',
      signature:
        '(props: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right"; children: VNodeChild }) => VNodeChild',
      summary:
        'Overlay panel positioned absolutely relative to the flow viewport. Use for toolbars, legend badges, or contextual action buttons. Pass any JSX as children — the panel is a plain positioned container, not a predefined chrome component.',
      example: `<Flow instance={flow}>
  <Panel position="top-right">
    <button onClick={() => flow.fitView()}>Fit</button>
    <button onClick={() => flow.toJSON()}>Export</button>
  </Panel>
</Flow>`,
      seeAlso: ['Flow', 'Controls'],
    },
  ],
  gotchas: [
    // First gotcha also feeds the llms.txt one-liner teaser — keep it
    // the most distinctive user-facing foot-gun, not a peer-dep note
    // that duplicates the `(peer: ...)` bullet suffix. Bare string
    // form → rendered as `> **Note**: ...` in llms-full.
    'LayoutOptions.direction / layerSpacing / edgeRouting apply to layered/tree only — force/stress/radial/box/rectpacking silently ignore them. nodeSpacing is the only field respected by every algorithm. Dev-mode console.warn fires when an option is set on an algorithm that ignores it.',
    {
      label: 'Mount once',
      note: 'Each node mounts exactly once across the lifetime of the graph — drags, selection, and updateNode mutations patch via per-node reactive accessors, not remount.',
    },
    {
      label: 'Peer dep rationale',
      note: '`@pyreon/runtime-dom` is required in consumer apps because flow JSX components emit `_tpl()` / `_bind()` calls — declare it as a direct dependency, not a transitive one.',
    },
    {
      label: 'JSX generics',
      note: 'Pyreon JSX components cannot be parameterised at the call site (`<Flow<MyData> />` is not valid JSX). `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass their `FlowInstance<MyData>` without casting.',
    },
  ],
})
