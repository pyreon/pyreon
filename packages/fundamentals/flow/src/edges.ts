import type {
  Dimensions,
  EdgePathOptions,
  EdgePathResult,
  EdgeSegment,
  FlowNode,
  HandleConfig,
  HandleType,
  MeasuredHandle,
  NodeMeasurement,
  XYPosition,
} from './types'
import { Position } from './types'

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
 * The point an edge attaches to on a node, plus the handle's declared side
 * (which drives the path's departure/approach tangent).
 *
 * Named rather than inline because this file is compiled to Swift and Kotlin:
 * PMTC resolves a named object shape declared in the same file and synthesizes
 * a struct for it, where an anonymous return type has no name to emit.
 */
export interface HandleAnchor {
  x: number
  y: number
  position: Position
}

/**
 * Anchor at a MEASURED handle dot's real rendered center.
 *
 * Lifted out of `resolveHandleAnchor` — it was an inner arrow closing over
 * `node`. That reads well and does not cross: PMTC lowers an arrow returning an
 * object literal to a tuple, which is not valid Kotlin, and it does so WITHOUT
 * a warning. A top-level function taking what it needs is the same code with a
 * shape both compilers can represent.
 */
function anchorFromMeasuredHandle(node: FlowNode<any>, h: MeasuredHandle): HandleAnchor {
  return {
    x: node.position.x + h.x,
    y: node.position.y + h.y,
    position: h.position,
  }
}

/**
 * Anchor at a CONFIG handle's side midpoint.
 *
 * The spread this replaces (`...getHandlePosition(…)`) was dropped SILENTLY by
 * the native emit, so the Kotlin geometry would have returned an anchor with no
 * coordinates at all. Naming the fields is what makes the crossing honest.
 */
function anchorFromConfigHandle(
  node: FlowNode<any>,
  h: HandleConfig,
  dims: Dimensions,
): HandleAnchor {
  const point = getHandlePosition(
    h.position,
    node.position.x,
    node.position.y,
    dims.width,
    dims.height,
  )
  return { x: point.x, y: point.y, position: h.position }
}

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
): HandleAnchor | null {
  const measuredOfType = measurement?.handles?.filter((h) => h.type === type) ?? []
  const config = (type === 'source' ? node.sourceHandles : node.targetHandles) ?? []

  if (handleId !== undefined) {
    const measured = measuredOfType.find((h) => h.id === handleId)
    if (measured !== undefined) return anchorFromMeasuredHandle(node, measured)
    const configured = config.find((h) => h.id === handleId)
    if (configured !== undefined) return anchorFromConfigHandle(node, configured, dims)
    // Unknown id — fall through to the first-handle rule below so the edge
    // still renders somewhere sensible (the caller dev-warns).
  }

  if (measuredOfType.length > 0) return anchorFromMeasuredHandle(node, measuredOfType[0]!)
  if (config.length > 0) return anchorFromConfigHandle(node, config[0]!, dims)
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
  // One assignment + one return, rather than a return per case: PMTC lowers a
  // function whose value leaves through a single `return`.
  let x = nodeX
  let y = nodeY + nodeHeight / 2
  if (position === Position.Top) {
    x = nodeX + nodeWidth / 2
    y = nodeY
  } else if (position === Position.Right) {
    x = nodeX + nodeWidth
    y = nodeY + nodeHeight / 2
  } else if (position === Position.Bottom) {
    x = nodeX + nodeWidth / 2
    y = nodeY + nodeHeight
  }
  return { x, y }
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
export interface BezierPathParams {
  sourceX: number
  sourceY: number
  sourcePosition?: Position
  targetX: number
  targetY: number
  targetPosition?: Position
  curvature?: number
}

export function getBezierPath(params: BezierPathParams): EdgePathResult {
  // Explicit reads, not a defaulted destructure: PMTC lowers a flat field read
  // plus `??` but not nested / defaulted destructuring, and this file is the
  // SOURCE the native geometry engine is generated from (see
  // packages/native/compiler/scripts/gen-flow-geometry.ts). Same values.
  const sourceX = params.sourceX
  const sourceY = params.sourceY
  const sourcePosition = params.sourcePosition ?? Position.Bottom
  const targetX = params.targetX
  const targetY = params.targetY
  const targetPosition = params.targetPosition ?? Position.Top
  const curvature = params.curvature ?? 0.25

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
    segments: [
      { kind: 'move', x: sourceX, y: sourceY },
      {
        kind: 'cubic',
        x: targetX,
        y: targetY,
        c1x: sourceControlX,
        c1y: sourceControlY,
        c2x: targetControlX,
        c2y: targetControlY,
      },
    ],
  }
}

/**
 * Calculate a smoothstep edge path — horizontal/vertical segments with rounded corners.
 */
export interface SmoothStepPathParams {
  sourceX: number
  sourceY: number
  sourcePosition?: Position
  targetX: number
  targetY: number
  targetPosition?: Position
  borderRadius?: number
  offset?: number
}

export function getSmoothStepPath(params: SmoothStepPathParams): EdgePathResult {
  const sourceX = params.sourceX
  const sourceY = params.sourceY
  const sourcePosition = params.sourcePosition ?? Position.Bottom
  const targetX = params.targetX
  const targetY = params.targetY
  const targetPosition = params.targetPosition ?? Position.Top
  const borderRadius = params.borderRadius ?? 5
  const offset = params.offset ?? 20

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
  let segments: EdgeSegment[]

  if (isHorizontalSource && !isHorizontalTarget) {
    // Horizontal source → vertical target
    const cornerY = tY
    const cornerRunY = cornerY > sY ? cornerY - r : cornerY + r
    const cornerOutX = sX + (tX > sX ? r : -r)
    path = `M${sourceX},${sourceY} L${sX},${sY} L${sX},${cornerRunY} Q${sX},${cornerY} ${cornerOutX},${cornerY} L${tX},${cornerY} L${targetX},${targetY}`
    segments = [
      { kind: 'move', x: sourceX, y: sourceY },
      { kind: 'line', x: sX, y: sY },
      { kind: 'line', x: sX, y: cornerRunY },
      { kind: 'quad', x: cornerOutX, y: cornerY, cx: sX, cy: cornerY },
      { kind: 'line', x: tX, y: cornerY },
      { kind: 'line', x: targetX, y: targetY },
    ]
  } else if (!isHorizontalSource && isHorizontalTarget) {
    // Vertical source → horizontal target
    const cornerX = tX
    const cornerRunX = cornerX > sX ? cornerX - r : cornerX + r
    const cornerOutY = sY + (tY > sY ? r : -r)
    path = `M${sourceX},${sourceY} L${sX},${sY} L${cornerRunX},${sY} Q${cornerX},${sY} ${cornerX},${cornerOutY} L${cornerX},${tY} L${targetX},${targetY}`
    segments = [
      { kind: 'move', x: sourceX, y: sourceY },
      { kind: 'line', x: sX, y: sY },
      { kind: 'line', x: cornerRunX, y: sY },
      { kind: 'quad', x: cornerX, y: cornerOutY, cx: cornerX, cy: sY },
      { kind: 'line', x: cornerX, y: tY },
      { kind: 'line', x: targetX, y: targetY },
    ]
  } else if (isHorizontalSource && isHorizontalTarget) {
    // Both horizontal — go through middle Y
    path = `M${sourceX},${sourceY} L${sX},${sourceY} L${midX},${sourceY} Q${midX},${sourceY} ${midX},${midY} L${midX},${targetY} L${tX},${targetY} L${targetX},${targetY}`
    segments = [
      { kind: 'move', x: sourceX, y: sourceY },
      { kind: 'line', x: sX, y: sourceY },
      { kind: 'line', x: midX, y: sourceY },
      { kind: 'quad', x: midX, y: midY, cx: midX, cy: sourceY },
      { kind: 'line', x: midX, y: targetY },
      { kind: 'line', x: tX, y: targetY },
      { kind: 'line', x: targetX, y: targetY },
    ]
  } else {
    // Both vertical — go through middle X
    path = `M${sourceX},${sourceY} L${sourceX},${sY} L${sourceX},${midY} Q${sourceX},${midY} ${midX},${midY} L${targetX},${midY} L${targetX},${tY} L${targetX},${targetY}`
    segments = [
      { kind: 'move', x: sourceX, y: sourceY },
      { kind: 'line', x: sourceX, y: sY },
      { kind: 'line', x: sourceX, y: midY },
      { kind: 'quad', x: midX, y: midY, cx: sourceX, cy: midY },
      { kind: 'line', x: targetX, y: midY },
      { kind: 'line', x: targetX, y: tY },
      { kind: 'line', x: targetX, y: targetY },
    ]
  }

  return { path, labelX: center.x, labelY: center.y, segments }
}

/**
 * Calculate a straight edge path — direct line between two points.
 */
export interface StraightPathParams {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
}

export function getStraightPath(params: StraightPathParams): EdgePathResult {
  const sourceX = params.sourceX
  const sourceY = params.sourceY
  const targetX = params.targetX
  const targetY = params.targetY
  const center = getCenter({ x: sourceX, y: sourceY }, { x: targetX, y: targetY })

  return {
    path: `M${sourceX},${sourceY} L${targetX},${targetY}`,
    labelX: center.x,
    labelY: center.y,
    segments: [
      { kind: 'move', x: sourceX, y: sourceY },
      { kind: 'line', x: targetX, y: targetY },
    ],
  }
}

/**
 * Calculate a step edge path — right-angle segments with no rounding.
 */
export interface StepPathParams {
  sourceX: number
  sourceY: number
  sourcePosition?: Position
  targetX: number
  targetY: number
  targetPosition?: Position
  /** Straight run-out from each endpoint before the first turn — default 20 */
  offset?: number
}

export function getStepPath(params: StepPathParams): EdgePathResult {
  // Explicit field copy rather than a spread: PMTC has no object spread, and a
  // step edge is a smooth-step edge with zero corner radius.
  return getSmoothStepPath({
    sourceX: params.sourceX,
    sourceY: params.sourceY,
    sourcePosition: params.sourcePosition ?? Position.Bottom,
    targetX: params.targetX,
    targetY: params.targetY,
    targetPosition: params.targetPosition ?? Position.Top,
    borderRadius: 0,
    offset: params.offset ?? 20,
  })
}

/**
 * Calculate an edge path that passes through waypoints.
 * Uses line segments with optional smoothing.
 */
export interface WaypointPathParams {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  waypoints: XYPosition[]
}

export function getWaypointPath(params: WaypointPathParams): EdgePathResult {
  const sourceX = params.sourceX
  const sourceY = params.sourceY
  const targetX = params.targetX
  const targetY = params.targetY
  const waypoints = params.waypoints

  if (waypoints.length === 0) {
    return getStraightPath({ sourceX, sourceY, targetX, targetY })
  }

  const allPoints = [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }]

  const pathParts = allPoints.map((p) => `${p.x},${p.y}`)
  const path = `M${pathParts.join(' L')}`
  const pathSegments: EdgeSegment[] = allPoints.map((p, i) =>
    i === 0 ? { kind: 'move', x: p.x, y: p.y } : { kind: 'line', x: p.x, y: p.y },
  )

  // Label at the middle waypoint
  const midIdx = Math.floor(waypoints.length / 2)
  /* v8 ignore next — `?? {midpoint}` fallback: path builders always produce a
     non-empty waypoints array, so waypoints[midIdx] is defined. Defensive. */
  const midPoint = waypoints[midIdx] ?? {
    x: (sourceX + targetX) / 2,
    y: (sourceY + targetY) / 2,
  }

  return { path, labelX: midPoint.x, labelY: midPoint.y, segments: pathSegments }
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
  // Explicit fields with `??` defaults instead of conditional spreads (PMTC
  // has neither spread nor a per-case return), and one return at the end.
  const borderRadius = options?.borderRadius ?? 5
  const offset = options?.offset ?? 20
  const curvature = options?.curvature ?? 0.25
  let result: EdgePathResult
  if (type === 'smoothstep') {
    result = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius,
      offset,
    })
  } else if (type === 'straight') {
    result = getStraightPath({ sourceX, sourceY, targetX, targetY })
  } else if (type === 'step') {
    result = getStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      offset,
    })
  } else {
    result = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature,
    })
  }
  return result
}
