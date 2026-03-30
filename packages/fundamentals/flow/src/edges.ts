import type { EdgePathResult, FlowNode, XYPosition } from './types'
import { Position } from './types'

/**
 * Auto-detect the best handle position based on relative node positions.
 * If the node has configured handles, uses those. Otherwise picks the
 * closest edge (top/right/bottom/left) based on direction to the other node.
 */
export function getSmartHandlePositions(
  sourceNode: FlowNode,
  targetNode: FlowNode,
): { sourcePosition: Position; targetPosition: Position } {
  const sw = sourceNode.width ?? 150
  const sh = sourceNode.height ?? 40
  const tw = targetNode.width ?? 150
  const th = targetNode.height ?? 40

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
      })
    default:
      return getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      })
  }
}
