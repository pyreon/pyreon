package com.pyreon.runtime

data class PyreonFlowMiniMapNode(val id: String, val x: Double, val y: Double, val width: Double, val height: Double)
data class PyreonFlowMiniMapLayout(val nodes: List<PyreonFlowMiniMapNode>, val viewport: PyreonFlowNodeBox, val scale: Double, val minX: Double, val minY: Double)
data class PyreonFlowEdgeLabel(val id: String, val text: String?, val accessibilityLabel: String, val x: Double, val y: Double, val focusable: Boolean)

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
        )
        PyreonFlowEdgeStroke(edge.id, path.segments, color, width)
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
        )
        PyreonFlowEdgeLabel(edge.id, edge.label, edge.ariaLabel ?: edge.label ?: "Edge from ${edge.source} to ${edge.target}", path.labelX, path.labelY, edge.focusable != false)
    }
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
