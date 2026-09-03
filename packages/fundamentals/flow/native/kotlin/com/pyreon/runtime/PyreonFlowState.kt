package com.pyreon.runtime

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// PyreonFlowState — the Android-native port of @pyreon/flow's dependency-free
// `createFlow`. Same node/edge/viewport/selection behaviour as the
// TypeScript AND Swift engines (`flow.ts` / `PyreonFlowState.swift`), so a
// diagram author gets 1:1 results on web, iOS, and Android from one mental
// model. See `PyreonFlowState.swift`'s header for the full v1 scope note
// (what's covered, what's a documented follow-up) — identical here.
//
// Compose-observable state (direct `mutableStateOf` backing, like
// `PyreonTableState`/`PyreonMachine`) so a mutation recomposes a reader.
// `createFlow({ nodes, edges })` OWNS its data (unlike table, which wraps an
// external source), so — same as Swift — no post-construction wiring dance:
// the constructor is fully self-contained.

/** A 2D point in flow (unscaled diagram) coordinates. */
data class PyreonXYPosition(val x: Double, val y: Double)

/** Pan/zoom state — mirrors the web `Viewport`. */
data class PyreonFlowViewport(val x: Double = 0.0, val y: Double = 0.0, val zoom: Double = 1.0)

/** A node — generic over [T], the user's `data` payload (mirrors `FlowNode<TData>`). */
data class PyreonFlowNode<T>(
    val id: String,
    val type: String? = null,
    val position: PyreonXYPosition,
    val data: T,
    val width: Double? = null,
    val height: Double? = null,
)

/** An edge — mirrors `FlowEdge`'s core (non-marker/waypoint) fields. */
data class PyreonFlowEdge(
    val id: String,
    val source: String,
    val target: String,
    val type: String? = null,
    val label: String? = null,
    val animated: Boolean = false,
)

/** Default node box when a node declares no explicit width/height — the SAME
 *  `150x40` fallback `DEFAULT_NODE_WIDTH`/`DEFAULT_NODE_HEIGHT` use on web. */
const val PYREON_FLOW_DEFAULT_NODE_WIDTH: Double = 150.0
const val PYREON_FLOW_DEFAULT_NODE_HEIGHT: Double = 40.0

/** A container's measured pixel size — written by the hosting composable's
 *  own `onSizeChanged`, mirroring the web `containerSize` signal. */
data class PyreonFlowContainerSize(val width: Double = 0.0, val height: Double = 0.0)

/** Reactive flow-diagram state: nodes, edges, viewport, selection. Behaviour-
 *  identical to the TS/Swift engines for the v1 surface. */
class PyreonFlowState<T>(
    nodes: List<PyreonFlowNode<T>> = emptyList(),
    edges: List<PyreonFlowEdge> = emptyList(),
    viewport: PyreonFlowViewport = PyreonFlowViewport(),
    private val minZoom: Double = 0.1,
    private val maxZoom: Double = 4.0,
) {
    private var _nodes by mutableStateOf(nodes)
    val nodes: List<PyreonFlowNode<T>>
        get() = _nodes

    private var _edges by mutableStateOf(edges)
    val edges: List<PyreonFlowEdge>
        get() = _edges

    private var _viewport by mutableStateOf(viewport)
    val viewport: PyreonFlowViewport
        get() = _viewport

    /** Written by the hosting composable's own size measurement — see the file header. */
    var containerSize: PyreonFlowContainerSize by mutableStateOf(PyreonFlowContainerSize())

    private var selectedNodeIdList by mutableStateOf<List<String>>(emptyList())
    private var selectedEdgeIdList by mutableStateOf<List<String>>(emptyList())

    /** Current zoom factor — `viewport.zoom`, exposed the same way the web
     *  `zoom: Computed<number>` is: a derived read, no independent storage. */
    val zoom: Double
        get() = _viewport.zoom

    // ── node operations ─────────────────────────────────────────────────────
    fun getNode(id: String): PyreonFlowNode<T>? = _nodes.firstOrNull { it.id == id }
    fun addNode(node: PyreonFlowNode<T>) {
        _nodes = _nodes + node
    }
    /** Removes the node AND every edge connected to it (source or target). */
    fun removeNode(id: String) {
        _nodes = _nodes.filter { it.id != id }
        _edges = _edges.filter { it.source != id && it.target != id }
        selectedNodeIdList = selectedNodeIdList.filter { it != id }
    }
    fun updateNodePosition(id: String, position: PyreonXYPosition) {
        _nodes = _nodes.map { if (it.id == id) it.copy(position = position) else it }
    }

    // ── edge operations ─────────────────────────────────────────────────────
    fun getEdge(id: String): PyreonFlowEdge? = _edges.firstOrNull { it.id == id }
    /** Adds the edge unless an edge with the same `id` already exists — same
     *  dedupe-by-id contract as the web `addEdge`. */
    fun addEdge(edge: PyreonFlowEdge) {
        if (_edges.any { it.id == edge.id }) return
        _edges = _edges + edge
    }
    fun removeEdge(id: String) {
        _edges = _edges.filter { it.id != id }
        selectedEdgeIdList = selectedEdgeIdList.filter { it != id }
    }

    // ── selection ────────────────────────────────────────────────────────────
    // Selecting a node NON-additively clears edge selection, and vice versa.
    fun isNodeSelected(id: String): Boolean = selectedNodeIdList.contains(id)
    fun isEdgeSelected(id: String): Boolean = selectedEdgeIdList.contains(id)
    fun selectedNodes(): List<String> = selectedNodeIdList
    fun selectedEdges(): List<String> = selectedEdgeIdList

    @JvmOverloads
    fun selectNode(id: String, additive: Boolean = false) {
        if (additive) {
            if (!selectedNodeIdList.contains(id)) selectedNodeIdList = selectedNodeIdList + id
        } else {
            selectedNodeIdList = listOf(id)
            selectedEdgeIdList = emptyList()
        }
    }
    fun deselectNode(id: String) {
        selectedNodeIdList = selectedNodeIdList.filter { it != id }
    }
    @JvmOverloads
    fun selectEdge(id: String, additive: Boolean = false) {
        if (additive) {
            if (!selectedEdgeIdList.contains(id)) selectedEdgeIdList = selectedEdgeIdList + id
        } else {
            selectedEdgeIdList = listOf(id)
            selectedNodeIdList = emptyList()
        }
    }
    fun clearSelection() {
        selectedNodeIdList = emptyList()
        selectedEdgeIdList = emptyList()
    }
    fun selectAll() {
        selectedNodeIdList = _nodes.map { it.id }
        selectedEdgeIdList = emptyList()
    }
    /** Removes every currently-selected node (and its connected edges) and
     *  every currently-selected edge. */
    fun deleteSelected() {
        for (id in selectedNodeIdList) removeNode(id)
        for (id in selectedEdgeIdList) removeEdge(id)
        selectedNodeIdList = emptyList()
        selectedEdgeIdList = emptyList()
    }

    // ── viewport ─────────────────────────────────────────────────────────────
    fun zoomTo(z: Double) {
        _viewport = _viewport.copy(zoom = z.coerceIn(minZoom, maxZoom))
    }
    fun zoomIn() {
        _viewport = _viewport.copy(zoom = (_viewport.zoom * 1.2).coerceAtMost(maxZoom))
    }
    fun zoomOut() {
        _viewport = _viewport.copy(zoom = (_viewport.zoom / 1.2).coerceAtLeast(minZoom))
    }
    /** Pans so [position] (in flow coordinates) lands at the viewport origin —
     *  an ABSOLUTE pan-to-point, not a relative nudge. Matches the web `panTo`. */
    fun panTo(position: PyreonXYPosition) {
        _viewport = _viewport.copy(x = -position.x * _viewport.zoom, y = -position.y * _viewport.zoom)
    }
    /** Frames every node (or just [nodeIds], when given) inside the current
     *  `containerSize`, with [padding] as a fraction of the graph's extent on
     *  each axis (default `0.1`, matching the web `fitViewPadding` default). */
    @JvmOverloads
    fun fitView(nodeIds: List<String>? = null, padding: Double = 0.1) {
        val target = if (nodeIds != null) _nodes.filter { nodeIds.contains(it.id) } else _nodes
        val cw = containerSize.width
        val ch = containerSize.height
        if (target.isEmpty() || cw <= 0 || ch <= 0) return

        var minX = Double.POSITIVE_INFINITY
        var minY = Double.POSITIVE_INFINITY
        var maxX = Double.NEGATIVE_INFINITY
        var maxY = Double.NEGATIVE_INFINITY
        for (node in target) {
            val w = node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
            val h = node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
            minX = minOf(minX, node.position.x)
            minY = minOf(minY, node.position.y)
            maxX = maxOf(maxX, node.position.x + w)
            maxY = maxOf(maxY, node.position.y + h)
        }

        val graphWidth = maxX - minX
        val graphHeight = maxY - minY
        if (graphWidth <= 0 && graphHeight <= 0) return

        val zoomX = if (graphWidth > 0) cw / (graphWidth * (1 + padding * 2)) else Double.POSITIVE_INFINITY
        val zoomY = if (graphHeight > 0) ch / (graphHeight * (1 + padding * 2)) else Double.POSITIVE_INFINITY
        val newZoom = minOf(zoomX, zoomY).coerceIn(minZoom, maxZoom)

        val centerX = (minX + maxX) / 2
        val centerY = (minY + maxY) / 2

        _viewport = PyreonFlowViewport(
            x = cw / 2 - centerX * newZoom,
            y = ch / 2 - centerY * newZoom,
            zoom = newZoom,
        )
    }

    // ── graph queries ────────────────────────────────────────────────────────
    fun getConnectedEdges(nodeId: String): List<PyreonFlowEdge> =
        _edges.filter { it.source == nodeId || it.target == nodeId }
    fun getIncomers(nodeId: String): List<PyreonFlowNode<T>> {
        val sourceIds = _edges.filter { it.target == nodeId }.map { it.source }.toSet()
        return _nodes.filter { sourceIds.contains(it.id) }
    }
    fun getOutgoers(nodeId: String): List<PyreonFlowNode<T>> {
        val targetIds = _edges.filter { it.source == nodeId }.map { it.target }.toSet()
        return _nodes.filter { targetIds.contains(it.id) }
    }
}
