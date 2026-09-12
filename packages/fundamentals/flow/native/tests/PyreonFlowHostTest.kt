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
    state.containerSize = PyreonFlowContainerSize(100.0, 100.0)
    checkHost(pyreonFlowEdgeStrokeIsVisible(PyreonFlowEdgeStroke("inside", listOf(PyreonFlowEdgeSegment.move(10.0, 10.0), PyreonFlowEdgeSegment.line(90.0, 90.0))), state), "viewport culling retains an intersecting edge")
    checkHost(!pyreonFlowEdgeStrokeIsVisible(PyreonFlowEdgeStroke("outside", listOf(PyreonFlowEdgeSegment.move(300.0, 300.0), PyreonFlowEdgeSegment.line(400.0, 400.0))), state), "viewport culling removes an offscreen edge")
    val labels = pyreonFlowEdgeLabels(state)
    checkHost(labels.map { it.id } == listOf("shown"), "only valid visible edges expose label and accessibility packets")
    checkHost(labels.single().accessibilityLabel == "Edge from visible to target" && labels.single().x > 0.0, "an unlabeled edge gets a positioned accessible fallback")
    val keyboardA11yOff = PyreonFlowState(nodes = state.nodes, edges = state.edges, disableKeyboardA11y = true)
    checkHost(pyreonFlowEdgeLabels(keyboardA11yOff).all { !it.focusable }, "disableKeyboardA11y removes every edge focus stop")
    val routed = PyreonFlowState(nodes = state.nodes, edges = listOf(PyreonFlowEdge("tuned", "visible", "target", type = "step", animated = true, pathOffset = 37.0)))
    val tunedStroke = pyreonFlowEdgeStrokes(routed).single()
    checkHost(tunedStroke.dash == listOf(5.0, 5.0) && tunedStroke.segments[1].x == 187.0, "native host applies animated dash and per-edge path offset")
    checkHost(tunedStroke.endMarker?.closed == true && tunedStroke.endMarker?.points?.first()?.x == tunedStroke.segments.last().x, "omitted markerEnd renders the default closed arrow at the target")
    val noMarker = PyreonFlowState(nodes = state.nodes, edges = listOf(PyreonFlowEdge("none", "visible", "target", markerEndSpecified = true)))
    checkHost(pyreonFlowEdgeStrokes(noMarker).single().endMarker == null, "explicit markerEnd null suppresses the default arrow")
    val openMarker = PyreonFlowMarker("arrow", "#ff0000", 12.0, 8.0, 2.0)
    val marked = PyreonFlowState(nodes = state.nodes, edges = listOf(PyreonFlowEdge("marked", "visible", "target", markerStart = openMarker, markerEnd = openMarker, markerEndSpecified = true)))
    checkHost(!pyreonFlowEdgeStrokes(marked).single().startMarker!!.closed && pyreonFlowEdgeStrokes(marked).single().endMarker!!.color == "#ff0000", "configured open markers preserve shape and color at both ends")
    routed.selectEdge("tuned")
    val updaters = pyreonFlowEdgeUpdaters(routed, listOf(tunedStroke))
    checkHost(updaters.map { it.end } == listOf("source", "target") && updaters.first().x == tunedStroke.segments.first().x && updaters.last().x == tunedStroke.segments.last().x, "selected reconnectable edge exposes exact rendered endpoints")
    val reconnectTarget = PyreonFlowInteractiveHandle("new-target", "in", "target", PyreonFlowPosition.Left, 0.0, 0.0)
    checkHost(pyreonFlowReconnectConnection(routed.getEdge("tuned")!!, "target", reconnectTarget)?.targetHandle == "in", "target updater preserves the fixed source and adopts the target handle")
    val invalidSelf = PyreonFlowInteractiveHandle("visible", "self", "target", PyreonFlowPosition.Left, 0.0, 0.0)
    checkHost(pyreonFlowReconnectConnection(routed.getEdge("tuned")!!, "target", invalidSelf) == null, "reconnect resolver rejects the fixed endpoint node like web")
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
