// PyreonFlowState + PyreonFlowEdgeCanvas behaviour assertions (iOS).
// Byte-aligned with the TS `flow.test.ts` semantics: the SAME node/edge/
// selection/viewport results, so a diagram behaves identically on web, iOS,
// and Android. ONE `@main` entry point — the co-source verify gate compiles
// every `native/tests/*.swift` file together into a single executable, so
// two `@main` structs collide at link time (a real trap: duplicate `_main`).

import Foundation
import SwiftUI

struct NodeData {
    let label: String
}

@available(iOS 17.0, macOS 14.0, *)
@main
struct PyreonFlowStateTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonFlowStateTests: \(m)") }
    }

    static func seedFlow() -> PyreonFlowState<NodeData> {
        PyreonFlowState(
            nodes: [
                PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Start")),
                PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200, y: 0), data: NodeData(label: "Mid")),
                PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400, y: 0), data: NodeData(label: "End")),
            ],
            edges: [
                PyreonFlowEdge(id: "e1", source: "1", target: "2"),
                PyreonFlowEdge(id: "e2", source: "2", target: "3"),
            ]
        )
    }

    static func runStateChecks() {
        // 1. Seed + basic reads.
        let f = seedFlow()
        check(f.nodes.count == 3, "seeded 3 nodes")
        check(f.edges.count == 2, "seeded 2 edges")
        check(f.getNode("2")?.data.label == "Mid", "getNode reads the seeded data")
        check(f.getNode("nope") == nil, "getNode misses a missing id")
        check(f.getEdge("e1")?.source == "1", "getEdge reads the seeded edge")

        // 2. addNode / addEdge.
        f.addNode(PyreonFlowNode(id: "4", position: PyreonXYPosition(x: 600, y: 0), data: NodeData(label: "Extra")))
        check(f.nodes.count == 4, "addNode appends")
        f.addEdge(PyreonFlowEdge(id: "e3", source: "3", target: "4"))
        check(f.edges.count == 3, "addEdge appends")
        // Dedup by id — a second addEdge with the same id is a no-op, matching
        // the web `addEdge`'s "don't add duplicate edges" contract.
        f.addEdge(PyreonFlowEdge(id: "e3", source: "1", target: "4"))
        check(f.edges.count == 3, "addEdge dedupes by id")
        check(f.getEdge("e3")?.source == "3", "the FIRST e3 wins, not the dup")

        // 3. updateNodePosition.
        f.updateNodePosition("2", PyreonXYPosition(x: 999, y: 999))
        check(f.getNode("2")?.position.x == 999, "updateNodePosition moves the node")
        check(f.getNode("1")?.position.x == 0, "updateNodePosition leaves other nodes alone")

        // 4. removeNode also removes connected edges.
        f.removeNode("2")
        check(f.nodes.count == 3, "removeNode removes the node")
        check(f.getNode("2") == nil, "removed node is gone")
        check(f.edges.count == 1, "removeNode removes edges touching it (e1, e2 both gone)")
        check(f.getEdge("e3") != nil, "removeNode leaves unrelated edges alone")

        // 5. removeEdge.
        f.removeEdge("e3")
        check(f.edges.isEmpty, "removeEdge removes it")

        // 6. Selection — non-additive replaces; additive appends; node vs edge
        //    selection are mutually exclusive unless additive.
        let g = seedFlow()
        g.selectNode("1")
        check(g.isNodeSelected("1"), "selectNode selects")
        check(g.selectedNodes() == ["1"], "selectedNodes reflects it")
        g.selectNode("2")
        check(g.selectedNodes() == ["2"], "non-additive selectNode REPLACES, not appends")
        g.selectNode("3", additive: true)
        check(g.selectedNodes() == ["2", "3"], "additive selectNode appends")
        g.deselectNode("2")
        check(g.selectedNodes() == ["3"], "deselectNode removes just that id")
        g.selectEdge("e1")
        check(g.selectedNodes().isEmpty, "non-additive selectEdge clears node selection")
        check(g.isEdgeSelected("e1"), "selectEdge selects")
        g.selectNode("1")
        check(g.selectedEdges().isEmpty, "non-additive selectNode clears edge selection")
        g.clearSelection()
        check(g.selectedNodes().isEmpty && g.selectedEdges().isEmpty, "clearSelection clears both")
        g.selectAll()
        check(g.selectedNodes().count == 3, "selectAll selects every node")
        g.deleteSelected()
        check(g.nodes.isEmpty, "deleteSelected removes every selected node")
        check(g.edges.isEmpty, "deleteSelected's node removal cascades to connected edges")

        // 7. Viewport — zoomTo clamps, zoomIn/zoomOut are the 1.2x factor, panTo
        //    is an ABSOLUTE pan-to-point (not relative).
        let h = seedFlow()
        check(h.zoom == 1, "default zoom is 1")
        h.zoomTo(10)
        check(h.viewport.zoom == 4, "zoomTo clamps to maxZoom (default 4)")
        h.zoomTo(0.01)
        check(h.viewport.zoom == 0.1, "zoomTo clamps to minZoom (default 0.1)")
        h.zoomTo(1)
        h.zoomIn()
        check(abs(h.viewport.zoom - 1.2) < 0.0001, "zoomIn multiplies by 1.2")
        h.zoomOut()
        check(abs(h.viewport.zoom - 1.0) < 0.0001, "zoomOut divides by 1.2 (inverse of zoomIn)")
        h.panTo(PyreonXYPosition(x: 50, y: 25))
        check(h.viewport.x == -50 && h.viewport.y == -25, "panTo at zoom 1 sets origin to -position")

        // 8. fitView — no-op with no measured container; frames the graph once sized.
        let k = seedFlow()
        k.fitView()
        check(k.viewport == PyreonFlowViewport(), "fitView no-ops before containerSize is set")
        k.containerSize = (width: 800, height: 400)
        k.fitView()
        check(k.viewport.zoom > 0 && k.viewport.zoom <= 4, "fitView picks a real, clamped zoom")
        // The graph spans x:[0,550] (node 3 at x=400 + default width 150), so
        // its center (275) should land near the container's horizontal center
        // once framed, within the padding fudge.
        let expectedCenterX = 275.0 * k.viewport.zoom + k.viewport.x
        check(abs(expectedCenterX - 400) < 1, "fitView centers the graph in the container")

        // 9. Graph queries.
        let m = seedFlow()
        check(m.getConnectedEdges("2").count == 2, "getConnectedEdges finds both e1 and e2")
        check(m.getIncomers("2").map { $0.id } == ["1"], "getIncomers walks edges INTO the node")
        check(m.getOutgoers("2").map { $0.id } == ["3"], "getOutgoers walks edges OUT of the node")
        check(m.getIncomers("1").isEmpty, "a source-only node has no incomers")

        print("PyreonFlowStateTests: state checks passed")
    }

    /// PyreonFlowEdgeCanvas geometry — real execution against the actual
    /// SwiftUI `Path` type (not a stub), inspecting the built path's element
    /// sequence + bounding box rather than pixels, mirroring how
    /// PyreonChartEngineTests verifies draw-list construction.
    static func runEdgeCanvasChecks() {
        // 1. A straight two-point edge — move + line, endpoints exact.
        let straight = pyreonFlowEdgePath([.move(0, 0), .line(100, 50)])
        let box1 = straight.boundingRect
        check(box1.minX == 0 && box1.minY == 0, "straight path starts at the origin")
        check(box1.maxX == 100 && box1.maxY == 50, "straight path ends at the target")

        // 2. A cubic bezier — the built path's bounding box must contain both
        //    endpoints AND both control points (Path grows its bbox to fit the
        //    curve's convex hull, so a control point outside the endpoint span
        //    proves the curve segment (not just a line) was actually added).
        let curve = pyreonFlowEdgePath([
            .move(0, 0),
            .cubic(100, 0, c1x: 0, c1y: 80, c2x: 100, c2y: 80),
        ])
        let box2 = curve.boundingRect
        check(box2.maxY >= 40, "a bowed-out cubic's bbox extends past the endpoint span (control points at y=80 pull it down)")

        // 3. A quad segment with a missing control point is SKIPPED, not
        //    crashed — the same defensive `guard` an incomplete segment from a
        //    malformed bridge payload would hit.
        let incomplete = PyreonFlowEdgeSegment(kind: "quad", x: 10, y: 10)
        let safe = pyreonFlowEdgePath([.move(0, 0), incomplete])
        check(safe.boundingRect.maxX == 0 && safe.boundingRect.maxY == 0, "an incomplete quad segment is skipped, not drawn as a stray point")

        // 4. Multi-segment path (the smoothstep shape: line, quad, line) traces
        //    through every declared point in order.
        let stepShape = pyreonFlowEdgePath([
            .move(0, 0),
            .line(20, 0),
            .quad(40, 20, cx: 40, cy: 0),
            .line(40, 100),
        ])
        let box4 = stepShape.boundingRect
        check(box4.maxX == 40 && box4.maxY == 100, "multi-segment path's bbox spans every point")

        // 5. Color parsing — 3-digit and 6-digit hex agree with the literal
        //    RGB construction, and a non-hex string falls back to gray.
        check(
            pyreonFlowEdgeColor("#ff0000") == Color(red: 1, green: 0, blue: 0),
            "6-digit hex parses to the exact RGB it encodes",
        )
        check(
            pyreonFlowEdgeColor("#f00") == Color(red: 1, green: 0, blue: 0),
            "3-digit hex shorthand expands to the same color as its 6-digit form",
        )
        check(pyreonFlowEdgeColor("not-a-color") == Color.gray, "an unrecognized color string falls back to gray")

        print("PyreonFlowEdgeCanvasTests: edge canvas checks passed")
    }

    static func main() {
        runStateChecks()
        runEdgeCanvasChecks()
        print("PyreonFlowStateTests: all checks passed")
    }
}
