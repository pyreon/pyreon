import type { VNodeChild } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import { getEdgePath, getHandlePosition, getSmartHandlePositions, getWaypointPath } from "../edges"
import type { Connection, FlowInstance, FlowNode, NodeComponentProps } from "../types"
import { Position } from "../types"

// ─── Node type registry ──────────────────────────────────────────────────────

type NodeTypeMap = Record<string, (props: NodeComponentProps<any>) => VNodeChild>

/**
 * Default node renderer — simple labeled box.
 */
function DefaultNode(props: NodeComponentProps) {
  const borderColor = props.selected ? "#3b82f6" : "#ddd"
  const cursor = props.dragging ? "grabbing" : "grab"
  return (
    <div
      style={`padding: 8px 16px; background: white; border: 2px solid ${borderColor}; border-radius: 6px; font-size: 13px; min-width: 80px; text-align: center; cursor: ${cursor}; user-select: none;`}
    >
      {(props.data?.label as string) ?? props.id}
    </div>
  )
}

// ─── Connection line state ───────────────────────────────────────────────────

interface ConnectionState {
  active: boolean
  sourceNodeId: string
  sourceHandleId: string
  sourcePosition: Position
  sourceX: number
  sourceY: number
  currentX: number
  currentY: number
}

const emptyConnection: ConnectionState = {
  active: false,
  sourceNodeId: "",
  sourceHandleId: "",
  sourcePosition: Position.Right,
  sourceX: 0,
  sourceY: 0,
  currentX: 0,
  currentY: 0,
}

// ─── Selection box state ─────────────────────────────────────────────────────

interface SelectionBoxState {
  active: boolean
  startX: number
  startY: number
  currentX: number
  currentY: number
}

const emptySelectionBox: SelectionBoxState = {
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
}

// ─── Drag state ──────────────────────────────────────────────────────────────

interface DragState {
  active: boolean
  nodeId: string
  startX: number
  startY: number
  /** Starting positions of all nodes being dragged (for multi-drag) */
  startPositions: Map<string, { x: number; y: number }>
}

const emptyDrag: DragState = {
  active: false,
  nodeId: "",
  startX: 0,
  startY: 0,
  startPositions: new Map(),
}

// ─── Edge Layer ──────────────────────────────────────────────────────────────

function EdgeLayer(props: {
  instance: FlowInstance
  connectionState: () => ConnectionState
  edgeTypes?: EdgeTypeMap
}): VNodeChild {
  const { instance, connectionState, edgeTypes } = props

  return () => {
    const nodes = instance.nodes()
    const edges = instance.edges()
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    const conn = connectionState()

    return (
      <svg
        role="img"
        aria-label="flow edges"
        class="pyreon-flow-edges"
        style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible;"
      >
        <defs>
          <marker
            id="flow-arrowhead"
            {...{
              markerWidth: "10",
              markerHeight: "7",
              refX: "10",
              refY: "3.5",
              orient: "auto",
            }}
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#999" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const sourceNode = nodeMap.get(edge.source)
          const targetNode = nodeMap.get(edge.target)
          if (!sourceNode || !targetNode) return <g key={edge.id} />

          const sourceW = sourceNode.width ?? 150
          const sourceH = sourceNode.height ?? 40
          const targetW = targetNode.width ?? 150
          const targetH = targetNode.height ?? 40

          const { sourcePosition, targetPosition } = getSmartHandlePositions(sourceNode, targetNode)

          const sourcePos = getHandlePosition(
            sourcePosition,
            sourceNode.position.x,
            sourceNode.position.y,
            sourceW,
            sourceH,
          )
          const targetPos = getHandlePosition(
            targetPosition,
            targetNode.position.x,
            targetNode.position.y,
            targetW,
            targetH,
          )

          const { path, labelX, labelY } = edge.waypoints?.length
            ? getWaypointPath({
                sourceX: sourcePos.x,
                sourceY: sourcePos.y,
                targetX: targetPos.x,
                targetY: targetPos.y,
                waypoints: edge.waypoints,
              })
            : getEdgePath(
                edge.type ?? "bezier",
                sourcePos.x,
                sourcePos.y,
                sourcePosition,
                targetPos.x,
                targetPos.y,
                targetPosition,
              )

          const selectedEdges = instance.selectedEdges()
          const isSelected = edge.id ? selectedEdges.includes(edge.id) : false

          // Custom edge renderer
          const CustomEdge = edge.type && edgeTypes?.[edge.type]
          if (CustomEdge) {
            return (
              <g key={edge.id} onClick={() => edge.id && instance.selectEdge(edge.id)}>
                <CustomEdge
                  edge={edge}
                  sourceX={sourcePos.x}
                  sourceY={sourcePos.y}
                  targetX={targetPos.x}
                  targetY={targetPos.y}
                  selected={isSelected}
                />
              </g>
            )
          }

          return (
            <g key={edge.id}>
              <path
                d={path}
                fill="none"
                stroke={isSelected ? "#3b82f6" : "#999"}
                stroke-width={isSelected ? "2" : "1.5"}
                marker-end="url(#flow-arrowhead)"
                class={edge.animated ? "pyreon-flow-edge-animated" : ""}
                style={`pointer-events: stroke; cursor: pointer; ${edge.style ?? ""}`}
                onClick={() => {
                  if (edge.id) instance.selectEdge(edge.id)
                  instance._emit.edgeClick(edge)
                }}
              />
              {edge.label && (
                <text
                  x={String(labelX)}
                  y={String(labelY)}
                  text-anchor="middle"
                  dominant-baseline="central"
                  style="font-size: 11px; fill: #666; pointer-events: none;"
                >
                  {edge.label}
                </text>
              )}
            </g>
          )
        })}
        {conn.active && (
          <path
            d={
              getEdgePath(
                "bezier",
                conn.sourceX,
                conn.sourceY,
                conn.sourcePosition,
                conn.currentX,
                conn.currentY,
                Position.Left,
              ).path
            }
            fill="none"
            stroke="#3b82f6"
            stroke-width="2"
            stroke-dasharray="5,5"
          />
        )}
      </svg>
    )
  }
}

// ─── Node Layer ──────────────────────────────────────────────────────────────

function NodeLayer(props: {
  instance: FlowInstance
  nodeTypes: NodeTypeMap
  draggingNodeId: () => string
  onNodePointerDown: (e: PointerEvent, node: FlowNode) => void
  onHandlePointerDown: (
    e: PointerEvent,
    nodeId: string,
    handleType: string,
    handleId: string,
    position: Position,
  ) => void
}): VNodeChild {
  const { instance, nodeTypes, draggingNodeId, onNodePointerDown, onHandlePointerDown } = props

  return () => {
    const nodes = instance.nodes()
    const selectedIds = instance.selectedNodes()
    const dragId = draggingNodeId()

    return (
      <>
        {nodes.map((node) => {
          const isSelected = selectedIds.includes(node.id)
          const isDragging = dragId === node.id
          const NodeComponent = (node.type && nodeTypes[node.type]) || nodeTypes.default!

          return (
            <div
              key={node.id}
              class={`pyreon-flow-node ${node.class ?? ""} ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
              style={`position: absolute; transform: translate(${node.position.x}px, ${node.position.y}px); z-index: ${isDragging ? 1000 : isSelected ? 100 : 0}; ${node.style ?? ""}`}
              data-nodeid={node.id}
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                instance.selectNode(node.id, e.shiftKey)
                instance._emit.nodeClick(node)
              }}
              onDblClick={(e: MouseEvent) => {
                e.stopPropagation()
                instance._emit.nodeDoubleClick(node)
              }}
              onPointerDown={(e: PointerEvent) => {
                // Check if clicking a handle
                const target = e.target as HTMLElement
                const handle = target.closest(".pyreon-flow-handle")
                if (handle) {
                  const hType = handle.getAttribute("data-handletype") ?? "source"
                  const hId = handle.getAttribute("data-handleid") ?? "source"
                  const hPos =
                    (handle.getAttribute("data-handleposition") as Position) ?? Position.Right
                  onHandlePointerDown(e, node.id, hType, hId, hPos)
                  return
                }
                // Otherwise start dragging node
                if (node.draggable !== false && instance.config.nodesDraggable !== false) {
                  onNodePointerDown(e, node)
                }
              }}
            >
              <NodeComponent
                id={node.id}
                data={node.data}
                selected={isSelected}
                dragging={isDragging}
              />
            </div>
          )
        })}
      </>
    )
  }
}

// ─── Flow Component ──────────────────────────────────────────────────────────

type EdgeTypeMap = Record<
  string,
  (props: {
    edge: import("../types").FlowEdge
    sourceX: number
    sourceY: number
    targetX: number
    targetY: number
    selected: boolean
  }) => VNodeChild
>

export interface FlowComponentProps {
  instance: FlowInstance
  /** Custom node type renderers */
  nodeTypes?: NodeTypeMap
  /** Custom edge type renderers */
  edgeTypes?: EdgeTypeMap
  style?: string
  class?: string
  children?: VNodeChild
}

/**
 * The main Flow component — renders the interactive flow diagram.
 *
 * Supports node dragging, connection drawing, custom node types,
 * pan/zoom, and all standard flow interactions.
 *
 * @example
 * ```tsx
 * const flow = createFlow({
 *   nodes: [...],
 *   edges: [...],
 * })
 *
 * <Flow instance={flow} nodeTypes={{ custom: CustomNode }}>
 *   <Background />
 *   <MiniMap />
 *   <Controls />
 * </Flow>
 * ```
 */
export function Flow(props: FlowComponentProps): VNodeChild {
  const { instance, children, edgeTypes } = props
  const nodeTypes: NodeTypeMap = {
    default: DefaultNode,
    input: DefaultNode,
    output: DefaultNode,
    ...props.nodeTypes,
  }

  // ── Drag state ─────────────────────────────────────────────────────────

  const dragState = signal<DragState>({ ...emptyDrag })
  const connectionState = signal<ConnectionState>({ ...emptyConnection })
  const selectionBox = signal<SelectionBoxState>({ ...emptySelectionBox })
  const helperLines = signal<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  })

  const draggingNodeId = () => (dragState().active ? dragState().nodeId : "")

  // ── Node dragging ──────────────────────────────────────────────────────

  const handleNodePointerDown = (e: PointerEvent, node: FlowNode) => {
    e.stopPropagation()

    // Capture starting positions of all selected nodes (for multi-drag)
    const selected = instance.selectedNodes()
    const startPositions = new Map<string, { x: number; y: number }>()

    // Always include the dragged node
    startPositions.set(node.id, { ...node.position })

    // Include other selected nodes if this node is part of selection
    if (selected.includes(node.id)) {
      for (const nid of selected) {
        if (nid === node.id) continue
        const n = instance.getNode(nid)
        if (n) startPositions.set(nid, { ...n.position })
      }
    }

    // Save undo state before drag
    instance.pushHistory()

    dragState.set({
      active: true,
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      startPositions,
    })

    instance.selectNode(node.id, e.shiftKey)

    instance._emit.nodeDragStart(node)

    const container = (e.currentTarget as HTMLElement).closest(".pyreon-flow") as HTMLElement
    if (container) container.setPointerCapture(e.pointerId)
  }

  // ── Connection drawing ─────────────────────────────────────────────────

  const handleHandlePointerDown = (
    e: PointerEvent,
    nodeId: string,
    _handleType: string,
    handleId: string,
    position: Position,
  ) => {
    e.stopPropagation()
    e.preventDefault()

    const node = instance.getNode(nodeId)
    if (!node) return

    const w = node.width ?? 150
    const h = node.height ?? 40
    const handlePos = getHandlePosition(position, node.position.x, node.position.y, w, h)

    connectionState.set({
      active: true,
      sourceNodeId: nodeId,
      sourceHandleId: handleId,
      sourcePosition: position,
      sourceX: handlePos.x,
      sourceY: handlePos.y,
      currentX: handlePos.x,
      currentY: handlePos.y,
    })

    const container = (e.target as HTMLElement).closest(".pyreon-flow") as HTMLElement
    if (container) container.setPointerCapture(e.pointerId)
  }

  // ── Zoom ───────────────────────────────────────────────────────────────

  const handleWheel = (e: WheelEvent) => {
    if (instance.config.zoomable === false) return
    e.preventDefault()

    const delta = -e.deltaY * 0.001
    const newZoom = Math.min(
      Math.max(instance.viewport.peek().zoom * (1 + delta), instance.config.minZoom ?? 0.1),
      instance.config.maxZoom ?? 4,
    )

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const vp = instance.viewport.peek()
    const scale = newZoom / vp.zoom

    instance.viewport.set({
      x: mouseX - (mouseX - vp.x) * scale,
      y: mouseY - (mouseY - vp.y) * scale,
      zoom: newZoom,
    })
  }

  // ── Pan ────────────────────────────────────────────────────────────────

  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let panStartVpX = 0
  let panStartVpY = 0

  const handlePointerDown = (e: PointerEvent) => {
    if (instance.config.pannable === false) return

    const target = e.target as HTMLElement
    if (target.closest(".pyreon-flow-node")) return
    if (target.closest(".pyreon-flow-handle")) return

    // Shift+drag on empty space → selection box
    if (e.shiftKey && instance.config.multiSelect !== false) {
      const container = e.currentTarget as HTMLElement
      const rect = container.getBoundingClientRect()
      const vp = instance.viewport.peek()
      const flowX = (e.clientX - rect.left - vp.x) / vp.zoom
      const flowY = (e.clientY - rect.top - vp.y) / vp.zoom

      selectionBox.set({
        active: true,
        startX: flowX,
        startY: flowY,
        currentX: flowX,
        currentY: flowY,
      })
      container.setPointerCapture(e.pointerId)
      return
    }

    isPanning = true
    panStartX = e.clientX
    panStartY = e.clientY
    const vp = instance.viewport.peek()
    panStartVpX = vp.x
    panStartVpY = vp.y
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    instance.clearSelection()
  }

  // ── Unified pointer move/up ────────────────────────────────────────────

  const handlePointerMove = (e: PointerEvent) => {
    const drag = dragState.peek()
    const conn = connectionState.peek()
    const sel = selectionBox.peek()

    if (sel.active) {
      const container = e.currentTarget as HTMLElement
      const rect = container.getBoundingClientRect()
      const vp = instance.viewport.peek()
      const flowX = (e.clientX - rect.left - vp.x) / vp.zoom
      const flowY = (e.clientY - rect.top - vp.y) / vp.zoom
      selectionBox.set({ ...sel, currentX: flowX, currentY: flowY })
      return
    }

    if (drag.active) {
      // Node dragging with snap guides
      const vp = instance.viewport.peek()
      const dx = (e.clientX - drag.startX) / vp.zoom
      const dy = (e.clientY - drag.startY) / vp.zoom

      const primaryStart = drag.startPositions.get(drag.nodeId)
      if (!primaryStart) return

      const rawPos = { x: primaryStart.x + dx, y: primaryStart.y + dy }
      const snap = instance.getSnapLines(drag.nodeId, rawPos)
      helperLines.set({ x: snap.x, y: snap.y })

      // Calculate actual delta (including snap adjustment)
      const actualDx = snap.snappedPosition.x - primaryStart.x
      const actualDy = snap.snappedPosition.y - primaryStart.y

      // Update all dragged nodes from their starting positions
      instance.nodes.update((nds) =>
        nds.map((n) => {
          const start = drag.startPositions.get(n.id)
          if (!start) return n
          return {
            ...n,
            position: { x: start.x + actualDx, y: start.y + actualDy },
          }
        }),
      )
      return
    }

    if (conn.active) {
      // Connection drawing — convert screen to flow coordinates
      const container = e.currentTarget as HTMLElement
      const rect = container.getBoundingClientRect()
      const vp = instance.viewport.peek()
      const flowX = (e.clientX - rect.left - vp.x) / vp.zoom
      const flowY = (e.clientY - rect.top - vp.y) / vp.zoom

      connectionState.set({
        ...conn,
        currentX: flowX,
        currentY: flowY,
      })
      return
    }

    if (isPanning) {
      const dx = e.clientX - panStartX
      const dy = e.clientY - panStartY
      instance.viewport.set({
        ...instance.viewport.peek(),
        x: panStartVpX + dx,
        y: panStartVpY + dy,
      })
    }
  }

  const handlePointerUp = (e: PointerEvent) => {
    const drag = dragState.peek()
    const conn = connectionState.peek()
    const sel = selectionBox.peek()

    if (sel.active) {
      // Select all nodes within the selection rectangle
      const minX = Math.min(sel.startX, sel.currentX)
      const minY = Math.min(sel.startY, sel.currentY)
      const maxX = Math.max(sel.startX, sel.currentX)
      const maxY = Math.max(sel.startY, sel.currentY)

      instance.clearSelection()
      for (const node of instance.nodes.peek()) {
        const w = node.width ?? 150
        const h = node.height ?? 40
        const nx = node.position.x
        const ny = node.position.y
        // Node is within box if any part overlaps
        if (nx + w > minX && nx < maxX && ny + h > minY && ny < maxY) {
          instance.selectNode(node.id, true)
        }
      }

      selectionBox.set({ ...emptySelectionBox })
      return
    }

    if (drag.active) {
      const node = instance.getNode(drag.nodeId)
      if (node) instance._emit.nodeDragEnd(node)
      dragState.set({ ...emptyDrag })
      helperLines.set({ x: null, y: null })
    }

    if (conn.active) {
      // Check if we released over a handle target
      const target = e.target as HTMLElement
      const handle = target.closest(".pyreon-flow-handle")
      if (handle) {
        const targetNodeId = handle.closest(".pyreon-flow-node")?.getAttribute("data-nodeid") ?? ""
        const targetHandleId = handle.getAttribute("data-handleid") ?? "target"

        if (targetNodeId && targetNodeId !== conn.sourceNodeId) {
          const connection: Connection = {
            source: conn.sourceNodeId,
            target: targetNodeId,
            sourceHandle: conn.sourceHandleId,
            targetHandle: targetHandleId,
          }

          if (instance.isValidConnection(connection)) {
            instance.addEdge({
              source: connection.source,
              target: connection.target,
              ...(connection.sourceHandle != null ? { sourceHandle: connection.sourceHandle } : {}),
              ...(connection.targetHandle != null ? { targetHandle: connection.targetHandle } : {}),
            })
          }
        }
      }

      connectionState.set({ ...emptyConnection })
    }

    isPanning = false
  }

  // ── Keyboard ───────────────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      instance.pushHistory()
      instance.deleteSelected()
    }
    if (e.key === "Escape") {
      instance.clearSelection()
      connectionState.set({ ...emptyConnection })
    }
    if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      instance.selectAll()
    }
    if (e.key === "c" && (e.metaKey || e.ctrlKey)) {
      instance.copySelected()
    }
    if (e.key === "v" && (e.metaKey || e.ctrlKey)) {
      instance.paste()
    }
    if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault()
      instance.undo()
    }
    if (e.key === "z" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault()
      instance.redo()
    }
  }

  // ── Touch support (pinch zoom) ──────────────────────────────────────────

  let lastTouchDist = 0
  let lastTouchCenter = { x: 0, y: 0 }

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const t1 = e.touches[0]!
      const t2 = e.touches[1]!
      lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      lastTouchCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      }
    }
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && instance.config.zoomable !== false) {
      e.preventDefault()
      const t1 = e.touches[0]!
      const t2 = e.touches[1]!
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const center = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      }

      const vp = instance.viewport.peek()
      const scaleFactor = dist / lastTouchDist
      const newZoom = Math.min(
        Math.max(vp.zoom * scaleFactor, instance.config.minZoom ?? 0.1),
        instance.config.maxZoom ?? 4,
      )

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const mouseX = center.x - rect.left
      const mouseY = center.y - rect.top
      const scale = newZoom / vp.zoom

      // Pan with touch center movement
      const panDx = center.x - lastTouchCenter.x
      const panDy = center.y - lastTouchCenter.y

      instance.viewport.set({
        x: mouseX - (mouseX - vp.x) * scale + panDx,
        y: mouseY - (mouseY - vp.y) * scale + panDy,
        zoom: newZoom,
      })

      lastTouchDist = dist
      lastTouchCenter = center
    }
  }

  // ── Container size tracking ─────────────────────────────────────────────

  let resizeObserver: ResizeObserver | null = null

  const containerRef = (el: Element | null) => {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    if (!el) return

    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      instance.containerSize.set({
        width: rect.width,
        height: rect.height,
      })
    }

    updateSize()
    resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(el)
  }

  const containerStyle = `position: relative; width: 100%; height: 100%; overflow: hidden; outline: none; touch-action: none; ${props.style ?? ""}`

  return (
    <div
      ref={containerRef}
      class={`pyreon-flow ${props.class ?? ""}`}
      style={containerStyle}
      tabIndex={0}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onKeyDown={handleKeyDown}
    >
      {children}
      {() => {
        const vp = instance.viewport()
        return (
          <div
            class="pyreon-flow-viewport"
            style={`position: absolute; transform-origin: 0 0; transform: translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom});`}
          >
            <EdgeLayer
              instance={instance}
              connectionState={() => connectionState()}
              {...(edgeTypes != null ? { edgeTypes } : {})}
            />
            {() => {
              const sel = selectionBox()
              if (!sel.active) return null
              const x = Math.min(sel.startX, sel.currentX)
              const y = Math.min(sel.startY, sel.currentY)
              const w = Math.abs(sel.currentX - sel.startX)
              const h = Math.abs(sel.currentY - sel.startY)
              return (
                <div
                  class="pyreon-flow-selection-box"
                  style={`position: absolute; left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px; border: 1px dashed #3b82f6; background: rgba(59, 130, 246, 0.08); pointer-events: none; z-index: 10;`}
                />
              )
            }}
            {() => {
              const lines = helperLines()
              if (!lines.x && !lines.y) return null
              return (
                <svg
                  role="img"
                  aria-label="helper lines"
                  style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 5;"
                >
                  {lines.x !== null && (
                    <line
                      x1={String(lines.x)}
                      y1="-10000"
                      x2={String(lines.x)}
                      y2="10000"
                      stroke="#3b82f6"
                      stroke-width="0.5"
                      stroke-dasharray="4,4"
                    />
                  )}
                  {lines.y !== null && (
                    <line
                      x1="-10000"
                      y1={String(lines.y)}
                      x2="10000"
                      y2={String(lines.y)}
                      stroke="#3b82f6"
                      stroke-width="0.5"
                      stroke-dasharray="4,4"
                    />
                  )}
                </svg>
              )
            }}
            <NodeLayer
              instance={instance}
              nodeTypes={nodeTypes}
              draggingNodeId={draggingNodeId}
              onNodePointerDown={handleNodePointerDown}
              onHandlePointerDown={handleHandlePointerDown}
            />
          </div>
        )
      }}
    </div>
  )
}
