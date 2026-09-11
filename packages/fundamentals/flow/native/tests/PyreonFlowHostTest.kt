package com.pyreon.runtime

private fun checkHost(value: Boolean, message: String) {
    check(value) { "PyreonFlowHostTest: $message" }
}

fun main() {
    val state = PyreonFlowState(
        nodes = listOf(
            PyreonFlowNode("visible", position = PyreonXYPosition(0.0, 0.0), data = "Visible"),
            PyreonFlowNode("target", position = PyreonXYPosition(200.0, 0.0), data = "Target"),
            PyreonFlowNode("hidden", position = PyreonXYPosition(400.0, 0.0), data = "Hidden", hidden = true),
        ),
        edges = listOf(
            PyreonFlowEdge("shown", source = "visible", target = "target"),
            PyreonFlowEdge("hidden-edge", source = "visible", target = "target", hidden = true),
            PyreonFlowEdge("hidden-node", source = "visible", target = "hidden"),
            PyreonFlowEdge("dangling", source = "missing", target = "target"),
        ),
    )
    val strokes = pyreonFlowEdgeStrokes(state)
    checkHost(strokes.map { it.id } == listOf("shown"), "only valid visible edges render")
    checkHost(strokes.single().segments.isNotEmpty(), "visible edge has native path geometry")
    state.containerSize = PyreonFlowContainerSize(400.0, 200.0)
    val mini = pyreonFlowMiniMapLayout(state, width = 200.0, height = 150.0)
    checkHost(mini.nodes.map { it.id } == listOf("visible", "target"), "minimap omits hidden nodes")
    checkHost(mini.scale > 0.0 && mini.viewport.width > 0.0, "minimap derives graph scale and viewport indicator")
    println("PyreonFlowHostTest: all checks passed")
}
