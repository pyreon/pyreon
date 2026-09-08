import type { VNodeChild } from '@pyreon/core'
import type { Computed, Signal } from '@pyreon/reactivity'

// ─── Position & Geometry ─────────────────────────────────────────────────────

export interface XYPosition {
  x: number
  y: number
}

export interface Dimensions {
  width: number
  height: number
}

export interface Rect extends XYPosition, Dimensions {}

// ─── Viewport ────────────────────────────────────────────────────────────────

export interface Viewport {
  x: number
  y: number
  zoom: number
}

// ─── Handle ──────────────────────────────────────────────────────────────────

export type HandleType = 'source' | 'target'

export enum Position {
  Top = 'top',
  Right = 'right',
  Bottom = 'bottom',
  Left = 'left',
}

export interface HandleConfig {
  id?: string
  type: HandleType
  position: Position
}

/**
 * A `<Handle>` dot's measured placement inside its node, recorded by the
 * NodeLayer's measurement pass (client-only). `x`/`y` are the dot's CENTER
 * relative to the node's top-left corner, in unscaled flow units — edge
 * geometry anchors the edge exactly at the dot, wherever the consumer's CSS
 * placed it.
 */
export interface MeasuredHandle {
  /** The handle's `id` prop (falls back to its `type` when omitted) */
  id: string
  type: HandleType
  /** The declared side — drives the path's departure/approach tangent */
  position: Position
  /** Center X relative to the node's top-left, unscaled flow units */
  x: number
  /** Center Y relative to the node's top-left, unscaled flow units */
  y: number
}

/**
 * A node's measured DOM geometry — rendered size plus every `<Handle>` dot's
 * placement. Written by the NodeLayer's per-node `ResizeObserver`; read by edge
 * geometry, auto-layout, fitView, snap lines, the minimap, and viewport
 * culling so they all operate on the REAL rendered box.
 */
export interface NodeMeasurement {
  width: number
  height: number
  /** Measured `<Handle>` dots inside this node — absent when the node renders none */
  handles?: MeasuredHandle[]
}

// ─── Node ────────────────────────────────────────────────────────────────────

export interface FlowNode<TData = Record<string, unknown>> {
  id: string
  type?: string
  position: XYPosition
  data: TData
  width?: number
  height?: number
  /** Whether the node can be dragged */
  draggable?: boolean
  /** Whether the node can be selected */
  selectable?: boolean
  /** Whether the node can be connected to */
  connectable?: boolean
  /**
   * Whether the node is a keyboard focus stop (`tabindex=0`) — default: true.
   * A focused node takes Enter/Space (select) and the arrow keys (move).
   * `false` keeps the node reachable by pointer only. See also
   * {@link FlowConfig.nodesFocusable} and {@link FlowConfig.disableKeyboardA11y}.
   */
  focusable?: boolean
  /**
   * Accessible name announced when the node receives focus. Without it a
   * screen reader reads the node's own content, which is usually right —
   * set this when the content is an icon or a chart.
   */
  ariaLabel?: string
  /**
   * Hidden nodes are kept in the graph (ids, edges, selection, JSON) but not
   * rendered; edges touching a hidden node are not rendered either.
   */
  hidden?: boolean
  /** `false` exempts the node from `deleteSelected()` / the Delete key. */
  deletable?: boolean
  /** Custom class name */
  class?: string
  /** Custom style */
  style?: string
  /** Source handles */
  sourceHandles?: HandleConfig[]
  /** Target handles */
  targetHandles?: HandleConfig[]
  /**
   * Parent node id. A child's `position` is RELATIVE to its parent's
   * top-left (React Flow's sub-flow model): the parent moves its children,
   * edges and `fitView` use the absolute position (`getAbsolutePosition`).
   */
  parentId?: string
  /**
   * Drag boundary for THIS node. `'parent'` keeps a child inside its
   * parent's box; a `[[minX, minY], [maxX, maxY]]` box is in the node's own
   * coordinate space (relative to the parent when it has one). Overrides the
   * global `nodeExtent` for this node.
   */
  extent?: 'parent' | [[number, number], [number, number]]
  /** Grow the parent to contain this node when it is dragged past the parent's edge. */
  expandParent?: boolean
  /** Whether this node is a group */
  group?: boolean
}

// ─── Edge ────────────────────────────────────────────────────────────────────

/**
 * Built-in edge path types. Custom edge types registered via
 * `<Flow edgeTypes={{ custom: MyEdge }}>` are also valid as the
 * `type` field — the `(string & {})` widens the union to accept
 * any string while preserving autocomplete on the built-in cases.
 */
export type EdgeType = 'bezier' | 'smoothstep' | 'straight' | 'step' | (string & {})

// ─── Edge markers ──────────────────────────────────────────────────────────
//
// React Flow parity: per-edge configurable arrowheads. `MarkerType.Arrow` is an
// open chevron (stroked, no fill); `MarkerType.ArrowClosed` is a filled
// triangle. Either end of an edge takes a bare `MarkerType` (default styling)
// or a full `EdgeMarker` object (color / size). The Flow component dedupes
// markers by config across all edges into a single `<defs>` block.

export enum MarkerType {
  Arrow = 'arrow',
  ArrowClosed = 'arrowclosed',
}

export interface EdgeMarker {
  /** Arrow shape — open chevron or filled triangle */
  type: MarkerType
  /** Marker fill/stroke color — default inherits the edge color (#999) */
  color?: string
  /** Marker box width — default 10 */
  width?: number
  /** Marker box height — default 7 */
  height?: number
  /** Stroke width for the open `Arrow` shape — default 1 */
  strokeWidth?: number
}

/** An edge marker: a bare {@link MarkerType} (default styling) or full config. */
export type EdgeMarkerSpec = EdgeMarker | MarkerType

export interface FlowEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type?: EdgeType
  label?: string
  animated?: boolean
  /**
   * Whether the edge is a keyboard focus stop — default: true. A focused
   * edge takes Enter/Space (select). See {@link FlowConfig.edgesFocusable}.
   */
  focusable?: boolean
  /** Accessible name — default `"Edge from <source> to <target>"`. */
  ariaLabel?: string
  /** Hidden edges stay in the graph but are not rendered. */
  hidden?: boolean
  /** `false` exempts the edge from `deleteSelected()` / the Delete key. */
  deletable?: boolean
  /**
   * Whether a selected edge shows draggable endpoint handles that reconnect
   * it to another handle — default: true (see `FlowConfig.edgesReconnectable`).
   */
  reconnectable?: boolean
  /**
   * Width, in px, of the invisible hit area around the edge — default: the
   * config's `edgeInteractionWidth` (20). A hairline edge is otherwise
   * unclickable.
   */
  interactionWidth?: number
  class?: string
  style?: string
  /** Marker at the START (source end). Omitted → no start marker. */
  markerStart?: EdgeMarkerSpec
  /**
   * Marker at the END (target end). Omitted → the flow's `defaultMarkerEnd`
   * (a filled arrowhead) is used; pass `null` to remove it for this edge.
   */
  markerEnd?: EdgeMarkerSpec | null
  /** Custom data attached to the edge */
  data?: Record<string, unknown>
  /** Waypoints — intermediate points the edge passes through */
  waypoints?: XYPosition[]
  /**
   * Per-edge tuning for the built-in path builders. Only the fields relevant
   * to this edge's `type` apply: `curvature` → `bezier`; `borderRadius` +
   * `offset` → `smoothstep`; `offset` → `step`. `straight` and waypoint routes
   * ignore all of them.
   */
  pathOptions?: EdgePathOptions
}

/**
 * Tuning knobs for the built-in edge path builders — set per edge via
 * {@link FlowEdge.pathOptions} or flow-wide via
 * `config.defaultEdgeOptions.pathOptions`.
 */
export interface EdgePathOptions {
  /**
   * Bezier control-point strength as a fraction of the endpoint distance —
   * default `0.25`. `0` collapses to a straight line; larger values bow the
   * curve further out. `bezier` edges only.
   */
  curvature?: number
  /**
   * Corner rounding radius in px for `smoothstep` edges — default `5`.
   * (`step` edges are `smoothstep` with `borderRadius` locked to `0`.)
   */
  borderRadius?: number
  /**
   * How far (px) a `smoothstep`/`step` edge travels straight out of its
   * endpoint before turning — default `20`.
   */
  offset?: number
}

/**
 * The edge fields {@link FlowConfig.defaultEdgeOptions} can default — every
 * per-edge field except the identity/topology ones (`id`, `source`, `target`,
 * `sourceHandle`, `targetHandle`, `waypoints`).
 */
export type DefaultEdgeOptions = Omit<
  Partial<FlowEdge>,
  'id' | 'source' | 'target' | 'sourceHandle' | 'targetHandle' | 'waypoints'
>

// ─── Connection ──────────────────────────────────────────────────────────────

export interface Connection {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export type ConnectionRule = Record<string, { outputs: string[] }>

/** A keyboard modifier, matched against the corresponding `KeyboardEvent`/`MouseEvent` flag. */
export type ModifierKey = 'shift' | 'ctrl' | 'meta' | 'alt'

/**
 * Props of a custom connection line (`<Flow connectionLine={MyLine}>`):
 * every field is a reactive accessor that follows the pointer, and `path`
 * is the built-in path of `config.connectionLineType` for the same points.
 */
export interface ConnectionLineProps {
  sourceX: () => number
  sourceY: () => number
  targetX: () => number
  targetY: () => number
  sourcePosition: () => Position
  path: () => string
}

// ─── Node Change Events ──────────────────────────────────────────────────────

export type NodeChange =
  | { type: 'position'; id: string; position: XYPosition }
  | { type: 'dimensions'; id: string; dimensions: Dimensions }
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'remove'; id: string }

export type EdgeChange =
  | { type: 'add'; edge: FlowEdge }
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'remove'; id: string }

/** Options for the viewport setters — `duration > 0` animates (ms). */
export interface ViewportOptions {
  duration?: number
}

// ─── Edge path result ────────────────────────────────────────────────────────

/**
 * One drawing primitive in an edge's path — the closed vocabulary every
 * built-in path builder (`getBezierPath`/`getSmoothStepPath`/`getStraightPath`/
 * `getStepPath`/`getWaypointPath`) reduces to. Exactly the four SVG path
 * commands those builders ever emit (`M`/`L`/`C`/`Q`), structured instead of
 * stringified — a `move`/`line`/`cubic`/`quad` union, closed by construction
 * (every builder's output is representable; nothing here anticipates a
 * command no builder produces).
 *
 * This exists so a NON-SVG renderer (a `Canvas` executor) can draw the exact
 * same edge without parsing the `path` string — `move`→`moveTo`, `line`→
 * `lineTo`, `cubic`→`addCurve`/`cubicTo`, `quad`→`addQuadCurve`/
 * `quadraticBezierTo`. The web SVG renderer is unaffected: `path` (the `d`
 * attribute string) stays the source of truth there, unchanged in every
 * builder. `segments` is an ADDITIVE, parallel representation of the same
 * geometry — the two must always agree (locked by a differential test per
 * builder), so a consumer picks whichever it needs and never both.
 */
export type EdgeSegment =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'line'; x: number; y: number }
  | { kind: 'cubic'; x: number; y: number; c1x: number; c1y: number; c2x: number; c2y: number }
  | { kind: 'quad'; x: number; y: number; cx: number; cy: number }

export interface EdgePathResult {
  path: string
  labelX: number
  labelY: number
  /** The same geometry as `path`, structured for a non-SVG (Canvas) renderer. */
  segments: EdgeSegment[]
}

/**
 * A fully-derived edge geometry packet — endpoint coordinates, tangent sides,
 * the SVG path string, and the label anchor. Produced by `computeEdgeGeometry`
 * (edge-geometry.ts) and memoized per edge on the instance
 * (`FlowInstance._edgeGeometry`); the EdgeLayer's path/marker/label thunks and
 * custom-edge accessor props all read the shared computed.
 */
export interface EdgeGeometry {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  /** Side the edge departs from — the source tangent for path builders */
  sourcePosition: Position
  /** Side the edge approaches — the target tangent for path builders */
  targetPosition: Position
  path: string
  labelX: number
  labelY: number
  /** The same geometry as `path`, structured for a non-SVG (Canvas) renderer. */
  segments: EdgeSegment[]
}

// ─── Flow config ─────────────────────────────────────────────────────────────

export interface FlowConfig<TData = Record<string, unknown>> {
  nodes?: FlowNode<TData>[]
  edges?: FlowEdge[]
  /** Default edge type */
  defaultEdgeType?: EdgeType
  /**
   * Defaults merged into every edge that doesn't set the field itself —
   * applied to the initial `edges` array AND every later `addEdge()` /
   * connection-drawn edge. An edge's own explicit value (including an explicit
   * `markerEnd: null`) always wins. `type` resolution order:
   * `edge.type` → `defaultEdgeOptions.type` → `defaultEdgeType` → `'bezier'`.
   *
   * ```ts
   * createFlow({
   *   defaultEdgeOptions: { type: 'smoothstep', animated: true, pathOptions: { borderRadius: 8 } },
   * })
   * ```
   */
  defaultEdgeOptions?: DefaultEdgeOptions
  /** Min zoom level — default: 0.1 */
  minZoom?: number
  /** Max zoom level — default: 4 */
  maxZoom?: number
  /** Snap to grid */
  snapToGrid?: boolean
  /** Grid size for snapping — default: 15 */
  snapGrid?: number
  /**
   * Snap a dragged node to align with other nodes' edges / centers, drawing
   * helper guide lines (the React Flow "helper lines" behavior). Default
   * `true`. Set `false` to skip the per-drag-frame O(N) alignment scan when
   * you don't need object-snapping — on large graphs this is the dominant
   * drag-frame cost; disabling it makes a drag effectively O(1) of framework
   * work plus the single immutable node-array update.
   */
  snapToObjects?: boolean
  /** Connection rules — which node types can connect */
  connectionRules?: ConnectionRule
  /** Whether nodes are draggable by default — default: true */
  nodesDraggable?: boolean
  /** Whether nodes are connectable by default — default: true */
  nodesConnectable?: boolean
  /** Whether nodes are selectable by default — default: true */
  nodesSelectable?: boolean
  /**
   * Whether nodes are keyboard focus stops by default — default: true.
   * Per-node `focusable: false` still wins.
   */
  nodesFocusable?: boolean
  /** Whether edges are keyboard focus stops by default — default: true. */
  edgesFocusable?: boolean
  /**
   * Turn off the keyboard accessibility layer entirely: nodes and edges get
   * `tabindex=-1`, no `aria-describedby` instructions, no arrow-key moves.
   * The canvas itself stays focusable (Delete / Escape / undo shortcuts).
   * Default: false. Mirrors React Flow's `disableKeyboardA11y`.
   */
  disableKeyboardA11y?: boolean
  /**
   * Reduced-motion policy for `fitView` / `animateViewport` / animated
   * `layout()`. `'auto'` (default) honours the user's
   * `prefers-reduced-motion: reduce` media query and JUMPS instead of
   * animating; `true` always jumps; `false` always animates.
   */
  reducedMotion?: boolean | 'auto'
  /** Whether nodes can be deleted by `deleteSelected()` — default: true */
  nodesDeletable?: boolean
  /** Whether edges can be deleted by `deleteSelected()` — default: true */
  edgesDeletable?: boolean
  /**
   * Per-connection veto consulted by `isValidConnection()` (and so by every
   * interactive connection drop) BEFORE `connectionRules`. Return `false` to
   * refuse. Mirrors React Flow's `isValidConnection`.
   */
  isValidConnection?: (connection: Connection) => boolean
  /**
   * Snap distance, in SCREEN pixels, for a connection dropped NEAR a target
   * handle rather than on it: the nearest handle within the radius receives
   * the connection. `0` (default) requires a drop on the handle itself.
   */
  connectionRadius?: number
  /**
   * Automatic undo checkpoints — default: true. Every structural mutation
   * (`addNode(s)`/`removeNode(s)`/`addEdge(s)`/`removeEdge(s)`/`setNodes`/
   * `setEdges`/`updateNodeData`/`deleteSelected`/`paste`/`fromJSON`/`layout`)
   * records a checkpoint before it applies, so `undo()` works with no manual
   * `pushHistory()` calls. `false` restores the manual model. A checkpoint
   * is skipped when nothing changed since the previous one, so a manual
   * `pushHistory()` right before a mutation never double-records.
   */
  autoHistory?: boolean
  /** Whether to allow multi-selection — default: true */
  multiSelect?: boolean
  /** Drag boundaries for nodes — [[minX, minY], [maxX, maxY]] */
  nodeExtent?: [[number, number], [number, number]]
  /** Whether panning is enabled — default: true */
  pannable?: boolean
  /** Whether zooming is enabled — default: true */
  zoomable?: boolean
  /**
   * Pan on pointer drag over the empty canvas — default: true. `false`
   * disables; an array restricts it to those mouse buttons (`0` left,
   * `1` middle, `2` right), the React Flow shape `panOnDrag={[1, 2]}`.
   */
  panOnDrag?: boolean | number[]
  /**
   * The wheel PANS instead of zooming — default: false. Shift+wheel pans
   * horizontally; Ctrl/Cmd+wheel still zooms (`zoomActivationKey`).
   */
  panOnScroll?: boolean
  /** Pan distance per wheel unit under `panOnScroll` — default: 0.5 */
  panOnScrollSpeed?: number
  /** Wheel zooms — default: true (`zoomable: false` also disables it). */
  zoomOnScroll?: boolean
  /** Two-finger pinch zooms — default: true. */
  zoomOnPinch?: boolean
  /** Double-click on the empty canvas zooms in one step around the pointer — default: false. */
  zoomOnDoubleClick?: boolean
  /**
   * A plain drag over the empty canvas draws a selection box instead of
   * panning — default: false. Pair with `panOnDrag: [1, 2]` to keep panning
   * on the middle / right button (the React Flow "figma-like" preset).
   */
  selectionOnDrag?: boolean
  /**
   * Selection-box hit rule — `'partial'` (default) selects every node the
   * box touches, `'full'` only nodes it fully contains.
   */
  selectionMode?: 'partial' | 'full'
  /**
   * Keys that delete the selection — default: `['Delete', 'Backspace']`.
   * `null` disables keyboard deletion. Compared against `KeyboardEvent.key`.
   */
  deleteKeys?: string[] | null
  /** Modifier that ADDS a click to the selection — default: `'shift'`; `null` disables. */
  multiSelectionKey?: ModifierKey | null
  /** Modifier that turns a canvas drag into a selection box — default: `'shift'`; `null` disables. */
  selectionKey?: ModifierKey | null
  /** Modifier that zooms under `panOnScroll` — default: `'ctrl'` (Cmd on macOS also counts). */
  zoomActivationKey?: ModifierKey | null
  /** Whether selected edges show reconnect handles — default: true */
  edgesReconnectable?: boolean
  /** Default invisible hit width, in px, around every edge — default: 20 */
  edgeInteractionWidth?: number
  /** Path type of the in-progress connection line — default: `'bezier'` */
  connectionLineType?: EdgeType
  /** Call `preventDefault()` on wheel events the canvas handles — default: true */
  preventScrolling?: boolean
  /** Fit view on initial render — default: false */
  fitView?: boolean
  /** Padding for fitView — default: 0.1 */
  fitViewPadding?: number
  /**
   * Default END marker for edges that don't set their own `markerEnd`.
   * Default: a filled arrowhead (`{ type: MarkerType.ArrowClosed }`), matching
   * the historical built-in. Pass `null` to make edges arrowless by default.
   */
  defaultMarkerEnd?: EdgeMarkerSpec | null
  /**
   * Skip rendering nodes/edges outside the current viewport (React Flow's
   * `onlyRenderVisibleElements`). Off by default; turn on for large graphs.
   */
  onlyRenderVisibleElements?: boolean
}

// ─── Snap session ────────────────────────────────────────────────────────────

/**
 * A per-drag object-snapping session (see `FlowInstance._createSnapSession`).
 * Candidate guide lines are precomputed at drag start; `move` resolves the
 * snap lines + snapped position for the drag's current raw position.
 */
export interface SnapSession {
  move: (position: XYPosition) => {
    x: number | null
    y: number | null
    snappedPosition: XYPosition
  }
}

// ─── Flow instance ───────────────────────────────────────────────────────────

export interface FlowInstance<TData = Record<string, unknown>> {
  // ── State (signals) ──────────────────────────────────────────────────────

  /** All nodes — reactive */
  nodes: Signal<FlowNode<TData>[]>
  /** All edges — reactive */
  edges: Signal<FlowEdge[]>
  /** Viewport state — reactive */
  viewport: Signal<Viewport>
  /** Current zoom level — computed */
  zoom: Computed<number>
  /** Selected node ids — computed */
  selectedNodes: Computed<string[]>
  /** Selected edge ids — computed */
  selectedEdges: Computed<string[]>
  /** Node id → node lookup map — computed, O(1) access (rebuilt once per `nodes()` change) */
  nodeMap: Computed<Map<string, FlowNode<TData>>>
  /** Edge id → edge lookup map — computed, O(1) access (rebuilt once per `edges()` change) */
  edgeMap: Computed<Map<string, FlowEdge>>
  /** Container dimensions — updated by the Flow component via ResizeObserver */
  containerSize: Signal<{ width: number; height: number }>
  /**
   * Per-node measured DOM geometry (size + `<Handle>` dot placements), written
   * by the NodeLayer's per-node `ResizeObserver` (client-only). Edge geometry,
   * auto-layout, fitView, snap lines, the minimap, and viewport culling all
   * read this so they operate on the node's REAL rendered box instead of the
   * 150×40 fallback. An explicit `node.width`/`node.height` still wins; the
   * map is empty under SSR / happy-dom (no layout), so those paths fall back
   * to explicit-or-default.
   */
  measurements: Signal<Map<string, NodeMeasurement>>
  /**
   * A node's effective dimensions — the box every geometry consumer uses.
   * Precedence: explicit `node.width`/`node.height` (a deliberate consumer
   * override) → measured DOM size → the 150×40 default. Non-reactive read
   * (peeks); read `measurements()` directly for a tracking read.
   */
  getNodeDimensions: (id: string) => Dimensions
  /** @internal — the NodeLayer records a node's measured geometry here. */
  _setNodeMeasurement: (
    id: string,
    width: number,
    height: number,
    handles?: MeasuredHandle[],
  ) => void
  /** @internal — the NodeLayer clears a node's measurement on unmount. */
  _clearNodeMeasurement: (id: string) => void

  // ── Node operations ──────────────────────────────────────────────────────

  /** Get a single node by id */
  getNode: (id: string) => FlowNode<TData> | undefined
  /** Add a node */
  addNode: (node: FlowNode<TData>) => void
  /** Remove a node and its connected edges */
  removeNode: (id: string) => void
  /** Update a node's properties */
  updateNode: (id: string, update: Partial<FlowNode<TData>>) => void
  /** Update a node's position */
  updateNodePosition: (id: string, position: XYPosition) => void
  /** Merge into (or replace, via a function) a node's `data`. */
  updateNodeData: (
    id: string,
    data: Partial<TData> | ((node: FlowNode<TData>) => Partial<TData>),
  ) => void
  /** Plain (untracked) read of the node array. */
  getNodes: () => FlowNode<TData>[]
  /** Add many nodes in one batch (duplicate ids are ignored, as in `addNode`). */
  addNodes: (nodes: FlowNode<TData>[]) => void
  /** Replace the node array (or map it via a function). Selection is pruned to the ids that remain. */
  setNodes: (nodes: FlowNode<TData>[] | ((nodes: FlowNode<TData>[]) => FlowNode<TData>[])) => void
  /** Remove many nodes (and their edges) in one batch. */
  removeNodes: (ids: Iterable<string>) => void

  // ── Edge operations ──────────────────────────────────────────────────────

  /** Get a single edge by id */
  getEdge: (id: string) => FlowEdge | undefined
  /** Add an edge */
  addEdge: (edge: FlowEdge) => void
  /** Remove an edge */
  removeEdge: (id: string) => void
  /** Plain (untracked) read of the edge array. */
  getEdges: () => FlowEdge[]
  /** Add many edges in one batch. */
  addEdges: (edges: FlowEdge[]) => void
  /** Replace the edge array (or map it via a function). Ids/types are normalised as in `addEdge`. */
  setEdges: (edges: FlowEdge[] | ((edges: FlowEdge[]) => FlowEdge[])) => void
  /** Remove many edges in one batch. */
  removeEdges: (ids: Iterable<string>) => void
  /** Merge fields into an edge. */
  updateEdge: (id: string, update: Partial<FlowEdge>) => void
  /** Check if a connection is valid (based on rules) */
  isValidConnection: (connection: Connection) => boolean

  // ── Selection ────────────────────────────────────────────────────────────

  /** Select a node */
  selectNode: (id: string, additive?: boolean) => void
  /** Deselect a node */
  deselectNode: (id: string) => void
  /**
   * Select many nodes in ONE state write. `additive: false` (default)
   * replaces the node selection and clears the edge selection — the same net
   * state as `clearSelection()` + one additive `selectNode` per id, without
   * the per-id Set copy (which made a K-node rubber-band commit O(K²)).
   */
  selectNodes: (ids: Iterable<string>, additive?: boolean) => void
  /**
   * Reactive O(1) selection membership — tracks the selection signal when
   * called from a reactive scope (a JSX thunk, `effect()`, `computed()`).
   * Prefer this over `selectedNodes().includes(id)` (an O(N) scan per call).
   */
  isNodeSelected: (id: string) => boolean
  /** Reactive O(1) edge-selection membership — see {@link FlowInstance.isNodeSelected}. */
  isEdgeSelected: (id: string) => boolean
  /** Select an edge */
  selectEdge: (id: string, additive?: boolean) => void
  /** Clear all selection */
  clearSelection: () => void
  /** Select all nodes */
  selectAll: () => void
  /** Delete selected nodes/edges */
  deleteSelected: () => void

  // ── Viewport ─────────────────────────────────────────────────────────────

  /** Fit view to show all nodes; `duration` animates */
  fitView: (nodeIds?: string[], padding?: number, options?: ViewportOptions) => void
  /** Set zoom level; `duration` animates */
  zoomTo: (zoom: number, options?: ViewportOptions) => void
  /** Zoom in; `duration` animates */
  zoomIn: (options?: ViewportOptions) => void
  /** Zoom out; `duration` animates */
  zoomOut: (options?: ViewportOptions) => void
  /** Pan to position */
  panTo: (position: XYPosition) => void
  /** Plain (untracked) read of the viewport. */
  getViewport: () => Viewport
  /** Set the viewport (partial — omitted fields keep their value); `duration` animates. */
  setViewport: (viewport: Partial<Viewport>, options?: ViewportOptions) => void
  /** Center the viewport on a FLOW coordinate, optionally changing zoom; `duration` animates. */
  setCenter: (x: number, y: number, options?: ViewportOptions & { zoom?: number }) => void
  /**
   * Convert a SCREEN point (`clientX`/`clientY`) to flow coordinates, using
   * the mounted canvas's rect and the current viewport. Without a mounted
   * `<Flow>` the point is treated as canvas-relative.
   */
  screenToFlowPosition: (position: XYPosition) => XYPosition
  /** Inverse of {@link FlowInstance.screenToFlowPosition}. */
  flowToScreenPosition: (position: XYPosition) => XYPosition
  /** @internal — `<Flow>` registers its container element for the screen↔flow conversions. */
  _setContainer: (el: HTMLElement | null) => void
  /** Check if a node is visible in the current viewport */
  isNodeVisible: (id: string) => boolean

  // ── Layout ───────────────────────────────────────────────────────────────

  /** Apply auto-layout */
  layout: (algorithm?: LayoutAlgorithm, options?: LayoutOptions) => Promise<void>

  // ── Batch ────────────────────────────────────────────────────────────────

  /** Batch multiple operations */
  batch: (fn: () => void) => void

  // ── Graph queries ────────────────────────────────────────────────────────

  /** Get edges connected to a node */
  getConnectedEdges: (nodeId: string) => FlowEdge[]
  /** Get incoming edges for a node */
  getIncomers: (nodeId: string) => FlowNode<TData>[]
  /** Get outgoing edges from a node */
  getOutgoers: (nodeId: string) => FlowNode<TData>[]

  // ── Listeners ────────────────────────────────────────────────────────────

  /** Called when a connection is made */
  onConnect: (callback: (connection: Connection) => void) => () => void
  /** Called when nodes change */
  onNodesChange: (callback: (changes: NodeChange[]) => void) => () => void
  /** Called when a node is clicked */
  onNodeClick: (callback: (node: FlowNode<TData>) => void) => () => void
  /** Called when an edge is clicked */
  onEdgeClick: (callback: (edge: FlowEdge) => void) => () => void
  /** Called when a node starts being dragged */
  onNodeDragStart: (callback: (node: FlowNode<TData>) => void) => () => void
  /** Called when a node stops being dragged */
  onNodeDragEnd: (callback: (node: FlowNode<TData>) => void) => () => void
  /** Called when a node is double-clicked */
  onNodeDoubleClick: (callback: (node: FlowNode<TData>) => void) => () => void
  /** Called with a batch of edge changes (add / remove / select). */
  onEdgesChange: (callback: (changes: EdgeChange[]) => void) => () => void
  /** Called whenever the node or edge selection changes (after the initial state). */
  onSelectionChange: (
    callback: (selection: { nodes: FlowNode<TData>[]; edges: FlowEdge[] }) => void,
  ) => () => void
  /** Called on every viewport write (pan, zoom, animation frame). */
  onViewportChange: (callback: (viewport: Viewport) => void) => () => void
  /** Called with the nodes removed by `deleteSelected()` / `removeNode(s)`. */
  onNodesDelete: (callback: (nodes: FlowNode<TData>[]) => void) => () => void
  /** Called with the edges removed by `deleteSelected()` / `removeEdge(s)` / a node removal. */
  onEdgesDelete: (callback: (edges: FlowEdge[]) => void) => () => void
  /** Called on every drag FRAME with the node's live state (after dragStart, before dragEnd). */
  onNodeDrag: (callback: (node: FlowNode<TData>) => void) => () => void
  /** Called when the user starts drawing a connection from a handle. */
  onConnectStart: (callback: (start: { nodeId: string; handleId: string }) => void) => () => void
  /** Called when a connection drag ends — with the connection made, or `null` when dropped nowhere. */
  onConnectEnd: (callback: (connection: Connection | null) => void) => () => void
  /** Called for a click on the empty canvas (not on a node, edge or panel). */
  onPaneClick: (callback: (event: MouseEvent) => void) => () => void

  // ── Copy / Paste ─────────────────────────────────────────────────────────

  /** Copy selected nodes and their edges to clipboard */
  copySelected: () => void
  /** Paste clipboard contents with offset */
  paste: (offset?: XYPosition) => void

  // ── Undo / Redo ─────────────────────────────────────────────────────────

  /** Save current state to undo history */
  pushHistory: () => void
  /** Undo last change */
  undo: () => void
  /** Redo last undone change */
  redo: () => void

  // ── Multi-node drag ─────────────────────────────────────────────────────

  /** Move all selected nodes by dx/dy */
  moveSelectedNodes: (dx: number, dy: number) => void

  // ── Helper lines ────────────────────────────────────────────────────────

  /** Get snap guide lines for a dragged node */
  getSnapLines: (
    dragNodeId: string,
    position: XYPosition,
    threshold?: number,
  ) => { x: number | null; y: number | null; snappedPosition: XYPosition }
  /**
   * @internal — drag-session snap precompute. Flattens every snap candidate
   * (non-dragged nodes' centers/edges) into primitive arrays ONCE at
   * dragStart so each pointermove's `move()` is a tight numeric scan with no
   * per-node allocations (getSnapLines re-scans + re-allocates per call).
   * `excludeIds` removes the co-dragged nodes of a multi-drag from the
   * candidate set. Returns null when the drag node doesn't exist.
   */
  _createSnapSession: (
    dragNodeId: string,
    excludeIds?: ReadonlySet<string>,
    threshold?: number,
  ) => SnapSession | null

  // ── Sub-flows / Groups ───────────────────────────────────────────────────

  /** Get child nodes of a group node */
  getChildNodes: (parentId: string) => FlowNode<TData>[]
  /** Get absolute position of a node (accounting for parent offsets) */
  getAbsolutePosition: (nodeId: string) => XYPosition
  /** @internal — reactive absolute position per id (parent chain folded in); equality-gated. */
  _absPositionById: (id: string) => Computed<XYPosition>

  // ── Edge reconnecting ──────────────────────────────────────────────────

  // ── Edge waypoints ──────────────────────────────────────────────────────

  /** Add a waypoint (bend point) to an edge */
  addEdgeWaypoint: (edgeId: string, point: XYPosition, index?: number) => void
  /** Remove a waypoint from an edge */
  removeEdgeWaypoint: (edgeId: string, index: number) => void
  /** Update a waypoint position */
  updateEdgeWaypoint: (edgeId: string, index: number, point: XYPosition) => void

  // ── Edge reconnecting ──────────────────────────────────────────────────

  /** Reconnect an edge to a new source/target */
  reconnectEdge: (
    edgeId: string,
    newConnection: {
      source?: string
      target?: string
      sourceHandle?: string
      targetHandle?: string
    },
  ) => void

  // ── Proximity connect ────────────────────────────────────────────────────

  /** Find the nearest unconnected node within threshold distance */
  getProximityConnection: (nodeId: string, threshold?: number) => Connection | null

  // ── Collision detection ─────────────────────────────────────────────────

  /** Get nodes that overlap with the given node */
  getOverlappingNodes: (nodeId: string) => FlowNode<TData>[]
  /** Push overlapping nodes apart */
  resolveCollisions: (nodeId: string, spacing?: number) => void

  // ── Node extent ─────────────────────────────────────────────────────────

  /** Set drag boundaries for all nodes — [[minX, minY], [maxX, maxY]] or null to remove */
  setNodeExtent: (extent: [[number, number], [number, number]] | null) => void
  /** Clamp a position to the current node extent */
  clampToExtent: (position: XYPosition, nodeWidth?: number, nodeHeight?: number) => XYPosition

  // ── Search / Filter ─────────────────────────────────────────────────────

  /** Find nodes matching a predicate */
  findNodes: (predicate: (node: FlowNode<TData>) => boolean) => FlowNode<TData>[]
  /** Find nodes by label text (case-insensitive) */
  searchNodes: (query: string) => FlowNode<TData>[]
  /** Focus viewport on a specific node (pan + optional zoom) */
  focusNode: (nodeId: string, zoom?: number) => void

  // ── Export ─────────────────────────────────────────────────────────────

  /** Export the flow as a JSON-serializable object */
  toJSON: () => { nodes: FlowNode<TData>[]; edges: FlowEdge[]; viewport: Viewport }
  /** Import flow state from a JSON object */
  fromJSON: (data: {
    nodes: FlowNode<TData>[]
    edges: FlowEdge[]
    viewport?: Viewport
  }) => void

  // ── Viewport animation ─────────────────────────────────────────────────

  /** Animate viewport to a new position/zoom */
  animateViewport: (target: Partial<Viewport>, duration?: number) => void

  // ── Internal per-id computeds (used by Flow component) ──────────────────

  /**
   * Per-id node computed (`{ equals: Object.is }`) — notifies a subscriber
   * ONLY when THIS node's object identity changes. Every write path (the drag
   * frame's `nds.map`, `updateNode`, `filter` removals) preserves the identity
   * of untouched nodes, so a single-node drag re-runs only the moved node's
   * thunks instead of all N (a default computed like `nodeMap` notifies
   * UNCONDITIONALLY). Cached per id on the instance; evicted when the id
   * leaves `nodeMap`. Reading it tracks reactively.
   * @internal
   */
  _nodeById: (id: string) => Computed<FlowNode<TData> | undefined>
  /**
   * Per-id edge computed — `_nodeById`'s edge twin (equality-gated on the
   * edge object's identity, evicted when the id leaves `edgeMap`).
   * @internal
   */
  _edgeById: (id: string) => Computed<FlowEdge | undefined>
  /**
   * Per-edge geometry computed — memoizes `computeEdgeGeometry` so the N
   * consuming thunks (path `d`, markers, label, custom-edge accessors) share
   * ONE computation per change instead of re-deriving it each. Depends on the
   * two per-ENDPOINT `_nodeById` computeds (not `nodeMap`), so another node's
   * drag frame does not recompute this edge. `null` while either endpoint (or
   * the edge itself) is missing — e.g. mid-removal.
   * @internal
   */
  _edgeGeometry: (id: string) => Computed<EdgeGeometry | null>

  // ── Internal emitters (used by Flow component) ──────────────────────────

  /**
   * Whether the flow was created with `fitView: true`. The `<Flow>` component
   * re-runs `fitView()` once after the container is first MEASURED — the
   * createFlow-time fit ran against the 800×600 default (the ResizeObserver
   * hasn't measured yet), so in a smaller/shorter container the initial fit
   * lands the nodes off-screen.
   * @internal
   */
  _fitViewConfigured: boolean

  /** @internal */
  _emit: {
    nodeDragStart: (node: FlowNode<TData>) => void
    nodeDragEnd: (node: FlowNode<TData>) => void
    nodeDoubleClick: (node: FlowNode<TData>) => void
    nodeClick: (node: FlowNode<TData>) => void
    edgeClick: (edge: FlowEdge) => void
    nodeDrag: (node: FlowNode<TData>) => void
    connectStart: (start: { nodeId: string; handleId: string }) => void
    connectEnd: (connection: Connection | null) => void
    paneClick: (event: MouseEvent) => void
  }

  // ── Config ───────────────────────────────────────────────────────────────

  /** The flow configuration */
  config: FlowConfig<TData>

  // ── Cleanup ──────────────────────────────────────────────────────────────

  /** Dispose all listeners and clean up */
  dispose: () => void
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export type LayoutAlgorithm =
  | 'layered'
  | 'force'
  | 'stress'
  | 'tree'
  | 'radial'
  | 'box'
  | 'rectpacking'

export interface LayoutOptions {
  /**
   * Layout direction — default: `'DOWN'`.
   *
   * **Applies to**: `layered`, `tree`. Sets the main axis
   * option. The other algorithms (`force`, `stress`, `radial`, `box`,
   * `rectpacking`) compute positions geometrically rather than along
   * a directed flow, so they **silently ignore** this option.
   * Verified by running each algorithm twice with `'DOWN'` vs
   * `'RIGHT'` and checking whether the resulting positions differ.
   */
  direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  /**
   * Spacing between nodes — default: 50. **Applies to all
   * algorithms.** Minimum gap between neighbouring nodes, which is a
   * generic spacing option respected by every algorithm in the suite.
   */
  nodeSpacing?: number
  /**
   * Spacing between layers — default: 80.
   *
   * **Applies to**: `layered` only. Gap between layers —
   * `elk.layered.spacing.nodeNodeBetweenLayers` which is namespaced
   * under the layered algorithm. The other algorithms (including
   * `tree`, which uses its own `elk.mrtree.spacing.nodeNode`) have no
   * concept of "layers between nodes" and silently ignore this option.
   */
  layerSpacing?: number
  /**
   * Edge routing — default: `'orthogonal'`.
   *
   * **Applies to**: `layered` only. Gap between layers — `elk.edgeRouting`,
   * which is consumed by the layered pipeline's edge router. The
   * other algorithms route edges as straight segments regardless of
   * this value.
   */
  edgeRouting?: 'orthogonal' | 'splines' | 'polyline'
  /** Whether to animate the layout transition — default: true */
  animate?: boolean
  /** Animation duration in ms — default: 300 */
  animationDuration?: number
}

// ─── Component props ─────────────────────────────────────────────────────────

export interface FlowProps {
  /**
   * The flow instance. Typed as `FlowInstance<any>` rather than a
   * generic on the prop type because Pyreon JSX components cannot
   * be parameterised at the call site (`<Flow<MyData> />` is not
   * valid JSX). Typed consumers pass their `FlowInstance<MyData>`
   * here without needing to cast.
   */
  instance: FlowInstance<any>
  style?: string
  class?: string
  children?: VNodeChild
  /**
   * Accessible name for the flow canvas. The container is a focusable
   * (`tabindex=0`), keyboard-interactive region, so a screen reader needs a
   * name to announce when it receives focus — without one it's an unlabeled
   * focus stop. Rendered as `aria-label` on the `role="group"` container.
   * Defaults to `"Flow diagram"`; override with something specific like
   * `"Pipeline editor"`.
   */
  ariaLabel?: string
}

export interface BackgroundProps {
  variant?: 'dots' | 'lines' | 'cross'
  gap?: number
  size?: number
  /**
   * Pattern (dot/line) color. Omit to use the themeable
   * `--pyreon-flow-bg-pattern` CSS var (fallback `#ddd`) — set that var to dim
   * the grid on a dark canvas. An explicit value here always wins. Applied via
   * `style` (not the SVG `fill`/`stroke` attribute) so a `var()` resolves and a
   * global `svg { fill }` rule can't override it.
   */
  color?: string
}

export interface MiniMapProps {
  style?: string
  class?: string
  /**
   * `nodeColor` callback receives `FlowNode<any>` for the same reason
   * `FlowProps.instance` is `FlowInstance<any>` — JSX components
   * can't be parameterised at the call site, so the prop type uses
   * `any` for the data shape and consumers narrow inside the
   * callback if needed.
   */
  nodeColor?: string | ((node: FlowNode<any>) => string)
  maskColor?: string
  width?: number
  height?: number
  /** Drag on the minimap pans the viewport — default: true. A click still centers. */
  pannable?: boolean
  /** Wheel on the minimap zooms the viewport — default: true. */
  zoomable?: boolean
}

export interface ControlsProps {
  showZoomIn?: boolean
  showZoomOut?: boolean
  showFitView?: boolean
  showLock?: boolean
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Extra controls appended after the built-in buttons (`<button>`s inherit the control styling). */
  children?: VNodeChild
}

export interface PanelProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  style?: string
  class?: string
  children?: VNodeChild
}

export interface HandleProps {
  type: HandleType
  position: Position
  id?: string
  /**
   * Placement along the handle's side as a percentage `0–100` — default `50`
   * (centered). Give same-side sibling handles distinct offsets so the dots
   * don't overlap; edges anchor at each dot's measured rendered center, so the
   * attachment point moves with the offset.
   */
  offset?: number
  style?: string
  class?: string
}

/**
 * Props passed to custom node components registered via
 * `<Flow nodeTypes={...}>`.
 *
 * **All non-id props are reactive accessors** (`() => T`), NOT plain
 * values. Read them inside reactive scopes (JSX expression thunks,
 * `effect()`, `computed()`) so the node patches in place when the
 * underlying state changes — instead of re-mounting the entire node
 * component on every change.
 *
 * The accessors cover:
 *   • `data()` — the node's current `TData` payload (reflects
 *     `flow.updateNode(id, { data: ... })` mutations)
 *   • `selected()` — whether the node is currently selected
 *   • `dragging()` — whether the node is currently being dragged
 *
 * `id` is a plain string because it never changes for a given node
 * (it's the keyed identity). Anything else that can change at
 * runtime is exposed as an accessor.
 *
 * **Why accessors and not plain values**: Pyreon components run
 * **once** at mount. If these were plain props, the parent renderer
 * would have to re-create every node component on every change to
 * the underlying signal — O(N) work per mutation in an N-node graph.
 * With accessors, each node mounts exactly once across the lifetime
 * of the graph, regardless of how many selection clicks, drags, or
 * data updates happen.
 *
 * @example
 * ```tsx
 * function CustomNode(props: NodeComponentProps<{ label: string }>) {
 *   return (
 *     <div
 *       class={() => (props.selected() ? 'selected' : '')}
 *       style={() => `cursor: ${props.dragging() ? 'grabbing' : 'grab'}`}
 *     >
 *       {() => props.data().label}
 *     </div>
 *   )
 * }
 * ```
 */
export type NodeComponentProps<TData = Record<string, unknown>> = {
  /** Stable node identity — never changes for a given node */
  id: string
  /** Reactive accessor — reflects flow.updateNode(id, { data: ... }) mutations */
  data: () => TData
  /** Reactive accessor — read inside reactive scopes for live updates */
  selected: () => boolean
  /** Reactive accessor — read inside reactive scopes for live updates */
  dragging: () => boolean
}
