import SwiftUI

/// The colour tokens the web renderer exposes as `--pyreon-flow-*` variables,
/// resolved per colour mode. `light` mirrors the web's fallback values and
/// `dark` its `[data-color-mode="dark"]` block, so a `<Flow colorMode>` paints
/// the same surfaces on every target. Every hex value here is the web's.
public struct PyreonFlowPalette: Equatable {
    public var canvasBackground: String?
    public var nodeBackground: String
    public var nodeColor: String
    public var nodeBorder: String
    public var nodeSelected: String
    public var edge: String
    public var edgeLabel: String
    public var accent: String
    public var handleBackground: String
    public var handleBorder: String
    public var panelBackground: String
    public var panelBorder: String
    public var controlColor: String
    public var minimapNode: String
    public var backgroundPattern: String
    public var resizerBackground: String

    public static let light = PyreonFlowPalette(
        canvasBackground: nil, nodeBackground: "#ffffff", nodeColor: "#1a192b", nodeBorder: "#dddddd",
        nodeSelected: "#3b82f6", edge: "#999999", edgeLabel: "#666666", accent: "#3b82f6",
        handleBackground: "#555555", handleBorder: "#ffffff", panelBackground: "#ffffff", panelBorder: "#dddddd",
        controlColor: "#555555", minimapNode: "#e2e8f0", backgroundPattern: "#dddddd", resizerBackground: "#ffffff")
    public static let dark = PyreonFlowPalette(
        canvasBackground: "#0b1220", nodeBackground: "#1f2937", nodeColor: "#f3f4f6", nodeBorder: "#374151",
        nodeSelected: "#60a5fa", edge: "#6b7280", edgeLabel: "#9ca3af", accent: "#60a5fa",
        handleBackground: "#374151", handleBorder: "#6b7280", panelBackground: "#111827", panelBorder: "#374151",
        controlColor: "#e5e7eb", minimapNode: "#374151", backgroundPattern: "#374151", resizerBackground: "#60a5fa")

    /// `"dark"` / `"light"` force a palette; anything else (`"system"`) follows
    /// the scheme the view resolves from its environment — the web's
    /// `prefers-color-scheme` branch.
    public static func resolve(colorMode: String, systemScheme: ColorScheme) -> PyreonFlowPalette {
        if colorMode == "dark" { return .dark }
        if colorMode == "light" { return .light }
        return systemScheme == .dark ? .dark : .light
    }

    public static func scheme(colorMode: String, systemScheme: ColorScheme) -> ColorScheme {
        colorMode == "dark" ? .dark : colorMode == "light" ? .light : systemScheme
    }

    var canvasBackgroundColor: Color { canvasBackground.map(pyreonFlowEdgeColor) ?? Color.clear }
}

private struct PyreonFlowPaletteKey: EnvironmentKey {
    static let defaultValue = PyreonFlowPalette.light
}

extension EnvironmentValues {
    /// The palette the nearest `PyreonFlowView` (or `pyreonFlowColorMode`) resolved.
    public var pyreonFlowPalette: PyreonFlowPalette {
        get { self[PyreonFlowPaletteKey.self] }
        set { self[PyreonFlowPaletteKey.self] = newValue }
    }
}

private struct PyreonFlowColorModeModifier: ViewModifier {
    let colorMode: String
    @Environment(\.colorScheme) private var systemScheme
    func body(content: Content) -> some View {
        content
            .environment(\.colorScheme, PyreonFlowPalette.scheme(colorMode: colorMode, systemScheme: systemScheme))
            .environment(\.pyreonFlowPalette, PyreonFlowPalette.resolve(colorMode: colorMode, systemScheme: systemScheme))
    }
}

extension View {
    /// Scopes a `<Flow colorMode>` to THIS subtree — the flow canvas and the
    /// `<Panel>` overlays the compiler stacks beside it — the way the web's
    /// `data-color-mode` attribute scopes its tokens to the `.pyreon-flow`
    /// container. `.preferredColorScheme` would instead re-theme the whole
    /// window, which is not what the web does.
    public func pyreonFlowColorMode(_ colorMode: String) -> some View {
        modifier(PyreonFlowColorModeModifier(colorMode: colorMode))
    }
}

public struct PyreonFlowMiniMapNode: Equatable {
    public var id: String; public var x: Double; public var y: Double; public var width: Double; public var height: Double
}

private struct PyreonFlowNodeInlineStyleModifier: ViewModifier {
    let style: PyreonFlowNodeInlineStyle
    func body(content: Content) -> some View {
        content
            .padding(CGFloat(style.padding))
            .background(RoundedRectangle(cornerRadius: CGFloat(style.borderRadius)).fill(style.backgroundColor.map(pyreonFlowEdgeColor) ?? Color.clear))
            .overlay(RoundedRectangle(cornerRadius: CGFloat(style.borderRadius)).stroke(style.borderColor.map(pyreonFlowEdgeColor) ?? Color.clear, lineWidth: CGFloat(style.borderWidth)))
            .opacity(style.opacity)
    }
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

public struct PyreonFlowCustomEdgeContext: Identifiable {
    public var id: String { edge.id }
    public var edge: PyreonFlowEdge
    public var sourceX: Double; public var sourceY: Double
    public var targetX: Double; public var targetY: Double
    public var sourcePosition: PyreonFlowPosition; public var targetPosition: PyreonFlowPosition
    public var selected: Bool
    public var labelX: Double; public var labelY: Double
}

public struct PyreonFlowConnectionLineContext {
    public var sourceX: Double; public var sourceY: Double
    public var targetX: Double; public var targetY: Double
    public var sourcePosition: PyreonFlowPosition
    public var path: PyreonFlowPathResult
}

private struct PyreonFlowEdgeLabelPointKey: EnvironmentKey {
    static let defaultValue = CGPoint.zero
}
private extension EnvironmentValues {
    var pyreonFlowEdgeLabelPoint: CGPoint {
        get { self[PyreonFlowEdgeLabelPointKey.self] }
        set { self[PyreonFlowEdgeLabelPointKey.self] = newValue }
    }
}
public struct PyreonFlowEdgeLabelRenderer<Content: View>: View {
    @Environment(\.pyreonFlowEdgeLabelPoint) private var point
    private let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }
    public var body: some View { content.position(x: point.x, y: point.y) }
}

private func pyreonFlowSegmentPosition(_ segments: [PyreonFlowEdgeSegment], atStart: Bool) -> PyreonFlowPosition {
    guard let first = segments.first, let last = segments.last else { return atStart ? .right : .left }
    let anchorX = atStart ? first.x : last.x, anchorY = atStart ? first.y : last.y
    let probeX: Double, probeY: Double
    if atStart, segments.count > 1 {
        let next = segments[1]; probeX = next.c1x ?? next.cx ?? next.x; probeY = next.c1y ?? next.cy ?? next.y
    } else if !atStart, let end = segments.last {
        let previous = segments.count > 1 ? segments[segments.count - 2] : first
        probeX = end.c2x ?? end.cx ?? previous.x; probeY = end.c2y ?? end.cy ?? previous.y
    } else { probeX = last.x; probeY = last.y }
    let dx = atStart ? probeX - anchorX : anchorX - probeX
    let dy = atStart ? probeY - anchorY : anchorY - probeY
    if abs(dx) >= abs(dy) { return dx >= 0 ? .right : .left }
    return dy >= 0 ? .bottom : .top
}
public struct PyreonFlowMiniMapLayout: Equatable {
    public var nodes: [PyreonFlowMiniMapNode]
    public var viewport: PyreonFlowRect
    public var scale: Double
    public var minX: Double
    public var minY: Double
}

public struct PyreonFlowMiniMapStyle: Equatable {
    /// `nil` follows the palette's `minimapNode` (light `#e2e8f0`).
    public var nodeColor: String?; public var maskColor: String; public var width: Double; public var height: Double; public var pannable: Bool; public var zoomable: Bool
    public init(nodeColor: String? = nil, maskColor: String = "#000000", width: Double = 200, height: Double = 150, pannable: Bool = true, zoomable: Bool = true) {
        self.nodeColor = nodeColor; self.maskColor = maskColor; self.width = width; self.height = height; self.pannable = pannable; self.zoomable = zoomable
    }
}

public struct PyreonFlowNodeResizerConfig: Equatable {
    public var minWidth: Double; public var minHeight: Double; public var handleSize: Double; public var showEdgeHandles: Bool
    public init(minWidth: Double = 50, minHeight: Double = 30, handleSize: Double = 8, showEdgeHandles: Bool = false) {
        self.minWidth = max(0, minWidth); self.minHeight = max(0, minHeight); self.handleSize = max(1, handleSize); self.showEdgeHandles = showEdgeHandles
    }
    public var directions: [String] { showEdgeHandles ? ["nw", "ne", "sw", "se", "n", "s", "e", "w"] : ["nw", "ne", "sw", "se"] }
}

public struct PyreonFlowNodeToolbarConfig: Equatable {
    public var position: String; public var align: String; public var offset: Double; public var showOnSelect: Bool; public var selectedOverride: Bool?; public var nodeIdOverride: String?
    public init(position: String = "top", align: String = "center", offset: Double = 8, showOnSelect: Bool = true, selectedOverride: Bool? = false, nodeIdOverride: String? = nil) {
        self.position = position; self.align = align; self.offset = offset; self.showOnSelect = showOnSelect; self.selectedOverride = selectedOverride; self.nodeIdOverride = nodeIdOverride
    }
}

public struct PyreonFlowNodeToolbarPlacement: Equatable {
    public var x: Double; public var y: Double; public var anchorX: Double; public var anchorY: Double
    public init(x: Double, y: Double, anchorX: Double, anchorY: Double) {
        self.x = x; self.y = y; self.anchorX = anchorX; self.anchorY = anchorY
    }
}

/// Screen-space toolbar anchor matching the web portal layer. Keeping this
/// outside SwiftUI makes pan/zoom/nesting semantics executable in the co-source
/// gate and gives the Compose host the same four-side placement contract.
public func pyreonFlowNodeToolbarPlacement(node: PyreonFlowRect, viewport: PyreonFlowViewport, config: PyreonFlowNodeToolbarConfig = PyreonFlowNodeToolbarConfig()) -> PyreonFlowNodeToolbarPlacement {
    let factor = config.align == "start" ? 0 : config.align == "end" ? 1 : 0.5
    let sx = node.x * viewport.zoom + viewport.x, sy = node.y * viewport.zoom + viewport.y
    let width = node.width * viewport.zoom, height = node.height * viewport.zoom
    switch config.position {
    case "bottom": return PyreonFlowNodeToolbarPlacement(x: sx + width * factor, y: sy + height + config.offset, anchorX: factor, anchorY: 0)
    case "left": return PyreonFlowNodeToolbarPlacement(x: sx - config.offset, y: sy + height * factor, anchorX: 1, anchorY: factor)
    case "right": return PyreonFlowNodeToolbarPlacement(x: sx + width + config.offset, y: sy + height * factor, anchorX: 0, anchorY: factor)
    default: return PyreonFlowNodeToolbarPlacement(x: sx + width * factor, y: sy - config.offset, anchorX: factor, anchorY: 1)
    }
}

public struct PyreonFlowResizeFrame: Equatable {
    public var position: PyreonXYPosition; public var width: Double; public var height: Double
    public init(position: PyreonXYPosition, width: Double, height: Double) { self.position = position; self.width = width; self.height = height }
}

public func pyreonFlowResizeFrame(_ start: PyreonFlowResizeFrame, direction: String, dx: Double, dy: Double, minWidth: Double = 50, minHeight: Double = 30) -> PyreonFlowResizeFrame {
    var width = start.width, height = start.height, x = start.position.x, y = start.position.y
    if direction.contains("e") { width = max(minWidth, start.width + dx) }
    if direction.contains("w") { width = max(minWidth, start.width - dx); x = start.position.x + start.width - width }
    if direction.contains("s") { height = max(minHeight, start.height + dy) }
    if direction.contains("n") { height = max(minHeight, start.height - dy); y = start.position.y + start.height - height }
    return PyreonFlowResizeFrame(position: PyreonXYPosition(x: x, y: y), width: width, height: height)
}

/// Explicit node-model handles win per endpoint type. Handles extracted from
/// a custom `<Handle>` renderer fill only a missing source/target side, so a
/// shared component and an explicit model config never produce duplicate dots.
public func pyreonFlowEffectiveHandles<T>(_ node: PyreonFlowNode<T>, _ rendered: [PyreonFlowHandleConfig]) -> [PyreonFlowHandleConfig] {
    var result = node.sourceHandles + node.targetHandles
    if node.sourceHandles.isEmpty { result.append(contentsOf: rendered.filter { $0.type == "source" }) }
    if node.targetHandles.isEmpty { result.append(contentsOf: rendered.filter { $0.type == "target" }) }
    return result
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
private struct PyreonFlowResizeDraft: Equatable {
    var frame: PyreonFlowResizeFrame
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
    private let nodeColor: (PyreonFlowNode<T>) -> String
    @State private var panStart: PyreonFlowViewport?
    @State private var zoomStart: (zoom: Double, centerX: Double, centerY: Double)?
    @Environment(\.pyreonFlowPalette) private var palette
    public init(state: PyreonFlowState<T>, style: PyreonFlowMiniMapStyle = PyreonFlowMiniMapStyle(), nodeColor: @escaping (PyreonFlowNode<T>) -> String = { _ in "" }) {
        self.state = state; self.style = style; self.nodeColor = nodeColor
    }
    public var body: some View {
        let layout = pyreonFlowMiniMapLayout(state: state, width: style.width, height: style.height)
        Canvas { context, _ in
            let nodesById = Dictionary(uniqueKeysWithValues: state.nodes.map { ($0.id, $0) })
            for node in layout.nodes {
                let resolved = nodesById[node.id].map(nodeColor) ?? ""
                context.fill(Path(CGRect(x: node.x, y: node.y, width: node.width, height: node.height)), with: .color(pyreonFlowEdgeColor(resolved.isEmpty ? (style.nodeColor ?? palette.minimapNode) : resolved)))
            }
            let viewport = layout.viewport
            context.stroke(Path(CGRect(x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height)), with: .color(pyreonFlowEdgeColor(style.maskColor)), lineWidth: 1)
        }
        .frame(width: style.width, height: style.height)
        .background(pyreonFlowEdgeColor(palette.panelBackground).opacity(0.92))
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(pyreonFlowEdgeColor(palette.panelBorder)))
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

public enum PyreonFlowBackgroundVariant: Equatable {
    case dots, lines, cross
    public static func from(_ value: String) -> Self {
        value == "lines" ? .lines : value == "cross" ? .cross : .dots
    }
}

public struct PyreonFlowBackgroundStyle: Equatable {
    public var variant: PyreonFlowBackgroundVariant
    public var gap: Double
    public var size: Double
    /// `nil` follows the palette's `backgroundPattern` (light `#dddddd`).
    public var color: String?
    public init(variant: PyreonFlowBackgroundVariant = .dots, gap: Double = 20, size: Double = 1, color: String? = nil) {
        self.variant = variant; self.gap = gap; self.size = size; self.color = color
    }
}

public enum PyreonFlowControlsPosition: Equatable {
    case topLeft, topRight, bottomLeft, bottomRight
    public static func from(_ value: String) -> Self {
        switch value {
        case "top-left": return .topLeft
        case "top-right": return .topRight
        case "bottom-right": return .bottomRight
        default: return .bottomLeft
        }
    }
}

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
    private let extraContent: () -> AnyView?
    public init(state: PyreonFlowState<T>, style: PyreonFlowControlsStyle, locked: Binding<Bool>, extraContent: @escaping () -> AnyView? = { nil }) {
        self.state = state; self.style = style; self._locked = locked; self.extraContent = extraContent
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
            if let extra = extraContent() { extra }
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

/// Controls rendered independently from `PyreonFlowView`, mirroring the web
/// `<Controls instance={flow}>` form while retaining local lock-button state.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonStandaloneFlowControls<T>: View {
    @Bindable private var state: PyreonFlowState<T>
    @State private var locked = false
    private let style: PyreonFlowControlsStyle
    private let extraContent: () -> AnyView?
    public init(state: PyreonFlowState<T>, style: PyreonFlowControlsStyle = .init(), extraContent: @escaping () -> AnyView? = { nil }) {
        self.state = state; self.style = style; self.extraContent = extraContent
    }
    public var body: some View {
        PyreonFlowControls(state: state, style: style, locked: $locked, extraContent: extraContent)
    }
}

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonFlowBackground: View, Equatable {
    public var style: PyreonFlowBackgroundStyle
    public var viewport: PyreonFlowViewport
    public var fallbackColor: String
    public init(style: PyreonFlowBackgroundStyle, viewport: PyreonFlowViewport, fallbackColor: String = PyreonFlowPalette.light.backgroundPattern) {
        self.style = style; self.viewport = viewport; self.fallbackColor = fallbackColor
    }
    public var body: some View {
        Canvas { context, size in
            let step = CGFloat(max(1, style.gap * viewport.zoom))
            let radius = CGFloat(max(0.5, style.size * viewport.zoom))
            let x0 = CGFloat(viewport.x).truncatingRemainder(dividingBy: step)
            let y0 = CGFloat(viewport.y).truncatingRemainder(dividingBy: step)
            let color = pyreonFlowEdgeColor(style.color ?? fallbackColor)
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
    width: Double = 1.5,
    nodeHandles: (PyreonFlowNode<T>) -> [PyreonFlowHandleConfig] = { _ in [] }
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
        let sourceDimensions = state.getNodeDimensions(source.id)
        let targetDimensions = state.getNodeDimensions(target.id)
        let path = pyreonComputeEdgePath(
            type: edge.type ?? "bezier",
            source: PyreonFlowRect(
                x: sourcePosition.x,
                y: sourcePosition.y,
                width: sourceDimensions.width,
                height: sourceDimensions.height),
            target: PyreonFlowRect(
                x: targetPosition.x,
                y: targetPosition.y,
                width: targetDimensions.width,
                height: targetDimensions.height),
            sourceHandleId: edge.sourceHandle,
            targetHandleId: edge.targetHandle,
            sourceHandles: pyreonFlowEffectiveHandles(source, nodeHandles(source)),
            targetHandles: pyreonFlowEffectiveHandles(target, nodeHandles(target)),
            sourceMeasurement: state.measurements[source.id],
            targetMeasurement: state.measurements[target.id],
            waypoints: edge.waypoints,
            borderRadius: edge.borderRadius ?? 5,
            offset: edge.pathOffset ?? 20,
            curvature: edge.curvature ?? 0.25)
        let markers = state.resolvedMarkers(edge)
        let resolvedColor = pyreonFlowStyleValue(edge.style, "stroke") ?? color
        let resolvedWidth = pyreonFlowStyleNumber(edge.style, "stroke-width") ?? width
        return PyreonFlowEdgeStroke(
            id: edge.id, segments: path.segments, color: resolvedColor, width: resolvedWidth,
            dash: edge.animated ? [5, 5] : nil,
            startMarker: markers.start.flatMap { pyreonFlowMarkerGlyph($0, segments: path.segments, atStart: true, edgeColor: resolvedColor) },
            endMarker: markers.end.flatMap { pyreonFlowMarkerGlyph($0, segments: path.segments, atStart: false, edgeColor: resolvedColor) },
            interactionWidth: edge.interactionWidth ?? state.edgeInteractionWidth)
    }
}

@available(iOS 17.0, macOS 14.0, *)
public func pyreonFlowEdgeLabels<T>(state: PyreonFlowState<T>, nodeHandles: (PyreonFlowNode<T>) -> [PyreonFlowHandleConfig] = { _ in [] }) -> [PyreonFlowEdgeLabel] {
    let nodes = Dictionary(uniqueKeysWithValues: state.nodes.filter { $0.hidden != true }.map { ($0.id, $0) })
    return state.edges.compactMap { edge in
        guard edge.hidden != true, let source = nodes[edge.source], let target = nodes[edge.target] else { return nil }
        let sp = state.getAbsolutePosition(source.id), tp = state.getAbsolutePosition(target.id)
        let sd = state.getNodeDimensions(source.id), td = state.getNodeDimensions(target.id)
        let path = pyreonComputeEdgePath(
            type: edge.type ?? "bezier",
            source: PyreonFlowRect(x: sp.x, y: sp.y, width: sd.width, height: sd.height),
            target: PyreonFlowRect(x: tp.x, y: tp.y, width: td.width, height: td.height),
            sourceHandleId: edge.sourceHandle, targetHandleId: edge.targetHandle,
            sourceHandles: pyreonFlowEffectiveHandles(source, nodeHandles(source)), targetHandles: pyreonFlowEffectiveHandles(target, nodeHandles(target)),
            sourceMeasurement: state.measurements[source.id], targetMeasurement: state.measurements[target.id],
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

private struct PyreonFlowNodeSizePreference: PreferenceKey {
    static var defaultValue: [String: CGSize] = [:]
    static func reduce(value: inout [String: CGSize], nextValue: () -> [String: CGSize]) {
        value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
    }
}

@available(iOS 17.0, macOS 14.0, *)
private struct PyreonFlowToolbarPortal: View {
    let placement: PyreonFlowNodeToolbarPlacement
    let content: AnyView
    @State private var contentSize: CGSize = .zero
    var body: some View {
        content
            .padding(4)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.25), lineWidth: 1))
            .shadow(color: Color.black.opacity(0.1), radius: 4, y: 2)
            .fixedSize().background(GeometryReader { proxy in
            Color.clear.onAppear { contentSize = proxy.size }
                .onChange(of: proxy.size) { _, size in contentSize = size }
        }).position(
            x: placement.x + (0.5 - placement.anchorX) * contentSize.width,
            y: placement.y + (0.5 - placement.anchorY) * contentSize.height)
    }
}

/// A native SwiftUI host for `PyreonFlowState`: it measures its container,
/// draws edges and nodes under one viewport, and supplies selection, dragging,
/// panning, zooming, and accessibility without a web view.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonFlowView<T, NodeContent: View>: View {
    @Bindable private var state: PyreonFlowState<T>
    /// `nil` follows the palette's `edge` colour (light `#999999`).
    private let edgeColor: String?
    private let edgeWidth: Double
    private let background: PyreonFlowBackgroundStyle?
    private let controls: PyreonFlowControlsStyle?
    private let controlsContent: () -> AnyView?
    private let miniMap: PyreonFlowMiniMapStyle?
    private let miniMapNodeColor: (PyreonFlowNode<T>) -> String
    private let ariaLabel: String
    private let colorMode: String
    private let nodeHandles: (PyreonFlowNode<T>) -> [PyreonFlowHandleConfig]
    private let nodeResizer: (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig?
    private let nodeToolbarConfigs: (PyreonFlowNode<T>) -> [PyreonFlowNodeToolbarConfig]
    private let nodeToolbar: (PyreonFlowNode<T>, Int, Bool, Bool) -> AnyView?
    private let customEdgeTypes: Set<String>
    private let customEdge: (PyreonFlowCustomEdgeContext) -> AnyView?
    private let customConnectionLineEnabled: Bool
    private let customConnectionLine: (PyreonFlowConnectionLineContext) -> AnyView?
    private let nodeContent: (PyreonFlowNode<T>, Bool, Bool) -> NodeContent

    @State private var nodeDragStart: [String: PyreonXYPosition] = [:]
    @Environment(\.colorScheme) private var systemColorScheme
    private var palette: PyreonFlowPalette { PyreonFlowPalette.resolve(colorMode: colorMode, systemScheme: systemColorScheme) }
    private var resolvedEdgeColor: String { edgeColor ?? palette.edge }
    @State private var panStart: PyreonFlowViewport?
    @State private var selectionStart: PyreonXYPosition?
    @State private var selectionCurrent: PyreonXYPosition?
    @State private var zoomStart: Double?
    @State private var interactionsLocked = false
    @State private var connectionDraft: PyreonFlowConnectionDraft?
    @State private var reconnectDraft: PyreonFlowReconnectDraft?
    @State private var resizeDrafts: [String: PyreonFlowResizeDraft] = [:]
    @State private var didInitialFit = false
    @FocusState private var focusedNodeId: String?
    /// The edge label holding keyboard focus. A tap sets it, as a node's does,
    /// because a SwiftUI `.focusable` view is not focused by a tap on its own.
    @FocusState private var focusedEdgeId: String?

    public init(
        state: PyreonFlowState<T>,
        edgeColor: String? = nil,
        edgeWidth: Double = 1.5,
        background: PyreonFlowBackgroundStyle? = nil,
        controls: PyreonFlowControlsStyle? = nil,
        controlsContent: @escaping () -> AnyView? = { nil },
        miniMap: PyreonFlowMiniMapStyle? = nil,
        miniMapNodeColor: @escaping (PyreonFlowNode<T>) -> String = { _ in "" },
        ariaLabel: String = "Flow diagram",
        colorMode: String = "light",
        nodeHandles: @escaping (PyreonFlowNode<T>) -> [PyreonFlowHandleConfig] = { _ in [] },
        nodeResizer: @escaping (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig? = { _ in nil },
        nodeToolbarConfigs: @escaping (PyreonFlowNode<T>) -> [PyreonFlowNodeToolbarConfig] = { _ in [] },
        nodeToolbar: @escaping (PyreonFlowNode<T>, Int, Bool, Bool) -> AnyView? = { _, _, _, _ in nil },
        customEdgeTypes: Set<String> = [],
        customEdge: @escaping (PyreonFlowCustomEdgeContext) -> AnyView? = { _ in nil },
        customConnectionLineEnabled: Bool = false,
        customConnectionLine: @escaping (PyreonFlowConnectionLineContext) -> AnyView? = { _ in nil },
        @ViewBuilder nodeContent: @escaping (PyreonFlowNode<T>) -> NodeContent
    ) {
        self.state = state
        self.edgeColor = edgeColor
        self.edgeWidth = edgeWidth
        self.background = background
        self.controls = controls
        self.controlsContent = controlsContent
        self.miniMap = miniMap
        self.miniMapNodeColor = miniMapNodeColor
        self.ariaLabel = ariaLabel
        self.colorMode = colorMode
        self.nodeHandles = nodeHandles
        self.nodeResizer = nodeResizer
        self.nodeToolbarConfigs = nodeToolbarConfigs
        self.nodeToolbar = nodeToolbar
        self.customEdgeTypes = customEdgeTypes
        self.customEdge = customEdge
        self.customConnectionLineEnabled = customConnectionLineEnabled
        self.customConnectionLine = customConnectionLine
        self.nodeContent = { node, _, _ in nodeContent(node) }
    }

    public init(
        state: PyreonFlowState<T>,
        edgeColor: String? = nil,
        edgeWidth: Double = 1.5,
        background: PyreonFlowBackgroundStyle? = nil,
        controls: PyreonFlowControlsStyle? = nil,
        controlsContent: @escaping () -> AnyView? = { nil },
        miniMap: PyreonFlowMiniMapStyle? = nil,
        miniMapNodeColor: @escaping (PyreonFlowNode<T>) -> String = { _ in "" },
        ariaLabel: String = "Flow diagram",
        colorMode: String = "light",
        nodeHandles: @escaping (PyreonFlowNode<T>) -> [PyreonFlowHandleConfig] = { _ in [] },
        nodeResizer: @escaping (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig? = { _ in nil },
        nodeToolbarConfigs: @escaping (PyreonFlowNode<T>) -> [PyreonFlowNodeToolbarConfig] = { _ in [] },
        nodeToolbar: @escaping (PyreonFlowNode<T>, Int, Bool, Bool) -> AnyView? = { _, _, _, _ in nil },
        customEdgeTypes: Set<String> = [],
        customEdge: @escaping (PyreonFlowCustomEdgeContext) -> AnyView? = { _ in nil },
        customConnectionLineEnabled: Bool = false,
        customConnectionLine: @escaping (PyreonFlowConnectionLineContext) -> AnyView? = { _ in nil },
        @ViewBuilder nodeContent: @escaping (PyreonFlowNode<T>, Bool, Bool) -> NodeContent
    ) {
        self.state = state
        self.edgeColor = edgeColor
        self.edgeWidth = edgeWidth
        self.background = background
        self.controls = controls
        self.controlsContent = controlsContent
        self.miniMap = miniMap
        self.miniMapNodeColor = miniMapNodeColor
        self.ariaLabel = ariaLabel
        self.colorMode = colorMode
        self.nodeHandles = nodeHandles
        self.nodeResizer = nodeResizer
        self.nodeToolbarConfigs = nodeToolbarConfigs
        self.nodeToolbar = nodeToolbar
        self.customEdgeTypes = customEdgeTypes
        self.customEdge = customEdge
        self.customConnectionLineEnabled = customConnectionLineEnabled
        self.customConnectionLine = customConnectionLine
        self.nodeContent = nodeContent
    }

    public var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Rectangle()
                    .fill(palette.canvasBackgroundColor)
                    .contentShape(Rectangle())
                    .gesture(panGesture)
                    .simultaneousGesture(doubleClickZoomGesture)
                    .simultaneousGesture(edgeTapGesture)

                if let background {
                    PyreonFlowBackground(style: background, viewport: state.viewport, fallbackColor: palette.backgroundPattern)
                        .equatable()
                }

                PyreonFlowEdgeCanvas(
                    edges: edgeStrokes.filter { stroke in
                        if stroke.id == "__connection-preview" && customConnectionLineEnabled { return false }
                        guard let edge = state.getEdge(stroke.id) else { return true }
                        return !customEdgeTypes.contains(edge.type ?? "bezier")
                    },
                    viewport: state.viewport)
                    .equatable()
                    .allowsHitTesting(false)

                ZStack(alignment: .topLeading) {
                    customConnectionLineLayer
                    customEdgesLayer
                    edgeLabelsLayer
                    nodesLayer
                    handlesLayer
                    resizersLayer
                    edgeUpdatersLayer
                }
                .scaleEffect(state.viewport.zoom, anchor: .topLeading)
                .offset(x: state.viewport.x, y: state.viewport.y)

                nodeToolbarsLayer

                if let start = selectionStart, let current = selectionCurrent {
                    let x1 = start.x * state.zoom + state.viewport.x, y1 = start.y * state.zoom + state.viewport.y
                    let x2 = current.x * state.zoom + state.viewport.x, y2 = current.y * state.zoom + state.viewport.y
                    Rectangle()
                        .fill(pyreonFlowEdgeColor(palette.accent).opacity(0.10))
                        .overlay(Rectangle().stroke(pyreonFlowEdgeColor(palette.accent).opacity(0.8), lineWidth: 1))
                        .frame(width: abs(x2 - x1), height: abs(y2 - y1))
                        .position(x: (x1 + x2) / 2, y: (y1 + y2) / 2)
                        .allowsHitTesting(false)
                }

                if let controls {
                    PyreonFlowControls(state: state, style: controls, locked: $interactionsLocked, extraContent: controlsContent)
                }
                if let miniMap {
                    PyreonFlowMiniMap(state: state, style: miniMap, nodeColor: miniMapNodeColor)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .padding(10)
                }
            }
            .clipped()
            .coordinateSpace(name: "PyreonFlowCanvas")
            // Zoom belongs to the canvas container so a pinch that begins on
            // a node, edge control, or other child still transforms the graph.
            .simultaneousGesture(zoomGesture)
            .onPreferenceChange(PyreonFlowNodeSizePreference.self) { sizes in
                for (id, size) in sizes { state.updateNodeMeasurement(id, width: size.width, height: size.height) }
            }
            .onAppear { updateContainer(proxy.size); fitInitiallyIfNeeded() }
            .onChange(of: proxy.size) { _, size in
                updateContainer(size)
                fitInitiallyIfNeeded()
            }
        }
        .focusable(!state.disableKeyboardA11y)
        .onKeyPress { press in
            handleKeyPress(press)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ariaLabel))
        // Scoped to the canvas, like the web's `data-color-mode` attribute:
        // `.preferredColorScheme` would re-theme the entire window.
        .pyreonFlowColorMode(colorMode)
    }

    private func measuredNodeView(_ node: PyreonFlowNode<T>) -> some View {
        let absolute = state.getAbsolutePosition(node.id)
        let dimensions = state.getNodeDimensions(node.id)
        let inlineStyle = pyreonFlowNodeInlineStyle(node.style)
        let fixedWidth = (node.width ?? inlineStyle.width).map { CGFloat($0) }
        let fixedHeight = (node.height ?? inlineStyle.height).map { CGFloat($0) }
        return nodeContent(node, state.isNodeSelected(node.id), nodeDragStart[node.id] != nil)
            .frame(
                minWidth: fixedWidth == nil ? CGFloat(pyreonFlowDefaultNodeWidth) : nil,
                idealWidth: fixedWidth,
                maxWidth: fixedWidth,
                minHeight: fixedHeight == nil ? CGFloat(pyreonFlowDefaultNodeHeight) : nil,
                idealHeight: fixedHeight,
                maxHeight: fixedHeight)
            // Shrink-to-fit with a floor, which is what the web node box does
            // (an absolutely-positioned element with `min-width`). AFTER the
            // frame, deliberately: `.frame(minWidth:)` GROWS with the proposal
            // and `.position` proposes the whole canvas, so without this the
            // frame — not just its content — filled the canvas. Every node then
            // overlapped every other, swallowing its taps and drags, fed edge
            // anchoring the canvas box, and reported the canvas frame to
            // VoiceOver. A fixed width/height keeps the explicit size.
            .fixedSize(horizontal: fixedWidth == nil, vertical: fixedHeight == nil)
            .modifier(PyreonFlowNodeInlineStyleModifier(style: inlineStyle))
            .background(GeometryReader { measured in
                Color.clear.preference(key: PyreonFlowNodeSizePreference.self, value: [node.id: measured.size])
            })
            // Attached before `.position` so the element describes the node view
            // itself. NOTE (device-found, open): SwiftUI still reports the
            // POSITION container's frame for it, so every node's accessibility
            // frame is the whole canvas — VoiceOver cannot locate a node and a
            // coordinate drag must be aimed at the canvas instead. Tracked as an
            // F4 accessibility item in the flow parity audit.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(node.ariaLabel ?? node.id))
            .accessibilityAddTraits(state.isNodeSelected(node.id) ? [.isSelected] : [])
            .accessibilityAction {
                if node.selectable ?? state.nodesSelectable {
                    state.selectNode(node.id)
                    state.emitNodeClick(node.id)
                    focusedNodeId = node.id
                }
            }
            .accessibilityHidden(state.disableKeyboardA11y || !(node.focusable ?? state.nodesFocusable))
            // Placed by OFFSET in the canvas's top-leading ZStack rather than
            // by `.position`, which hands its child the whole canvas as its
            // layout frame — which is then what accessibility and
            // coordinate-based automation report for EVERY node, so VoiceOver
            // could not locate one and a drag could not target one. An offset
            // leaves the node's own box as its frame. The two place it
            // identically: `.position` centres at (x + w/2, y + h/2); the
            // stack's top-leading alignment plus this offset puts its top-left
            // at (x, y). Device-found.
            .contentShape(Rectangle())
            .onTapGesture {
                if node.selectable ?? state.nodesSelectable {
                    state.selectNode(node.id)
                    focusedNodeId = node.id
                }
                state.emitNodeClick(node.id)
            }
            .onTapGesture(count: 2) { state.emitNodeDoubleClick(node.id) }
            .gesture(nodeDragGesture(node))
            .focusable(!state.disableKeyboardA11y && (node.focusable ?? state.nodesFocusable))
            .focused($focusedNodeId, equals: node.id)
            .onKeyPress { press in
                handleKeyPress(press, nodeId: node.id)
            }
            // Last, so the hit-test shape and gestures move WITH the node.
            .offset(x: absolute.x, y: absolute.y)
    }

    private func handleKeyPress(_ press: KeyPress, nodeId: String? = nil, edgeId: String? = nil) -> KeyPress.Result {
        pyreonFlowHandleKey(state, key: press.key, modifiers: press.modifiers, isRepeat: press.phase == .repeat, nodeId: nodeId, edgeId: edgeId) ? .handled : .ignored
    }

    private func edgeLabelView(_ edge: PyreonFlowEdgeLabel) -> some View {
        Text(edge.text ?? "")
            .font(.system(size: 12))
            .foregroundStyle(pyreonFlowEdgeColor(palette.edgeLabel))
            .padding(edge.text == nil ? 8 : 3)
            .background(edge.text == nil ? Color.clear : pyreonFlowEdgeColor(palette.panelBackground).opacity(0.9))
            .position(x: edge.x, y: edge.y)
            .contentShape(Rectangle())
            .onTapGesture {
                state.selectEdge(edge.id)
                state.emitEdgeClick(edge.id)
                if edge.focusable { focusedEdgeId = edge.id }
            }
            .accessibilityLabel(Text(edge.accessibilityLabel))
            .accessibilityAddTraits(state.isEdgeSelected(edge.id) ? [.isSelected] : [])
            .accessibilityAction {
                state.selectEdge(edge.id)
                state.emitEdgeClick(edge.id)
                if edge.focusable { focusedEdgeId = edge.id }
            }
            .accessibilityHidden(!edge.focusable)
            // Hardware-keyboard focus, like the web's `tabindex` on the edge
            // path: the label takes focus and Enter/Space selects the edge. It
            // was reachable by VoiceOver only.
            .focusable(edge.focusable)
            .focused($focusedEdgeId, equals: edge.id)
            .onKeyPress { press in
                handleKeyPress(press, edgeId: edge.id)
            }
    }

    private var visibleEdgeLabels: [PyreonFlowEdgeLabel] {
        pyreonFlowEdgeLabels(state: state, nodeHandles: nodeHandles)
            .filter { visibleEdgeIds.contains($0.id) }
    }

    private var edgeLabelsLayer: some View {
        ForEach(visibleEdgeLabels) { edge in
            edgeLabelView(edge)
        }
    }

    private var nodesLayer: some View {
        ForEach(visibleNodes, id: \.id) { node in
            measuredNodeView(node)
        }
    }

    private var nodeToolbarsLayer: some View {
        ForEach(visibleNodes, id: \.id) { node in
            let selected = state.isNodeSelected(node.id)
            ForEach(Array(nodeToolbarConfigs(node).enumerated()), id: \.offset) { index, config in
                if (!config.showOnSelect || (config.selectedOverride ?? selected)), let toolbar = nodeToolbar(node, index, selected, nodeDragStart[node.id] != nil) {
                    let targetId = config.nodeIdOverride ?? node.id
                    let absolute = state.getAbsolutePosition(targetId)
                    let dimensions = state.getNodeDimensions(targetId)
                    PyreonFlowToolbarPortal(
                        placement: pyreonFlowNodeToolbarPlacement(
                            node: PyreonFlowRect(x: absolute.x, y: absolute.y, width: dimensions.width, height: dimensions.height),
                            viewport: state.viewport,
                            config: config),
                        content: toolbar)
                        .zIndex(10)
                }
            }
        }
    }

    private var handlesLayer: some View {
        ForEach(Array(interactiveHandles.enumerated()), id: \.offset) { _, handle in
            handleView(handle)
        }
    }

    private func handleView(_ handle: PyreonFlowInteractiveHandle) -> some View {
        let label = "\(handle.type) handle \(handle.handleId ?? "default")"
        let diameter = 12 / state.viewport.zoom
        let hitSize = max(diameter, 44 / state.viewport.zoom)
        return SwiftUI.Circle()
            .fill(pyreonFlowEdgeColor(palette.handleBackground))
            .overlay(SwiftUI.Circle().stroke(pyreonFlowEdgeColor(palette.handleBorder), lineWidth: 1))
            .frame(width: diameter, height: diameter)
            .frame(width: hitSize, height: hitSize)
            .contentShape(SwiftUI.Rectangle())
            .gesture(handle.type == "source" ? connectionGesture(handle) : nil)
            .accessibilityLabel(Text(label))
            .accessibilityAddTraits(.isButton)
            .accessibilityHidden(state.disableKeyboardA11y)
            // Keep a finite layout frame. `.position` proposes the entire
            // canvas to an accessible child, so every handle reports the same
            // canvas-sized frame. The outer frame is the native 44pt target.
            .offset(x: handle.x - hitSize / 2, y: handle.y - hitSize / 2)
    }

    private var resizersLayer: some View {
        ForEach(visibleNodes, id: \.id) { node in
            if let config = nodeResizer(node) {
                ForEach(config.directions, id: \.self) { direction in
                    resizerView(node, config: config, direction: direction)
                }
            }
        }
    }

    private func resizerView(_ node: PyreonFlowNode<T>, config: PyreonFlowNodeResizerConfig, direction: String) -> some View {
        let size = config.handleSize / state.viewport.zoom
        let hitSize = max(size, 44 / state.viewport.zoom)
        let position = resizerPosition(node, direction: direction)
        return SwiftUI.RoundedRectangle(cornerRadius: 2 / state.viewport.zoom)
            .fill(pyreonFlowEdgeColor(palette.resizerBackground))
            .overlay(SwiftUI.RoundedRectangle(cornerRadius: 2 / state.viewport.zoom).stroke(pyreonFlowEdgeColor(palette.accent), lineWidth: 1.5 / state.viewport.zoom))
            .frame(width: size, height: size)
            .frame(width: hitSize, height: hitSize)
            .contentShape(SwiftUI.Rectangle())
            .gesture(resizeGesture(node, config: config, direction: direction))
            .accessibilityLabel(Text("Resize \(direction) for node \(node.id)"))
            .offset(x: position.x - hitSize / 2, y: position.y - hitSize / 2)
    }

    private var edgeUpdatersLayer: some View {
        ForEach(pyreonFlowEdgeUpdaters(state: state, strokes: edgeStrokes)) { updater in
            edgeUpdaterView(updater)
        }
    }

    private func edgeUpdaterView(_ updater: PyreonFlowEdgeUpdater) -> some View {
        let label = "Reconnect \(updater.end) of edge \(updater.edgeId)"
        let diameter = 12 / state.viewport.zoom
        let hitSize = max(diameter, 44 / state.viewport.zoom)
        return SwiftUI.Circle()
            .fill(pyreonFlowEdgeColor(palette.accent).opacity(0.35))
            .overlay(SwiftUI.Circle().stroke(pyreonFlowEdgeColor(palette.accent), lineWidth: 1.5 / state.viewport.zoom))
            .frame(width: diameter, height: diameter)
            .frame(width: hitSize, height: hitSize)
            .contentShape(SwiftUI.Rectangle())
            .gesture(reconnectGesture(updater))
            .accessibilityLabel(Text(label))
            .accessibilityHidden(state.disableKeyboardA11y)
            .offset(x: updater.x - hitSize / 2, y: updater.y - hitSize / 2)
    }

    private var interactiveHandles: [PyreonFlowInteractiveHandle] {
        visibleNodes.flatMap { node -> [PyreonFlowInteractiveHandle] in
            guard node.hidden != true, node.connectable ?? state.nodesConnectable else { return [] }
            let p = state.getAbsolutePosition(node.id)
            let dimensions = state.getNodeDimensions(node.id)
            let box = PyreonFlowRect(x: p.x, y: p.y, width: dimensions.width, height: dimensions.height)
            return pyreonFlowInteractiveHandles(nodeId: node.id, node: box, handles: pyreonFlowEffectiveHandles(node, nodeHandles(node)))
        }
    }

    private var edgeStrokes: [PyreonFlowEdgeStroke] {
        var strokes = pyreonFlowEdgeStrokes(state: state, color: resolvedEdgeColor, width: edgeWidth, nodeHandles: nodeHandles)
        if state.onlyRenderVisibleElements { strokes = strokes.filter { pyreonFlowEdgeStrokeIsVisible($0, state: state) } }
        if let draft = connectionDraft {
            strokes.append(PyreonFlowEdgeStroke(id: "__connection-preview", segments: pyreonFlowConnectionPreview(type: state.connectionLineType, source: draft.source, target: draft.current), color: resolvedEdgeColor, width: edgeWidth))
        }
        if let draft = reconnectDraft {
            strokes.append(PyreonFlowEdgeStroke(id: "__reconnect-preview", segments: [
                .move(draft.fixed.x, draft.fixed.y), .line(draft.current.x, draft.current.y),
            ], color: resolvedEdgeColor, width: edgeWidth))
        }
        return strokes
    }

    @ViewBuilder private var customEdgesLayer: some View {
        ForEach(customEdgeContexts) { context in
            if let view = customEdge(context) {
                view
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .environment(\.pyreonFlowEdgeLabelPoint, CGPoint(x: context.labelX, y: context.labelY))
            }
        }
    }

    @ViewBuilder private var customConnectionLineLayer: some View {
        if customConnectionLineEnabled, let draft = connectionDraft {
            let result = pyreonEdgePath(
                type: state.connectionLineType,
                sourceX: draft.source.x, sourceY: draft.source.y, sourcePosition: draft.source.position,
                targetX: draft.current.x, targetY: draft.current.y, targetPosition: .left)
            if let view = customConnectionLine(PyreonFlowConnectionLineContext(
                sourceX: draft.source.x, sourceY: draft.source.y,
                targetX: draft.current.x, targetY: draft.current.y,
                sourcePosition: draft.source.position, path: result)) {
                view.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
    }

    private var customEdgeContexts: [PyreonFlowCustomEdgeContext] {
        let strokes = Dictionary(uniqueKeysWithValues: edgeStrokes.map { ($0.id, $0) })
        let labels = Dictionary(uniqueKeysWithValues: pyreonFlowEdgeLabels(state: state, nodeHandles: nodeHandles).map { ($0.id, $0) })
        return state.edges.compactMap { edge in
            guard edge.hidden != true, customEdgeTypes.contains(edge.type ?? "bezier"),
                  let stroke = strokes[edge.id], let first = stroke.segments.first, let last = stroke.segments.last
            else { return nil }
            let source = pyreonFlowSegmentPosition(stroke.segments, atStart: true)
            let target = pyreonFlowSegmentPosition(stroke.segments, atStart: false)
            return PyreonFlowCustomEdgeContext(
                edge: edge, sourceX: first.x, sourceY: first.y, targetX: last.x, targetY: last.y,
                sourcePosition: source, targetPosition: target, selected: state.isEdgeSelected(edge.id),
                labelX: labels[edge.id]?.x ?? (first.x + last.x) / 2,
                labelY: labels[edge.id]?.y ?? (first.y + last.y) / 2)
        }
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

    private func resizerPosition(_ node: PyreonFlowNode<T>, direction: String) -> CGPoint {
        let p = state.getAbsolutePosition(node.id)
        let dimensions = state.getNodeDimensions(node.id)
        let width = dimensions.width, height = dimensions.height
        let x = direction.contains("w") ? p.x : direction.contains("e") ? p.x + width : p.x + width / 2
        let y = direction.contains("n") ? p.y : direction.contains("s") ? p.y + height : p.y + height / 2
        return CGPoint(x: x, y: y)
    }

    private func resizeGesture(_ node: PyreonFlowNode<T>, config: PyreonFlowNodeResizerConfig, direction: String) -> some Gesture {
        let key = "\(node.id):\(direction)"
        return DragGesture(minimumDistance: 0, coordinateSpace: .global)
            .onChanged { value in
                guard !interactionsLocked else { return }
                if resizeDrafts[key] == nil {
                    state.pushHistory()
                    let dimensions = state.getNodeDimensions(node.id)
                    resizeDrafts[key] = PyreonFlowResizeDraft(frame: PyreonFlowResizeFrame(
                        position: node.position,
                        width: dimensions.width,
                        height: dimensions.height))
                }
                guard let draft = resizeDrafts[key] else { return }
                let frame = pyreonFlowResizeFrame(draft.frame, direction: direction, dx: value.translation.width / state.viewport.zoom, dy: value.translation.height / state.viewport.zoom, minWidth: config.minWidth, minHeight: config.minHeight)
                state.updateNode(node.id) { current in
                    current.position = frame.position; current.width = frame.width; current.height = frame.height
                }
            }
            .onEnded { _ in resizeDrafts[key] = nil }
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

/// The web `KeyboardEvent.key` name for a SwiftUI key, or `nil` when the key is
/// not one the flow handles.
public func pyreonFlowKeyName(_ key: KeyEquivalent) -> String? {
    switch key {
    case .leftArrow: return "ArrowLeft"
    case .rightArrow: return "ArrowRight"
    case .upArrow: return "ArrowUp"
    case .downArrow: return "ArrowDown"
    case .return: return "Enter"
    case .space: return " "
    case .delete: return "Backspace"
    case .deleteForward: return "Delete"
    case .escape: return "Escape"
    case KeyEquivalent("a"): return "a"
    case KeyEquivalent("c"): return "c"
    case KeyEquivalent("v"): return "v"
    case KeyEquivalent("z"): return "z"
    default: return nil
    }
}

/// Routes one hardware key press into the engine: the whole path between
/// SwiftUI's `onKeyPress` and `handleKeyboardCommand`. The view calls it for
/// every key, so the native tests can drive keys (Return, Escape, Delete)
/// that XCUITest cannot deliver to a simulator app through the same code.
@discardableResult
public func pyreonFlowHandleKey<T>(
    _ state: PyreonFlowState<T>,
    key: KeyEquivalent,
    modifiers: EventModifiers = [],
    isRepeat: Bool = false,
    nodeId: String? = nil,
    edgeId: String? = nil
) -> Bool {
    guard let name = pyreonFlowKeyName(key) else { return false }
    return state.handleKeyboardCommand(
        name,
        nodeId: nodeId,
        shift: modifiers.contains(.shift),
        command: modifiers.contains(.command) || modifiers.contains(.control),
        repeatKey: isRepeat,
        edgeId: edgeId
    )
}
