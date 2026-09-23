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
            minZoom: 0.25, maxZoom: 3.5, snapToGrid: true, snapGrid: 20,
            nodeExtent: PyreonFlowNodeExtent(minX: -10, minY: -20, maxX: 500, maxY: 600),
            connectionRules: ["source": ["target"]], defaultMarkerEnd: nil,
            nodesDraggable: false, nodesConnectable: false, nodesSelectable: false, nodesFocusable: false,
            edgesFocusable: false, disableKeyboardA11y: true, nodesDeletable: false, edgesDeletable: false, edgesReconnectable: false,
            edgeInteractionWidth: 33, connectionRadius: 12, pannable: false, panOnDrag: false,
            panOnScroll: true, panOnScrollSpeed: 0.75, zoomable: false, zoomOnScroll: false,
            zoomOnPinch: false, zoomOnDoubleClick: true, selectionOnDrag: true,
            selectionMode: "full", multiSelect: false, onlyRenderVisibleElements: true, snapToObjects: false,
            defaultEdgeType: "straight", connectionLineType: "step",
            defaultEdgeOptions: PyreonFlowDefaultEdgeOptions(type: "smoothstep", animated: true, interactionWidth: 44),
            fitView: true, fitViewPadding: 0.2, autoHistory: false,
            isValidConnection: { $0.source != $0.target },
            reducedMotion: false, deleteKeys: ["ForwardDelete"], multiSelectionKey: "ctrl",
            selectionKey: nil, zoomActivationKey: "meta", preventScrolling: false)
        check(configured.minZoom == 0.25 && configured.maxZoom == 3.5 && configured.snapToGrid && configured.snapGrid == 20, "Apple retains viewport and grid config")
        check(configured.nodeExtent == PyreonFlowNodeExtent(minX: -10, minY: -20, maxX: 500, maxY: 600) && configured.connectionRules == ["source": ["target"]], "Apple retains extent and connection rules")
        check(!configured.nodesDraggable && !configured.nodesConnectable && !configured.nodesSelectable && !configured.nodesFocusable, "Apple retains node interaction config")
        check(!configured.edgesFocusable && configured.disableKeyboardA11y && !configured.nodesDeletable && !configured.edgesDeletable && !configured.edgesReconnectable, "Apple retains accessibility and deletion config")
        check(configured.edgeInteractionWidth == 33 && configured.connectionRadius == 12 && !configured.pannable && !configured.panOnDrag, "Apple retains pointer config")
        check(configured.panOnScroll && configured.panOnScrollSpeed == 0.75 && !configured.zoomable && !configured.zoomOnScroll, "Apple retains scroll and zoom config")
        check(configured.multiSelectionKey == "ctrl" && configured.selectionKey == nil && configured.zoomActivationKey == "meta" && !configured.preventScrolling, "Apple retains modifier config")
        check(!configured.zoomOnPinch && configured.zoomOnDoubleClick && configured.selectionOnDrag && configured.selectionMode == "full" && !configured.multiSelect, "Apple retains direct-manipulation config")
        check(configured.onlyRenderVisibleElements && !configured.snapToObjects && configured.defaultEdgeType == "straight" && configured.connectionLineType == "step", "Apple retains render and connection config")
        check(configured.defaultEdgeOptions == PyreonFlowDefaultEdgeOptions(type: "smoothstep", animated: true, interactionWidth: 44) && configured.defaultMarkerEnd == nil, "Apple retains edge defaults")
        check(configured.fitViewOnLoad && configured.fitViewPadding == 0.2 && !configured.autoHistory && configured.reducedMotion == false, "Apple retains lifecycle config")
        check(!configured.isValidConnection(PyreonFlowConnection(source: "same", target: "same")) && configured.deleteKeys == ["ForwardDelete"], "Apple retains validation and delete-key config")
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

    static func runWebViewChecks() {
        let merged = pyreonFlowWebViewData(
            graph: #"{"nodes":[],"edges":[]}"#,
            commands: #"[{"id":"fit","type":"fit-view"}]"#)
        let mergedObject = try! JSONSerialization.jsonObject(with: Data(merged.utf8)) as! [String: Any]
        check((mergedObject["__pyreonFlowCommands"] as? [Any])?.count == 1, "webview commands merge into the private bridge field")

        var selected: [String] = []
        var events: [String] = []
        var messages = 0
        pyreonDispatchFlowWebViewMessage(
            #"{"type":"edge-select","id":"e1","source":"a","target":"b"}"#,
            onSelect: { selected.append($0.id) },
            onMessage: { _ in messages += 1 },
            onEvent: { events.append($0.type) })
        check(selected == ["e1"], "edge payloads preserve the web onSelect compatibility callback")
        check(events == ["edge-select"] && messages == 1, "edge payloads reach typed and generic callbacks")

        pyreonDispatchFlowWebViewMessage(
            #"{"id":"n1","data":{"label":"Node"}}"#,
            onSelect: { selected.append($0.id) },
            onEvent: { events.append($0.type) })
        check(selected.last == "n1" && events.last == "node-select", "node payloads reach both node callbacks")

        var errorMessage = ""
        pyreonDispatchFlowWebViewMessage(
            #"{"__pyreonFlowHostError":1,"message":"broken"}"#,
            onError: { errorMessage = $0.message })
        check(errorMessage == "broken", "host errors retain their message")
    }

    /// Model fields that carry with no native RENDER meaning still carry:
    /// `class` is a browser CSS hook, so the host never reads it, but a node or
    /// edge round-trips it unchanged (a consumer branching on it natively, or
    /// serialising the graph back to the web, sees the same value).
    static func runModelFieldChecks() {
        let f = PyreonFlowState<NodeData>(
            nodes: [PyreonFlowNode(id: "tagged", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Tagged"), className: "highlight custom", style: "opacity: .5")],
            edges: [PyreonFlowEdge(id: "tagged-edge", source: "tagged", target: "tagged", className: "dashed-edge", pathOffset: 12)])
        check(f.getNode("tagged")?.className == "highlight custom", "Apple retains a node's browser class name on the model")
        check(f.getEdge("tagged-edge")?.className == "dashed-edge", "Apple retains an edge's browser class name on the model")
        f.updateNode("tagged") { $0.position = PyreonXYPosition(x: 5, y: 5) }
        check(f.getNode("tagged")?.className == "highlight custom", "a node update leaves the class name in place")
        let explicitTarget = PyreonFlowNode(id: "explicit-target", position: PyreonXYPosition(x: 0, y: 0), data: NodeData(label: "Target"), targetHandles: [PyreonFlowHandleConfig(id: "model-in", type: "target", position: .bottom)])
        let inferred = [PyreonFlowHandleConfig(id: "out", type: "source", position: .right), PyreonFlowHandleConfig(id: "in", type: "target", position: .left)]
        check(pyreonFlowEffectiveHandles(explicitTarget, inferred).compactMap { $0.id } == ["model-in", "out"], "explicit target handles come first and replace only the inferred target endpoint")
    }

    // <flow-parity:start> GENERATED by src/tests/native-parity-fixture.ts — do not edit; PYREON_WRITE_FLOW_PARITY=1 bun run test
    static func parityNear(_ p: PyreonXYPosition, _ x: Double, _ y: Double) -> Bool { abs(p.x - x) < 1e-6 && abs(p.y - y) < 1e-6 }
    static func parityOpt(_ v: Double?, _ want: Double?) -> Bool { switch (v, want) { case (nil, nil): return true; case let (a?, b?): return abs(a - b) < 1e-6; default: return false } }
    static func paritySnap(_ s: PyreonFlowSnapLines, _ x: Double?, _ y: Double?, _ px: Double, _ py: Double) -> Bool { parityOpt(s.x, x) && parityOpt(s.y, y) && parityNear(s.snappedPosition, px, py) }
    static func parityPoints(_ got: [PyreonXYPosition], _ want: [(Double, Double)]) -> Bool {
        if got.count != want.count { return false }
        for i in 0..<got.count { if abs(got[i].x - want[i].0) >= 1e-6 || abs(got[i].y - want[i].1) >= 1e-6 { return false } }
        return true
    }
    static func parityNodes(_ f: PyreonFlowState<NodeData>, _ want: [(String, Double, Double)], _ tol: Double = 1e-6) -> Bool {
        let got = f.nodes
        if got.count != want.count { return false }
        for i in 0..<got.count { if got[i].id != want[i].0 || abs(got[i].position.x - want[i].1) >= tol || abs(got[i].position.y - want[i].2) >= tol { return false } }
        return true
    }
    static func parityEdges(_ f: PyreonFlowState<NodeData>, _ want: [(String, String, String)]) -> Bool {
        let got = f.edges
        if got.count != want.count { return false }
        for i in 0..<got.count { if got[i].id != want[i].0 || got[i].source != want[i].1 || got[i].target != want[i].2 { return false } }
        return true
    }
    /// The web engine ran every scenario first; these are its answers.
    static func runParityChecks() {
        do { // node CRUD keeps order, positions and the edges that survive
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.addNode(PyreonFlowNode(id: "4", position: PyreonXYPosition(x: 50.0, y: 500.0), data: NodeData(label: "4")))
            f.updateNodePosition("2", PyreonXYPosition(x: 210.5, y: -30.0))
            f.addEdge(PyreonFlowEdge(id: "e3", source: "3", target: "4"))
            f.removeNode("1")
            check(parityNodes(f, [("2", 210.5, -30.0), ("3", 400.0, 0.0), ("4", 50.0, 500.0)]), "parity: node CRUD keeps order, positions and the edges that survive — nodes")
            check(parityEdges(f, [("e2", "2", "3"), ("e3", "3", "4")]), "parity: node CRUD keeps order, positions and the edges that survive — edges")
            check(f.selectedNodes().sorted() == [], "parity: node CRUD keeps order, positions and the edges that survive — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: node CRUD keeps order, positions and the edges that survive — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: node CRUD keeps order, positions and the edges that survive — viewport")
            check(f.getConnectedEdges("3").map { $0.id } == ["e2", "e3"], "parity: node CRUD keeps order, positions and the edges that survive — query 1 connectedEdges")
            check(f.getIncomers("3").map { $0.id } == ["2"], "parity: node CRUD keeps order, positions and the edges that survive — query 2 incomers")
            check(f.getOutgoers("3").map { $0.id } == ["4"], "parity: node CRUD keeps order, positions and the edges that survive — query 3 outgoers")
            check(f.getConnectedEdges("1").map { $0.id } == [], "parity: node CRUD keeps order, positions and the edges that survive — query 4 connectedEdges")
        }
        do { // edge CRUD and reconnect
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3")), PyreonFlowNode(id: "4", position: PyreonXYPosition(x: 600.0, y: 120.0), data: NodeData(label: "4"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3"), PyreonFlowEdge(id: "e3", source: "3", target: "4")], searchText: { $0.label })
            f.reconnectEdge("e1", target: "4")
            f.removeEdge("e2")
            f.addEdge(PyreonFlowEdge(id: "e9", source: "4", target: "1"))
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0), ("4", 600.0, 120.0)]), "parity: edge CRUD and reconnect — nodes")
            check(parityEdges(f, [("e1", "1", "4"), ("e3", "3", "4"), ("e9", "4", "1")]), "parity: edge CRUD and reconnect — edges")
            check(f.selectedNodes().sorted() == [], "parity: edge CRUD and reconnect — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: edge CRUD and reconnect — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: edge CRUD and reconnect — viewport")
            check(f.getIncomers("4").map { $0.id } == ["1", "3"], "parity: edge CRUD and reconnect — query 1 incomers")
            check(f.getOutgoers("4").map { $0.id } == ["1"], "parity: edge CRUD and reconnect — query 2 outgoers")
            check(f.getConnectedEdges("2").map { $0.id } == [], "parity: edge CRUD and reconnect — query 3 connectedEdges")
        }
        do { // selection: single, additive, deselect, edges, select all, clear
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3")), PyreonFlowNode(id: "4", position: PyreonXYPosition(x: 600.0, y: 120.0), data: NodeData(label: "4"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3"), PyreonFlowEdge(id: "e3", source: "3", target: "4")], searchText: { $0.label })
            f.selectNode("1", additive: false)
            f.selectNode("2", additive: true)
            f.selectNode("3", additive: false)
            f.selectNodes(["1", "4"], additive: true)
            f.deselectNode("1")
            f.selectEdge("e2", additive: true)
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0), ("4", 600.0, 120.0)]), "parity: selection: single, additive, deselect, edges, select all, clear — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3"), ("e3", "3", "4")]), "parity: selection: single, additive, deselect, edges, select all, clear — edges")
            check(f.selectedNodes().sorted() == ["3", "4"], "parity: selection: single, additive, deselect, edges, select all, clear — selected nodes")
            check(f.selectedEdges().sorted() == ["e2"], "parity: selection: single, additive, deselect, edges, select all, clear — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: selection: single, additive, deselect, edges, select all, clear — viewport")
        }
        do { // select all then clear leaves nothing selected
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.selectAll()
            f.clearSelection()
            f.selectEdge("e1", additive: false)
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: select all then clear leaves nothing selected — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3")]), "parity: select all then clear leaves nothing selected — edges")
            check(f.selectedNodes().sorted() == [], "parity: select all then clear leaves nothing selected — selected nodes")
            check(f.selectedEdges().sorted() == ["e1"], "parity: select all then clear leaves nothing selected — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: select all then clear leaves nothing selected — viewport")
        }
        do { // deleteSelected removes the selected nodes with their edges
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3")), PyreonFlowNode(id: "4", position: PyreonXYPosition(x: 600.0, y: 120.0), data: NodeData(label: "4"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3"), PyreonFlowEdge(id: "e3", source: "3", target: "4")], searchText: { $0.label })
            f.selectNodes(["2", "3"], additive: false)
            f.selectEdge("e3", additive: true)
            f.deleteSelected()
            check(parityNodes(f, [("1", 0.0, 0.0), ("4", 600.0, 120.0)]), "parity: deleteSelected removes the selected nodes with their edges — nodes")
            check(parityEdges(f, []), "parity: deleteSelected removes the selected nodes with their edges — edges")
            check(f.selectedNodes().sorted() == [], "parity: deleteSelected removes the selected nodes with their edges — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: deleteSelected removes the selected nodes with their edges — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: deleteSelected removes the selected nodes with their edges — viewport")
            check(f.getConnectedEdges("1").map { $0.id } == [], "parity: deleteSelected removes the selected nodes with their edges — query 1 connectedEdges")
            check(f.getConnectedEdges("4").map { $0.id } == [], "parity: deleteSelected removes the selected nodes with their edges — query 2 connectedEdges")
        }
        do { // moveSelectedNodes shifts only the selection
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [], searchText: { $0.label })
            f.selectNodes(["1", "3"], additive: false)
            f.moveSelectedNodes(7.5, -12.0)
            check(parityNodes(f, [("1", 7.5, -12.0), ("2", 200.0, 120.0), ("3", 407.5, -12.0)]), "parity: moveSelectedNodes shifts only the selection — nodes")
            check(parityEdges(f, []), "parity: moveSelectedNodes shifts only the selection — edges")
            check(f.selectedNodes().sorted() == ["1", "3"], "parity: moveSelectedNodes shifts only the selection — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: moveSelectedNodes shifts only the selection — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: moveSelectedNodes shifts only the selection — viewport")
        }
        do { // viewport: zoom steps, clamps, pan and set
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], searchText: { $0.label })
            f.zoomIn()
            f.zoomIn()
            f.zoomOut()
            f.panTo(PyreonXYPosition(x: -40.0, y: 25.0))
            f.zoomTo(99.0)
            f.zoomTo(0.0001)
            f.setViewport(PyreonFlowViewport(x: 10.0, y: 20.0, zoom: 2.0))
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0)]), "parity: viewport: zoom steps, clamps, pan and set — nodes")
            check(parityEdges(f, []), "parity: viewport: zoom steps, clamps, pan and set — edges")
            check(f.selectedNodes().sorted() == [], "parity: viewport: zoom steps, clamps, pan and set — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: viewport: zoom steps, clamps, pan and set — selected edges")
            check(abs(f.viewport.x - 10.0) < 1e-6 && abs(f.viewport.y - 20.0) < 1e-6 && abs(f.viewport.zoom - 2.0) < 1e-6, "parity: viewport: zoom steps, clamps, pan and set — viewport")
            check(parityNear(f.screenToFlowPosition(PyreonXYPosition(x: 110.0, y: 220.0)), 50.0, 100.0), "parity: viewport: zoom steps, clamps, pan and set — query 1 screenToFlow")
            check(parityNear(f.screenToFlowPosition(PyreonXYPosition(x: 0.0, y: 0.0)), -5.0, -10.0), "parity: viewport: zoom steps, clamps, pan and set — query 2 screenToFlow")
        }
        do { // connection validation: no self loops, no duplicates, missing nodes
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: connection validation: no self loops, no duplicates, missing nodes — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3")]), "parity: connection validation: no self loops, no duplicates, missing nodes — edges")
            check(f.selectedNodes().sorted() == [], "parity: connection validation: no self loops, no duplicates, missing nodes — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: connection validation: no self loops, no duplicates, missing nodes — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: connection validation: no self loops, no duplicates, missing nodes — viewport")
            check(f.isValidConnection(PyreonFlowConnection(source: "1", target: "3")) == true, "parity: connection validation: no self loops, no duplicates, missing nodes — query 1 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "1", target: "2")) == true, "parity: connection validation: no self loops, no duplicates, missing nodes — query 2 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "2", target: "2")) == true, "parity: connection validation: no self loops, no duplicates, missing nodes — query 3 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "1", target: "ghost")) == true, "parity: connection validation: no self loops, no duplicates, missing nodes — query 4 isValidConnection")
        }
        do { // history: undo and redo across CRUD and moves
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2")], searchText: { $0.label })
            f.addNode(PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3")))
            f.updateNodePosition("1", PyreonXYPosition(x: 5.0, y: 5.0))
            f.removeEdge("e1")
            f.undo()
            f.undo()
            f.redo()
            check(parityNodes(f, [("1", 5.0, 5.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: history: undo and redo across CRUD and moves — nodes")
            check(parityEdges(f, [("e1", "1", "2")]), "parity: history: undo and redo across CRUD and moves — edges")
            check(f.selectedNodes().sorted() == [], "parity: history: undo and redo across CRUD and moves — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: history: undo and redo across CRUD and moves — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: history: undo and redo across CRUD and moves — viewport")
            check(f.getConnectedEdges("1").map { $0.id } == ["e1"], "parity: history: undo and redo across CRUD and moves — query 1 connectedEdges")
        }
        do { // node extent clamps a move and answers clampToExtent
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], searchText: { $0.label })
            f.setNodeExtent(minX: 0.0, minY: 0.0, maxX: 300.0, maxY: 300.0)
            f.updateNodePosition("1", PyreonXYPosition(x: -50.0, y: 900.0))
            check(parityNodes(f, [("1", 0.0, 260.0), ("2", 200.0, 120.0)]), "parity: node extent clamps a move and answers clampToExtent — nodes")
            check(parityEdges(f, []), "parity: node extent clamps a move and answers clampToExtent — edges")
            check(f.selectedNodes().sorted() == [], "parity: node extent clamps a move and answers clampToExtent — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: node extent clamps a move and answers clampToExtent — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: node extent clamps a move and answers clampToExtent — viewport")
            check(parityNear(f.clampToExtent(PyreonXYPosition(x: -10.0, y: 10.0)), 0.0, 10.0), "parity: node extent clamps a move and answers clampToExtent — query 1 clampToExtent")
            check(parityNear(f.clampToExtent(PyreonXYPosition(x: 250.0, y: 250.0)), 150.0, 250.0), "parity: node extent clamps a move and answers clampToExtent — query 2 clampToExtent")
        }
        do { // grid snapping rounds every positioned move but not a relative drag
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], snapToGrid: true, snapGrid: 20.0, searchText: { $0.label })
            f.updateNodePosition("1", PyreonXYPosition(x: 33.0, y: 47.0))
            f.updateNodePosition("2", PyreonXYPosition(x: -29.0, y: 10.5))
            f.addNode(PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 7.0, y: 7.0), data: NodeData(label: "3")))
            f.selectNode("3", additive: false)
            f.moveSelectedNodes(3.0, 4.0)
            check(parityNodes(f, [("1", 40.0, 40.0), ("2", -20.0, 20.0), ("3", 20.0, 20.0)]), "parity: grid snapping rounds every positioned move but not a relative drag — nodes")
            check(parityEdges(f, []), "parity: grid snapping rounds every positioned move but not a relative drag — edges")
            check(f.selectedNodes().sorted() == ["3"], "parity: grid snapping rounds every positioned move but not a relative drag — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: grid snapping rounds every positioned move but not a relative drag — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: grid snapping rounds every positioned move but not a relative drag — viewport")
            check(paritySnap(f.getSnapLines("1", PyreonXYPosition(x: 40.0, y: 50.0)), nil, nil, 40.0, 50.0), "parity: grid snapping rounds every positioned move but not a relative drag — query 1 snapLines")
        }
        do { // object snap lines: centre, left, right, top and bottom within the threshold
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 100.0, y: 100.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 400.0, y: 300.0), data: NodeData(label: "b")), PyreonFlowNode(id: "drag", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "drag"))], edges: [], searchText: { $0.label })
            check(parityNodes(f, [("a", 100.0, 100.0), ("b", 400.0, 300.0), ("drag", 0.0, 0.0)]), "parity: object snap lines: centre, left, right, top and bottom within the threshold — nodes")
            check(parityEdges(f, []), "parity: object snap lines: centre, left, right, top and bottom within the threshold — edges")
            check(f.selectedNodes().sorted() == [], "parity: object snap lines: centre, left, right, top and bottom within the threshold — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: object snap lines: centre, left, right, top and bottom within the threshold — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: object snap lines: centre, left, right, top and bottom within the threshold — viewport")
            check(paritySnap(f.getSnapLines("drag", PyreonXYPosition(x: 103.0, y: 500.0)), 250.0, nil, 100.0, 500.0), "parity: object snap lines: centre, left, right, top and bottom within the threshold — query 1 snapLines")
            check(paritySnap(f.getSnapLines("drag", PyreonXYPosition(x: 700.0, y: 297.0)), nil, 340.0, 700.0, 300.0), "parity: object snap lines: centre, left, right, top and bottom within the threshold — query 2 snapLines")
            check(paritySnap(f.getSnapLines("drag", PyreonXYPosition(x: 254.0, y: 143.0)), nil, nil, 254.0, 143.0), "parity: object snap lines: centre, left, right, top and bottom within the threshold — query 3 snapLines")
            check(paritySnap(f.getSnapLines("drag", PyreonXYPosition(x: 96.0, y: 800.0)), 250.0, nil, 100.0, 800.0), "parity: object snap lines: centre, left, right, top and bottom within the threshold — query 4 snapLines")
            check(paritySnap(f.getSnapLines("missing", PyreonXYPosition(x: 1.0, y: 2.0)), nil, nil, 1.0, 2.0), "parity: object snap lines: centre, left, right, top and bottom within the threshold — query 5 snapLines")
        }
        do { // serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.setViewport(PyreonFlowViewport(x: 12.0, y: -8.0, zoom: 1.5))
            f.selectNodes(["1", "3"], additive: false)
            f.selectEdge("e1", additive: true)
            f.addEdgeWaypoint("e2", PyreonXYPosition(x: 5.0, y: 6.0))
            f.fromJSON(f.toJSON())
            f.undo()
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3")]), "parity: serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection — edges")
            check(f.selectedNodes().sorted() == [], "parity: serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection — selected edges")
            check(abs(f.viewport.x - 12.0) < 1e-6 && abs(f.viewport.y - -8.0) < 1e-6 && abs(f.viewport.zoom - 1.5) < 1e-6, "parity: serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection — viewport")
            check(parityPoints(f.getEdge("e2")?.waypoints ?? [], [(5.0, 6.0)]), "parity: serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection — query 1 waypoints")
            check(f.getConnectedEdges("2").map { $0.id } == ["e1", "e2"], "parity: serialization: a toJSON/fromJSON round-trip keeps the graph and viewport and clears the selection — query 2 connectedEdges")
        }
        do { // clipboard: copy and paste offsets the copies and remaps their edges
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.paste(PyreonXYPosition(x: 1.0, y: 1.0))
            f.selectNodes(["1", "2"], additive: false)
            f.copySelected()
            f.paste(PyreonXYPosition(x: 50.0, y: 50.0))
            f.paste(PyreonXYPosition(x: -10.0, y: 20.0))
            f.clearSelection()
            f.copySelected()
            f.paste(PyreonXYPosition(x: 0.0, y: 0.0))
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0), ("1-copy-1", 50.0, 50.0), ("2-copy-2", 250.0, 170.0), ("1-copy-3", -10.0, 20.0), ("2-copy-4", 190.0, 140.0), ("1-copy-5", 0.0, 0.0), ("2-copy-6", 200.0, 120.0)]), "parity: clipboard: copy and paste offsets the copies and remaps their edges — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3"), ("e-1-copy-1-2-copy-2", "1-copy-1", "2-copy-2"), ("e-1-copy-3-2-copy-4", "1-copy-3", "2-copy-4"), ("e-1-copy-5-2-copy-6", "1-copy-5", "2-copy-6")]), "parity: clipboard: copy and paste offsets the copies and remaps their edges — edges")
            check(f.selectedNodes().sorted() == ["1-copy-5", "2-copy-6"], "parity: clipboard: copy and paste offsets the copies and remaps their edges — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: clipboard: copy and paste offsets the copies and remaps their edges — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: clipboard: copy and paste offsets the copies and remaps their edges — viewport")
            check(f.getConnectedEdges("1-copy-1").map { $0.id } == ["e-1-copy-1-2-copy-2"], "parity: clipboard: copy and paste offsets the copies and remaps their edges — query 1 connectedEdges")
            check(f.getOutgoers("1-copy-3").map { $0.id } == ["2-copy-4"], "parity: clipboard: copy and paste offsets the copies and remaps their edges — query 2 outgoers")
        }
        do { // waypoints: append, insert, update and remove, then undo
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2")], searchText: { $0.label })
            f.addEdgeWaypoint("e1", PyreonXYPosition(x: 10.0, y: 20.0))
            f.addEdgeWaypoint("e1", PyreonXYPosition(x: 30.0, y: 40.0))
            f.addEdgeWaypoint("e1", PyreonXYPosition(x: 1.0, y: 2.0), 0)
            f.updateEdgeWaypoint("e1", 1, PyreonXYPosition(x: 11.0, y: 22.0))
            f.updateEdgeWaypoint("e1", 9, PyreonXYPosition(x: 99.0, y: 99.0))
            f.removeEdgeWaypoint("e1", 2)
            f.addEdgeWaypoint("missing", PyreonXYPosition(x: 0.0, y: 0.0))
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0)]), "parity: waypoints: append, insert, update and remove, then undo — nodes")
            check(parityEdges(f, [("e1", "1", "2")]), "parity: waypoints: append, insert, update and remove, then undo — edges")
            check(f.selectedNodes().sorted() == [], "parity: waypoints: append, insert, update and remove, then undo — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: waypoints: append, insert, update and remove, then undo — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: waypoints: append, insert, update and remove, then undo — viewport")
            check(parityPoints(f.getEdge("e1")?.waypoints ?? [], [(1.0, 2.0), (11.0, 22.0)]), "parity: waypoints: append, insert, update and remove, then undo — query 1 waypoints")
            check(parityPoints(f.getEdge("missing")?.waypoints ?? [], []), "parity: waypoints: append, insert, update and remove, then undo — query 2 waypoints")
        }
        do { // viewport framing: fitView and setCenter against a measured container
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 600.0, y: 0.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 300.0, y: 500.0), data: NodeData(label: "3"))], edges: [], searchText: { $0.label })
            f.replaceContainerSize(PyreonFlowContainerSize(width: 800.0, height: 600.0))
            f.fitView(nil)
            f.fitView(["1"], padding: 0.25)
            f.setCenter(100.0, 100.0, zoom: 2.0)
            f.setCenter(-50.0, 20.0)
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 600.0, 0.0), ("3", 300.0, 500.0)]), "parity: viewport framing: fitView and setCenter against a measured container — nodes")
            check(parityEdges(f, []), "parity: viewport framing: fitView and setCenter against a measured container — edges")
            check(f.selectedNodes().sorted() == [], "parity: viewport framing: fitView and setCenter against a measured container — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: viewport framing: fitView and setCenter against a measured container — selected edges")
            check(abs(f.viewport.x - 500.0) < 1e-6 && abs(f.viewport.y - 260.0) < 1e-6 && abs(f.viewport.zoom - 2.0) < 1e-6, "parity: viewport framing: fitView and setCenter against a measured container — viewport")
            check(parityNear(f.flowToScreenPosition(PyreonXYPosition(x: 10.0, y: 10.0)), 520.0, 280.0), "parity: viewport framing: fitView and setCenter against a measured container — query 1 flowToScreen")
            check(f.isNodeVisible("1") == true, "parity: viewport framing: fitView and setCenter against a measured container — query 2 isNodeVisible")
            check(f.isNodeVisible("2") == false, "parity: viewport framing: fitView and setCenter against a measured container — query 3 isNodeVisible")
            check(f.isNodeVisible("missing") == false, "parity: viewport framing: fitView and setCenter against a measured container — query 4 isNodeVisible")
        }
        do { // fitView on a subset and on nothing
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], searchText: { $0.label })
            f.replaceContainerSize(PyreonFlowContainerSize(width: 400.0, height: 300.0))
            f.fitView(["missing"])
            f.fitView(["2"], padding: 0.0)
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0)]), "parity: fitView on a subset and on nothing — nodes")
            check(parityEdges(f, []), "parity: fitView on a subset and on nothing — edges")
            check(f.selectedNodes().sorted() == [], "parity: fitView on a subset and on nothing — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: fitView on a subset and on nothing — selected edges")
            check(abs(f.viewport.x - -533.333333333) < 1e-6 && abs(f.viewport.y - -223.333333333) < 1e-6 && abs(f.viewport.zoom - 2.666666667) < 1e-6, "parity: fitView on a subset and on nothing — viewport")
            check(f.isNodeVisible("1") == false, "parity: fitView on a subset and on nothing — query 1 isNodeVisible")
            check(f.isNodeVisible("2") == true, "parity: fitView on a subset and on nothing — query 2 isNodeVisible")
        }
        do { // graph queries: parent chains, children, overlaps, proximity and search
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "root", position: PyreonXYPosition(x: 100.0, y: 100.0), data: NodeData(label: "root")), PyreonFlowNode(id: "child", position: PyreonXYPosition(x: 10.0, y: 20.0), data: NodeData(label: "child"), parentId: "root"), PyreonFlowNode(id: "grandchild", position: PyreonXYPosition(x: 1.0, y: 2.0), data: NodeData(label: "grandchild"), parentId: "child"), PyreonFlowNode(id: "near", position: PyreonXYPosition(x: 220.0, y: 105.0), data: NodeData(label: "near")), PyreonFlowNode(id: "far", position: PyreonXYPosition(x: 900.0, y: 900.0), data: NodeData(label: "far")), PyreonFlowNode(id: "overlap", position: PyreonXYPosition(x: 150.0, y: 110.0), data: NodeData(label: "overlap")), PyreonFlowNode(id: "peek", position: PyreonXYPosition(x: -200.0, y: 0.0), data: NodeData(label: "peek"), parentId: "root")], edges: [PyreonFlowEdge(id: "e1", source: "root", target: "near")], searchText: { $0.label })
            f.replaceContainerSize(PyreonFlowContainerSize(width: 800.0, height: 600.0))
            check(parityNodes(f, [("root", 100.0, 100.0), ("child", 10.0, 20.0), ("grandchild", 1.0, 2.0), ("near", 220.0, 105.0), ("far", 900.0, 900.0), ("overlap", 150.0, 110.0), ("peek", -200.0, 0.0)]), "parity: graph queries: parent chains, children, overlaps, proximity and search — nodes")
            check(parityEdges(f, [("e1", "root", "near")]), "parity: graph queries: parent chains, children, overlaps, proximity and search — edges")
            check(f.selectedNodes().sorted() == [], "parity: graph queries: parent chains, children, overlaps, proximity and search — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: graph queries: parent chains, children, overlaps, proximity and search — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: graph queries: parent chains, children, overlaps, proximity and search — viewport")
            check(parityNear(f.getAbsolutePosition("grandchild"), 111.0, 122.0), "parity: graph queries: parent chains, children, overlaps, proximity and search — query 1 absolutePosition")
            check(parityNear(f.getAbsolutePosition("missing"), 0.0, 0.0), "parity: graph queries: parent chains, children, overlaps, proximity and search — query 2 absolutePosition")
            check(f.getChildNodes("root").map { $0.id } == ["child", "peek"], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 3 childNodes")
            check(f.getChildNodes("far").map { $0.id } == [], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 4 childNodes")
            check(f.getOverlappingNodes("root").map { $0.id } == ["near", "overlap"], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 5 overlapping")
            check(f.getOverlappingNodes("far").map { $0.id } == [], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 6 overlapping")
            check((f.getProximityConnection("overlap", 200.0).map { [$0.source, $0.target] } ?? []) == ["overlap", "root"], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 7 proximity")
            check((f.getProximityConnection("root", 200.0).map { [$0.source, $0.target] } ?? []) == ["root", "overlap"], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 8 proximity")
            check((f.getProximityConnection("far", 10.0).map { [$0.source, $0.target] } ?? []) == [], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 9 proximity")
            check(f.searchNodes("AR").map { $0.id } == ["near", "far"], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 10 search")
            check(f.searchNodes("zzz").map { $0.id } == [], "parity: graph queries: parent chains, children, overlaps, proximity and search — query 11 search")
            check(f.isNodeVisible("grandchild") == true, "parity: graph queries: parent chains, children, overlaps, proximity and search — query 12 isNodeVisible")
            check(f.isNodeVisible("peek") == true, "parity: graph queries: parent chains, children, overlaps, proximity and search — query 13 isNodeVisible")
            check(parityNear(f.getAbsolutePosition("peek"), -100.0, 100.0), "parity: graph queries: parent chains, children, overlaps, proximity and search — query 14 absolutePosition")
        }
        do { // resolveCollisions pushes the overlapping neighbour away
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 100.0, y: 5.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 20.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 500.0, y: 500.0), data: NodeData(label: "d"))], edges: [], searchText: { $0.label })
            f.resolveCollisions("a", 10.0)
            f.resolveCollisions("d", 10.0)
            f.resolveCollisions("missing", 10.0)
            check(parityNodes(f, [("a", 0.0, 0.0), ("b", 100.0, 27.5), ("c", 20.0, 40.0), ("d", 500.0, 500.0)]), "parity: resolveCollisions pushes the overlapping neighbour away — nodes")
            check(parityEdges(f, []), "parity: resolveCollisions pushes the overlapping neighbour away — edges")
            check(f.selectedNodes().sorted() == [], "parity: resolveCollisions pushes the overlapping neighbour away — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: resolveCollisions pushes the overlapping neighbour away — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: resolveCollisions pushes the overlapping neighbour away — viewport")
            check(f.getOverlappingNodes("a").map { $0.id } == ["b"], "parity: resolveCollisions pushes the overlapping neighbour away — query 1 overlapping")
        }
        do { // layout layered lays the same graph out on every target
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "r")), PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 10.0, y: 10.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 20.0, y: 20.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 30.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 40.0, y: 40.0), data: NodeData(label: "d")), PyreonFlowNode(id: "e", position: PyreonXYPosition(x: 50.0, y: 50.0), data: NodeData(label: "e"))], edges: [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "ad", source: "a", target: "d"), PyreonFlowEdge(id: "be", source: "b", target: "e"), PyreonFlowEdge(id: "ce", source: "c", target: "e")], searchText: { $0.label })
            f.layout("layered", options: PyreonFlowLayoutOptions(animate: false))
            check(parityNodes(f, [("r", 85.0, 0.0), ("a", 0.0, 80.0), ("b", 170.0, 80.0), ("c", 0.0, 160.0), ("d", 170.0, 160.0), ("e", 85.0, 240.0)]), "parity: layout layered lays the same graph out on every target — nodes")
            check(parityEdges(f, [("ra", "r", "a"), ("rb", "r", "b"), ("ac", "a", "c"), ("ad", "a", "d"), ("be", "b", "e"), ("ce", "c", "e")]), "parity: layout layered lays the same graph out on every target — edges")
            check(f.selectedNodes().sorted() == [], "parity: layout layered lays the same graph out on every target — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: layout layered lays the same graph out on every target — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: layout layered lays the same graph out on every target — viewport")
            check(f.getIncomers("e").map { $0.id } == ["b", "c"], "parity: layout layered lays the same graph out on every target — query 1 incomers")
        }
        do { // layout layereddirection: RIGHT nodeSpacing: 30 layerSpacing: 60 lays the same graph out on every target
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "r")), PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 10.0, y: 10.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 20.0, y: 20.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 30.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 40.0, y: 40.0), data: NodeData(label: "d")), PyreonFlowNode(id: "e", position: PyreonXYPosition(x: 50.0, y: 50.0), data: NodeData(label: "e"))], edges: [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "ad", source: "a", target: "d"), PyreonFlowEdge(id: "be", source: "b", target: "e"), PyreonFlowEdge(id: "ce", source: "c", target: "e")], searchText: { $0.label })
            f.layout("layered", options: PyreonFlowLayoutOptions(direction: "RIGHT", nodeSpacing: 30.0, layerSpacing: 60.0, animate: false))
            check(parityNodes(f, [("r", 0.0, 35.0), ("a", 210.0, 0.0), ("b", 210.0, 70.0), ("c", 420.0, 0.0), ("d", 420.0, 70.0), ("e", 630.0, 35.0)]), "parity: layout layereddirection: RIGHT nodeSpacing: 30 layerSpacing: 60 lays the same graph out on every target — nodes")
            check(parityEdges(f, [("ra", "r", "a"), ("rb", "r", "b"), ("ac", "a", "c"), ("ad", "a", "d"), ("be", "b", "e"), ("ce", "c", "e")]), "parity: layout layereddirection: RIGHT nodeSpacing: 30 layerSpacing: 60 lays the same graph out on every target — edges")
            check(f.selectedNodes().sorted() == [], "parity: layout layereddirection: RIGHT nodeSpacing: 30 layerSpacing: 60 lays the same graph out on every target — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: layout layereddirection: RIGHT nodeSpacing: 30 layerSpacing: 60 lays the same graph out on every target — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: layout layereddirection: RIGHT nodeSpacing: 30 layerSpacing: 60 lays the same graph out on every target — viewport")
            check(f.getIncomers("e").map { $0.id } == ["b", "c"], "parity: layout layereddirection: RIGHT nodeSpacing: 30 layerSpacing: 60 lays the same graph out on every target — query 1 incomers")
        }
        do { // layout treedirection: UP lays the same graph out on every target
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "r")), PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 10.0, y: 10.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 20.0, y: 20.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 30.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 40.0, y: 40.0), data: NodeData(label: "d")), PyreonFlowNode(id: "e", position: PyreonXYPosition(x: 50.0, y: 50.0), data: NodeData(label: "e"))], edges: [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "ad", source: "a", target: "d"), PyreonFlowEdge(id: "be", source: "b", target: "e"), PyreonFlowEdge(id: "ce", source: "c", target: "e")], searchText: { $0.label })
            f.layout("tree", options: PyreonFlowLayoutOptions(direction: "UP", animate: false))
            check(parityNodes(f, [("r", 212.5, 160.0), ("a", 85.0, 80.0), ("b", 340.0, 80.0), ("c", 0.0, 0.0), ("d", 170.0, 0.0), ("e", 340.0, 0.0)]), "parity: layout treedirection: UP lays the same graph out on every target — nodes")
            check(parityEdges(f, [("ra", "r", "a"), ("rb", "r", "b"), ("ac", "a", "c"), ("ad", "a", "d"), ("be", "b", "e"), ("ce", "c", "e")]), "parity: layout treedirection: UP lays the same graph out on every target — edges")
            check(f.selectedNodes().sorted() == [], "parity: layout treedirection: UP lays the same graph out on every target — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: layout treedirection: UP lays the same graph out on every target — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: layout treedirection: UP lays the same graph out on every target — viewport")
            check(f.getIncomers("e").map { $0.id } == ["b", "c"], "parity: layout treedirection: UP lays the same graph out on every target — query 1 incomers")
        }
        do { // layout force lays the same graph out on every target
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "r")), PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 10.0, y: 10.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 20.0, y: 20.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 30.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 40.0, y: 40.0), data: NodeData(label: "d")), PyreonFlowNode(id: "e", position: PyreonXYPosition(x: 50.0, y: 50.0), data: NodeData(label: "e"))], edges: [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "ad", source: "a", target: "d"), PyreonFlowEdge(id: "be", source: "b", target: "e"), PyreonFlowEdge(id: "ce", source: "c", target: "e")], searchText: { $0.label })
            f.layout("force", options: PyreonFlowLayoutOptions(animate: false))
            check(parityNodes(f, [("r", 512.810192797, 454.065701271), ("a", 287.296200837, 228.629191908), ("b", 811.665448949, 373.900970371), ("c", 509.456382543, 0.0), ("d", 0.0, 230.38461965), ("e", 809.395270787, 75.921196377)], 0.01), "parity: layout force lays the same graph out on every target — nodes")
            check(parityEdges(f, [("ra", "r", "a"), ("rb", "r", "b"), ("ac", "a", "c"), ("ad", "a", "d"), ("be", "b", "e"), ("ce", "c", "e")]), "parity: layout force lays the same graph out on every target — edges")
            check(f.selectedNodes().sorted() == [], "parity: layout force lays the same graph out on every target — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: layout force lays the same graph out on every target — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: layout force lays the same graph out on every target — viewport")
            check(f.getIncomers("e").map { $0.id } == ["b", "c"], "parity: layout force lays the same graph out on every target — query 1 incomers")
        }
        do { // layout stressnodeSpacing: 25 lays the same graph out on every target
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "r")), PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 10.0, y: 10.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 20.0, y: 20.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 30.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 40.0, y: 40.0), data: NodeData(label: "d")), PyreonFlowNode(id: "e", position: PyreonXYPosition(x: 50.0, y: 50.0), data: NodeData(label: "e"))], edges: [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "ad", source: "a", target: "d"), PyreonFlowEdge(id: "be", source: "b", target: "e"), PyreonFlowEdge(id: "ce", source: "c", target: "e")], searchText: { $0.label })
            f.layout("stress", options: PyreonFlowLayoutOptions(nodeSpacing: 25.0, animate: false))
            check(parityNodes(f, [("r", 316.417192291, 304.190277111), ("a", 184.077353589, 161.480274653), ("b", 495.011418201, 233.189464774), ("c", 292.72402226, 0.0), ("d", 0.0, 175.817932046), ("e", 480.158056545, 42.491124589)], 0.01), "parity: layout stressnodeSpacing: 25 lays the same graph out on every target — nodes")
            check(parityEdges(f, [("ra", "r", "a"), ("rb", "r", "b"), ("ac", "a", "c"), ("ad", "a", "d"), ("be", "b", "e"), ("ce", "c", "e")]), "parity: layout stressnodeSpacing: 25 lays the same graph out on every target — edges")
            check(f.selectedNodes().sorted() == [], "parity: layout stressnodeSpacing: 25 lays the same graph out on every target — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: layout stressnodeSpacing: 25 lays the same graph out on every target — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: layout stressnodeSpacing: 25 lays the same graph out on every target — viewport")
            check(f.getIncomers("e").map { $0.id } == ["b", "c"], "parity: layout stressnodeSpacing: 25 lays the same graph out on every target — query 1 incomers")
        }
        do { // layout radial lays the same graph out on every target
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "r")), PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 10.0, y: 10.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 20.0, y: 20.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 30.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 40.0, y: 40.0), data: NodeData(label: "d")), PyreonFlowNode(id: "e", position: PyreonXYPosition(x: 50.0, y: 50.0), data: NodeData(label: "e"))], edges: [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "ad", source: "a", target: "d"), PyreonFlowEdge(id: "be", source: "b", target: "e"), PyreonFlowEdge(id: "ce", source: "c", target: "e")], searchText: { $0.label })
            f.layout("radial", options: PyreonFlowLayoutOptions(animate: false))
            check(parityNodes(f, [("r", 190.0, 329.089653438), ("a", 380.0, 329.089653438), ("b", 0.0, 329.089653438), ("c", 570.0, 329.089653438), ("d", 0.0, 658.179306876), ("e", 0.0, 0.0)], 0.01), "parity: layout radial lays the same graph out on every target — nodes")
            check(parityEdges(f, [("ra", "r", "a"), ("rb", "r", "b"), ("ac", "a", "c"), ("ad", "a", "d"), ("be", "b", "e"), ("ce", "c", "e")]), "parity: layout radial lays the same graph out on every target — edges")
            check(f.selectedNodes().sorted() == [], "parity: layout radial lays the same graph out on every target — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: layout radial lays the same graph out on every target — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: layout radial lays the same graph out on every target — viewport")
            check(f.getIncomers("e").map { $0.id } == ["b", "c"], "parity: layout radial lays the same graph out on every target — query 1 incomers")
        }
        do { // layout box lays the same graph out on every target
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "r")), PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 10.0, y: 10.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 20.0, y: 20.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 30.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 40.0, y: 40.0), data: NodeData(label: "d")), PyreonFlowNode(id: "e", position: PyreonXYPosition(x: 50.0, y: 50.0), data: NodeData(label: "e"))], edges: [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "ad", source: "a", target: "d"), PyreonFlowEdge(id: "be", source: "b", target: "e"), PyreonFlowEdge(id: "ce", source: "c", target: "e")], searchText: { $0.label })
            f.layout("box", options: PyreonFlowLayoutOptions(animate: false))
            check(parityNodes(f, [("r", 0.0, 0.0), ("a", 170.0, 0.0), ("b", 340.0, 0.0), ("c", 0.0, 60.0), ("d", 170.0, 60.0), ("e", 340.0, 60.0)]), "parity: layout box lays the same graph out on every target — nodes")
            check(parityEdges(f, [("ra", "r", "a"), ("rb", "r", "b"), ("ac", "a", "c"), ("ad", "a", "d"), ("be", "b", "e"), ("ce", "c", "e")]), "parity: layout box lays the same graph out on every target — edges")
            check(f.selectedNodes().sorted() == [], "parity: layout box lays the same graph out on every target — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: layout box lays the same graph out on every target — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: layout box lays the same graph out on every target — viewport")
            check(f.getIncomers("e").map { $0.id } == ["b", "c"], "parity: layout box lays the same graph out on every target — query 1 incomers")
        }
        do { // layout rectpackingnodeSpacing: 12 lays the same graph out on every target
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "r", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "r")), PyreonFlowNode(id: "a", position: PyreonXYPosition(x: 10.0, y: 10.0), data: NodeData(label: "a")), PyreonFlowNode(id: "b", position: PyreonXYPosition(x: 20.0, y: 20.0), data: NodeData(label: "b")), PyreonFlowNode(id: "c", position: PyreonXYPosition(x: 30.0, y: 30.0), data: NodeData(label: "c")), PyreonFlowNode(id: "d", position: PyreonXYPosition(x: 40.0, y: 40.0), data: NodeData(label: "d")), PyreonFlowNode(id: "e", position: PyreonXYPosition(x: 50.0, y: 50.0), data: NodeData(label: "e"))], edges: [PyreonFlowEdge(id: "ra", source: "r", target: "a"), PyreonFlowEdge(id: "rb", source: "r", target: "b"), PyreonFlowEdge(id: "ac", source: "a", target: "c"), PyreonFlowEdge(id: "ad", source: "a", target: "d"), PyreonFlowEdge(id: "be", source: "b", target: "e"), PyreonFlowEdge(id: "ce", source: "c", target: "e")], searchText: { $0.label })
            f.layout("rectpacking", options: PyreonFlowLayoutOptions(nodeSpacing: 12.0, animate: false))
            check(parityNodes(f, [("r", 0.0, 0.0), ("a", 162.0, 0.0), ("b", 324.0, 0.0), ("c", 0.0, 52.0), ("d", 162.0, 52.0), ("e", 324.0, 52.0)]), "parity: layout rectpackingnodeSpacing: 12 lays the same graph out on every target — nodes")
            check(parityEdges(f, [("ra", "r", "a"), ("rb", "r", "b"), ("ac", "a", "c"), ("ad", "a", "d"), ("be", "b", "e"), ("ce", "c", "e")]), "parity: layout rectpackingnodeSpacing: 12 lays the same graph out on every target — edges")
            check(f.selectedNodes().sorted() == [], "parity: layout rectpackingnodeSpacing: 12 lays the same graph out on every target — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: layout rectpackingnodeSpacing: 12 lays the same graph out on every target — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: layout rectpackingnodeSpacing: 12 lays the same graph out on every target — viewport")
            check(f.getIncomers("e").map { $0.id } == ["b", "c"], "parity: layout rectpackingnodeSpacing: 12 lays the same graph out on every target — query 1 incomers")
        }
        do { // bulk node and edge CRUD
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.addNodes([PyreonFlowNode(id: "4", position: PyreonXYPosition(x: 600.0, y: 0.0), data: NodeData(label: "4")), PyreonFlowNode(id: "5", position: PyreonXYPosition(x: 800.0, y: 120.0), data: NodeData(label: "5"))])
            f.addEdges([PyreonFlowEdge(id: "e3", source: "3", target: "4"), PyreonFlowEdge(id: "e4", source: "4", target: "5")])
            f.removeNodes(["1"])
            f.removeEdges(["e3"])
            f.updateEdge("e4") { $0.target = "2" }
            f.updateNode("5") { $0.position = PyreonXYPosition(x: 820.0, y: 140.0) }
            check(parityNodes(f, [("2", 200.0, 120.0), ("3", 400.0, 0.0), ("4", 600.0, 0.0), ("5", 820.0, 140.0)]), "parity: bulk node and edge CRUD — nodes")
            check(parityEdges(f, [("e2", "2", "3"), ("e4", "4", "2")]), "parity: bulk node and edge CRUD — edges")
            check(f.selectedNodes().sorted() == [], "parity: bulk node and edge CRUD — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: bulk node and edge CRUD — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: bulk node and edge CRUD — viewport")
            check(parityPoints(f.getNode("5").map { [$0.position] } ?? [], [(820.0, 140.0)]), "parity: bulk node and edge CRUD — query 1 nodePosition")
            check(parityPoints(f.getNode("1").map { [$0.position] } ?? [], []), "parity: bulk node and edge CRUD — query 2 nodePosition")
            check(f.getConnectedEdges("2").map { $0.id } == ["e2", "e4"], "parity: bulk node and edge CRUD — query 3 connectedEdges")
            check(f.getIncomers("2").map { $0.id } == ["4"], "parity: bulk node and edge CRUD — query 4 incomers")
        }
        do { // replacing the whole graph prunes a stale selection
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.selectAll()
            f.selectEdge("e1", additive: true)
            f.setNodes([PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "9", position: PyreonXYPosition(x: 300.0, y: 300.0), data: NodeData(label: "9"))] as [PyreonFlowNode<NodeData>])
            f.setEdges([PyreonFlowEdge(id: "e9", source: "1", target: "9")] as [PyreonFlowEdge])
            check(parityNodes(f, [("1", 0.0, 0.0), ("9", 300.0, 300.0)]), "parity: replacing the whole graph prunes a stale selection — nodes")
            check(parityEdges(f, [("e9", "1", "9")]), "parity: replacing the whole graph prunes a stale selection — edges")
            check(f.selectedNodes().sorted() == ["1"], "parity: replacing the whole graph prunes a stale selection — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: replacing the whole graph prunes a stale selection — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: replacing the whole graph prunes a stale selection — viewport")
            check(f.isNodeSelected("1") == true, "parity: replacing the whole graph prunes a stale selection — query 1 nodeSelected")
            check(f.isNodeSelected("2") == false, "parity: replacing the whole graph prunes a stale selection — query 2 nodeSelected")
            check(f.isEdgeSelected("e1") == false, "parity: replacing the whole graph prunes a stale selection — query 3 edgeSelected")
            check(f.getOutgoers("1").map { $0.id } == ["9"], "parity: replacing the whole graph prunes a stale selection — query 4 outgoers")
        }
        do { // a data update reaches search and predicates
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [], searchText: { $0.label })
            f.updateNodeData("2") { $0.label = "Renamed" }
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: a data update reaches search and predicates — nodes")
            check(parityEdges(f, []), "parity: a data update reaches search and predicates — edges")
            check(f.selectedNodes().sorted() == [], "parity: a data update reaches search and predicates — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: a data update reaches search and predicates — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: a data update reaches search and predicates — viewport")
            check(f.searchNodes("Renamed").map { $0.id } == ["2"], "parity: a data update reaches search and predicates — query 1 search")
            check(f.findNodes { $0.data.label == "Renamed" }.map { $0.id } == ["2"], "parity: a data update reaches search and predicates — query 2 findByLabel")
            check(f.findNodes { $0.data.label == "2" }.map { $0.id } == [], "parity: a data update reaches search and predicates — query 3 findByLabel")
        }
        do { // a measured size drives dimensions, overlap and fit
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [], searchText: { $0.label })
            f.updateNodeMeasurement("1", width: 320.0, height: 90.0)
            f.replaceContainerSize(PyreonFlowContainerSize(width: 800.0, height: 600.0))
            f.fitView(nil)
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: a measured size drives dimensions, overlap and fit — nodes")
            check(parityEdges(f, []), "parity: a measured size drives dimensions, overlap and fit — edges")
            check(f.selectedNodes().sorted() == [], "parity: a measured size drives dimensions, overlap and fit — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: a measured size drives dimensions, overlap and fit — selected edges")
            check(abs(f.viewport.x - 66.666666667) < 1e-6 && abs(f.viewport.y - 203.03030303) < 1e-6 && abs(f.viewport.zoom - 1.212121212) < 1e-6, "parity: a measured size drives dimensions, overlap and fit — viewport")
            check({ let dm = f.getNodeDimensions("1"); return abs(dm.width - 320.0) < 1e-6 && abs(dm.height - 90.0) < 1e-6 }(), "parity: a measured size drives dimensions, overlap and fit — query 1 dimensions")
            check({ let dm = f.getNodeDimensions("2"); return abs(dm.width - 150.0) < 1e-6 && abs(dm.height - 40.0) < 1e-6 }(), "parity: a measured size drives dimensions, overlap and fit — query 2 dimensions")
            check(f.getOverlappingNodes("1").map { $0.id } == [], "parity: a measured size drives dimensions, overlap and fit — query 3 overlapping")
        }
        do { // clearing a measurement falls back to the default size
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], searchText: { $0.label })
            f.updateNodeMeasurement("1", width: 320.0, height: 90.0)
            f.clearNodeMeasurement("1")
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0)]), "parity: clearing a measurement falls back to the default size — nodes")
            check(parityEdges(f, []), "parity: clearing a measurement falls back to the default size — edges")
            check(f.selectedNodes().sorted() == [], "parity: clearing a measurement falls back to the default size — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: clearing a measurement falls back to the default size — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: clearing a measurement falls back to the default size — viewport")
            check({ let dm = f.getNodeDimensions("1"); return abs(dm.width - 150.0) < 1e-6 && abs(dm.height - 40.0) < 1e-6 }(), "parity: clearing a measurement falls back to the default size — query 1 dimensions")
            check(f.getOverlappingNodes("1").map { $0.id } == [], "parity: clearing a measurement falls back to the default size — query 2 overlapping")
        }
        do { // batch applies every operation it wraps
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], searchText: { $0.label })
            f.batch { f.addNode(PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))); f.addEdge(PyreonFlowEdge(id: "e5", source: "1", target: "3")); f.selectNode("3", additive: false) }
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: batch applies every operation it wraps — nodes")
            check(parityEdges(f, [("e5", "1", "3")]), "parity: batch applies every operation it wraps — edges")
            check(f.selectedNodes().sorted() == ["3"], "parity: batch applies every operation it wraps — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: batch applies every operation it wraps — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: batch applies every operation it wraps — viewport")
            check(f.isNodeSelected("3") == true, "parity: batch applies every operation it wraps — query 1 nodeSelected")
            check(f.getOutgoers("1").map { $0.id } == ["3"], "parity: batch applies every operation it wraps — query 2 outgoers")
        }
        do { // config: zoom limits clamp every zoom path
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], searchText: { $0.label })
            f.minZoom = 0.5
            f.maxZoom = 2.0
            f.zoomTo(10.0)
            f.zoomIn()
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0)]), "parity: config: zoom limits clamp every zoom path — nodes")
            check(parityEdges(f, []), "parity: config: zoom limits clamp every zoom path — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: zoom limits clamp every zoom path — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: zoom limits clamp every zoom path — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 2.0) < 1e-6, "parity: config: zoom limits clamp every zoom path — viewport")
        }
        do { // config: the lower zoom limit clamps too
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], searchText: { $0.label })
            f.minZoom = 0.5
            f.maxZoom = 2.0
            f.zoomTo(0.01)
            f.zoomOut()
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0)]), "parity: config: the lower zoom limit clamps too — nodes")
            check(parityEdges(f, []), "parity: config: the lower zoom limit clamps too — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: the lower zoom limit clamps too — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: the lower zoom limit clamps too — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 0.5) < 1e-6, "parity: config: the lower zoom limit clamps too — viewport")
        }
        do { // config: multiSelect off makes an additive selection replace
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [], searchText: { $0.label })
            f.multiSelect = false
            f.selectNode("1", additive: false)
            f.selectNode("2", additive: true)
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: config: multiSelect off makes an additive selection replace — nodes")
            check(parityEdges(f, []), "parity: config: multiSelect off makes an additive selection replace — edges")
            check(f.selectedNodes().sorted() == ["2"], "parity: config: multiSelect off makes an additive selection replace — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: multiSelect off makes an additive selection replace — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: config: multiSelect off makes an additive selection replace — viewport")
            check(f.isNodeSelected("1") == false, "parity: config: multiSelect off makes an additive selection replace — query 1 nodeSelected")
            check(f.isNodeSelected("2") == true, "parity: config: multiSelect off makes an additive selection replace — query 2 nodeSelected")
        }
        do { // config: undeletable nodes and edges survive deleteSelected
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.nodesDeletable = false
            f.edgesDeletable = false
            f.selectAll()
            f.selectEdge("e1", additive: true)
            f.deleteSelected()
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: config: undeletable nodes and edges survive deleteSelected — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3")]), "parity: config: undeletable nodes and edges survive deleteSelected — edges")
            check(f.selectedNodes().sorted() == ["1", "2", "3"], "parity: config: undeletable nodes and edges survive deleteSelected — selected nodes")
            check(f.selectedEdges().sorted() == ["e1"], "parity: config: undeletable nodes and edges survive deleteSelected — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: config: undeletable nodes and edges survive deleteSelected — viewport")
        }
        do { // config: with autoHistory off, a removal is not undoable
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.autoHistory = false
            f.removeNode("2")
            f.undo()
            check(parityNodes(f, [("1", 0.0, 0.0), ("3", 400.0, 0.0)]), "parity: config: with autoHistory off, a removal is not undoable — nodes")
            check(parityEdges(f, []), "parity: config: with autoHistory off, a removal is not undoable — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: with autoHistory off, a removal is not undoable — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: with autoHistory off, a removal is not undoable — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: config: with autoHistory off, a removal is not undoable — viewport")
        }
        do { // with autoHistory off, a manual checkpoint makes the removal undoable
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.autoHistory = false
            f.pushHistory()
            f.removeNode("2")
            f.undo()
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: with autoHistory off, a manual checkpoint makes the removal undoable — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3")]), "parity: with autoHistory off, a manual checkpoint makes the removal undoable — edges")
            check(f.selectedNodes().sorted() == [], "parity: with autoHistory off, a manual checkpoint makes the removal undoable — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: with autoHistory off, a manual checkpoint makes the removal undoable — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: with autoHistory off, a manual checkpoint makes the removal undoable — viewport")
        }
        do { // with autoHistory on, the same removal is undoable
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e1", source: "1", target: "2"), PyreonFlowEdge(id: "e2", source: "2", target: "3")], searchText: { $0.label })
            f.removeNode("2")
            f.undo()
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: with autoHistory on, the same removal is undoable — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3")]), "parity: with autoHistory on, the same removal is undoable — edges")
            check(f.selectedNodes().sorted() == [], "parity: with autoHistory on, the same removal is undoable — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: with autoHistory on, the same removal is undoable — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: with autoHistory on, the same removal is undoable — viewport")
        }
        do { // config: connectionRules gate a connection by the source and target node types
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "in", type: "input", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "in")), PyreonFlowNode(id: "proc", type: "process", position: PyreonXYPosition(x: 200.0, y: 0.0), data: NodeData(label: "proc")), PyreonFlowNode(id: "out", type: "output", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "out")), PyreonFlowNode(id: "plain", position: PyreonXYPosition(x: 600.0, y: 0.0), data: NodeData(label: "plain"))], edges: [], searchText: { $0.label })
            f.connectionRules = ["input": ["process"], "process": ["output"], "default": ["output"]]
            check(parityNodes(f, [("in", 0.0, 0.0), ("proc", 200.0, 0.0), ("out", 400.0, 0.0), ("plain", 600.0, 0.0)]), "parity: config: connectionRules gate a connection by the source and target node types — nodes")
            check(parityEdges(f, []), "parity: config: connectionRules gate a connection by the source and target node types — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: connectionRules gate a connection by the source and target node types — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: connectionRules gate a connection by the source and target node types — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: config: connectionRules gate a connection by the source and target node types — viewport")
            check(f.isValidConnection(PyreonFlowConnection(source: "in", target: "proc")) == true, "parity: config: connectionRules gate a connection by the source and target node types — query 1 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "in", target: "out")) == false, "parity: config: connectionRules gate a connection by the source and target node types — query 2 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "proc", target: "out")) == true, "parity: config: connectionRules gate a connection by the source and target node types — query 3 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "out", target: "in")) == true, "parity: config: connectionRules gate a connection by the source and target node types — query 4 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "plain", target: "out")) == true, "parity: config: connectionRules gate a connection by the source and target node types — query 5 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "in", target: "plain")) == false, "parity: config: connectionRules gate a connection by the source and target node types — query 6 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "in", target: "missing")) == false, "parity: config: connectionRules gate a connection by the source and target node types — query 7 isValidConnection")
        }
        do { // config: defaultEdgeType types an untyped edge on every add path
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [PyreonFlowEdge(id: "e0", source: "1", target: "2")], searchText: { $0.label })
            f.defaultEdgeType = "step"
            f.addEdge(PyreonFlowEdge(id: "e1", source: "2", target: "3"))
            f.addEdges([PyreonFlowEdge(id: "e2", source: "1", target: "3")])
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: config: defaultEdgeType types an untyped edge on every add path — nodes")
            check(parityEdges(f, [("e0", "1", "2"), ("e1", "2", "3"), ("e2", "1", "3")]), "parity: config: defaultEdgeType types an untyped edge on every add path — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: defaultEdgeType types an untyped edge on every add path — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: defaultEdgeType types an untyped edge on every add path — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: config: defaultEdgeType types an untyped edge on every add path — viewport")
            check((f.getEdge("e1")?.type ?? "") == "step", "parity: config: defaultEdgeType types an untyped edge on every add path — query 1 edgeType")
            check((f.getEdge("e2")?.type ?? "") == "step", "parity: config: defaultEdgeType types an untyped edge on every add path — query 2 edgeType")
        }
        do { // config: a nodeExtent from config clamps a move like setNodeExtent does
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2"))], edges: [], searchText: { $0.label })
            f.nodeExtent = PyreonFlowNodeExtent(minX: 0.0, minY: 0.0, maxX: 500.0, maxY: 500.0)
            f.updateNodePosition("1", PyreonXYPosition(x: -50.0, y: 900.0))
            check(parityNodes(f, [("1", 0.0, 460.0), ("2", 200.0, 120.0)]), "parity: config: a nodeExtent from config clamps a move like setNodeExtent does — nodes")
            check(parityEdges(f, []), "parity: config: a nodeExtent from config clamps a move like setNodeExtent does — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: a nodeExtent from config clamps a move like setNodeExtent does — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: a nodeExtent from config clamps a move like setNodeExtent does — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: config: a nodeExtent from config clamps a move like setNodeExtent does — viewport")
            check(parityNear(f.clampToExtent(PyreonXYPosition(x: -10.0, y: 10.0)), 0.0, 10.0), "parity: config: a nodeExtent from config clamps a move like setNodeExtent does — query 1 clampToExtent")
            check(parityPoints(f.getNode("1").map { [$0.position] } ?? [], [(0.0, 460.0)]), "parity: config: a nodeExtent from config clamps a move like setNodeExtent does — query 2 nodePosition")
        }
        do { // config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [], searchText: { $0.label })
            f.defaultEdgeType = "step"
            f.defaultEdgeOptions = PyreonFlowDefaultEdgeOptions(type: "smoothstep", label: "flows")
            f.addEdge(PyreonFlowEdge(id: "e1", source: "1", target: "2"))
            f.addEdges([PyreonFlowEdge(id: "e2", source: "2", target: "3")])
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — nodes")
            check(parityEdges(f, [("e1", "1", "2"), ("e2", "2", "3")]), "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — viewport")
            check((f.getEdge("e1")?.type ?? "") == "smoothstep", "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — query 1 edgeType")
            check((f.getEdge("e1")?.label ?? "") == "flows", "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — query 2 edgeLabel")
            check((f.getEdge("e2")?.type ?? "") == "smoothstep", "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — query 3 edgeType")
            check((f.getEdge("e2")?.label ?? "") == "flows", "parity: config: defaultEdgeOptions fill an added edge, and its own type still wins over the default type — query 4 edgeLabel")
        }
        do { // config: fitViewPadding is the padding a bare fitView uses
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3")), PyreonFlowNode(id: "4", position: PyreonXYPosition(x: 600.0, y: 120.0), data: NodeData(label: "4"))], edges: [], searchText: { $0.label })
            f.fitViewPadding = 0.3
            f.replaceContainerSize(PyreonFlowContainerSize(width: 800.0, height: 600.0))
            f.fitView(nil)
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0), ("4", 600.0, 120.0)]), "parity: config: fitViewPadding is the padding a bare fitView uses — nodes")
            check(parityEdges(f, []), "parity: config: fitViewPadding is the padding a bare fitView uses — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: fitViewPadding is the padding a bare fitView uses — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: fitViewPadding is the padding a bare fitView uses — selected edges")
            check(abs(f.viewport.x - 150.0) < 1e-6 && abs(f.viewport.y - 246.666666667) < 1e-6 && abs(f.viewport.zoom - 0.666666667) < 1e-6, "parity: config: fitViewPadding is the padding a bare fitView uses — viewport")
        }
        do { // config: a user connection validator runs after the built-in checks
            let f = PyreonFlowState<NodeData>(nodes: [PyreonFlowNode(id: "1", position: PyreonXYPosition(x: 0.0, y: 0.0), data: NodeData(label: "1")), PyreonFlowNode(id: "2", position: PyreonXYPosition(x: 200.0, y: 120.0), data: NodeData(label: "2")), PyreonFlowNode(id: "3", position: PyreonXYPosition(x: 400.0, y: 0.0), data: NodeData(label: "3"))], edges: [], searchText: { $0.label })
            f.connectionValidator = { $0.target != "3" }
            check(parityNodes(f, [("1", 0.0, 0.0), ("2", 200.0, 120.0), ("3", 400.0, 0.0)]), "parity: config: a user connection validator runs after the built-in checks — nodes")
            check(parityEdges(f, []), "parity: config: a user connection validator runs after the built-in checks — edges")
            check(f.selectedNodes().sorted() == [], "parity: config: a user connection validator runs after the built-in checks — selected nodes")
            check(f.selectedEdges().sorted() == [], "parity: config: a user connection validator runs after the built-in checks — selected edges")
            check(abs(f.viewport.x - 0.0) < 1e-6 && abs(f.viewport.y - 0.0) < 1e-6 && abs(f.viewport.zoom - 1.0) < 1e-6, "parity: config: a user connection validator runs after the built-in checks — viewport")
            check(f.isValidConnection(PyreonFlowConnection(source: "1", target: "2")) == true, "parity: config: a user connection validator runs after the built-in checks — query 1 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "1", target: "3")) == false, "parity: config: a user connection validator runs after the built-in checks — query 2 isValidConnection")
            check(f.isValidConnection(PyreonFlowConnection(source: "1", target: "1")) == true, "parity: config: a user connection validator runs after the built-in checks — query 3 isValidConnection")
        }
    }
    // <flow-parity:end>

    /// The keys XCUITest cannot deliver to a simulator app (Return, Escape,
    /// Delete, Backspace), driven through the same function the view's
    /// `onKeyPress` calls, so the only unproven link left on iOS is the OS
    /// delivering the key.
    static func runKeyRoutingChecks() {
        check(pyreonFlowKeyName(.return) == "Enter" && pyreonFlowKeyName(.escape) == "Escape", "Return and Escape map to the web key names")
        check(pyreonFlowKeyName(.delete) == "Backspace" && pyreonFlowKeyName(.deleteForward) == "Delete", "both delete keys map to the web key names")
        check(pyreonFlowKeyName(KeyEquivalent("q")) == nil && !pyreonFlowHandleKey(seedFlow(), key: KeyEquivalent("q"), nodeId: "1"), "an unmapped key is ignored")

        let f = seedFlow()
        check(pyreonFlowHandleKey(f, key: .return, nodeId: "2") && f.selectedNodes() == ["2"], "Return selects the focused node")
        check(pyreonFlowHandleKey(f, key: .escape) && f.selectedNodes().isEmpty, "Escape clears the selection")
        check(pyreonFlowHandleKey(f, key: .return, edgeId: "e1") && f.selectedEdges() == ["e1"], "Return selects the focused edge")
        check(pyreonFlowHandleKey(f, key: .space, nodeId: "3") && f.selectedNodes() == ["3"], "Space selects the focused node")
        check(pyreonFlowHandleKey(f, key: .deleteForward) && f.getNode("3") == nil, "Delete removes the selected node")
        check(pyreonFlowHandleKey(f, key: KeyEquivalent("z"), modifiers: .command) && f.getNode("3") != nil, "Cmd+Z restores the node Delete removed")
        check(pyreonFlowHandleKey(f, key: .return, nodeId: "1") && pyreonFlowHandleKey(f, key: .delete) && f.getNode("1") == nil, "Backspace removes the selected node")
        check(pyreonFlowHandleKey(f, key: KeyEquivalent("z"), modifiers: .control) && f.getNode("1") != nil, "Ctrl+Z undoes too")
        check(pyreonFlowHandleKey(f, key: KeyEquivalent("a"), modifiers: .command) && f.selectedNodes().sorted() == ["1", "2", "3"], "Cmd+A selects every node")
        let before = f.getNode("2")!.position
        check(pyreonFlowHandleKey(f, key: .rightArrow, modifiers: .shift, nodeId: "2") && f.getNode("2")!.position.x == before.x + 100, "Shift+Arrow moves the focused node a large step")
    }

    /// Pixels within 6 of `rgb` in `view`, rendered offscreen by SwiftUI.
    @MainActor
    static func renderedPixels<V: View>(_ view: V, _ r: Int, _ g: Int, _ b: Int) -> Int {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        guard let image = renderer.cgImage else { return -1 }
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let space = CGColorSpace(name: CGColorSpace.sRGB)!
        guard let ctx = CGContext(data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return -1 }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        var count = 0
        for i in stride(from: 0, to: pixels.count, by: 4) where abs(Int(pixels[i]) - r) <= 6 && abs(Int(pixels[i + 1]) - g) <= 6 && abs(Int(pixels[i + 2]) - b) <= 6 {
            count += 1
        }
        return count
    }

    /// Pixels of the web's dark canvas colour (#0b1220) in the REAL view,
    /// rendered offscreen under the given environment colour scheme. This is
    /// the SwiftUI half of `colorMode="system"`: the view must follow the
    /// environment's scheme. The device suites prove the OS half where the
    /// simulator propagates an appearance change.
    @MainActor
    static func darkCanvasPixels(colorMode: String, scheme: ColorScheme) -> Int {
        let view = PyreonFlowView(state: seedFlow(), colorMode: colorMode) { node in Text(node.data.label) }
            .frame(width: 320, height: 200)
            .environment(\.colorScheme, scheme)
        return renderedPixels(view, 11, 18, 32)
    }

    /// The default node paints the web's DefaultNode box from the palette.
    @MainActor
    static func runDefaultNodeRenderChecks() {
        func node(_ mode: String, selected: Bool = false) -> some View {
            PyreonFlowDefaultNode(label: "Node", selected: selected).padding(4).pyreonFlowColorMode(mode)
        }
        check(renderedPixels(node("dark"), 0x1f, 0x29, 0x37) > 1000, "the dark default node did not paint --pyreon-flow-node-bg (#1f2937)")
        check(renderedPixels(node("dark"), 0x37, 0x41, 0x51) > 100, "the dark default node did not paint --pyreon-flow-node-border (#374151)")
        check(renderedPixels(node("light"), 0xdd, 0xdd, 0xdd) > 100, "the light default node did not paint --pyreon-flow-node-border (#dddddd)")
        check(renderedPixels(node("light", selected: true), 0x3b, 0x82, 0xf6) > 100, "a selected default node did not paint --pyreon-flow-node-selected (#3b82f6)")
        check(renderedPixels(node("light"), 0x3b, 0x82, 0xf6) == 0, "an unselected default node painted the selected border")
    }

    @MainActor
    static func runSystemColorModeRenderChecks() {
        let lightSystem = darkCanvasPixels(colorMode: "system", scheme: .light)
        let darkSystem = darkCanvasPixels(colorMode: "system", scheme: .dark)
        check(lightSystem == 0, "colorMode=\"system\" painted the dark canvas under a light scheme (\(lightSystem) px)")
        check(darkSystem > 1000, "colorMode=\"system\" did not follow a dark scheme (\(darkSystem) px)")
        // Forced modes ignore the environment in both directions.
        check(darkCanvasPixels(colorMode: "light", scheme: .dark) == 0, "colorMode=\"light\" followed a dark scheme")
        check(darkCanvasPixels(colorMode: "dark", scheme: .light) > 1000, "colorMode=\"dark\" did not paint dark under a light scheme")
    }

    static func runSvgPathChecks() {
        func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 1e-9 }
        func same(_ got: [PyreonFlowEdgeSegment], _ want: [(String, [Double])]) -> Bool {
            guard got.count == want.count else { return false }
            for (g, w) in zip(got, want) {
                guard g.kind == w.0 else { return false }
                let v: [Double?] = g.kind == "cubic" ? [g.x, g.y, g.c1x, g.c1y, g.c2x, g.c2y] : g.kind == "quad" ? [g.x, g.y, g.cx, g.cy] : [g.x, g.y]
                guard v.count == w.1.count, zip(v, w.1).allSatisfy({ near($0 ?? .nan, $1) }) else { return false }
            }
            return true
        }
        check(same(pyreonFlowParseSvgPath("M10 20 L30 40"), [("move", [10.0, 20.0]), ("line", [30.0, 40.0])]), "svg path parses 'M10 20 L30 40'")
        check(same(pyreonFlowParseSvgPath("m10 20 l5 5 h10 v-5"), [("move", [10.0, 20.0]), ("line", [15.0, 25.0]), ("line", [25.0, 25.0]), ("line", [25.0, 20.0])]), "svg path parses 'm10 20 l5 5 h10 v-5'")
        check(same(pyreonFlowParseSvgPath("M0,0 C10,0 20,10 30,10 S50,20 60,20"), [("move", [0.0, 0.0]), ("cubic", [30.0, 10.0, 10.0, 0.0, 20.0, 10.0]), ("cubic", [60.0, 20.0, 40.0, 10.0, 50.0, 20.0])]), "svg path parses 'M0,0 C10,0 20,10 30,10 S50,20 60,20'")
        check(same(pyreonFlowParseSvgPath("M0 0 Q10 10 20 0 T40 0"), [("move", [0.0, 0.0]), ("quad", [20.0, 0.0, 10.0, 10.0]), ("quad", [40.0, 0.0, 30.0, -10.0])]), "svg path parses 'M0 0 Q10 10 20 0 T40 0'")
        check(same(pyreonFlowParseSvgPath("M0 0 L10 0 L10 10 Z"), [("move", [0.0, 0.0]), ("line", [10.0, 0.0]), ("line", [10.0, 10.0]), ("line", [0.0, 0.0])]), "svg path parses 'M0 0 L10 0 L10 10 Z'")
        check(same(pyreonFlowParseSvgPath("M0 0 10 10 20 0"), [("move", [0.0, 0.0]), ("line", [10.0, 10.0]), ("line", [20.0, 0.0])]), "svg path parses 'M0 0 10 10 20 0'")
        check(same(pyreonFlowParseSvgPath("m1 1 2 2"), [("move", [1.0, 1.0]), ("line", [3.0, 3.0])]), "svg path parses 'm1 1 2 2'")
        check(same(pyreonFlowParseSvgPath("M-1.5.5e1-2"), [("move", [-1.5, 5.0])]), "svg path parses 'M-1.5.5e1-2'")
        check(same(pyreonFlowParseSvgPath("M0 0 X10 10"), [("move", [0.0, 0.0])]), "svg path parses 'M0 0 X10 10'")
        check(same(pyreonFlowParseSvgPath(""), []), "svg path parses ''")
        check(same(pyreonFlowParseSvgPath("M0 0 H10 V10 H0 z m5 5 l1 0"), [("move", [0.0, 0.0]), ("line", [10.0, 0.0]), ("line", [10.0, 10.0]), ("line", [0.0, 10.0]), ("line", [0.0, 0.0]), ("move", [5.0, 5.0]), ("line", [6.0, 5.0])]), "svg path parses 'M0 0 H10 V10 H0 z m5 5 l1 0'")
        check(same(pyreonFlowParseSvgPath("M0 0 c1 2 3 4 5 6 s1 1 2 2"), [("move", [0.0, 0.0]), ("cubic", [5.0, 6.0, 1.0, 2.0, 3.0, 4.0]), ("cubic", [7.0, 8.0, 7.0, 8.0, 6.0, 7.0])]), "svg path parses 'M0 0 c1 2 3 4 5 6 s1 1 2 2'")
        // A half circle from (0,0) to (20,0), centre (10,0), sweep on: two quarter-turn cubics through (10,-10).
        let arc = pyreonFlowParseSvgPath("M0 0 A10 10 0 0 1 20 0")
        check(arc.count == 3 && arc[1].kind == "cubic" && near(arc[1].x, 10) && near(arc[1].y, -10) && near(arc[2].x, 20) && near(arc[2].y, 0), "a half-circle arc ends each quarter on the circle")
        // Compact flags: "0110 10" is large=0, sweep=1, then x=10 y=10 (relative).
        let quarter = pyreonFlowParseSvgPath("M0 0a10 10 0 0110 10")
        check(quarter.count == 2 && near(quarter[1].x, 10) && near(quarter[1].y, 10), "compact arc flags parse and the arc ends at the relative endpoint")
        let result = PyreonFlowPathResult(svgPath: "M0 0 L20 10")
        check(near(result.labelX, 10) && near(result.labelY, 5) && result.path == "M0,0 L20,10", "a parsed path result centres its label and round-trips to path data")
    }
    static func main() {
        runParityChecks()
        runSvgPathChecks()
        MainActor.assumeIsolated { runSystemColorModeRenderChecks(); runDefaultNodeRenderChecks() }
        runKeyRoutingChecks()
        runStateChecks()
        runEdgeCanvasChecks()
        runWebViewChecks()
        runModelFieldChecks()
        print("PyreonFlowStateTests: all checks passed")
    }
}
