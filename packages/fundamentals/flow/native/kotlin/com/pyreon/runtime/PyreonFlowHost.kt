package com.pyreon.runtime

fun <T> pyreonFlowEdgeStrokeIsVisible(stroke: PyreonFlowEdgeStroke, state: PyreonFlowState<T>): Boolean {
    if (state.containerSize.width <= 0 || state.containerSize.height <= 0 || state.viewport.zoom <= 0) return false
    val xs = stroke.segments.flatMap { listOfNotNull(it.x, it.c1x, it.c2x, it.cx) }
    val ys = stroke.segments.flatMap { listOfNotNull(it.y, it.c1y, it.c2y, it.cy) }
    if (xs.isEmpty() || ys.isEmpty()) return false
    val pad = maxOf(stroke.width, stroke.interactionWidth) / 2 / state.viewport.zoom
    val left = -state.viewport.x / state.viewport.zoom
    val top = -state.viewport.y / state.viewport.zoom
    val right = left + state.containerSize.width / state.viewport.zoom
    val bottom = top + state.containerSize.height / state.viewport.zoom
    return xs.max() + pad > left && xs.min() - pad < right && ys.max() + pad > top && ys.min() - pad < bottom
}

data class PyreonFlowMiniMapNode(val id: String, val x: Double, val y: Double, val width: Double, val height: Double)
data class PyreonFlowMiniMapLayout(val nodes: List<PyreonFlowMiniMapNode>, val viewport: PyreonFlowNodeBox, val scale: Double, val minX: Double, val minY: Double)
data class PyreonFlowEdgeLabel(val id: String, val text: String?, val accessibilityLabel: String, val x: Double, val y: Double, val focusable: Boolean)
data class PyreonFlowEdgeUpdater(val edgeId: String, val end: String, val x: Double, val y: Double)

fun <T> pyreonFlowMiniMapLayout(state: PyreonFlowState<T>, width: Double = 200.0, height: Double = 150.0, padding: Double = 40.0): PyreonFlowMiniMapLayout {
    val visible = state.nodes.filter { it.hidden != true }
    if (visible.isEmpty()) return PyreonFlowMiniMapLayout(emptyList(), PyreonFlowNodeBox(0.0, 0.0, 0.0, 0.0), 1.0, 0.0, 0.0)
    var minX = Double.POSITIVE_INFINITY; var minY = Double.POSITIVE_INFINITY
    var maxX = Double.NEGATIVE_INFINITY; var maxY = Double.NEGATIVE_INFINITY
    val absolute = visible.map { node ->
        val p = state.getAbsolutePosition(node.id)
        minX = minOf(minX, p.x); minY = minOf(minY, p.y)
        maxX = maxOf(maxX, p.x + (node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH))
        maxY = maxOf(maxY, p.y + (node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT))
        node to p
    }
    val scale = minOf(width / maxOf(1.0, maxX - minX + padding * 2), height / maxOf(1.0, maxY - minY + padding * 2))
    val nodes = absolute.map { (node, p) -> PyreonFlowMiniMapNode(node.id, (p.x - minX + padding) * scale, (p.y - minY + padding) * scale, (node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH) * scale, (node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) * scale) }
    val vp = state.viewport; val cs = state.containerSize
    return PyreonFlowMiniMapLayout(nodes, PyreonFlowNodeBox((-vp.x / vp.zoom - minX + padding) * scale, (-vp.y / vp.zoom - minY + padding) * scale, (cs.width / vp.zoom) * scale, (cs.height / vp.zoom) * scale), scale, minX, minY)
}

/**
 * Pure graph-to-draw-list half of [PyreonFlowView]. Kept outside the Compose
 * host so the co-source gate can compile and execute its visibility and
 * endpoint rules without an Android SDK.
 */
fun <T> pyreonFlowEdgeStrokes(
    state: PyreonFlowState<T>,
    color: String = "#999999",
    width: Double = 1.5,
): List<PyreonFlowEdgeStroke> {
    val nodes = state.nodes.filter { it.hidden != true }.associateBy { it.id }
    return state.edges.mapNotNull { edge ->
        if (edge.hidden == true) return@mapNotNull null
        val source = nodes[edge.source] ?: return@mapNotNull null
        val target = nodes[edge.target] ?: return@mapNotNull null
        val sourcePosition = state.getAbsolutePosition(source.id)
        val targetPosition = state.getAbsolutePosition(target.id)
        val path = pyreonComputeEdgePath(
            type = edge.type ?: PYREON_FLOW_DEFAULT_EDGE_TYPE,
            source = PyreonFlowNodeBox(
                sourcePosition.x, sourcePosition.y,
                source.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH,
                source.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT),
            target = PyreonFlowNodeBox(
                targetPosition.x, targetPosition.y,
                target.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH,
                target.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT),
            sourceHandleId = edge.sourceHandle,
            targetHandleId = edge.targetHandle,
            sourceHandles = source.sourceHandles,
            targetHandles = target.targetHandles,
            waypoints = edge.waypoints.map { PyreonFlowPathPoint(it.x, it.y) },
            borderRadius = edge.borderRadius ?: 5.0,
            offset = edge.pathOffset ?: 20.0,
            curvature = edge.curvature ?: 0.25,
        )
        val markers = state.resolvedMarkers(edge)
        PyreonFlowEdgeStroke(
            edge.id, path.segments, color, width, if (edge.animated) listOf(5.0, 5.0) else null,
            markers.first?.let { pyreonFlowMarkerGlyph(it, path.segments, true, color) },
            markers.second?.let { pyreonFlowMarkerGlyph(it, path.segments, false, color) },
            edge.interactionWidth ?: state.edgeInteractionWidth,
        )
    }
}

fun <T> pyreonFlowEdgeLabels(state: PyreonFlowState<T>): List<PyreonFlowEdgeLabel> {
    val nodes = state.nodes.filter { it.hidden != true }.associateBy { it.id }
    return state.edges.mapNotNull { edge ->
        if (edge.hidden == true) return@mapNotNull null
        val source = nodes[edge.source] ?: return@mapNotNull null
        val target = nodes[edge.target] ?: return@mapNotNull null
        val sp = state.getAbsolutePosition(source.id); val tp = state.getAbsolutePosition(target.id)
        val path = pyreonComputeEdgePath(
            edge.type ?: PYREON_FLOW_DEFAULT_EDGE_TYPE,
            PyreonFlowNodeBox(sp.x, sp.y, source.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, source.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT),
            PyreonFlowNodeBox(tp.x, tp.y, target.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, target.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT),
            edge.sourceHandle, edge.targetHandle, source.sourceHandles, target.targetHandles,
            waypoints = edge.waypoints.map { PyreonFlowPathPoint(it.x, it.y) },
            borderRadius = edge.borderRadius ?: 5.0,
            offset = edge.pathOffset ?: 20.0,
            curvature = edge.curvature ?: 0.25,
        )
        PyreonFlowEdgeLabel(edge.id, edge.label, edge.ariaLabel ?: edge.label ?: "Edge from ${edge.source} to ${edge.target}", path.labelX, path.labelY, !state.disableKeyboardA11y && (edge.focusable ?: state.edgesFocusable))
    }
}

fun <T> pyreonFlowEdgeUpdaters(state: PyreonFlowState<T>, strokes: List<PyreonFlowEdgeStroke>): List<PyreonFlowEdgeUpdater> {
    val byId = strokes.associateBy { it.id }
    return state.selectedEdges().flatMap { id ->
        val edge = state.getEdge(id); val segments = byId[id]?.segments
        if (edge == null || !(edge.reconnectable ?: state.edgesReconnectable) || segments.isNullOrEmpty()) emptyList()
        else listOf(PyreonFlowEdgeUpdater(id, "source", segments.first().x, segments.first().y), PyreonFlowEdgeUpdater(id, "target", segments.last().x, segments.last().y))
    }
}

fun pyreonFlowReconnectConnection(edge: PyreonFlowEdge, end: String, handle: PyreonFlowInteractiveHandle): PyreonFlowConnection? = when {
    end == "target" && handle.type == "target" && handle.nodeId != edge.source -> PyreonFlowConnection(edge.source, handle.nodeId, edge.sourceHandle, handle.handleId)
    end == "source" && handle.type == "source" && handle.nodeId != edge.target -> PyreonFlowConnection(handle.nodeId, edge.target, handle.handleId, edge.targetHandle)
    else -> null
}

fun <T> pyreonFlowDragNodeIds(state: PyreonFlowState<T>, draggedNodeId: String): List<String> {
    val ids = (if (state.isNodeSelected(draggedNodeId)) state.selectedNodes() else listOf(draggedNodeId)).toMutableList()
    val selected = ids.toSet()
    ids.removeAll { id ->
        var parentId = state.getNode(id)?.parentId
        val seen = mutableSetOf<String>()
        var hasSelectedAncestor = false
        while (parentId != null && seen.add(parentId)) {
            if (selected.contains(parentId)) { hasSelectedAncestor = true; break }
            parentId = state.getNode(parentId)?.parentId
        }
        hasSelectedAncestor
    }
    return ids
}
