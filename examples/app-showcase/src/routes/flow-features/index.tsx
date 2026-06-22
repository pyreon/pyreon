import {
  Background,
  Controls,
  createFlow,
  Flow,
  MarkerType,
  MiniMap,
  Panel,
  type FlowInstance,
  type NodeComponentProps,
} from '@pyreon/flow'
import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { FeatureNode } from './FeatureNode'

/**
 * Flow Feature Matrix — a testable affordance for EVERY @pyreon/flow feature.
 *
 * Unlike the curated Flow Editor (/flow), this route is a kitchen-sink: each
 * feature is a labelled, `data-testid`-tagged control wired to the instance
 * API, and a live readout panel reflects the resulting state so the whole
 * surface is exercisable by hand AND by the e2e suite
 * (e2e/app-showcase-flow-features.spec.ts).
 *
 * Component-level features (Handle drag-to-connect, NodeToolbar show-on-select,
 * NodeResizer) live in FeatureNode; MiniMap + Controls are rendered with NO
 * explicit `instance` to prove the <Flow> context injection.
 */

interface FNodeData {
  label: string
}

const SEED_NODES = [
  { id: 'n1', type: 'feature', position: { x: 40, y: 60 }, data: { label: 'Trigger' }, width: 110, height: 44 },
  { id: 'n2', type: 'feature', position: { x: 260, y: 60 }, data: { label: 'Filter' }, width: 110, height: 44 },
  { id: 'n3', type: 'feature', position: { x: 480, y: 60 }, data: { label: 'Notify' }, width: 110, height: 44 },
]

// Edges showcase the marker variety: default closed arrow, an open red arrow,
// and a both-ends marker.
const SEED_EDGES = [
  { id: 'e1', source: 'n1', target: 'n2' }, // default closed arrowhead
  {
    id: 'e2',
    source: 'n2',
    target: 'n3',
    markerEnd: { type: MarkerType.Arrow, color: '#ef4444' },
    markerStart: MarkerType.ArrowClosed,
  },
]

let spawn = 0

export default function FlowFeaturesRoute() {
  const flow: FlowInstance<FNodeData> = createFlow<FNodeData>({
    nodes: SEED_NODES,
    edges: SEED_EDGES,
    defaultEdgeType: 'smoothstep',
    snapGrid: 20,
  })

  const lastAction = signal('—')
  const query = signal('—')
  const snapObjects = signal(true)
  const snapGrid = signal(false)
  const virtualize = signal(false)

  // Mutating actions push history first so undo/redo is meaningful.
  const act = (label: string, fn: () => void) => {
    fn()
    lastAction.set(label)
  }
  const mutate = (label: string, fn: () => void) =>
    act(label, () => {
      flow.pushHistory()
      fn()
    })

  const actions: { group: string; items: { id: string; label: string; run: () => void }[] }[] = [
    {
      group: 'Nodes',
      items: [
        {
          id: 'add-node',
          label: 'Add node',
          run: () =>
            mutate('add-node', () => {
              spawn += 1
              flow.addNode({
                id: `gen-${spawn}`,
                type: 'feature',
                position: { x: 40 + spawn * 30, y: 180 + spawn * 10 },
                data: { label: `Node ${spawn}` },
                width: 110,
                height: 44,
              })
            }),
        },
        { id: 'remove-node', label: 'Remove n3', run: () => mutate('remove-node', () => flow.removeNode('n3')) },
        {
          id: 'update-node',
          label: 'Rename n1',
          run: () => mutate('update-node', () => flow.updateNode('n1', { data: { label: 'Renamed' } })),
        },
        { id: 'select-n1', label: 'Select n1', run: () => act('select-n1', () => flow.selectNode('n1')) },
      ],
    },
    {
      group: 'Edges',
      items: [
        {
          id: 'add-edge',
          label: 'Connect n1→n3',
          run: () => mutate('add-edge', () => flow.addEdge({ source: 'n1', target: 'n3' })),
        },
        { id: 'remove-edge', label: 'Remove e1', run: () => mutate('remove-edge', () => flow.removeEdge('e1')) },
        {
          id: 'reconnect-edge',
          label: 'Reconnect e2→n1',
          run: () => mutate('reconnect-edge', () => flow.reconnectEdge('e2', { target: 'n1' })),
        },
        {
          id: 'add-waypoint',
          label: 'Add waypoint',
          run: () => mutate('add-waypoint', () => flow.addEdgeWaypoint('e1', { x: 200, y: 140 })),
        },
      ],
    },
    {
      group: 'Selection',
      items: [
        { id: 'select-all', label: 'Select all', run: () => act('select-all', () => flow.selectAll()) },
        { id: 'clear-selection', label: 'Clear', run: () => act('clear-selection', () => flow.clearSelection()) },
        {
          id: 'delete-selected',
          label: 'Delete selected',
          run: () => mutate('delete-selected', () => flow.deleteSelected()),
        },
      ],
    },
    {
      group: 'Viewport',
      items: [
        { id: 'zoom-in', label: 'Zoom in', run: () => act('zoom-in', () => flow.zoomIn()) },
        { id: 'zoom-out', label: 'Zoom out', run: () => act('zoom-out', () => flow.zoomOut()) },
        { id: 'fit-view', label: 'Fit view', run: () => act('fit-view', () => flow.fitView()) },
        { id: 'pan-to', label: 'Pan to (0,0)', run: () => act('pan-to', () => flow.panTo({ x: 0, y: 0 })) },
        {
          id: 'animate-viewport',
          label: 'Animate viewport',
          run: () => act('animate-viewport', () => flow.animateViewport({ x: 20, y: 20, zoom: 1.2 }, 200)),
        },
      ],
    },
    {
      group: 'Layout',
      items: [
        {
          id: 'layout-layered',
          label: 'Layout layered',
          run: () => act('layout-layered', () => void flow.layout('layered', { direction: 'RIGHT' })),
        },
        { id: 'layout-tree', label: 'Layout tree', run: () => act('layout-tree', () => void flow.layout('tree')) },
      ],
    },
    {
      group: 'History',
      items: [
        { id: 'undo', label: 'Undo', run: () => act('undo', () => flow.undo()) },
        { id: 'redo', label: 'Redo', run: () => act('redo', () => flow.redo()) },
      ],
    },
    {
      group: 'Clipboard',
      items: [
        {
          id: 'copy',
          label: 'Copy n1',
          run: () =>
            act('copy', () => {
              flow.selectNode('n1')
              flow.copySelected()
            }),
        },
        { id: 'paste', label: 'Paste', run: () => mutate('paste', () => flow.paste({ x: 40, y: 40 })) },
      ],
    },
    {
      group: 'Geometry',
      items: [
        {
          id: 'resolve-collisions',
          label: 'Resolve collisions',
          run: () => mutate('resolve-collisions', () => flow.resolveCollisions('n2')),
        },
        {
          id: 'proximity',
          label: 'Proximity connect n1',
          run: () =>
            act('proximity', () => {
              const p = flow.getProximityConnection('n1')
              query.set(p ? `proximity → ${p.source}->${p.target}` : 'proximity → none')
            }),
        },
      ],
    },
    {
      group: 'Queries',
      items: [
        {
          id: 'search',
          label: 'Search "Filter"',
          run: () =>
            act('search', () => query.set(`search → ${flow.searchNodes('Filter').length} match`)),
        },
        {
          id: 'connected',
          label: 'Connected edges of n2',
          run: () => act('connected', () => query.set(`connected → ${flow.getConnectedEdges('n2').length}`)),
        },
        {
          id: 'incomers',
          label: 'Incomers of n2',
          run: () => act('incomers', () => query.set(`incomers → ${flow.getIncomers('n2').length}`)),
        },
        {
          id: 'outgoers',
          label: 'Outgoers of n2',
          run: () => act('outgoers', () => query.set(`outgoers → ${flow.getOutgoers('n2').length}`)),
        },
        { id: 'focus-node', label: 'Focus n3', run: () => act('focus-node', () => flow.focusNode('n3')) },
      ],
    },
    {
      group: 'Serialization',
      items: [
        {
          id: 'export-json',
          label: 'Export JSON',
          run: () => act('export-json', () => query.set(`json → ${flow.toJSON().nodes.length} nodes`)),
        },
        {
          id: 'import-json',
          label: 'Reset (import seed)',
          run: () =>
            mutate('import-json', () => flow.fromJSON({ nodes: SEED_NODES, edges: SEED_EDGES })),
        },
      ],
    },
    {
      group: 'Config toggles',
      items: [
        {
          id: 'toggle-snap-objects',
          label: 'Toggle snapToObjects',
          run: () =>
            act('toggle-snap-objects', () => {
              const next = !snapObjects()
              snapObjects.set(next)
              flow.config.snapToObjects = next
            }),
        },
        {
          id: 'toggle-snap-grid',
          label: 'Toggle snapToGrid',
          run: () =>
            act('toggle-snap-grid', () => {
              const next = !snapGrid()
              snapGrid.set(next)
              flow.config.snapToGrid = next
            }),
        },
        {
          id: 'toggle-virtualize',
          label: 'Toggle virtualization',
          run: () =>
            act('toggle-virtualize', () => {
              const next = !virtualize()
              virtualize.set(next)
              flow.config.onlyRenderVisibleElements = next
              // Nudge the viewport so the <For> re-filters immediately.
              flow.panTo({ ...flow.viewport.peek() })
            }),
        },
      ],
    },
  ]

  const FNode = (p: NodeComponentProps) => FeatureNode({ ...p, instance: flow })

  return (
    <div style="display: flex; flex-direction: column; height: 100%; min-height: 0; font-family: system-ui, sans-serif;">
      <div style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">
        <h1 style="margin: 0; font-size: 18px;">Flow Feature Matrix</h1>
        <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">
          Every @pyreon/flow feature as a control. Select a node for its toolbar + resize handles;
          drag between handles to connect. MiniMap + Controls use the &lt;Flow&gt; context.
        </p>
      </div>

      <div style="display: flex; flex: 1; min-height: 0;">
        {/* Control panel */}
        <div
          data-testid="control-panel"
          style="width: 240px; overflow-y: auto; padding: 10px; border-right: 1px solid #e2e8f0; background: #f8fafc;"
        >
          <For each={() => actions} by={(g) => g.group}>
            {(g) => (
              <div style="margin-bottom: 10px;">
                <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px;">
                  {g.group}
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  <For each={() => g.items} by={(it) => it.id}>
                    {(it) => (
                      <button
                        type="button"
                        data-testid={`act-${it.id}`}
                        onClick={it.run}
                        style="font-size: 11px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 5px; background: white; cursor: pointer;"
                      >
                        {it.label}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Canvas */}
        <div style="flex: 1; min-width: 0; position: relative; min-height: 520px;">
          <Flow instance={flow} nodeTypes={{ feature: FNode }}>
            <Background variant="dots" gap={20} size={1} color="#e2e8f0" />
            <MiniMap width={150} height={100} />
            <Controls position="bottom-left" />
            <Panel position="top-right" style="font-size: 11px; background: rgba(255,255,255,0.9); padding: 4px 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
              {() => `zoom ${(flow.zoom() * 100).toFixed(0)}%`}
            </Panel>
          </Flow>
        </div>
      </div>

      {/* Live readout — the e2e gate asserts against these. */}
      <div
        data-testid="readout"
        style="display: flex; gap: 16px; flex-wrap: wrap; padding: 8px 16px; border-top: 1px solid #e2e8f0; font-size: 12px; background: #0f172a; color: #e2e8f0;"
      >
        <span>
          nodes: <strong data-testid="ro-nodes">{() => flow.nodes().length}</strong>
        </span>
        <span>
          edges: <strong data-testid="ro-edges">{() => flow.edges().length}</strong>
        </span>
        <span>
          selected: <strong data-testid="ro-selected">{() => flow.selectedNodes().length}</strong>
        </span>
        <span>
          last: <strong data-testid="ro-last">{() => lastAction()}</strong>
        </span>
        <span>
          query: <strong data-testid="ro-query">{() => query()}</strong>
        </span>
        <span>
          snapObjects: <strong data-testid="ro-snap-objects">{() => String(snapObjects())}</strong>
        </span>
        <span>
          virtualize: <strong data-testid="ro-virtualize">{() => String(virtualize())}</strong>
        </span>
      </div>
    </div>
  )
}

export const meta = {
  title: 'Flow Feature Matrix — Pyreon App Showcase',
}
