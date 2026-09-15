// PyreonFlowState + PyreonFlowEdgeCanvas behaviour assertions (iOS).
// Byte-aligned with the TS `flow.test.ts` semantics: the SAME node/edge/
// selection/viewport results, so a diagram behaves identically on web, iOS,
// and Android. ONE `@main` entry point — the co-source verify gate compiles
// every `native/tests/*.swift` file together into a single executable, so
// two `@main` structs collide at link time (a real trap: duplicate `_main`).

import Foundation
import SwiftUI

struct NodeData {
    var label: String
}

@available(iOS 17.0, macOS 14.0, *)
@main
struct PyreonFlowStateTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonFlowStateTests: \(m)") }
    }

    static func seedFlow(reducedMotion: Bool? = nil) -> PyreonFlowState<NodeData> {
        PyreonFlowState(
            nodes: [
                PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Start")),
                PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200, y: 0), data: NodeData(label: "Mid")),
                PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400, y: 0), data: NodeData(label: "End")),
            ],
            edges: [
                PyreonFlowEdge(id: "e1", source: "1", target: "2"),
                PyreonFlowEdge(id: "e2", source: "2", target: "3"),
            ],
            searchText: { $0.label },
            reducedMotion: reducedMotion
        )
    }

    static func runStateChecks() {
        check(pyreonFlowEdgeId(source: "1", target: "2") == "e-1-2", "Apple generates missing edge ids like web")
        check(pyreonFlowEdgeId(source: "1", target: "2", sourceHandle: "out", targetHandle: "in") == "e-1-out-2-in", "Apple includes handles in generated edge ids")
        let configured = PyreonFlowState<NodeData>(
            defaultMarkerEnd: nil, panOnDrag: false, panOnScroll: true, panOnScrollSpeed: 0.75,
            zoomOnScroll: false, zoomOnPinch: false, zoomOnDoubleClick: true,
            connectionLineType: "step",
            reducedMotion: false, deleteKeys: ["ForwardDelete"], multiSelectionKey: "ctrl",
            selectionKey: nil, zoomActivationKey: "meta", preventScrolling: false)
        check(configured.panOnScroll && configured.panOnScrollSpeed == 0.75, "Apple retains scroll config")
        check(!configured.zoomOnScroll && configured.deleteKeys == ["ForwardDelete"], "Apple retains zoom/delete config")
        check(configured.multiSelectionKey == "ctrl" && configured.selectionKey == nil && configured.zoomActivationKey == "meta" && !configured.preventScrolling, "Apple retains modifier config")
        check(!configured.panOnDrag && !configured.zoomOnPinch && configured.zoomOnDoubleClick, "Apple retains direct-manipulation config")
        check(configured.connectionLineType == "step" && configured.defaultMarkerEnd == nil, "Apple retains connection presentation config")
        configured.minZoom = 0.75
        configured.pannable = false
        configured.zoomTo(0.1)
        check(configured.viewport.zoom == 0.75 && !configured.pannable, "Apple applies live mutable Flow config")
        let markerEdge = PyreonFlowEdge(id: "marker", source: "1", target: "2", markerStart: PyreonFlowMarker(type: "arrow", color: "#F00"))
        let resolvedMarker = pyreonResolveFlowEdgeMarkers(markerEdge, defaultMarkerEnd: pyreonFlowDefaultMarkerEnd)
        check(resolvedMarker.start?.color == "#F00" && resolvedMarker.end?.type == "arrowclosed", "Apple resolves per-edge and default markers")
        check(pyreonFlowMarkerId(PyreonFlowMarker(type: "arrow", color: "#F00")) == "pyreon-flow-marker-arrow-f00-10x7-1", "Apple marker ids match web formatting")
        check(pyreonCollectFlowEdgeMarkers([markerEdge, markerEdge], defaultMarkerEnd: pyreonFlowDefaultMarkerEnd).count == 2, "Apple marker collection deduplicates equal markers")
        // 1. Seed + basic reads.
        let f = seedFlow()
        f.updateNodeMeasurement("1", width: 240, height: 72)
        check(f.measurements["1"] == PyreonFlowNodeMeasurement(width: 240, height: 72), "SwiftUI host measurements are observable")
        f.updateNodeMeasurement("1", width: 240, height: 72, handles: [PyreonFlowMeasuredHandle(id: "out", type: "source", position: .right, x: 240, y: 36)])
        check(f.measurements["1"]?.handles.count == 1, "SwiftUI host records measured handle anchors")
        f.updateNodeMeasurement("1", width: 240, height: 72)
        check(f.measurements["1"]?.handles.isEmpty == true, "an omitted handle list clears stale anchors like the web engine")
        f.clearNodeMeasurement("1")
        check(f.measurements["1"] == nil, "explicit measurement cleanup removes the native entry")
        f.updateNodeMeasurement("1", width: 240, height: 72)
        f.updateMeasurements { $0 }
        check(f.measurements["1"]?.width == 240, "measurement callback replacement preserves entries")
        f.replaceMeasurements([:])
        check(f.measurements.isEmpty, "measurement signal replacement clears stale entries")
        f.updateNodeMeasurement("1", width: 240, height: 72)
        check(f.nodeLookup["1"]?.data.label == "Start" && f.edgeLookup["e1"]?.source == "1", "FlowInstance lookup maps stay reactive and addressable")
        check(f.getNodeDimensions("1") == PyreonFlowDimensions(width: 240, height: 72), "intrinsic host measurements drive effective geometry")
        f.addNode(PyreonFlowNode(id: "intrinsic", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Intrinsic"), width: 100, height: 40))
        f.updateNodeMeasurement("intrinsic", width: 240, height: 72)
        check(f.getNodeDimensions("intrinsic") == PyreonFlowDimensions(width: 100, height: 40), "explicit node dimensions win over host measurements")
        f.removeNode("intrinsic")
        check(f.measurements["intrinsic"] == nil, "removed nodes release their measurements")
        let keyboard = seedFlow()
        check(keyboard.handleKeyboardCommand("Enter", nodeId: "1"), "Apple keyboard Enter selects a focused node")
        check(keyboard.isNodeSelected("1"), "Apple keyboard selection is observable")
        let keyboardStart = keyboard.getNode("1")!.position
        check(keyboard.handleKeyboardCommand("ArrowRight", nodeId: "1"), "Apple keyboard arrows are consumed")
        check(keyboard.getNode("1")!.position.x == keyboardStart.x + 10, "Apple keyboard arrows move by ten")
        check(keyboard.handleKeyboardCommand("ArrowDown", nodeId: "1", shift: true), "Apple Shift+arrow is consumed")
        check(keyboard.getNode("1")!.position.y == keyboardStart.y + 100, "Apple Shift+arrow moves by one hundred")
        check(keyboard.handleKeyboardCommand("a", command: true) && keyboard.selectedNodes().count == keyboard.nodes.count, "Apple Command-A selects all")
        check(keyboard.handleKeyboardCommand("Escape") && keyboard.selectedNodes().isEmpty, "Apple Escape clears selection")
        keyboard.selectNode("1")
        check(keyboard.handleKeyboardCommand("Delete") && keyboard.getNode("1") == nil, "Apple configured delete key removes selection")
        let packingNodes = [
            PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "A"), width: 100, height: 30),
            PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "B"), width: 80, height: 70),
            PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "C"), width: 120, height: 40),
            PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "D"), width: 60, height: 20),
        ]
        check(pyreonFlowPackingLayout(packingNodes, spacing: 10).map { $0.id } == ["a", "b", "c", "d"], "box packing preserves input order")
        check(pyreonFlowPackingLayout(packingNodes, spacing: 10).map { $0.position } == [PyreonXYPosition(x: 0, y: 0), PyreonXYPosition(x: 110, y: 0), PyreonXYPosition(x: 0, y: 80), PyreonXYPosition(x: 130, y: 80)], "box packing matches the web shelf geometry")
        check(pyreonFlowPackingLayout(packingNodes, spacing: 10, sortByHeight: true).map { $0.id } == ["b", "c", "a", "d"], "rectpacking uses stable height/width ordering")
        let treeEdges = [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "bc", source: "b", target: "c")]
        let treeNodes = [
            PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "R"), width: 100, height: 40),
            PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "A"), width: 80, height: 30),
            PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "B"), width: 120, height: 50),
            PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "C"), width: 60, height: 20),
            PyreonFlowNode(id: "orphan", position: PyreonXYPosition(x: 9, y: 9), data: NodeData(label: "O"), width: 90, height: 35),
        ]
        check(pyreonFlowTreeLayout(treeNodes, edges: treeEdges, nodeSpacing: 20, layerSpacing: 40).map(\.position) == [PyreonXYPosition(x: 85, y: 0), PyreonXYPosition(x: 70, y: 90), PyreonXYPosition(x: 170, y: 80), PyreonXYPosition(x: 80, y: 170), PyreonXYPosition(x: 205, y: 2.5)], "tree layout matches web BFS centring and overlap sweep")
        check(pyreonFlowTreeLayout(treeNodes, edges: treeEdges, direction: "UP", nodeSpacing: 20, layerSpacing: 40).map(\.position) == [PyreonXYPosition(x: 85, y: 150), PyreonXYPosition(x: 70, y: 70), PyreonXYPosition(x: 170, y: 60), PyreonXYPosition(x: 80, y: 0), PyreonXYPosition(x: 205, y: 152.5)], "tree layout mirrors web UP direction")
        let radialNodes = Array(treeNodes.prefix(3))
        let radialEdges = [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "ab", source: "a", target: "b")]
        check(pyreonFlowRadialLayout(radialNodes, edges: radialEdges).map(\.position) == [PyreonXYPosition(x: 0, y: 5), PyreonXYPosition(x: 150, y: 10), PyreonXYPosition(x: 270, y: 0)], "radial layout matches exact web ring geometry")
        let force = pyreonFlowForceLayout(radialNodes, edges: radialEdges)
        let forceWeb = [PyreonXYPosition(x: 325.65041151345395, y: 204.74888057371896), PyreonXYPosition(x: 162.85665358620253, y: 102.39421274116614), PyreonXYPosition(x: 0, y: 0)]
        check(zip(force, forceWeb).allSatisfy { abs($0.position.x - $1.x) < 1e-9 && abs($0.position.y - $1.y) < 1e-9 }, "force layout reproduces the seeded web coordinates")
        let stress = pyreonFlowStressLayout(radialNodes, edges: radialEdges)
        let stressWeb = [PyreonXYPosition(x: 138.23440571439633, y: 195.11390203079043), PyreonXYPosition(x: 58.86121415294381, y: 104.8239204520405), PyreonXYPosition(x: 0, y: 0)]
        check(zip(stress, stressWeb).allSatisfy { abs($0.position.x - $1.x) < 1e-9 && abs($0.position.y - $1.y) < 1e-9 }, "stress layout reproduces the seeded web coordinates")
        let layered = pyreonFlowLayeredLayout(treeNodes, edges: treeEdges)
        check(layered.map(\.position) == [PyreonXYPosition(x: 5, y: 0), PyreonXYPosition(x: 0, y: 90), PyreonXYPosition(x: 100, y: 80), PyreonXYPosition(x: 80, y: 170), PyreonXYPosition(x: 125, y: 2.5)], "layered layout matches exact web placement")
        let cyclicLayered = pyreonFlowLayeredLayout(treeNodes, edges: treeEdges + [PyreonFlowEdge(id: "cr", source: "c", target: "r")], direction: "LEFT")
        check(cyclicLayered.map(\.position) == [PyreonXYPosition(x: 260, y: 2.5), PyreonXYPosition(x: 120, y: 0), PyreonXYPosition(x: 100, y: 50), PyreonXYPosition(x: 0, y: 40), PyreonXYPosition(x: 265, y: 62.5)], "layered layout reverses cycles and mirrors LEFT like web")
        let appliedLayout = seedFlow()
        appliedLayout.layout("box", options: PyreonFlowLayoutOptions(nodeSpacing: 10, animate: false))
        check(appliedLayout.nodes.map(\.position) == [PyreonXYPosition(x: 0, y: 0), PyreonXYPosition(x: 160, y: 0), PyreonXYPosition(x: 0, y: 50)], "layout atomically applies native algorithm results")
        appliedLayout.undo()
        check(appliedLayout.nodes.map(\.position) == [PyreonXYPosition(x: 0, y: 0), PyreonXYPosition(x: 200, y: 0), PyreonXYPosition(x: 400, y: 0)], "layout records exactly one undoable checkpoint")
        let batched = seedFlow()
        batched.batch {
            batched.updateNodePosition("1", PyreonXYPosition(x: 10, y: 20))
            batched.updateNodePosition("2", PyreonXYPosition(x: 30, y: 40))
        }
        check(batched.getNode("1")?.position == PyreonXYPosition(x: 10, y: 20) && batched.getNode("2")?.position == PyreonXYPosition(x: 30, y: 40), "batch runs all native mutations synchronously")
        f.updateNodeData("1") { $0.label = "Updated" }
        check(f.getNode("1")?.data.label == "Updated", "updateNodeData mutates the native payload observably")
        f.updateNodeDataFromNode("1") { NodeData(label: "\($0.id):\($0.data.label)") }
        check(f.getNode("1")?.data.label == "1:Updated", "callback node-data update receives the complete Apple node")
        let history = seedFlow()
        history.addNode(PyreonFlowNode(id: "4", position: PyreonXYPosition(x: 600, y: 0), data: NodeData(label: "Added")))
        history.selectNode("4")
        history.undo()
        check(history.getNode("4") == nil && history.selectedNodes().isEmpty, "automatic history restores graph state and clears selection")
        history.redo()
        check(history.getNode("4") != nil, "redo restores the undone native mutation")
        let manualHistory = PyreonFlowState(nodes: history.nodes, edges: history.edges, autoHistory: false)
        manualHistory.addNode(PyreonFlowNode(id: "5", position: PyreonXYPosition(x: 700, y: 0), data: NodeData(label: "Unrecorded")))
        manualHistory.undo()
        check(manualHistory.getNode("5") != nil, "autoHistory false does not record mutations")
        manualHistory.pushHistory()
        manualHistory.removeNode("5")
        manualHistory.undo()
        check(manualHistory.getNode("5") != nil, "manual history remains available when automatic checkpoints are disabled")
        let clipboard = seedFlow()
        clipboard.selectNodes(["1", "2"])
        clipboard.copySelected()
        clipboard.paste(PyreonXYPosition(x: 10, y: 20))
        check(clipboard.selectedNodes() == ["1-copy-1", "2-copy-2"], "paste selects deterministic copied node ids")
        check(clipboard.getNode("1-copy-1")?.position == PyreonXYPosition(x: 10, y: 20), "paste applies its native position offset")
        check(clipboard.getEdge("e-1-copy-1-2-copy-2") != nil && clipboard.edges.count == 3, "paste remaps only internal copied edges")
        clipboard.undo()
        check(clipboard.nodes.count == 3 && clipboard.edges.count == 2, "paste records one undoable history checkpoint")
        let dragged = seedFlow()
        dragged.pushHistory()
        dragged.updateNodePosition("1", PyreonXYPosition(x: 75, y: 25))
        dragged.undo()
        check(dragged.getNode("1")?.position == PyreonXYPosition(x: 0, y: 0), "a drag-start checkpoint restores direct position mutations")
        let snapping = PyreonFlowState(nodes: [
            PyreonFlowNode(id: "drag", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Drag"), width: 100, height: 40),
            PyreonFlowNode(id: "target", position: PyreonXYPosition(x: 200, y: 100), data: NodeData(label: "Target"), width: 100, height: 40),
        ])
        check(snapping.snappedNodePosition("drag", PyreonXYPosition(x: 198, y: 102)) == PyreonXYPosition(x: 200, y: 100), "object snapping aligns nearby native node edges")
        let guides = snapping.getSnapLines("drag", PyreonXYPosition(x: 198, y: 102))
        check(guides == PyreonFlowSnapLines(x: 300, y: 140, snappedPosition: PyreonXYPosition(x: 200, y: 100)), "getSnapLines preserves web last-match guide coordinates and snapped position")
        check(snapping.getSnapLines("missing", PyreonXYPosition(x: 3, y: 4)) == PyreonFlowSnapLines(x: nil, y: nil, snappedPosition: PyreonXYPosition(x: 3, y: 4)), "getSnapLines preserves input for an unknown node")
        let unsnapped = PyreonFlowState(nodes: snapping.nodes, snapToObjects: false)
        check(unsnapped.snappedNodePosition("drag", PyreonXYPosition(x: 198, y: 102)) == PyreonXYPosition(x: 198, y: 102), "snapToObjects false preserves the raw drag position")
        check(unsnapped.getSnapLines("drag", PyreonXYPosition(x: 198, y: 102)).x == 300, "public snap-line queries remain available when automatic host snapping is disabled")
        let spatial = PyreonFlowState(nodes: [
            PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "A"), width: 100, height: 100),
            PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 90, y: 20), data: NodeData(label: "B"), width: 100, height: 100),
            PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 300, y: 0), data: NodeData(label: "C"), width: 100, height: 100),
        ])
        check(spatial.getOverlappingNodes("a").map(\.id) == ["b"], "overlap detection uses strict rectangle intersection")
        check(spatial.getProximityConnection("a", 400)?.target == "b", "proximity connection chooses the nearest unconnected node")
        spatial.resolveCollisions("a", 10)
        check(spatial.getOverlappingNodes("a").isEmpty, "collision resolution separates overlapping native nodes")
        let events = seedFlow()
        var connectedTarget: String?
        let stopConnect = events.onConnect { connectedTarget = $0.target }
        events.connect(PyreonFlowConnection(source: "1", target: "3"), id: "event-edge")
        check(connectedTarget == "3", "onConnect observes native graph connections")
        stopConnect(); connectedTarget = nil
        events.addEdge(PyreonFlowEdge(id: "after-unsubscribe", source: "1", target: "3"))
        check(connectedTarget == nil, "onConnect unsubscribe removes only that listener")
        var observedZoom = 0.0
        let stopViewport = events.onViewportChange { observedZoom = $0.zoom }
        events.zoomTo(2)
        check(observedZoom == 2, "onViewportChange observes native viewport writes")
        stopViewport(); events.zoomTo(3)
        check(observedZoom == 2, "onViewportChange unsubscribe stops delivery")
        var nodeEvents: [String] = []
        let stops = [
            events.onNodeClick { nodeEvents.append("click:\($0.id)") },
            events.onNodeDoubleClick { nodeEvents.append("double:\($0.id)") },
            events.onNodeDragStart { nodeEvents.append("start:\($0.id)") },
            events.onNodeDrag { nodeEvents.append("drag:\($0.id)") },
            events.onNodeDragEnd { nodeEvents.append("end:\($0.id)") },
        ]
        events.emitNodeClick("1"); events.emitNodeDoubleClick("1"); events.emitNodeDragStart("1"); events.emitNodeDrag("1"); events.emitNodeDragEnd("1")
        check(nodeEvents == ["click:1", "double:1", "start:1", "drag:1", "end:1"], "native node interaction listeners preserve lifecycle order and live node values")
        for stop in stops { stop() }
        var clickedEdge: String?
        let stopEdge = events.onEdgeClick { clickedEdge = $0.id }
        events.emitEdgeClick("e1")
        check(clickedEdge == "e1", "onEdgeClick receives the live native edge")
        stopEdge()
        var selectedIds: [String] = []
        let stopSelection = events.onSelectionChange { selectedIds = $0.nodes.map(\.id) + $0.edges.map(\.id) }
        events.selectNode("1"); events.selectEdge("e1")
        check(selectedIds == ["e1"], "onSelectionChange receives the final mutually-exclusive selection")
        stopSelection()
        var disposedClicks = 0
        let stopDisposed = events.onNodeClick { _ in disposedClicks += 1 }
        events.dispose(); events.emitNodeClick("1"); stopDisposed()
        check(disposedClicks == 0, "dispose releases native listeners and stale unsubscribers stay safe")
        let deletionEvents = seedFlow()
        var deletedNodes: [String] = [], deletedEdges: [String] = []
        let stopNodeDelete = deletionEvents.onNodesDelete { deletedNodes = $0.map(\.id) }
        let stopEdgeDelete = deletionEvents.onEdgesDelete { deletedEdges = $0.map(\.id) }
        deletionEvents.removeNode("2")
        check(deletedNodes == ["2"] && deletedEdges == ["e1", "e2"], "node deletion reports the node and all incident edges")
        stopNodeDelete(); stopEdgeDelete()
        let changes = seedFlow()
        var nodeChanges: [PyreonFlowNodeChange] = [], edgeChanges: [PyreonFlowEdgeChange] = []
        let stopNodeChanges = changes.onNodesChange { nodeChanges = $0 }
        let stopEdgeChanges = changes.onEdgesChange { edgeChanges = $0 }
        changes.updateNodePosition("1", PyreonXYPosition(x: 10, y: 20))
        check(nodeChanges == [PyreonFlowNodeChange(type: "position", id: "1", position: PyreonXYPosition(x: 10, y: 20))], "onNodesChange emits typed position packets")
        changes.addEdge(PyreonFlowEdge(id: "e3", source: "1", target: "3"))
        check(edgeChanges.first?.type == "add" && edgeChanges.first?.edge?.id == "e3", "onEdgesChange emits the normalized added edge")
        changes.removeNode("2")
        check(nodeChanges == [PyreonFlowNodeChange(type: "remove", id: "2")] && edgeChanges.map(\.id) == ["e1", "e2"], "compound deletion emits coherent remove batches")
        stopNodeChanges(); stopEdgeChanges()
        var lifecycle: [String] = []
        let stopStart = changes.onConnectStart { lifecycle.append("start:\($0.nodeId):\($0.handleId)") }
        let stopEnd = changes.onConnectEnd { lifecycle.append("end:\($0?.target ?? "nil")") }
        let stopPane = changes.onPaneClick { lifecycle.append("pane:\($0.position.x)") }
        changes.emitConnectStart(nodeId: "1", handleId: "out"); changes.emitConnectEnd(PyreonFlowConnection(source: "1", target: "3")); changes.emitConnectEnd(nil); changes.emitPaneClick(PyreonXYPosition(x: 12, y: 34))
        check(lifecycle == ["start:1:out", "end:3", "end:nil", "pane:12.0"], "native connection lifecycle and pane events carry success, cancellation and coordinates")
        stopStart(); stopEnd(); stopPane()
        f.updateNode("1") { $0.hidden = true; $0.id = "ignored" }
        check(f.getNode("1")?.hidden == true && f.getNode("ignored") == nil, "updateNode patches fields while preserving indexed identity")
        f.updateNode("1") { $0.hidden = false }
        f.updateEdge("e1") { $0.label = "Updated edge"; $0.id = "ignored" }
        check(f.getEdge("e1")?.label == "Updated edge" && f.getEdge("ignored") == nil, "updateEdge patches fields while preserving indexed identity")
        f.updateEdge("e1") { $0.label = nil }
        check(f.nodes.count == 3, "seeded 3 nodes")
        check(f.edges.count == 2, "seeded 2 edges")
        check(f.getNode("2")?.data.label == "Mid", "getNode reads the seeded data")
        check(f.getNode("nope") == nil, "getNode misses a missing id")
        check(f.getEdge("e1")?.source == "1", "getEdge reads the seeded edge")

        let ruled = PyreonFlowState(nodes: [
            PyreonFlowNode(id: "api", type: "api", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "API")),
            PyreonFlowNode(id: "db", type: "database", position: PyreonXYPosition(x: 1, y: 0), data: NodeData(label: "DB")),
            PyreonFlowNode(id: "ui", type: "ui", position: PyreonXYPosition(x: 2, y: 0), data: NodeData(label: "UI")),
        ], connectionRules: ["api": ["database"]], isValidConnection: { $0.source != $0.target })
        check(ruled.isValidConnection(PyreonFlowConnection(source: "api", target: "db")), "connection rules allow declared target type")
        check(!ruled.isValidConnection(PyreonFlowConnection(source: "api", target: "ui")), "connection rules reject undeclared target type")
        check(!ruled.isValidConnection(PyreonFlowConnection(source: "api", target: "api")), "connection callback veto runs before rules")
        let connected = ruled.connect(PyreonFlowConnection(source: "api", target: "db", sourceHandle: "out", targetHandle: "in"), id: "native-edge")
        check(connected?.sourceHandle == "out" && connected?.targetHandle == "in", "connect preserves handle ids")
        check(ruled.connect(PyreonFlowConnection(source: "api", target: "ui"), id: "rejected") == nil && ruled.getEdge("rejected") == nil, "connect never stores an invalid edge")
        check(ruled.connect(PyreonFlowConnection(source: "api", target: "db"), id: "native-edge") == nil, "connect rejects duplicate explicit ids")
        check(ruled.reconnectEdge("native-edge", connection: PyreonFlowConnection(source: "api", target: "db")), "validated reconnect succeeds")
        check(ruled.getEdge("native-edge")?.sourceHandle == nil && ruled.getEdge("native-edge")?.targetHandle == nil, "validated reconnect can clear stale handle ids")
        check(!ruled.reconnectEdge("native-edge", connection: PyreonFlowConnection(source: "api", target: "ui")) && ruled.getEdge("native-edge")?.target == "db", "invalid reconnect leaves the edge unchanged")
        let disabledDefaults = PyreonFlowState(nodes: [PyreonFlowNode(id: "kept", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Kept")), PyreonFlowNode(id: "other", position: PyreonXYPosition(x: 20, y: 0), data: NodeData(label: "Other"))], nodesDraggable: false, nodesConnectable: false, nodesSelectable: false, nodesFocusable: false, edgesFocusable: false, nodesDeletable: false, edgesDeletable: false, edgesReconnectable: false, edgeInteractionWidth: 33, connectionRadius: -4, pannable: false, zoomable: false, multiSelect: false, onlyRenderVisibleElements: true, defaultEdgeType: "step", defaultEdgeOptions: PyreonFlowDefaultEdgeOptions(type: "smoothstep", animated: true, interactionWidth: 30, markerEnd: nil, markerEndSpecified: true), fitView: true, fitViewPadding: 0.2)
        disabledDefaults.addEdge(PyreonFlowEdge(id: "defaulted", source: "kept", target: "kept"))
        disabledDefaults.selectNode("kept"); disabledDefaults.deleteSelected()
        check(disabledDefaults.getNode("kept") != nil && disabledDefaults.connectionRadius == 0, "global deletion default protects nodes and connection radius clamps nonnegative")
        check(!disabledDefaults.nodesDraggable && !disabledDefaults.nodesConnectable && !disabledDefaults.pannable && disabledDefaults.edgeInteractionWidth == 33, "native interaction defaults retain explicit global disables")
        check(disabledDefaults.getEdge("defaulted")?.type == "smoothstep" && disabledDefaults.getEdge("defaulted")?.animated == true && disabledDefaults.getEdge("defaulted")?.interactionWidth == 30 && disabledDefaults.resolvedMarkers(disabledDefaults.getEdge("defaulted")!).end == nil && disabledDefaults.fitViewOnLoad && disabledDefaults.fitViewPadding == 0.2, "edge options and initial fit defaults are retained")
        disabledDefaults.addEdge(PyreonFlowEdge(id: "explicit", source: "kept", target: "other", animated: false, animatedSpecified: true))
        check(disabledDefaults.getEdge("explicit")?.animated == false, "an explicit false edge option overrides a true flow default")
        disabledDefaults.selectNode("kept"); disabledDefaults.selectNode("other", additive: true)
        check(disabledDefaults.selectedNodes() == ["other"], "multiSelect false converts additive selection to replacement")
        check(disabledDefaults.onlyRenderVisibleElements, "visible-element rendering config is retained")

        let initialStrokes = pyreonFlowEdgeStrokes(state: f)
        check(initialStrokes.map(\.id) == ["e1", "e2"], "native host derives every visible edge")
        f.containerSize = PyreonFlowContainerSize(width: 100, height: 100)
        check(pyreonFlowEdgeStrokeIsVisible(PyreonFlowEdgeStroke(id: "inside", segments: [.move(10, 10), .line(90, 90)]), state: f), "viewport culling retains an intersecting edge")
        check(!pyreonFlowEdgeStrokeIsVisible(PyreonFlowEdgeStroke(id: "outside", segments: [.move(300, 300), .line(400, 400)]), state: f), "viewport culling removes an offscreen edge")
        f.addEdge(PyreonFlowEdge(id: "dangling", source: "missing", target: "1"))
        check(!pyreonFlowEdgeStrokes(state: f).contains { $0.id == "dangling" }, "native host omits edges with missing endpoints")
        let labels = pyreonFlowEdgeLabels(state: f)
        check(labels.first?.accessibilityLabel == "Edge from 1 to 2" && labels.first!.x > 0, "native host derives positioned accessible edge labels")
        let routed = PyreonFlowState(nodes: f.nodes, edges: [PyreonFlowEdge(id: "tuned", source: "1", target: "2", type: "step", animated: true, pathOffset: 37)])
        let tunedStroke = pyreonFlowEdgeStrokes(state: routed)[0]
        check(tunedStroke.dash == [5, 5] && tunedStroke.segments[1].x == 187, "native host applies animated dash and per-edge path offset")
        check(tunedStroke.endMarker?.closed == true && tunedStroke.endMarker?.points.first?.x == tunedStroke.segments.last?.x, "omitted markerEnd renders the default closed arrow at the target")
        let noMarker = PyreonFlowState(nodes: f.nodes, edges: [PyreonFlowEdge(id: "none", source: "1", target: "2", markerEndSpecified: true)])
        check(pyreonFlowEdgeStrokes(state: noMarker)[0].endMarker == nil, "explicit markerEnd null suppresses the default arrow")
        let openMarker = PyreonFlowMarker(type: "arrow", color: "#ff0000", width: 12, height: 8, strokeWidth: 2)
        let marked = PyreonFlowState(nodes: f.nodes, edges: [PyreonFlowEdge(id: "marked", source: "1", target: "2", markerStart: openMarker, markerEnd: openMarker, markerEndSpecified: true)])
        check(pyreonFlowEdgeStrokes(state: marked)[0].startMarker?.closed == false && pyreonFlowEdgeStrokes(state: marked)[0].endMarker?.color == "#ff0000", "configured open markers preserve shape and color at both ends")
        let hitEdges = [
            PyreonFlowEdgeStroke(id: "far", segments: [.move(0, 40), .line(100, 40)], interactionWidth: 20),
            PyreonFlowEdgeStroke(id: "near", segments: [.move(0, 0), .line(100, 0)], interactionWidth: 20),
        ]
        check(pyreonFlowEdgeDistance(hitEdges[1].segments, point: PyreonXYPosition(x: 50, y: 4)) == 4, "edge hit distance covers the full line, not only its label")
        check(pyreonNearestFlowEdge(hitEdges, point: PyreonXYPosition(x: 50, y: 4), zoom: 1)?.id == "near", "edge hit testing selects the nearest path")
        check(pyreonNearestFlowEdge(hitEdges, point: PyreonXYPosition(x: 50, y: 6), zoom: 2) == nil, "edge interaction width remains constant in screen pixels under zoom")
        routed.selectEdge("tuned")
        let updaters = pyreonFlowEdgeUpdaters(state: routed, strokes: [tunedStroke])
        check(updaters.map(\.end) == ["source", "target"] && updaters[0].x == tunedStroke.segments.first?.x && updaters[1].x == tunedStroke.segments.last?.x, "selected reconnectable edge exposes exact rendered endpoints")
        let reconnectTarget = PyreonFlowInteractiveHandle(nodeId: "3", handleId: "in", type: "target", position: .left, x: 0, y: 0)
        check(pyreonFlowReconnectConnection(edge: routed.getEdge("tuned")!, end: "target", handle: reconnectTarget)?.targetHandle == "in", "target updater preserves the fixed source and adopts the target handle")
        let invalidSelf = PyreonFlowInteractiveHandle(nodeId: "1", handleId: "self", type: "target", position: .left, x: 0, y: 0)
        check(pyreonFlowReconnectConnection(edge: routed.getEdge("tuned")!, end: "target", handle: invalidSelf) == nil, "reconnect resolver rejects the fixed endpoint node like web")
        f.removeEdge("dangling")
        f.containerSize = PyreonFlowContainerSize(width: 400, height: 200)
        let mini = pyreonFlowMiniMapLayout(state: f, width: 200, height: 150)
        check(mini.nodes.map(\.id) == ["1", "2", "3"], "minimap derives every visible node")
        check(mini.scale > 0 && mini.viewport.width > 0, "minimap derives graph scale and viewport indicator")
        let dragGroups = PyreonFlowState(nodes: [
            PyreonFlowNode(id: "parent", position: PyreonXYPosition(x: 10, y: 10), data: NodeData(label: "Parent")),
            PyreonFlowNode(id: "child", position: PyreonXYPosition(x: 5, y: 5), data: NodeData(label: "Child"), parentId: "parent"),
            PyreonFlowNode(id: "peer", position: PyreonXYPosition(x: 30, y: 30), data: NodeData(label: "Peer")),
        ])
        dragGroups.selectNodes(["parent", "child", "peer"])
        check(pyreonFlowDragNodeIds(state: dragGroups, draggedNodeId: "parent") == ["parent", "peer"], "multi-drag omits descendants of a selected ancestor")
        check(pyreonFlowDragNodeIds(state: dragGroups, draggedNodeId: "child") == ["parent", "peer"], "dragging any selected member moves the same top-level selection")

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
        let keyboardA11yOff = PyreonFlowState(nodes: f.nodes, edges: f.edges, disableKeyboardA11y: true)
        check(pyreonFlowEdgeLabels(state: keyboardA11yOff).allSatisfy { !$0.focusable }, "disableKeyboardA11y removes every edge focus stop")

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
        // This block verifies scheduled-frame cancellation, so its motion
        // policy must not inherit a runner's accessibility preference.
        let h = seedFlow(reducedMotion: false)
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
        h.animateViewport(x: 20, zoom: 3, duration: 0)
        check(h.viewport == PyreonFlowViewport(x: 20, y: 10, zoom: 3), "zero-duration viewport animation jumps synchronously and preserves omitted fields")
        h.animateViewport(x: 500, duration: 200)
        h.zoomTo(3)
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
        check(h.viewport.x == 20, "a synchronous viewport method cancels stale scheduled frames")
        h.animateViewport(x: 40, duration: 0)
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.05))
        check(h.viewport.x == 40, "a newer viewport animation cancels stale scheduled frames")
        let reduced = PyreonFlowState(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Reduced"))], reducedMotion: true)
        reduced.zoomTo(2, duration: 500)
        check(reduced.viewport.zoom == 2, "reduced motion makes duration-based viewport methods synchronous")
        let forcedMotion = PyreonFlowState(nodes: [PyreonFlowNode(id: "m", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Motion"))], reducedMotion: false)
        forcedMotion.zoomTo(2, duration: 500)
        check(forcedMotion.viewport.zoom == 1, "an explicit false overrides automatic reduced-motion policy")
        forcedMotion.dispose()

        let exported = h.toJSON()
        check(exported.nodes.map(\.id) == ["1", "2", "3"] && exported.edges.map(\.id) == ["e1", "e2"], "toJSON snapshots nodes and edges in order")
        check(exported.viewport == PyreonFlowViewport(x: 40, y: 10, zoom: 3), "toJSON includes the exact viewport")
        h.selectNode("1")
        h.fromJSON(PyreonFlowSnapshot(
            nodes: [PyreonFlowNode(id: "restored", position: PyreonXYPosition(x: 7, y: 8), data: NodeData(label: "Restored"))],
            edges: [PyreonFlowEdge(id: "loop", source: "restored", target: "restored")]
        ))
        check(h.nodes.map(\.id) == ["restored"] && h.getEdge("loop")?.type == "bezier", "fromJSON replaces graph state and normalizes restored edges")
        check(h.viewport == PyreonFlowViewport(x: 40, y: 10, zoom: 3) && h.selectedNodes().isEmpty, "fromJSON without viewport preserves it and clears selection")
        h.fromJSON(exported)
        check(h.nodes.map(\.id) == ["1", "2", "3"] && h.viewport == PyreonFlowViewport(x: 40, y: 10, zoom: 3), "toJSON/fromJSON round-trips the complete snapshot")

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
        check(m.findNodes { $0.data.label.contains("t") }.map { $0.id } == ["1"], "findNodes evaluates the native predicate in insertion order")
        check(m.searchNodes("MID").map { $0.id } == ["2"], "searchNodes performs case-insensitive label search")
        check(PyreonFlowState(nodes: m.nodes).searchNodes("2").map { $0.id } == ["2"], "searchNodes falls back to ids without a label extractor")
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
        check(q.getNodeDimensions("p") == PyreonFlowDimensions(width: 100, height: 80) && q.getNodeDimensions("missing") == PyreonFlowDimensions(width: 150, height: 40), "node dimensions use explicit sizes and stable defaults")
        let partialSelection = PyreonFlowState(nodes: q.nodes, selectionOnDrag: true)
        check(partialSelection.nodesInSelection(from: PyreonXYPosition(x: 0, y: 0), to: PyreonXYPosition(x: 20, y: 30)) == ["p", "c"], "partial selection uses overlap and absolute child coordinates")
        let fullSelection = PyreonFlowState(nodes: q.nodes, selectionOnDrag: true, selectionMode: "full")
        check(fullSelection.nodesInSelection(from: PyreonXYPosition(x: 10, y: 20), to: PyreonXYPosition(x: 165, y: 67)) == ["c"], "full selection requires complete containment")
        q.containerSize = PyreonFlowContainerSize(width: 300, height: 200)
        q.fitView(["c"], padding: 0)
        check(q.flowToScreenPosition(PyreonXYPosition(x: 90, y: 47)) == PyreonXYPosition(x: 150, y: 100), "fitView centers a nested node from its absolute position")
        let padded = PyreonFlowState(nodes: [PyreonFlowNode(id: "p", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "P"), width: 100, height: 100)], fitViewPadding: 0.5)
        padded.containerSize = PyreonFlowContainerSize(width: 200, height: 200); padded.fitView()
        check(padded.zoom == 1, "fitView without an override uses configured padding")
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
        q.setNodes { nodes in nodes + [PyreonFlowNode(id: "callback", position: PyreonXYPosition(x: 2, y: 3), data: NodeData(label: "Callback"))] }
        q.setEdges { edges in edges + [PyreonFlowEdge(id: "callback-edge", source: "x", target: "callback")] }
        check(q.nodes.map(\.id) == ["x", "callback"] && q.edges.map(\.id) == ["fresh", "callback-edge"], "setNodes and setEdges callbacks receive and replace current collections")
        q.setViewport(PyreonFlowViewport(x: 1, y: 2, zoom: 2))
        q.setViewport { PyreonFlowViewport(x: $0.x + 3, y: $0.y, zoom: $0.zoom) }
        q.replaceContainerSize(PyreonFlowContainerSize(width: 640, height: 480))
        q.updateContainerSize { PyreonFlowContainerSize(width: $0.width, height: $0.height + 20) }
        check(q.viewport == PyreonFlowViewport(x: 4, y: 2, zoom: 2) && q.containerSize == PyreonFlowContainerSize(width: 640, height: 500), "signal-compatible viewport and container updates use current values")
        q.setNodeExtent(minX: 0, minY: 10, maxX: 200, maxY: 300)
        check(q.clampToExtent(PyreonXYPosition(x: 500, y: -2), 20, 30) == PyreonXYPosition(x: 180, y: 10), "clampToExtent applies node dimensions")
        q.updateNodePosition("x", PyreonXYPosition(x: 500, y: 500))
        check(q.getNode("x")?.position == PyreonXYPosition(x: 50, y: 260), "position updates automatically use the configured extent and default dimensions")
        q.clearNodeExtent()
        check(q.clampToExtent(PyreonXYPosition(x: 500, y: -2)) == PyreonXYPosition(x: 500, y: -2), "clearing the extent restores unconstrained positions")
        let snapped = PyreonFlowState(nodes: [PyreonFlowNode(id: "s", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Snap"))], snapToGrid: true, snapGrid: 10, nodeExtent: PyreonFlowNodeExtent(minX: -100, minY: -100, maxX: 200, maxY: 200))
        snapped.updateNodePosition("s", PyreonXYPosition(x: -5, y: 16))
        check(snapped.getNode("s")?.position == PyreonXYPosition(x: 0, y: 20), "grid snapping matches JavaScript Math.round, including negative halves")
        let nested = PyreonFlowState(nodes: [
            PyreonFlowNode(id: "parent", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Parent"), width: 100, height: 100),
            PyreonFlowNode(id: "child", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Child"), width: 30, height: 20, parentId: "parent", extentParent: true, expandParent: true),
            PyreonFlowNode(id: "boxed", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Boxed"), width: 30, height: 20, extent: PyreonFlowNodeExtent(minX: 10, minY: 20, maxX: 100, maxY: 90)),
        ])
        nested.updateNodePosition("child", PyreonXYPosition(x: 120, y: 110))
        check(nested.getNode("child")?.position == PyreonXYPosition(x: 70, y: 80), "parent extent constrains child positions using child dimensions")
        nested.updateNode("child") { $0.extentParent = false }
        nested.updateNodePosition("child", PyreonXYPosition(x: 120, y: 110))
        check(nested.getNode("parent")?.width == 150 && nested.getNode("parent")?.height == 130, "expandParent grows the parent when an unconstrained child moves beyond it")
        nested.updateNodePosition("boxed", PyreonXYPosition(x: 500, y: -10))
        check(nested.getNode("boxed")?.position == PyreonXYPosition(x: 70, y: 20), "a node-specific numeric extent overrides the flow extent")
        let toolbarNode = PyreonFlowRect(x: 10, y: 20, width: 100, height: 40)
        let toolbarViewport = PyreonFlowViewport(x: 5, y: -5, zoom: 2)
        check(pyreonFlowNodeToolbarPlacement(node: toolbarNode, viewport: toolbarViewport) == PyreonFlowNodeToolbarPlacement(x: 125, y: 27, anchorX: 0.5, anchorY: 1), "top-center toolbar placement applies pan, zoom, and an unscaled offset")
        check(pyreonFlowNodeToolbarPlacement(node: toolbarNode, viewport: toolbarViewport, config: PyreonFlowNodeToolbarConfig(position: "bottom", align: "end", offset: 6, showOnSelect: false)) == PyreonFlowNodeToolbarPlacement(x: 225, y: 121, anchorX: 1, anchorY: 0), "bottom-end toolbar placement anchors the far node corner")

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
        check(routedStraight.path == "M0,0 L100,50", "native path results preserve the public SVG path string")
        let routedBezier = pyreonBezierPath(sourceX: 0, sourceY: 0, sourcePosition: .right, targetX: 200, targetY: 100, targetPosition: .left)
        check(routedBezier.segments[1].c1x! > 0 && routedBezier.segments[1].c2x! < 200, "bezier routing offsets controls along handle directions")
        check(routedBezier.path.hasPrefix("M0,0 C"), "bezier SVG serialization preserves its cubic command")
        let measuredDimensions = pyreonEffectiveDimensions(PyreonFlowNode(id: "dims", position: PyreonXYPosition(x: 0, y: 0), data: "D", width: 90), measurement: PyreonFlowNodeMeasurement(width: 80, height: 30))
        check(measuredDimensions.width == 90 && measuredDimensions.height == 30, "effective dimensions preserve explicit-measured-default precedence")
        let helperSource = PyreonFlowNode(id: "helper-source", position: PyreonXYPosition(x: 0, y: 0), data: "S", width: 100, height: 40, sourceHandles: [PyreonFlowHandleConfig(id: "out", type: "source", position: .right)])
        let helperTarget = PyreonFlowNode(id: "helper-target", position: PyreonXYPosition(x: 200, y: 80), data: "T", width: 120, height: 60)
        let helperDimensions = PyreonFlowNodeBoxDimensions(sourceW: 100, sourceH: 40, targetW: 120, targetH: 60)
        let helperEndpoints = pyreonGetFloatingEndpoints(helperSource, targetNode: helperTarget, dimensions: helperDimensions)
        check(helperEndpoints.source.position == .bottom && helperEndpoints.target.position == .left, "public floating helper preserves perimeter sides")
        let helperSmart = pyreonGetSmartHandlePositions(helperSource, targetNode: helperTarget)
        check(helperSmart.sourcePosition == .right && helperSmart.targetPosition == .left, "public smart helper honors configured and inferred sides")
        let helperAnchor = pyreonResolveHandleAnchor(helperSource, handleId: "out", type: "source", dimensions: PyreonFlowDimensions(width: 100, height: 40))
        check(helperAnchor == PyreonFlowHandleAnchor(x: 100, y: 20, position: .right), "public anchor helper resolves configured handle geometry")
        check(pyreonEdgePath(type: "straight", sourceX: 0, sourceY: 0, sourcePosition: .right, targetX: 100, targetY: 50, targetPosition: .left).path == "M0,0 L100,50", "public edge dispatcher preserves straight geometry")
        let previewSource = PyreonFlowInteractiveHandle(nodeId: "n", handleId: "out", type: "source", position: .right, x: 0, y: 0)
        check(pyreonFlowConnectionPreview(type: "straight", source: previewSource, target: PyreonXYPosition(x: 100, y: 50)).map(\.kind) == ["move", "line"], "straight connection preview uses straight geometry")
        check(pyreonFlowConnectionPreview(type: "bezier", source: previewSource, target: PyreonXYPosition(x: 100, y: 50))[1].kind == "cubic", "bezier connection preview preserves the source tangent")
        check(pyreonFlowConnectionPreview(type: "step", source: previewSource, target: PyreonXYPosition(x: 100, y: 50)).contains { $0.kind == "quad" }, "step connection preview uses routed geometry")
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
        let interactive = pyreonFlowInteractiveHandles(nodeId: "n1", node: PyreonFlowRect(x: 10, y: 20, width: 200, height: 80), handles: configHandles)
        check(interactive == [PyreonFlowInteractiveHandle(nodeId: "n1", handleId: "cfg", type: "source", position: .right, x: 210, y: 60)], "interactive handle layout resolves graph coordinates")
        let offsetHandle = pyreonFlowInteractiveHandles(nodeId: "n1", node: PyreonFlowRect(x: 10, y: 20, width: 200, height: 80), handles: [PyreonFlowHandleConfig(id: "offset", type: "source", position: .right, offset: 75)])
        check(offsetHandle.first?.x == 210 && offsetHandle.first?.y == 80 && offsetHandle.count == 1, "interactive handles preserve the web offset percentage")
        let renderedHandles = [PyreonFlowHandleConfig(id: "out", type: "source", position: .right), PyreonFlowHandleConfig(id: "in", type: "target", position: .left)]
        let inferredNode = PyreonFlowNode(id: "inferred", position: PyreonXYPosition(x: 0, y: 0), data: "Inferred")
        check(pyreonFlowEffectiveHandles(inferredNode, renderedHandles) == renderedHandles, "renderer handles fill missing endpoint types")
        let explicitNode = PyreonFlowNode(id: "explicit", position: PyreonXYPosition(x: 0, y: 0), data: "Explicit", sourceHandles: [PyreonFlowHandleConfig(id: "model", type: "source", position: .top)])
        check(pyreonFlowEffectiveHandles(explicitNode, renderedHandles).compactMap(\.id) == ["model", "in"], "explicit model handles win per endpoint type without duplicates")
        let resized = pyreonFlowResizeFrame(PyreonFlowResizeFrame(position: PyreonXYPosition(x: 100, y: 80), width: 150, height: 40), direction: "nw", dx: 170, dy: 30)
        check(resized == PyreonFlowResizeFrame(position: PyreonXYPosition(x: 200, y: 90), width: 50, height: 30), "north-west resizing clamps dimensions and keeps the opposite corner fixed")
        let expanded = pyreonFlowResizeFrame(PyreonFlowResizeFrame(position: PyreonXYPosition(x: 100, y: 80), width: 150, height: 40), direction: "se", dx: 25, dy: 15)
        check(expanded == PyreonFlowResizeFrame(position: PyreonXYPosition(x: 100, y: 80), width: 175, height: 55), "south-east resizing expands without moving the origin")
        let candidates = interactive + [PyreonFlowInteractiveHandle(nodeId: "n2", handleId: "in", type: "target", position: .left, x: 240, y: 60)]
        check(pyreonNearestFlowHandle(candidates, point: PyreonXYPosition(x: 244, y: 60), type: "target", radius: 5)?.nodeId == "n2", "connection hit testing chooses the nearest matching handle")
        check(pyreonNearestFlowHandle(candidates, point: PyreonXYPosition(x: 246, y: 60), type: "target", radius: 5) == nil, "connection hit testing respects its graph-space radius")
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

        let styledState = PyreonFlowState(
            nodes: [
                PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 0, y: 0), data: "A"),
                PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 200, y: 0), data: "B"),
            ],
            edges: [PyreonFlowEdge(id: "styled", source: "a", target: "b", style: " stroke: #123456; stroke-width: 4px; unknown: kept")])
        let styledStroke = pyreonFlowEdgeStrokes(state: styledState).first!
        check(styledStroke.color == "#123456" && styledStroke.width == 4, "portable inline edge stroke style reaches the native draw list")
        check(pyreonFlowStyleValue(styledState.edges[0].style, "unknown") == "kept", "style parser preserves and resolves unknown declarations without corrupting the model")
        let nodeStyle = pyreonFlowNodeInlineStyle("width: 120px; height: 45; padding: 8px; background: #abcdef; border-color: #123456; border-width: 2px; border-radius: 6px; opacity: .5")
        check(nodeStyle == PyreonFlowNodeInlineStyle(width: 120, height: 45, padding: 8, backgroundColor: "#abcdef", borderColor: "#123456", borderWidth: 2, borderRadius: 6, opacity: 0.5), "portable node box styles resolve identically for SwiftUI")

        print("PyreonFlowEdgeCanvasTests: edge canvas checks passed")
    }

    static func main() {
        runStateChecks()
        runEdgeCanvasChecks()
        print("PyreonFlowStateTests: all checks passed")
    }
}
