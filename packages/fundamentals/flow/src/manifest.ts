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
  api: [
    {
      name: 'createFlow',
      kind: 'function',
      signature:
        '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
      summary:
        "Create a reactive flow instance. Generic over node data shape so node.data.kind narrows correctly. Defaults to Record<string, unknown> when no generic is supplied.",
      example: `const flow = createFlow<MyData>({
  nodes: [
    { id: '1', position: { x: 0, y: 0 }, data: { kind: 'start' } },
    { id: '2', position: { x: 200, y: 100 }, data: { kind: 'end' } },
  ],
  edges: [{ source: '1', target: '2' }],
})`,
      mistakes: [
        'Missing @pyreon/runtime-dom in consumer deps — flow JSX emits _tpl()',
        'Reading NodeComponentProps.data / .selected / .dragging as plain values — all three are reactive accessors',
        'Using createFlow inside a component body without onUnmount(() => flow.dispose()) — use useFlow instead',
      ],
      seeAlso: ['useFlow', 'FlowInstance', 'Flow'],
    },
    {
      name: 'useFlow',
      kind: 'hook',
      signature:
        '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
      summary:
        "Component-scoped wrapper around createFlow that auto-disposes the instance on unmount. Prefer inside component bodies; use createFlow directly only for flows owned outside the component tree (app stores, singletons).",
      example: `const MyDiagram = () => {
  const flow = useFlow<MyData>({ nodes: [], edges: [] })
  return <Flow instance={flow}><Background /></Flow>
}`,
      mistakes: [
        'Using useFlow outside a component body — the onUnmount hook needs an active setup context',
        'Storing the returned instance in a module-level variable — bypasses the auto-dispose guarantee',
      ],
      seeAlso: ['createFlow'],
    },
    {
      name: 'Flow',
      kind: 'component',
      signature: '(props: FlowComponentProps) => VNodeChild',
      summary:
        "Main flow container. Accepts a FlowInstance via `instance` prop plus optional `nodeTypes` / `edgeTypes` maps for custom renderers. NOT generic at the JSX call site — `FlowProps.instance` is typed as FlowInstance<any> so typed consumers can pass FlowInstance<MyData> without casting.",
      example: `<Flow instance={flow} nodeTypes={{ custom: MyNode }}>
  <Background variant="dots" />
  <Controls />
  <MiniMap />
</Flow>`,
      mistakes: [
        '<Flow<MyData> /> is invalid JSX — the component is not generic at the call site',
        'Missing nodeTypes entry for a node.type string — falls through to the default renderer',
      ],
      seeAlso: ['createFlow', 'Background', 'Controls', 'MiniMap'],
    },
    {
      name: 'Background',
      kind: 'component',
      signature: '(props: { variant?: "dots" | "lines" }) => VNodeChild',
      summary: 'Dot or line grid background inside a Flow. Place as a child of <Flow>.',
      example: `<Flow instance={flow}><Background variant="dots" /></Flow>`,
      seeAlso: ['Flow'],
    },
    {
      name: 'Controls',
      kind: 'component',
      signature: '() => VNodeChild',
      summary: 'Zoom in / zoom out / fit-view button cluster. Place as a child of <Flow>.',
      example: `<Flow instance={flow}><Controls /></Flow>`,
      seeAlso: ['Flow'],
    },
    {
      name: 'MiniMap',
      kind: 'component',
      signature: '() => VNodeChild',
      summary: 'Overview minimap showing the full graph. Place as a child of <Flow>.',
      example: `<Flow instance={flow}><MiniMap /></Flow>`,
      seeAlso: ['Flow'],
    },
    {
      name: 'Handle',
      kind: 'component',
      signature: '(props: { type: "source" | "target"; position: Position }) => VNodeChild',
      summary: 'Connection handle on a custom node. Exposes a connectable point that edges attach to.',
      example: `function CustomNode(props: NodeComponentProps<MyData>) {
  return (
    <div>
      <Handle type="target" position={Position.Left} />
      {() => props.data().label}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}`,
      seeAlso: ['Position'],
    },
    {
      name: 'Panel',
      kind: 'component',
      signature: '(props: { position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) => VNodeChild',
      summary: 'Overlay panel positioned absolutely relative to the flow viewport.',
      example: `<Flow instance={flow}><Panel position="top-right"><button>Save</button></Panel></Flow>`,
      seeAlso: ['Flow'],
    },
  ],
  gotchas: [
    // First gotcha also feeds the llms.txt one-liner teaser — keep it
    // the most distinctive user-facing foot-gun, not a peer-dep note
    // that duplicates the `(peer: ...)` bullet suffix.
    'LayoutOptions.direction / layerSpacing / edgeRouting apply to layered/tree only — force/stress/radial/box/rectpacking silently ignore them. nodeSpacing is the only field respected by every algorithm. Dev-mode console.warn fires when an option is set on an algorithm that ignores it.',
    'Each node mounts exactly once across the lifetime of the graph — drags, selection, and updateNode mutations patch via per-node reactive accessors, not remount.',
    '`@pyreon/runtime-dom` is required in consumer apps because flow JSX components emit `_tpl()` / `_bind()` calls — declare it as a direct dependency, not a transitive one.',
    'Pyreon JSX components cannot be parameterised at the call site (`<Flow<MyData> />` is not valid JSX). `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass their `FlowInstance<MyData>` without casting.',
  ],
})
