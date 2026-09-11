// PyreonFlowState behaviour assertions (Android). Byte-aligned with the TS
// `flow.test.ts` semantics and the Swift test: the SAME node/edge/selection/
// viewport results, so a diagram behaves identically on web, iOS, and Android.

import com.pyreon.runtime.PyreonFlowEdge
import com.pyreon.runtime.PyreonFlowConnection
import com.pyreon.runtime.PyreonFlowNode
import com.pyreon.runtime.PyreonFlowNodeExtent
import com.pyreon.runtime.PyreonFlowState
import com.pyreon.runtime.PyreonFlowViewport
import com.pyreon.runtime.PyreonXYPosition
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
    edges = listOf(
        PyreonFlowEdge(id = "e1", source = "1", target = "2"),
        PyreonFlowEdge(id = "e2", source = "2", target = "3"),
    ),
)

fun main() {
    // 1. Seed + basic reads.
    val f = seedFlow()
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
    val disabledDefaults = PyreonFlowState(nodes = listOf(PyreonFlowNode("kept", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Kept")), PyreonFlowNode("other", position = PyreonXYPosition(20.0, 0.0), data = NodeData("Other"))), nodesDraggable = false, nodesConnectable = false, nodesSelectable = false, nodesFocusable = false, edgesFocusable = false, nodesDeletable = false, edgesDeletable = false, edgesReconnectable = false, edgeInteractionWidth = 33.0, connectionRadius = -4.0, pannable = false, zoomable = false, multiSelect = false, defaultEdgeType = "step", fitViewOnLoad = true, fitViewPadding = 0.2)
    disabledDefaults.addEdge(PyreonFlowEdge("defaulted", "kept", "kept"))
    disabledDefaults.selectNode("kept"); disabledDefaults.deleteSelected()
    check(disabledDefaults.getNode("kept") != null && disabledDefaults.connectionRadius == 0.0, "global deletion default protects nodes and connection radius clamps nonnegative")
    check(!disabledDefaults.nodesDraggable && !disabledDefaults.nodesConnectable && !disabledDefaults.pannable && disabledDefaults.edgeInteractionWidth == 33.0, "native interaction defaults retain explicit global disables")
    check(disabledDefaults.getEdge("defaulted")?.type == "step" && disabledDefaults.fitViewOnLoad && disabledDefaults.fitViewPadding == 0.2, "edge type and initial fit defaults are retained")
    disabledDefaults.selectNode("kept"); disabledDefaults.selectNode("other", additive = true)
    check(disabledDefaults.selectedNodes() == listOf("other"), "multiSelect false converts additive selection to replacement")

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
    q.containerSize = com.pyreon.runtime.PyreonFlowContainerSize(300.0, 200.0)
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
    q.setNodeExtent(minX = 0.0, minY = 10.0, maxX = 200.0, maxY = 300.0)
    check(q.clampToExtent(PyreonXYPosition(500.0, -2.0), 20.0, 30.0) == PyreonXYPosition(180.0, 10.0), "clampToExtent applies node dimensions")
    q.updateNodePosition("x", PyreonXYPosition(500.0, 500.0))
    check(q.getNode("x")?.position == PyreonXYPosition(50.0, 260.0), "position updates automatically use the configured extent and default dimensions")
    q.clearNodeExtent()
    check(q.clampToExtent(PyreonXYPosition(500.0, -2.0)) == PyreonXYPosition(500.0, -2.0), "clearing the extent restores unconstrained positions")
    val snapped = PyreonFlowState(nodes = listOf(PyreonFlowNode(id = "s", position = PyreonXYPosition(0.0, 0.0), data = NodeData("Snap"))), snapToGrid = true, snapGrid = 10.0, nodeExtent = PyreonFlowNodeExtent(-100.0, -100.0, 200.0, 200.0))
    snapped.updateNodePosition("s", PyreonXYPosition(-5.0, 16.0))
    check(snapped.getNode("s")?.position == PyreonXYPosition(0.0, 20.0), "grid snapping matches JavaScript Math.round, including negative halves")
    // Per-id storage: a position write must not disturb order or the other nodes.
    et.updateNodePosition("2", PyreonXYPosition(50.0, 50.0))
    check(et.nodes.map { it.id } == listOf("1", "2", "3"), "updateNodePosition keeps insertion order")
    check(et.getNode("2")?.position == PyreonXYPosition(50.0, 50.0) && et.getNode("1")?.position == PyreonXYPosition(0.0, 0.0), "only the written node moved")

    println("PyreonFlowStateTest: all checks passed")
}
