// PyreonFlowState behaviour assertions (Android). Byte-aligned with the TS
// `flow.test.ts` semantics and the Swift test: the SAME node/edge/selection/
// viewport results, so a diagram behaves identically on web, iOS, and Android.

import com.pyreon.runtime.PyreonFlowEdge
import com.pyreon.runtime.PyreonFlowConnection
import com.pyreon.runtime.PyreonFlowDefaultEdgeOptions
import com.pyreon.runtime.PyreonFlowDimensions
import com.pyreon.runtime.PyreonFlowNodeMeasurement
import com.pyreon.runtime.PyreonFlowMeasuredHandle
import com.pyreon.runtime.PyreonFlowPosition
import com.pyreon.runtime.PyreonFlowNode
import com.pyreon.runtime.PyreonFlowNodeExtent
import com.pyreon.runtime.PyreonFlowLayoutOptions
import com.pyreon.runtime.PyreonFlowMarker
import com.pyreon.runtime.PyreonFlowState
import com.pyreon.runtime.PyreonFlowSnapshot
import com.pyreon.runtime.PyreonFlowSnapLines
import com.pyreon.runtime.PyreonFlowViewport
import com.pyreon.runtime.PyreonXYPosition
import com.pyreon.runtime.pyreonFlowPackingLayout
import com.pyreon.runtime.pyreonFlowForceLayout
import com.pyreon.runtime.pyreonFlowLayeredLayout
import com.pyreon.runtime.pyreonFlowRadialLayout
import com.pyreon.runtime.pyreonFlowStressLayout
import com.pyreon.runtime.pyreonFlowTreeLayout
import com.pyreon.runtime.pyreonEffectiveDimensions
import com.pyreon.runtime.pyreonCollectFlowEdgeMarkers
import com.pyreon.runtime.pyreonFlowDefaultMarkerEnd
import com.pyreon.runtime.pyreonFlowMarkerId
import com.pyreon.runtime.pyreonFlowEdgeId
import com.pyreon.runtime.pyreonResolveFlowEdgeMarkers
import kotlin.math.abs

private data class NodeData(val label: String)

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonFlowStateTest: $msg")
}

private fun seedFlow(): PyreonFlowState<NodeData> = PyreonFlowState(
    nodes = listOf(
        PyreonFlowNode(id = "1", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Start")),
        PyreonFlowNode(id = "2", position = PyreonXYPosition(200.0, 0.0), data = NodeData("Mid")),
        PyreonFlowNode(id = "3", position = PyreonXYPosition(400.0, 0.0), data = NodeData("End")),
    ),
    searchText = { it.label },
    edges = listOf(
        PyreonFlowEdge(id = "e1", source = "1", target = "2"),
        PyreonFlowEdge(id = "e2", source = "2", target = "3"),
    ),
)

fun main() {
    check(pyreonFlowEdgeId("1", "2") == "e-1-2", "Android generates missing edge ids like web")
    check(pyreonFlowEdgeId("1", "2", "out", "in") == "e-1-out-2-in", "Android includes handles in generated edge ids")
    val configured = PyreonFlowState<NodeData>(
        panOnScroll = true, panOnScrollSpeed = 0.75, zoomOnScroll = false,
        deleteKeys = listOf("ForwardDelete"), multiSelectionKey = "ctrl",
        selectionKey = null, zoomActivationKey = "meta", preventScrolling = false,
    )
    check(configured.panOnScroll && configured.panOnScrollSpeed == 0.75, "Android retains scroll config")
    check(!configured.zoomOnScroll && configured.deleteKeys == listOf("ForwardDelete"), "Android retains zoom/delete config")
    check(configured.multiSelectionKey == "ctrl" && configured.selectionKey == null && configured.zoomActivationKey == "meta" && !configured.preventScrolling, "Android retains modifier config")
    configured.minZoom = 0.75
    configured.pannable = false
    configured.zoomTo(0.1)
    check(configured.viewport.zoom == 0.75 && !configured.pannable, "Android applies live mutable Flow config")
    val markerEdge = PyreonFlowEdge(id = "marker", source = "1", target = "2", markerStart = PyreonFlowMarker("arrow", color = "#F00"))
    val resolvedMarker = pyreonResolveFlowEdgeMarkers(markerEdge, pyreonFlowDefaultMarkerEnd)
    check(resolvedMarker.start?.color == "#F00" && resolvedMarker.end?.type == "arrowclosed", "Android resolves per-edge and default markers")
    check(pyreonFlowMarkerId(PyreonFlowMarker("arrow", color = "#F00")) == "pyreon-flow-marker-arrow-f00-10x7-1", "Android marker ids match web formatting")
    check(pyreonCollectFlowEdgeMarkers(listOf(markerEdge, markerEdge), pyreonFlowDefaultMarkerEnd).size == 2, "Android marker collection deduplicates equal markers")
    val measuredDimensions = pyreonEffectiveDimensions(PyreonFlowNode("dims", position = PyreonXYPosition(0.0, 0.0), data = NodeData("D"), width = 90.0), PyreonFlowNodeMeasurement(80.0, 30.0))
    check(measuredDimensions.width == 90.0 && measuredDimensions.height == 30.0, "effective dimensions preserve explicit-measured-default precedence")
    // 1. Seed + basic reads.
    val f = seedFlow()
    f.updateNodeMeasurement("1", 240.0, 72.0)
    check(f.measurements["1"] == PyreonFlowNodeMeasurement(240.0, 72.0), "Compose host measurements are observable")
    f.updateNodeMeasurement("1", 240.0, 72.0, listOf(PyreonFlowMeasuredHandle("out", "source", PyreonFlowPosition.Right, 240.0, 36.0)))
    check(f.measurements["1"]?.handles?.size == 1, "Compose host records measured handle anchors")
    f.updateNodeMeasurement("1", 240.0, 72.0)
    check(f.measurements["1"]?.handles?.isEmpty() == true, "an omitted handle list clears stale anchors like the web engine")
    f.clearNodeMeasurement("1")
    check(!f.measurements.containsKey("1"), "explicit measurement cleanup removes the native entry")
    f.updateNodeMeasurement("1", 240.0, 72.0)
    f.updateMeasurements { it }
    check(f.measurements["1"]?.width == 240.0, "measurement callback replacement preserves entries")
    f.replaceMeasurements(emptyMap())
    check(f.measurements.isEmpty(), "measurement signal replacement clears stale entries")
    f.updateNodeMeasurement("1", 240.0, 72.0)
    check(f.nodeLookup["1"]?.data?.label == "Start" && f.edgeLookup["e1"]?.source == "1", "FlowInstance lookup maps stay reactive and addressable")
    check(f.getNodeDimensions("1") == PyreonFlowDimensions(240.0, 72.0), "intrinsic host measurements drive effective geometry")
    f.addNode(PyreonFlowNode("intrinsic", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Intrinsic"), width = 100.0, height = 40.0))
    f.updateNodeMeasurement("intrinsic", 240.0, 72.0)
    check(f.getNodeDimensions("intrinsic") == PyreonFlowDimensions(100.0, 40.0), "explicit node dimensions win over host measurements")
    f.removeNode("intrinsic")
    check(!f.measurements.containsKey("intrinsic"), "removed nodes release their measurements")
    val keyboard = seedFlow()
    check(keyboard.handleKeyboardCommand("Enter", nodeId = "1"), "Android keyboard Enter selects a focused node")
    check(keyboard.isNodeSelected("1"), "Android keyboard selection is observable")
    val keyboardStart = keyboard.getNode("1")!!.position
    check(keyboard.handleKeyboardCommand("ArrowRight", nodeId = "1"), "Android keyboard arrows are consumed")
    check(keyboard.getNode("1")!!.position.x == keyboardStart.x + 10.0, "Android keyboard arrows move by ten")
    check(keyboard.handleKeyboardCommand("ArrowDown", nodeId = "1", shift = true), "Android Shift+arrow is consumed")
    check(keyboard.getNode("1")!!.position.y == keyboardStart.y + 100.0, "Android Shift+arrow moves by one hundred")
    check(keyboard.handleKeyboardCommand("a", command = true) && keyboard.selectedNodes().size == keyboard.nodes.size, "Android Control-A selects all")
    check(keyboard.handleKeyboardCommand("Escape") && keyboard.selectedNodes().isEmpty(), "Android Escape clears selection")
    keyboard.selectNode("1")
    check(keyboard.handleKeyboardCommand("Delete") && keyboard.getNode("1") == null, "Android configured delete key removes selection")
    val packingNodes = listOf(
        PyreonFlowNode("a", position = PyreonXYPosition(9.0, 9.0), data = NodeData("A"), width = 100.0, height = 30.0),
        PyreonFlowNode("b", position = PyreonXYPosition(9.0, 9.0), data = NodeData("B"), width = 80.0, height = 70.0),
        PyreonFlowNode("c", position = PyreonXYPosition(9.0, 9.0), data = NodeData("C"), width = 120.0, height = 40.0),
        PyreonFlowNode("d", position = PyreonXYPosition(9.0, 9.0), data = NodeData("D"), width = 60.0, height = 20.0),
    )
    check(pyreonFlowPackingLayout(packingNodes, spacing = 10.0).map { it.id } == listOf("a", "b", "c", "d"), "box packing preserves input order")
    check(pyreonFlowPackingLayout(packingNodes, spacing = 10.0).map { it.position } == listOf(PyreonXYPosition(0.0, 0.0), PyreonXYPosition(110.0, 0.0), PyreonXYPosition(0.0, 80.0), PyreonXYPosition(130.0, 80.0)), "box packing matches the web shelf geometry")
    check(pyreonFlowPackingLayout(packingNodes, spacing = 10.0, sortByHeight = true).map { it.id } == listOf("b", "c", "a", "d"), "rectpacking uses stable height/width ordering")
    val treeEdges = listOf(PyreonFlowEdge("ra", "r", "a"), PyreonFlowEdge("rb", "r", "b"), PyreonFlowEdge("ac", "a", "c"), PyreonFlowEdge("bc", "b", "c"))
    val treeNodes = listOf(
        PyreonFlowNode("r", position = PyreonXYPosition(9.0, 9.0), data = NodeData("R"), width = 100.0, height = 40.0),
        PyreonFlowNode("a", position = PyreonXYPosition(9.0, 9.0), data = NodeData("A"), width = 80.0, height = 30.0),
        PyreonFlowNode("b", position = PyreonXYPosition(9.0, 9.0), data = NodeData("B"), width = 120.0, height = 50.0),
        PyreonFlowNode("c", position = PyreonXYPosition(9.0, 9.0), data = NodeData("C"), width = 60.0, height = 20.0),
        PyreonFlowNode("orphan", position = PyreonXYPosition(9.0, 9.0), data = NodeData("O"), width = 90.0, height = 35.0),
    )
    check(pyreonFlowTreeLayout(treeNodes, treeEdges, nodeSpacing = 20.0, layerSpacing = 40.0).map { it.position } == listOf(PyreonXYPosition(85.0, 0.0), PyreonXYPosition(70.0, 90.0), PyreonXYPosition(170.0, 80.0), PyreonXYPosition(80.0, 170.0), PyreonXYPosition(205.0, 2.5)), "tree layout matches web BFS centring and overlap sweep")
    check(pyreonFlowTreeLayout(treeNodes, treeEdges, direction = "UP", nodeSpacing = 20.0, layerSpacing = 40.0).map { it.position } == listOf(PyreonXYPosition(85.0, 150.0), PyreonXYPosition(70.0, 70.0), PyreonXYPosition(170.0, 60.0), PyreonXYPosition(80.0, 0.0), PyreonXYPosition(205.0, 152.5)), "tree layout mirrors web UP direction")
    val radialNodes = treeNodes.take(3)
    val radialEdges = listOf(PyreonFlowEdge("ra", "r", "a"), PyreonFlowEdge("ab", "a", "b"))
    check(pyreonFlowRadialLayout(radialNodes, radialEdges).map { it.position } == listOf(PyreonXYPosition(0.0, 5.0), PyreonXYPosition(150.0, 10.0), PyreonXYPosition(270.0, 0.0)), "radial layout matches exact web ring geometry")
    val force = pyreonFlowForceLayout(radialNodes, radialEdges)
    val forceWeb = listOf(PyreonXYPosition(325.65041151345395, 204.74888057371896), PyreonXYPosition(162.85665358620253, 102.39421274116614), PyreonXYPosition(0.0, 0.0))
    check(force.zip(forceWeb).all { (actual, expected) -> abs(actual.position.x - expected.x) < 1e-9 && abs(actual.position.y - expected.y) < 1e-9 }, "force layout reproduces the seeded web coordinates")
    val stress = pyreonFlowStressLayout(radialNodes, radialEdges)
    val stressWeb = listOf(PyreonXYPosition(138.23440571439633, 195.11390203079043), PyreonXYPosition(58.86121415294381, 104.8239204520405), PyreonXYPosition(0.0, 0.0))
    check(stress.zip(stressWeb).all { (actual, expected) -> abs(actual.position.x - expected.x) < 1e-9 && abs(actual.position.y - expected.y) < 1e-9 }, "stress layout reproduces the seeded web coordinates")
    val layered = pyreonFlowLayeredLayout(treeNodes, treeEdges)
    check(layered.map { it.position } == listOf(PyreonXYPosition(5.0, 0.0), PyreonXYPosition(0.0, 90.0), PyreonXYPosition(100.0, 80.0), PyreonXYPosition(80.0, 170.0), PyreonXYPosition(125.0, 2.5)), "layered layout matches exact web placement")
    val cyclicLayered = pyreonFlowLayeredLayout(treeNodes, treeEdges + PyreonFlowEdge("cr", "c", "r"), direction = "LEFT")
    check(cyclicLayered.map { it.position } == listOf(PyreonXYPosition(260.0, 2.5), PyreonXYPosition(120.0, 0.0), PyreonXYPosition(100.0, 50.0), PyreonXYPosition(0.0, 40.0), PyreonXYPosition(265.0, 62.5)), "layered layout reverses cycles and mirrors LEFT like web")
    val appliedLayout = seedFlow()
    appliedLayout.layout("box", PyreonFlowLayoutOptions(nodeSpacing = 10.0, animate = false))
    check(appliedLayout.nodes.map { it.position } == listOf(PyreonXYPosition(0.0, 0.0), PyreonXYPosition(160.0, 0.0), PyreonXYPosition(0.0, 50.0)), "layout atomically applies native algorithm results")
    appliedLayout.undo()
    check(appliedLayout.nodes.map { it.position } == listOf(PyreonXYPosition(0.0, 0.0), PyreonXYPosition(200.0, 0.0), PyreonXYPosition(400.0, 0.0)), "layout records exactly one undoable checkpoint")
    val batched = seedFlow()
    batched.batch {
        batched.updateNodePosition("1", PyreonXYPosition(10.0, 20.0))
        batched.updateNodePosition("2", PyreonXYPosition(30.0, 40.0))
    }
    check(batched.getNode("1")?.position == PyreonXYPosition(10.0, 20.0) && batched.getNode("2")?.position == PyreonXYPosition(30.0, 40.0), "batch runs all native mutations synchronously")
    val history = seedFlow()
    history.addNode(PyreonFlowNode("4", position = PyreonXYPosition(600.0, 0.0), data = NodeData("Added")))
    history.selectNode("4")
    history.undo()
    check(history.getNode("4") == null && history.selectedNodes().isEmpty(), "automatic history restores graph state and clears selection")
    history.redo()
    check(history.getNode("4") != null, "redo restores the undone native mutation")
    val manualHistory = PyreonFlowState(nodes = history.nodes, edges = history.edges, autoHistory = false)
    manualHistory.addNode(PyreonFlowNode("5", position = PyreonXYPosition(700.0, 0.0), data = NodeData("Unrecorded")))
    manualHistory.undo()
    check(manualHistory.getNode("5") != null, "autoHistory false does not record mutations")
    manualHistory.pushHistory()
    manualHistory.removeNode("5")
    manualHistory.undo()
    check(manualHistory.getNode("5") != null, "manual history remains available when automatic checkpoints are disabled")
    val clipboard = seedFlow()
    clipboard.selectNodes(listOf("1", "2"))
    clipboard.copySelected()
    clipboard.paste(PyreonXYPosition(10.0, 20.0))
    check(clipboard.selectedNodes() == listOf("1-copy-1", "2-copy-2"), "paste selects deterministic copied node ids")
    check(clipboard.getNode("1-copy-1")?.position == PyreonXYPosition(10.0, 20.0), "paste applies its native position offset")
    check(clipboard.getEdge("e-1-copy-1-2-copy-2") != null && clipboard.edges.size == 3, "paste remaps only internal copied edges")
    clipboard.undo()
    check(clipboard.nodes.size == 3 && clipboard.edges.size == 2, "paste records one undoable history checkpoint")
    val dragged = seedFlow()
    dragged.pushHistory()
    dragged.updateNodePosition("1", PyreonXYPosition(75.0, 25.0))
    dragged.undo()
    check(dragged.getNode("1")?.position == PyreonXYPosition(0.0, 0.0), "a drag-start checkpoint restores direct position mutations")
    val snapping = PyreonFlowState(nodes = listOf(
        PyreonFlowNode("drag", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Drag"), width = 100.0, height = 40.0),
        PyreonFlowNode("target", position = PyreonXYPosition(200.0, 100.0), data = NodeData("Target"), width = 100.0, height = 40.0),
    ))
    check(snapping.snappedNodePosition("drag", PyreonXYPosition(198.0, 102.0)) == PyreonXYPosition(200.0, 100.0), "object snapping aligns nearby native node edges")
    val guides = snapping.getSnapLines("drag", PyreonXYPosition(198.0, 102.0))
    check(guides == PyreonFlowSnapLines(300.0, 140.0, PyreonXYPosition(200.0, 100.0)), "getSnapLines preserves web last-match guide coordinates and snapped position")
    check(snapping.getSnapLines("missing", PyreonXYPosition(3.0, 4.0)) == PyreonFlowSnapLines(null, null, PyreonXYPosition(3.0, 4.0)), "getSnapLines preserves input for an unknown node")
    val unsnapped = PyreonFlowState(nodes = snapping.nodes, snapToObjects = false)
    check(unsnapped.snappedNodePosition("drag", PyreonXYPosition(198.0, 102.0)) == PyreonXYPosition(198.0, 102.0), "snapToObjects false preserves the raw drag position")
    check(unsnapped.getSnapLines("drag", PyreonXYPosition(198.0, 102.0)).x == 300.0, "public snap-line queries remain available when automatic host snapping is disabled")
    val spatial = PyreonFlowState(nodes = listOf(
        PyreonFlowNode("a", position = PyreonXYPosition(0.0, 0.0), data = NodeData("A"), width = 100.0, height = 100.0),
        PyreonFlowNode("b", position = PyreonXYPosition(90.0, 20.0), data = NodeData("B"), width = 100.0, height = 100.0),
        PyreonFlowNode("c", position = PyreonXYPosition(300.0, 0.0), data = NodeData("C"), width = 100.0, height = 100.0),
    ))
    check(spatial.getOverlappingNodes("a").map { it.id } == listOf("b"), "overlap detection uses strict rectangle intersection")
    check(spatial.getProximityConnection("a", 400.0)?.target == "b", "proximity connection chooses the nearest unconnected node")
    spatial.resolveCollisions("a", 10.0)
    check(spatial.getOverlappingNodes("a").isEmpty(), "collision resolution separates overlapping native nodes")
    val events = seedFlow()
    var connectedTarget: String? = null
    val stopConnect = events.onConnect { connectedTarget = it.target }
    events.connect(PyreonFlowConnection("1", "3"), "event-edge")
    check(connectedTarget == "3", "onConnect observes native graph connections")
    stopConnect(); connectedTarget = null
    events.addEdge(PyreonFlowEdge("after-unsubscribe", "1", "3"))
    check(connectedTarget == null, "onConnect unsubscribe removes only that listener")
    var observedZoom = 0.0
    val stopViewport = events.onViewportChange { observedZoom = it.zoom }
    events.zoomTo(2.0)
    check(observedZoom == 2.0, "onViewportChange observes native viewport writes")
    stopViewport(); events.zoomTo(3.0)
    check(observedZoom == 2.0, "onViewportChange unsubscribe stops delivery")
    val nodeEvents = mutableListOf<String>()
    val stops = listOf(
        events.onNodeClick { nodeEvents.add("click:${it.id}") },
        events.onNodeDoubleClick { nodeEvents.add("double:${it.id}") },
        events.onNodeDragStart { nodeEvents.add("start:${it.id}") },
        events.onNodeDrag { nodeEvents.add("drag:${it.id}") },
        events.onNodeDragEnd { nodeEvents.add("end:${it.id}") },
    )
    events.emitNodeClick("1"); events.emitNodeDoubleClick("1"); events.emitNodeDragStart("1"); events.emitNodeDrag("1"); events.emitNodeDragEnd("1")
    check(nodeEvents == listOf("click:1", "double:1", "start:1", "drag:1", "end:1"), "native node interaction listeners preserve lifecycle order and live node values")
    stops.forEach { it() }
    var clickedEdge: String? = null
    val stopEdge = events.onEdgeClick { clickedEdge = it.id }
    events.emitEdgeClick("e1")
    check(clickedEdge == "e1", "onEdgeClick receives the live native edge")
    stopEdge()
    var selectedIds = emptyList<String>()
    val stopSelection = events.onSelectionChange { selectedIds = it.nodes.map { node -> node.id } + it.edges.map { edge -> edge.id } }
    events.selectNode("1"); events.selectEdge("e1")
    check(selectedIds == listOf("e1"), "onSelectionChange receives the final mutually-exclusive selection")
    stopSelection()
    var disposedClicks = 0
    val stopDisposed = events.onNodeClick { disposedClicks++ }
    events.dispose(); events.emitNodeClick("1"); stopDisposed()
    check(disposedClicks == 0, "dispose releases native listeners and stale unsubscribers stay safe")
    val deletionEvents = seedFlow()
    var deletedNodes = emptyList<String>(); var deletedEdges = emptyList<String>()
    val stopNodeDelete = deletionEvents.onNodesDelete { deletedNodes = it.map { node -> node.id } }
    val stopEdgeDelete = deletionEvents.onEdgesDelete { deletedEdges = it.map { edge -> edge.id } }
    deletionEvents.removeNode("2")
    check(deletedNodes == listOf("2") && deletedEdges == listOf("e1", "e2"), "node deletion reports the node and all incident edges")
    stopNodeDelete(); stopEdgeDelete()
    val changes = seedFlow()
    var nodeChanges = emptyList<com.pyreon.runtime.PyreonFlowNodeChange>(); var edgeChanges = emptyList<com.pyreon.runtime.PyreonFlowEdgeChange>()
    val stopNodeChanges = changes.onNodesChange { nodeChanges = it }
    val stopEdgeChanges = changes.onEdgesChange { edgeChanges = it }
    changes.updateNodePosition("1", PyreonXYPosition(10.0, 20.0))
    check(nodeChanges == listOf(com.pyreon.runtime.PyreonFlowNodeChange("position", "1", PyreonXYPosition(10.0, 20.0))), "onNodesChange emits typed position packets")
    changes.addEdge(PyreonFlowEdge("e3", "1", "3"))
    check(edgeChanges.firstOrNull()?.type == "add" && edgeChanges.firstOrNull()?.edge?.id == "e3", "onEdgesChange emits the normalized added edge")
    changes.removeNode("2")
    check(nodeChanges == listOf(com.pyreon.runtime.PyreonFlowNodeChange("remove", "2")) && edgeChanges.map { it.id } == listOf("e1", "e2"), "compound deletion emits coherent remove batches")
    stopNodeChanges(); stopEdgeChanges()
    val lifecycle = mutableListOf<String>()
    val stopStart = changes.onConnectStart { lifecycle.add("start:${it.nodeId}:${it.handleId}") }
    val stopEnd = changes.onConnectEnd { lifecycle.add("end:${it?.target ?: "nil"}") }
    val stopPane = changes.onPaneClick { lifecycle.add("pane:${it.position.x}") }
    changes.emitConnectStart("1", "out"); changes.emitConnectEnd(PyreonFlowConnection("1", "3")); changes.emitConnectEnd(null); changes.emitPaneClick(PyreonXYPosition(12.0, 34.0))
    check(lifecycle == listOf("start:1:out", "end:3", "end:nil", "pane:12.0"), "native connection lifecycle and pane events carry success, cancellation and coordinates")
    stopStart(); stopEnd(); stopPane()
    f.updateNodeData("1") { it.copy(label = "Updated") }
    check(f.getNode("1")?.data?.label == "Updated", "updateNodeData replaces the native payload observably")
    f.updateNodeDataFromNode("1") { it.data.copy(label = "${it.id}:${it.data.label}") }
    check(f.getNode("1")?.data?.label == "1:Updated", "callback node-data update receives the complete Android node")
    f.updateNode("1") { it.copy(id = "ignored", hidden = true) }
    check(f.getNode("1")?.hidden == true && f.getNode("ignored") == null, "updateNode patches fields while preserving indexed identity")
    f.updateNode("1") { it.copy(hidden = false) }
    f.updateEdge("e1") { it.copy(id = "ignored", label = "Updated edge") }
    check(f.getEdge("e1")?.label == "Updated edge" && f.getEdge("ignored") == null, "updateEdge patches fields while preserving indexed identity")
    f.updateEdge("e1") { it.copy(label = null) }
    check(f.nodes.size == 3, "seeded 3 nodes")
    check(f.edges.size == 2, "seeded 2 edges")
    check(f.getNode("2")?.data?.label == "Mid", "getNode reads the seeded data")
    check(f.getNode("nope") == null, "getNode misses a missing id")
    check(f.getEdge("e1")?.source == "1", "getEdge reads the seeded edge")

    val ruled = PyreonFlowState(
        nodes = listOf(
            PyreonFlowNode("api", type = "api", position = PyreonXYPosition(0.0, 0.0), data = NodeData("API")),
            PyreonFlowNode("db", type = "database", position = PyreonXYPosition(1.0, 0.0), data = NodeData("DB")),
            PyreonFlowNode("ui", type = "ui", position = PyreonXYPosition(2.0, 0.0), data = NodeData("UI")),
        ),
        connectionRules = mapOf("api" to listOf("database")),
        connectionValidator = { it.source != it.target },
    )
    check(ruled.isValidConnection(PyreonFlowConnection("api", "db")), "connection rules allow declared target type")
    check(!ruled.isValidConnection(PyreonFlowConnection("api", "ui")), "connection rules reject undeclared target type")
    check(!ruled.isValidConnection(PyreonFlowConnection("api", "api")), "connection callback veto runs before rules")
    val connected = ruled.connect(PyreonFlowConnection("api", "db", "out", "in"), "native-edge")
    check(connected?.sourceHandle == "out" && connected.targetHandle == "in", "connect preserves handle ids")
    check(ruled.connect(PyreonFlowConnection("api", "ui"), "rejected") == null && ruled.getEdge("rejected") == null, "connect never stores an invalid edge")
    check(ruled.connect(PyreonFlowConnection("api", "db"), "native-edge") == null, "connect rejects duplicate explicit ids")
    check(ruled.reconnectEdge("native-edge", PyreonFlowConnection("api", "db")), "validated reconnect succeeds")
    check(ruled.getEdge("native-edge")?.sourceHandle == null && ruled.getEdge("native-edge")?.targetHandle == null, "validated reconnect can clear stale handle ids")
    check(!ruled.reconnectEdge("native-edge", PyreonFlowConnection("api", "ui")) && ruled.getEdge("native-edge")?.target == "db", "invalid reconnect leaves the edge unchanged")
    val disabledDefaults = PyreonFlowState(nodes = listOf(PyreonFlowNode("kept", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Kept")), PyreonFlowNode("other", position = PyreonXYPosition(20.0, 0.0), data = NodeData("Other"))), nodesDraggable = false, nodesConnectable = false, nodesSelectable = false, nodesFocusable = false, edgesFocusable = false, nodesDeletable = false, edgesDeletable = false, edgesReconnectable = false, edgeInteractionWidth = 33.0, connectionRadius = -4.0, pannable = false, zoomable = false, multiSelect = false, onlyRenderVisibleElements = true, defaultEdgeType = "step", defaultEdgeOptions = PyreonFlowDefaultEdgeOptions(type = "smoothstep", animated = true, interactionWidth = 30.0, markerEnd = null, markerEndSpecified = true), fitViewOnLoad = true, fitViewPadding = 0.2)
    disabledDefaults.addEdge(PyreonFlowEdge("defaulted", "kept", "kept"))
    disabledDefaults.selectNode("kept"); disabledDefaults.deleteSelected()
    check(disabledDefaults.getNode("kept") != null && disabledDefaults.connectionRadius == 0.0, "global deletion default protects nodes and connection radius clamps nonnegative")
    check(!disabledDefaults.nodesDraggable && !disabledDefaults.nodesConnectable && !disabledDefaults.pannable && disabledDefaults.edgeInteractionWidth == 33.0, "native interaction defaults retain explicit global disables")
    check(disabledDefaults.getEdge("defaulted")?.type == "smoothstep" && disabledDefaults.getEdge("defaulted")?.animated == true && disabledDefaults.getEdge("defaulted")?.interactionWidth == 30.0 && disabledDefaults.resolvedMarkers(disabledDefaults.getEdge("defaulted")!!).second == null && disabledDefaults.fitViewOnLoad && disabledDefaults.fitViewPadding == 0.2, "edge options and initial fit defaults are retained")
    disabledDefaults.addEdge(PyreonFlowEdge("explicit", "kept", "other", animated = false, animatedSpecified = true))
    check(disabledDefaults.getEdge("explicit")?.animated == false, "an explicit false edge option overrides a true flow default")
    disabledDefaults.selectNode("kept"); disabledDefaults.selectNode("other", additive = true)
    check(disabledDefaults.selectedNodes() == listOf("other"), "multiSelect false converts additive selection to replacement")
    check(disabledDefaults.onlyRenderVisibleElements, "visible-element rendering config is retained")

    val configuredNode = PyreonFlowNode(
        id = "configured", position = PyreonXYPosition(1.0, 2.0), data = NodeData("Configured"),
        draggable = false, selectable = true, connectable = false, focusable = true,
        ariaLabel = "Configured node", hidden = false, deletable = true,
        parentId = "group", expandParent = true, group = true,
    )
    check(configuredNode.draggable == false && configuredNode.parentId == "group" && configuredNode.ariaLabel == "Configured node", "node interaction/accessibility/group fields are retained")
    val configuredEdge = PyreonFlowEdge(
        id = "configured-edge", source = "1", target = "2", sourceHandle = "out", targetHandle = "in",
        focusable = true, ariaLabel = "Configured edge", hidden = false, deletable = true,
        reconnectable = false, interactionWidth = 24.0,
    )
    check(configuredEdge.sourceHandle == "out" && configuredEdge.targetHandle == "in" && configuredEdge.interactionWidth == 24.0, "edge handle/interaction fields are retained")

    // 2. addNode / addEdge.
    f.addNode(PyreonFlowNode(id = "4", position = PyreonXYPosition(600.0, 0.0), data = NodeData("Extra")))
    check(f.nodes.size == 4, "addNode appends")
    f.addEdge(PyreonFlowEdge(id = "e3", source = "3", target = "4"))
    check(f.edges.size == 3, "addEdge appends")
    f.addEdge(PyreonFlowEdge(id = "e3", source = "1", target = "4"))
    check(f.edges.size == 3, "addEdge dedupes by id")
    check(f.getEdge("e3")?.source == "3", "the FIRST e3 wins, not the dup")

    // 3. updateNodePosition.
    f.updateNodePosition("2", PyreonXYPosition(999.0, 999.0))
    check(f.getNode("2")?.position?.x == 999.0, "updateNodePosition moves the node")
    check(f.getNode("1")?.position?.x == 0.0, "updateNodePosition leaves other nodes alone")

    // 4. removeNode also removes connected edges.
    f.removeNode("2")
    check(f.nodes.size == 3, "removeNode removes the node")
    check(f.getNode("2") == null, "removed node is gone")
    check(f.edges.size == 1, "removeNode removes edges touching it (e1, e2 both gone)")
    check(f.getEdge("e3") != null, "removeNode leaves unrelated edges alone")

    // 5. removeEdge.
    f.removeEdge("e3")
    check(f.edges.isEmpty(), "removeEdge removes it")

    // 6. Selection.
    val g = seedFlow()
    g.selectNode("1")
    check(g.isNodeSelected("1"), "selectNode selects")
    check(g.selectedNodes() == listOf("1"), "selectedNodes reflects it")
    g.selectNode("2")
    check(g.selectedNodes() == listOf("2"), "non-additive selectNode REPLACES, not appends")
    g.selectNode("3", additive = true)
    check(g.selectedNodes() == listOf("2", "3"), "additive selectNode appends")
    g.deselectNode("2")
    check(g.selectedNodes() == listOf("3"), "deselectNode removes just that id")
    g.selectEdge("e1")
    check(g.selectedNodes().isEmpty(), "non-additive selectEdge clears node selection")
    check(g.isEdgeSelected("e1"), "selectEdge selects")
    g.selectNode("1")
    check(g.selectedEdges().isEmpty(), "non-additive selectNode clears edge selection")
    g.clearSelection()
    check(g.selectedNodes().isEmpty() && g.selectedEdges().isEmpty(), "clearSelection clears both")
    g.selectAll()
    check(g.selectedNodes().size == 3, "selectAll selects every node")
    // Web parity: `selectAll` (flow.ts) replaces ONLY the node set. v1 of
    // both native ports also cleared the edge set — locked in by omission.
    g.selectEdge("e1")
    g.selectAll()
    check(g.selectedEdges() == listOf("e1"), "selectAll leaves edge selection alone (web parity)")
    check(g.selectedNodes() == listOf("1", "2", "3"), "selectAll keeps node insertion order")
    g.deleteSelected()
    check(g.nodes.isEmpty(), "deleteSelected removes every selected node")
    check(g.edges.isEmpty(), "deleteSelected's node removal cascades to connected edges")

    // 6b. Mixed node+edge selection — mirror of the Swift spec. Pins the
    //     RESULT of the single-pass rewrite (was a per-id removeNode loop,
    //     O(K x (N + E)); now O(N + E), same observable outcome).
    val delMixed = seedFlow()
    delMixed.selectNode("1")
    delMixed.selectEdge("e2", additive = true)
    check(delMixed.selectedNodes() == listOf("1") && delMixed.selectedEdges() == listOf("e2"), "mixed selection holds both")
    delMixed.deleteSelected()
    check(delMixed.nodes.map { it.id } == listOf("2", "3"), "mixed delete removes only the selected node")
    // e1 goes because it is CONNECTED to removed node 1; e2 because it was
    // independently selected. Both in the same single pass.
    check(delMixed.edges.isEmpty(), "mixed delete removes connected AND independently-selected edges")
    check(delMixed.selectedNodes().isEmpty() && delMixed.selectedEdges().isEmpty(), "mixed delete clears selection")

    // 6c. Edges-only selection takes the second branch — nodes untouched.
    val delEdgesOnly = seedFlow()
    delEdgesOnly.selectEdge("e1")
    delEdgesOnly.deleteSelected()
    check(delEdgesOnly.nodes.size == 3, "edges-only delete leaves every node")
    check(delEdgesOnly.edges.map { it.id } == listOf("e2"), "edges-only delete removes just that edge")

    // 7. Viewport.
    val h = seedFlow()
    check(h.zoom == 1.0, "default zoom is 1")
    h.zoomTo(10.0)
    check(h.viewport.zoom == 4.0, "zoomTo clamps to maxZoom (default 4)")
    h.zoomTo(0.01)
    check(h.viewport.zoom == 0.1, "zoomTo clamps to minZoom (default 0.1)")
    h.zoomTo(1.0)
    h.zoomIn()
    check(abs(h.viewport.zoom - 1.2) < 0.0001, "zoomIn multiplies by 1.2")
    h.zoomOut()
    check(abs(h.viewport.zoom - 1.0) < 0.0001, "zoomOut divides by 1.2 (inverse of zoomIn)")
    h.panTo(PyreonXYPosition(50.0, 25.0))
    check(h.viewport.x == -50.0 && h.viewport.y == -25.0, "panTo at zoom 1 sets origin to -position")
    h.setViewport(x = 12.0, zoom = 8.0)
    check(h.viewport == PyreonFlowViewport(12.0, -25.0, 8.0), "setViewport merges partial fields without clamping")
    h.containerSize = com.pyreon.runtime.PyreonFlowContainerSize(200.0, 100.0)
    h.setCenter(10.0, 20.0, zoom = 2.0)
    check(h.viewport == PyreonFlowViewport(80.0, 10.0, 2.0), "setCenter centers with a clamped optional zoom")
    h.animateViewport(x = 20.0, zoom = 3.0, duration = 0.0)
    check(h.viewport == PyreonFlowViewport(20.0, 10.0, 3.0), "zero-duration viewport animation jumps synchronously and preserves omitted fields")
    h.animateViewport(x = 500.0, duration = 200.0)
    h.zoomTo(3.0)
    Thread.sleep(50)
    check(h.viewport.x == 20.0, "a synchronous viewport method cancels stale scheduled frames")
    h.animateViewport(x = 40.0, duration = 0.0)
    Thread.sleep(50)
    check(h.viewport.x == 40.0, "a newer viewport animation cancels stale scheduled frames")
    val reduced = PyreonFlowState(nodes = listOf(PyreonFlowNode(id = "r", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Reduced"))), reducedMotion = true)
    reduced.zoomTo(2.0, duration = 500.0)
    check(reduced.viewport.zoom == 2.0, "reduced motion makes duration-based viewport methods synchronous")
    val forcedMotion = PyreonFlowState(nodes = listOf(PyreonFlowNode(id = "m", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Motion"))), reducedMotion = false)
    forcedMotion.zoomTo(2.0, duration = 500.0)
    check(forcedMotion.viewport.zoom == 1.0, "an explicit false overrides automatic reduced-motion policy")
    forcedMotion.dispose()
    val exported = h.toJSON()
    check(exported.nodes.map { it.id } == listOf("1", "2", "3") && exported.edges.map { it.id } == listOf("e1", "e2"), "toJSON snapshots nodes and edges in order")
    check(exported.viewport == PyreonFlowViewport(40.0, 10.0, 3.0), "toJSON includes the exact viewport")
    h.selectNode("1")
    h.fromJSON(PyreonFlowSnapshot(
        nodes = listOf(PyreonFlowNode(id = "restored", position = PyreonXYPosition(7.0, 8.0), data = NodeData("Restored"))),
        edges = listOf(PyreonFlowEdge(id = "loop", source = "restored", target = "restored")),
    ))
    check(h.nodes.map { it.id } == listOf("restored") && h.getEdge("loop")?.type == "bezier", "fromJSON replaces graph state and normalizes restored edges")
    check(h.viewport == PyreonFlowViewport(40.0, 10.0, 3.0) && h.selectedNodes().isEmpty(), "fromJSON without viewport preserves it and clears selection")
    h.fromJSON(exported)
    check(h.nodes.map { it.id } == listOf("1", "2", "3") && h.viewport == PyreonFlowViewport(40.0, 10.0, 3.0), "toJSON/fromJSON round-trips the complete snapshot")

    // 8. fitView.
    val k = seedFlow()
    k.fitView()
    check(k.viewport == PyreonFlowViewport(), "fitView no-ops before containerSize is set")
    k.containerSize = com.pyreon.runtime.PyreonFlowContainerSize(width = 800.0, height = 400.0)
    k.fitView()
    check(k.viewport.zoom > 0 && k.viewport.zoom <= 4.0, "fitView picks a real, clamped zoom")
    val expectedCenterX = 275.0 * k.viewport.zoom + k.viewport.x
    check(abs(expectedCenterX - 400.0) < 1, "fitView centers the graph in the container")

    // 9. Graph queries.
    val m = seedFlow()
    check(m.getConnectedEdges("2").size == 2, "getConnectedEdges finds both e1 and e2")
    check(m.getIncomers("2").map { it.id } == listOf("1"), "getIncomers walks edges INTO the node")
    check(m.getOutgoers("2").map { it.id } == listOf("3"), "getOutgoers walks edges OUT of the node")
    check(m.findNodes { it.data.label.contains("t") }.map { it.id } == listOf("1"), "findNodes evaluates the native predicate in insertion order")
    check(m.searchNodes("MID").map { it.id } == listOf("2"), "searchNodes performs case-insensitive label search")
    check(PyreonFlowState(nodes = m.nodes).searchNodes("2").map { it.id } == listOf("2"), "searchNodes falls back to ids without a label extractor")
    check(m.getIncomers("1").isEmpty(), "a source-only node has no incomers")

    // 10. Edge `type` default — web `normalizeEdge`: `type ?: "bezier"`.
    val et = seedFlow()
    check(et.getEdge("e1")?.type == "bezier", "a seeded edge without a type reads 'bezier' (web parity)")
    et.addEdge(PyreonFlowEdge(id = "e9", source = "1", target = "3"))
    check(et.getEdge("e9")?.type == "bezier", "addEdge applies the 'bezier' default")
    et.addEdge(PyreonFlowEdge(id = "e10", source = "1", target = "3", type = "step"))
    check(et.getEdge("e10")?.type == "step", "an explicit edge type is kept")
    et.addEdge(PyreonFlowEdge(id = "ew", source = "1", target = "2", waypoints = listOf(PyreonXYPosition(10.0, 10.0))))
    et.addEdgeWaypoint("ew", PyreonXYPosition(20.0, 20.0), -1)
    check(et.getEdge("ew")?.waypoints?.map { it.x } == listOf(20.0, 10.0), "negative waypoint insertion mirrors Array.splice")
    et.updateEdgeWaypoint("ew", 1, PyreonXYPosition(30.0, 30.0))
    et.removeEdgeWaypoint("ew", -1)
    check(et.getEdge("ew")?.waypoints == listOf(PyreonXYPosition(20.0, 20.0)), "waypoint update/removal preserves the remaining route")
    et.reconnectEdge("ew", target = "3", targetHandle = "in")
    check(et.getEdge("ew")?.target == "3" && et.getEdge("ew")?.targetHandle == "in", "reconnect changes only supplied endpoints")
    // Bulk operations, coordinate conversion, visibility and groups.
    val q = PyreonFlowState(nodes = listOf(
        PyreonFlowNode(id = "p", position = PyreonXYPosition(10.0, 20.0), data = NodeData("Parent"), width = 100.0, height = 80.0, group = true),
        PyreonFlowNode(id = "c", position = PyreonXYPosition(5.0, 7.0), data = NodeData("Child"), parentId = "p"),
        PyreonFlowNode(id = "x", position = PyreonXYPosition(400.0, 400.0), data = NodeData("Other")),
    ), edges = listOf(PyreonFlowEdge(id = "pc", source = "p", target = "c"), PyreonFlowEdge(id = "cx", source = "c", target = "x")))
    check(q.nodes.size == 3 && q.edges.size == 2, "plain collection reads preserve all values")
    check(q.getChildNodes("p").map { it.id } == listOf("c"), "getChildNodes preserves insertion order")
    check(q.getAbsolutePosition("c") == PyreonXYPosition(15.0, 27.0), "absolute position folds parent offsets")
    check(q.getNodeDimensions("p") == PyreonFlowDimensions(100.0, 80.0) && q.getNodeDimensions("missing") == PyreonFlowDimensions(150.0, 40.0), "node dimensions use explicit sizes and stable defaults")
    val partialSelection = PyreonFlowState(nodes = q.nodes, selectionOnDrag = true)
    check(partialSelection.nodesInSelection(PyreonXYPosition(0.0, 0.0), PyreonXYPosition(20.0, 30.0)) == listOf("p", "c"), "partial selection uses overlap and absolute child coordinates")
    val fullSelection = PyreonFlowState(nodes = q.nodes, selectionOnDrag = true, selectionMode = "full")
    check(fullSelection.nodesInSelection(PyreonXYPosition(10.0, 20.0), PyreonXYPosition(165.0, 67.0)) == listOf("c"), "full selection requires complete containment")
    q.containerSize = com.pyreon.runtime.PyreonFlowContainerSize(300.0, 200.0)
    q.fitView(listOf("c"), padding = 0.0)
    check(q.flowToScreenPosition(PyreonXYPosition(90.0, 47.0)) == PyreonXYPosition(150.0, 100.0), "fitView centers a nested node from its absolute position")
    val padded = PyreonFlowState(nodes = listOf(PyreonFlowNode(id = "p", position = PyreonXYPosition(0.0, 0.0), data = NodeData("P"), width = 100.0, height = 100.0)), fitViewPadding = 0.5)
    padded.containerSize = com.pyreon.runtime.PyreonFlowContainerSize(200.0, 200.0); padded.fitView()
    check(padded.zoom == 1.0, "fitView without an override uses configured padding")
    q.zoomTo(2.0)
    q.panTo(PyreonXYPosition(10.0, 5.0))
    val screen = q.flowToScreenPosition(PyreonXYPosition(25.0, 15.0))
    check(q.screenToFlowPosition(screen) == PyreonXYPosition(25.0, 15.0), "screen/flow transforms are inverses")
    check(q.isNodeVisible("p") && !q.isNodeVisible("x"), "visibility uses viewport, size and node bounds")
    q.selectNodes(listOf("p", "c"))
    q.moveSelectedNodes(3.0, 4.0)
    check(q.getNode("p")?.position == PyreonXYPosition(13.0, 24.0) && q.getNode("c")?.position == PyreonXYPosition(8.0, 11.0), "multi-node move updates exactly the selection")
    q.focusNode("c", 1.5)
    check(q.viewport.zoom == 1.5 && q.selectedNodes() == listOf("c"), "focusNode centers and selects with clamped zoom")
    q.removeEdges(listOf("cx"))
    q.removeNodes(listOf("p"))
    check(q.getNode("p") == null && q.getEdge("pc") == null && q.getEdge("cx") == null, "bulk removals prune connected edges")
    q.addNodes(listOf(PyreonFlowNode(id = "n", position = PyreonXYPosition(1.0, 2.0), data = NodeData("New")), PyreonFlowNode(id = "n", position = PyreonXYPosition(9.0, 9.0), data = NodeData("Duplicate"))))
    q.addEdges(listOf(PyreonFlowEdge(id = "nn", source = "n", target = "n"), PyreonFlowEdge(id = "nn", source = "n", target = "x")))
    check(q.getNode("n")?.position?.x == 1.0 && q.getEdge("nn")?.target == "n", "bulk adds ignore duplicate ids")
    q.selectNode("n")
    q.selectEdge("nn", additive = true)
    q.setNodes(listOf(PyreonFlowNode(id = "x", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Only"))))
    check(q.selectedNodes().isEmpty() && q.getEdge("nn") == null, "setNodes prunes selection and newly disconnected edges")
    q.setEdges(listOf(PyreonFlowEdge(id = "fresh", source = "x", target = "x")))
    check(q.edges.map { it.id } == listOf("fresh") && q.getEdge("fresh")?.type == "bezier" && q.selectedEdges().isEmpty(), "setEdges normalizes and prunes selection")
    q.setNodes { nodes -> nodes + PyreonFlowNode(id = "callback", position = PyreonXYPosition(2.0, 3.0), data = NodeData("Callback")) }
    q.setEdges { edges -> edges + PyreonFlowEdge(id = "callback-edge", source = "x", target = "callback") }
    check(q.nodes.map { it.id } == listOf("x", "callback") && q.edges.map { it.id } == listOf("fresh", "callback-edge"), "setNodes and setEdges callbacks receive and replace current collections")
    q.setViewport(PyreonFlowViewport(1.0, 2.0, 2.0))
    q.setViewport { PyreonFlowViewport(it.x + 3.0, it.y, it.zoom) }
    q.replaceContainerSize(com.pyreon.runtime.PyreonFlowContainerSize(640.0, 480.0))
    q.updateContainerSize { com.pyreon.runtime.PyreonFlowContainerSize(it.width, it.height + 20.0) }
    check(q.viewport == PyreonFlowViewport(4.0, 2.0, 2.0) && q.containerSize == com.pyreon.runtime.PyreonFlowContainerSize(640.0, 500.0), "signal-compatible viewport and container updates use current values")
    q.setNodeExtent(minX = 0.0, minY = 10.0, maxX = 200.0, maxY = 300.0)
    check(q.clampToExtent(PyreonXYPosition(500.0, -2.0), 20.0, 30.0) == PyreonXYPosition(180.0, 10.0), "clampToExtent applies node dimensions")
    q.updateNodePosition("x", PyreonXYPosition(500.0, 500.0))
    check(q.getNode("x")?.position == PyreonXYPosition(50.0, 260.0), "position updates automatically use the configured extent and default dimensions")
    q.clearNodeExtent()
    check(q.clampToExtent(PyreonXYPosition(500.0, -2.0)) == PyreonXYPosition(500.0, -2.0), "clearing the extent restores unconstrained positions")
    val snapped = PyreonFlowState(nodes = listOf(PyreonFlowNode(id = "s", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Snap"))), snapToGrid = true, snapGrid = 10.0, nodeExtent = PyreonFlowNodeExtent(-100.0, -100.0, 200.0, 200.0))
    snapped.updateNodePosition("s", PyreonXYPosition(-5.0, 16.0))
    check(snapped.getNode("s")?.position == PyreonXYPosition(0.0, 20.0), "grid snapping matches JavaScript Math.round, including negative halves")
    val nested = PyreonFlowState(nodes = listOf(
        PyreonFlowNode(id = "parent", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Parent"), width = 100.0, height = 100.0),
        PyreonFlowNode(id = "child", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Child"), width = 30.0, height = 20.0, parentId = "parent", extentParent = true, expandParent = true),
        PyreonFlowNode(id = "boxed", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Boxed"), width = 30.0, height = 20.0, extent = PyreonFlowNodeExtent(10.0, 20.0, 100.0, 90.0)),
    ))
    nested.updateNodePosition("child", PyreonXYPosition(120.0, 110.0))
    check(nested.getNode("child")?.position == PyreonXYPosition(70.0, 80.0), "parent extent constrains child positions using child dimensions")
    nested.updateNode("child") { it.copy(extentParent = false) }
    nested.updateNodePosition("child", PyreonXYPosition(120.0, 110.0))
    check(nested.getNode("parent")?.width == 150.0 && nested.getNode("parent")?.height == 130.0, "expandParent grows the parent when an unconstrained child moves beyond it")
    nested.updateNodePosition("boxed", PyreonXYPosition(500.0, -10.0))
    check(nested.getNode("boxed")?.position == PyreonXYPosition(70.0, 20.0), "a node-specific numeric extent overrides the flow extent")
    // Per-id storage: a position write must not disturb order or the other nodes.
    et.updateNodePosition("2", PyreonXYPosition(50.0, 50.0))
    check(et.nodes.map { it.id } == listOf("1", "2", "3"), "updateNodePosition keeps insertion order")
    check(et.getNode("2")?.position == PyreonXYPosition(50.0, 50.0) && et.getNode("1")?.position == PyreonXYPosition(0.0, 0.0), "only the written node moved")

    println("PyreonFlowStateTest: all checks passed")
}
