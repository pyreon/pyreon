import SwiftUI

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
            waypoints: edge.waypoints)
        return PyreonFlowEdgeStroke(id: edge.id, segments: path.segments, color: color, width: width)
    }
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
    private let nodeContent: (PyreonFlowNode<T>) -> NodeContent

    @State private var nodeDragStart: [String: PyreonXYPosition] = [:]
    @State private var panStart: PyreonFlowViewport?
    @State private var zoomStart: Double?

    public init(
        state: PyreonFlowState<T>,
        edgeColor: String = "#999999",
        edgeWidth: Double = 1.5,
        background: PyreonFlowBackgroundStyle? = nil,
        @ViewBuilder nodeContent: @escaping (PyreonFlowNode<T>) -> NodeContent
    ) {
        self.state = state
        self.edgeColor = edgeColor
        self.edgeWidth = edgeWidth
        self.background = background
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

                if let background {
                    PyreonFlowBackground(style: background, viewport: state.viewport)
                        .equatable()
                }

                PyreonFlowEdgeCanvas(
                    edges: pyreonFlowEdgeStrokes(state: state, color: edgeColor, width: edgeWidth),
                    viewport: state.viewport)
                    .equatable()
                    .allowsHitTesting(false)

                ZStack(alignment: .topLeading) {
                    ForEach(state.nodes.filter { $0.hidden != true }, id: \.id) { node in
                        let absolute = state.getAbsolutePosition(node.id)
                        nodeContent(node)
                            .frame(
                                width: node.width ?? pyreonFlowDefaultNodeWidth,
                                height: node.height ?? pyreonFlowDefaultNodeHeight)
                            .position(
                                x: absolute.x + (node.width ?? pyreonFlowDefaultNodeWidth) / 2,
                                y: absolute.y + (node.height ?? pyreonFlowDefaultNodeHeight) / 2)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if node.selectable != false { state.selectNode(node.id) }
                            }
                            .gesture(nodeDragGesture(node))
                            .accessibilityLabel(Text(node.ariaLabel ?? node.id))
                            .accessibilityAddTraits(state.isNodeSelected(node.id) ? [.isSelected] : [])
                            .accessibilityHidden(node.focusable == false)
                    }
                }
                .scaleEffect(state.viewport.zoom, anchor: .topLeading)
                .offset(x: state.viewport.x, y: state.viewport.y)
            }
            .clipped()
            .onAppear { updateContainer(proxy.size) }
            .onChange(of: proxy.size) { _, size in updateContainer(size) }
        }
    }

    private func updateContainer(_ size: CGSize) {
        state.containerSize = PyreonFlowContainerSize(width: size.width, height: size.height)
    }

    private func nodeDragGesture(_ node: PyreonFlowNode<T>) -> some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .global)
            .onChanged { value in
                guard node.draggable != false else { return }
                let start = nodeDragStart[node.id] ?? node.position
                if nodeDragStart[node.id] == nil { nodeDragStart[node.id] = start }
                state.updateNodePosition(
                    node.id,
                    PyreonXYPosition(
                        x: start.x + value.translation.width / state.viewport.zoom,
                        y: start.y + value.translation.height / state.viewport.zoom))
            }
            .onEnded { _ in nodeDragStart[node.id] = nil }
    }

    private var panGesture: some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                let start = panStart ?? state.viewport
                if panStart == nil { panStart = start }
                state.setViewport(
                    x: start.x + value.translation.width,
                    y: start.y + value.translation.height)
            }
            .onEnded { _ in panStart = nil }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { scale in
                let start = zoomStart ?? state.viewport.zoom
                if zoomStart == nil { zoomStart = start }
                state.zoomTo(start * scale)
            }
            .onEnded { _ in zoomStart = nil }
    }
}
