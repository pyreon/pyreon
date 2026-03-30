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
  /** Custom class name */
  class?: string
  /** Custom style */
  style?: string
  /** Source handles */
  sourceHandles?: HandleConfig[]
  /** Target handles */
  targetHandles?: HandleConfig[]
  /** Parent node id for grouping */
  parentId?: string
  /** Whether this node is a group */
  group?: boolean
}

// ─── Edge ────────────────────────────────────────────────────────────────────

export type EdgeType = 'bezier' | 'smoothstep' | 'straight' | 'step'

export interface FlowEdge {
  id?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type?: EdgeType
  label?: string
  animated?: boolean
  class?: string
  style?: string
  /** Custom data attached to the edge */
  data?: Record<string, unknown>
  /** Waypoints — intermediate points the edge passes through */
  waypoints?: XYPosition[]
}

// ─── Connection ──────────────────────────────────────────────────────────────

export interface Connection {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export type ConnectionRule = Record<string, { outputs: string[] }>

// ─── Node Change Events ──────────────────────────────────────────────────────

export type NodeChange =
  | { type: 'position'; id: string; position: XYPosition }
  | { type: 'dimensions'; id: string; dimensions: Dimensions }
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'remove'; id: string }

// ─── Edge path result ────────────────────────────────────────────────────────

export interface EdgePathResult {
  path: string
  labelX: number
  labelY: number
}

// ─── Flow config ─────────────────────────────────────────────────────────────

export interface FlowConfig {
  nodes?: FlowNode[]
  edges?: FlowEdge[]
  /** Default edge type */
  defaultEdgeType?: EdgeType
  /** Min zoom level — default: 0.1 */
  minZoom?: number
  /** Max zoom level — default: 4 */
  maxZoom?: number
  /** Snap to grid */
  snapToGrid?: boolean
  /** Grid size for snapping — default: 15 */
  snapGrid?: number
  /** Connection rules — which node types can connect */
  connectionRules?: ConnectionRule
  /** Whether nodes are draggable by default — default: true */
  nodesDraggable?: boolean
  /** Whether nodes are connectable by default — default: true */
  nodesConnectable?: boolean
  /** Whether nodes are selectable by default — default: true */
  nodesSelectable?: boolean
  /** Whether to allow multi-selection — default: true */
  multiSelect?: boolean
  /** Drag boundaries for nodes — [[minX, minY], [maxX, maxY]] */
  nodeExtent?: [[number, number], [number, number]]
  /** Whether panning is enabled — default: true */
  pannable?: boolean
  /** Whether zooming is enabled — default: true */
  zoomable?: boolean
  /** Fit view on initial render — default: false */
  fitView?: boolean
  /** Padding for fitView — default: 0.1 */
  fitViewPadding?: number
}

// ─── Flow instance ───────────────────────────────────────────────────────────

export interface FlowInstance {
  // ── State (signals) ──────────────────────────────────────────────────────

  /** All nodes — reactive */
  nodes: Signal<FlowNode[]>
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
  /** Container dimensions — updated by the Flow component via ResizeObserver */
  containerSize: Signal<{ width: number; height: number }>

  // ── Node operations ──────────────────────────────────────────────────────

  /** Get a single node by id */
  getNode: (id: string) => FlowNode | undefined
  /** Add a node */
  addNode: (node: FlowNode) => void
  /** Remove a node and its connected edges */
  removeNode: (id: string) => void
  /** Update a node's properties */
  updateNode: (id: string, update: Partial<FlowNode>) => void
  /** Update a node's position */
  updateNodePosition: (id: string, position: XYPosition) => void

  // ── Edge operations ──────────────────────────────────────────────────────

  /** Get a single edge by id */
  getEdge: (id: string) => FlowEdge | undefined
  /** Add an edge */
  addEdge: (edge: FlowEdge) => void
  /** Remove an edge */
  removeEdge: (id: string) => void
  /** Check if a connection is valid (based on rules) */
  isValidConnection: (connection: Connection) => boolean

  // ── Selection ────────────────────────────────────────────────────────────

  /** Select a node */
  selectNode: (id: string, additive?: boolean) => void
  /** Deselect a node */
  deselectNode: (id: string) => void
  /** Select an edge */
  selectEdge: (id: string, additive?: boolean) => void
  /** Clear all selection */
  clearSelection: () => void
  /** Select all nodes */
  selectAll: () => void
  /** Delete selected nodes/edges */
  deleteSelected: () => void

  // ── Viewport ─────────────────────────────────────────────────────────────

  /** Fit view to show all nodes */
  fitView: (nodeIds?: string[], padding?: number) => void
  /** Set zoom level */
  zoomTo: (zoom: number) => void
  /** Zoom in */
  zoomIn: () => void
  /** Zoom out */
  zoomOut: () => void
  /** Pan to position */
  panTo: (position: XYPosition) => void
  /** Check if a node is visible in the current viewport */
  isNodeVisible: (id: string) => boolean

  // ── Layout ───────────────────────────────────────────────────────────────

  /** Apply auto-layout using elkjs */
  layout: (algorithm?: LayoutAlgorithm, options?: LayoutOptions) => Promise<void>

  // ── Batch ────────────────────────────────────────────────────────────────

  /** Batch multiple operations */
  batch: (fn: () => void) => void

  // ── Graph queries ────────────────────────────────────────────────────────

  /** Get edges connected to a node */
  getConnectedEdges: (nodeId: string) => FlowEdge[]
  /** Get incoming edges for a node */
  getIncomers: (nodeId: string) => FlowNode[]
  /** Get outgoing edges from a node */
  getOutgoers: (nodeId: string) => FlowNode[]

  // ── Listeners ────────────────────────────────────────────────────────────

  /** Called when a connection is made */
  onConnect: (callback: (connection: Connection) => void) => () => void
  /** Called when nodes change */
  onNodesChange: (callback: (changes: NodeChange[]) => void) => () => void
  /** Called when a node is clicked */
  onNodeClick: (callback: (node: FlowNode) => void) => () => void
  /** Called when an edge is clicked */
  onEdgeClick: (callback: (edge: FlowEdge) => void) => () => void
  /** Called when a node starts being dragged */
  onNodeDragStart: (callback: (node: FlowNode) => void) => () => void
  /** Called when a node stops being dragged */
  onNodeDragEnd: (callback: (node: FlowNode) => void) => () => void
  /** Called when a node is double-clicked */
  onNodeDoubleClick: (callback: (node: FlowNode) => void) => () => void

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

  // ── Sub-flows / Groups ───────────────────────────────────────────────────

  /** Get child nodes of a group node */
  getChildNodes: (parentId: string) => FlowNode[]
  /** Get absolute position of a node (accounting for parent offsets) */
  getAbsolutePosition: (nodeId: string) => XYPosition

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
  getOverlappingNodes: (nodeId: string) => FlowNode[]
  /** Push overlapping nodes apart */
  resolveCollisions: (nodeId: string, spacing?: number) => void

  // ── Node extent ─────────────────────────────────────────────────────────

  /** Set drag boundaries for all nodes — [[minX, minY], [maxX, maxY]] or null to remove */
  setNodeExtent: (extent: [[number, number], [number, number]] | null) => void
  /** Clamp a position to the current node extent */
  clampToExtent: (position: XYPosition, nodeWidth?: number, nodeHeight?: number) => XYPosition

  // ── Search / Filter ─────────────────────────────────────────────────────

  /** Find nodes matching a predicate */
  findNodes: (predicate: (node: FlowNode) => boolean) => FlowNode[]
  /** Find nodes by label text (case-insensitive) */
  searchNodes: (query: string) => FlowNode[]
  /** Focus viewport on a specific node (pan + optional zoom) */
  focusNode: (nodeId: string, zoom?: number) => void

  // ── Export ─────────────────────────────────────────────────────────────

  /** Export the flow as a JSON-serializable object */
  toJSON: () => { nodes: FlowNode[]; edges: FlowEdge[]; viewport: Viewport }
  /** Import flow state from a JSON object */
  fromJSON: (data: { nodes: FlowNode[]; edges: FlowEdge[]; viewport?: Viewport }) => void

  // ── Viewport animation ─────────────────────────────────────────────────

  /** Animate viewport to a new position/zoom */
  animateViewport: (target: Partial<Viewport>, duration?: number) => void

  // ── Internal emitters (used by Flow component) ──────────────────────────

  /** @internal */
  _emit: {
    nodeDragStart: (node: FlowNode) => void
    nodeDragEnd: (node: FlowNode) => void
    nodeDoubleClick: (node: FlowNode) => void
    nodeClick: (node: FlowNode) => void
    edgeClick: (edge: FlowEdge) => void
  }

  // ── Config ───────────────────────────────────────────────────────────────

  /** The flow configuration */
  config: FlowConfig

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
  /** Layout direction — default: 'DOWN' */
  direction?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  /** Spacing between nodes — default: 50 */
  nodeSpacing?: number
  /** Spacing between layers — default: 80 */
  layerSpacing?: number
  /** Edge routing — default: 'orthogonal' */
  edgeRouting?: 'orthogonal' | 'splines' | 'polyline'
  /** Whether to animate the layout transition — default: true */
  animate?: boolean
  /** Animation duration in ms — default: 300 */
  animationDuration?: number
}

// ─── Component props ─────────────────────────────────────────────────────────

export interface FlowProps {
  instance: FlowInstance
  style?: string
  class?: string
  children?: VNodeChild
}

export interface BackgroundProps {
  variant?: 'dots' | 'lines' | 'cross'
  gap?: number
  size?: number
  color?: string
}

export interface MiniMapProps {
  style?: string
  class?: string
  nodeColor?: string | ((node: FlowNode) => string)
  maskColor?: string
  width?: number
  height?: number
}

export interface ControlsProps {
  showZoomIn?: boolean
  showZoomOut?: boolean
  showFitView?: boolean
  showLock?: boolean
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
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
  style?: string
  class?: string
}

export type NodeComponentProps<TData = Record<string, unknown>> = {
  id: string
  data: TData
  selected: boolean
  dragging: boolean
}
