/**
 * Shared Flow parity fixture — F2's machine-checked "same results on web,
 * iOS and Android".
 *
 * The scenarios below are DATA: a seed graph, a sequence of deterministic
 * engine operations, and the queries to read afterwards. The web engine is
 * the ORACLE: `expectationsOf` runs a scenario through `createFlow` and
 * records what it observed. `renderSwift` / `renderKotlin` then emit those
 * observations as literal assertions into the native behaviour fixtures
 * (marker-delimited regions in `native/tests/PyreonFlowStateTests.swift` and
 * `native/tests/PyreonFlowStateTest.kt`), which the co-source gate compiles
 * and RUNS. `native-parity.test.ts` locks both regions byte-for-byte against
 * this generator, so a scenario, an oracle result or an emit shape cannot
 * drift silently; `PYREON_WRITE_FLOW_PARITY=1` rewrites the regions.
 *
 * Container-dependent operations (`fitView`, `setCenter`, `isNodeVisible`)
 * run against an explicit `setContainerSize`, so the host measurement is a
 * scenario input rather than an excuse. Layout runs through the same
 * first-party algorithms on every target (`layout-engine.ts` is the web's,
 * the native engines carry ports), so the seven algorithms are oracle-driven
 * too, unanimated. Deliberately excluded: callbacks and animation
 * (`focusNode`, `animateViewport`), asserted per target by the hand-written
 * fixtures.
 */
import { createFlow } from '../flow'

export type ParityOp =
  | { op: 'addNode'; id: string; x: number; y: number }
  | { op: 'removeNode'; id: string }
  | { op: 'updateNodePosition'; id: string; x: number; y: number }
  | { op: 'addEdge'; id: string; source: string; target: string }
  | { op: 'removeEdge'; id: string }
  | { op: 'selectNode'; id: string; additive: boolean }
  | { op: 'selectNodes'; ids: string[]; additive: boolean }
  | { op: 'deselectNode'; id: string }
  | { op: 'selectEdge'; id: string; additive: boolean }
  | { op: 'clearSelection' }
  | { op: 'selectAll' }
  | { op: 'deleteSelected' }
  | { op: 'zoomTo'; zoom: number }
  | { op: 'zoomIn' }
  | { op: 'zoomOut' }
  | { op: 'panTo'; x: number; y: number }
  | { op: 'setViewport'; x: number; y: number; zoom: number }
  | { op: 'moveSelectedNodes'; dx: number; dy: number }
  | { op: 'reconnectEdge'; id: string; source?: string; target?: string }
  | { op: 'pushHistory' }
  | { op: 'undo' }
  | { op: 'redo' }
  | { op: 'setNodeExtent'; minX: number; minY: number; maxX: number; maxY: number }
  | { op: 'setContainerSize'; width: number; height: number }
  | { op: 'fitView'; ids?: string[]; padding?: number }
  | { op: 'setCenter'; x: number; y: number; zoom?: number }
  | { op: 'copySelected' }
  | { op: 'paste'; dx: number; dy: number }
  | { op: 'resolveCollisions'; id: string; spacing: number }
  | { op: 'roundTripJSON' }
  | { op: 'addEdgeWaypoint'; id: string; x: number; y: number; index?: number }
  | { op: 'removeEdgeWaypoint'; id: string; index: number }
  | { op: 'updateEdgeWaypoint'; id: string; index: number; x: number; y: number }
  | { op: 'layout'; algorithm: string; direction?: string; nodeSpacing?: number; layerSpacing?: number }
  | { op: 'addNodes'; nodes: { id: string; x: number; y: number }[] }
  | { op: 'setNodes'; nodes: { id: string; x: number; y: number }[] }
  | { op: 'removeNodes'; ids: string[] }
  | { op: 'updateNode'; id: string; x: number; y: number }
  | { op: 'updateNodeData'; id: string; label: string }
  | { op: 'setMeasurement'; id: string; width: number; height: number }
  | { op: 'clearMeasurement'; id: string }
  | { op: 'addEdges'; edges: { id: string; source: string; target: string }[] }
  | { op: 'setEdges'; edges: { id: string; source: string; target: string }[] }
  | { op: 'removeEdges'; ids: string[] }
  | { op: 'updateEdge'; id: string; target: string }
  | { op: 'batch'; ops: ParityOp[] }

export type ParityQuery =
  | { q: 'isValidConnection'; source: string; target: string }
  | { q: 'connectedEdges'; id: string }
  | { q: 'incomers'; id: string }
  | { q: 'outgoers'; id: string }
  | { q: 'screenToFlow'; x: number; y: number }
  | { q: 'clampToExtent'; x: number; y: number }
  | { q: 'flowToScreen'; x: number; y: number }
  | { q: 'isNodeVisible'; id: string }
  | { q: 'snapLines'; id: string; x: number; y: number }
  | { q: 'absolutePosition'; id: string }
  | { q: 'childNodes'; id: string }
  | { q: 'overlapping'; id: string }
  | { q: 'proximity'; id: string; threshold: number }
  | { q: 'search'; query: string }
  | { q: 'waypoints'; id: string }
  | { q: 'nodePosition'; id: string }
  | { q: 'nodeSelected'; id: string }
  | { q: 'edgeSelected'; id: string }
  | { q: 'dimensions'; id: string }
  | { q: 'findByLabel'; label: string }
  | { q: 'edgeType'; id: string }
  | { q: 'edgeLabel'; id: string }
  | { q: 'intersecting'; target: string | Rect4; partially?: boolean }
  | { q: 'isIntersecting'; target: string | Rect4; area: Rect4; partially?: boolean }
  | { q: 'nodesBounds'; ids?: string[] }

/** A flow-coordinate rect as `[x, y, width, height]`. */
export type Rect4 = [number, number, number, number]

export interface ParityScenario {
  name: string
  nodes: { id: string; x: number; y: number; parentId?: string; type?: string; hidden?: boolean }[]
  edges: { id: string; source: string; target: string }[]
  ops: ParityOp[]
  queries: ParityQuery[]
  /** Engine configuration the scenario opts into (defaults mirror `createFlow`). */
  snapToGrid?: boolean
  snapGrid?: number
  /** Position tolerance for the node check (default 1e-6); the iterative layouts accumulate ~1e-4 of floating-point order across languages. */
  tolerance?: number
  /**
   * Mutable engine configuration. The oracle passes these to `createFlow`; the
   * native fixtures set the same properties right after construction, so the
   * config field itself is what is under test, not an initializer order.
   */
  config?: ParityConfig
}

/**
 * The portable config fields a scenario can opt into. Each one has a web form
 * (what `createFlow` takes) and a native form (the engine property), and
 * `configEntries` below is the single place that translates between them.
 */
export interface ParityConfig {
  minZoom?: number
  maxZoom?: number
  multiSelect?: boolean
  nodesDeletable?: boolean
  edgesDeletable?: boolean
  autoHistory?: boolean
  /** Undo depth. An INTEGER on both native engines, so it is written without a fraction. */
  historyLimit?: number
  /** Node type -> the node types it may connect to. Web spells it `{ outputs }`. */
  connectionRules?: Record<string, string[]>
  defaultEdgeType?: string
  /** Web spells it `[[minX, minY], [maxX, maxY]]`. */
  nodeExtent?: { minX: number; minY: number; maxX: number; maxY: number }
  defaultEdgeOptions?: { type?: string; label?: string }
  fitViewPadding?: number
  /** A user validator that rejects one target id. Web spells it `isValidConnection`. */
  connectionValidator?: { rejectTarget: string }
}

/** The config in the shape `createFlow` takes. */
function webConfig(c: ParityConfig | undefined): Record<string, unknown> {
  if (!c) return {}
  const { connectionRules, nodeExtent, connectionValidator, ...rest } = c
  return {
    ...rest,
    ...(connectionValidator ? { isValidConnection: (conn: { target: string }) => conn.target !== connectionValidator.rejectTarget } : {}),
    ...(connectionRules ? { connectionRules: Object.fromEntries(Object.entries(connectionRules).map(([k, v]) => [k, { outputs: v }])) } : {}),
    ...(nodeExtent ? { nodeExtent: [[nodeExtent.minX, nodeExtent.minY], [nodeExtent.maxX, nodeExtent.maxY]] } : {}),
  }
}

/** One native assignment per config field, as the property the engine exposes. */
function configEntries(c: ParityConfig | undefined, lang: 'swift' | 'kotlin'): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(c ?? {})) {
    if (v === undefined) continue
    if (k === 'connectionRules') {
      const pairs = Object.entries(v as Record<string, string[]>).map(([t, outs]) =>
        lang === 'swift' ? `${str(t)}: ${strList(outs, 'swift')}` : `${str(t)} to ${strList(outs, 'kotlin')}`)
      out.push(`f.${k} = ${lang === 'swift' ? `[${pairs.join(', ')}]` : `mapOf(${pairs.join(', ')})`}`)
    } else if (k === 'nodeExtent') {
      const e = v as { minX: number; minY: number; maxX: number; maxY: number }
      out.push(lang === 'swift'
        ? `f.${k} = PyreonFlowNodeExtent(minX: ${d(e.minX)}, minY: ${d(e.minY)}, maxX: ${d(e.maxX)}, maxY: ${d(e.maxY)})`
        : `f.${k} = PyreonFlowNodeExtent(${d(e.minX)}, ${d(e.minY)}, ${d(e.maxX)}, ${d(e.maxY)})`)
    } else if (k === 'defaultEdgeOptions') {
      const o = v as { type?: string; label?: string }
      const args = Object.entries(o).filter(([, x]) => x !== undefined).map(([ok, x]) => lang === 'swift' ? `${ok}: ${str(x as string)}` : `${ok} = ${str(x as string)}`)
      out.push(`f.${k} = PyreonFlowDefaultEdgeOptions(${args.join(', ')})`)
    } else if (k === 'connectionValidator') {
      const t = (v as { rejectTarget: string }).rejectTarget
      out.push(lang === 'swift' ? `f.${k} = { $0.target != ${str(t)} }` : `f.${k} = { it.target != ${str(t)} }`)
    } else if (k === 'historyLimit') {
      out.push(`f.${k} = ${Math.floor(v as number)}`)
    } else if (typeof v === 'string') out.push(`f.${k} = ${str(v)}`)
    else out.push(`f.${k} = ${typeof v === 'number' ? d(v) : String(v)}`)
  }
  return out
}

export type RectAnswer = { x: number; y: number; width: number; height: number }
export type SnapAnswer = { snapX: number | null; snapY: number | null; x: number; y: number }

export interface ParityExpectation {
  nodes: { id: string; x: number; y: number }[]
  edges: { id: string; source: string; target: string }[]
  selectedNodes: string[]
  selectedEdges: string[]
  viewport: { x: number; y: number; zoom: number }
  answers: (boolean | string | string[] | { x: number; y: number } | { x: number; y: number }[] | SnapAnswer | RectAnswer)[]
}

const grid = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i + 1), x: i * 200, y: (i % 2) * 120 }))
const chain = (n: number) => Array.from({ length: n - 1 }, (_, i) => ({ id: `e${i + 1}`, source: String(i + 1), target: String(i + 2) }))

export const PARITY_SCENARIOS: readonly ParityScenario[] = [
  {
    name: 'node CRUD keeps order, positions and the edges that survive',
    nodes: grid(3),
    edges: chain(3),
    ops: [
      { op: 'addNode', id: '4', x: 50, y: 500 },
      { op: 'updateNodePosition', id: '2', x: 210.5, y: -30 },
      { op: 'addEdge', id: 'e3', source: '3', target: '4' },
      { op: 'removeNode', id: '1' },
    ],
    queries: [{ q: 'connectedEdges', id: '3' }, { q: 'incomers', id: '3' }, { q: 'outgoers', id: '3' }, { q: 'connectedEdges', id: '1' }],
  },
  {
    name: 'edge CRUD and reconnect',
    nodes: grid(4),
    edges: chain(4),
    ops: [
      { op: 'reconnectEdge', id: 'e1', target: '4' },
      { op: 'removeEdge', id: 'e2' },
      { op: 'addEdge', id: 'e9', source: '4', target: '1' },
    ],
    queries: [{ q: 'incomers', id: '4' }, { q: 'outgoers', id: '4' }, { q: 'connectedEdges', id: '2' }],
  },
  {
    name: 'selection: single, additive, deselect, edges, select all, clear',
    nodes: grid(4),
    edges: chain(4),
    ops: [
      { op: 'selectNode', id: '1', additive: false },
      { op: 'selectNode', id: '2', additive: true },
      { op: 'selectNode', id: '3', additive: false },
      { op: 'selectNodes', ids: ['1', '4'], additive: true },
      { op: 'deselectNode', id: '1' },
      { op: 'selectEdge', id: 'e2', additive: true },
    ],
    queries: [],
  },
  {
    name: 'select all then clear leaves nothing selected',
    nodes: grid(3),
    edges: chain(3),
    ops: [{ op: 'selectAll' }, { op: 'clearSelection' }, { op: 'selectEdge', id: 'e1', additive: false }],
    queries: [],
  },
  {
    name: 'deleteSelected removes the selected nodes with their edges',
    nodes: grid(4),
    edges: chain(4),
    ops: [{ op: 'selectNodes', ids: ['2', '3'], additive: false }, { op: 'selectEdge', id: 'e3', additive: true }, { op: 'deleteSelected' }],
    queries: [{ q: 'connectedEdges', id: '1' }, { q: 'connectedEdges', id: '4' }],
  },
  {
    name: 'moveSelectedNodes shifts only the selection',
    nodes: grid(3),
    edges: [],
    ops: [{ op: 'selectNodes', ids: ['1', '3'], additive: false }, { op: 'moveSelectedNodes', dx: 7.5, dy: -12 }],
    queries: [],
  },
  {
    name: 'viewport: zoom steps, clamps, pan and set',
    nodes: grid(2),
    edges: [],
    ops: [{ op: 'zoomIn' }, { op: 'zoomIn' }, { op: 'zoomOut' }, { op: 'panTo', x: -40, y: 25 }, { op: 'zoomTo', zoom: 99 }, { op: 'zoomTo', zoom: 0.0001 }, { op: 'setViewport', x: 10, y: 20, zoom: 2 }],
    queries: [{ q: 'screenToFlow', x: 110, y: 220 }, { q: 'screenToFlow', x: 0, y: 0 }],
  },
  {
    name: 'connection validation: no self loops, no duplicates, missing nodes',
    nodes: grid(3),
    edges: chain(3),
    ops: [],
    queries: [
      { q: 'isValidConnection', source: '1', target: '3' },
      { q: 'isValidConnection', source: '1', target: '2' },
      { q: 'isValidConnection', source: '2', target: '2' },
      { q: 'isValidConnection', source: '1', target: 'ghost' },
    ],
  },
  {
    name: 'history: undo and redo across CRUD and moves',
    nodes: grid(2),
    edges: chain(2),
    ops: [
      { op: 'addNode', id: '3', x: 400, y: 0 },
      { op: 'updateNodePosition', id: '1', x: 5, y: 5 },
      { op: 'removeEdge', id: 'e1' },
      { op: 'undo' },
      { op: 'undo' },
      { op: 'redo' },
    ],
    queries: [{ q: 'connectedEdges', id: '1' }],
  },
  {
    name: 'node extent clamps a move and answers clampToExtent',
    nodes: grid(2),
    edges: [],
    ops: [{ op: 'setNodeExtent', minX: 0, minY: 0, maxX: 300, maxY: 300 }, { op: 'updateNodePosition', id: '1', x: -50, y: 900 }],
    queries: [{ q: 'clampToExtent', x: -10, y: 10 }, { q: 'clampToExtent', x: 250, y: 250 }],
  },
  {
    name: 'grid snapping rounds every positioned move but not a relative drag',
    snapToGrid: true,
    snapGrid: 20,
    nodes: grid(2),
    edges: [],
    ops: [
      { op: 'updateNodePosition', id: '1', x: 33, y: 47 },
      { op: 'updateNodePosition', id: '2', x: -29, y: 10.5 },
      { op: 'addNode', id: '3', x: 7, y: 7 },
      { op: 'selectNode', id: '3', additive: false },
      { op: 'moveSelectedNodes', dx: 3, dy: 4 },
    ],
    queries: [{ q: 'snapLines', id: '1', x: 40, y: 50 }],
  },
  {
    name: 'object snap lines: centre, left, right, top and bottom within the threshold',
    nodes: [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 400, y: 300 }, { id: 'drag', x: 0, y: 0 }],
    edges: [],
    ops: [],
    queries: [
      { q: 'snapLines', id: 'drag', x: 103, y: 500 },
      { q: 'snapLines', id: 'drag', x: 700, y: 297 },
      { q: 'snapLines', id: 'drag', x: 254, y: 143 },
      { q: 'snapLines', id: 'drag', x: 96, y: 800 },
      { q: 'snapLines', id: 'missing', x: 1, y: 2 },
    ],
  },
  {
    name: 'serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection',
    nodes: grid(3),
    edges: chain(3),
    ops: [
      { op: 'setViewport', x: 12, y: -8, zoom: 1.5 },
      { op: 'selectNodes', ids: ['1', '3'], additive: false },
      { op: 'selectEdge', id: 'e1', additive: true },
      { op: 'addEdgeWaypoint', id: 'e2', x: 5, y: 6 },
      { op: 'roundTripJSON' },
      { op: 'undo' },
    ],
    queries: [{ q: 'waypoints', id: 'e2' }, { q: 'connectedEdges', id: '2' }],
  },
  {
    name: 'clipboard: copy and paste offsets the copies and remaps their edges',
    nodes: grid(3),
    edges: chain(3),
    ops: [
      { op: 'paste', dx: 1, dy: 1 },
      { op: 'selectNodes', ids: ['1', '2'], additive: false },
      { op: 'copySelected' },
      { op: 'paste', dx: 50, dy: 50 },
      { op: 'paste', dx: -10, dy: 20 },
      { op: 'clearSelection' },
      { op: 'copySelected' },
      { op: 'paste', dx: 0, dy: 0 },
    ],
    queries: [{ q: 'connectedEdges', id: '1-copy-1' }, { q: 'outgoers', id: '1-copy-3' }],
  },
  {
    name: 'waypoints: append, insert, update and remove, then undo',
    nodes: grid(2),
    edges: chain(2),
    ops: [
      { op: 'addEdgeWaypoint', id: 'e1', x: 10, y: 20 },
      { op: 'addEdgeWaypoint', id: 'e1', x: 30, y: 40 },
      { op: 'addEdgeWaypoint', id: 'e1', x: 1, y: 2, index: 0 },
      { op: 'updateEdgeWaypoint', id: 'e1', index: 1, x: 11, y: 22 },
      { op: 'updateEdgeWaypoint', id: 'e1', index: 9, x: 99, y: 99 },
      { op: 'removeEdgeWaypoint', id: 'e1', index: 2 },
      { op: 'addEdgeWaypoint', id: 'missing', x: 0, y: 0 },
    ],
    queries: [{ q: 'waypoints', id: 'e1' }, { q: 'waypoints', id: 'missing' }],
  },
  {
    name: 'viewport framing: fitView and setCenter against a measured container',
    nodes: [{ id: '1', x: 0, y: 0 }, { id: '2', x: 600, y: 0 }, { id: '3', x: 300, y: 500 }],
    edges: [],
    ops: [
      { op: 'setContainerSize', width: 800, height: 600 },
      { op: 'fitView' },
      { op: 'fitView', ids: ['1'], padding: 0.25 },
      { op: 'setCenter', x: 100, y: 100, zoom: 2 },
      { op: 'setCenter', x: -50, y: 20 },
    ],
    queries: [
      { q: 'flowToScreen', x: 10, y: 10 },
      { q: 'isNodeVisible', id: '1' },
      { q: 'isNodeVisible', id: '2' },
      { q: 'isNodeVisible', id: 'missing' },
    ],
  },
  {
    name: 'fitView on a subset and on nothing',
    nodes: grid(2),
    edges: [],
    ops: [
      { op: 'setContainerSize', width: 400, height: 300 },
      { op: 'fitView', ids: ['missing'] },
      { op: 'fitView', ids: ['2'], padding: 0 },
    ],
    queries: [{ q: 'isNodeVisible', id: '1' }, { q: 'isNodeVisible', id: '2' }],
  },
  {
    name: 'graph queries: parent chains, children, overlaps, proximity and search',
    nodes: [
      { id: 'root', x: 100, y: 100 },
      { id: 'child', x: 10, y: 20, parentId: 'root' },
      { id: 'grandchild', x: 1, y: 2, parentId: 'child' },
      { id: 'near', x: 220, y: 105 },
      { id: 'far', x: 900, y: 900 },
      { id: 'overlap', x: 150, y: 110 },
      { id: 'peek', x: -200, y: 0, parentId: 'root' },
    ],
    edges: [{ id: 'e1', source: 'root', target: 'near' }],
    ops: [{ op: 'setContainerSize', width: 800, height: 600 }],
    queries: [
      { q: 'absolutePosition', id: 'grandchild' },
      { q: 'absolutePosition', id: 'missing' },
      { q: 'childNodes', id: 'root' },
      { q: 'childNodes', id: 'far' },
      { q: 'overlapping', id: 'root' },
      { q: 'overlapping', id: 'far' },
      { q: 'proximity', id: 'overlap', threshold: 200 },
      { q: 'proximity', id: 'root', threshold: 200 },
      { q: 'proximity', id: 'far', threshold: 10 },
      { q: 'search', query: 'AR' },
      { q: 'search', query: 'zzz' },
      { q: 'isNodeVisible', id: 'grandchild' },
      { q: 'isNodeVisible', id: 'peek' },
      { q: 'absolutePosition', id: 'peek' },
    ],
  },
  {
    name: 'resolveCollisions pushes the overlapping neighbour away',
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 5 }, { id: 'c', x: 20, y: 30 }, { id: 'd', x: 500, y: 500 }],
    edges: [],
    ops: [
      { op: 'resolveCollisions', id: 'a', spacing: 10 },
      { op: 'resolveCollisions', id: 'd', spacing: 10 },
      { op: 'resolveCollisions', id: 'missing', spacing: 10 },
    ],
    queries: [{ q: 'overlapping', id: 'a' }],
  },
  {
    name: 'intersection and bounds follow React Flow semantics',
    nodes: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 20 },
      { id: 'c', x: 400, y: 0 },
      { id: 'h', x: 50, y: 10, hidden: true },
      { id: 'g', x: 1000, y: 1000 },
      { id: 'k', x: 20, y: 20, parentId: 'g' },
    ],
    edges: [],
    ops: [{ op: 'setMeasurement', id: 'c', width: 50, height: 20 }],
    queries: [
      { q: 'intersecting', target: 'a' },
      { q: 'intersecting', target: 'k' },
      { q: 'intersecting', target: 'missing' },
      { q: 'intersecting', target: [0, 0, 600, 100] },
      { q: 'intersecting', target: [0, 0, 200, 50], partially: false },
      { q: 'intersecting', target: [1000, 1000, 50, 50] },
      { q: 'isIntersecting', target: 'a', area: [140, 30, 100, 100] },
      { q: 'isIntersecting', target: 'a', area: [140, 30, 100, 100], partially: false },
      { q: 'isIntersecting', target: [0, 0, 10, 10], area: [0, 0, 100, 100], partially: false },
      { q: 'isIntersecting', target: 'missing', area: [0, 0, 100, 100] },
      { q: 'nodesBounds' },
      { q: 'nodesBounds', ids: ['a', 'c'] },
      { q: 'nodesBounds', ids: ['k'] },
      { q: 'nodesBounds', ids: ['missing'] },
    ],
  },
  {
    name: 'layout layered lays the same graph out on every target',
    nodes: [{ id: 'r', x: 0, y: 0 }, { id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }, { id: 'c', x: 30, y: 30 }, { id: 'd', x: 40, y: 40 }, { id: 'e', x: 50, y: 50 }],
    edges: [{ id: 'ra', source: 'r', target: 'a' }, { id: 'rb', source: 'r', target: 'b' }, { id: 'ac', source: 'a', target: 'c' }, { id: 'ad', source: 'a', target: 'd' }, { id: 'be', source: 'b', target: 'e' }, { id: 'ce', source: 'c', target: 'e' }],
    ops: [{ op: 'layout', algorithm: 'layered' }],
    queries: [{ q: 'incomers', id: 'e' }],
  },
  {
    name: 'layout layereddirection: RIGHT nodeSpacing: 30 layerSpacing: 60 lays the same graph out on every target',
    nodes: [{ id: 'r', x: 0, y: 0 }, { id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }, { id: 'c', x: 30, y: 30 }, { id: 'd', x: 40, y: 40 }, { id: 'e', x: 50, y: 50 }],
    edges: [{ id: 'ra', source: 'r', target: 'a' }, { id: 'rb', source: 'r', target: 'b' }, { id: 'ac', source: 'a', target: 'c' }, { id: 'ad', source: 'a', target: 'd' }, { id: 'be', source: 'b', target: 'e' }, { id: 'ce', source: 'c', target: 'e' }],
    ops: [{ op: 'layout', algorithm: 'layered', direction: 'RIGHT', nodeSpacing: 30, layerSpacing: 60 }],
    queries: [{ q: 'incomers', id: 'e' }],
  },
  {
    name: 'layout treedirection: UP lays the same graph out on every target',
    nodes: [{ id: 'r', x: 0, y: 0 }, { id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }, { id: 'c', x: 30, y: 30 }, { id: 'd', x: 40, y: 40 }, { id: 'e', x: 50, y: 50 }],
    edges: [{ id: 'ra', source: 'r', target: 'a' }, { id: 'rb', source: 'r', target: 'b' }, { id: 'ac', source: 'a', target: 'c' }, { id: 'ad', source: 'a', target: 'd' }, { id: 'be', source: 'b', target: 'e' }, { id: 'ce', source: 'c', target: 'e' }],
    ops: [{ op: 'layout', algorithm: 'tree', direction: 'UP' }],
    queries: [{ q: 'incomers', id: 'e' }],
  },
  {
    name: 'layout force lays the same graph out on every target',
    nodes: [{ id: 'r', x: 0, y: 0 }, { id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }, { id: 'c', x: 30, y: 30 }, { id: 'd', x: 40, y: 40 }, { id: 'e', x: 50, y: 50 }],
    edges: [{ id: 'ra', source: 'r', target: 'a' }, { id: 'rb', source: 'r', target: 'b' }, { id: 'ac', source: 'a', target: 'c' }, { id: 'ad', source: 'a', target: 'd' }, { id: 'be', source: 'b', target: 'e' }, { id: 'ce', source: 'c', target: 'e' }],
    tolerance: 0.01,
    ops: [{ op: 'layout', algorithm: 'force' }],
    queries: [{ q: 'incomers', id: 'e' }],
  },
  {
    name: 'layout stressnodeSpacing: 25 lays the same graph out on every target',
    nodes: [{ id: 'r', x: 0, y: 0 }, { id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }, { id: 'c', x: 30, y: 30 }, { id: 'd', x: 40, y: 40 }, { id: 'e', x: 50, y: 50 }],
    edges: [{ id: 'ra', source: 'r', target: 'a' }, { id: 'rb', source: 'r', target: 'b' }, { id: 'ac', source: 'a', target: 'c' }, { id: 'ad', source: 'a', target: 'd' }, { id: 'be', source: 'b', target: 'e' }, { id: 'ce', source: 'c', target: 'e' }],
    tolerance: 0.01,
    ops: [{ op: 'layout', algorithm: 'stress', nodeSpacing: 25 }],
    queries: [{ q: 'incomers', id: 'e' }],
  },
  {
    name: 'layout radial lays the same graph out on every target',
    nodes: [{ id: 'r', x: 0, y: 0 }, { id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }, { id: 'c', x: 30, y: 30 }, { id: 'd', x: 40, y: 40 }, { id: 'e', x: 50, y: 50 }],
    edges: [{ id: 'ra', source: 'r', target: 'a' }, { id: 'rb', source: 'r', target: 'b' }, { id: 'ac', source: 'a', target: 'c' }, { id: 'ad', source: 'a', target: 'd' }, { id: 'be', source: 'b', target: 'e' }, { id: 'ce', source: 'c', target: 'e' }],
    tolerance: 0.01,
    ops: [{ op: 'layout', algorithm: 'radial' }],
    queries: [{ q: 'incomers', id: 'e' }],
  },
  {
    name: 'layout box lays the same graph out on every target',
    nodes: [{ id: 'r', x: 0, y: 0 }, { id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }, { id: 'c', x: 30, y: 30 }, { id: 'd', x: 40, y: 40 }, { id: 'e', x: 50, y: 50 }],
    edges: [{ id: 'ra', source: 'r', target: 'a' }, { id: 'rb', source: 'r', target: 'b' }, { id: 'ac', source: 'a', target: 'c' }, { id: 'ad', source: 'a', target: 'd' }, { id: 'be', source: 'b', target: 'e' }, { id: 'ce', source: 'c', target: 'e' }],
    ops: [{ op: 'layout', algorithm: 'box' }],
    queries: [{ q: 'incomers', id: 'e' }],
  },
  {
    name: 'layout rectpackingnodeSpacing: 12 lays the same graph out on every target',
    nodes: [{ id: 'r', x: 0, y: 0 }, { id: 'a', x: 10, y: 10 }, { id: 'b', x: 20, y: 20 }, { id: 'c', x: 30, y: 30 }, { id: 'd', x: 40, y: 40 }, { id: 'e', x: 50, y: 50 }],
    edges: [{ id: 'ra', source: 'r', target: 'a' }, { id: 'rb', source: 'r', target: 'b' }, { id: 'ac', source: 'a', target: 'c' }, { id: 'ad', source: 'a', target: 'd' }, { id: 'be', source: 'b', target: 'e' }, { id: 'ce', source: 'c', target: 'e' }],
    ops: [{ op: 'layout', algorithm: 'rectpacking', nodeSpacing: 12 }],
    queries: [{ q: 'incomers', id: 'e' }],
  },
  // ---- F2 sweep: the portable methods and config fields no scenario above reached ----
  {
    name: 'bulk node and edge CRUD',
    nodes: grid(3),
    edges: chain(3),
    ops: [
      { op: 'addNodes', nodes: [{ id: '4', x: 600, y: 0 }, { id: '5', x: 800, y: 120 }] },
      { op: 'addEdges', edges: [{ id: 'e3', source: '3', target: '4' }, { id: 'e4', source: '4', target: '5' }] },
      { op: 'removeNodes', ids: ['1'] },
      { op: 'removeEdges', ids: ['e3'] },
      { op: 'updateEdge', id: 'e4', target: '2' },
      { op: 'updateNode', id: '5', x: 820, y: 140 },
    ],
    queries: [{ q: 'nodePosition', id: '5' }, { q: 'nodePosition', id: '1' }, { q: 'connectedEdges', id: '2' }, { q: 'incomers', id: '2' }],
  },
  {
    name: 'replacing the whole graph prunes a stale selection',
    nodes: grid(3),
    edges: chain(3),
    ops: [
      { op: 'selectAll' },
      { op: 'selectEdge', id: 'e1', additive: true },
      { op: 'setNodes', nodes: [{ id: '1', x: 0, y: 0 }, { id: '9', x: 300, y: 300 }] },
      { op: 'setEdges', edges: [{ id: 'e9', source: '1', target: '9' }] },
    ],
    queries: [{ q: 'nodeSelected', id: '1' }, { q: 'nodeSelected', id: '2' }, { q: 'edgeSelected', id: 'e1' }, { q: 'outgoers', id: '1' }],
  },
  {
    name: 'a data update reaches search and predicates',
    nodes: grid(3),
    edges: [],
    ops: [{ op: 'updateNodeData', id: '2', label: 'Renamed' }],
    queries: [{ q: 'search', query: 'Renamed' }, { q: 'findByLabel', label: 'Renamed' }, { q: 'findByLabel', label: '2' }],
  },
  {
    name: 'a measured size drives dimensions, overlap and fit',
    nodes: grid(3),
    edges: [],
    ops: [
      { op: 'setMeasurement', id: '1', width: 320, height: 90 },
      { op: 'setContainerSize', width: 800, height: 600 },
      { op: 'fitView' },
    ],
    queries: [{ q: 'dimensions', id: '1' }, { q: 'dimensions', id: '2' }, { q: 'overlapping', id: '1' }],
  },
  {
    name: 'clearing a measurement falls back to the default size',
    nodes: grid(2),
    edges: [],
    ops: [
      { op: 'setMeasurement', id: '1', width: 320, height: 90 },
      { op: 'clearMeasurement', id: '1' },
    ],
    queries: [{ q: 'dimensions', id: '1' }, { q: 'overlapping', id: '1' }],
  },
  {
    name: 'batch applies every operation it wraps',
    nodes: grid(2),
    edges: [],
    ops: [{ op: 'batch', ops: [{ op: 'addNode', id: '3', x: 400, y: 0 }, { op: 'addEdge', id: 'e5', source: '1', target: '3' }, { op: 'selectNode', id: '3', additive: false }] }],
    queries: [{ q: 'nodeSelected', id: '3' }, { q: 'outgoers', id: '1' }],
  },
  {
    name: 'config: zoom limits clamp every zoom path',
    nodes: grid(2),
    edges: [],
    config: { minZoom: 0.5, maxZoom: 2 },
    ops: [{ op: 'zoomTo', zoom: 10 }, { op: 'zoomIn' }],
    queries: [],
  },
  {
    name: 'config: the lower zoom limit clamps too',
    nodes: grid(2),
    edges: [],
    config: { minZoom: 0.5, maxZoom: 2 },
    ops: [{ op: 'zoomTo', zoom: 0.01 }, { op: 'zoomOut' }],
    queries: [],
  },
  {
    name: 'config: multiSelect off makes an additive selection replace',
    nodes: grid(3),
    edges: [],
    config: { multiSelect: false },
    ops: [{ op: 'selectNode', id: '1', additive: false }, { op: 'selectNode', id: '2', additive: true }],
    queries: [{ q: 'nodeSelected', id: '1' }, { q: 'nodeSelected', id: '2' }],
  },
  {
    name: 'config: undeletable nodes and edges survive deleteSelected',
    nodes: grid(3),
    edges: chain(3),
    config: { nodesDeletable: false, edgesDeletable: false },
    ops: [{ op: 'selectAll' }, { op: 'selectEdge', id: 'e1', additive: true }, { op: 'deleteSelected' }],
    queries: [],
  },
  {
    name: 'config: with autoHistory off, a removal is not undoable',
    nodes: grid(3),
    edges: chain(3),
    config: { autoHistory: false },
    ops: [{ op: 'removeNode', id: '2' }, { op: 'undo' }],
    queries: [],
  },
  {
    name: 'with autoHistory off, a manual checkpoint makes the removal undoable',
    nodes: grid(3),
    edges: chain(3),
    config: { autoHistory: false },
    ops: [{ op: 'pushHistory' }, { op: 'removeNode', id: '2' }, { op: 'undo' }],
    queries: [],
  },
  {
    name: 'with autoHistory on, the same removal is undoable',
    nodes: grid(3),
    edges: chain(3),
    ops: [{ op: 'removeNode', id: '2' }, { op: 'undo' }],
    queries: [],
  },
  {
    // Two checkpoints under a limit of one: the first is dropped, so only the
    // second removal can be undone and the second undo is a no-op.
    name: 'config: historyLimit drops the oldest checkpoint past the limit',
    nodes: grid(3),
    edges: chain(3),
    config: { historyLimit: 1 },
    ops: [{ op: 'removeNode', id: '2' }, { op: 'removeNode', id: '3' }, { op: 'undo' }, { op: 'undo' }],
    queries: [],
  },
  {
    name: 'config: connectionRules gate a connection by the source and target node types',
    nodes: [
      { id: 'in', x: 0, y: 0, type: 'input' },
      { id: 'proc', x: 200, y: 0, type: 'process' },
      { id: 'out', x: 400, y: 0, type: 'output' },
      { id: 'plain', x: 600, y: 0 },
    ],
    edges: [],
    ops: [],
    queries: [
      { q: 'isValidConnection', source: 'in', target: 'proc' },
      { q: 'isValidConnection', source: 'in', target: 'out' },
      { q: 'isValidConnection', source: 'proc', target: 'out' },
      { q: 'isValidConnection', source: 'out', target: 'in' },
      { q: 'isValidConnection', source: 'plain', target: 'out' },
      { q: 'isValidConnection', source: 'in', target: 'plain' },
      { q: 'isValidConnection', source: 'in', target: 'missing' },
    ],
    config: { connectionRules: { input: ['process'], process: ['output'], default: ['output'] } },
  },
  {
    name: 'config: defaultEdgeType types an untyped edge on every add path',
    nodes: grid(3),
    edges: [{ id: 'e0', source: '1', target: '2' }],
    ops: [{ op: 'addEdge', id: 'e1', source: '2', target: '3' }, { op: 'addEdges', edges: [{ id: 'e2', source: '1', target: '3' }] }],
    queries: [{ q: 'edgeType', id: 'e1' }, { q: 'edgeType', id: 'e2' }],
    config: { defaultEdgeType: 'step' },
  },
  {
    name: 'config: a nodeExtent from config clamps a move like setNodeExtent does',
    nodes: grid(2),
    edges: [],
    ops: [{ op: 'updateNodePosition', id: '1', x: -50, y: 900 }],
    queries: [{ q: 'clampToExtent', x: -10, y: 10 }, { q: 'nodePosition', id: '1' }],
    config: { nodeExtent: { minX: 0, minY: 0, maxX: 500, maxY: 500 } },
  },
  {
    // Only edges added AFTER construction: the native fixtures set config as a
    // property after the engine is built, so an initial edge was normalized
    // with the defaults of that moment on native and with the config on web.
    name: 'config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type',
    nodes: grid(3),
    edges: [],
    ops: [{ op: 'addEdge', id: 'e1', source: '1', target: '2' }, { op: 'addEdges', edges: [{ id: 'e2', source: '2', target: '3' }] }],
    queries: [{ q: 'edgeType', id: 'e1' }, { q: 'edgeLabel', id: 'e1' }, { q: 'edgeType', id: 'e2' }, { q: 'edgeLabel', id: 'e2' }],
    config: { defaultEdgeType: 'step', defaultEdgeOptions: { type: 'smoothstep', label: 'flows' } },
  },
  {
    name: 'config: fitViewPadding is the padding a bare fitView uses',
    nodes: grid(4),
    edges: [],
    ops: [{ op: 'setContainerSize', width: 800, height: 600 }, { op: 'fitView' }],
    queries: [],
    config: { fitViewPadding: 0.3 },
  },
  {
    name: 'config: a user connection validator runs after the built-in checks',
    nodes: grid(3),
    edges: [],
    ops: [],
    queries: [
      { q: 'isValidConnection', source: '1', target: '2' },
      { q: 'isValidConnection', source: '1', target: '3' },
      { q: 'isValidConnection', source: '1', target: '1' },
    ],
    config: { connectionValidator: { rejectTarget: '3' } },
  },
]

const num = (v: number) => (Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : v)

/** Run a scenario through the WEB engine and record what it observed. */
export async function expectationsOf(s: ParityScenario): Promise<ParityExpectation> {
  const flow = createFlow<{ label: string }>({
    nodes: s.nodes.map((n) => ({ id: n.id, position: { x: n.x, y: n.y }, data: { label: n.id }, ...(n.parentId !== undefined ? { parentId: n.parentId } : {}), ...(n.type !== undefined ? { type: n.type } : {}), ...(n.hidden !== undefined ? { hidden: n.hidden } : {}) })),
    edges: s.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    ...(s.snapToGrid !== undefined ? { snapToGrid: s.snapToGrid } : {}),
    ...(s.snapGrid !== undefined ? { snapGrid: s.snapGrid } : {}),
    ...webConfig(s.config),
  })
  const apply = async (o: ParityOp): Promise<void> => {
    switch (o.op) {
      case 'addNode': flow.addNode({ id: o.id, position: { x: o.x, y: o.y }, data: { label: o.id } }); break
      case 'removeNode': flow.removeNode(o.id); break
      case 'updateNodePosition': flow.updateNodePosition(o.id, { x: o.x, y: o.y }); break
      case 'addEdge': flow.addEdge({ id: o.id, source: o.source, target: o.target }); break
      case 'removeEdge': flow.removeEdge(o.id); break
      case 'selectNode': flow.selectNode(o.id, o.additive); break
      case 'selectNodes': flow.selectNodes(o.ids, o.additive); break
      case 'deselectNode': flow.deselectNode(o.id); break
      case 'selectEdge': flow.selectEdge(o.id, o.additive); break
      case 'clearSelection': flow.clearSelection(); break
      case 'selectAll': flow.selectAll(); break
      case 'deleteSelected': flow.deleteSelected(); break
      case 'zoomTo': flow.zoomTo(o.zoom); break
      case 'zoomIn': flow.zoomIn(); break
      case 'zoomOut': flow.zoomOut(); break
      case 'panTo': flow.panTo({ x: o.x, y: o.y }); break
      case 'setViewport': flow.setViewport({ x: o.x, y: o.y, zoom: o.zoom }); break
      case 'moveSelectedNodes': flow.moveSelectedNodes(o.dx, o.dy); break
      case 'reconnectEdge': flow.reconnectEdge(o.id, { ...(o.source !== undefined ? { source: o.source } : {}), ...(o.target !== undefined ? { target: o.target } : {}) }); break
      case 'pushHistory': flow.pushHistory(); break
      case 'undo': flow.undo(); break
      case 'redo': flow.redo(); break
      case 'setNodeExtent': flow.setNodeExtent([[o.minX, o.minY], [o.maxX, o.maxY]]); break
      case 'setContainerSize': flow.containerSize.set({ width: o.width, height: o.height }); break
      case 'fitView': flow.fitView(o.ids, o.padding); break
      case 'setCenter': flow.setCenter(o.x, o.y, o.zoom !== undefined ? { zoom: o.zoom } : undefined); break
      case 'copySelected': flow.copySelected(); break
      case 'paste': flow.paste({ x: o.dx, y: o.dy }); break
      case 'resolveCollisions': flow.resolveCollisions(o.id, o.spacing); break
      case 'roundTripJSON': flow.fromJSON(JSON.parse(JSON.stringify(flow.toJSON()))); break
      case 'addEdgeWaypoint': flow.addEdgeWaypoint(o.id, { x: o.x, y: o.y }, o.index); break
      case 'removeEdgeWaypoint': flow.removeEdgeWaypoint(o.id, o.index); break
      case 'updateEdgeWaypoint': flow.updateEdgeWaypoint(o.id, o.index, { x: o.x, y: o.y }); break
      case 'layout': await flow.layout(o.algorithm as 'layered', { animate: false, ...(o.direction !== undefined ? { direction: o.direction as 'DOWN' } : {}), ...(o.nodeSpacing !== undefined ? { nodeSpacing: o.nodeSpacing } : {}), ...(o.layerSpacing !== undefined ? { layerSpacing: o.layerSpacing } : {}) }); break
      case 'addNodes': flow.addNodes(o.nodes.map((n) => ({ id: n.id, position: { x: n.x, y: n.y }, data: { label: n.id } }))); break
      case 'setNodes': flow.setNodes(o.nodes.map((n) => ({ id: n.id, position: { x: n.x, y: n.y }, data: { label: n.id } }))); break
      case 'removeNodes': flow.removeNodes(o.ids); break
      case 'updateNode': flow.updateNode(o.id, { position: { x: o.x, y: o.y } }); break
      case 'updateNodeData': flow.updateNodeData(o.id, { label: o.label }); break
      case 'setMeasurement': flow._setNodeMeasurement(o.id, o.width, o.height); break
      case 'clearMeasurement': flow._clearNodeMeasurement(o.id); break
      case 'addEdges': flow.addEdges(o.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))); break
      case 'setEdges': flow.setEdges(o.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))); break
      case 'removeEdges': flow.removeEdges(o.ids); break
      case 'updateEdge': flow.updateEdge(o.id, { target: o.target }); break
      case 'batch': {
        // The web `batch` is synchronous; layout (the one async op) is never batched.
        const inner = o.ops
        flow.batch(() => { for (const x of inner) void apply(x) })
        break
      }
    }
  }
  for (const o of s.ops) await apply(o)
  const answers: ParityExpectation['answers'] = s.queries.map((q) => {
    switch (q.q) {
      case 'isValidConnection': return flow.isValidConnection({ source: q.source, target: q.target })
      case 'connectedEdges': return flow.getConnectedEdges(q.id).map((e) => e.id ?? '')
      case 'incomers': return flow.getIncomers(q.id).map((n) => n.id)
      case 'outgoers': return flow.getOutgoers(q.id).map((n) => n.id)
      case 'screenToFlow': { const p = flow.screenToFlowPosition({ x: q.x, y: q.y }); return { x: num(p.x), y: num(p.y) } }
      case 'clampToExtent': { const p = flow.clampToExtent({ x: q.x, y: q.y }); return { x: num(p.x), y: num(p.y) } }
      case 'flowToScreen': { const p = flow.flowToScreenPosition({ x: q.x, y: q.y }); return { x: num(p.x), y: num(p.y) } }
      case 'isNodeVisible': return flow.isNodeVisible(q.id)
      case 'snapLines': { const r = flow.getSnapLines(q.id, { x: q.x, y: q.y }); return { snapX: r.x === null ? null : num(r.x), snapY: r.y === null ? null : num(r.y), x: num(r.snappedPosition.x), y: num(r.snappedPosition.y) } }
      case 'absolutePosition': { const p = flow.getAbsolutePosition(q.id); return { x: num(p.x), y: num(p.y) } }
      case 'childNodes': return flow.getChildNodes(q.id).map((n) => n.id)
      case 'overlapping': return flow.getOverlappingNodes(q.id).map((n) => n.id)
      case 'intersecting': return flow.getIntersectingNodes(webTarget(q.target), q.partially).map((n) => n.id)
      case 'isIntersecting': return flow.isNodeIntersecting(webTarget(q.target), webRect(q.area), q.partially)
      case 'nodesBounds': { const r = flow.getNodesBounds(q.ids); return { x: num(r.x), y: num(r.y), width: num(r.width), height: num(r.height) } }
      case 'proximity': { const c = flow.getProximityConnection(q.id, q.threshold); return c ? [c.source, c.target] : [] }
      case 'search': return flow.searchNodes(q.query).map((n) => n.id)
      case 'waypoints': return (flow.getEdge(q.id)?.waypoints ?? []).map((p) => ({ x: num(p.x), y: num(p.y) }))
      case 'nodePosition': { const n = flow.getNode(q.id); return n ? [{ x: num(n.position.x), y: num(n.position.y) }] : [] }
      case 'nodeSelected': return flow.isNodeSelected(q.id)
      case 'edgeSelected': return flow.isEdgeSelected(q.id)
      case 'dimensions': { const dm = flow.getNodeDimensions(q.id); return { x: num(dm.width), y: num(dm.height) } }
      case 'findByLabel': return flow.findNodes((n) => n.data.label === q.label).map((n) => n.id)
      case 'edgeType': return flow.getEdge(q.id)?.type ?? ''
      case 'edgeLabel': return flow.getEdge(q.id)?.label ?? ''
    }
  })
  const vp = flow.getViewport()
  return {
    nodes: flow.getNodes().map((n) => ({ id: n.id, x: num(n.position.x), y: num(n.position.y) })),
    edges: flow.getEdges().map((e) => ({ id: e.id ?? '', source: e.source, target: e.target })),
    selectedNodes: [...flow.selectedNodes()].sort(),
    selectedEdges: [...flow.selectedEdges()].sort(),
    viewport: { x: num(vp.x), y: num(vp.y), zoom: num(vp.zoom) },
    answers,
  }
}

// ---- emitters ------------------------------------------------------------

const d = (v: number): string => {
  const s = String(v)
  return s.includes('.') || s.includes('e') ? s : s + '.0'
}
const str = (s: string) => JSON.stringify(s)
// Kotlin lists are always explicitly typed: an EMPTY `listOf()` cannot infer T.
const strList = (xs: string[], lang: 'swift' | 'kotlin') => (lang === 'swift' ? `[${xs.map(str).join(', ')}]` : `listOf<String>(${xs.map(str).join(', ')})`)
const optD = (v: number | null, lang: 'swift' | 'kotlin') => (v === null ? 'nil'.replace('nil', lang === 'swift' ? 'nil' : 'null') : d(v))
const pointList = (ps: { x: number; y: number }[], lang: 'swift' | 'kotlin') =>
  lang === 'swift' ? `[${ps.map((p) => `(${d(p.x)}, ${d(p.y)})`).join(', ')}]` : `listOf<Pair<Double, Double>>(${ps.map((p) => `Pair(${d(p.x)}, ${d(p.y)})`).join(', ')})`

export const SWIFT_MARKERS = ['    // <flow-parity:start> GENERATED by src/tests/native-parity-fixture.ts — do not edit; PYREON_WRITE_FLOW_PARITY=1 bun run test', '    // <flow-parity:end>'] as const
export const KOTLIN_MARKERS = ['// <flow-parity:start> GENERATED by src/tests/native-parity-fixture.ts — do not edit; PYREON_WRITE_FLOW_PARITY=1 bun run test', '// <flow-parity:end>'] as const

function opSwift(o: ParityOp): string {
  switch (o.op) {
    case 'addNode': return `f.addNode(PyreonFlowNode(id: ${str(o.id)}, position: PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)}), data: NodeData(label: ${str(o.id)})))`
    case 'removeNode': return `f.removeNode(${str(o.id)})`
    case 'updateNodePosition': return `f.updateNodePosition(${str(o.id)}, PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)}))`
    case 'addEdge': return `f.addEdge(PyreonFlowEdge(id: ${str(o.id)}, source: ${str(o.source)}, target: ${str(o.target)}))`
    case 'removeEdge': return `f.removeEdge(${str(o.id)})`
    case 'selectNode': return `f.selectNode(${str(o.id)}, additive: ${o.additive})`
    case 'selectNodes': return `f.selectNodes(${strList(o.ids, 'swift')}, additive: ${o.additive})`
    case 'deselectNode': return `f.deselectNode(${str(o.id)})`
    case 'selectEdge': return `f.selectEdge(${str(o.id)}, additive: ${o.additive})`
    case 'clearSelection': return 'f.clearSelection()'
    case 'selectAll': return 'f.selectAll()'
    case 'deleteSelected': return 'f.deleteSelected()'
    case 'zoomTo': return `f.zoomTo(${d(o.zoom)})`
    case 'zoomIn': return 'f.zoomIn()'
    case 'zoomOut': return 'f.zoomOut()'
    case 'panTo': return `f.panTo(PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)}))`
    case 'setViewport': return `f.setViewport(PyreonFlowViewport(x: ${d(o.x)}, y: ${d(o.y)}, zoom: ${d(o.zoom)}))`
    case 'moveSelectedNodes': return `f.moveSelectedNodes(${d(o.dx)}, ${d(o.dy)})`
    case 'reconnectEdge': return `f.reconnectEdge(${str(o.id)}${o.source !== undefined ? `, source: ${str(o.source)}` : ''}${o.target !== undefined ? `, target: ${str(o.target)}` : ''})`
    case 'pushHistory': return 'f.pushHistory()'
    case 'undo': return 'f.undo()'
    case 'redo': return 'f.redo()'
    case 'setNodeExtent': return `f.setNodeExtent(minX: ${d(o.minX)}, minY: ${d(o.minY)}, maxX: ${d(o.maxX)}, maxY: ${d(o.maxY)})`
    case 'setContainerSize': return `f.replaceContainerSize(PyreonFlowContainerSize(width: ${d(o.width)}, height: ${d(o.height)}))`
    case 'fitView': return `f.fitView(${o.ids ? strList(o.ids, 'swift') : 'nil'}${o.padding !== undefined ? `, padding: ${d(o.padding)}` : ''})`
    case 'setCenter': return `f.setCenter(${d(o.x)}, ${d(o.y)}${o.zoom !== undefined ? `, zoom: ${d(o.zoom)}` : ''})`
    case 'copySelected': return 'f.copySelected()'
    case 'paste': return `f.paste(PyreonXYPosition(x: ${d(o.dx)}, y: ${d(o.dy)}))`
    case 'resolveCollisions': return `f.resolveCollisions(${str(o.id)}, ${d(o.spacing)})`
    case 'roundTripJSON': return 'f.fromJSON(f.toJSON())'
    case 'addEdgeWaypoint': return `f.addEdgeWaypoint(${str(o.id)}, PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)})${o.index !== undefined ? `, ${o.index}` : ''})`
    case 'removeEdgeWaypoint': return `f.removeEdgeWaypoint(${str(o.id)}, ${o.index})`
    case 'updateEdgeWaypoint': return `f.updateEdgeWaypoint(${str(o.id)}, ${o.index}, PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)}))`
    case 'layout': return `f.layout(${str(o.algorithm)}, options: PyreonFlowLayoutOptions(${[o.direction !== undefined ? `direction: ${str(o.direction)}` : '', o.nodeSpacing !== undefined ? `nodeSpacing: ${d(o.nodeSpacing)}` : '', o.layerSpacing !== undefined ? `layerSpacing: ${d(o.layerSpacing)}` : '', 'animate: false'].filter((x) => x !== '').join(', ')}))`
    case 'addNodes': return `f.addNodes([${o.nodes.map((n) => `PyreonFlowNode(id: ${str(n.id)}, position: PyreonXYPosition(x: ${d(n.x)}, y: ${d(n.y)}), data: NodeData(label: ${str(n.id)}))`).join(', ')}])`
    case 'setNodes': return `f.setNodes([${o.nodes.map((n) => `PyreonFlowNode(id: ${str(n.id)}, position: PyreonXYPosition(x: ${d(n.x)}, y: ${d(n.y)}), data: NodeData(label: ${str(n.id)}))`).join(', ')}] as [PyreonFlowNode<NodeData>])`
    case 'removeNodes': return `f.removeNodes(${strList(o.ids, 'swift')})`
    case 'updateNode': return `f.updateNode(${str(o.id)}) { $0.position = PyreonXYPosition(x: ${d(o.x)}, y: ${d(o.y)}) }`
    case 'updateNodeData': return `f.updateNodeData(${str(o.id)}) { $0.label = ${str(o.label)} }`
    case 'setMeasurement': return `f.updateNodeMeasurement(${str(o.id)}, width: ${d(o.width)}, height: ${d(o.height)})`
    case 'clearMeasurement': return `f.clearNodeMeasurement(${str(o.id)})`
    case 'addEdges': return `f.addEdges([${o.edges.map((e) => `PyreonFlowEdge(id: ${str(e.id)}, source: ${str(e.source)}, target: ${str(e.target)})`).join(', ')}])`
    case 'setEdges': return `f.setEdges([${o.edges.map((e) => `PyreonFlowEdge(id: ${str(e.id)}, source: ${str(e.source)}, target: ${str(e.target)})`).join(', ')}] as [PyreonFlowEdge])`
    case 'removeEdges': return `f.removeEdges(${strList(o.ids, 'swift')})`
    case 'updateEdge': return `f.updateEdge(${str(o.id)}) { $0.target = ${str(o.target)} }`
    case 'batch': return `f.batch { ${o.ops.map(opSwift).join('; ')} }`
  }
}

function opKotlin(o: ParityOp): string {
  switch (o.op) {
    case 'addNode': return `f.addNode(PyreonFlowNode(${str(o.id)}, position = PyreonXYPosition(${d(o.x)}, ${d(o.y)}), data = NodeData(${str(o.id)})))`
    case 'removeNode': return `f.removeNode(${str(o.id)})`
    case 'updateNodePosition': return `f.updateNodePosition(${str(o.id)}, PyreonXYPosition(${d(o.x)}, ${d(o.y)}))`
    case 'addEdge': return `f.addEdge(PyreonFlowEdge(${str(o.id)}, source = ${str(o.source)}, target = ${str(o.target)}))`
    case 'removeEdge': return `f.removeEdge(${str(o.id)})`
    case 'selectNode': return `f.selectNode(${str(o.id)}, additive = ${o.additive})`
    case 'selectNodes': return `f.selectNodes(${strList(o.ids, 'kotlin')}, additive = ${o.additive})`
    case 'deselectNode': return `f.deselectNode(${str(o.id)})`
    case 'selectEdge': return `f.selectEdge(${str(o.id)}, additive = ${o.additive})`
    case 'clearSelection': return 'f.clearSelection()'
    case 'selectAll': return 'f.selectAll()'
    case 'deleteSelected': return 'f.deleteSelected()'
    case 'zoomTo': return `f.zoomTo(${d(o.zoom)})`
    case 'zoomIn': return 'f.zoomIn()'
    case 'zoomOut': return 'f.zoomOut()'
    case 'panTo': return `f.panTo(PyreonXYPosition(${d(o.x)}, ${d(o.y)}))`
    case 'setViewport': return `f.setViewport(PyreonFlowViewport(${d(o.x)}, ${d(o.y)}, ${d(o.zoom)}))`
    case 'moveSelectedNodes': return `f.moveSelectedNodes(${d(o.dx)}, ${d(o.dy)})`
    case 'reconnectEdge': return `f.reconnectEdge(${str(o.id)}${o.source !== undefined ? `, source = ${str(o.source)}` : ''}${o.target !== undefined ? `, target = ${str(o.target)}` : ''})`
    case 'pushHistory': return 'f.pushHistory()'
    case 'undo': return 'f.undo()'
    case 'redo': return 'f.redo()'
    case 'setNodeExtent': return `f.setNodeExtent(minX = ${d(o.minX)}, minY = ${d(o.minY)}, maxX = ${d(o.maxX)}, maxY = ${d(o.maxY)})`
    case 'setContainerSize': return `f.replaceContainerSize(PyreonFlowContainerSize(${d(o.width)}, ${d(o.height)}))`
    case 'fitView': return `f.fitView(${o.ids ? strList(o.ids, 'kotlin') : 'null'}${o.padding !== undefined ? `, padding = ${d(o.padding)}` : ''})`
    case 'setCenter': return `f.setCenter(${d(o.x)}, ${d(o.y)}${o.zoom !== undefined ? `, zoom = ${d(o.zoom)}` : ''})`
    case 'copySelected': return 'f.copySelected()'
    case 'paste': return `f.paste(PyreonXYPosition(${d(o.dx)}, ${d(o.dy)}))`
    case 'resolveCollisions': return `f.resolveCollisions(${str(o.id)}, ${d(o.spacing)})`
    case 'roundTripJSON': return 'f.fromJSON(f.toJSON())'
    case 'addEdgeWaypoint': return `f.addEdgeWaypoint(${str(o.id)}, PyreonXYPosition(${d(o.x)}, ${d(o.y)})${o.index !== undefined ? `, index = ${o.index}` : ''})`
    case 'removeEdgeWaypoint': return `f.removeEdgeWaypoint(${str(o.id)}, ${o.index})`
    case 'updateEdgeWaypoint': return `f.updateEdgeWaypoint(${str(o.id)}, ${o.index}, PyreonXYPosition(${d(o.x)}, ${d(o.y)}))`
    case 'layout': return `f.layout(${str(o.algorithm)}, PyreonFlowLayoutOptions(${[o.direction !== undefined ? `direction = ${str(o.direction)}` : '', o.nodeSpacing !== undefined ? `nodeSpacing = ${d(o.nodeSpacing)}` : '', o.layerSpacing !== undefined ? `layerSpacing = ${d(o.layerSpacing)}` : '', 'animate = false'].filter((x) => x !== '').join(', ')}))`
    case 'addNodes': return `f.addNodes(listOf<PyreonFlowNode<NodeData>>(${o.nodes.map((n) => `PyreonFlowNode(${str(n.id)}, position = PyreonXYPosition(${d(n.x)}, ${d(n.y)}), data = NodeData(${str(n.id)}))`).join(', ')}))`
    case 'setNodes': return `f.setNodes(listOf<PyreonFlowNode<NodeData>>(${o.nodes.map((n) => `PyreonFlowNode(${str(n.id)}, position = PyreonXYPosition(${d(n.x)}, ${d(n.y)}), data = NodeData(${str(n.id)}))`).join(', ')}))`
    case 'removeNodes': return `f.removeNodes(${strList(o.ids, 'kotlin')})`
    case 'updateNode': return `f.updateNode(${str(o.id)}) { it.copy(position = PyreonXYPosition(${d(o.x)}, ${d(o.y)})) }`
    case 'updateNodeData': return `f.updateNodeData(${str(o.id)}) { it.copy(label = ${str(o.label)}) }`
    case 'setMeasurement': return `f.updateNodeMeasurement(${str(o.id)}, ${d(o.width)}, ${d(o.height)})`
    case 'clearMeasurement': return `f.clearNodeMeasurement(${str(o.id)})`
    case 'addEdges': return `f.addEdges(listOf<PyreonFlowEdge>(${o.edges.map((e) => `PyreonFlowEdge(${str(e.id)}, source = ${str(e.source)}, target = ${str(e.target)})`).join(', ')}))`
    case 'setEdges': return `f.setEdges(listOf<PyreonFlowEdge>(${o.edges.map((e) => `PyreonFlowEdge(${str(e.id)}, source = ${str(e.source)}, target = ${str(e.target)})`).join(', ')}))`
    case 'removeEdges': return `f.removeEdges(${strList(o.ids, 'kotlin')})`
    case 'updateEdge': return `f.updateEdge(${str(o.id)}) { it.copy(target = ${str(o.target)}) }`
    case 'batch': return `f.batch { ${o.ops.map(opKotlin).join('; ')} }`
  }
}

const webRect = (r: Rect4) => ({ x: r[0], y: r[1], width: r[2], height: r[3] })
const webTarget = (t: string | Rect4) => (typeof t === 'string' ? t : webRect(t))
function nativeRect(r: Rect4, target: 'swift' | 'kotlin'): string {
  return target === 'swift'
    ? `PyreonFlowRect(x: ${d(r[0])}, y: ${d(r[1])}, width: ${d(r[2])}, height: ${d(r[3])})`
    : `PyreonFlowRect(${d(r[0])}, ${d(r[1])}, ${d(r[2])}, ${d(r[3])})`
}
const nativeTarget = (t: string | Rect4, target: 'swift' | 'kotlin') => (typeof t === 'string' ? str(t) : nativeRect(t, target))

function answerSwift(q: ParityQuery, a: ParityExpectation['answers'][number], label: string): string {
  switch (q.q) {
    case 'isValidConnection': return `check(f.isValidConnection(PyreonFlowConnection(source: ${str(q.source)}, target: ${str(q.target)})) == ${String(a)}, ${str(label)})`
    case 'connectedEdges': return `check(f.getConnectedEdges(${str(q.id)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'incomers': return `check(f.getIncomers(${str(q.id)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'outgoers': return `check(f.getOutgoers(${str(q.id)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'screenToFlow': { const p = a as { x: number; y: number }; return `check(parityNear(f.screenToFlowPosition(PyreonXYPosition(x: ${d(q.x)}, y: ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'clampToExtent': { const p = a as { x: number; y: number }; return `check(parityNear(f.clampToExtent(PyreonXYPosition(x: ${d(q.x)}, y: ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'flowToScreen': { const p = a as { x: number; y: number }; return `check(parityNear(f.flowToScreenPosition(PyreonXYPosition(x: ${d(q.x)}, y: ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'isNodeVisible': return `check(f.isNodeVisible(${str(q.id)}) == ${String(a)}, ${str(label)})`
    case 'snapLines': { const r = a as SnapAnswer; return `check(paritySnap(f.getSnapLines(${str(q.id)}, PyreonXYPosition(x: ${d(q.x)}, y: ${d(q.y)})), ${optD(r.snapX, 'swift')}, ${optD(r.snapY, 'swift')}, ${d(r.x)}, ${d(r.y)}), ${str(label)})` }
    case 'absolutePosition': { const p = a as { x: number; y: number }; return `check(parityNear(f.getAbsolutePosition(${str(q.id)}), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'childNodes': return `check(f.getChildNodes(${str(q.id)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'overlapping': return `check(f.getOverlappingNodes(${str(q.id)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'intersecting': return `check(f.getIntersectingNodes(${nativeTarget(q.target, 'swift')}${q.partially !== undefined ? `, partially: ${q.partially}` : ''}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'isIntersecting': return `check(f.isNodeIntersecting(${nativeTarget(q.target, 'swift')}, ${nativeRect(q.area, 'swift')}${q.partially !== undefined ? `, partially: ${q.partially}` : ''}) == ${String(a)}, ${str(label)})`
    case 'nodesBounds': { const r = a as RectAnswer; return `check(parityRect(f.getNodesBounds(${q.ids ? strList(q.ids, 'swift') : ''}), ${d(r.x)}, ${d(r.y)}, ${d(r.width)}, ${d(r.height)}), ${str(label)})` }
    case 'proximity': return `check((f.getProximityConnection(${str(q.id)}, ${d(q.threshold)}).map { [$0.source, $0.target] } ?? []) == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'search': return `check(f.searchNodes(${str(q.query)}).map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
    case 'waypoints': return `check(parityPoints(f.getEdge(${str(q.id)})?.waypoints ?? [], ${pointList(a as { x: number; y: number }[], 'swift')}), ${str(label)})`
    case 'nodePosition': return `check(parityPoints(f.getNode(${str(q.id)}).map { [$0.position] } ?? [], ${pointList(a as { x: number; y: number }[], 'swift')}), ${str(label)})`
    case 'nodeSelected': return `check(f.isNodeSelected(${str(q.id)}) == ${String(a)}, ${str(label)})`
    case 'edgeSelected': return `check(f.isEdgeSelected(${str(q.id)}) == ${String(a)}, ${str(label)})`
    case 'dimensions': { const p = a as { x: number; y: number }; return `check({ let dm = f.getNodeDimensions(${str(q.id)}); return abs(dm.width - ${d(p.x)}) < 1e-6 && abs(dm.height - ${d(p.y)}) < 1e-6 }(), ${str(label)})` }
    case 'edgeType': return `check((f.getEdge(${str(q.id)})?.type ?? "") == ${str(a as string)}, ${str(label)})`
    case 'edgeLabel': return `check((f.getEdge(${str(q.id)})?.label ?? "") == ${str(a as string)}, ${str(label)})`
    case 'findByLabel': return `check(f.findNodes { $0.data.label == ${str(q.label)} }.map { $0.id } == ${strList(a as string[], 'swift')}, ${str(label)})`
  }
}

function answerKotlin(q: ParityQuery, a: ParityExpectation['answers'][number], label: string): string {
  switch (q.q) {
    case 'isValidConnection': return `check(f.isValidConnection(PyreonFlowConnection(source = ${str(q.source)}, target = ${str(q.target)})) == ${String(a)}, ${str(label)})`
    case 'connectedEdges': return `check(f.getConnectedEdges(${str(q.id)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'incomers': return `check(f.getIncomers(${str(q.id)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'outgoers': return `check(f.getOutgoers(${str(q.id)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'screenToFlow': { const p = a as { x: number; y: number }; return `check(parityNear(f.screenToFlowPosition(PyreonXYPosition(${d(q.x)}, ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'clampToExtent': { const p = a as { x: number; y: number }; return `check(parityNear(f.clampToExtent(PyreonXYPosition(${d(q.x)}, ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'flowToScreen': { const p = a as { x: number; y: number }; return `check(parityNear(f.flowToScreenPosition(PyreonXYPosition(${d(q.x)}, ${d(q.y)})), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'isNodeVisible': return `check(f.isNodeVisible(${str(q.id)}) == ${String(a)}, ${str(label)})`
    case 'snapLines': { const r = a as SnapAnswer; return `check(paritySnap(f.getSnapLines(${str(q.id)}, PyreonXYPosition(${d(q.x)}, ${d(q.y)})), ${optD(r.snapX, 'kotlin')}, ${optD(r.snapY, 'kotlin')}, ${d(r.x)}, ${d(r.y)}), ${str(label)})` }
    case 'absolutePosition': { const p = a as { x: number; y: number }; return `check(parityNear(f.getAbsolutePosition(${str(q.id)}), ${d(p.x)}, ${d(p.y)}), ${str(label)})` }
    case 'childNodes': return `check(f.getChildNodes(${str(q.id)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'overlapping': return `check(f.getOverlappingNodes(${str(q.id)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'intersecting': return `check(f.getIntersectingNodes(${nativeTarget(q.target, 'kotlin')}${q.partially !== undefined ? `, partially = ${q.partially}` : ''}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'isIntersecting': return `check(f.isNodeIntersecting(${nativeTarget(q.target, 'kotlin')}, ${nativeRect(q.area, 'kotlin')}${q.partially !== undefined ? `, partially = ${q.partially}` : ''}) == ${String(a)}, ${str(label)})`
    case 'nodesBounds': { const r = a as RectAnswer; return `check(parityRect(f.getNodesBounds(${q.ids ? strList(q.ids, 'kotlin') : ''}), ${d(r.x)}, ${d(r.y)}, ${d(r.width)}, ${d(r.height)}), ${str(label)})` }
    case 'proximity': return `check((f.getProximityConnection(${str(q.id)}, ${d(q.threshold)})?.let { listOf<String>(it.source, it.target) } ?: listOf<String>()) == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'search': return `check(f.searchNodes(${str(q.query)}).map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
    case 'waypoints': return `check(parityPoints(f.getEdge(${str(q.id)})?.waypoints ?: emptyList(), ${pointList(a as { x: number; y: number }[], 'kotlin')}), ${str(label)})`
    case 'nodePosition': return `check(parityPoints(f.getNode(${str(q.id)})?.let { listOf(it.position) } ?: emptyList(), ${pointList(a as { x: number; y: number }[], 'kotlin')}), ${str(label)})`
    case 'nodeSelected': return `check(f.isNodeSelected(${str(q.id)}) == ${String(a)}, ${str(label)})`
    case 'edgeSelected': return `check(f.isEdgeSelected(${str(q.id)}) == ${String(a)}, ${str(label)})`
    case 'dimensions': { const p = a as { x: number; y: number }; return `check(f.getNodeDimensions(${str(q.id)}).let { abs(it.width - ${d(p.x)}) < 1e-6 && abs(it.height - ${d(p.y)}) < 1e-6 }, ${str(label)})` }
    case 'edgeType': return `check((f.getEdge(${str(q.id)})?.type ?: "") == ${str(a as string)}, ${str(label)})`
    case 'edgeLabel': return `check((f.getEdge(${str(q.id)})?.label ?: "") == ${str(a as string)}, ${str(label)})`
    case 'findByLabel': return `check(f.findNodes { it.data.label == ${str(q.label)} }.map { it.id } == ${strList(a as string[], 'kotlin')}, ${str(label)})`
  }
}

export async function renderSwift(scenarios: readonly ParityScenario[] = PARITY_SCENARIOS): Promise<string> {
  const out: string[] = [SWIFT_MARKERS[0]]
  out.push('    static func parityNear(_ p: PyreonXYPosition, _ x: Double, _ y: Double) -> Bool { abs(p.x - x) < 1e-6 && abs(p.y - y) < 1e-6 }')
  out.push('    static func parityRect(_ r: PyreonFlowRect, _ x: Double, _ y: Double, _ w: Double, _ h: Double) -> Bool { abs(r.x - x) < 1e-6 && abs(r.y - y) < 1e-6 && abs(r.width - w) < 1e-6 && abs(r.height - h) < 1e-6 }')
  out.push('    static func parityOpt(_ v: Double?, _ want: Double?) -> Bool { switch (v, want) { case (nil, nil): return true; case let (a?, b?): return abs(a - b) < 1e-6; default: return false } }')
  out.push('    static func paritySnap(_ s: PyreonFlowSnapLines, _ x: Double?, _ y: Double?, _ px: Double, _ py: Double) -> Bool { parityOpt(s.x, x) && parityOpt(s.y, y) && parityNear(s.snappedPosition, px, py) }')
  out.push('    static func parityPoints(_ got: [PyreonXYPosition], _ want: [(Double, Double)]) -> Bool {')
  out.push('        if got.count != want.count { return false }')
  out.push('        for i in 0..<got.count { if abs(got[i].x - want[i].0) >= 1e-6 || abs(got[i].y - want[i].1) >= 1e-6 { return false } }')
  out.push('        return true')
  out.push('    }')
  out.push('    static func parityNodes(_ f: PyreonFlowState<NodeData>, _ want: [(String, Double, Double)], _ tol: Double = 1e-6) -> Bool {')
  out.push('        let got = f.nodes')
  out.push('        if got.count != want.count { return false }')
  out.push('        for i in 0..<got.count { if got[i].id != want[i].0 || abs(got[i].position.x - want[i].1) >= tol || abs(got[i].position.y - want[i].2) >= tol { return false } }')
  out.push('        return true')
  out.push('    }')
  out.push('    static func parityEdges(_ f: PyreonFlowState<NodeData>, _ want: [(String, String, String)]) -> Bool {')
  out.push('        let got = f.edges')
  out.push('        if got.count != want.count { return false }')
  out.push('        for i in 0..<got.count { if got[i].id != want[i].0 || got[i].source != want[i].1 || got[i].target != want[i].2 { return false } }')
  out.push('        return true')
  out.push('    }')
  out.push('    /// The web engine ran every scenario first; these are its answers.')
  out.push('    static func runParityChecks() {')
  for (const s of scenarios) {
    const e = await expectationsOf(s)
    out.push(`        do { // ${s.name}`)
    out.push(`            let f = PyreonFlowState<NodeData>(nodes: [${s.nodes.map((n) => `PyreonFlowNode(id: ${str(n.id)}${n.type !== undefined ? `, type: ${str(n.type)}` : ''}, position: PyreonXYPosition(x: ${d(n.x)}, y: ${d(n.y)}), data: NodeData(label: ${str(n.id)})${n.hidden !== undefined ? `, hidden: ${n.hidden}` : ''}${n.parentId !== undefined ? `, parentId: ${str(n.parentId)}` : ''})`).join(', ')}], edges: [${s.edges.map((x) => `PyreonFlowEdge(id: ${str(x.id)}, source: ${str(x.source)}, target: ${str(x.target)})`).join(', ')}]${s.snapToGrid !== undefined ? `, snapToGrid: ${s.snapToGrid}` : ''}${s.snapGrid !== undefined ? `, snapGrid: ${d(s.snapGrid)}` : ''}, searchText: { $0.label })`)
    for (const line of configEntries(s.config, 'swift')) out.push(`            ${line}`)
    for (const o of s.ops) out.push(`            ${opSwift(o)}`)
    out.push(`            check(parityNodes(f, [${e.nodes.map((n) => `(${str(n.id)}, ${d(n.x)}, ${d(n.y)})`).join(', ')}]${s.tolerance !== undefined ? `, ${d(s.tolerance)}` : ''}), ${str(`parity: ${s.name} — nodes`)})`)
    out.push(`            check(parityEdges(f, [${e.edges.map((x) => `(${str(x.id)}, ${str(x.source)}, ${str(x.target)})`).join(', ')}]), ${str(`parity: ${s.name} — edges`)})`)
    out.push(`            check(f.selectedNodes().sorted() == ${strList(e.selectedNodes, 'swift')}, ${str(`parity: ${s.name} — selected nodes`)})`)
    out.push(`            check(f.selectedEdges().sorted() == ${strList(e.selectedEdges, 'swift')}, ${str(`parity: ${s.name} — selected edges`)})`)
    out.push(`            check(abs(f.viewport.x - ${d(e.viewport.x)}) < 1e-6 && abs(f.viewport.y - ${d(e.viewport.y)}) < 1e-6 && abs(f.viewport.zoom - ${d(e.viewport.zoom)}) < 1e-6, ${str(`parity: ${s.name} — viewport`)})`)
    s.queries.forEach((q, i) => out.push(`            ${answerSwift(q, e.answers[i]!, `parity: ${s.name} — query ${i + 1} ${q.q}`)}`))
    out.push('        }')
  }
  out.push('    }')
  out.push(SWIFT_MARKERS[1])
  return out.join('\n')
}

export async function renderKotlin(scenarios: readonly ParityScenario[] = PARITY_SCENARIOS): Promise<string> {
  const out: string[] = [KOTLIN_MARKERS[0]]
  out.push('private fun parityNear(p: PyreonXYPosition, x: Double, y: Double): Boolean = abs(p.x - x) < 1e-6 && abs(p.y - y) < 1e-6')
  out.push('private fun parityRect(r: PyreonFlowRect, x: Double, y: Double, w: Double, h: Double): Boolean = abs(r.x - x) < 1e-6 && abs(r.y - y) < 1e-6 && abs(r.width - w) < 1e-6 && abs(r.height - h) < 1e-6')
  out.push('private fun parityOpt(v: Double?, want: Double?): Boolean = if (v == null || want == null) v == null && want == null else abs(v - want) < 1e-6')
  out.push('private fun paritySnap(s: PyreonFlowSnapLines, x: Double?, y: Double?, px: Double, py: Double): Boolean = parityOpt(s.x, x) && parityOpt(s.y, y) && parityNear(s.snappedPosition, px, py)')
  out.push('private fun parityPoints(got: List<PyreonXYPosition>, want: List<Pair<Double, Double>>): Boolean {')
  out.push('    if (got.size != want.size) return false')
  out.push('    for (i in got.indices) { if (abs(got[i].x - want[i].first) >= 1e-6 || abs(got[i].y - want[i].second) >= 1e-6) return false }')
  out.push('    return true')
  out.push('}')
  out.push('private fun parityNodes(f: PyreonFlowState<NodeData>, want: List<Triple<String, Double, Double>>, tol: Double = 1e-6): Boolean {')
  out.push('    val got = f.nodes')
  out.push('    if (got.size != want.size) return false')
  out.push('    for (i in got.indices) { if (got[i].id != want[i].first || abs(got[i].position.x - want[i].second) >= tol || abs(got[i].position.y - want[i].third) >= tol) return false }')
  out.push('    return true')
  out.push('}')
  out.push('private fun parityEdges(f: PyreonFlowState<NodeData>, want: List<Triple<String, String, String>>): Boolean {')
  out.push('    val got = f.edges')
  out.push('    if (got.size != want.size) return false')
  out.push('    for (i in got.indices) { if (got[i].id != want[i].first || got[i].source != want[i].second || got[i].target != want[i].third) return false }')
  out.push('    return true')
  out.push('}')
  out.push('/** The web engine ran every scenario first; these are its answers. */')
  out.push('private fun runParityChecks() {')
  for (const s of scenarios) {
    const e = await expectationsOf(s)
    out.push(`    run { // ${s.name}`)
    out.push(`        val f = PyreonFlowState<NodeData>(nodes = listOf<PyreonFlowNode<NodeData>>(${s.nodes.map((n) => `PyreonFlowNode(${str(n.id)}${n.type !== undefined ? `, type = ${str(n.type)}` : ''}, position = PyreonXYPosition(${d(n.x)}, ${d(n.y)}), data = NodeData(${str(n.id)})${n.hidden !== undefined ? `, hidden = ${n.hidden}` : ''}${n.parentId !== undefined ? `, parentId = ${str(n.parentId)}` : ''})`).join(', ')}), edges = listOf<PyreonFlowEdge>(${s.edges.map((x) => `PyreonFlowEdge(${str(x.id)}, source = ${str(x.source)}, target = ${str(x.target)})`).join(', ')})${s.snapToGrid !== undefined ? `, snapToGrid = ${s.snapToGrid}` : ''}${s.snapGrid !== undefined ? `, snapGrid = ${d(s.snapGrid)}` : ''}, searchText = { it.label })`)
    for (const line of configEntries(s.config, 'kotlin')) out.push(`        ${line}`)
    for (const o of s.ops) out.push(`        ${opKotlin(o)}`)
    out.push(`        check(parityNodes(f, listOf<Triple<String, Double, Double>>(${e.nodes.map((n) => `Triple(${str(n.id)}, ${d(n.x)}, ${d(n.y)})`).join(', ')})${s.tolerance !== undefined ? `, ${d(s.tolerance)}` : ''}), ${str(`parity: ${s.name} — nodes`)})`)
    out.push(`        check(parityEdges(f, listOf<Triple<String, String, String>>(${e.edges.map((x) => `Triple(${str(x.id)}, ${str(x.source)}, ${str(x.target)})`).join(', ')})), ${str(`parity: ${s.name} — edges`)})`)
    out.push(`        check(f.selectedNodes().sorted() == ${strList(e.selectedNodes, 'kotlin')}, ${str(`parity: ${s.name} — selected nodes`)})`)
    out.push(`        check(f.selectedEdges().sorted() == ${strList(e.selectedEdges, 'kotlin')}, ${str(`parity: ${s.name} — selected edges`)})`)
    out.push(`        check(abs(f.viewport.x - ${d(e.viewport.x)}) < 1e-6 && abs(f.viewport.y - ${d(e.viewport.y)}) < 1e-6 && abs(f.viewport.zoom - ${d(e.viewport.zoom)}) < 1e-6, ${str(`parity: ${s.name} — viewport`)})`)
    s.queries.forEach((q, i) => out.push(`        ${answerKotlin(q, e.answers[i]!, `parity: ${s.name} — query ${i + 1} ${q.q}`)}`))
    out.push('    }')
  }
  out.push('}')
  out.push(KOTLIN_MARKERS[1])
  return out.join('\n')
}

/** Replace (or, on first use, insert before `anchor`) the marker-delimited region. */
export function spliceRegion(file: string, markers: readonly [string, string], region: string, anchor: string): string {
  const a = file.indexOf(markers[0])
  const b = file.indexOf(markers[1])
  if (a >= 0 && b > a) return file.slice(0, a) + region + file.slice(b + markers[1].length)
  const at = file.indexOf(anchor)
  if (at < 0) throw new Error(`[flow-parity] anchor not found: ${anchor}`)
  return file.slice(0, at) + region + '\n\n' + file.slice(at)
}
