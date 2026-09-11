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

        let initialStrokes = pyreonFlowEdgeStrokes(state: f)
        check(initialStrokes.map(\.id) == ["e1", "e2"], "native host derives every visible edge")
        f.addEdge(PyreonFlowEdge(id: "dangling", source: "missing", target: "1"))
        check(!pyreonFlowEdgeStrokes(state: f).contains { $0.id == "dangling" }, "native host omits edges with missing endpoints")
        f.removeEdge("dangling")
        f.containerSize = PyreonFlowContainerSize(width: 400, height: 200)
        let mini = pyreonFlowMiniMapLayout(state: f, width: 200, height: 150)
        check(mini.nodes.map(\.id) == ["1", "2", "3"], "minimap derives every visible node")
        check(mini.scale > 0 && mini.viewport.width > 0, "minimap derives graph scale and viewport indicator")

        let configuredNode = PyreonFlowNode(
            id: "configured", position: PyreonXYPosition(x: 1, y: 2), data: NodeData(label: "Configured"),
            draggable: false, selectable: true, connectable: false, focusable: true,
            ariaLabel: "Configured node", hidden: false, deletable: true,
            parentId: "group", expandParent: true, group: true
        )
        check(configuredNode.draggable == false && configuredNode.parentId == "group" && configuredNode.ariaLabel == "Configured node", "node interaction/accessibility/group fields are retained")
        let configuredEdge = PyreonFlowEdge(
            id: "configured-edge", source: "1", target: "2", sourceHandle: "out", targetHandle: "in",
            focusable: true, ariaLabel: "Configured edge", hidden: false, deletable: true,
            reconnectable: false, interactionWidth: 24
        )
        check(configuredEdge.sourceHandle == "out" && configuredEdge.targetHandle == "in" && configuredEdge.interactionWidth == 24, "edge handle/interaction fields are retained")

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
        // Web parity: `selectAll` (flow.ts) replaces ONLY the node set. v1 of
        // both native ports also cleared the edge set — locked in by omission.
        g.selectEdge("e1")
        g.selectAll()
        check(g.selectedEdges() == ["e1"], "selectAll leaves edge selection alone (web parity)")
        check(g.selectedNodes() == ["1", "2", "3"], "selectAll keeps node insertion order")
        g.deleteSelected()
        check(g.nodes.isEmpty, "deleteSelected removes every selected node")
        check(g.edges.isEmpty, "deleteSelected's node removal cascades to connected edges")

        // 6b. deleteSelected's MIXED case: nodes AND edges selected together.
        //     The web reference resolves this in ONE pass over `edges` whose
        //     predicate covers BOTH concerns (connected-to-a-removed-node, and
        //     independently-edge-selected). A prior native version instead
        //     looped `removeNode`/`removeEdge` per id — same result, but
        //     O(K x (N + E)) instead of O(N + E). These assertions pin the
        //     RESULT so the single-pass rewrite is provably equivalent; the
        //     complexity itself is a property of the code shape, checked by
        //     review rather than by a wall-clock assertion that would flake.
        let delMixed = seedFlow()
        delMixed.selectNode("1")
        delMixed.selectEdge("e2", additive: true)
        check(delMixed.selectedNodes() == ["1"] && delMixed.selectedEdges() == ["e2"], "mixed selection holds both")
        delMixed.deleteSelected()
        check(delMixed.nodes.map(\.id) == ["2", "3"], "mixed delete removes only the selected node")
        // e1 goes because it is CONNECTED to removed node 1; e2 goes because it
        // was independently selected. Both in the same single pass.
        check(delMixed.edges.isEmpty, "mixed delete removes connected AND independently-selected edges")
        check(delMixed.selectedNodes().isEmpty && delMixed.selectedEdges().isEmpty, "mixed delete clears selection")

        // 6c. EDGES-ONLY selection takes the second branch (no node pass at
        //     all) — nodes must be untouched.
        let delEdgesOnly = seedFlow()
        delEdgesOnly.selectEdge("e1")
        delEdgesOnly.deleteSelected()
        check(delEdgesOnly.nodes.count == 3, "edges-only delete leaves every node")
        check(delEdgesOnly.edges.map(\.id) == ["e2"], "edges-only delete removes just that edge")

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
        h.setViewport(x: 12, zoom: 8)
        check(h.viewport == PyreonFlowViewport(x: 12, y: -25, zoom: 8), "setViewport merges partial fields without clamping")
        h.containerSize = PyreonFlowContainerSize(width: 200, height: 100)
        h.setCenter(10, 20, zoom: 2)
        check(h.viewport == PyreonFlowViewport(x: 80, y: 10, zoom: 2), "setCenter centers with a clamped optional zoom")

        // 8. fitView — no-op with no measured container; frames the graph once sized.
        let k = seedFlow()
        k.fitView()
        check(k.viewport == PyreonFlowViewport(), "fitView no-ops before containerSize is set")
        k.containerSize = PyreonFlowContainerSize(width: 800, height: 400)
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

        // 10. Edge `type` default — web `normalizeEdge`: `type ?? 'bezier'`.
        let et = seedFlow()
        check(et.getEdge("e1")?.type == "bezier", "a seeded edge without a type reads 'bezier' (web parity)")
        et.addEdge(PyreonFlowEdge(id: "e9", source: "1", target: "3"))
        check(et.getEdge("e9")?.type == "bezier", "addEdge applies the 'bezier' default")
        et.addEdge(PyreonFlowEdge(id: "e10", source: "1", target: "3", type: "step"))
        check(et.getEdge("e10")?.type == "step", "an explicit edge type is kept")
        et.addEdge(PyreonFlowEdge(id: "ew", source: "1", target: "2", waypoints: [PyreonXYPosition(x: 10, y: 10)]))
        et.addEdgeWaypoint("ew", PyreonXYPosition(x: 20, y: 20), -1)
        check(et.getEdge("ew")?.waypoints.map(\.x) == [20, 10], "negative waypoint insertion mirrors Array.splice")
        et.updateEdgeWaypoint("ew", 1, PyreonXYPosition(x: 30, y: 30))
        et.removeEdgeWaypoint("ew", -1)
        check(et.getEdge("ew")?.waypoints == [PyreonXYPosition(x: 20, y: 20)], "waypoint update/removal preserves the remaining route")
        et.reconnectEdge("ew", target: "3", targetHandle: "in")
        check(et.getEdge("ew")?.target == "3" && et.getEdge("ew")?.targetHandle == "in", "reconnect changes only supplied endpoints")

        // 11. Bulk operations, coordinate conversion, visibility and groups.
        let q = PyreonFlowState(nodes: [
            PyreonFlowNode(id: "p", position: PyreonXYPosition(x: 10, y: 20), data: NodeData(label: "Parent"), width: 100, height: 80, group: true),
            PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 5, y: 7), data: NodeData(label: "Child"), parentId: "p"),
            PyreonFlowNode(id: "x", position: PyreonXYPosition(x: 400, y: 400), data: NodeData(label: "Other")),
        ], edges: [PyreonFlowEdge(id: "pc", source: "p", target: "c"), PyreonFlowEdge(id: "cx", source: "c", target: "x")])
        check(q.nodes.count == 3 && q.edges.count == 2, "plain collection reads preserve all values")
        check(q.getChildNodes("p").map(\.id) == ["c"], "getChildNodes preserves insertion order")
        check(q.getAbsolutePosition("c") == PyreonXYPosition(x: 15, y: 27), "absolute position folds parent offsets")
        q.containerSize = PyreonFlowContainerSize(width: 300, height: 200)
        q.zoomTo(2)
        q.panTo(PyreonXYPosition(x: 10, y: 5))
        let screen = q.flowToScreenPosition(PyreonXYPosition(x: 25, y: 15))
        check(q.screenToFlowPosition(screen) == PyreonXYPosition(x: 25, y: 15), "screen/flow transforms are inverses")
        check(q.isNodeVisible("p") && !q.isNodeVisible("x"), "visibility uses viewport, size and node bounds")
        q.selectNodes(["p", "c"])
        q.moveSelectedNodes(3, 4)
        check(q.getNode("p")?.position == PyreonXYPosition(x: 13, y: 24) && q.getNode("c")?.position == PyreonXYPosition(x: 8, y: 11), "multi-node move updates exactly the selection")
        q.focusNode("c", 1.5)
        check(q.viewport.zoom == 1.5 && q.selectedNodes() == ["c"], "focusNode centers and selects with clamped zoom")
        q.removeEdges(["cx"])
        q.removeNodes(["p"])
        check(q.getNode("p") == nil && q.getEdge("pc") == nil && q.getEdge("cx") == nil, "bulk removals prune connected edges")
        q.addNodes([PyreonFlowNode(id: "n", position: PyreonXYPosition(x: 1, y: 2), data: NodeData(label: "New")), PyreonFlowNode(id: "n", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "Duplicate"))])
        q.addEdges([PyreonFlowEdge(id: "nn", source: "n", target: "n"), PyreonFlowEdge(id: "nn", source: "n", target: "x")])
        check(q.getNode("n")?.position.x == 1 && q.getEdge("nn")?.target == "n", "bulk adds ignore duplicate ids")
        q.selectNode("n")
        q.selectEdge("nn", additive: true)
        q.setNodes([PyreonFlowNode(id: "x", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Only"))])
        check(q.selectedNodes().isEmpty && q.getEdge("nn") == nil, "setNodes prunes selection and newly disconnected edges")
        q.setEdges([PyreonFlowEdge(id: "fresh", source: "x", target: "x")])
        check(q.edges.map(\.id) == ["fresh"] && q.getEdge("fresh")?.type == "bezier" && q.selectedEdges().isEmpty, "setEdges normalizes and prunes selection")
        q.setNodeExtent(minX: 0, minY: 10, maxX: 200, maxY: 300)
        check(q.clampToExtent(PyreonXYPosition(x: 500, y: -2), 20, 30) == PyreonXYPosition(x: 180, y: 10), "clampToExtent applies node dimensions")
        q.updateNodePosition("x", PyreonXYPosition(x: 500, y: 500))
        check(q.getNode("x")?.position == PyreonXYPosition(x: 50, y: 260), "position updates automatically use the configured extent and default dimensions")
        q.clearNodeExtent()
        check(q.clampToExtent(PyreonXYPosition(x: 500, y: -2)) == PyreonXYPosition(x: 500, y: -2), "clearing the extent restores unconstrained positions")
        let snapped = PyreonFlowState(nodes: [PyreonFlowNode(id: "s", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Snap"))], snapToGrid: true, snapGrid: 10, nodeExtent: PyreonFlowNodeExtent(minX: -100, minY: -100, maxX: 200, maxY: 200))
        snapped.updateNodePosition("s", PyreonXYPosition(x: -5, y: 16))
        check(snapped.getNode("s")?.position == PyreonXYPosition(x: 0, y: 20), "grid snapping matches JavaScript Math.round, including negative halves")

        // 12. Observation granularity — THE performance contract. A tracker
        // reading node "1" must not fire when node "2" moves. With one
        // `@Observable` array property (v1) it did: 1000/1000 node views
        // invalidated per drag frame at N = 1,000. Per-node boxes make a
        // position write invalidate only that node's readers (web: O(1+deg)).
        let ob = seedFlow()
        nonisolated(unsafe) var firedForNode1 = 0
        @Sendable func track1() {
            withObservationTracking {
                _ = ob.getNode("1")?.position
            } onChange: {
                firedForNode1 += 1
                track1()
            }
        }
        track1()
        ob.updateNodePosition("2", PyreonXYPosition(x: 5, y: 5))
        ob.zoomTo(2)
        ob.selectNode("3")
        check(firedForNode1 == 0, "moving node 2 / zooming / selecting must NOT invalidate a reader of node 1 (got \(firedForNode1))")
        ob.updateNodePosition("1", PyreonXYPosition(x: 7, y: 7))
        check(firedForNode1 == 1, "moving node 1 invalidates its reader exactly once (got \(firedForNode1))")
        nonisolated(unsafe) var firedForAll = 0
        withObservationTracking { _ = ob.nodes.count } onChange: { firedForAll += 1 }
        ob.updateNodePosition("2", PyreonXYPosition(x: 9, y: 9))
        check(firedForAll == 1, "a reader of the whole `nodes` array still sees every change")

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

        let routedStraight = pyreonStraightPath(sourceX: 0, sourceY: 0, targetX: 100, targetY: 50)
        check(routedStraight.labelX == 50 && routedStraight.labelY == 25 && routedStraight.segments.count == 2, "straight routing returns midpoint and segments")
        let routedBezier = pyreonBezierPath(sourceX: 0, sourceY: 0, sourcePosition: .right, targetX: 200, targetY: 100, targetPosition: .left)
        check(routedBezier.segments[1].c1x! > 0 && routedBezier.segments[1].c2x! < 200, "bezier routing offsets controls along handle directions")
        let routedWaypoint = pyreonWaypointPath(sourceX: 0, sourceY: 0, targetX: 100, targetY: 100, waypoints: [PyreonXYPosition(x: 25, y: 30), PyreonXYPosition(x: 75, y: 80)])
        check(routedWaypoint.labelX == 75 && routedWaypoint.labelY == 80 && routedWaypoint.segments.count == 4, "waypoint routing uses the middle waypoint label and every segment")
        let orientations: [(PyreonFlowPosition, PyreonFlowPosition, [String])] = [
            (.right, .top, ["move:0.0,0.0", "line:20.0,0.0", "line:20.0,55.0", "quad:25.0,60.0", "line:100.0,60.0", "line:100.0,80.0"]),
            (.bottom, .left, ["move:0.0,0.0", "line:0.0,20.0", "line:75.0,20.0", "quad:80.0,25.0", "line:80.0,80.0", "line:100.0,80.0"]),
            (.right, .left, ["move:0.0,0.0", "line:20.0,0.0", "line:50.0,0.0", "quad:50.0,40.0", "line:50.0,80.0", "line:80.0,80.0", "line:100.0,80.0"]),
            (.bottom, .top, ["move:0.0,0.0", "line:0.0,20.0", "line:0.0,40.0", "quad:50.0,40.0", "line:100.0,40.0", "line:100.0,60.0", "line:100.0,80.0"]),
        ]
        for (sourceSide, targetSide, expected) in orientations {
            let route = pyreonSmoothStepPath(sourceX: 0, sourceY: 0, sourcePosition: sourceSide, targetX: 100, targetY: 80, targetPosition: targetSide, borderRadius: 5, offset: 20)
            check(route.segments.map { "\($0.kind):\($0.x),\($0.y)" } == expected, "every smoothstep orientation exactly matches the web segment packet")
        }
        let nativeStep = pyreonStepPath(sourceX: 0, sourceY: 0, sourcePosition: .right, targetX: 100, targetY: 80, targetPosition: .left)
        check(nativeStep == pyreonSmoothStepPath(sourceX: 0, sourceY: 0, sourcePosition: .right, targetX: 100, targetY: 80, targetPosition: .left, borderRadius: 0), "step is exactly smoothstep with a zero-radius corner")
        check(pyreonHandlePosition(.right, nodeX: 0, nodeY: 0, nodeWidth: 150, nodeHeight: 40) == PyreonXYPosition(x: 150, y: 20), "right handle uses the node-side midpoint")
        let sourceBox = PyreonFlowRect(x: 0, y: 0, width: 150, height: 40)
        let targetBox = PyreonFlowRect(x: 200, y: 100, width: 150, height: 40)
        check(pyreonNodeIntersection(sourceBox, toward: PyreonXYPosition(x: 275, y: 120)) == PyreonXYPosition(x: 115, y: 40), "node intersection matches the web perimeter crossing")
        let floating = pyreonFloatingEndpoints(source: sourceBox, target: targetBox)
        check(floating.source == PyreonFlowHandleAnchor(x: 115, y: 40, position: .bottom), "floating source exactly matches web")
        check(floating.target == PyreonFlowHandleAnchor(x: 235, y: 100, position: .top), "floating target exactly matches web")
        let configHandles = [PyreonFlowHandleConfig(id: "cfg", type: "source", position: .right)]
        let measurement = PyreonFlowNodeMeasurement(width: 180, height: 60, handles: [PyreonFlowMeasuredHandle(id: "real", type: "source", position: .bottom, x: 45, y: 61)])
        check(pyreonResolveHandleAnchor(nodeX: 10, nodeY: 20, nodeWidth: 200, nodeHeight: 80, handleId: "real", type: "source", config: configHandles, measurement: measurement) == PyreonFlowHandleAnchor(x: 55, y: 81, position: .bottom), "named measured handle wins with its exact rendered center")
        check(pyreonResolveHandleAnchor(nodeX: 10, nodeY: 20, nodeWidth: 200, nodeHeight: 80, handleId: "cfg", type: "source", config: configHandles, measurement: measurement) == PyreonFlowHandleAnchor(x: 210, y: 60, position: .right), "named config handle uses effective dimensions")
        check(pyreonResolveHandleAnchor(nodeX: 10, nodeY: 20, nodeWidth: 200, nodeHeight: 80, handleId: "missing", type: "source", config: configHandles, measurement: measurement)?.x == 55, "unknown id falls back to the first measured handle")
        let completeFloating = pyreonComputeEdgePath(type: "bezier", source: sourceBox, target: targetBox)
        check(completeFloating.labelX == 175 && completeFloating.labelY == 70 && completeFloating.segments[0] == .move(115, 40), "complete dispatcher matches web floating endpoints and label")
        check(abs(completeFloating.segments[1].c1y! - 73.54101966249684) < 0.000000001, "complete dispatcher matches web bezier control geometry")
        let completeHandled = pyreonComputeEdgePath(type: "straight", source: sourceBox, target: targetBox, sourceHandleId: "out", targetHandleId: "in", sourceHandles: configHandles, targetHandles: [PyreonFlowHandleConfig(id: "in", type: "target", position: .left)])
        check(completeHandled.segments == [.move(150, 20), .line(200, 120)], "complete dispatcher matches web configured-handle straight route")

        // 6. A stroke prebuilds its path/color/dash ONCE, at construction — the
        // draw closure must find nothing left to parse or allocate per edge.
        let stroke = PyreonFlowEdgeStroke(id: "e1", segments: [.move(0, 0), .line(100, 50)], color: "#f00", dash: [4, 2])
        check(stroke.path.boundingRect == pyreonFlowEdgePath([.move(0, 0), .line(100, 50)]).boundingRect, "stroke prebuilds its unscaled path")
        check(stroke.resolvedColor == Color(red: 1, green: 0, blue: 0), "stroke parses its color once")
        check(stroke.dashCG == [4, 2], "stroke converts its dash once")
        var moved = stroke
        moved.segments = [.move(0, 0), .line(10, 10)]
        check(moved.path.boundingRect.width == 10, "reassigning segments rebuilds the cached path")
        check(stroke == stroke && stroke != moved, "strokes are Equatable (so an unchanged draw list can be skipped)")
        check(PyreonFlowEdgeCanvas(edges: [stroke]) == PyreonFlowEdgeCanvas(edges: [stroke]), "the canvas is Equatable over edges + viewport")

        print("PyreonFlowEdgeCanvasTests: edge canvas checks passed")
    }

    static func main() {
        runStateChecks()
        runEdgeCanvasChecks()
        print("PyreonFlowStateTests: all checks passed")
    }
}
