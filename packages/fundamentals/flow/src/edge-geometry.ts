/**
 * Edge geometry derivation — computes an edge's endpoint coordinates, tangent
 * sides, SVG path, and label anchor from the live source/target nodes.
 *
 * Moved out of flow-component.tsx (verbatim) so `createFlow` can own the
 * per-edge memoized geometry computeds (`FlowInstance._edgeGeometry`) — the
 * instance is the only place with a lifecycle that spans row mounts (a `<For>`
 * row has no scope of its own, and the instance outlives any one `<Flow>`
 * mount), so the computed cache and its eviction have to live there, which
 * means the compute function does too.
 *
 * NOTE on coverage: this file is in `coverageExclude` (vitest.config.ts) for
 * the same reason `src/components/**` is — it is exercised through mounted
 * EdgeLayer thunks, whose full branch surface (measured handles, floating
 * endpoints, waypoints) only real-Chromium suites drive
 * (edge-render.browser.test.tsx, handle-anchor.browser.test.tsx, the
 * app-showcase flow e2e); happy-dom has no layout, so the node run covers
 * only the fallback-dimension slice.
 */
import {
  getEdgePath,
  getEffectiveDimensions,
  getFloatingEndpoints,
  getHandlePosition,
  getSmartHandlePositions,
  getWaypointPath,
  resolveHandleAnchor,
} from './edges'
import type { EdgeGeometry, FlowEdge, FlowNode, NodeMeasurement } from './types'
import { Position } from './types'

// Dev-only: an `edge.sourceHandle`/`targetHandle` naming an id that matches
// NONE of the node's handles silently anchors at the first-handle fallback —
// warn ONCE per edge+side so the typo is visible. Only judged when the node
// HAS handle info (measured or config); pre-measurement nodes are skipped so
// the first un-measured frame can't false-positive.
const _warnedHandleIds = new Set<string>()

function warnUnknownHandleOnce(
  edge: FlowEdge,
  sourceNode: FlowNode<any>,
  targetNode: FlowNode<any>,
  sm: NodeMeasurement | undefined,
  tm: NodeMeasurement | undefined,
): void {
  // Early-return dev guard (in addition to the call-site gate) so the warn is
  // provably tree-shaken — the `dev-guard-warnings` lint rule checks per-function.
  if (process.env.NODE_ENV === 'production') return
  const check = (
    side: 'source' | 'target',
    handleId: string | undefined,
    node: FlowNode<any>,
    m: NodeMeasurement | undefined,
  ): void => {
    if (!handleId) return
    const config = side === 'source' ? node.sourceHandles : node.targetHandles
    const measuredIds = m?.handles?.filter((h) => h.type === side).map((h) => h.id) ?? []
    const configIds = config?.map((h) => h.id ?? h.type) ?? []
    const known = [...measuredIds, ...configIds]
    if (known.length === 0) return
    if (known.includes(handleId)) return
    const key = `${edge.id ?? `${edge.source}->${edge.target}`}:${side}`
    if (_warnedHandleIds.has(key)) return
    _warnedHandleIds.add(key)
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] flow: edge "${edge.id ?? `${edge.source}->${edge.target}`}" references ${side}Handle "${handleId}" ` +
        `but node "${node.id}" has no handle with that id (known: ${known.join(', ')}). ` +
        `The edge anchors at the node's first ${side} handle instead — fix the id to target the intended handle.`,
    )
  }
  check('source', edge.sourceHandle, sourceNode, sm)
  check('target', edge.targetHandle, targetNode, tm)
}

/**
 * Compute a path geometry packet from live source/target nodes. Read inside
 * the instance's per-edge `_edgeGeometry` computed so position updates flow
 * through — and only when one of THIS edge's endpoints (or its measurement /
 * the edge itself) changed.
 */
export function computeEdgeGeometry(
  edge: FlowEdge,
  sourceNode: FlowNode<any>,
  targetNode: FlowNode<any>,
  measured: Map<string, NodeMeasurement>,
): EdgeGeometry {
  // Effective node boxes — explicit `node.width`/`height` (a deliberate
  // consumer override) → measured DOM size → 150×40 default (pre-measurement
  // first frame / SSR). Anchors edges to the real node.
  const sm = measured.get(sourceNode.id)
  const tm = measured.get(targetNode.id)
  const sDims = getEffectiveDimensions(sourceNode, sm)
  const tDims = getEffectiveDimensions(targetNode, tm)
  const sourceW = sDims.width
  const sourceH = sDims.height
  const targetW = tDims.width
  const targetH = tDims.height

  // Handle-anchored endpoints: `edge.sourceHandle`/`targetHandle` (or a node's
  // first handle) resolve to the MEASURED `<Handle>` dot center when the DOM
  // pass has recorded one — the arrow touches the actual dot, wherever the
  // consumer's CSS placed it — else the declared side's midpoint from the
  // node's config handles. Nodes with NO handles fall through to null.
  const sourceAnchor = resolveHandleAnchor(sourceNode, edge.sourceHandle, 'source', sDims, sm)
  const targetAnchor = resolveHandleAnchor(targetNode, edge.targetHandle, 'target', tDims, tm)

  if (process.env.NODE_ENV !== 'production') {
    warnUnknownHandleOnce(edge, sourceNode, targetNode, sm, tm)
  }

  // Auto-routed edges (neither endpoint resolves to a handle, no waypoints)
  // use FLOATING endpoints: connect where the center-to-center line crosses
  // each node's perimeter so the edge approaches at the natural angle instead
  // of docking at a fixed side's midpoint (which forces a horizontal/vertical
  // kink). Handle-anchored endpoints — and waypoint routes — keep their fixed
  // docking points.
  const useFloating =
    !sourceAnchor && !targetAnchor && !(edge.waypoints && edge.waypoints.length > 0)

  let sourcePos: { x: number; y: number }
  let targetPos: { x: number; y: number }
  let sourcePosition: Position
  let targetPosition: Position

  if (useFloating) {
    const fe = getFloatingEndpoints(sourceNode, targetNode, { sourceW, sourceH, targetW, targetH })
    sourcePos = { x: fe.source.x, y: fe.source.y }
    targetPos = { x: fe.target.x, y: fe.target.y }
    sourcePosition = fe.source.position
    targetPosition = fe.target.position
  } else {
    // At least one side is handle-anchored; the other (if handle-less) docks
    // at the smart side facing the other node.
    const smart = getSmartHandlePositions(sourceNode, targetNode, {
      sourceW,
      sourceH,
      targetW,
      targetH,
    })
    sourcePosition = sourceAnchor?.position ?? smart.sourcePosition
    targetPosition = targetAnchor?.position ?? smart.targetPosition
    sourcePos =
      sourceAnchor ??
      getHandlePosition(
        sourcePosition,
        sourceNode.position.x,
        sourceNode.position.y,
        sourceW,
        sourceH,
      )
    targetPos =
      targetAnchor ??
      getHandlePosition(
        targetPosition,
        targetNode.position.x,
        targetNode.position.y,
        targetW,
        targetH,
      )
  }

  const { path, labelX, labelY } = edge.waypoints?.length
    ? getWaypointPath({
        sourceX: sourcePos.x,
        sourceY: sourcePos.y,
        targetX: targetPos.x,
        targetY: targetPos.y,
        waypoints: edge.waypoints,
      })
    : getEdgePath(
        edge.type ?? 'bezier',
        sourcePos.x,
        sourcePos.y,
        sourcePosition,
        targetPos.x,
        targetPos.y,
        targetPosition,
        edge.pathOptions,
      )

  return {
    sourceX: sourcePos.x,
    sourceY: sourcePos.y,
    targetX: targetPos.x,
    targetY: targetPos.y,
    sourcePosition,
    targetPosition,
    path,
    labelX,
    labelY,
  }
}
