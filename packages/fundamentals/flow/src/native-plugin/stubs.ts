/**
 * The compile-gate stubs the flow lowering's emit needs beyond the SwiftUI /
 * Compose stub bundle: the `PyreonFlowState` engine surface, the flow views and
 * the `<FlowWebView>` host types. They mirror the REAL runtime
 * (`@pyreon/flow/native/{swift,kotlin}`) exactly — a superset stub masks real
 * breakage, a narrower one manufactures it.
 *
 * They are appended to the bundle only for an emit that names a flow runtime
 * type (see {@link flowStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

/** Swift stubs: the engine (`PyreonFlowState`, geometry, views) and the web-view host types. */
export const FLOW_SWIFT_STUBS = `// @pyreon/flow — the PyreonFlowState engine. Mirrors PyreonFlowState.swift
// (minus @Observable/@available, the same omission PyreonTableState documents).
public struct PyreonXYPosition: Equatable {
  public var x: Double = 0
  public var y: Double = 0
  public init(x: Double, y: Double) {}
}
public struct PyreonFlowDimensions { public var width: Double; public var height: Double }
public struct PyreonFlowMeasuredHandle { public var id: String; public var type: String; public var position: PyreonFlowPosition; public var x: Double; public var y: Double; public init(id: String, type: String, position: PyreonFlowPosition, x: Double, y: Double) { self.id = id; self.type = type; self.position = position; self.x = x; self.y = y } }
public struct PyreonFlowNodeMeasurement { public var width: Double; public var height: Double; public var handles: [PyreonFlowMeasuredHandle]; public init(width: Double, height: Double, handles: [PyreonFlowMeasuredHandle] = []) { self.width = width; self.height = height; self.handles = handles } }
public struct PyreonFlowContainerSize: Equatable {
  public var width: Double = 0
  public var height: Double = 0
  public init(width: Double = 0, height: Double = 0) {}
}
public struct PyreonFlowViewport: Equatable {
  public var x: Double = 0
  public var y: Double = 0
  public var zoom: Double = 1
  public init(x: Double = 0, y: Double = 0, zoom: Double = 1) {}
}
public struct PyreonFlowNodeExtent: Equatable {
  public init(minX: Double, minY: Double, maxX: Double, maxY: Double) {}
}
public enum PyreonFlowPosition { case top, right, bottom, left }
public struct PyreonFlowPathResult {
  public var path: String = ""
  public var labelX: Double = 0
  public var labelY: Double = 0
}
extension PyreonFlowPathResult {
  public init(svgPath: String) { self.init() }
}
public func pyreonStraightPath(sourceX: Double, sourceY: Double, targetX: Double, targetY: Double) -> PyreonFlowPathResult { PyreonFlowPathResult() }
public func pyreonBezierPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = .bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = .top, curvature: Double = 0.25) -> PyreonFlowPathResult { PyreonFlowPathResult() }
public func pyreonWaypointPath(sourceX: Double, sourceY: Double, targetX: Double, targetY: Double, waypoints: [PyreonXYPosition]) -> PyreonFlowPathResult { PyreonFlowPathResult() }
public func pyreonSmoothStepPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = .bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = .top, borderRadius: Double = 5, offset: Double = 20) -> PyreonFlowPathResult { PyreonFlowPathResult() }
public func pyreonStepPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = .bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = .top, offset: Double = 20) -> PyreonFlowPathResult { PyreonFlowPathResult() }
public func pyreonEdgePath(type: String, sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition, borderRadius: Double = 5, offset: Double = 20, curvature: Double = 0.25) -> PyreonFlowPathResult { PyreonFlowPathResult() }
public func pyreonHandlePosition(_ position: PyreonFlowPosition, nodeX: Double, nodeY: Double, nodeWidth: Double, nodeHeight: Double, offset: Double = 50) -> PyreonXYPosition { PyreonXYPosition(x: nodeX, y: nodeY) }
public struct PyreonFlowRect { public var x: Double; public var y: Double; public var width: Double; public var height: Double; public init(x: Double, y: Double, width: Double, height: Double) { self.x = x; self.y = y; self.width = width; self.height = height } }
public func pyreonNodeIntersection(_ box: PyreonFlowRect, toward: PyreonXYPosition) -> PyreonXYPosition { toward }
public struct PyreonFlowNodeBoxDimensions { public init(sourceW: Double, sourceH: Double, targetW: Double, targetH: Double) {} }
public struct PyreonFlowHandleAnchor { public var x: Double = 0; public var y: Double = 0; public var position: PyreonFlowPosition = .bottom }
public struct PyreonFlowFloatingEndpoints { public var source: PyreonFlowHandleAnchor = PyreonFlowHandleAnchor(); public var target: PyreonFlowHandleAnchor = PyreonFlowHandleAnchor() }
public struct PyreonFlowSmartPositions { public var sourcePosition: PyreonFlowPosition = .bottom; public var targetPosition: PyreonFlowPosition = .top }
public struct PyreonFlowHandleConfig: Equatable {
  public init(id: String? = nil, type: String, position: PyreonFlowPosition, offset: Double = 50) {}
}
public struct PyreonFlowMarker: Equatable {
  public init(type: String, color: String? = nil, width: Double = 10, height: Double = 7, strokeWidth: Double = 1) {}
}
public struct PyreonFlowResolvedMarkers { public let start: PyreonFlowMarker?; public let end: PyreonFlowMarker? }
public let pyreonFlowDefaultMarkerEnd = PyreonFlowMarker(type: "arrowclosed")
public func pyreonResolveFlowMarker(_ marker: PyreonFlowMarker?) -> PyreonFlowMarker? { marker }
public func pyreonFlowMarkerId(_ marker: PyreonFlowMarker) -> String { "" }
public func pyreonResolveFlowEdgeMarkers(_ edge: PyreonFlowEdge, defaultMarkerEnd: PyreonFlowMarker?) -> PyreonFlowResolvedMarkers { PyreonFlowResolvedMarkers(start: nil, end: nil) }
public func pyreonCollectFlowEdgeMarkers(_ edges: [PyreonFlowEdge], defaultMarkerEnd: PyreonFlowMarker?) -> [String: PyreonFlowMarker] { [:] }
public struct PyreonFlowNode<T> {
  public var id: String
  public var type: String? = nil
  public var position: PyreonXYPosition
  public var data: T
  public var width: Double? = nil
  public var height: Double? = nil
  public var draggable: Bool? = nil
  public var selectable: Bool? = nil
  public var connectable: Bool? = nil
  public var focusable: Bool? = nil
  public var ariaLabel: String? = nil
  public var hidden: Bool? = nil
  public var deletable: Bool? = nil
  public var className: String? = nil
  public var style: String? = nil
  public var parentId: String? = nil
  public var extent: PyreonFlowNodeExtent? = nil
  public var extentParent: Bool = false
  public var expandParent: Bool? = nil
  public var group: Bool? = nil
  public var sourceHandles: [PyreonFlowHandleConfig] = []
  public var targetHandles: [PyreonFlowHandleConfig] = []
  public var zIndex: Double? = nil
  public init(
    id: String,
    type: String? = nil,
    position: PyreonXYPosition,
    data: T,
    width: Double? = nil,
    height: Double? = nil,
    draggable: Bool? = nil,
    selectable: Bool? = nil,
    connectable: Bool? = nil,
    focusable: Bool? = nil,
    ariaLabel: String? = nil,
    hidden: Bool? = nil,
    deletable: Bool? = nil,
    className: String? = nil,
    style: String? = nil,
    parentId: String? = nil,
    extent: PyreonFlowNodeExtent? = nil,
    extentParent: Bool = false,
    expandParent: Bool? = nil,
    group: Bool? = nil,
    sourceHandles: [PyreonFlowHandleConfig] = [],
    targetHandles: [PyreonFlowHandleConfig] = [],
    zIndex: Double? = nil
  ) {
    self.zIndex = zIndex
    self.id = id
    self.type = type
    self.position = position
    self.data = data
    self.width = width
    self.height = height
  }
}
public func pyreonEffectiveDimensions<T>(_ node: PyreonFlowNode<T>, measurement: PyreonFlowNodeMeasurement? = nil) -> PyreonFlowDimensions { PyreonFlowDimensions(width: node.width ?? measurement?.width ?? 150, height: node.height ?? measurement?.height ?? 40) }
public func pyreonGetFloatingEndpoints<S, T>(_ sourceNode: PyreonFlowNode<S>, targetNode: PyreonFlowNode<T>, dimensions: PyreonFlowNodeBoxDimensions) -> PyreonFlowFloatingEndpoints { PyreonFlowFloatingEndpoints() }
public func pyreonGetSmartHandlePositions<S, T>(_ sourceNode: PyreonFlowNode<S>, targetNode: PyreonFlowNode<T>, dimensions: PyreonFlowNodeBoxDimensions? = nil) -> PyreonFlowSmartPositions { PyreonFlowSmartPositions() }
public func pyreonResolveHandleAnchor<T>(_ node: PyreonFlowNode<T>, handleId: String?, type: String, dimensions: PyreonFlowDimensions, measurement: PyreonFlowNodeMeasurement? = nil) -> PyreonFlowHandleAnchor? { nil }
public indirect enum PyreonFlowDataValue: Equatable { case string(String), number(Double), bool(Bool), object(PyreonFlowData), array([PyreonFlowDataValue]), null }
@dynamicMemberLookup public struct PyreonFlowData: Equatable {
  public var values: [String: PyreonFlowDataValue]
  public init(_ values: [String: PyreonFlowDataValue] = [:]) { self.values = values }
  public subscript(dynamicMember key: String) -> PyreonFlowDataValue? { values[key] }
  public subscript(_ key: String) -> PyreonFlowDataValue? { values[key] }
}
public func pyreonFlowEdgeId(source: String, target: String, sourceHandle: String? = nil, targetHandle: String? = nil) -> String { "" }
public struct PyreonFlowEdge: Equatable {
  public var id: String
  public var source: String
  public var target: String
  public var sourceHandle: String? = nil
  public var targetHandle: String? = nil
  public var type: String? = nil
  public var label: String? = nil
  public var animated: Bool = false
  public var animatedSpecified: Bool = false
  public var focusable: Bool? = nil
  public var ariaLabel: String? = nil
  public var hidden: Bool? = nil
  public var deletable: Bool? = nil
  public var reconnectable: Bool? = nil
  public var interactionWidth: Double? = nil
  public var className: String? = nil
  public var style: String? = nil
  public var data: PyreonFlowData? = nil
  public var curvature: Double? = nil
  public var borderRadius: Double? = nil
  public var pathOffset: Double? = nil
  public var markerStart: PyreonFlowMarker? = nil
  public var markerEnd: PyreonFlowMarker? = nil
  public var markerEndSpecified: Bool = false
  public var waypoints: [PyreonXYPosition] = []
  public var zIndex: Double? = nil
  public init(
    id: String,
    source: String,
    target: String,
    sourceHandle: String? = nil,
    targetHandle: String? = nil,
    type: String? = nil,
    label: String? = nil,
    animated: Bool = false,
    animatedSpecified: Bool = false,
    focusable: Bool? = nil,
    ariaLabel: String? = nil,
    hidden: Bool? = nil,
    deletable: Bool? = nil,
    reconnectable: Bool? = nil,
    interactionWidth: Double? = nil,
    className: String? = nil,
    style: String? = nil,
    data: PyreonFlowData? = nil,
    curvature: Double? = nil,
    borderRadius: Double? = nil,
    pathOffset: Double? = nil,
    markerStart: PyreonFlowMarker? = nil,
    markerEnd: PyreonFlowMarker? = nil,
    markerEndSpecified: Bool = false,
    waypoints: [PyreonXYPosition] = [],
    zIndex: Double? = nil
  ) {
    self.zIndex = zIndex
    self.id = id
    self.source = source
    self.target = target
    self.type = type
    self.label = label
    self.animated = animated
  }
}
public struct PyreonFlowDefaultEdgeOptions: Equatable {
  public init(type: String? = nil, label: String? = nil, animated: Bool? = nil, focusable: Bool? = nil, ariaLabel: String? = nil, hidden: Bool? = nil, deletable: Bool? = nil, reconnectable: Bool? = nil, interactionWidth: Double? = nil, curvature: Double? = nil, borderRadius: Double? = nil, pathOffset: Double? = nil, markerStart: PyreonFlowMarker? = nil, markerEnd: PyreonFlowMarker? = nil, markerEndSpecified: Bool = false) {}
}
public struct PyreonFlowConnection: Equatable {
  public var source: String = ""
  public var target: String = ""
  public var sourceHandle: String? = nil
  public var targetHandle: String? = nil
  public init(source: String, target: String, sourceHandle: String? = nil, targetHandle: String? = nil) {}
}
public struct PyreonFlowSelection<T> { public let nodes: [PyreonFlowNode<T>]; public let edges: [PyreonFlowEdge] }
public struct PyreonFlowNodeChange { public let type: String; public let id: String; public let position: PyreonXYPosition? }
public struct PyreonFlowEdgeChange { public let type: String; public let id: String?; public let edge: PyreonFlowEdge? }
public struct PyreonFlowConnectStart { public let nodeId: String; public let handleId: String }
public struct PyreonFlowPaneEvent { public let position: PyreonXYPosition }
public struct PyreonFlowSnapshot<T> { public let nodes: [PyreonFlowNode<T>]; public let edges: [PyreonFlowEdge]; public let viewport: PyreonFlowViewport? }
public struct PyreonFlowSnapLines { public let x: Double?; public let y: Double?; public let snappedPosition: PyreonXYPosition }
public struct PyreonFlowLayoutOptions { public init(direction: String = "DOWN", nodeSpacing: Double = 20, layerSpacing: Double = 40, animate: Bool = true, animationDuration: Double = 300) {} }
public struct PyreonFlowLayoutPosition { public let id: String; public let position: PyreonXYPosition }
public func pyreonComputeFlowLayout<T>(_ nodes: [PyreonFlowNode<T>], edges: [PyreonFlowEdge], algorithm: String = "layered", options: PyreonFlowLayoutOptions = PyreonFlowLayoutOptions()) async -> [PyreonFlowLayoutPosition] { [] }
public final class PyreonFlowState<T> {
  public init(
    nodes: [PyreonFlowNode<T>] = [],
    edges: [PyreonFlowEdge] = [],
    viewport: PyreonFlowViewport = PyreonFlowViewport(),
    minZoom: Double = 0.1,
    maxZoom: Double = 4,
    snapToGrid: Bool = false,
    snapGrid: Double = 15,
    nodeExtent: PyreonFlowNodeExtent? = nil,
    connectionRules: [String: [String]]? = nil,
    defaultMarkerEnd: PyreonFlowMarker? = PyreonFlowMarker(type: "arrowclosed"),
    nodesDraggable: Bool = true, nodesConnectable: Bool = true, nodesSelectable: Bool = true, nodesFocusable: Bool = true,
    edgesFocusable: Bool = true, disableKeyboardA11y: Bool = false, nodesDeletable: Bool = true, edgesDeletable: Bool = true, edgesReconnectable: Bool = true,
    edgeInteractionWidth: Double = 20, connectionRadius: Double = 0, pannable: Bool = true, panOnDrag: Bool = true, panOnScroll: Bool = false, panOnScrollSpeed: Double = 0.5, zoomable: Bool = true, zoomOnScroll: Bool = true, zoomOnPinch: Bool = true, zoomOnDoubleClick: Bool = false, selectionOnDrag: Bool = false, selectionMode: String = "partial", connectionMode: String = "strict", elevateNodesOnSelect: Bool = true, elevateEdgesOnSelect: Bool = false, autoPanOnNodeDrag: Bool = true, autoPanOnConnect: Bool = true, autoPanSpeed: Double = 15, multiSelect: Bool = true, onlyRenderVisibleElements: Bool = false, snapToObjects: Bool = true,
    defaultEdgeType: String = "bezier", connectionLineType: String = "bezier", defaultEdgeOptions: PyreonFlowDefaultEdgeOptions = PyreonFlowDefaultEdgeOptions(), fitView: Bool = false, fitViewPadding: Double = 0.1, autoHistory: Bool = true, historyLimit: Double = 50,
    isValidConnection: ((PyreonFlowConnection) -> Bool)? = nil,
    searchText: ((T) -> String?)? = nil,
    reducedMotion: Bool? = nil,
    deleteKeys: [String]? = ["Delete", "Backspace"], multiSelectionKey: String? = "shift", selectionKey: String? = "shift", zoomActivationKey: String? = "ctrl", preventScrolling: Bool = true
  ) {}
  public var minZoom = 0.1; public var maxZoom = 4.0; public var snapToGrid = false; public var snapGrid = 15.0
  public var nodeExtent: PyreonFlowNodeExtent? = nil; public var connectionRules: [String: [String]]? = nil
  public var connectionValidator: ((PyreonFlowConnection) -> Bool)? = nil; public var reducedMotion: Bool? = nil
  public var defaultMarkerEnd: PyreonFlowMarker? = nil
  public var nodesDraggable = true; public var nodesConnectable = true; public var nodesSelectable = true; public var nodesFocusable = true
  public var edgesFocusable = true; public var disableKeyboardA11y = false; public var nodesDeletable = true; public var edgesDeletable = true; public var edgesReconnectable = true
  public var edgeInteractionWidth = 20.0; public var connectionRadius = 0.0; public var pannable = true; public var panOnDrag = true; public var panOnScroll = false; public var panOnScrollSpeed = 0.5
  public var zoomable = true; public var zoomOnScroll = true; public var zoomOnPinch = true; public var zoomOnDoubleClick = false
  public var selectionOnDrag = false; public var selectionMode = "partial"; public var connectionMode = "strict"; public var elevateNodesOnSelect = true; public var elevateEdgesOnSelect = false; public var autoPanOnNodeDrag = true; public var autoPanOnConnect = true; public var autoPanSpeed: Double = 15; public var multiSelect = true; public var onlyRenderVisibleElements = false; public var snapToObjects = true
  public var defaultEdgeType = "bezier"; public var connectionLineType = "bezier"; public var defaultEdgeOptions = PyreonFlowDefaultEdgeOptions(); public var fitViewOnLoad = false; public var fitViewPadding = 0.1
  public var autoHistory = true; public var historyLimit: Double = 50; public var deleteKeys: [String]? = ["Delete", "Backspace"]; public var multiSelectionKey: String? = "shift"; public var selectionKey: String? = "shift"; public var zoomActivationKey: String? = "ctrl"; public var preventScrolling = true
  public private(set) var nodes: [PyreonFlowNode<T>] = []
  public var nodeLookup: [String: PyreonFlowNode<T>] { [:] }
  public private(set) var edges: [PyreonFlowEdge] = []
  public var edgeLookup: [String: PyreonFlowEdge] { [:] }
  public private(set) var measurements: [String: PyreonFlowNodeMeasurement] = [:]
  public private(set) var viewport: PyreonFlowViewport = PyreonFlowViewport()
  public var containerSize = PyreonFlowContainerSize()
  public var zoom: Double { viewport.zoom }
  public func getNode(_ id: String) -> PyreonFlowNode<T>? { nil }
  public func getNodeDimensions(_ id: String) -> PyreonFlowDimensions { PyreonFlowDimensions(width: 150, height: 40) }
  public func updateNodeMeasurement(_ id: String, width: Double, height: Double, handles: [PyreonFlowMeasuredHandle] = []) {}
  public func replaceMeasurements(_ next: [String: PyreonFlowNodeMeasurement]) {}
  public func updateMeasurements(_ update: ([String: PyreonFlowNodeMeasurement]) -> [String: PyreonFlowNodeMeasurement]) {}
  public func clearNodeMeasurement(_ id: String) {}
  public func batch(_ operation: () -> Void) { operation() }
  public func dispose() {}
  public func layout(_ algorithm: String = "layered", options: PyreonFlowLayoutOptions = PyreonFlowLayoutOptions()) {}
  public func isValidConnection(_ connection: PyreonFlowConnection) -> Bool { true }
  public func connect(_ connection: PyreonFlowConnection, id: String? = nil) -> PyreonFlowEdge? { nil }
  public func resolvedMarkers(_ edge: PyreonFlowEdge) -> (start: PyreonFlowMarker?, end: PyreonFlowMarker?) { (nil, nil) }
  public func snappedNodePosition(_ id: String, _ position: PyreonXYPosition, excluding: Set<String> = [], threshold: Double = 5) -> PyreonXYPosition { position }
  public func nodesInSelection(from start: PyreonXYPosition, to end: PyreonXYPosition) -> [String] { [] }
  @discardableResult public func emitNodeContextMenu(_ id: String) -> Bool { false }; @discardableResult public func emitEdgeContextMenu(_ id: String) -> Bool { false }; @discardableResult public func emitPaneContextMenu(_ position: PyreonXYPosition) -> Bool { false }
  public func emitNodeMouseEnter(_ id: String) {}; public func emitNodeMouseLeave(_ id: String) {}; public func emitEdgeMouseEnter(_ id: String) {}; public func emitEdgeMouseLeave(_ id: String) {}
  public func emitNodeClick(_ id: String) {}; public func emitNodeDoubleClick(_ id: String) {}; public func emitNodeDragStart(_ id: String) {}; public func emitNodeDrag(_ id: String) {}; public func emitNodeDragEnd(_ id: String) {}
  public func emitConnectStart(nodeId: String, handleId: String?) {}; public func emitConnectEnd(_ connection: PyreonFlowConnection?) {}; public func emitPaneClick(_ position: PyreonXYPosition) {}; public func emitEdgeClick(_ id: String) {}
  public func addNode(_ node: PyreonFlowNode<T>) {}
  public func addNodes(_ nodes: [PyreonFlowNode<T>]) {}
  public func setNodes(_ nodes: [PyreonFlowNode<T>]) {}
  public func setNodes(_ update: ([PyreonFlowNode<T>]) -> [PyreonFlowNode<T>]) {}
  public func removeNode(_ id: String) {}
  public func removeNodes(_ ids: [String]) {}
  public func updateNodePosition(_ id: String, _ position: PyreonXYPosition) {}
  public func updateNodeData(_ id: String, _ update: (inout T) -> Void) {}
  public func updateNodeDataFromNode(_ id: String, _ update: (PyreonFlowNode<T>) -> T) {}
  public func updateNode(_ id: String, _ update: (inout PyreonFlowNode<T>) -> Void) {}
  public func setNodeExtent(minX: Double, minY: Double, maxX: Double, maxY: Double) {}
  public func clearNodeExtent() {}
  public func clampToExtent(_ position: PyreonXYPosition, _ nodeWidth: Double = 150, _ nodeHeight: Double = 40) -> PyreonXYPosition { position }
  public func getEdge(_ id: String) -> PyreonFlowEdge? { nil }
  public func addEdge(_ edge: PyreonFlowEdge) {}
  public func addEdges(_ edges: [PyreonFlowEdge]) {}
  public func setEdges(_ edges: [PyreonFlowEdge]) {}
  public func setEdges(_ update: ([PyreonFlowEdge]) -> [PyreonFlowEdge]) {}
  public func removeEdge(_ id: String) {}
  public func updateEdge(_ id: String, _ update: (inout PyreonFlowEdge) -> Void) {}
  public func reconnectEdge(_ id: String, source: String? = nil, target: String? = nil, sourceHandle: String? = nil, targetHandle: String? = nil) {}
  public func addEdgeWaypoint(_ edgeId: String, _ point: PyreonXYPosition, _ index: Int? = nil) {}
  public func removeEdgeWaypoint(_ edgeId: String, _ index: Int) {}
  public func updateEdgeWaypoint(_ edgeId: String, _ index: Int, _ point: PyreonXYPosition) {}
  public func removeEdges(_ ids: [String]) {}
  public func isNodeSelected(_ id: String) -> Bool { false }
  public func isEdgeSelected(_ id: String) -> Bool { false }
  public func selectedNodes() -> [String] { [] }
  public func selectedEdges() -> [String] { [] }
  public func selectNode(_ id: String, additive: Bool = false) {}
  public func selectNodes(_ ids: [String], additive: Bool = false) {}
  public func deselectNode(_ id: String) {}
  public func selectEdge(_ id: String, additive: Bool = false) {}
  public func clearSelection() {}
  public func selectAll() {}
  public func deleteSelected() {}
  public func copySelected() {}
  public func paste(_ offset: PyreonXYPosition = PyreonXYPosition(x: 50, y: 50)) {}
  public func pushHistory() {}
  public func undo() {}
  public func redo() {}
  public func toJSON() -> PyreonFlowSnapshot<T> { PyreonFlowSnapshot(nodes: [], edges: [], viewport: nil) }
  public func fromJSON(_ snapshot: PyreonFlowSnapshot<T>) {}
  public func zoomTo(_ z: Double, duration: Double = 0) {}
  public func zoomIn(duration: Double = 0) {}
  public func zoomOut(duration: Double = 0) {}
  public func panTo(_ position: PyreonXYPosition) {}
  public func setViewport(x: Double? = nil, y: Double? = nil, zoom: Double? = nil, duration: Double = 0) {}
  public func setViewport(_ next: PyreonFlowViewport) {}
  public func setViewport(_ update: (PyreonFlowViewport) -> PyreonFlowViewport) {}
  public func replaceContainerSize(_ next: PyreonFlowContainerSize) {}
  public func updateContainerSize(_ update: (PyreonFlowContainerSize) -> PyreonFlowContainerSize) {}
  public func setCenter(_ x: Double, _ y: Double, zoom: Double? = nil, duration: Double = 0) {}
  public func animateViewport(x: Double? = nil, y: Double? = nil, zoom: Double? = nil, duration: Double = 300) {}
  public func screenToFlowPosition(_ position: PyreonXYPosition) -> PyreonXYPosition { position }
  public func flowToScreenPosition(_ position: PyreonXYPosition) -> PyreonXYPosition { position }
  public func isNodeVisible(_ id: String) -> Bool { false }
  public func fitView(_ nodeIds: [String]? = nil, padding: Double? = nil, duration: Double = 0) {}
  public func getConnectedEdges(_ nodeId: String) -> [PyreonFlowEdge] { [] }
  public func getIncomers(_ nodeId: String) -> [PyreonFlowNode<T>] { [] }
  public func getOutgoers(_ nodeId: String) -> [PyreonFlowNode<T>] { [] }
  public func findNodes(_ predicate: (PyreonFlowNode<T>) -> Bool) -> [PyreonFlowNode<T>] { [] }
  public func searchNodes(_ query: String) -> [PyreonFlowNode<T>] { [] }
  public func getChildNodes(_ parentId: String) -> [PyreonFlowNode<T>] { [] }
  public func getAbsolutePosition(_ nodeId: String) -> PyreonXYPosition { PyreonXYPosition(x: 0, y: 0) }
  public func getProximityConnection(_ nodeId: String, _ threshold: Double = 50) -> PyreonFlowConnection? { nil }
  public func getOverlappingNodes(_ nodeId: String) -> [PyreonFlowNode<T>] { [] }
  public func getIntersectingNodes(_ nodeId: String, partially: Bool = true) -> [PyreonFlowNode<T>] { [] }
  public func getIntersectingNodes(_ rect: PyreonFlowRect, partially: Bool = true) -> [PyreonFlowNode<T>] { [] }
  public func isNodeIntersecting(_ nodeId: String, _ area: PyreonFlowRect, partially: Bool = true) -> Bool { false }
  public func isNodeIntersecting(_ rect: PyreonFlowRect, _ area: PyreonFlowRect, partially: Bool = true) -> Bool { false }
  public func getNodesBounds(_ nodeIds: [String]? = nil) -> PyreonFlowRect { PyreonFlowRect(x: 0, y: 0, width: 0, height: 0) }
  public func resolveCollisions(_ nodeId: String, _ spacing: Double = 10) {}
  public func getSnapLines(_ nodeId: String, _ position: PyreonXYPosition, threshold: Double = 5, excluding: Set<String> = []) -> PyreonFlowSnapLines { PyreonFlowSnapLines(x: nil, y: nil, snappedPosition: position) }
  @discardableResult public func onConnect(_ callback: @escaping (PyreonFlowConnection) -> Void) -> () -> Void { {} }
  @discardableResult public func onViewportChange(_ callback: @escaping (PyreonFlowViewport) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodeClick(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodeDoubleClick(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodeContextMenu(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onEdgeContextMenu(_ callback: @escaping (PyreonFlowEdge) -> Void) -> () -> Void { {} }
  @discardableResult public func onPaneContextMenu(_ callback: @escaping (PyreonXYPosition) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodeMouseEnter(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodeMouseLeave(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onEdgeMouseEnter(_ callback: @escaping (PyreonFlowEdge) -> Void) -> () -> Void { {} }
  @discardableResult public func onEdgeMouseLeave(_ callback: @escaping (PyreonFlowEdge) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodeDragStart(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodeDrag(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodeDragEnd(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onEdgeClick(_ callback: @escaping (PyreonFlowEdge) -> Void) -> () -> Void { {} }
  @discardableResult public func onSelectionChange(_ callback: @escaping (PyreonFlowSelection<T>) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodesDelete(_ callback: @escaping ([PyreonFlowNode<T>]) -> Void) -> () -> Void { {} }
  @discardableResult public func onEdgesDelete(_ callback: @escaping ([PyreonFlowEdge]) -> Void) -> () -> Void { {} }
  @discardableResult public func onNodesChange(_ callback: @escaping ([PyreonFlowNodeChange]) -> Void) -> () -> Void { {} }
  @discardableResult public func onEdgesChange(_ callback: @escaping ([PyreonFlowEdgeChange]) -> Void) -> () -> Void { {} }
  @discardableResult public func onConnectStart(_ callback: @escaping (PyreonFlowConnectStart) -> Void) -> () -> Void { {} }
  @discardableResult public func onConnectEnd(_ callback: @escaping (PyreonFlowConnection?) -> Void) -> () -> Void { {} }
  @discardableResult public func onPaneClick(_ callback: @escaping (PyreonFlowPaneEvent) -> Void) -> () -> Void { {} }
  public func moveSelectedNodes(_ dx: Double, _ dy: Double) {}
  public func handleKeyboardCommand(_ key: String, nodeId: String? = nil, shift: Bool = false, command: Bool = false, repeatKey: Bool = false, edgeId: String? = nil) -> Bool { false }
  public func focusNode(_ nodeId: String, _ focusZoom: Double? = nil) {}
}
@available(iOS 17.0, macOS 14.0, *)
public enum PyreonFlowBackgroundVariant {
  case dots, lines, cross
  public static func from(_ value: String) -> Self { .dots }
}
public struct PyreonFlowBackgroundStyle {
  public init(variant: PyreonFlowBackgroundVariant = .dots, gap: Double = 20, size: Double = 1, color: String? = nil) {}
}
public enum PyreonFlowControlsPosition {
  case topLeft, topRight, bottomLeft, bottomRight
  public static func from(_ value: String) -> Self { .bottomLeft }
}
public struct PyreonFlowControlsStyle {
  public init(showZoomIn: Bool = true, showZoomOut: Bool = true, showFitView: Bool = true, showLock: Bool = false, position: PyreonFlowControlsPosition = .bottomLeft) {}
}
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonStandaloneFlowControls<T>: View {
  public init(state: PyreonFlowState<T>, style: PyreonFlowControlsStyle = .init(), extraContent: @escaping () -> AnyView? = { nil }) {}
  public var body: some View { EmptyView() }
}
public struct PyreonFlowMiniMapStyle {
  public init(nodeColor: String? = nil, maskColor: String = "#000000", width: Double = 200, height: Double = 150, pannable: Bool = true, zoomable: Bool = true) {}
}
extension View {
  public func pyreonFlowColorMode(_ colorMode: String) -> some View { self }
}
public struct PyreonFlowDefaultNode: View {
  public init(label: String, selected: Bool) {}
  public var body: some View { EmptyView() }
}
public struct PyreonFlowNodeResizerConfig {
  public init(minWidth: Double = 50, minHeight: Double = 30, handleSize: Double = 8, showEdgeHandles: Bool = false) {}
}
public struct PyreonFlowNodeToolbarConfig {
  public init(position: String = "top", align: String = "center", offset: Double = 8, showOnSelect: Bool = true, selectedOverride: Bool? = false, nodeIdOverride: String? = nil) {}
}
public struct PyreonFlowCustomEdgeContext {
  public let edge: PyreonFlowEdge
  public let sourceX: Double; public let sourceY: Double; public let targetX: Double; public let targetY: Double
  public let sourcePosition: PyreonFlowPosition; public let targetPosition: PyreonFlowPosition
  public let selected: Bool; public let labelX: Double; public let labelY: Double
}
public struct PyreonFlowConnectionLineContext {
  public let sourceX: Double; public let sourceY: Double; public let targetX: Double; public let targetY: Double
  public let sourcePosition: PyreonFlowPosition; public let path: PyreonFlowPathResult
}
public struct PyreonFlowCustomEdgePath: View {
  public init(result: PyreonFlowPathResult, color: String? = "#999999", width: Double = 1.5, dash: [Double]? = nil, fill: String? = nil) {}
  public var body: some View { EmptyView() }
}
public struct PyreonFlowSvgShape {
  public init(result: PyreonFlowPathResult, stroke: String? = nil, strokeWidth: Double = 1, fill: String? = "#000000") {}
}
public struct PyreonFlowSvg: View {
  public init(width: Double? = nil, height: Double? = nil, viewBox: [Double]? = nil, stretch: Bool = false, shapes: [PyreonFlowSvgShape]) {}
  public var body: some View { EmptyView() }
}
public struct PyreonFlowBaseEdgePath: View {
  public init(result: PyreonFlowPathResult, color: String? = nil, width: Double = 1.5) {}
  public var body: some View { EmptyView() }
}
public struct PyreonFlowEdgeText: View {
  public init(x: Double, y: Double, label: String) {}
  public var body: some View { EmptyView() }
}
public struct PyreonFlowEdgeLabelRenderer<Content: View>: View {
  public init(@ViewBuilder content: () -> Content) {}
  public var body: some View { EmptyView() }
}
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonFlowView<T, NodeContent: View>: View {
  public init(state: PyreonFlowState<T>, edgeColor: String = "#999999", edgeWidth: Double = 1.5, background: PyreonFlowBackgroundStyle? = nil, controls: PyreonFlowControlsStyle? = nil, controlsContent: @escaping () -> AnyView? = { nil }, miniMap: PyreonFlowMiniMapStyle? = nil, miniMapNodeColor: @escaping (PyreonFlowNode<T>) -> String = { _ in "" }, ariaLabel: String = "Flow diagram", colorMode: String = "light", nodeHandles: @escaping (PyreonFlowNode<T>) -> [PyreonFlowHandleConfig] = { _ in [] }, nodeResizer: @escaping (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig? = { _ in nil }, nodeToolbarConfigs: @escaping (PyreonFlowNode<T>) -> [PyreonFlowNodeToolbarConfig] = { _ in [] }, nodeToolbar: @escaping (PyreonFlowNode<T>, Int, Bool, Bool) -> AnyView? = { _, _, _, _ in nil }, customEdgeTypes: Set<String> = [], customEdge: @escaping (PyreonFlowCustomEdgeContext) -> AnyView? = { _ in nil }, customConnectionLineEnabled: Bool = false, customConnectionLine: @escaping (PyreonFlowConnectionLineContext) -> AnyView? = { _ in nil }, @ViewBuilder nodeContent: @escaping (PyreonFlowNode<T>) -> NodeContent) {}
  public init(state: PyreonFlowState<T>, edgeColor: String = "#999999", edgeWidth: Double = 1.5, background: PyreonFlowBackgroundStyle? = nil, controls: PyreonFlowControlsStyle? = nil, controlsContent: @escaping () -> AnyView? = { nil }, miniMap: PyreonFlowMiniMapStyle? = nil, miniMapNodeColor: @escaping (PyreonFlowNode<T>) -> String = { _ in "" }, ariaLabel: String = "Flow diagram", colorMode: String = "light", nodeHandles: @escaping (PyreonFlowNode<T>) -> [PyreonFlowHandleConfig] = { _ in [] }, nodeResizer: @escaping (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig? = { _ in nil }, nodeToolbarConfigs: @escaping (PyreonFlowNode<T>) -> [PyreonFlowNodeToolbarConfig] = { _ in [] }, nodeToolbar: @escaping (PyreonFlowNode<T>, Int, Bool, Bool) -> AnyView? = { _, _, _, _ in nil }, customEdgeTypes: Set<String> = [], customEdge: @escaping (PyreonFlowCustomEdgeContext) -> AnyView? = { _ in nil }, customConnectionLineEnabled: Bool = false, customConnectionLine: @escaping (PyreonFlowConnectionLineContext) -> AnyView? = { _ in nil }, @ViewBuilder nodeContent: @escaping (PyreonFlowNode<T>, Bool, Bool) -> NodeContent) {}
  public var body: some View { EmptyView() }
}
public struct PyreonFlowWebViewSelection { public let id: String; public let data: Any? }
public struct PyreonFlowWebViewViewport { public let x: Double; public let y: Double; public let zoom: Double }
public struct PyreonFlowWebViewEvent { public let type: String; public let id: String?; public let data: Any?; public let source: String?; public let target: String?; public let viewport: PyreonFlowWebViewViewport? }
public struct PyreonFlowWebViewError: Error { public let message: String }
public func pyreonFlowWebViewData(graph: String, commands: String) -> String { graph }
public func pyreonDispatchFlowWebViewMessage(_ message: String, onSelect: ((PyreonFlowWebViewSelection) -> Void)? = nil, onMessage: ((Any?) -> Void)? = nil, onEvent: ((PyreonFlowWebViewEvent) -> Void)? = nil, onError: ((PyreonFlowWebViewError) -> Void)? = nil) {}
`

/** Kotlin stubs: the engine and the web-view host types. */
export const FLOW_KOTLIN_STUBS = `// @pyreon/flow — the PyreonFlowState engine. Mirrors PyreonFlowState.kt.
data class PyreonXYPosition(val x: Double, val y: Double)
data class PyreonFlowRect(val x: Double, val y: Double, val width: Double, val height: Double)
data class PyreonFlowDimensions(val width: Double, val height: Double)
data class PyreonFlowMeasuredHandle(val id: String, val type: String, val position: PyreonFlowPosition, val x: Double, val y: Double)
data class PyreonFlowNodeMeasurement(val width: Double, val height: Double, val handles: List<PyreonFlowMeasuredHandle> = emptyList())
data class PyreonFlowViewport(val x: Double = 0.0, val y: Double = 0.0, val zoom: Double = 1.0)
data class PyreonFlowNodeExtent(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double)
enum class PyreonFlowPosition { Top, Right, Bottom, Left }
data class PyreonFlowPathPoint(val x: Double, val y: Double)
data class PyreonFlowPathResult(val path: String = "", val labelX: Double = 0.0, val labelY: Double = 0.0)
fun pyreonStraightPath(sourceX: Double, sourceY: Double, targetX: Double, targetY: Double) = PyreonFlowPathResult()
fun pyreonFlowPathResultFromSvg(d: String) = PyreonFlowPathResult()
fun pyreonBezierPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = PyreonFlowPosition.Bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = PyreonFlowPosition.Top, curvature: Double = 0.25) = PyreonFlowPathResult()
fun pyreonWaypointPath(sourceX: Double, sourceY: Double, targetX: Double, targetY: Double, waypoints: List<PyreonFlowPathPoint>) = PyreonFlowPathResult()
fun pyreonSmoothStepPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = PyreonFlowPosition.Bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = PyreonFlowPosition.Top, borderRadius: Double = 5.0, offset: Double = 20.0) = PyreonFlowPathResult()
fun pyreonStepPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = PyreonFlowPosition.Bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = PyreonFlowPosition.Top, offset: Double = 20.0) = PyreonFlowPathResult()
fun pyreonEdgePath(type: String, sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition, borderRadius: Double = 5.0, offset: Double = 20.0, curvature: Double = 0.25) = PyreonFlowPathResult()
fun pyreonHandlePosition(position: PyreonFlowPosition, nodeX: Double, nodeY: Double, nodeWidth: Double, nodeHeight: Double, offset: Double = 50.0) = PyreonFlowPathPoint(nodeX, nodeY)
data class PyreonFlowNodeBox(val x: Double, val y: Double, val width: Double, val height: Double)
fun pyreonNodeIntersection(box: PyreonFlowNodeBox, toward: PyreonFlowPathPoint) = toward
data class PyreonFlowNodeBoxDimensions(val sourceW: Double, val sourceH: Double, val targetW: Double, val targetH: Double)
data class PyreonFlowHandleAnchor(val x: Double = 0.0, val y: Double = 0.0, val position: PyreonFlowPosition = PyreonFlowPosition.Bottom)
data class PyreonFlowFloatingEndpoints(val source: PyreonFlowHandleAnchor = PyreonFlowHandleAnchor(), val target: PyreonFlowHandleAnchor = PyreonFlowHandleAnchor())
data class PyreonFlowSmartPositions(val sourcePosition: PyreonFlowPosition = PyreonFlowPosition.Bottom, val targetPosition: PyreonFlowPosition = PyreonFlowPosition.Top)
data class PyreonFlowHandleConfig(val id: String? = null, val type: String, val position: PyreonFlowPosition, val offset: Double = 50.0)
data class PyreonFlowMarker(val type: String, val color: String? = null, val width: Double = 10.0, val height: Double = 7.0, val strokeWidth: Double = 1.0)
data class PyreonFlowResolvedMarkers(val start: PyreonFlowMarker?, val end: PyreonFlowMarker?)
val pyreonFlowDefaultMarkerEnd = PyreonFlowMarker("arrowclosed")
fun pyreonResolveFlowMarker(marker: PyreonFlowMarker?): PyreonFlowMarker? = marker
fun pyreonFlowMarkerId(marker: PyreonFlowMarker): String = ""
fun pyreonResolveFlowEdgeMarkers(edge: PyreonFlowEdge, defaultMarkerEnd: PyreonFlowMarker?): PyreonFlowResolvedMarkers = PyreonFlowResolvedMarkers(null, null)
fun pyreonCollectFlowEdgeMarkers(edges: List<PyreonFlowEdge>, defaultMarkerEnd: PyreonFlowMarker?): Map<String, PyreonFlowMarker> = emptyMap()
data class PyreonFlowNode<T>(
  val id: String,
  val type: String? = null,
  val position: PyreonXYPosition,
  val data: T,
  val width: Double? = null,
  val height: Double? = null,
  val draggable: Boolean? = null,
  val selectable: Boolean? = null,
  val connectable: Boolean? = null,
  val focusable: Boolean? = null,
  val ariaLabel: String? = null,
  val hidden: Boolean? = null,
  val deletable: Boolean? = null,
  val className: String? = null,
  val style: String? = null,
  val parentId: String? = null,
  val extent: PyreonFlowNodeExtent? = null,
  val extentParent: Boolean = false,
  val expandParent: Boolean? = null,
  val group: Boolean? = null,
  val sourceHandles: List<PyreonFlowHandleConfig> = emptyList(),
  val targetHandles: List<PyreonFlowHandleConfig> = emptyList(),
  val zIndex: Double? = null,
)
fun <T> pyreonEffectiveDimensions(node: PyreonFlowNode<T>, measurement: PyreonFlowNodeMeasurement? = null) = PyreonFlowDimensions(node.width ?: measurement?.width ?: 150.0, node.height ?: measurement?.height ?: 40.0)
fun <S, T> pyreonGetFloatingEndpoints(sourceNode: PyreonFlowNode<S>, targetNode: PyreonFlowNode<T>, dimensions: PyreonFlowNodeBoxDimensions) = PyreonFlowFloatingEndpoints()
fun <S, T> pyreonGetSmartHandlePositions(sourceNode: PyreonFlowNode<S>, targetNode: PyreonFlowNode<T>, dimensions: PyreonFlowNodeBoxDimensions? = null) = PyreonFlowSmartPositions()
fun <T> pyreonResolveHandleAnchor(node: PyreonFlowNode<T>, handleId: String?, type: String, dimensions: PyreonFlowDimensions, measurement: PyreonFlowNodeMeasurement? = null): PyreonFlowHandleAnchor? = null
sealed interface PyreonFlowDataValue {
  data class StringValue(val value: String) : PyreonFlowDataValue
  data class NumberValue(val value: Double) : PyreonFlowDataValue
  data class BoolValue(val value: Boolean) : PyreonFlowDataValue
  data class ObjectValue(val value: PyreonFlowData) : PyreonFlowDataValue
  data class ArrayValue(val value: List<PyreonFlowDataValue>) : PyreonFlowDataValue
  data object NullValue : PyreonFlowDataValue
}
data class PyreonFlowData(val values: Map<String, PyreonFlowDataValue> = emptyMap()) { operator fun get(key: String): PyreonFlowDataValue? = values[key] }
fun pyreonFlowEdgeId(source: String, target: String, sourceHandle: String? = null, targetHandle: String? = null): String = ""
data class PyreonFlowEdge(
  val id: String,
  val source: String,
  val target: String,
  val sourceHandle: String? = null,
  val targetHandle: String? = null,
  val type: String? = null,
  val label: String? = null,
  val animated: Boolean = false,
  val animatedSpecified: Boolean = animated,
  val focusable: Boolean? = null,
  val ariaLabel: String? = null,
  val hidden: Boolean? = null,
  val deletable: Boolean? = null,
  val reconnectable: Boolean? = null,
  val interactionWidth: Double? = null,
  val className: String? = null,
  val style: String? = null,
  val data: PyreonFlowData? = null,
  val curvature: Double? = null,
  val borderRadius: Double? = null,
  val pathOffset: Double? = null,
  val markerStart: PyreonFlowMarker? = null,
  val markerEnd: PyreonFlowMarker? = null,
  val markerEndSpecified: Boolean = false,
  val waypoints: List<PyreonXYPosition> = emptyList(),
  val zIndex: Double? = null,
)
data class PyreonFlowDefaultEdgeOptions(
  val type: String? = null, val label: String? = null, val animated: Boolean? = null,
  val focusable: Boolean? = null, val ariaLabel: String? = null, val hidden: Boolean? = null,
  val deletable: Boolean? = null, val reconnectable: Boolean? = null, val interactionWidth: Double? = null,
  val curvature: Double? = null, val borderRadius: Double? = null, val pathOffset: Double? = null,
  val markerStart: PyreonFlowMarker? = null, val markerEnd: PyreonFlowMarker? = null, val markerEndSpecified: Boolean = false,
)
data class PyreonFlowConnection(val source: String, val target: String, val sourceHandle: String? = null, val targetHandle: String? = null)
data class PyreonFlowSelection<T>(val nodes: List<PyreonFlowNode<T>>, val edges: List<PyreonFlowEdge>)
data class PyreonFlowNodeChange(val type: String, val id: String, val position: PyreonXYPosition? = null)
data class PyreonFlowEdgeChange(val type: String, val id: String? = null, val edge: PyreonFlowEdge? = null)
data class PyreonFlowConnectStart(val nodeId: String, val handleId: String)
data class PyreonFlowPaneEvent(val position: PyreonXYPosition)
data class PyreonFlowSnapshot<T>(val nodes: List<PyreonFlowNode<T>>, val edges: List<PyreonFlowEdge>, val viewport: PyreonFlowViewport? = null)
data class PyreonFlowSnapLines(val x: Double?, val y: Double?, val snappedPosition: PyreonXYPosition)
data class PyreonFlowLayoutOptions(val direction: String = "DOWN", val nodeSpacing: Double = 20.0, val layerSpacing: Double = 40.0, val animate: Boolean = true, val animationDuration: Double = 300.0)
data class PyreonFlowLayoutPosition(val id: String, val position: PyreonXYPosition)
suspend fun <T> pyreonComputeFlowLayout(nodes: List<PyreonFlowNode<T>>, edges: List<PyreonFlowEdge>, algorithm: String = "layered", options: PyreonFlowLayoutOptions = PyreonFlowLayoutOptions()): List<PyreonFlowLayoutPosition> = emptyList()
data class PyreonFlowContainerSize(val width: Double = 0.0, val height: Double = 0.0)
class PyreonFlowState<T>(
  nodes: List<PyreonFlowNode<T>> = emptyList(),
  edges: List<PyreonFlowEdge> = emptyList(),
  viewport: PyreonFlowViewport = PyreonFlowViewport(),
  var minZoom: Double = 0.1,
  var maxZoom: Double = 4.0,
  var snapToGrid: Boolean = false,
  var snapGrid: Double = 15.0,
  nodeExtent: PyreonFlowNodeExtent? = null,
  var defaultMarkerEnd: PyreonFlowMarker? = PyreonFlowMarker("arrowclosed"),
  var nodesDraggable: Boolean = true,
  var nodesConnectable: Boolean = true,
  var nodesSelectable: Boolean = true,
  var nodesFocusable: Boolean = true,
  var edgesFocusable: Boolean = true,
  var disableKeyboardA11y: Boolean = false,
  var nodesDeletable: Boolean = true,
  var edgesDeletable: Boolean = true,
  var edgesReconnectable: Boolean = true,
  var edgeInteractionWidth: Double = 20.0,
  connectionRadius: Double = 0.0,
  var pannable: Boolean = true,
  var panOnDrag: Boolean = true,
  var panOnScroll: Boolean = false,
  var panOnScrollSpeed: Double = 0.5,
  var zoomable: Boolean = true,
  var zoomOnScroll: Boolean = true,
  var zoomOnPinch: Boolean = true,
  var zoomOnDoubleClick: Boolean = false,
  var selectionOnDrag: Boolean = false,
  selectionMode: String = "partial",
  connectionMode: String = "strict",
  elevateNodesOnSelect: Boolean = true,
  elevateEdgesOnSelect: Boolean = false,
  autoPanOnNodeDrag: Boolean = true,
  autoPanOnConnect: Boolean = true,
  autoPanSpeed: Double = 15.0,
  var multiSelect: Boolean = true,
  var onlyRenderVisibleElements: Boolean = false,
  var snapToObjects: Boolean = true,
  var defaultEdgeType: String = "bezier",
  var connectionLineType: String = "bezier",
  var defaultEdgeOptions: PyreonFlowDefaultEdgeOptions = PyreonFlowDefaultEdgeOptions(),
  var fitViewOnLoad: Boolean = false,
  fitViewPadding: Double = 0.1,
  var autoHistory: Boolean = true,
  var historyLimit: Double = 50.0,
  var deleteKeys: List<String>? = listOf("Delete", "Backspace"),
  var multiSelectionKey: String? = "shift",
  var selectionKey: String? = "shift",
  var zoomActivationKey: String? = "ctrl",
  var preventScrolling: Boolean = true,
  var connectionRules: Map<String, List<String>>? = null,
  var connectionValidator: ((PyreonFlowConnection) -> Boolean)? = null,
  searchText: ((T) -> String?)? = null,
  var reducedMotion: Boolean? = null,
) {
  var nodeExtent: PyreonFlowNodeExtent? = nodeExtent
  val nodes: List<PyreonFlowNode<T>> = nodes
  val nodeLookup: Map<String, PyreonFlowNode<T>> = emptyMap()
  val edges: List<PyreonFlowEdge> = edges
  val edgeLookup: Map<String, PyreonFlowEdge> = emptyMap()
  val measurements: Map<String, PyreonFlowNodeMeasurement> = emptyMap()
  val viewport: PyreonFlowViewport = viewport
  var containerSize: PyreonFlowContainerSize = PyreonFlowContainerSize()
  val zoom: Double get() = viewport.zoom
  var connectionRadius: Double = connectionRadius
  var fitViewPadding: Double = fitViewPadding
  var selectionMode: String = selectionMode
  var connectionMode: String = connectionMode
  var elevateNodesOnSelect: Boolean = elevateNodesOnSelect
  var elevateEdgesOnSelect: Boolean = elevateEdgesOnSelect
  var autoPanOnNodeDrag: Boolean = autoPanOnNodeDrag
  var autoPanOnConnect: Boolean = autoPanOnConnect
  var autoPanSpeed: Double = autoPanSpeed
  fun batch(operation: () -> Unit) { operation() }
  fun dispose() {}
  fun layout(algorithm: String = "layered", options: PyreonFlowLayoutOptions = PyreonFlowLayoutOptions()) {}
  fun getNode(id: String): PyreonFlowNode<T>? = null
  fun getNodeDimensions(id: String): PyreonFlowDimensions = PyreonFlowDimensions(150.0, 40.0)
  fun updateNodeMeasurement(id: String, width: Double, height: Double, handles: List<PyreonFlowMeasuredHandle> = emptyList()) {}
  fun replaceMeasurements(next: Map<String, PyreonFlowNodeMeasurement>) {}
  fun updateMeasurements(update: (Map<String, PyreonFlowNodeMeasurement>) -> Map<String, PyreonFlowNodeMeasurement>) {}
  fun clearNodeMeasurement(id: String) {}
  fun isValidConnection(connection: PyreonFlowConnection): Boolean = true
  fun connect(connection: PyreonFlowConnection, id: String? = null): PyreonFlowEdge? = null
  fun resolvedMarkers(edge: PyreonFlowEdge): Pair<PyreonFlowMarker?, PyreonFlowMarker?> = null to null
  fun snappedNodePosition(id: String, position: PyreonXYPosition, excluding: Set<String> = emptySet(), threshold: Double = 5.0): PyreonXYPosition = position
  fun nodesInSelection(start: PyreonXYPosition, end: PyreonXYPosition): List<String> = emptyList()
  fun emitNodeContextMenu(id: String): Boolean = false; fun emitEdgeContextMenu(id: String): Boolean = false; fun emitPaneContextMenu(position: PyreonXYPosition): Boolean = false
  fun emitNodeMouseEnter(id: String) {}; fun emitNodeMouseLeave(id: String) {}; fun emitEdgeMouseEnter(id: String) {}; fun emitEdgeMouseLeave(id: String) {}
  fun emitNodeClick(id: String) {}; fun emitNodeDoubleClick(id: String) {}; fun emitNodeDragStart(id: String) {}; fun emitNodeDrag(id: String) {}; fun emitNodeDragEnd(id: String) {}
  fun emitConnectStart(nodeId: String, handleId: String?) {}; fun emitConnectEnd(connection: PyreonFlowConnection?) {}; fun emitPaneClick(position: PyreonXYPosition) {}; fun emitEdgeClick(id: String) {}
  fun addNode(node: PyreonFlowNode<T>) {}
  fun addNodes(nodes: List<PyreonFlowNode<T>>) {}
  fun setNodes(nodes: List<PyreonFlowNode<T>>) {}
  fun setNodes(update: (List<PyreonFlowNode<T>>) -> List<PyreonFlowNode<T>>) {}
  fun removeNode(id: String) {}
  fun removeNodes(ids: List<String>) {}
  fun updateNodePosition(id: String, position: PyreonXYPosition) {}
  fun updateNodeData(id: String, update: (T) -> T) {}
  fun updateNodeDataFromNode(id: String, update: (PyreonFlowNode<T>) -> T) {}
  fun updateNode(id: String, update: (PyreonFlowNode<T>) -> PyreonFlowNode<T>) {}
  fun setNodeExtent(minX: Double, minY: Double, maxX: Double, maxY: Double) {}
  fun clearNodeExtent() {}
  fun clampToExtent(position: PyreonXYPosition, nodeWidth: Double = 150.0, nodeHeight: Double = 40.0): PyreonXYPosition = position
  fun getEdge(id: String): PyreonFlowEdge? = null
  fun addEdge(edge: PyreonFlowEdge) {}
  fun addEdges(edges: List<PyreonFlowEdge>) {}
  fun setEdges(edges: List<PyreonFlowEdge>) {}
  fun setEdges(update: (List<PyreonFlowEdge>) -> List<PyreonFlowEdge>) {}
  fun removeEdge(id: String) {}
  fun updateEdge(id: String, update: (PyreonFlowEdge) -> PyreonFlowEdge) {}
  fun reconnectEdge(id: String, source: String? = null, target: String? = null, sourceHandle: String? = null, targetHandle: String? = null) {}
  fun addEdgeWaypoint(edgeId: String, point: PyreonXYPosition, index: Int? = null) {}
  fun removeEdgeWaypoint(edgeId: String, index: Int) {}
  fun updateEdgeWaypoint(edgeId: String, index: Int, point: PyreonXYPosition) {}
  fun removeEdges(ids: List<String>) {}
  fun isNodeSelected(id: String): Boolean = false
  fun isEdgeSelected(id: String): Boolean = false
  fun selectedNodes(): List<String> = emptyList()
  fun selectedEdges(): List<String> = emptyList()
  fun selectNode(id: String, additive: Boolean = false) {}
  fun selectNodes(ids: List<String>, additive: Boolean = false) {}
  fun deselectNode(id: String) {}
  fun selectEdge(id: String, additive: Boolean = false) {}
  fun clearSelection() {}
  fun selectAll() {}
  fun deleteSelected() {}
  fun copySelected() {}
  fun paste(offset: PyreonXYPosition = PyreonXYPosition(50.0, 50.0)) {}
  fun pushHistory() {}
  fun undo() {}
  fun redo() {}
  fun toJSON(): PyreonFlowSnapshot<T> = PyreonFlowSnapshot(emptyList(), emptyList(), null)
  fun fromJSON(snapshot: PyreonFlowSnapshot<T>) {}
  fun zoomTo(z: Double, duration: Double = 0.0) {}
  fun zoomIn(duration: Double = 0.0) {}
  fun zoomOut(duration: Double = 0.0) {}
  fun panTo(position: PyreonXYPosition) {}
  fun setViewport(x: Double? = null, y: Double? = null, zoom: Double? = null, duration: Double = 0.0) {}
  fun setViewport(next: PyreonFlowViewport) {}
  fun setViewport(update: (PyreonFlowViewport) -> PyreonFlowViewport) {}
  fun replaceContainerSize(next: PyreonFlowContainerSize) {}
  fun updateContainerSize(update: (PyreonFlowContainerSize) -> PyreonFlowContainerSize) {}
  fun setCenter(x: Double, y: Double, zoom: Double? = null, duration: Double = 0.0) {}
  fun animateViewport(x: Double? = null, y: Double? = null, zoom: Double? = null, duration: Double = 300.0) {}
  fun screenToFlowPosition(position: PyreonXYPosition): PyreonXYPosition = position
  fun flowToScreenPosition(position: PyreonXYPosition): PyreonXYPosition = position
  fun isNodeVisible(id: String): Boolean = false
  fun fitView(nodeIds: List<String>? = null, padding: Double? = null, duration: Double = 0.0) {}
  fun getConnectedEdges(nodeId: String): List<PyreonFlowEdge> = emptyList()
  fun getIncomers(nodeId: String): List<PyreonFlowNode<T>> = emptyList()
  fun getOutgoers(nodeId: String): List<PyreonFlowNode<T>> = emptyList()
  fun findNodes(predicate: (PyreonFlowNode<T>) -> Boolean): List<PyreonFlowNode<T>> = emptyList()
  fun searchNodes(query: String): List<PyreonFlowNode<T>> = emptyList()
  fun getChildNodes(parentId: String): List<PyreonFlowNode<T>> = emptyList()
  fun getAbsolutePosition(nodeId: String): PyreonXYPosition = PyreonXYPosition(0.0, 0.0)
  fun getProximityConnection(nodeId: String, threshold: Double = 50.0): PyreonFlowConnection? = null
  fun getOverlappingNodes(nodeId: String): List<PyreonFlowNode<T>> = emptyList()
  fun getIntersectingNodes(nodeId: String, partially: Boolean = true): List<PyreonFlowNode<T>> = emptyList()
  fun getIntersectingNodes(rect: PyreonFlowRect, partially: Boolean = true): List<PyreonFlowNode<T>> = emptyList()
  fun isNodeIntersecting(nodeId: String, area: PyreonFlowRect, partially: Boolean = true): Boolean = false
  fun isNodeIntersecting(rect: PyreonFlowRect, area: PyreonFlowRect, partially: Boolean = true): Boolean = false
  fun getNodesBounds(nodeIds: List<String>? = null): PyreonFlowRect = PyreonFlowRect(0.0, 0.0, 0.0, 0.0)
  fun resolveCollisions(nodeId: String, spacing: Double = 10.0) {}
  fun getSnapLines(nodeId: String, position: PyreonXYPosition, threshold: Double = 5.0, excluding: Set<String> = emptySet()): PyreonFlowSnapLines = PyreonFlowSnapLines(null, null, position)
  fun onConnect(callback: (PyreonFlowConnection) -> Unit): () -> Unit = {}
  fun onViewportChange(callback: (PyreonFlowViewport) -> Unit): () -> Unit = {}
  fun onNodeClick(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = {}
  fun onNodeDoubleClick(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = {}
  fun onNodeContextMenu(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = {}
  fun onEdgeContextMenu(callback: (PyreonFlowEdge) -> Unit): () -> Unit = {}
  fun onPaneContextMenu(callback: (PyreonXYPosition) -> Unit): () -> Unit = {}
  fun onNodeMouseEnter(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = {}
  fun onNodeMouseLeave(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = {}
  fun onEdgeMouseEnter(callback: (PyreonFlowEdge) -> Unit): () -> Unit = {}
  fun onEdgeMouseLeave(callback: (PyreonFlowEdge) -> Unit): () -> Unit = {}
  fun onNodeDragStart(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = {}
  fun onNodeDrag(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = {}
  fun onNodeDragEnd(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = {}
  fun onEdgeClick(callback: (PyreonFlowEdge) -> Unit): () -> Unit = {}
  fun onSelectionChange(callback: (PyreonFlowSelection<T>) -> Unit): () -> Unit = {}
  fun onNodesDelete(callback: (List<PyreonFlowNode<T>>) -> Unit): () -> Unit = {}
  fun onEdgesDelete(callback: (List<PyreonFlowEdge>) -> Unit): () -> Unit = {}
  fun onNodesChange(callback: (List<PyreonFlowNodeChange>) -> Unit): () -> Unit = {}
  fun onEdgesChange(callback: (List<PyreonFlowEdgeChange>) -> Unit): () -> Unit = {}
  fun onConnectStart(callback: (PyreonFlowConnectStart) -> Unit): () -> Unit = {}
  fun onConnectEnd(callback: (PyreonFlowConnection?) -> Unit): () -> Unit = {}
  fun onPaneClick(callback: (PyreonFlowPaneEvent) -> Unit): () -> Unit = {}
  fun moveSelectedNodes(dx: Double, dy: Double) {}
  fun handleKeyboardCommand(key: String, nodeId: String? = null, shift: Boolean = false, command: Boolean = false, repeatKey: Boolean = false, edgeId: String? = null): Boolean = false
  fun focusNode(nodeId: String, focusZoom: Double? = null) {}
}

enum class PyreonFlowBackgroundVariant { Dots, Lines, Cross }
fun pyreonFlowBackgroundVariant(value: String): PyreonFlowBackgroundVariant = PyreonFlowBackgroundVariant.Dots
data class PyreonFlowBackgroundStyle(val variant: PyreonFlowBackgroundVariant = PyreonFlowBackgroundVariant.Dots, val gap: Double = 20.0, val size: Double = 1.0, val color: String? = null)
@Composable fun PyreonFlowColorMode(colorMode: String, content: @Composable () -> Unit) { content() }
@Composable fun PyreonFlowDefaultNode(label: String, selected: Boolean) {}
enum class PyreonFlowControlsPosition { TopLeft, TopRight, BottomLeft, BottomRight }
fun pyreonFlowControlsPosition(value: String): PyreonFlowControlsPosition = PyreonFlowControlsPosition.BottomLeft
data class PyreonFlowControlsStyle(val showZoomIn: Boolean = true, val showZoomOut: Boolean = true, val showFitView: Boolean = true, val showLock: Boolean = false, val position: PyreonFlowControlsPosition = PyreonFlowControlsPosition.BottomLeft)
@Composable fun <T> PyreonStandaloneFlowControls(state: PyreonFlowState<T>, style: PyreonFlowControlsStyle = PyreonFlowControlsStyle(), extraContent: @Composable () -> Unit = {}) { extraContent() }
data class PyreonFlowMiniMapStyle(val nodeColor: String? = null, val maskColor: String = "#000000", val width: Double = 200.0, val height: Double = 150.0, val pannable: Boolean = true, val zoomable: Boolean = true)
data class PyreonFlowNodeResizerConfig(val minWidth: Double = 50.0, val minHeight: Double = 30.0, val handleSize: Double = 8.0, val showEdgeHandles: Boolean = false)
data class PyreonFlowNodeToolbarConfig(val position: String = "top", val align: String = "center", val offset: Double = 8.0, val showOnSelect: Boolean = true, val selectedOverride: Boolean? = false, val nodeIdOverride: String? = null)
data class PyreonFlowCustomEdgeContext(val edge: PyreonFlowEdge, val sourceX: Double, val sourceY: Double, val targetX: Double, val targetY: Double, val sourcePosition: PyreonFlowPosition, val targetPosition: PyreonFlowPosition, val selected: Boolean, val labelX: Double, val labelY: Double)
data class PyreonFlowConnectionLineContext(val sourceX: Double, val sourceY: Double, val targetX: Double, val targetY: Double, val sourcePosition: PyreonFlowPosition, val path: PyreonFlowPathResult)
@Composable fun PyreonFlowCustomEdgePath(result: PyreonFlowPathResult, color: String? = "#999999", width: Double = 1.5, dash: List<Double>? = null, fill: String? = null) {}
data class PyreonFlowSvgShape(val result: PyreonFlowPathResult, val stroke: String? = null, val strokeWidth: Double = 1.0, val fill: String? = "#000000")
@Composable fun PyreonFlowSvg(width: Double? = null, height: Double? = null, viewBox: List<Double>? = null, stretch: Boolean = false, shapes: List<PyreonFlowSvgShape>) {}
@Composable fun PyreonFlowBaseEdgePath(result: PyreonFlowPathResult, color: String? = null, width: Double = 1.5) {}
@Composable fun PyreonFlowEdgeText(x: Double, y: Double, label: String) {}
@Composable fun PyreonFlowEdgeLabelRenderer(content: @Composable () -> Unit) { content() }

@Composable
fun <T> PyreonFlowView(
  state: PyreonFlowState<T>,
  modifier: Modifier = Modifier,
  edgeColor: String = "#999999",
  edgeWidth: Double = 1.5,
  background: PyreonFlowBackgroundStyle? = null,
  controls: PyreonFlowControlsStyle? = null,
  controlsContent: @Composable () -> Unit = {},
  miniMap: PyreonFlowMiniMapStyle? = null,
  miniMapNodeColor: (PyreonFlowNode<T>) -> String = { "" },
  ariaLabel: String = "Flow diagram",
  colorMode: String = "light",
  nodeHandles: (PyreonFlowNode<T>) -> List<PyreonFlowHandleConfig> = { emptyList() },
  nodeResizer: (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig? = { null },
  nodeToolbarConfigs: (PyreonFlowNode<T>) -> List<PyreonFlowNodeToolbarConfig> = { emptyList() },
  nodeToolbar: @Composable (PyreonFlowNode<T>, Int, Boolean, Boolean) -> Unit = { _, _, _, _ -> },
  customEdgeTypes: Set<String> = emptySet(),
  customEdge: @Composable (PyreonFlowCustomEdgeContext) -> Unit = {},
  customConnectionLineEnabled: Boolean = false,
  customConnectionLine: @Composable (PyreonFlowConnectionLineContext) -> Unit = {},
  nodeContent: @Composable (PyreonFlowNode<T>) -> Unit,
) {}
@Composable
fun <T> PyreonFlowView(
  state: PyreonFlowState<T>,
  modifier: Modifier = Modifier,
  edgeColor: String = "#999999",
  edgeWidth: Double = 1.5,
  background: PyreonFlowBackgroundStyle? = null,
  controls: PyreonFlowControlsStyle? = null,
  controlsContent: @Composable () -> Unit = {},
  miniMap: PyreonFlowMiniMapStyle? = null,
  miniMapNodeColor: (PyreonFlowNode<T>) -> String = { "" },
  ariaLabel: String = "Flow diagram",
  colorMode: String = "light",
  nodeHandles: (PyreonFlowNode<T>) -> List<PyreonFlowHandleConfig> = { emptyList() },
  nodeResizer: (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig? = { null },
  nodeToolbarConfigs: (PyreonFlowNode<T>) -> List<PyreonFlowNodeToolbarConfig> = { emptyList() },
  nodeToolbar: @Composable (PyreonFlowNode<T>, Int, Boolean, Boolean) -> Unit = { _, _, _, _ -> },
  customEdgeTypes: Set<String> = emptySet(),
  customEdge: @Composable (PyreonFlowCustomEdgeContext) -> Unit = {},
  customConnectionLineEnabled: Boolean = false,
  customConnectionLine: @Composable (PyreonFlowConnectionLineContext) -> Unit = {},
  nodeContent: @Composable (PyreonFlowNode<T>, Boolean, Boolean) -> Unit,
) {}
data class PyreonFlowWebViewSelection(val id: String, val data: Any? = null)
data class PyreonFlowWebViewViewport(val x: Double, val y: Double, val zoom: Double)
data class PyreonFlowWebViewEvent(val type: String, val id: String? = null, val data: Any? = null, val source: String? = null, val target: String? = null, val viewport: PyreonFlowWebViewViewport? = null)
data class PyreonFlowWebViewError(val message: String)
fun pyreonFlowWebViewData(graph: String, commands: String): String = graph
fun pyreonDispatchFlowWebViewMessage(message: String, onSelect: ((PyreonFlowWebViewSelection) -> Unit)? = null, onMessage: ((Any?) -> Unit)? = null, onEvent: ((PyreonFlowWebViewEvent) -> Unit)? = null, onError: ((PyreonFlowWebViewError) -> Unit)? = null) {}
`

/**
 * Does `source` name a flow runtime type or helper? The engine's own symbols all
 * start `PyreonFlow` / `pyreonFlow`, except the shared `PyreonXYPosition` and the
 * edge-geometry helpers (`pyreonEdgePath`, `pyreonHandlePosition`, …).
 */
const NAMES_FLOW_RUNTIME =
  /PyreonFlow|pyreonFlow|PyreonXYPosition|pyreon(?:Bezier|SmoothStep|Step|Straight|Waypoint|Edge)Path|pyreon(?:HandlePosition|NodeIntersection|EffectiveDimensions|GetFloatingEndpoints|GetSmartHandlePositions|ResolveHandleAnchor)/

/** The stub augmentation: flow engine stubs for an emit that names a flow runtime type, nothing otherwise. */
export const flowStubs: StubAugmentation = {
  swift: (source) => (NAMES_FLOW_RUNTIME.test(source) ? FLOW_SWIFT_STUBS : ''),
  kotlin: (source) => (NAMES_FLOW_RUNTIME.test(source) ? FLOW_KOTLIN_STUBS : ''),
}
