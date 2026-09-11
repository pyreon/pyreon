package com.pyreon.runtime

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
