import { For, type VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { getEdgePath, getHandlePosition, getSmartHandlePositions, getWaypointPath } from '../edges'
import type {
  Connection,
  FlowEdge,
  FlowInstance,
  FlowNode,
  NodeComponentProps,
} from '../types'
import { Position } from '../types'

// ─── Node type registry ──────────────────────────────────────────────────────

type NodeTypeMap = Record<string, (props: NodeComponentProps<any>) => VNodeChild>

/**
 * Default node renderer — simple labeled box.
 *
 * Every prop except `id` is an accessor function. `data()`, `selected()`,
 * and `dragging()` are read inside reactive scopes (the `style` and
 * children thunks) so the node patches in place when any underlying
 * state changes — including drags, selection clicks, and data
 * updates — without re-mounting the component.
 */
function DefaultNode(props: NodeComponentProps) {
  return (
    <div
      style={() => {
        const borderColor = props.selected() ? '#3b82f6' : '#ddd'
        const cursor = props.dragging() ? 'grabbing' : 'grab'
        return `padding: 8px 16px; background: white; border: 2px solid ${borderColor}; border-radius: 6px; font-size: 13px; min-width: 80px; text-align: center; cursor: ${cursor}; user-select: none;`
      }}
    >
      {() =>
        ((props.data() as { label?: string } | undefined)?.label as string) ?? props.id
      }
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
  sourceNodeId: '',
  sourceHandleId: '',
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
  nodeId: '',
  startX: 0,
  startY: 0,
  startPositions: new Map(),
}

// ─── Edge Layer ──────────────────────────────────────────────────────────────

interface EdgeGeometry {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  path: string
  labelX: number
  labelY: number
}

/**
 * Compute a path geometry packet from live source/target nodes. The
 * EdgeLayer's per-edge accessor calls this inside a reactive scope
 * so position updates flow through. Pulled out as a top-level
 * helper so the EdgeLayer body stays readable.
 */
function computeEdgeGeometry(
  edge: FlowEdge,
  sourceNode: FlowNode,
  targetNode: FlowNode,
): EdgeGeometry {
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
        edge.type ?? 'bezier',
        sourcePos.x,
        sourcePos.y,
        sourcePosition,
        targetPos.x,
        targetPos.y,
        targetPosition,
      )

  return {
    sourceX: sourcePos.x,
    sourceY: sourcePos.y,
    targetX: targetPos.x,
    targetY: targetPos.y,
    path,
    labelX,
    labelY,
  }
}

function EdgeLayer(props: {
  instance: FlowInstance
  connectionState: () => ConnectionState
  edgeTypes?: EdgeTypeMap
}): VNodeChild {
  const { instance, connectionState, edgeTypes } = props

  // <For> keys edges by id and runs the children function ONCE per
  // id. Per-edge accessors read live source/target nodes from
  // instance.nodes() inside their bodies, so node drags re-evaluate
  // path coordinates without re-mounting the edge.
  //
  // Before this rewrite, EdgeLayer subscribed to nodes() AND edges()
  // at the top of its reactive thunk, then did edges.map(...) which
  // re-emitted every <g><path /></g> SVG element on every node drag.
  // Custom edge components re-mounted at 60×/sec during drags —
  // strictly worse than the NodeLayer remount bug because SVG
  // element creation is heavier than DOM div creation.
  return () => (
    <svg
      role="img"
      aria-label="flow edges"
      class="pyreon-flow-edges"
      style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible;"
    >
      <defs>
        <marker
          id="flow-arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="10"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#999" />
        </marker>
      </defs>
      <For each={() => instance.edges()} by={(e: FlowEdge) => e.id ?? ''}>
        {(initialEdge: FlowEdge) => {
          const edgeId = initialEdge.id ?? ''

          // Per-edge accessors that read live source/target nodes
          // and recompute geometry on every read. Declared as `let`
          // (not `const`) so the Pyreon JSX compiler's prop-derived
          // variable inlining pass leaves them alone — `const`
          // function expressions that close over `props.instance`
          // get treated as inlinable, and the compiler's transitive
          // resolver overflows the stack when they cross-reference.
          // `let` declarations are explicitly skipped by the
          // resolver (see packages/core/compiler/src — the
          // prop-derived var scan bails on `NodeFlags.Let`).
          // oxlint-disable prefer-const
          let liveEdge: () => FlowEdge = () => {
            const all = instance.edges()
            return all.find((e) => e.id === edgeId) ?? initialEdge
          }

          let geometry: () => EdgeGeometry | null = () => {
            const e = liveEdge()
            const all = instance.nodes()
            const sourceNode = all.find((n) => n.id === e.source)
            const targetNode = all.find((n) => n.id === e.target)
            if (!sourceNode || !targetNode) return null
            return computeEdgeGeometry(e, sourceNode, targetNode)
          }

          let isSelected: () => boolean = () =>
            edgeId ? instance.selectedEdges().includes(edgeId) : false
          // oxlint-enable prefer-const

          // Custom edge renderer — mount once with accessor props.
          // Source/target coordinate accessors and `selected` are
          // reactive; the user's CustomEdge factory runs exactly
          // once and reads them inside its own JSX thunks.
          //
          // The geometry() accessor returns null if either source
          // or target node is missing (e.g. mid-removal). Each
          // coordinate accessor falls back to 0 in that case so
          // the CustomEdge keeps rendering with stale numbers
          // instead of throwing.
          const CustomEdge = initialEdge.type && edgeTypes?.[initialEdge.type]
          if (CustomEdge) {
            return (
              <g onClick={() => edgeId && instance.selectEdge(edgeId)}>
                <CustomEdge
                  edge={initialEdge}
                  sourceX={() => geometry()?.sourceX ?? 0}
                  sourceY={() => geometry()?.sourceY ?? 0}
                  targetX={() => geometry()?.targetX ?? 0}
                  targetY={() => geometry()?.targetY ?? 0}
                  selected={isSelected}
                />
              </g>
            )
          }

          return (
            <g>
              <path
                d={() => geometry()?.path ?? ''}
                fill="none"
                stroke={() => (isSelected() ? '#3b82f6' : '#999')}
                stroke-width={() => (isSelected() ? '2' : '1.5')}
                marker-end="url(#flow-arrowhead)"
                class={() => (liveEdge().animated ? 'pyreon-flow-edge-animated' : '')}
                style={() => `pointer-events: stroke; cursor: pointer; ${liveEdge().style ?? ''}`}
                onClick={() => {
                  if (edgeId) instance.selectEdge(edgeId)
                  instance._emit.edgeClick(liveEdge())
                }}
              />
              {() => {
                const e = liveEdge()
                const g = geometry()
                if (!e.label || !g) return null
                return (
                  <text
                    x={String(g.labelX)}
                    y={String(g.labelY)}
                    text-anchor="middle"
                    dominant-baseline="central"
                    style="font-size: 11px; fill: #666; pointer-events: none;"
                  >
                    {e.label}
                  </text>
                )
              }}
            </g>
          )
        }}
      </For>
      {/*
        Live connection-drawing path. Reactive accessors thunk into
        connectionState() so the in-progress connection line follows
        the cursor without re-mounting the parent svg.
      */}
      {() => {
        const conn = connectionState()
        if (!conn.active) return null
        return (
          <path
            d={
              getEdgePath(
                'bezier',
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
        )
      }}
    </svg>
  )
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

  // <For> keys nodes by id and runs the children function exactly
  // ONCE per id — never re-mounts existing nodes when the underlying
  // signal updates with a new array (which happens on every position
  // change, every selection toggle, every data mutation).
  //
  // Inside the children function, all per-node state (position,
  // data, class, selection, drag) is read via accessors that
  // re-read `instance.nodes()` from inside their own scope. The
  // accessors track reactively, so individual style/class/text
  // thunks patch in place — but the wrapper div and the user's
  // custom NodeComponent both mount exactly once per id and never
  // re-mount across the lifetime of the graph.
  //
  // Before the For-based rewrite, the outer loop did
  // `nodes.map(node => ...)` which re-emitted every wrapper VNode
  // on every nodes signal update — re-mounting all custom node
  // components on every drag tick (60+ remounts/sec per node) and
  // every selection click. The `For` swap fixes both cases.
  return () => (
    <For each={() => instance.nodes()} by={(n: FlowNode) => n.id}>
      {(initialNode: FlowNode) => {
        const id = initialNode.id

        // Reactive node accessor — reads the LIVE node by id from
        // `instance.nodes()` so position/data/class/style updates
        // propagate without re-mounting. The fallback to
        // `initialNode` covers the brief window between an
        // updateNode call that removes the node and the For loop
        // catching up.
        const node = (): FlowNode => {
          const all = instance.nodes()
          return all.find((n) => n.id === id) ?? initialNode
        }

        const isSelected = (): boolean => instance.selectedNodes().includes(id)
        const isDragging = (): boolean => draggingNodeId() === id

        const NodeComponent =
          (initialNode.type && nodeTypes[initialNode.type]) || nodeTypes.default!

        return (
          <div
            class={() => {
              const n = node()
              return `pyreon-flow-node ${n.class ?? ''} ${
                isSelected() ? 'selected' : ''
              } ${isDragging() ? 'dragging' : ''}`
            }}
            style={() => {
              const n = node()
              return `position: absolute; transform: translate(${n.position.x}px, ${n.position.y}px); z-index: ${
                isDragging() ? 1000 : isSelected() ? 100 : 0
              }; ${n.style ?? ''}`
            }}
            data-nodeid={id}
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              instance.selectNode(id, e.shiftKey)
              instance._emit.nodeClick(node())
            }}
            onDblClick={(e: MouseEvent) => {
              e.stopPropagation()
              instance._emit.nodeDoubleClick(node())
            }}
            onPointerDown={(e: PointerEvent) => {
              // Check if clicking a handle
              const target = e.target as HTMLElement
              const handle = target.closest('.pyreon-flow-handle')
              if (handle) {
                const hType = handle.getAttribute('data-handletype') ?? 'source'
                const hId = handle.getAttribute('data-handleid') ?? 'source'
                const hPos =
                  (handle.getAttribute('data-handleposition') as Position) ?? Position.Right
                onHandlePointerDown(e, id, hType, hId, hPos)
                return
              }
              // Otherwise start dragging node — read live state
              const n = node()
              if (n.draggable !== false && instance.config.nodesDraggable !== false) {
                onNodePointerDown(e, n)
              }
            }}
          >
            <NodeComponent
              id={id}
              data={() => node().data}
              selected={isSelected}
              dragging={isDragging}
            />
          </div>
        )
      }}
    </For>
  )
}

// ─── Flow Component ──────────────────────────────────────────────────────────

/**
 * Props passed to custom edge components registered via
 * `<Flow edgeTypes={...}>`.
 *
 * The `edge` field is a stable reference (the edge id is the keyed
 * identity). Everything else is a reactive accessor: source/target
 * coordinates re-evaluate when either endpoint node moves, and
 * `selected` re-evaluates when the edge selection changes. Read
 * inside reactive scopes (JSX expression thunks, `effect()`,
 * `computed()`) so the edge patches in place — each custom edge
 * component mounts EXACTLY ONCE per id across the lifetime of the
 * graph.
 */
export type EdgeComponentProps = {
  edge: FlowEdge
  /** Reactive accessor — re-evaluates when source node position changes */
  sourceX: () => number
  /** Reactive accessor — re-evaluates when source node position changes */
  sourceY: () => number
  /** Reactive accessor — re-evaluates when target node position changes */
  targetX: () => number
  /** Reactive accessor — re-evaluates when target node position changes */
  targetY: () => number
  /** Reactive accessor — re-evaluates when edge selection changes */
  selected: () => boolean
}

type EdgeTypeMap = Record<string, (props: EdgeComponentProps) => VNodeChild>

export interface FlowComponentProps {
  /**
   * The flow instance. Typed as `FlowInstance<any>` rather than a
   * generic on the component itself because Pyreon JSX components
   * cannot be parameterised at the call site (`<Flow<MyData> />` is
   * not valid JSX). Typed consumers create `FlowInstance<MyData>`
   * via `createFlow<MyData>(...)`, then pass it here without
   * needing to cast.
   */
  instance: FlowInstance<any>
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
  // `let` (not `const`) is critical here — Pyreon's compiler inlines
  // `const` props-derived values at JSX use sites as reactive accessors
  // (see CLAUDE.md "Reactive props inlining"). `nodeTypes` looks
  // props-derived because it spreads `props.nodeTypes`, so a `const`
  // would compile to `nodeTypes={() => ({...spread})}` at the
  // `<NodeRenderer nodeTypes={...} />` call site. NodeRenderer
  // destructures the prop expecting an object; with `const` it gets
  // a function literal, `Object.keys` returns `[]`, and every node
  // resolves to undefined NodeComponent → `<undefined>` vnode →
  // SSR crash in `runtime-server`'s `isVoidElement`. `let` opts out
  // of the inlining heuristic; the value is captured statically.
  // eslint-disable-next-line prefer-const
  let nodeTypes: NodeTypeMap = {
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

  const draggingNodeId = () => (dragState().active ? dragState().nodeId : '')

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

    const container = (e.currentTarget as HTMLElement).closest('.pyreon-flow') as HTMLElement
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

    const container = (e.target as HTMLElement).closest('.pyreon-flow') as HTMLElement
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
    if (target.closest('.pyreon-flow-node')) return
    if (target.closest('.pyreon-flow-handle')) return

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
      const handle = target.closest('.pyreon-flow-handle')
      if (handle) {
        const targetNodeId = handle.closest('.pyreon-flow-node')?.getAttribute('data-nodeid') ?? ''
        const targetHandleId = handle.getAttribute('data-handleid') ?? 'target'

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
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      instance.pushHistory()
      instance.deleteSelected()
    }
    if (e.key === 'Escape') {
      instance.clearSelection()
      connectionState.set({ ...emptyConnection })
    }
    if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      instance.selectAll()
    }
    if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
      instance.copySelected()
    }
    if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
      instance.paste()
    }
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault()
      instance.undo()
    }
    if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
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

  const containerStyle = `position: relative; width: 100%; height: 100%; overflow: hidden; outline: none; touch-action: none; ${props.style ?? ''}`

  return (
    <div
      ref={containerRef}
      class={`pyreon-flow ${props.class ?? ''}`}
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
