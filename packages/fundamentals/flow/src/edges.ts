import type {
  Dimensions,
  EdgeMarker,
  EdgeMarkerSpec,
  EdgePathOptions,
  EdgePathResult,
  FlowEdge,
  FlowNode,
  HandleConfig,
  HandleType,
  MeasuredHandle,
  NodeMeasurement,
  XYPosition,
} from './types'
import { MarkerType, Position } from './types'

// ─── Edge markers ──────────────────────────────────────────────────────────
//
// React Flow parity: per-edge configurable arrowheads, deduplicated into one
// `<defs>` block. These helpers are pure + exported so they can be unit-tested
// without mounting a flow.

// Default marker colour = the SAME themeable var the edge stroke uses, so an
// unstyled arrowhead matches its line (a natural line→arrow→box connection)
// and re-themes with it. `MarkerGlyph` sets it via `style` (a `var()` is invalid
// in an SVG presentation attribute); `markerId` sanitizes it to a stable dedup
// token distinct from an explicit `#999`, so the two never collapse to one def.
const DEFAULT_MARKER_COLOR = 'var(--pyreon-flow-edge, #999)'
const DEFAULT_MARKER_W = 10
const DEFAULT_MARKER_H = 7
const DEFAULT_MARKER_STROKE = 1

/** The historical built-in arrowhead — the default when no marker is specified. */
export const DEFAULT_MARKER_END: EdgeMarker = { type: MarkerType.ArrowClosed }

/** Normalize a marker spec (bare `MarkerType`, full object, or null) to a
 *  fully-resolved {@link EdgeMarker} with defaults applied, or `null` for none. */
export function resolveMarker(spec: EdgeMarkerSpec | null | undefined): EdgeMarker | null {
  if (spec == null) return null
  const m = typeof spec === 'string' ? { type: spec } : spec
  return {
    type: m.type,
    color: m.color ?? DEFAULT_MARKER_COLOR,
    width: m.width ?? DEFAULT_MARKER_W,
    height: m.height ?? DEFAULT_MARKER_H,
    strokeWidth: m.strokeWidth ?? DEFAULT_MARKER_STROKE,
  }
}

/** Deterministic, DOM-id-safe key for a resolved marker — identical configs
 *  collapse to one `<marker>` def. Color is sanitized to `[a-z0-9]`. */
export function markerId(m: EdgeMarker): string {
  const color = (m.color ?? DEFAULT_MARKER_COLOR).toLowerCase().replace(/[^a-z0-9]/g, '')
  return `pyreon-flow-marker-${m.type}-${color}-${m.width}x${m.height}-${m.strokeWidth}`
}

/** Resolve an edge's start/end markers, applying the flow-level default end. */
export function resolveEdgeMarkers(
  edge: FlowEdge,
  defaultMarkerEnd: EdgeMarkerSpec | null | undefined,
): { start: EdgeMarker | null, end: EdgeMarker | null } {
  // `markerEnd` absent → flow default; `markerEnd: null` → explicitly none.
  const endSpec = 'markerEnd' in edge ? edge.markerEnd : defaultMarkerEnd
  return { start: resolveMarker(edge.markerStart), end: resolveMarker(endSpec) }
}

/** Collect every distinct marker across all edges into an id→marker map, so the
 *  `<defs>` block renders each unique config exactly once. */
export function collectEdgeMarkers(
  edges: readonly FlowEdge[],
  defaultMarkerEnd: EdgeMarkerSpec | null | undefined,
): Map<string, EdgeMarker> {
  const out = new Map<string, EdgeMarker>()
  for (const edge of edges) {
    const { start, end } = resolveEdgeMarkers(edge, defaultMarkerEnd)
    if (start) out.set(markerId(start), start)
    if (end) out.set(markerId(end), end)
  }
  return out
}

// ─── Effective node dimensions ─────────────────────────────────────────────

/** Default node box used before a node is measured (or under SSR). */
export const DEFAULT_NODE_WIDTH = 150
/** Default node box used before a node is measured (or under SSR). */
export const DEFAULT_NODE_HEIGHT = 40

/**
 * A node's effective dimensions — the ONE precedence rule every geometry
 * consumer (edge anchoring, auto-layout, fitView, snap lines, minimap,
 * viewport culling) shares: explicit `node.width`/`node.height` (a deliberate
 * consumer override, e.g. from `<NodeResizer>`) → measured DOM size →
 * the 150×40 default (pre-measurement first frame / SSR).
 */
export function getEffectiveDimensions(
  node: FlowNode<any>,
  measurement?: NodeMeasurement | undefined,
): Dimensions {
  return {
    width: node.width ?? measurement?.width ?? DEFAULT_NODE_WIDTH,
    height: node.height ?? measurement?.height ?? DEFAULT_NODE_HEIGHT,
  }
}

// ─── Handle-anchor resolution ──────────────────────────────────────────────

/**
 * Resolve the exact point an edge attaches to on `node`, honoring handles.
 *
 * Priority:
 *  1. `handleId` + a MEASURED `<Handle>` dot with that id → the dot's real
 *     rendered center (pixel-exact, wherever the consumer's CSS placed it).
 *  2. `handleId` + a CONFIG handle (`node.sourceHandles`/`targetHandles`) with
 *     that id → that side's midpoint.
 *  3. No `handleId` → the FIRST measured dot of the right type, else the first
 *     config handle's side midpoint (matches React Flow's "first handle" rule).
 *  4. No handles at all → `null` — the caller falls back to floating/smart
 *     endpoints.
 *
 * Returns flow-space coordinates plus the handle's declared side (drives the
 * path's departure/approach tangent).
 */
export function resolveHandleAnchor(
  node: FlowNode<any>,
  handleId: string | undefined,
  type: HandleType,
  dims: Dimensions,
  measurement?: NodeMeasurement | undefined,
): { x: number; y: number; position: Position } | null {
  const measuredOfType = measurement?.handles?.filter((h) => h.type === type)
  const config = type === 'source' ? node.sourceHandles : node.targetHandles

  const anchorFromMeasured = (h: MeasuredHandle) => ({
    x: node.position.x + h.x,
    y: node.position.y + h.y,
    position: h.position,
  })
  const anchorFromConfig = (h: HandleConfig) => ({
    ...getHandlePosition(h.position, node.position.x, node.position.y, dims.width, dims.height),
    position: h.position,
  })

  if (handleId) {
    const measured = measuredOfType?.find((h) => h.id === handleId)
    if (measured) return anchorFromMeasured(measured)
    const configured = config?.find((h) => h.id === handleId)
    if (configured) return anchorFromConfig(configured)
    // Unknown id — fall through to the first-handle rule below so the edge
    // still renders somewhere sensible (the caller dev-warns).
  }

  if (measuredOfType?.length) return anchorFromMeasured(measuredOfType[0]!)
  if (config?.length) return anchorFromConfig(config[0]!)
  return null
}

/**
 * Auto-detect the best handle position based on relative node positions.
 * If the node has configured handles, uses those. Otherwise picks the
 * closest edge (top/right/bottom/left) based on direction to the other node.
 *
 * `dims` supplies the effective (measured-or-explicit) node sizes so the
 * center-to-center direction is computed against the REAL rendered node box;
 * omitted → falls back to `node.width`/`node.height` (then the 150×40 default).
 */
export function getSmartHandlePositions(
  sourceNode: FlowNode,
  targetNode: FlowNode,
  dims?: { sourceW: number; sourceH: number; targetW: number; targetH: number },
): { sourcePosition: Position; targetPosition: Position } {
  const sw = dims?.sourceW ?? sourceNode.width ?? 150
  const sh = dims?.sourceH ?? sourceNode.height ?? 40
  const tw = dims?.targetW ?? targetNode.width ?? 150
  const th = dims?.targetH ?? targetNode.height ?? 40

  const dx = targetNode.position.x + tw / 2 - (sourceNode.position.x + sw / 2)
  const dy = targetNode.position.y + th / 2 - (sourceNode.position.y + sh / 2)

  const sourceHandle = sourceNode.sourceHandles?.[0]
  const targetHandle = targetNode.targetHandles?.[0]

  const sourcePosition = sourceHandle
    ? sourceHandle.position
    : Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? Position.Right
        : Position.Left
      : dy > 0
        ? Position.Bottom
        : Position.Top

  const targetPosition = targetHandle
    ? targetHandle.position
    : Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? Position.Left
        : Position.Right
      : dy > 0
        ? Position.Top
        : Position.Bottom

  return { sourcePosition, targetPosition }
}

/**
 * Get the center point between source and target positions.
 */
function getCenter(source: XYPosition, target: XYPosition): XYPosition {
  return {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2,
  }
}

/**
 * Get the handle position offset for a given position (top/right/bottom/left).
 */
export function getHandlePosition(
  position: Position,
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  _handleId?: string,
): XYPosition {
  switch (position) {
    case Position.Top:
      return { x: nodeX + nodeWidth / 2, y: nodeY }
    case Position.Right:
      return { x: nodeX + nodeWidth, y: nodeY + nodeHeight / 2 }
    case Position.Bottom:
      return { x: nodeX + nodeWidth / 2, y: nodeY + nodeHeight }
    case Position.Left:
      return { x: nodeX, y: nodeY + nodeHeight / 2 }
  }
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The point where the ray from `box`'s center toward `toward` exits the box
 * perimeter — the "floating" connection point that faces the other node, so an
 * edge enters/leaves at the natural angle instead of a fixed side midpoint.
 */
export function getNodeIntersection(box: Box, toward: XYPosition): XYPosition {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  // Scale the direction so it lands on whichever side (x or y) it reaches first.
  const scaleX = dx !== 0 ? box.width / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY
  const scaleY = dy !== 0 ? box.height / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY
  const scale = Math.min(scaleX, scaleY)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

/** Which side of `box` a perimeter `point` sits on — drives the bezier tangent. */
function sideOfPoint(box: Box, point: XYPosition): Position {
  const eps = 1
  if (Math.abs(point.x - box.x) <= eps) return Position.Left
  if (Math.abs(point.x - (box.x + box.width)) <= eps) return Position.Right
  if (Math.abs(point.y - box.y) <= eps) return Position.Top
  return Position.Bottom
}

/**
 * Floating endpoints — connect each node where the center-to-center line crosses
 * its perimeter, paired with the closest side for the bezier tangent. This makes
 * an auto-routed edge approach the box at the natural angle (React Flow's
 * floating-edge model) instead of always docking at a fixed side's midpoint.
 * The caller only uses this when neither node declares explicit handles.
 */
export function getFloatingEndpoints(
  sourceNode: FlowNode,
  targetNode: FlowNode,
  dims: { sourceW: number; sourceH: number; targetW: number; targetH: number },
): {
  source: { x: number; y: number; position: Position }
  target: { x: number; y: number; position: Position }
} {
  const sBox: Box = {
    x: sourceNode.position.x,
    y: sourceNode.position.y,
    width: dims.sourceW,
    height: dims.sourceH,
  }
  const tBox: Box = {
    x: targetNode.position.x,
    y: targetNode.position.y,
    width: dims.targetW,
    height: dims.targetH,
  }
  const sCenter = { x: sBox.x + sBox.width / 2, y: sBox.y + sBox.height / 2 }
  const tCenter = { x: tBox.x + tBox.width / 2, y: tBox.y + tBox.height / 2 }
  const sPoint = getNodeIntersection(sBox, tCenter)
  const tPoint = getNodeIntersection(tBox, sCenter)
  return {
    source: { x: sPoint.x, y: sPoint.y, position: sideOfPoint(sBox, sPoint) },
    target: { x: tPoint.x, y: tPoint.y, position: sideOfPoint(tBox, tPoint) },
  }
}

/**
 * Calculate a cubic bezier edge path between two points.
 *
 * @example
 * ```ts
 * const { path, labelX, labelY } = getBezierPath({
 *   sourceX: 0, sourceY: 0, sourcePosition: Position.Right,
 *   targetX: 200, targetY: 100, targetPosition: Position.Left,
 * })
 * // path = "M0,0 C100,0 100,100 200,100"
 * ```
 */
export function getBezierPath(params: {
  sourceX: number
  sourceY: number
  sourcePosition?: Position
  targetX: number
  targetY: number
  targetPosition?: Position
  curvature?: number
}): EdgePathResult {
  const {
    sourceX,
    sourceY,
    sourcePosition = Position.Bottom,
    targetX,
    targetY,
    targetPosition = Position.Top,
    curvature = 0.25,
  } = params

  const distX = Math.abs(targetX - sourceX)
  const distY = Math.abs(targetY - sourceY)
  const dist = Math.sqrt(distX * distX + distY * distY)
  const offset = dist * curvature

  let sourceControlX = sourceX
  let sourceControlY = sourceY
  let targetControlX = targetX
  let targetControlY = targetY

  switch (sourcePosition) {
    case Position.Top:
      sourceControlY = sourceY - offset
      break
    case Position.Bottom:
      sourceControlY = sourceY + offset
      break
    case Position.Left:
      sourceControlX = sourceX - offset
      break
    case Position.Right:
      sourceControlX = sourceX + offset
      break
  }

  switch (targetPosition) {
    case Position.Top:
      targetControlY = targetY - offset
      break
    case Position.Bottom:
      targetControlY = targetY + offset
      break
    case Position.Left:
      targetControlX = targetX - offset
      break
    case Position.Right:
      targetControlX = targetX + offset
      break
  }

  const center = getCenter({ x: sourceX, y: sourceY }, { x: targetX, y: targetY })

  return {
    path: `M${sourceX},${sourceY} C${sourceControlX},${sourceControlY} ${targetControlX},${targetControlY} ${targetX},${targetY}`,
    labelX: center.x,
    labelY: center.y,
  }
}

/**
 * Calculate a smoothstep edge path — horizontal/vertical segments with rounded corners.
 */
export function getSmoothStepPath(params: {
  sourceX: number
  sourceY: number
  sourcePosition?: Position
  targetX: number
  targetY: number
  targetPosition?: Position
  borderRadius?: number
  offset?: number
}): EdgePathResult {
  const {
    sourceX,
    sourceY,
    sourcePosition = Position.Bottom,
    targetX,
    targetY,
    targetPosition = Position.Top,
    borderRadius = 5,
    offset = 20,
  } = params

  const isHorizontalSource = sourcePosition === Position.Left || sourcePosition === Position.Right
  const isHorizontalTarget = targetPosition === Position.Left || targetPosition === Position.Right

  // Calculate offset points
  const sourceOffsetX =
    sourcePosition === Position.Right ? offset : sourcePosition === Position.Left ? -offset : 0
  const sourceOffsetY =
    sourcePosition === Position.Bottom ? offset : sourcePosition === Position.Top ? -offset : 0
  const targetOffsetX =
    targetPosition === Position.Right ? offset : targetPosition === Position.Left ? -offset : 0
  const targetOffsetY =
    targetPosition === Position.Bottom ? offset : targetPosition === Position.Top ? -offset : 0

  const sX = sourceX + sourceOffsetX
  const sY = sourceY + sourceOffsetY
  const tX = targetX + targetOffsetX
  const tY = targetY + targetOffsetY

  const center = getCenter({ x: sourceX, y: sourceY }, { x: targetX, y: targetY })

  // Simple smoothstep: source → midpoint → target with rounded corners
  const midX = (sX + tX) / 2
  const midY = (sY + tY) / 2
  const r = borderRadius

  let path: string

  if (isHorizontalSource && !isHorizontalTarget) {
    // Horizontal source → vertical target
    const cornerY = tY
    path = `M${sourceX},${sourceY} L${sX},${sY} L${sX},${cornerY > sY ? cornerY - r : cornerY + r} Q${sX},${cornerY} ${sX + (tX > sX ? r : -r)},${cornerY} L${tX},${cornerY} L${targetX},${targetY}`
  } else if (!isHorizontalSource && isHorizontalTarget) {
    // Vertical source → horizontal target
    const cornerX = tX
    path = `M${sourceX},${sourceY} L${sX},${sY} L${cornerX > sX ? cornerX - r : cornerX + r},${sY} Q${cornerX},${sY} ${cornerX},${sY + (tY > sY ? r : -r)} L${cornerX},${tY} L${targetX},${targetY}`
  } else if (isHorizontalSource && isHorizontalTarget) {
    // Both horizontal — go through middle Y
    path = `M${sourceX},${sourceY} L${sX},${sourceY} L${midX},${sourceY} Q${midX},${sourceY} ${midX},${midY} L${midX},${targetY} L${tX},${targetY} L${targetX},${targetY}`
  } else {
    // Both vertical — go through middle X
    path = `M${sourceX},${sourceY} L${sourceX},${sY} L${sourceX},${midY} Q${sourceX},${midY} ${midX},${midY} L${targetX},${midY} L${targetX},${tY} L${targetX},${targetY}`
  }

  return { path, labelX: center.x, labelY: center.y }
}

/**
 * Calculate a straight edge path — direct line between two points.
 */
export function getStraightPath(params: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}): EdgePathResult {
  const { sourceX, sourceY, targetX, targetY } = params
  const center = getCenter({ x: sourceX, y: sourceY }, { x: targetX, y: targetY })

  return {
    path: `M${sourceX},${sourceY} L${targetX},${targetY}`,
    labelX: center.x,
    labelY: center.y,
  }
}

/**
 * Calculate a step edge path — right-angle segments with no rounding.
 */
export function getStepPath(params: {
  sourceX: number
  sourceY: number
  sourcePosition?: Position
  targetX: number
  targetY: number
  targetPosition?: Position
  /** Straight run-out from each endpoint before the first turn — default 20 */
  offset?: number
}): EdgePathResult {
  return getSmoothStepPath({ ...params, borderRadius: 0 })
}

/**
 * Calculate an edge path that passes through waypoints.
 * Uses line segments with optional smoothing.
 */
export function getWaypointPath(params: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  waypoints: XYPosition[]
}): EdgePathResult {
  const { sourceX, sourceY, targetX, targetY, waypoints } = params

  if (waypoints.length === 0) {
    return getStraightPath({ sourceX, sourceY, targetX, targetY })
  }

  const allPoints = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }]

  const segments = allPoints.map((p) => `${p.x},${p.y}`)
  const path = `M${segments.join(' L')}`

  // Label at the middle waypoint
  const midIdx = Math.floor(waypoints.length / 2)
  /* v8 ignore next — `?? {midpoint}` fallback: path builders always produce a
     non-empty waypoints array, so waypoints[midIdx] is defined. Defensive. */
  const midPoint = waypoints[midIdx] ?? {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  }

  return { path, labelX: midPoint.x, labelY: midPoint.y }
}

/**
 * Get the edge path for a given edge type.
 */
export function getEdgePath(
  type: string,
  sourceX: number,
  sourceY: number,
  sourcePosition: Position,
  targetX: number,
  targetY: number,
  targetPosition: Position,
  options?: EdgePathOptions,
): EdgePathResult {
  switch (type) {
    case 'smoothstep':
      return getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        ...(options?.borderRadius !== undefined ? { borderRadius: options.borderRadius } : {}),
        ...(options?.offset !== undefined ? { offset: options.offset } : {}),
      })
    case 'straight':
      return getStraightPath({ sourceX, sourceY, targetX, targetY })
    case 'step':
      return getStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        ...(options?.offset !== undefined ? { offset: options.offset } : {}),
      })
    default:
      return getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        ...(options?.curvature !== undefined ? { curvature: options.curvature } : {}),
      })
  }
}
