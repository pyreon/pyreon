package com.pyreon.runtime

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// PyreonFlowState — the Android-native port of @pyreon/flow's dependency-free
// `createFlow`. Same node/edge/viewport/selection behaviour as the
// TypeScript AND Swift engines (`flow.ts` / `PyreonFlowState.swift`), so a
// diagram author gets 1:1 results on web, iOS, and Android from one mental
// model. See `PyreonFlowState.swift`'s header for the full v1 scope note
// (what's covered, what's a documented follow-up) — identical here.
//
// Compose-observable state so a mutation recomposes a reader — but NOT one
// `mutableStateOf(List)` per collection the way v1 (and `PyreonTableState`)
// did. A whole-list replacement per drag frame recomposes every reader of the
// list and allocates an N-reference list per pointer-move event (~80 KB of
// garbage per event at N = 10,000). Nodes live in a `mutableStateMapOf` keyed
// by id (per-KEY snapshot state: a position write recomposes only the readers
// of that key — the web engine's O(1 + deg) fan-out) with a
// `mutableStateListOf` preserving insertion order; `nodes` is derived.
// Selection is an insertion-ordered list PAIRED with a per-key map for O(1)
// membership, so `isNodeSelected(id)` in a node composable subscribes to that
// id alone instead of scanning a K-element list on every recomposition.
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
    val draggable: Boolean? = null,
    val selectable: Boolean? = null,
    val connectable: Boolean? = null,
    val focusable: Boolean? = null,
    val ariaLabel: String? = null,
    val hidden: Boolean? = null,
    val deletable: Boolean? = null,
    val parentId: String? = null,
    val expandParent: Boolean? = null,
    val group: Boolean? = null,
    val sourceHandles: List<PyreonFlowHandleConfig> = emptyList(),
    val targetHandles: List<PyreonFlowHandleConfig> = emptyList(),
)

data class PyreonFlowMarker(
    val type: String,
    val color: String? = null,
    val width: Double = 10.0,
    val height: Double = 7.0,
    val strokeWidth: Double = 1.0,
)

/** An edge — mirrors `FlowEdge`'s core fields, including editable waypoints. */
data class PyreonFlowEdge(
    val id: String,
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
    val targetHandle: String? = null,
    val type: String? = null,
    val label: String? = null,
    val animated: Boolean = false,
    val animatedSpecified: Boolean = animated,
    val focusable: Boolean? = null,
    val ariaLabel: String? = null,
    val hidden: Boolean? = null,
    val deletable: Boolean? = null,
    val reconnectable: Boolean? = null,
    val interactionWidth: Double? = null,
    val curvature: Double? = null,
    val borderRadius: Double? = null,
    val pathOffset: Double? = null,
    val markerStart: PyreonFlowMarker? = null,
    val markerEnd: PyreonFlowMarker? = null,
    val markerEndSpecified: Boolean = false,
    val waypoints: List<PyreonXYPosition> = emptyList(),
)

data class PyreonFlowDefaultEdgeOptions(
    val type: String? = null, val label: String? = null, val animated: Boolean? = null,
    val focusable: Boolean? = null, val ariaLabel: String? = null, val hidden: Boolean? = null,
    val deletable: Boolean? = null, val reconnectable: Boolean? = null, val interactionWidth: Double? = null,
    val curvature: Double? = null, val borderRadius: Double? = null, val pathOffset: Double? = null,
    val markerStart: PyreonFlowMarker? = null, val markerEnd: PyreonFlowMarker? = null, val markerEndSpecified: Boolean = false,
)

data class PyreonFlowConnection(
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
    val targetHandle: String? = null,
)

/** Default node box when a node declares no explicit width/height — the SAME
 *  `150x40` fallback `DEFAULT_NODE_WIDTH`/`DEFAULT_NODE_HEIGHT` use on web. */
const val PYREON_FLOW_DEFAULT_NODE_WIDTH: Double = 150.0
const val PYREON_FLOW_DEFAULT_NODE_HEIGHT: Double = 40.0

/** The web `normalizeEdge` default — `type ?? 'bezier'` (`flow.ts`). */
const val PYREON_FLOW_DEFAULT_EDGE_TYPE: String = "bezier"

/** A container's measured pixel size — written by the hosting composable's
 *  own `onSizeChanged`, mirroring the web `containerSize` signal. */
data class PyreonFlowContainerSize(val width: Double = 0.0, val height: Double = 0.0)
data class PyreonFlowNodeExtent(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double)

/** Reactive flow-diagram state: nodes, edges, viewport, selection. Behaviour-
 *  identical to the TS/Swift engines for the v1 surface. See the file header
 *  for the storage/observation contract. */
class PyreonFlowState<T>(
    nodes: List<PyreonFlowNode<T>> = emptyList(),
    edges: List<PyreonFlowEdge> = emptyList(),
    viewport: PyreonFlowViewport = PyreonFlowViewport(),
    private val minZoom: Double = 0.1,
    private val maxZoom: Double = 4.0,
    private val snapToGrid: Boolean = false,
    private val snapGrid: Double = 15.0,
    nodeExtent: PyreonFlowNodeExtent? = null,
    private val connectionRules: Map<String, List<String>>? = null,
    val defaultMarkerEnd: PyreonFlowMarker? = PyreonFlowMarker("arrowclosed"),
    val nodesDraggable: Boolean = true,
    val nodesConnectable: Boolean = true,
    val nodesSelectable: Boolean = true,
    val nodesFocusable: Boolean = true,
    val edgesFocusable: Boolean = true,
    val nodesDeletable: Boolean = true,
    val edgesDeletable: Boolean = true,
    val edgesReconnectable: Boolean = true,
    val edgeInteractionWidth: Double = 20.0,
    connectionRadius: Double = 0.0,
    val pannable: Boolean = true,
    val zoomable: Boolean = true,
    val multiSelect: Boolean = true,
    val defaultEdgeType: String = PYREON_FLOW_DEFAULT_EDGE_TYPE,
    val defaultEdgeOptions: PyreonFlowDefaultEdgeOptions = PyreonFlowDefaultEdgeOptions(),
    val fitViewOnLoad: Boolean = false,
    fitViewPadding: Double = 0.1,
    private val connectionValidator: ((PyreonFlowConnection) -> Boolean)? = null,
) {
    val connectionRadius: Double = maxOf(0.0, connectionRadius)
    val fitViewPadding: Double = maxOf(0.0, fitViewPadding)
    private var nodeExtent: PyreonFlowNodeExtent? = nodeExtent
    private val order = mutableStateListOf<String>()
    private val nodeMap = mutableStateMapOf<String, PyreonFlowNode<T>>()
    /** Every node in insertion order. Derived from the per-id map — reading it
     *  subscribes to EVERY node (use [getNode] in per-node composables). */
    val nodes: List<PyreonFlowNode<T>>
        get() = order.map { nodeMap.getValue(it) }

    private var _edges by mutableStateOf<List<PyreonFlowEdge>>(emptyList())
    val edges: List<PyreonFlowEdge>
        get() = _edges
    private val edgeIds = mutableStateMapOf<String, Unit>()

    private var _viewport by mutableStateOf(viewport)
    val viewport: PyreonFlowViewport
        get() = _viewport

    /** Written by the hosting composable's own size measurement — see the file header. */
    var containerSize: PyreonFlowContainerSize by mutableStateOf(PyreonFlowContainerSize())

    private val selectedNodeIdList = mutableStateListOf<String>()
    private val selectedNodeIdSet = mutableStateMapOf<String, Unit>()
    private val selectedEdgeIdList = mutableStateListOf<String>()
    private val selectedEdgeIdSet = mutableStateMapOf<String, Unit>()

    init {
        for (node in nodes) insertNode(node)
        for (edge in edges) insertEdge(edge)
    }

    /** Current zoom factor — `viewport.zoom`, exposed the same way the web
     *  `zoom: Computed<number>` is: a derived read, no independent storage. */
    val zoom: Double
        get() = _viewport.zoom

    // ── storage primitives (the web engine's `nodeMap`/`edgeMap`, kept in sync) ──
    private fun insertNode(node: PyreonFlowNode<T>) {
        if (nodeMap.containsKey(node.id)) return
        nodeMap[node.id] = node
        order.add(node.id)
    }
    /** Applies the web `normalizeEdge` default (`type ?: "bezier"`); dedupes by id. */
    private fun insertEdge(edge: PyreonFlowEdge) {
        if (edgeIds.containsKey(edge.id)) return
        val e = edge.copy(
            type = edge.type ?: defaultEdgeOptions.type ?: defaultEdgeType,
            label = edge.label ?: defaultEdgeOptions.label,
            animated = if (edge.animatedSpecified) edge.animated else defaultEdgeOptions.animated ?: edge.animated,
            focusable = edge.focusable ?: defaultEdgeOptions.focusable,
            ariaLabel = edge.ariaLabel ?: defaultEdgeOptions.ariaLabel,
            hidden = edge.hidden ?: defaultEdgeOptions.hidden,
            deletable = edge.deletable ?: defaultEdgeOptions.deletable,
            reconnectable = edge.reconnectable ?: defaultEdgeOptions.reconnectable,
            interactionWidth = edge.interactionWidth ?: defaultEdgeOptions.interactionWidth,
            curvature = edge.curvature ?: defaultEdgeOptions.curvature,
            borderRadius = edge.borderRadius ?: defaultEdgeOptions.borderRadius,
            pathOffset = edge.pathOffset ?: defaultEdgeOptions.pathOffset,
            markerStart = edge.markerStart ?: defaultEdgeOptions.markerStart,
            markerEnd = if (edge.markerEndSpecified) edge.markerEnd else defaultEdgeOptions.markerEnd,
            markerEndSpecified = edge.markerEndSpecified || defaultEdgeOptions.markerEndSpecified,
        )
        _edges = _edges + e
        edgeIds[e.id] = Unit
    }
    private fun removeEdges(shouldRemove: (PyreonFlowEdge) -> Boolean) {
        val keep = ArrayList<PyreonFlowEdge>(_edges.size)
        var removedAny = false
        for (edge in _edges) {
            if (shouldRemove(edge)) {
                removedAny = true
                edgeIds.remove(edge.id)
                if (selectedEdgeIdSet.remove(edge.id) != null) selectedEdgeIdList.remove(edge.id)
            } else {
                keep.add(edge)
            }
        }
        if (removedAny) _edges = keep
    }
    private fun removeNodes(ids: Set<String>) {
        if (ids.isEmpty()) return
        order.removeAll { ids.contains(it) }
        for (id in ids) nodeMap.remove(id)
        var touchedSelection = false
        for (id in ids) if (selectedNodeIdSet.remove(id) != null) touchedSelection = true
        if (touchedSelection) selectedNodeIdList.removeAll { ids.contains(it) }
        removeEdges { ids.contains(it.source) || ids.contains(it.target) }
    }

    // ── node operations ─────────────────────────────────────────────────────
    /** O(1). Reading it in a composable subscribes to THIS node only. */
    fun getNode(id: String): PyreonFlowNode<T>? = nodeMap[id]
    fun addNode(node: PyreonFlowNode<T>) {
        insertNode(node)
    }
    fun addNodes(nodes: List<PyreonFlowNode<T>>) {
        for (node in nodes) insertNode(node)
    }
    fun setNodes(nodes: List<PyreonFlowNode<T>>) {
        val nextIds = nodes.mapTo(HashSet()) { it.id }
        order.clear()
        nodeMap.clear()
        for (node in nodes) insertNode(node)
        setNodeSelection(selectedNodeIdList.filter { nextIds.contains(it) })
        removeEdges { !nextIds.contains(it.source) || !nextIds.contains(it.target) }
    }
    /** Removes the node AND every edge connected to it (source or target). */
    fun removeNode(id: String) {
        if (!nodeMap.containsKey(id)) return
        removeNodes(setOf(id))
    }
    fun removeNodes(ids: List<String>) = removeNodes(ids.toSet())
    /** O(1); recomposes only the readers of this node. */
    fun updateNodePosition(id: String, position: PyreonXYPosition) {
        val node = nodeMap[id] ?: return
        val snapped = if (snapToGrid && snapGrid != 0.0) PyreonXYPosition(
            kotlin.math.floor(position.x / snapGrid + 0.5) * snapGrid,
            kotlin.math.floor(position.y / snapGrid + 0.5) * snapGrid,
        ) else position
        nodeMap[id] = node.copy(position = clampToExtent(snapped, node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT))
    }
    fun setNodeExtent(minX: Double, minY: Double, maxX: Double, maxY: Double) {
        nodeExtent = PyreonFlowNodeExtent(minX, minY, maxX, maxY)
    }
    fun clearNodeExtent() { nodeExtent = null }
    @JvmOverloads
    fun clampToExtent(position: PyreonXYPosition, nodeWidth: Double = PYREON_FLOW_DEFAULT_NODE_WIDTH, nodeHeight: Double = PYREON_FLOW_DEFAULT_NODE_HEIGHT): PyreonXYPosition {
        val extent = nodeExtent ?: return position
        return PyreonXYPosition(
            x = kotlin.math.min(kotlin.math.max(position.x, extent.minX), extent.maxX - nodeWidth),
            y = kotlin.math.min(kotlin.math.max(position.y, extent.minY), extent.maxY - nodeHeight),
        )
    }

    // ── edge operations ─────────────────────────────────────────────────────
    fun getEdge(id: String): PyreonFlowEdge? =
        if (edgeIds.containsKey(id)) _edges.firstOrNull { it.id == id } else null
    fun resolvedMarkers(edge: PyreonFlowEdge): Pair<PyreonFlowMarker?, PyreonFlowMarker?> =
        edge.markerStart to if (edge.markerEndSpecified) edge.markerEnd else defaultMarkerEnd
    fun isValidConnection(connection: PyreonFlowConnection): Boolean {
        if (connectionValidator?.invoke(connection) == false) return false
        val rules = connectionRules ?: return true
        val source = nodeMap[connection.source] ?: return false
        val outputs = rules[source.type ?: "default"] ?: return true
        val target = nodeMap[connection.target] ?: return false
        return outputs.contains(target.type ?: "default")
    }
    fun connect(connection: PyreonFlowConnection, id: String? = null): PyreonFlowEdge? {
        if (!isValidConnection(connection)) return null
        val edge = PyreonFlowEdge(
            id = id ?: "edge-${java.util.UUID.randomUUID().toString().lowercase()}",
            source = connection.source,
            target = connection.target,
            sourceHandle = connection.sourceHandle,
            targetHandle = connection.targetHandle,
        )
        if (edgeIds.containsKey(edge.id)) return null
        insertEdge(edge)
        return getEdge(edge.id)
    }
    /** Adds the edge unless an edge with the same `id` already exists — same
     *  dedupe-by-id contract as the web `addEdge`; applies `type ?: "bezier"`. */
    fun addEdge(edge: PyreonFlowEdge) {
        insertEdge(edge)
    }
    fun addEdges(edges: List<PyreonFlowEdge>) {
        for (edge in edges) insertEdge(edge)
    }
    fun setEdges(edges: List<PyreonFlowEdge>) {
        _edges = emptyList()
        edgeIds.clear()
        for (edge in edges) insertEdge(edge)
        setEdgeSelection(selectedEdgeIdList.filter { edgeIds.containsKey(it) })
    }
    fun removeEdge(id: String) {
        if (!edgeIds.containsKey(id)) return
        removeEdges { it.id == id }
    }
    fun reconnectEdge(id: String, source: String? = null, target: String? = null, sourceHandle: String? = null, targetHandle: String? = null) {
        val i = _edges.indexOfFirst { it.id == id }
        if (i < 0) return
        val edge = _edges[i]
        _edges = _edges.toMutableList().also { it[i] = edge.copy(
            source = source ?: edge.source,
            target = target ?: edge.target,
            sourceHandle = sourceHandle ?: edge.sourceHandle,
            targetHandle = targetHandle ?: edge.targetHandle,
        ) }
    }
    fun reconnectEdge(id: String, connection: PyreonFlowConnection): Boolean {
        if (!isValidConnection(connection)) return false
        val i = _edges.indexOfFirst { it.id == id }
        if (i < 0) return false
        val edge = _edges[i]
        _edges = _edges.toMutableList().also { it[i] = edge.copy(source = connection.source, target = connection.target, sourceHandle = connection.sourceHandle, targetHandle = connection.targetHandle) }
        return true
    }
    @JvmOverloads
    fun addEdgeWaypoint(edgeId: String, point: PyreonXYPosition, index: Int? = null) {
        val i = _edges.indexOfFirst { it.id == edgeId }
        if (i < 0) return
        val points = _edges[i].waypoints.toMutableList()
        val insertionIndex = when {
            index == null -> points.size
            index < 0 -> (points.size + index).coerceAtLeast(0)
            else -> index.coerceAtMost(points.size)
        }
        points.add(insertionIndex, point)
        _edges = _edges.toMutableList().also { it[i] = it[i].copy(waypoints = points) }
    }
    fun removeEdgeWaypoint(edgeId: String, index: Int) {
        val i = _edges.indexOfFirst { it.id == edgeId }
        if (i < 0) return
        val removalIndex = if (index < 0) (_edges[i].waypoints.size + index).coerceAtLeast(0) else index
        if (removalIndex !in _edges[i].waypoints.indices) return
        val points = _edges[i].waypoints.toMutableList().also { it.removeAt(removalIndex) }
        _edges = _edges.toMutableList().also { it[i] = it[i].copy(waypoints = points) }
    }
    fun updateEdgeWaypoint(edgeId: String, index: Int, point: PyreonXYPosition) {
        val i = _edges.indexOfFirst { it.id == edgeId }
        if (i < 0 || index !in _edges[i].waypoints.indices) return
        val points = _edges[i].waypoints.toMutableList().also { it[index] = point }
        _edges = _edges.toMutableList().also { it[i] = it[i].copy(waypoints = points) }
    }
    fun removeEdges(ids: List<String>) {
        val gone = ids.toSet()
        if (gone.isNotEmpty()) removeEdges { gone.contains(it.id) }
    }

    // ── selection ────────────────────────────────────────────────────────────
    // Selecting a node NON-additively clears edge selection, and vice versa.
    fun isNodeSelected(id: String): Boolean = selectedNodeIdSet.containsKey(id)
    fun isEdgeSelected(id: String): Boolean = selectedEdgeIdSet.containsKey(id)
    /** Insertion order — the same order the web `Set` iterates. */
    fun selectedNodes(): List<String> = selectedNodeIdList.toList()
    fun selectedEdges(): List<String> = selectedEdgeIdList.toList()

    private fun setNodeSelection(ids: List<String>) {
        selectedNodeIdList.clear()
        selectedNodeIdSet.clear()
        for (id in ids) {
            if (selectedNodeIdSet.put(id, Unit) == null) selectedNodeIdList.add(id)
        }
    }
    private fun setEdgeSelection(ids: List<String>) {
        selectedEdgeIdList.clear()
        selectedEdgeIdSet.clear()
        for (id in ids) {
            if (selectedEdgeIdSet.put(id, Unit) == null) selectedEdgeIdList.add(id)
        }
    }

    @JvmOverloads
    fun selectNode(id: String, additive: Boolean = false) {
        if (additive && multiSelect) {
            if (selectedNodeIdSet.put(id, Unit) == null) selectedNodeIdList.add(id)
        } else {
            setNodeSelection(listOf(id))
            setEdgeSelection(emptyList())
        }
    }
    @JvmOverloads
    fun selectNodes(ids: List<String>, additive: Boolean = false) {
        if (additive && multiSelect) {
            for (id in ids) if (selectedNodeIdSet.put(id, Unit) == null) selectedNodeIdList.add(id)
        } else {
            setNodeSelection(ids.distinct())
            setEdgeSelection(emptyList())
        }
    }
    fun deselectNode(id: String) {
        if (selectedNodeIdSet.remove(id) != null) selectedNodeIdList.remove(id)
    }
    @JvmOverloads
    fun selectEdge(id: String, additive: Boolean = false) {
        if (additive && multiSelect) {
            if (selectedEdgeIdSet.put(id, Unit) == null) selectedEdgeIdList.add(id)
        } else {
            setEdgeSelection(listOf(id))
            setNodeSelection(emptyList())
        }
    }
    fun clearSelection() {
        setNodeSelection(emptyList())
        setEdgeSelection(emptyList())
    }
    /** Selects every node. Edge selection is LEFT ALONE — the web `selectAll`
     *  (`flow.ts`) only replaces the node set; v1 of both native ports also
     *  cleared the edge set, a divergence the tests locked in by omission. */
    fun selectAll() {
        setNodeSelection(order.toList())
    }
    /** Removes every currently-selected node (and its connected edges) and
     *  every currently-selected edge — the SAME net effect AND the same
     *  single-pass shape as the web `deleteSelected` (`flow.ts`): selection
     *  sets are built ONCE and each collection scanned ONCE, O(N + E). */
    fun deleteSelected() {
        val nodeIdsToRemove = selectedNodeIdList.filterTo(mutableSetOf()) { id -> nodeMap[id]?.let { it.deletable ?: nodesDeletable } == true }
        val edgeIdsToRemove = selectedEdgeIdList.filterTo(mutableSetOf()) { id -> _edges.firstOrNull { it.id == id }?.let { it.deletable ?: edgesDeletable } == true }
        if (nodeIdsToRemove.isNotEmpty()) {
            removeNodes(nodeIdsToRemove)
            if (edgeIdsToRemove.isNotEmpty()) removeEdges { edgeIdsToRemove.contains(it.id) }
        } else if (edgeIdsToRemove.isNotEmpty()) {
            removeEdges { edgeIdsToRemove.contains(it.id) }
        }
        setNodeSelection(emptyList())
        setEdgeSelection(emptyList())
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
    @JvmOverloads
    fun setViewport(x: Double? = null, y: Double? = null, zoom: Double? = null) {
        _viewport = PyreonFlowViewport(
            x = x ?: _viewport.x,
            y = y ?: _viewport.y,
            zoom = zoom ?: _viewport.zoom,
        )
    }
    @JvmOverloads
    fun setCenter(x: Double, y: Double, zoom: Double? = null) {
        val z = (zoom ?: _viewport.zoom).coerceIn(minZoom, maxZoom)
        setViewport(x = -x * z + containerSize.width / 2, y = -y * z + containerSize.height / 2, zoom = z)
    }
    fun screenToFlowPosition(position: PyreonXYPosition): PyreonXYPosition = PyreonXYPosition(
        x = (position.x - _viewport.x) / _viewport.zoom,
        y = (position.y - _viewport.y) / _viewport.zoom,
    )
    fun flowToScreenPosition(position: PyreonXYPosition): PyreonXYPosition = PyreonXYPosition(
        x = position.x * _viewport.zoom + _viewport.x,
        y = position.y * _viewport.zoom + _viewport.y,
    )
    fun isNodeVisible(id: String): Boolean {
        val node = nodeMap[id] ?: return false
        val x = node.position.x * _viewport.zoom + _viewport.x
        val y = node.position.y * _viewport.zoom + _viewport.y
        val width = (node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH) * _viewport.zoom
        val height = (node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) * _viewport.zoom
        return x + width > 0 && x < containerSize.width && y + height > 0 && y < containerSize.height
    }
    /** Frames every node (or just [nodeIds], when given) inside the current
     *  `containerSize`, with [padding] as a fraction of the graph's extent on
     *  each axis (default `0.1`, matching the web `fitViewPadding` default). */
    @JvmOverloads
    fun fitView(nodeIds: List<String>? = null, padding: Double = 0.1) {
        val cw = containerSize.width
        val ch = containerSize.height
        if (cw <= 0 || ch <= 0) return
        // A bounding box needs no order: walk the map's values directly (no
        // per-node key lookup) unless a subset was named.
        val target: Collection<PyreonFlowNode<T>> =
            if (nodeIds != null) nodeIds.mapNotNull { nodeMap[it] } else nodeMap.values
        if (target.isEmpty()) return

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
    /** Nodes with an edge INTO [nodeId], in node insertion order (web parity). */
    fun getIncomers(nodeId: String): List<PyreonFlowNode<T>> {
        val sourceIds = _edges.filter { it.target == nodeId }.map { it.source }.toSet()
        return order.filter { sourceIds.contains(it) }.map { nodeMap.getValue(it) }
    }
    fun getOutgoers(nodeId: String): List<PyreonFlowNode<T>> {
        val targetIds = _edges.filter { it.source == nodeId }.map { it.target }.toSet()
        return order.filter { targetIds.contains(it) }.map { nodeMap.getValue(it) }
    }
    fun getChildNodes(parentId: String): List<PyreonFlowNode<T>> =
        order.mapNotNull { nodeMap[it] }.filter { it.parentId == parentId }
    fun getAbsolutePosition(nodeId: String): PyreonXYPosition {
        fun walk(id: String, seen: MutableSet<String>): PyreonXYPosition {
            val node = nodeMap[id] ?: return PyreonXYPosition(0.0, 0.0)
            val parentId = node.parentId
            if (parentId == null || parentId == id) return node.position
            if (!seen.add(id)) return node.position
            val parent = walk(parentId, seen)
            return PyreonXYPosition(parent.x + node.position.x, parent.y + node.position.y)
        }
        return walk(nodeId, mutableSetOf())
    }
    fun moveSelectedNodes(dx: Double, dy: Double) {
        for (id in selectedNodeIdList.toList()) {
            val node = nodeMap[id] ?: continue
            updateNodePosition(id, PyreonXYPosition(node.position.x + dx, node.position.y + dy))
        }
    }
    @JvmOverloads
    fun focusNode(nodeId: String, focusZoom: Double? = null) {
        val node = nodeMap[nodeId] ?: return
        val position = if (node.parentId == null) node.position else getAbsolutePosition(nodeId)
        val z = (focusZoom ?: _viewport.zoom).coerceIn(minZoom, maxZoom)
        val centerX = position.x + (node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH) / 2
        val centerY = position.y + (node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) / 2
        _viewport = PyreonFlowViewport(-centerX * z + containerSize.width / 2, -centerY * z + containerSize.height / 2, z)
        selectNode(nodeId)
    }
}
