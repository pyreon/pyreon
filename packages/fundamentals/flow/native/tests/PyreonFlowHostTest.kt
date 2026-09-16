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
    val inferredHandles = listOf(PyreonFlowHandleConfig("out", "source", PyreonFlowPosition.Right, 75.0), PyreonFlowHandleConfig("in", "target", PyreonFlowPosition.Left))
    checkHost(pyreonFlowEffectiveHandles(state.getNode("visible")!!, inferredHandles) == inferredHandles, "renderer handles fill missing endpoint types")
    val explicitNode = PyreonFlowNode("explicit", position = PyreonXYPosition(0.0, 0.0), data = "Explicit", sourceHandles = listOf(PyreonFlowHandleConfig("model", "source", PyreonFlowPosition.Top)))
    checkHost(pyreonFlowEffectiveHandles(explicitNode, inferredHandles).mapNotNull { it.id } == listOf("model", "in"), "explicit model handles win per endpoint type without duplicates")
    val resized = pyreonFlowResizeFrame(PyreonFlowResizeFrame(PyreonXYPosition(100.0, 80.0), 150.0, 40.0), "nw", 170.0, 30.0)
    checkHost(resized == PyreonFlowResizeFrame(PyreonXYPosition(200.0, 90.0), 50.0, 30.0), "north-west resizing clamps dimensions and keeps the opposite corner fixed")
    val expanded = pyreonFlowResizeFrame(PyreonFlowResizeFrame(PyreonXYPosition(100.0, 80.0), 150.0, 40.0), "se", 25.0, 15.0)
    checkHost(expanded == PyreonFlowResizeFrame(PyreonXYPosition(100.0, 80.0), 175.0, 55.0), "south-east resizing expands without moving the origin")
    val toolbarNode = PyreonFlowNodeBox(10.0, 20.0, 100.0, 40.0)
    val toolbarViewport = PyreonFlowViewport(5.0, -5.0, 2.0)
    checkHost(pyreonFlowNodeToolbarPlacement(toolbarNode, toolbarViewport) == PyreonFlowNodeToolbarPlacement(125.0, 27.0, 0.5, 1.0), "top-center toolbar placement applies pan, zoom, and an unscaled offset")
    checkHost(pyreonFlowNodeToolbarPlacement(toolbarNode, toolbarViewport, PyreonFlowNodeToolbarConfig("bottom", "end", 6.0, false)) == PyreonFlowNodeToolbarPlacement(225.0, 121.0, 1.0, 0.0), "bottom-end toolbar placement anchors the far node corner")
    checkHost(pyreonFlowNodeToolbarPlacement(toolbarNode, toolbarViewport, PyreonFlowNodeToolbarConfig("left", "start", 7.0)) == PyreonFlowNodeToolbarPlacement(18.0, 35.0, 1.0, 0.0), "left-start toolbar placement exposes the content anchor")
    checkHost(pyreonFlowNodeToolbarPlacement(toolbarNode, toolbarViewport, PyreonFlowNodeToolbarConfig("right", "center", 9.0)) == PyreonFlowNodeToolbarPlacement(234.0, 75.0, 0.0, 0.5), "right-center toolbar placement uses scaled node dimensions")
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
    val styled = PyreonFlowState(nodes = state.nodes, edges = listOf(PyreonFlowEdge("styled", "visible", "target", style = " stroke: #123456; stroke-width: 4px; unknown: kept")))
    val styledStroke = pyreonFlowEdgeStrokes(styled).single()
    checkHost(styledStroke.color == "#123456" && styledStroke.width == 4.0, "portable inline edge stroke style reaches the native draw list")
    checkHost(pyreonFlowStyleValue(styled.edges.single().style, "unknown") == "kept", "style parser preserves and resolves unknown declarations without corrupting the model")
    val nodeStyle = pyreonFlowNodeInlineStyle("width: 120px; height: 45; padding: 8px; background: #abcdef; border-color: #123456; border-width: 2px; border-radius: 6px; opacity: .5")
    checkHost(nodeStyle == PyreonFlowNodeInlineStyle(120.0, 45.0, 8.0, "#abcdef", "#123456", 2.0, 6.0, 0.5), "portable node box styles resolve identically for Compose")
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
