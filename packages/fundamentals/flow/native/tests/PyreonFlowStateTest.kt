// PyreonFlowState behaviour assertions (Android). Byte-aligned with the TS
// `flow.test.ts` semantics and the Swift test: the SAME node/edge/selection/
// viewport results, so a diagram behaves identically on web, iOS, and Android.

import com.pyreon.runtime.PyreonFlowEdge
import com.pyreon.runtime.PyreonFlowNode
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
    g.deleteSelected()
    check(g.nodes.isEmpty(), "deleteSelected removes every selected node")
    check(g.edges.isEmpty(), "deleteSelected's node removal cascades to connected edges")

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

    println("PyreonFlowStateTest: all checks passed")
}
