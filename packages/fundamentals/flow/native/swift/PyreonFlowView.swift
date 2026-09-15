import SwiftUI

public struct PyreonFlowMiniMapNode: Equatable {
    public var id: String; public var x: Double; public var y: Double; public var width: Double; public var height: Double
}
public struct PyreonFlowEdgeLabel: Identifiable, Equatable {
    public var id: String
    public var text: String?
    public var accessibilityLabel: String
    public var x: Double
    public var y: Double
    public var focusable: Bool
}
public struct PyreonFlowEdgeUpdater: Identifiable, Equatable {
    public var id: String { "\(edgeId)-\(end)" }
    public var edgeId: String
    public var end: String
    public var x: Double
    public var y: Double
}
public struct PyreonFlowMiniMapLayout: Equatable {
    public var nodes: [PyreonFlowMiniMapNode]
    public var viewport: PyreonFlowRect
    public var scale: Double
    public var minX: Double
    public var minY: Double
}

public struct PyreonFlowMiniMapStyle: Equatable {
    public var nodeColor: String; public var maskColor: String; public var width: Double; public var height: Double; public var pannable: Bool; public var zoomable: Bool
    public init(nodeColor: String = "#e2e8f0", maskColor: String = "#000000", width: Double = 200, height: Double = 150, pannable: Bool = true, zoomable: Bool = true) {
        self.nodeColor = nodeColor; self.maskColor = maskColor; self.width = width; self.height = height; self.pannable = pannable; self.zoomable = zoomable
    }
}

private struct PyreonFlowConnectionDraft: Equatable {
    var source: PyreonFlowInteractiveHandle
    var current: PyreonXYPosition
}
private struct PyreonFlowReconnectDraft: Equatable {
    var updater: PyreonFlowEdgeUpdater
    var fixed: PyreonXYPosition
    var current: PyreonXYPosition
}

@available(iOS 17.0, macOS 14.0, *)
public func pyreonFlowMiniMapLayout<T>(state: PyreonFlowState<T>, width: Double = 200, height: Double = 150, padding: Double = 40) -> PyreonFlowMiniMapLayout {
    let visible = state.nodes.filter { $0.hidden != true }
    guard !visible.isEmpty else { return PyreonFlowMiniMapLayout(nodes: [], viewport: PyreonFlowRect(x: 0, y: 0, width: 0, height: 0), scale: 1, minX: 0, minY: 0) }
    var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
    var absolute: [(PyreonFlowNode<T>, PyreonXYPosition)] = []
    for node in visible {
        let p = state.getAbsolutePosition(node.id); absolute.append((node, p))
        minX = min(minX, p.x); minY = min(minY, p.y)
        maxX = max(maxX, p.x + (node.width ?? pyreonFlowDefaultNodeWidth))
        maxY = max(maxY, p.y + (node.height ?? pyreonFlowDefaultNodeHeight))
    }
    let scale = min(width / max(1, maxX - minX + padding * 2), height / max(1, maxY - minY + padding * 2))
    let nodes = absolute.map { node, p in PyreonFlowMiniMapNode(id: node.id, x: (p.x - minX + padding) * scale, y: (p.y - minY + padding) * scale, width: (node.width ?? pyreonFlowDefaultNodeWidth) * scale, height: (node.height ?? pyreonFlowDefaultNodeHeight) * scale) }
    let vp = state.viewport, cs = state.containerSize
    return PyreonFlowMiniMapLayout(
        nodes: nodes,
        viewport: PyreonFlowRect(x: (-vp.x / vp.zoom - minX + padding) * scale, y: (-vp.y / vp.zoom - minY + padding) * scale, width: (cs.width / vp.zoom) * scale, height: (cs.height / vp.zoom) * scale),
        scale: scale, minX: minX, minY: minY)
}

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonFlowMiniMap<T>: View {
    @Bindable private var state: PyreonFlowState<T>
    private let style: PyreonFlowMiniMapStyle
    @State private var panStart: PyreonFlowViewport?
    @State private var zoomStart: (zoom: Double, centerX: Double, centerY: Double)?
    public init(state: PyreonFlowState<T>, style: PyreonFlowMiniMapStyle = PyreonFlowMiniMapStyle()) { self.state = state; self.style = style }
    public var body: some View {
        let layout = pyreonFlowMiniMapLayout(state: state, width: style.width, height: style.height)
        Canvas { context, _ in
            let nodeColor = pyreonFlowEdgeColor(style.nodeColor)
            for node in layout.nodes {
                context.fill(Path(CGRect(x: node.x, y: node.y, width: node.width, height: node.height)), with: .color(nodeColor))
            }
            let viewport = layout.viewport
            context.stroke(Path(CGRect(x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height)), with: .color(pyreonFlowEdgeColor(style.maskColor)), lineWidth: 1)
        }
        .frame(width: style.width, height: style.height)
        .background(Color.white.opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.gray.opacity(0.4)))
        .contentShape(Rectangle())
        .gesture(panGesture(layout))
        .simultaneousGesture(tapGesture(layout))
        .simultaneousGesture(zoomGesture)
        .accessibilityLabel("minimap")
    }
    private func tapGesture(_ layout: PyreonFlowMiniMapLayout) -> some Gesture {
        SpatialTapGesture().onEnded { value in
            guard style.pannable, layout.scale > 0 else { return }
            state.setCenter(Double(value.location.x) / layout.scale + layout.minX - 40, Double(value.location.y) / layout.scale + layout.minY - 40)
        }
    }
    private func panGesture(_ layout: PyreonFlowMiniMapLayout) -> some Gesture {
        DragGesture(minimumDistance: 2, coordinateSpace: .global).onChanged { value in
            guard style.pannable, layout.scale > 0 else { return }
            let start = panStart ?? state.viewport
            if panStart == nil { panStart = start }
            state.setViewport(x: start.x - Double(value.translation.width) / layout.scale * start.zoom, y: start.y - Double(value.translation.height) / layout.scale * start.zoom)
        }.onEnded { _ in panStart = nil }
    }
    private var zoomGesture: some Gesture {
        MagnificationGesture().onChanged { scale in
            guard style.zoomable else { return }
            let start = zoomStart ?? (state.zoom, (state.containerSize.width / 2 - state.viewport.x) / state.zoom, (state.containerSize.height / 2 - state.viewport.y) / state.zoom)
            if zoomStart == nil { zoomStart = start }
            state.setCenter(start.centerX, start.centerY, zoom: start.zoom * scale)
        }.onEnded { _ in zoomStart = nil }
    }
}

public enum PyreonFlowBackgroundVariant: Equatable { case dots, lines, cross }

public struct PyreonFlowBackgroundStyle: Equatable {
    public var variant: PyreonFlowBackgroundVariant
    public var gap: Double
    public var size: Double
    public var color: String
    public init(variant: PyreonFlowBackgroundVariant = .dots, gap: Double = 20, size: Double = 1, color: String = "#dddddd") {
        self.variant = variant; self.gap = gap; self.size = size; self.color = color
    }
}

public enum PyreonFlowControlsPosition: Equatable { case topLeft, topRight, bottomLeft, bottomRight }

public struct PyreonFlowControlsStyle: Equatable {
    public var showZoomIn: Bool
    public var showZoomOut: Bool
    public var showFitView: Bool
    public var showLock: Bool
    public var position: PyreonFlowControlsPosition
    public init(showZoomIn: Bool = true, showZoomOut: Bool = true, showFitView: Bool = true, showLock: Bool = false, position: PyreonFlowControlsPosition = .bottomLeft) {
        self.showZoomIn = showZoomIn; self.showZoomOut = showZoomOut; self.showFitView = showFitView; self.showLock = showLock; self.position = position
    }
}

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonFlowControls<T>: View {
    @Bindable private var state: PyreonFlowState<T>
    @Binding private var locked: Bool
    private let style: PyreonFlowControlsStyle
    public init(state: PyreonFlowState<T>, style: PyreonFlowControlsStyle, locked: Binding<Bool>) {
        self.state = state; self.style = style; self._locked = locked
    }
    public var body: some View {
        VStack(spacing: 2) {
            if style.showZoomIn { Button("+") { state.zoomIn() }.accessibilityLabel("Zoom in") }
            if style.showZoomOut { Button("−") { state.zoomOut() }.accessibilityLabel("Zoom out") }
            if style.showFitView { Button("Fit") { state.fitView() }.accessibilityLabel("Fit view") }
            if style.showLock { Button(locked ? "Unlock" : "Lock") { locked.toggle() }.accessibilityLabel("Lock the canvas").accessibilityValue(locked ? "Locked" : "Unlocked") }
            Text("\(Int((state.zoom * 100).rounded()))%")
                .font(.caption2)
                .accessibilityLabel("Current zoom level")
        }
        .padding(2)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
        .padding(10)
    }
    private var alignment: Alignment {
        switch style.position {
        case .topLeft: return .topLeading
        case .topRight: return .topTrailing
        case .bottomLeft: return .bottomLeading
        case .bottomRight: return .bottomTrailing
        }
    }
}

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonFlowBackground: View, Equatable {
    public var style: PyreonFlowBackgroundStyle
    public var viewport: PyreonFlowViewport
    public init(style: PyreonFlowBackgroundStyle, viewport: PyreonFlowViewport) {
        self.style = style; self.viewport = viewport
    }
    public var body: some View {
        Canvas { context, size in
            let step = CGFloat(max(1, style.gap * viewport.zoom))
            let radius = CGFloat(max(0.5, style.size * viewport.zoom))
            let x0 = CGFloat(viewport.x).truncatingRemainder(dividingBy: step)
            let y0 = CGFloat(viewport.y).truncatingRemainder(dividingBy: step)
            let color = pyreonFlowEdgeColor(style.color)
            switch style.variant {
            case .dots, .cross:
                var x = x0
                while x <= size.width {
                    var y = y0
                    while y <= size.height {
                        if style.variant == .dots {
                        context.fill(Path(ellipseIn: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)), with: .color(color))
                        } else {
                            var path = Path(); path.move(to: CGPoint(x: x - radius * 2, y: y)); path.addLine(to: CGPoint(x: x + radius * 2, y: y)); path.move(to: CGPoint(x: x, y: y - radius * 2)); path.addLine(to: CGPoint(x: x, y: y + radius * 2))
                            context.stroke(path, with: .color(color), lineWidth: radius)
                        }
                        y += step
                    }
                    x += step
                }
            case .lines:
                var path = Path()
                var x = x0
                while x <= size.width { path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: size.height)); x += step }
                var y = y0
                while y <= size.height { path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: size.width, y: y)); y += step }
                context.stroke(path, with: .color(color), lineWidth: radius)
            }
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
}

/// Converts the graph's visible edges into the flat draw list consumed by
/// `PyreonFlowEdgeCanvas`. Edges with hidden or missing endpoints are omitted,
/// matching the web renderer rather than drawing a misleading line to (0, 0).
@available(iOS 17.0, macOS 14.0, *)
public func pyreonFlowEdgeStrokes<T>(
    state: PyreonFlowState<T>,
    color: String = "#999999",
    width: Double = 1.5
) -> [PyreonFlowEdgeStroke] {
    var nodes: [String: PyreonFlowNode<T>] = [:]
    for node in state.nodes where node.hidden != true { nodes[node.id] = node }

    return state.edges.compactMap { edge in
        guard edge.hidden != true,
              let source = nodes[edge.source],
              let target = nodes[edge.target]
        else { return nil }

        let sourcePosition = state.getAbsolutePosition(source.id)
        let targetPosition = state.getAbsolutePosition(target.id)
        let path = pyreonComputeEdgePath(
            type: edge.type ?? "bezier",
            source: PyreonFlowRect(
                x: sourcePosition.x,
                y: sourcePosition.y,
                width: source.width ?? pyreonFlowDefaultNodeWidth,
                height: source.height ?? pyreonFlowDefaultNodeHeight),
            target: PyreonFlowRect(
                x: targetPosition.x,
                y: targetPosition.y,
                width: target.width ?? pyreonFlowDefaultNodeWidth,
                height: target.height ?? pyreonFlowDefaultNodeHeight),
            sourceHandleId: edge.sourceHandle,
            targetHandleId: edge.targetHandle,
            sourceHandles: source.sourceHandles,
            targetHandles: target.targetHandles,
            waypoints: edge.waypoints,
            borderRadius: edge.borderRadius ?? 5,
            offset: edge.pathOffset ?? 20,
            curvature: edge.curvature ?? 0.25)
        let markers = state.resolvedMarkers(edge)
        return PyreonFlowEdgeStroke(
            id: edge.id, segments: path.segments, color: color, width: width,
            dash: edge.animated ? [5, 5] : nil,
            startMarker: markers.start.flatMap { pyreonFlowMarkerGlyph($0, segments: path.segments, atStart: true, edgeColor: color) },
            endMarker: markers.end.flatMap { pyreonFlowMarkerGlyph($0, segments: path.segments, atStart: false, edgeColor: color) },
            interactionWidth: edge.interactionWidth ?? state.edgeInteractionWidth)
    }
}

@available(iOS 17.0, macOS 14.0, *)
public func pyreonFlowEdgeLabels<T>(state: PyreonFlowState<T>) -> [PyreonFlowEdgeLabel] {
    let nodes = Dictionary(uniqueKeysWithValues: state.nodes.filter { $0.hidden != true }.map { ($0.id, $0) })
    return state.edges.compactMap { edge in
        guard edge.hidden != true, let source = nodes[edge.source], let target = nodes[edge.target] else { return nil }
        let sp = state.getAbsolutePosition(source.id), tp = state.getAbsolutePosition(target.id)
        let path = pyreonComputeEdgePath(
            type: edge.type ?? "bezier",
            source: PyreonFlowRect(x: sp.x, y: sp.y, width: source.width ?? pyreonFlowDefaultNodeWidth, height: source.height ?? pyreonFlowDefaultNodeHeight),
            target: PyreonFlowRect(x: tp.x, y: tp.y, width: target.width ?? pyreonFlowDefaultNodeWidth, height: target.height ?? pyreonFlowDefaultNodeHeight),
            sourceHandleId: edge.sourceHandle, targetHandleId: edge.targetHandle,
            sourceHandles: source.sourceHandles, targetHandles: target.targetHandles,
            waypoints: edge.waypoints,
            borderRadius: edge.borderRadius ?? 5,
            offset: edge.pathOffset ?? 20,
            curvature: edge.curvature ?? 0.25)
        return PyreonFlowEdgeLabel(id: edge.id, text: edge.label, accessibilityLabel: edge.ariaLabel ?? edge.label ?? "Edge from \(edge.source) to \(edge.target)", x: path.labelX, y: path.labelY, focusable: !state.disableKeyboardA11y && (edge.focusable ?? state.edgesFocusable))
    }
}

@available(iOS 17.0, macOS 14.0, *)
public func pyreonFlowEdgeUpdaters<T>(state: PyreonFlowState<T>, strokes: [PyreonFlowEdgeStroke]) -> [PyreonFlowEdgeUpdater] {
    let byId = Dictionary(uniqueKeysWithValues: strokes.map { ($0.id, $0) })
    return state.selectedEdges().flatMap { id -> [PyreonFlowEdgeUpdater] in
        guard let edge = state.getEdge(id), edge.reconnectable ?? state.edgesReconnectable, let segments = byId[id]?.segments, let first = segments.first, let last = segments.last else { return [] }
        return [PyreonFlowEdgeUpdater(edgeId: id, end: "source", x: first.x, y: first.y), PyreonFlowEdgeUpdater(edgeId: id, end: "target", x: last.x, y: last.y)]
    }
}

public func pyreonFlowReconnectConnection(edge: PyreonFlowEdge, end: String, handle: PyreonFlowInteractiveHandle) -> PyreonFlowConnection? {
    if end == "target" {
        guard handle.type == "target", handle.nodeId != edge.source else { return nil }
        return PyreonFlowConnection(source: edge.source, target: handle.nodeId, sourceHandle: edge.sourceHandle, targetHandle: handle.handleId)
    }
    guard end == "source", handle.type == "source", handle.nodeId != edge.target else { return nil }
    return PyreonFlowConnection(source: handle.nodeId, target: edge.target, sourceHandle: handle.handleId, targetHandle: edge.targetHandle)
}

/// The dragged selection with descendants removed when an ancestor is also
/// selected. Node positions are parent-relative, so moving both would apply
/// the same pointer delta twice to a descendant's absolute position.
@available(iOS 17.0, macOS 14.0, *)
public func pyreonFlowDragNodeIds<T>(state: PyreonFlowState<T>, draggedNodeId: String) -> [String] {
    var ids = state.isNodeSelected(draggedNodeId) ? state.selectedNodes() : [draggedNodeId]
    let selected = Set(ids)
    ids.removeAll { id in
        var parentId = state.getNode(id)?.parentId
        var seen: Set<String> = []
        while let parent = parentId, seen.insert(parent).inserted {
            if selected.contains(parent) { return true }
            parentId = state.getNode(parent)?.parentId
        }
        return false
    }
    return ids
}

public func pyreonFlowEdgeStrokeIsVisible<T>(_ stroke: PyreonFlowEdgeStroke, state: PyreonFlowState<T>) -> Bool {
    guard state.containerSize.width > 0, state.containerSize.height > 0, state.viewport.zoom > 0 else { return false }
    let xs = stroke.segments.flatMap { [$0.x, $0.c1x, $0.c2x, $0.cx].compactMap { $0 } }
    let ys = stroke.segments.flatMap { [$0.y, $0.c1y, $0.c2y, $0.cy].compactMap { $0 } }
    guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return false }
    let pad = max(stroke.width, stroke.interactionWidth) / 2 / state.viewport.zoom
    let left = -state.viewport.x / state.viewport.zoom, top = -state.viewport.y / state.viewport.zoom
    let right = left + state.containerSize.width / state.viewport.zoom, bottom = top + state.containerSize.height / state.viewport.zoom
    return maxX + pad > left && minX - pad < right && maxY + pad > top && minY - pad < bottom
}

/// A native SwiftUI host for `PyreonFlowState`: it measures its container,
/// draws edges and nodes under one viewport, and supplies selection, dragging,
/// panning, zooming, and accessibility without a web view.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonFlowView<T, NodeContent: View>: View {
    @Bindable private var state: PyreonFlowState<T>
    private let edgeColor: String
    private let edgeWidth: Double
    private let background: PyreonFlowBackgroundStyle?
    private let controls: PyreonFlowControlsStyle?
    private let miniMap: PyreonFlowMiniMapStyle?
    private let nodeContent: (PyreonFlowNode<T>, Bool, Bool) -> NodeContent

    @State private var nodeDragStart: [String: PyreonXYPosition] = [:]
    @State private var panStart: PyreonFlowViewport?
    @State private var selectionStart: PyreonXYPosition?
    @State private var selectionCurrent: PyreonXYPosition?
    @State private var zoomStart: Double?
    @State private var interactionsLocked = false
    @State private var connectionDraft: PyreonFlowConnectionDraft?
    @State private var reconnectDraft: PyreonFlowReconnectDraft?
    @State private var didInitialFit = false

    public init(
        state: PyreonFlowState<T>,
        edgeColor: String = "#999999",
        edgeWidth: Double = 1.5,
        background: PyreonFlowBackgroundStyle? = nil,
        controls: PyreonFlowControlsStyle? = nil,
        miniMap: PyreonFlowMiniMapStyle? = nil,
        @ViewBuilder nodeContent: @escaping (PyreonFlowNode<T>) -> NodeContent
    ) {
        self.state = state
        self.edgeColor = edgeColor
        self.edgeWidth = edgeWidth
        self.background = background
        self.controls = controls
        self.miniMap = miniMap
        self.nodeContent = { node, _, _ in nodeContent(node) }
    }

    public init(
        state: PyreonFlowState<T>,
        edgeColor: String = "#999999",
        edgeWidth: Double = 1.5,
        background: PyreonFlowBackgroundStyle? = nil,
        controls: PyreonFlowControlsStyle? = nil,
        miniMap: PyreonFlowMiniMapStyle? = nil,
        @ViewBuilder nodeContent: @escaping (PyreonFlowNode<T>, Bool, Bool) -> NodeContent
    ) {
        self.state = state
        self.edgeColor = edgeColor
        self.edgeWidth = edgeWidth
        self.background = background
        self.controls = controls
        self.miniMap = miniMap
        self.nodeContent = nodeContent
    }

    public var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Rectangle()
                    .fill(Color.clear)
                    .contentShape(Rectangle())
                    .gesture(panGesture)
                    .simultaneousGesture(zoomGesture)
                    .simultaneousGesture(doubleClickZoomGesture)
                    .simultaneousGesture(edgeTapGesture)

                if let background {
                    PyreonFlowBackground(style: background, viewport: state.viewport)
                        .equatable()
                }

                PyreonFlowEdgeCanvas(
                    edges: edgeStrokes,
                    viewport: state.viewport)
                    .equatable()
                    .allowsHitTesting(false)

                ZStack(alignment: .topLeading) {
                    ForEach(pyreonFlowEdgeLabels(state: state).filter { visibleEdgeIds.contains($0.id) }) { edge in
                        Text(edge.text ?? "")
                            .font(.system(size: 12))
                            .padding(edge.text == nil ? 8 : 3)
                            .background(edge.text == nil ? Color.clear : Color.white.opacity(0.9))
                            .position(x: edge.x, y: edge.y)
                            .contentShape(Rectangle())
                            .onTapGesture { state.selectEdge(edge.id); state.emitEdgeClick(edge.id) }
                            .accessibilityLabel(Text(edge.accessibilityLabel))
                            .accessibilityAddTraits(state.isEdgeSelected(edge.id) ? [.isSelected] : [])
                            .accessibilityAction {
                                state.selectEdge(edge.id)
                                state.emitEdgeClick(edge.id)
                            }
                            .accessibilityHidden(!edge.focusable)
                    }
                    ForEach(visibleNodes, id: \.id) { node in
                        let absolute = state.getAbsolutePosition(node.id)
                        nodeContent(node, state.isNodeSelected(node.id), nodeDragStart[node.id] != nil)
                            .frame(
                                width: node.width ?? pyreonFlowDefaultNodeWidth,
                                height: node.height ?? pyreonFlowDefaultNodeHeight)
                            .position(
                                x: absolute.x + (node.width ?? pyreonFlowDefaultNodeWidth) / 2,
                                y: absolute.y + (node.height ?? pyreonFlowDefaultNodeHeight) / 2)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if node.selectable ?? state.nodesSelectable { state.selectNode(node.id) }
                                state.emitNodeClick(node.id)
                            }
                            .onTapGesture(count: 2) { state.emitNodeDoubleClick(node.id) }
                            .gesture(nodeDragGesture(node))
                            .accessibilityLabel(Text(node.ariaLabel ?? node.id))
                            .accessibilityAddTraits(state.isNodeSelected(node.id) ? [.isSelected] : [])
                            .accessibilityAction {
                                if node.selectable ?? state.nodesSelectable {
                                    state.selectNode(node.id)
                                    state.emitNodeClick(node.id)
                                }
                            }
                            .accessibilityHidden(state.disableKeyboardA11y || !(node.focusable ?? state.nodesFocusable))
                    }
                    ForEach(Array(interactiveHandles.enumerated()), id: \.offset) { _, handle in
                        SwiftUI.Circle()
                            .fill(handle.type == "source" ? Color.blue : Color.green)
                            .overlay(SwiftUI.Circle().stroke(Color.white, lineWidth: 1))
                            .frame(width: 12 / state.viewport.zoom, height: 12 / state.viewport.zoom)
                            .position(x: handle.x, y: handle.y)
                            .contentShape(SwiftUI.Circle())
                            .gesture(handle.type == "source" ? connectionGesture(handle) : nil)
                            .accessibilityLabel(Text("\(handle.type) handle \(handle.handleId ?? "default")"))
                            .accessibilityHidden(state.disableKeyboardA11y)
                    }
                    ForEach(pyreonFlowEdgeUpdaters(state: state, strokes: edgeStrokes)) { updater in
                        SwiftUI.Circle()
                            .fill(Color.blue.opacity(0.35))
                            .overlay(SwiftUI.Circle().stroke(Color.blue, lineWidth: 1.5 / state.viewport.zoom))
                            .frame(width: 12 / state.viewport.zoom, height: 12 / state.viewport.zoom)
                            .position(x: updater.x, y: updater.y)
                            .contentShape(SwiftUI.Circle())
                            .gesture(reconnectGesture(updater))
                            .accessibilityLabel(Text("Reconnect \(updater.end) of edge \(updater.edgeId)"))
                            .accessibilityHidden(state.disableKeyboardA11y)
                    }
                }
                .scaleEffect(state.viewport.zoom, anchor: .topLeading)
                .offset(x: state.viewport.x, y: state.viewport.y)

                if let start = selectionStart, let current = selectionCurrent {
                    let x1 = start.x * state.zoom + state.viewport.x, y1 = start.y * state.zoom + state.viewport.y
                    let x2 = current.x * state.zoom + state.viewport.x, y2 = current.y * state.zoom + state.viewport.y
                    Rectangle()
                        .fill(Color.blue.opacity(0.10))
                        .overlay(Rectangle().stroke(Color.blue.opacity(0.8), lineWidth: 1))
                        .frame(width: abs(x2 - x1), height: abs(y2 - y1))
                        .position(x: (x1 + x2) / 2, y: (y1 + y2) / 2)
                        .allowsHitTesting(false)
                }

                if let controls {
                    PyreonFlowControls(state: state, style: controls, locked: $interactionsLocked)
                }
                if let miniMap {
                    PyreonFlowMiniMap(state: state, style: miniMap)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .padding(10)
                }
            }
            .clipped()
            .coordinateSpace(name: "PyreonFlowCanvas")
            .onAppear { updateContainer(proxy.size); fitInitiallyIfNeeded() }
            .onChange(of: proxy.size) { _, size in
                updateContainer(size)
                fitInitiallyIfNeeded()
            }
        }
    }

    private var interactiveHandles: [PyreonFlowInteractiveHandle] {
        visibleNodes.flatMap { node -> [PyreonFlowInteractiveHandle] in
            guard node.hidden != true, node.connectable ?? state.nodesConnectable else { return [] }
            let p = state.getAbsolutePosition(node.id)
            let box = PyreonFlowRect(x: p.x, y: p.y, width: node.width ?? pyreonFlowDefaultNodeWidth, height: node.height ?? pyreonFlowDefaultNodeHeight)
            return pyreonFlowInteractiveHandles(nodeId: node.id, node: box, handles: node.sourceHandles + node.targetHandles)
        }
    }

    private var edgeStrokes: [PyreonFlowEdgeStroke] {
        var strokes = pyreonFlowEdgeStrokes(state: state, color: edgeColor, width: edgeWidth)
        if state.onlyRenderVisibleElements { strokes = strokes.filter { pyreonFlowEdgeStrokeIsVisible($0, state: state) } }
        if let draft = connectionDraft {
            strokes.append(PyreonFlowEdgeStroke(id: "__connection-preview", segments: pyreonFlowConnectionPreview(type: state.connectionLineType, source: draft.source, target: draft.current), color: edgeColor, width: edgeWidth))
        }
        if let draft = reconnectDraft {
            strokes.append(PyreonFlowEdgeStroke(id: "__reconnect-preview", segments: [
                .move(draft.fixed.x, draft.fixed.y), .line(draft.current.x, draft.current.y),
            ], color: edgeColor, width: edgeWidth))
        }
        return strokes
    }

    private var visibleNodes: [PyreonFlowNode<T>] {
        state.nodes.filter { $0.hidden != true && (!state.onlyRenderVisibleElements || state.isNodeVisible($0.id)) }
    }

    private var visibleEdgeIds: Set<String> { Set(edgeStrokes.map(\.id)) }

    private func graphPoint(_ point: CGPoint) -> PyreonXYPosition {
        PyreonXYPosition(x: (point.x - state.viewport.x) / state.viewport.zoom, y: (point.y - state.viewport.y) / state.viewport.zoom)
    }

    private func connectionGesture(_ source: PyreonFlowInteractiveHandle) -> AnyGesture<DragGesture.Value>? {
        guard !interactionsLocked else { return nil }
        return AnyGesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("PyreonFlowCanvas"))
            .onChanged { value in
                if connectionDraft == nil { state.emitConnectStart(nodeId: source.nodeId, handleId: source.handleId) }
                connectionDraft = PyreonFlowConnectionDraft(source: source, current: graphPoint(value.location))
            }
            .onEnded { value in
                let point = graphPoint(value.location)
                var completed: PyreonFlowConnection?
                if let target = pyreonNearestFlowHandle(interactiveHandles, point: point, type: "target", radius: (6 + state.connectionRadius) / state.viewport.zoom) {
                    let connection = PyreonFlowConnection(source: source.nodeId, target: target.nodeId, sourceHandle: source.handleId, targetHandle: target.handleId)
                    if state.connect(connection) != nil { completed = connection }
                }
                state.emitConnectEnd(completed)
                connectionDraft = nil
            })
    }

    private func reconnectGesture(_ updater: PyreonFlowEdgeUpdater) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .named("PyreonFlowCanvas"))
            .onChanged { value in
                guard !interactionsLocked,
                      let stroke = edgeStrokes.first(where: { $0.id == updater.edgeId }),
                      let first = stroke.segments.first, let last = stroke.segments.last
                else { return }
                let fixed = updater.end == "target"
                    ? PyreonXYPosition(x: first.x, y: first.y)
                    : PyreonXYPosition(x: last.x, y: last.y)
                reconnectDraft = PyreonFlowReconnectDraft(updater: updater, fixed: fixed, current: graphPoint(value.location))
            }
            .onEnded { value in
                defer { reconnectDraft = nil }
                guard !interactionsLocked, let edge = state.getEdge(updater.edgeId) else { return }
                let movingTarget = updater.end == "target"
                let fixedNodeId = movingTarget ? edge.source : edge.target
                guard let handle = pyreonNearestFlowHandle(
                    interactiveHandles.filter { $0.nodeId != fixedNodeId },
                    point: graphPoint(value.location),
                    type: movingTarget ? "target" : "source",
                    radius: (6 + state.connectionRadius) / state.viewport.zoom)
                else { return }
                guard let connection = pyreonFlowReconnectConnection(edge: edge, end: updater.end, handle: handle) else { return }
                _ = state.reconnectEdge(edge.id, connection: connection)
            }
    }

    private func updateContainer(_ size: CGSize) {
        state.containerSize = PyreonFlowContainerSize(width: size.width, height: size.height)
    }

    private func fitInitiallyIfNeeded() {
        guard state.fitViewOnLoad, !didInitialFit, state.containerSize.width > 0, state.containerSize.height > 0 else { return }
        didInitialFit = true
        state.fitView(padding: state.fitViewPadding)
    }

    private func nodeDragGesture(_ node: PyreonFlowNode<T>) -> some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .global)
            .onChanged { value in
                guard !interactionsLocked, node.draggable ?? state.nodesDraggable else { return }
                if nodeDragStart.isEmpty {
                    state.pushHistory()
                    for id in pyreonFlowDragNodeIds(state: state, draggedNodeId: node.id) {
                        if let position = state.getNode(id)?.position { nodeDragStart[id] = position }
                    }
                    state.emitNodeDragStart(node.id)
                }
                guard let primaryStart = nodeDragStart[node.id] else { return }
                let rawPrimary = PyreonXYPosition(
                    x: primaryStart.x + value.translation.width / state.viewport.zoom,
                    y: primaryStart.y + value.translation.height / state.viewport.zoom)
                let snappedPrimary = state.snappedNodePosition(node.id, rawPrimary, excluding: Set(nodeDragStart.keys))
                let dx = snappedPrimary.x - primaryStart.x
                let dy = snappedPrimary.y - primaryStart.y
                for (id, start) in nodeDragStart {
                    state.updateNodePosition(
                        id,
                        PyreonXYPosition(
                            x: start.x + dx,
                            y: start.y + dy))
                }
                state.emitNodeDrag(node.id)
            }
            .onEnded { _ in
                if !nodeDragStart.isEmpty { state.emitNodeDragEnd(node.id) }
                nodeDragStart.removeAll(keepingCapacity: true)
            }
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                guard !interactionsLocked else { return }
                if state.selectionOnDrag && state.multiSelect {
                    if selectionStart == nil { selectionStart = graphPoint(value.startLocation) }
                    selectionCurrent = graphPoint(value.location)
                    return
                }
                guard state.pannable, state.panOnDrag else { return }
                let start = panStart ?? state.viewport
                if panStart == nil { panStart = start }
                state.setViewport(
                    x: start.x + value.translation.width,
                    y: start.y + value.translation.height)
            }
            .onEnded { _ in
                if let start = selectionStart, let current = selectionCurrent {
                    state.selectNodes(state.nodesInSelection(from: start, to: current))
                }
                selectionStart = nil; selectionCurrent = nil; panStart = nil
            }
    }

    private var edgeTapGesture: some Gesture {
        SpatialTapGesture(coordinateSpace: .named("PyreonFlowCanvas")).onEnded { value in
            let point = graphPoint(value.location)
            if let edge = pyreonNearestFlowEdge(edgeStrokes.filter { $0.id != "__connection-preview" }, point: point, zoom: state.viewport.zoom) {
                state.selectEdge(edge.id)
                state.emitEdgeClick(edge.id)
            } else {
                state.emitPaneClick(graphPoint(value.location))
            }
        }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { scale in
                guard !interactionsLocked, state.zoomable, state.zoomOnPinch else { return }
                let start = zoomStart ?? state.viewport.zoom
                if zoomStart == nil { zoomStart = start }
                state.zoomTo(start * scale)
            }
            .onEnded { _ in zoomStart = nil }
    }
    private var doubleClickZoomGesture: some Gesture {
        SpatialTapGesture(count: 2, coordinateSpace: .named("PyreonFlowCanvas")).onEnded { value in
            guard !interactionsLocked, state.zoomable, state.zoomOnDoubleClick else { return }
            let point = graphPoint(value.location)
            state.zoomTo(state.zoom * 1.2)
            let next = state.zoom
            state.setViewport(x: value.location.x - point.x * next, y: value.location.y - point.y * next, zoom: next)
        }
    }
}
