import { renderLlmsFullSection, renderLlmsTxtLine } from '@pyreon/manifest'
import flowManifest from '../manifest'

// Snapshot of the exact rendered llms.txt line for @pyreon/flow. Lives
// inside @pyreon/flow (not in @pyreon/manifest) so ownership sits where
// the manifest does — a future flow API change that needs a manifest
// edit + regenerated snapshot stays within this package's review scope.
//
// Update intentionally via `bun run test -- -u` after a deliberate
// manifest change.

describe('gen-docs — flow snapshot', () => {
  it('renders @pyreon/flow to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(flowManifest)).toMatchInlineSnapshot(
      `"- @pyreon/flow — Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout via elkjs (peer: @pyreon/runtime-dom). LayoutOptions.direction / layerSpacing / edgeRouting apply to layered/tree only — force/stress/radial/box/rectpacking silently ignore them. nodeSpacing is the only field respected by every algorithm. Dev-mode console.warn fires when an option is set on an algorithm that ignores it."`,
    )
  })

  it('renders @pyreon/flow to its expected llms-full.txt section — full body snapshot', () => {
    // Full-output snapshot of renderLlmsFullSection(flowManifest).
    // Locks header + description + code-block body + all blockquotes
    // against silent drift. A byte-level change in the manifest
    // surfaces HERE as a failing inline snapshot (fast, local signal)
    // rather than only in the e2e test that compares against the
    // committed llms-full.txt (which could mask changes that round-
    // trip identically). Update intentionally via `bun run test -- -u`.
    expect(renderLlmsFullSection(flowManifest)).toMatchInlineSnapshot(`
      "## @pyreon/flow — Flow Diagrams

      Reactive flow diagrams for Pyreon. Signal-native nodes and edges, pan/zoom via pointer events + CSS transforms, auto-layout via lazy-loaded elkjs. No D3 dependency. Each node mounts exactly once across the lifetime of the graph; drags and selection patches are O(1) via per-node reactive accessors, so a 60fps drag in a 1000-node graph stays cheap.

      \`\`\`typescript
      import { createFlow, useFlow, Flow, Background, Controls, MiniMap, Handle, Position, type NodeComponentProps } from '@pyreon/flow'

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
      flow.fromJSON({ nodes, edges })    // restore from saved state
      \`\`\`

      > **Peer dep**: @pyreon/runtime-dom
      >
      > **Note**: LayoutOptions.direction / layerSpacing / edgeRouting apply to layered/tree only — force/stress/radial/box/rectpacking silently ignore them. nodeSpacing is the only field respected by every algorithm. Dev-mode console.warn fires when an option is set on an algorithm that ignores it.
      >
      > **Mount once**: Each node mounts exactly once across the lifetime of the graph — drags, selection, and updateNode mutations patch via per-node reactive accessors, not remount.
      >
      > **Peer dep rationale**: \`@pyreon/runtime-dom\` is required in consumer apps because flow JSX components emit \`_tpl()\` / \`_bind()\` calls — declare it as a direct dependency, not a transitive one.
      >
      > **JSX generics**: Pyreon JSX components cannot be parameterised at the call site (\`<Flow<MyData> />\` is not valid JSX). \`FlowProps.instance\` is typed as \`FlowInstance<any>\` so typed consumers can pass their \`FlowInstance<MyData>\` without casting.
      "
    `)
  })
})
