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

/** The web `normalizeEdge` default — `type ?? 'bezier'` (`flow.ts`). */
const val PYREON_FLOW_DEFAULT_EDGE_TYPE: String = "bezier"

/** A container's measured pixel size — written by the hosting composable's
 *  own `onSizeChanged`, mirroring the web `containerSize` signal. */
data class PyreonFlowContainerSize(val width: Double = 0.0, val height: Double = 0.0)

/** Reactive flow-diagram state: nodes, edges, viewport, selection. Behaviour-
 *  identical to the TS/Swift engines for the v1 surface. See the file header
 *  for the storage/observation contract. */
class PyreonFlowState<T>(
    nodes: List<PyreonFlowNode<T>> = emptyList(),
    edges: List<PyreonFlowEdge> = emptyList(),
    viewport: PyreonFlowViewport = PyreonFlowViewport(),
    private val minZoom: Double = 0.1,
    private val maxZoom: Double = 4.0,
) {
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
        val e = if (edge.type == null) edge.copy(type = PYREON_FLOW_DEFAULT_EDGE_TYPE) else edge
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
    /** Removes the node AND every edge connected to it (source or target). */
    fun removeNode(id: String) {
        if (!nodeMap.containsKey(id)) return
        removeNodes(setOf(id))
    }
    /** O(1); recomposes only the readers of this node. */
    fun updateNodePosition(id: String, position: PyreonXYPosition) {
        val node = nodeMap[id] ?: return
        nodeMap[id] = node.copy(position = position)
    }

    // ── edge operations ─────────────────────────────────────────────────────
    fun getEdge(id: String): PyreonFlowEdge? =
        if (edgeIds.containsKey(id)) _edges.firstOrNull { it.id == id } else null
    /** Adds the edge unless an edge with the same `id` already exists — same
     *  dedupe-by-id contract as the web `addEdge`; applies `type ?: "bezier"`. */
    fun addEdge(edge: PyreonFlowEdge) {
        insertEdge(edge)
    }
    fun removeEdge(id: String) {
        if (!edgeIds.containsKey(id)) return
        removeEdges { it.id == id }
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
        if (additive) {
            if (selectedNodeIdSet.put(id, Unit) == null) selectedNodeIdList.add(id)
        } else {
            setNodeSelection(listOf(id))
            setEdgeSelection(emptyList())
        }
    }
    fun deselectNode(id: String) {
        if (selectedNodeIdSet.remove(id) != null) selectedNodeIdList.remove(id)
    }
    @JvmOverloads
    fun selectEdge(id: String, additive: Boolean = false) {
        if (additive) {
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
        val nodeIdsToRemove = selectedNodeIdSet.keys.toSet()
        val edgeIdsToRemove = selectedEdgeIdSet.keys.toSet()
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
}
