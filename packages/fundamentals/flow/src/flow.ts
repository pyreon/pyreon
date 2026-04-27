import { batch, computed, signal } from '@pyreon/reactivity'
import { computeLayout } from './layout'
import type {
  Connection,
  FlowConfig,
  FlowEdge,
  FlowInstance,
  FlowNode,
  LayoutAlgorithm,
  LayoutOptions,
  NodeChange,
  XYPosition,
} from './types'

/**
 * Generate a unique edge id from source/target.
 */
function edgeId(edge: FlowEdge): string {
  if (edge.id) return edge.id
  const sh = edge.sourceHandle ? `-${edge.sourceHandle}` : ''
  const th = edge.targetHandle ? `-${edge.targetHandle}` : ''
  return `e-${edge.source}${sh}-${edge.target}${th}`
}

/**
 * Create a reactive flow instance — the core state manager for flow diagrams.
 *
 * All state is signal-based. Nodes, edges, viewport, and selection are
 * reactive and update the UI automatically when modified.
 *
 * @param config - Initial configuration with nodes, edges, and options
 * @returns A FlowInstance with signals and methods for managing the diagram
 *
 * @example
 * ```tsx
 * const flow = createFlow({
 *   nodes: [
 *     { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
 *     { id: '2', position: { x: 200, y: 100 }, data: { label: 'End' } },
 *   ],
 *   edges: [{ source: '1', target: '2' }],
 * })
 *
 * flow.nodes()          // reactive node list
 * flow.viewport()       // { x: 0, y: 0, zoom: 1 }
 * flow.addNode({ id: '3', position: { x: 400, y: 0 }, data: { label: 'New' } })
 * flow.layout('layered', { direction: 'RIGHT' })
 * ```
 */
export function createFlow<TData = Record<string, unknown>>(
  config: FlowConfig<TData> = {},
): FlowInstance<TData> {
  const {
    nodes: initialNodes = [],
    edges: initialEdges = [],
    defaultEdgeType = 'bezier',
    minZoom = 0.1,
    maxZoom = 4,
    snapToGrid = false,
    snapGrid = 15,
    connectionRules,
  } = config

  // Ensure all edges have ids
  const edgesWithIds = initialEdges.map((e) => ({
    ...e,
    id: edgeId(e),
    type: e.type ?? defaultEdgeType,
  }))

  // ── Core signals ─────────────────────────────────────────────────────────

  const nodes = signal<FlowNode<TData>[]>([...initialNodes])
  const edges = signal<FlowEdge[]>(edgesWithIds)
  const viewport = signal({ x: 0, y: 0, zoom: 1 })
  const containerSize = signal({ width: 800, height: 600 })

  // Track selected state separately for O(1) lookups
  const selectedNodeIds = signal(new Set<string>())
  const selectedEdgeIds = signal(new Set<string>())

  // ── Computed ─────────────────────────────────────────────────────────────

  const zoom = computed(() => viewport().zoom)

  const selectedNodes = computed(() => [...selectedNodeIds()])
  const selectedEdges = computed(() => [...selectedEdgeIds()])

  // ── Animation frame tracking ─────────────────────────────────────────────
  // Prevents frame leaks when layout()/animateViewport() are called multiple
  // times or when the instance is disposed mid-animation.
  let _layoutFrameId: number | null = null
  let _viewportFrameId: number | null = null

  // ── Safe rAF / cAF ───────────────────────────────────────────────────────
  // Two scenarios where the browser globals are unavailable:
  //   1. SSR — `requestAnimationFrame` doesn't exist in Node.
  //   2. Test teardown — vitest tears down the global scope between test
  //      files. An async `flow.layout()` that resolves AFTER the test
  //      returns may try to schedule a frame in a stripped environment,
  //      throwing `ReferenceError: requestAnimationFrame is not defined`
  //      from inside our recursive `animateFrame`.
  // Returning 0 / no-op in both cases is correct — there's no point
  // animating in a context that has no DOM and won't render anyway.
  const _raf = (cb: FrameRequestCallback): number =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : 0
  const _caf = (id: number): void => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
  }

  // ── Monotonic paste counter ─────────────────────────────────────────────
  // Avoids Date.now() + random collision risk under rapid paste operations.
  let _pasteCounter = 0

  // ── Listeners ────────────────────────────────────────────────────────────

  const connectListeners = new Set<(connection: Connection) => void>()
  const nodesChangeListeners = new Set<(changes: NodeChange[]) => void>()
  const nodeClickListeners = new Set<(node: FlowNode<TData>) => void>()
  const edgeClickListeners = new Set<(edge: FlowEdge) => void>()
  const nodeDragStartListeners = new Set<(node: FlowNode<TData>) => void>()
  const nodeDragEndListeners = new Set<(node: FlowNode<TData>) => void>()
  const nodeDoubleClickListeners = new Set<(node: FlowNode<TData>) => void>()

  function emitNodeChanges(changes: NodeChange[]) {
    for (const cb of nodesChangeListeners) cb(changes)
  }

  // ── Node operations ──────────────────────────────────────────────────────

  function getNode(id: string): FlowNode<TData> | undefined {
    return nodes.peek().find((n) => n.id === id)
  }

  function addNode(node: FlowNode<TData>): void {
    nodes.update((nds) => [...nds, node])
  }

  function removeNode(id: string): void {
    batch(() => {
      nodes.update((nds) => nds.filter((n) => n.id !== id))
      // Remove connected edges
      edges.update((eds) => eds.filter((e) => e.source !== id && e.target !== id))
      selectedNodeIds.update((set) => {
        const next = new Set(set)
        next.delete(id)
        return next
      })
    })
    emitNodeChanges([{ type: 'remove', id }])
  }

  function updateNode(id: string, update: Partial<FlowNode<TData>>): void {
    nodes.update((nds) => nds.map((n) => (n.id === id ? { ...n, ...update } : n)))
  }

  function updateNodePosition(id: string, position: XYPosition): void {
    let pos = snapToGrid
      ? {
          x: Math.round(position.x / snapGrid) * snapGrid,
          y: Math.round(position.y / snapGrid) * snapGrid,
        }
      : position

    // Apply extent clamping
    const node = getNode(id)
    pos = clampToExtent(pos, node?.width, node?.height)

    nodes.update((nds) => nds.map((n) => (n.id === id ? { ...n, position: pos } : n)))
    emitNodeChanges([{ type: 'position', id, position: pos }])
  }

  // ── Edge operations ──────────────────────────────────────────────────────

  function getEdge(id: string): FlowEdge | undefined {
    return edges.peek().find((e) => e.id === id)
  }

  function addEdge(edge: FlowEdge): void {
    const newEdge = {
      ...edge,
      id: edgeId(edge),
      type: edge.type ?? defaultEdgeType,
    }

    // Don't add duplicate edges
    const existing = edges.peek()
    if (existing.some((e) => e.id === newEdge.id)) return

    edges.update((eds) => [...eds, newEdge])

    // Notify connect listeners
    const connection: Connection = {
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle != null ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle != null ? { targetHandle: edge.targetHandle } : {}),
    }
    for (const cb of connectListeners) cb(connection)
  }

  function removeEdge(id: string): void {
    edges.update((eds) => eds.filter((e) => e.id !== id))
    selectedEdgeIds.update((set) => {
      const next = new Set(set)
      next.delete(id)
      return next
    })
  }

  function isValidConnection(connection: Connection): boolean {
    if (!connectionRules) return true

    // Find source node type
    const sourceNode = getNode(connection.source)
    if (!sourceNode) return false

    const sourceType = sourceNode.type ?? 'default'
    const rule = connectionRules[sourceType]
    if (!rule) return true // no rule = allow

    // Find target node type
    const targetNode = getNode(connection.target)
    if (!targetNode) return false

    const targetType = targetNode.type ?? 'default'
    return rule.outputs.includes(targetType)
  }

  // ── Selection ────────────────────────────────────────────────────────────

  function selectNode(id: string, additive = false): void {
    selectedNodeIds.update((set) => {
      const next = additive ? new Set(set) : new Set<string>()
      next.add(id)
      return next
    })
    if (!additive) {
      selectedEdgeIds.set(new Set())
    }
  }

  function deselectNode(id: string): void {
    selectedNodeIds.update((set) => {
      const next = new Set(set)
      next.delete(id)
      return next
    })
  }

  function selectEdge(id: string, additive = false): void {
    selectedEdgeIds.update((set) => {
      const next = additive ? new Set(set) : new Set<string>()
      next.add(id)
      return next
    })
    if (!additive) {
      selectedNodeIds.set(new Set())
    }
  }

  function clearSelection(): void {
    batch(() => {
      selectedNodeIds.set(new Set())
      selectedEdgeIds.set(new Set())
    })
  }

  function selectAll(): void {
    selectedNodeIds.set(new Set(nodes.peek().map((n) => n.id)))
  }

  function deleteSelected(): void {
    batch(() => {
      const nodeIdsToRemove = selectedNodeIds.peek()
      const edgeIdsToRemove = selectedEdgeIds.peek()

      if (nodeIdsToRemove.size > 0) {
        nodes.update((nds) => nds.filter((n) => !nodeIdsToRemove.has(n.id)))
        // Also remove edges connected to deleted nodes
        edges.update((eds) =>
          eds.filter(
            (e) =>
              !nodeIdsToRemove.has(e.source) &&
              !nodeIdsToRemove.has(e.target) &&
              !edgeIdsToRemove.has(e.id!),
          ),
        )
      } else if (edgeIdsToRemove.size > 0) {
        edges.update((eds) => eds.filter((e) => !edgeIdsToRemove.has(e.id!)))
      }

      selectedNodeIds.set(new Set())
      selectedEdgeIds.set(new Set())
    })
  }

  // ── Viewport ─────────────────────────────────────────────────────────────

  function fitView(nodeIds?: string[], padding = config.fitViewPadding ?? 0.1): void {
    const targetNodes = nodeIds ? nodes.peek().filter((n) => nodeIds.includes(n.id)) : nodes.peek()

    if (targetNodes.length === 0) return

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const node of targetNodes) {
      const w = node.width ?? 150
      const h = node.height ?? 40
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + w)
      maxY = Math.max(maxY, node.position.y + h)
    }

    const graphWidth = maxX - minX
    const graphHeight = maxY - minY

    const { width: containerWidth, height: containerHeight } = containerSize.peek()

    const zoomX = containerWidth / (graphWidth * (1 + padding * 2))
    const zoomY = containerHeight / (graphHeight * (1 + padding * 2))
    const newZoom = Math.min(Math.max(Math.min(zoomX, zoomY), minZoom), maxZoom)

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    viewport.set({
      x: containerWidth / 2 - centerX * newZoom,
      y: containerHeight / 2 - centerY * newZoom,
      zoom: newZoom,
    })
  }

  function zoomTo(z: number): void {
    viewport.update((v) => ({
      ...v,
      zoom: Math.min(Math.max(z, minZoom), maxZoom),
    }))
  }

  function zoomIn(): void {
    viewport.update((v) => ({
      ...v,
      zoom: Math.min(v.zoom * 1.2, maxZoom),
    }))
  }

  function zoomOut(): void {
    viewport.update((v) => ({
      ...v,
      zoom: Math.max(v.zoom / 1.2, minZoom),
    }))
  }

  function panTo(position: XYPosition): void {
    viewport.update((v) => ({
      ...v,
      x: -position.x * v.zoom,
      y: -position.y * v.zoom,
    }))
  }

  function isNodeVisible(id: string): boolean {
    const node = getNode(id)
    if (!node) return false
    // Simplified check — actual implementation would use container dimensions
    const v = viewport.peek()
    const w = node.width ?? 150
    const h = node.height ?? 40
    const screenX = node.position.x * v.zoom + v.x
    const screenY = node.position.y * v.zoom + v.y
    const screenW = w * v.zoom
    const screenH = h * v.zoom
    const { width: cw, height: ch } = containerSize.peek()
    return screenX + screenW > 0 && screenX < cw && screenY + screenH > 0 && screenY < ch
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  async function layout(
    algorithm: LayoutAlgorithm = 'layered',
    options: LayoutOptions = {},
  ): Promise<void> {
    const currentNodes = nodes.peek()
    const currentEdges = edges.peek()

    const positions = await computeLayout(currentNodes, currentEdges, algorithm, options)

    const animate = options.animate !== false
    const duration = options.animationDuration ?? 300

    if (!animate) {
      batch(() => {
        nodes.update((nds) =>
          nds.map((node) => {
            const pos = positions.find((p) => p.id === node.id)
            return pos ? { ...node, position: pos.position } : node
          }),
        )
      })
      return
    }

    // Animated transition — interpolate positions over duration.
    // Cancel any in-flight layout animation to prevent frame stacking.
    if (_layoutFrameId !== null) {
      _caf(_layoutFrameId)
      _layoutFrameId = null
    }

    const startPositions = new Map(currentNodes.map((n) => [n.id, { ...n.position }]))
    const targetPositions = new Map(positions.map((p) => [p.id, p.position]))

    const startTime = performance.now()

    const animateFrame = () => {
      const elapsed = performance.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - (1 - t) ** 3

      batch(() => {
        nodes.update((nds) =>
          nds.map((node) => {
            const start = startPositions.get(node.id)
            const end = targetPositions.get(node.id)
            if (!start || !end) return node
            return {
              ...node,
              position: {
                x: start.x + (end.x - start.x) * eased,
                y: start.y + (end.y - start.y) * eased,
              },
            }
          }),
        )
      })

      if (t < 1) {
        _layoutFrameId = _raf(animateFrame)
      } else {
        _layoutFrameId = null
      }
    }

    _layoutFrameId = _raf(animateFrame)
  }

  // ── Batch ────────────────────────────────────────────────────────────────

  function batchOp(fn: () => void): void {
    batch(fn)
  }

  // ── Graph queries ────────────────────────────────────────────────────────

  function getConnectedEdges(nodeId: string): FlowEdge[] {
    return edges.peek().filter((e) => e.source === nodeId || e.target === nodeId)
  }

  function getIncomers(nodeId: string): FlowNode<TData>[] {
    const incomingEdges = edges.peek().filter((e) => e.target === nodeId)
    const sourceIds = new Set(incomingEdges.map((e) => e.source))
    return nodes.peek().filter((n) => sourceIds.has(n.id))
  }

  function getOutgoers(nodeId: string): FlowNode<TData>[] {
    const outgoingEdges = edges.peek().filter((e) => e.source === nodeId)
    const targetIds = new Set(outgoingEdges.map((e) => e.target))
    return nodes.peek().filter((n) => targetIds.has(n.id))
  }

  // ── Listeners ────────────────────────────────────────────────────────────

  function onConnect(callback: (connection: Connection) => void): () => void {
    connectListeners.add(callback)
    return () => connectListeners.delete(callback)
  }

  function onNodesChange(callback: (changes: NodeChange[]) => void): () => void {
    nodesChangeListeners.add(callback)
    return () => nodesChangeListeners.delete(callback)
  }

  function onNodeClick(callback: (node: FlowNode<TData>) => void): () => void {
    nodeClickListeners.add(callback)
    return () => nodeClickListeners.delete(callback)
  }

  function onEdgeClick(callback: (edge: FlowEdge) => void): () => void {
    edgeClickListeners.add(callback)
    return () => edgeClickListeners.delete(callback)
  }

  function onNodeDragStart(callback: (node: FlowNode<TData>) => void): () => void {
    nodeDragStartListeners.add(callback)
    return () => nodeDragStartListeners.delete(callback)
  }

  function onNodeDragEnd(callback: (node: FlowNode<TData>) => void): () => void {
    nodeDragEndListeners.add(callback)
    return () => nodeDragEndListeners.delete(callback)
  }

  function onNodeDoubleClick(callback: (node: FlowNode<TData>) => void): () => void {
    nodeDoubleClickListeners.add(callback)
    return () => nodeDoubleClickListeners.delete(callback)
  }

  // ── Copy / Paste ────────────────────────────────────────────────────────

  let clipboard: { nodes: FlowNode<TData>[]; edges: FlowEdge[] } | null = null

  function copySelected(): void {
    const selectedNodeSet = selectedNodeIds.peek()
    if (selectedNodeSet.size === 0) return

    const copiedNodes = nodes.peek().filter((n) => selectedNodeSet.has(n.id))
    const nodeIdSet = new Set(copiedNodes.map((n) => n.id))
    const copiedEdges = edges
      .peek()
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))

    clipboard = { nodes: copiedNodes, edges: copiedEdges }
  }

  function paste(offset: XYPosition = { x: 50, y: 50 }): void {
    if (!clipboard) return

    const idMap = new Map<string, string>()
    const newNodes: FlowNode<TData>[] = []

    // Create new nodes with offset positions and new ids
    for (const node of clipboard.nodes) {
      const newId = `${node.id}-copy-${++_pasteCounter}`
      idMap.set(node.id, newId)
      newNodes.push({
        ...node,
        id: newId,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
      })
    }

    const newEdges: FlowEdge[] = clipboard.edges.map((e) => {
      const { id: _id, ...rest } = e
      return {
        ...rest,
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
      }
    })

    batch(() => {
      for (const node of newNodes) addNode(node)
      for (const edge of newEdges) addEdge(edge)

      // Select pasted nodes
      selectedNodeIds.set(new Set(newNodes.map((n) => n.id)))
      selectedEdgeIds.set(new Set())
    })
  }

  // ── Undo / Redo ────────────────────────────────────────────────────────

  const undoStack: Array<{ nodes: FlowNode<TData>[]; edges: FlowEdge[] }> = []
  const redoStack: Array<{ nodes: FlowNode<TData>[]; edges: FlowEdge[] }> = []
  const maxHistory = 50

  function pushHistory(): void {
    undoStack.push({
      nodes: structuredClone(nodes.peek()),
      edges: structuredClone(edges.peek()),
    })
    if (undoStack.length > maxHistory) undoStack.shift()
    redoStack.length = 0
  }

  function undo(): void {
    const prev = undoStack.pop()
    if (!prev) return

    redoStack.push({
      nodes: structuredClone(nodes.peek()),
      edges: structuredClone(edges.peek()),
    })

    batch(() => {
      nodes.set(prev.nodes)
      edges.set(prev.edges)
      clearSelection()
    })
  }

  function redo(): void {
    const next = redoStack.pop()
    if (!next) return

    undoStack.push({
      nodes: structuredClone(nodes.peek()),
      edges: structuredClone(edges.peek()),
    })

    batch(() => {
      nodes.set(next.nodes)
      edges.set(next.edges)
      clearSelection()
    })
  }

  // ── Multi-node drag ────────────────────────────────────────────────────

  function moveSelectedNodes(dx: number, dy: number): void {
    const selected = selectedNodeIds.peek()
    if (selected.size === 0) return

    nodes.update((nds) =>
      nds.map((n) => {
        if (!selected.has(n.id)) return n
        return {
          ...n,
          position: {
            x: n.position.x + dx,
            y: n.position.y + dy,
          },
        }
      }),
    )
  }

  // ── Helper lines (snap guides) ─────────────────────────────────────────

  function getSnapLines(
    dragNodeId: string,
    position: XYPosition,
    threshold = 5,
  ): { x: number | null; y: number | null; snappedPosition: XYPosition } {
    const dragNode = getNode(dragNodeId)
    if (!dragNode) return { x: null, y: null, snappedPosition: position }

    const w = dragNode.width ?? 150
    const h = dragNode.height ?? 40
    const dragCenterX = position.x + w / 2
    const dragCenterY = position.y + h / 2

    let snapX: number | null = null
    let snapY: number | null = null
    let snappedX = position.x
    let snappedY = position.y

    for (const node of nodes.peek()) {
      if (node.id === dragNodeId) continue
      const nw = node.width ?? 150
      const nh = node.height ?? 40
      const nodeCenterX = node.position.x + nw / 2
      const nodeCenterY = node.position.y + nh / 2

      // Snap to center X
      if (Math.abs(dragCenterX - nodeCenterX) < threshold) {
        snapX = nodeCenterX
        snappedX = nodeCenterX - w / 2
      }
      // Snap to left edge
      if (Math.abs(position.x - node.position.x) < threshold) {
        snapX = node.position.x
        snappedX = node.position.x
      }
      // Snap to right edge
      if (Math.abs(position.x + w - (node.position.x + nw)) < threshold) {
        snapX = node.position.x + nw
        snappedX = node.position.x + nw - w
      }

      // Snap to center Y
      if (Math.abs(dragCenterY - nodeCenterY) < threshold) {
        snapY = nodeCenterY
        snappedY = nodeCenterY - h / 2
      }
      // Snap to top edge
      if (Math.abs(position.y - node.position.y) < threshold) {
        snapY = node.position.y
        snappedY = node.position.y
      }
      // Snap to bottom edge
      if (Math.abs(position.y + h - (node.position.y + nh)) < threshold) {
        snapY = node.position.y + nh
        snappedY = node.position.y + nh - h
      }
    }

    return { x: snapX, y: snapY, snappedPosition: { x: snappedX, y: snappedY } }
  }

  // ── Sub-flows / Groups ──────────────────────────────────────────────────

  function getChildNodes(parentId: string): FlowNode<TData>[] {
    return nodes.peek().filter((n) => n.parentId === parentId)
  }

  function getAbsolutePosition(nodeId: string): XYPosition {
    const node = getNode(nodeId)
    if (!node) return { x: 0, y: 0 }

    if (node.parentId) {
      const parentPos = getAbsolutePosition(node.parentId)
      return {
        x: parentPos.x + node.position.x,
        y: parentPos.y + node.position.y,
      }
    }

    return node.position
  }

  // ── Edge reconnecting ──────────────────────────────────────────────────

  function reconnectEdge(
    targetEdgeId: string,
    newConnection: {
      source?: string
      target?: string
      sourceHandle?: string
      targetHandle?: string
    },
  ): void {
    edges.update((eds) =>
      eds.map((e) => {
        if (e.id !== targetEdgeId) return e
        const updated: typeof e = {
          ...e,
          source: newConnection.source ?? e.source,
          target: newConnection.target ?? e.target,
        }
        const sh = newConnection.sourceHandle ?? e.sourceHandle
        const th = newConnection.targetHandle ?? e.targetHandle
        if (sh != null) updated.sourceHandle = sh
        if (th != null) updated.targetHandle = th
        return updated
      }),
    )
  }

  // ── Edge waypoints ──────────────────────────────────────────────────────

  function addEdgeWaypoint(edgeIdentifier: string, point: XYPosition, index?: number): void {
    edges.update((eds) =>
      eds.map((e) => {
        if (e.id !== edgeIdentifier) return e
        const waypoints = [...(e.waypoints ?? [])]
        if (index !== undefined) {
          waypoints.splice(index, 0, point)
        } else {
          waypoints.push(point)
        }
        return { ...e, waypoints }
      }),
    )
  }

  function removeEdgeWaypoint(edgeIdentifier: string, index: number): void {
    edges.update((eds) =>
      eds.map((e) => {
        if (e.id !== edgeIdentifier) return e
        const waypoints = [...(e.waypoints ?? [])]
        waypoints.splice(index, 1)
        const { waypoints: _wp, ...rest } = e
        return waypoints.length > 0 ? { ...rest, waypoints } : rest
      }),
    )
  }

  function updateEdgeWaypoint(edgeIdentifier: string, index: number, point: XYPosition): void {
    edges.update((eds) =>
      eds.map((e) => {
        if (e.id !== edgeIdentifier) return e
        const waypoints = [...(e.waypoints ?? [])]
        if (index >= 0 && index < waypoints.length) {
          waypoints[index] = point
        }
        return { ...e, waypoints }
      }),
    )
  }

  // ── Proximity connect ───────────────────────────────────────────────────

  function getProximityConnection(nodeId: string, threshold = 50): Connection | null {
    const node = getNode(nodeId)
    if (!node) return null

    const w = node.width ?? 150
    const h = node.height ?? 40
    const centerX = node.position.x + w / 2
    const centerY = node.position.y + h / 2

    let closest: { nodeId: string; dist: number } | null = null

    for (const other of nodes.peek()) {
      if (other.id === nodeId) continue
      // Skip if already connected
      const alreadyConnected = edges
        .peek()
        .some(
          (e) =>
            (e.source === nodeId && e.target === other.id) ||
            (e.source === other.id && e.target === nodeId),
        )
      if (alreadyConnected) continue

      const ow = other.width ?? 150
      const oh = other.height ?? 40
      const ocx = other.position.x + ow / 2
      const ocy = other.position.y + oh / 2
      const dist = Math.hypot(centerX - ocx, centerY - ocy)

      if (dist < threshold && (!closest || dist < closest.dist)) {
        closest = { nodeId: other.id, dist }
      }
    }

    if (!closest) return null

    const connection: Connection = {
      source: nodeId,
      target: closest.nodeId,
    }

    return isValidConnection(connection) ? connection : null
  }

  // ── Collision detection ────────────────────────────────────────────────

  function getOverlappingNodes(nodeId: string): FlowNode<TData>[] {
    const node = getNode(nodeId)
    if (!node) return []

    const w = node.width ?? 150
    const h = node.height ?? 40
    const ax1 = node.position.x
    const ay1 = node.position.y
    const ax2 = ax1 + w
    const ay2 = ay1 + h

    return nodes.peek().filter((other) => {
      if (other.id === nodeId) return false
      const ow = other.width ?? 150
      const oh = other.height ?? 40
      const bx1 = other.position.x
      const by1 = other.position.y
      const bx2 = bx1 + ow
      const by2 = by1 + oh

      return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1
    })
  }

  function resolveCollisions(nodeId: string, spacing = 10): void {
    const overlapping = getOverlappingNodes(nodeId)
    if (overlapping.length === 0) return

    const node = getNode(nodeId)
    if (!node) return

    const w = node.width ?? 150
    const h = node.height ?? 40

    for (const other of overlapping) {
      const ow = other.width ?? 150
      const oh = other.height ?? 40

      // Calculate overlap amounts
      const overlapX = Math.min(
        node.position.x + w - other.position.x,
        other.position.x + ow - node.position.x,
      )
      const overlapY = Math.min(
        node.position.y + h - other.position.y,
        other.position.y + oh - node.position.y,
      )

      // Push in the direction of least overlap
      if (overlapX < overlapY) {
        const dx =
          node.position.x < other.position.x ? -(overlapX + spacing) / 2 : (overlapX + spacing) / 2
        updateNodePosition(other.id, {
          x: other.position.x - dx,
          y: other.position.y,
        })
      } else {
        const dy =
          node.position.y < other.position.y ? -(overlapY + spacing) / 2 : (overlapY + spacing) / 2
        updateNodePosition(other.id, {
          x: other.position.x,
          y: other.position.y - dy,
        })
      }
    }
  }

  // ── Node extent (drag boundaries) ──────────────────────────────────────

  function setNodeExtent(extent: [[number, number], [number, number]] | null): void {
    nodeExtent = extent
  }

  let nodeExtent: [[number, number], [number, number]] | null = config.nodeExtent ?? null

  function clampToExtent(position: XYPosition, nodeWidth = 150, nodeHeight = 40): XYPosition {
    if (!nodeExtent) return position
    return {
      x: Math.min(Math.max(position.x, nodeExtent[0][0]), nodeExtent[1][0] - nodeWidth),
      y: Math.min(Math.max(position.y, nodeExtent[0][1]), nodeExtent[1][1] - nodeHeight),
    }
  }

  // ── Custom edge types ──────────────────────────────────────────────────
  // Custom edge rendering is handled in the Flow component via edgeTypes prop.
  // The flow instance provides the data; rendering is delegated to components.

  // ── Search / Filter ─────────────────────────────────────────────────────

  function findNodes(predicate: (node: FlowNode<TData>) => boolean): FlowNode<TData>[] {
    return nodes.peek().filter(predicate)
  }

  function searchNodes(query: string): FlowNode<TData>[] {
    const q = query.toLowerCase()
    return nodes.peek().filter((n) => {
      // searchNodes is a built-in convenience that looks for a `label`
      // string on the node's data payload — a common convention but
      // not part of the typed `TData` shape. Cast through `unknown`
      // to read it without forcing every consumer's data type to
      // declare a `label` field.
      const data = n.data as unknown as { label?: string } | undefined
      const label = data?.label ?? n.id
      return label.toLowerCase().includes(q)
    })
  }

  function focusNode(nodeId: string, focusZoom?: number): void {
    const node = getNode(nodeId)
    if (!node) return

    const w = node.width ?? 150
    const h = node.height ?? 40
    const centerX = node.position.x + w / 2
    const centerY = node.position.y + h / 2
    const z = focusZoom ?? viewport.peek().zoom
    const { width: cw, height: ch } = containerSize.peek()

    animateViewport({
      x: -centerX * z + cw / 2,
      y: -centerY * z + ch / 2,
      zoom: z,
    })

    // Select the focused node
    selectNode(nodeId)
  }

  // ── Export / Import ────────────────────────────────────────────────────

  function toJSON(): {
    nodes: FlowNode<TData>[]
    edges: FlowEdge[]
    viewport: { x: number; y: number; zoom: number }
  } {
    return {
      nodes: structuredClone(nodes.peek()),
      edges: structuredClone(edges.peek()),
      viewport: { ...viewport.peek() },
    }
  }

  function fromJSON(data: {
    nodes: FlowNode<TData>[]
    edges: FlowEdge[]
    viewport?: { x: number; y: number; zoom: number }
  }): void {
    batch(() => {
      nodes.set(data.nodes)
      edges.set(
        data.edges.map((e) => ({
          ...e,
          id: e.id ?? edgeId(e),
          type: e.type ?? defaultEdgeType,
        })),
      )
      if (data.viewport) viewport.set(data.viewport)
      clearSelection()
    })
  }

  // ── Viewport animation ─────────────────────────────────────────────────

  function animateViewport(
    target: Partial<{ x: number; y: number; zoom: number }>,
    duration = 300,
  ): void {
    // Cancel any in-flight viewport animation
    if (_viewportFrameId !== null) {
      _caf(_viewportFrameId)
      _viewportFrameId = null
    }

    const start = { ...viewport.peek() }
    const end = {
      x: target.x ?? start.x,
      y: target.y ?? start.y,
      zoom: target.zoom ?? start.zoom,
    }
    const startTime = performance.now()

    const frame = () => {
      const elapsed = performance.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      const eased = 1 - (1 - t) ** 3 // ease-out cubic

      viewport.set({
        x: start.x + (end.x - start.x) * eased,
        y: start.y + (end.y - start.y) * eased,
        zoom: start.zoom + (end.zoom - start.zoom) * eased,
      })

      if (t < 1) {
        _viewportFrameId = _raf(frame)
      } else {
        _viewportFrameId = null
      }
    }

    _viewportFrameId = _raf(frame)
  }

  // ── Dispose ──────────────────────────────────────────────────────────────

  function dispose(): void {
    // Cancel any in-flight animations to prevent stale state mutations
    if (_layoutFrameId !== null) {
      _caf(_layoutFrameId)
      _layoutFrameId = null
    }
    if (_viewportFrameId !== null) {
      _caf(_viewportFrameId)
      _viewportFrameId = null
    }

    connectListeners.clear()
    nodesChangeListeners.clear()
    nodeClickListeners.clear()
    edgeClickListeners.clear()
    nodeDragStartListeners.clear()
    nodeDragEndListeners.clear()
    nodeDoubleClickListeners.clear()
  }

  // ── Initial fitView ──────────────────────────────────────────────────────

  if (config.fitView) {
    fitView()
  }

  return {
    nodes,
    edges,
    viewport,
    zoom,
    containerSize,
    selectedNodes,
    selectedEdges,
    getNode,
    addNode,
    removeNode,
    updateNode,
    updateNodePosition,
    getEdge,
    addEdge,
    removeEdge,
    isValidConnection,
    selectNode,
    deselectNode,
    selectEdge,
    clearSelection,
    selectAll,
    deleteSelected,
    fitView,
    zoomTo,
    zoomIn,
    zoomOut,
    panTo,
    isNodeVisible,
    layout,
    batch: batchOp,
    getConnectedEdges,
    getIncomers,
    getOutgoers,
    onConnect,
    onNodesChange,
    onNodeClick,
    onEdgeClick,
    onNodeDragStart,
    onNodeDragEnd,
    onNodeDoubleClick,
    /** @internal — used by Flow component to emit events */
    _emit: {
      nodeDragStart: (node: FlowNode<TData>) => {
        for (const cb of nodeDragStartListeners) cb(node)
      },
      nodeDragEnd: (node: FlowNode<TData>) => {
        for (const cb of nodeDragEndListeners) cb(node)
      },
      nodeDoubleClick: (node: FlowNode<TData>) => {
        for (const cb of nodeDoubleClickListeners) cb(node)
      },
      nodeClick: (node: FlowNode<TData>) => {
        for (const cb of nodeClickListeners) cb(node)
      },
      edgeClick: (edge: FlowEdge) => {
        for (const cb of edgeClickListeners) cb(edge)
      },
    },
    copySelected,
    paste,
    pushHistory,
    undo,
    redo,
    moveSelectedNodes,
    getSnapLines,
    getChildNodes,
    getAbsolutePosition,
    addEdgeWaypoint,
    removeEdgeWaypoint,
    updateEdgeWaypoint,
    reconnectEdge,
    getProximityConnection,
    getOverlappingNodes,
    resolveCollisions,
    setNodeExtent,
    clampToExtent,
    findNodes,
    searchNodes,
    focusNode,
    toJSON,
    fromJSON,
    animateViewport,
    config,
    dispose,
  }
}
