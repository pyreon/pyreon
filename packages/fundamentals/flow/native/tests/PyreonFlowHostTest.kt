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
    val labels = pyreonFlowEdgeLabels(state)
    checkHost(labels.map { it.id } == listOf("shown"), "only valid visible edges expose label and accessibility packets")
    checkHost(labels.single().accessibilityLabel == "Edge from visible to target" && labels.single().x > 0.0, "an unlabeled edge gets a positioned accessible fallback")
    val routed = PyreonFlowState(nodes = state.nodes, edges = listOf(PyreonFlowEdge("tuned", "visible", "target", type = "step", animated = true, pathOffset = 37.0)))
    val tunedStroke = pyreonFlowEdgeStrokes(routed).single()
    checkHost(tunedStroke.dash == listOf(5.0, 5.0) && tunedStroke.segments[1].x == 187.0, "native host applies animated dash and per-edge path offset")
    state.containerSize = PyreonFlowContainerSize(400.0, 200.0)
    val mini = pyreonFlowMiniMapLayout(state, width = 200.0, height = 150.0)
    checkHost(mini.nodes.map { it.id } == listOf("visible", "target"), "minimap omits hidden nodes")
    checkHost(mini.scale > 0.0 && mini.viewport.width > 0.0, "minimap derives graph scale and viewport indicator")
    val dragGroups = PyreonFlowState(
        nodes = listOf(
            PyreonFlowNode("parent", position = PyreonXYPosition(10.0, 10.0), data = "Parent"),
            PyreonFlowNode("child", position = PyreonXYPosition(5.0, 5.0), data = "Child", parentId = "parent"),
            PyreonFlowNode("peer", position = PyreonXYPosition(30.0, 30.0), data = "Peer"),
        ),
    )
    dragGroups.selectNodes(listOf("parent", "child", "peer"))
    checkHost(pyreonFlowDragNodeIds(dragGroups, "parent") == listOf("parent", "peer"), "multi-drag omits descendants of a selected ancestor")
    checkHost(pyreonFlowDragNodeIds(dragGroups, "child") == listOf("parent", "peer"), "dragging any selected member moves the same top-level selection")
    println("PyreonFlowHostTest: all checks passed")
}
