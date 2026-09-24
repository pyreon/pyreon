import SwiftUI

// The native twin of `@pyreon/flow`'s SVG edge layer. Draws the SAME geometry
// the web `path` string encodes, without parsing SVG syntax — see
// `EdgeSegment` in `types.ts` for why this shape exists (the closed 4-command
// vocabulary every built-in path builder reduces to).
//
// `PyreonFlowEdgeSegment` mirrors `PyreonDrawCmd`'s fat-struct shape
// (PyreonChartCanvas.swift): one `kind` discriminant, every variant's fields
// optional. That is deliberate, not incidental — a TS discriminated union
// with this exact shape (`{kind}|{kind,x,y}|...`) is what PMTC's fat-struct
// union lowering already knows how to construct (built for `@pyreon/charts`'
// `DrawCmd`), so a future compiler recognizer over `EdgeSegment` reuses that
// feature verbatim instead of needing a new one.
//
public enum PyreonFlowPosition: Equatable { case top, right, bottom, left }

public struct PyreonFlowHandleConfig: Equatable {
    public var id: String?
    public var type: String
    public var position: PyreonFlowPosition
    public var offset: Double
    public init(id: String? = nil, type: String, position: PyreonFlowPosition, offset: Double = 50) { self.id = id; self.type = type; self.position = position; self.offset = min(100, max(0, offset)) }
}

public struct PyreonFlowMeasuredHandle: Equatable {
    public var id: String; public var type: String; public var position: PyreonFlowPosition; public var x: Double; public var y: Double
    public init(id: String, type: String, position: PyreonFlowPosition, x: Double, y: Double) { self.id = id; self.type = type; self.position = position; self.x = x; self.y = y }
}

public struct PyreonFlowNodeMeasurement: Equatable {
    public var width: Double; public var height: Double; public var handles: [PyreonFlowMeasuredHandle]
    public init(width: Double, height: Double, handles: [PyreonFlowMeasuredHandle] = []) { self.width = width; self.height = height; self.handles = handles }
}

public struct PyreonFlowNodeBoxDimensions: Equatable {
    public var sourceW: Double; public var sourceH: Double; public var targetW: Double; public var targetH: Double
    public init(sourceW: Double, sourceH: Double, targetW: Double, targetH: Double) { self.sourceW = sourceW; self.sourceH = sourceH; self.targetW = targetW; self.targetH = targetH }
}

public struct PyreonFlowFloatingEndpoints: Equatable {
    public var source: PyreonFlowHandleAnchor; public var target: PyreonFlowHandleAnchor
    public init(source: PyreonFlowHandleAnchor, target: PyreonFlowHandleAnchor) { self.source = source; self.target = target }
}

public struct PyreonFlowSmartPositions: Equatable {
    public var sourcePosition: PyreonFlowPosition; public var targetPosition: PyreonFlowPosition
    public init(sourcePosition: PyreonFlowPosition, targetPosition: PyreonFlowPosition) { self.sourcePosition = sourcePosition; self.targetPosition = targetPosition }
}

public func pyreonEffectiveDimensions<T>(_ node: PyreonFlowNode<T>, measurement: PyreonFlowNodeMeasurement? = nil) -> PyreonFlowDimensions {
    PyreonFlowDimensions(
        width: node.width ?? measurement?.width ?? pyreonFlowDefaultNodeWidth,
        height: node.height ?? measurement?.height ?? pyreonFlowDefaultNodeHeight)
}

public struct PyreonFlowPathResult: Equatable {
    public var labelX: Double
    public var labelY: Double
    public var segments: [PyreonFlowEdgeSegment]
    public var path: String { segments.map { segment in
        let point = "\(pyreonFlowSvgNumber(segment.x)),\(pyreonFlowSvgNumber(segment.y))"
        switch segment.kind {
        case "move": return "M\(point)"
        case "line": return "L\(point)"
        case "cubic": return "C\(pyreonFlowSvgNumber(segment.c1x ?? 0)),\(pyreonFlowSvgNumber(segment.c1y ?? 0)) \(pyreonFlowSvgNumber(segment.c2x ?? 0)),\(pyreonFlowSvgNumber(segment.c2y ?? 0)) \(point)"
        case "quad": return "Q\(pyreonFlowSvgNumber(segment.cx ?? 0)),\(pyreonFlowSvgNumber(segment.cy ?? 0)) \(point)"
        default: return ""
        }
    }.filter { !$0.isEmpty }.joined(separator: " ") }
}

private func pyreonFlowSvgNumber(_ value: Double) -> String {
    value.isFinite && value.rounded() == value ? String(Int(value)) : String(value)
}

public struct PyreonFlowRect: Equatable {
    public var x: Double; public var y: Double; public var width: Double; public var height: Double
    public init(x: Double, y: Double, width: Double, height: Double) { self.x = x; self.y = y; self.width = width; self.height = height }
}

public struct PyreonFlowHandleAnchor: Equatable {
    public var x: Double; public var y: Double; public var position: PyreonFlowPosition
}

/// A handle resolved into graph coordinates. Keeping hit testing in graph
/// space makes the interaction radius independent from pan and zoom.
public struct PyreonFlowInteractiveHandle: Equatable {
    public var nodeId: String
    public var handleId: String?
    public var type: String
    public var position: PyreonFlowPosition
    public var x: Double
    public var y: Double
}

public func pyreonFlowInteractiveHandles(nodeId: String, node: PyreonFlowRect, handles: [PyreonFlowHandleConfig]) -> [PyreonFlowInteractiveHandle] {
    handles.map { handle in
        let point = pyreonHandlePosition(handle.position, nodeX: node.x, nodeY: node.y, nodeWidth: node.width, nodeHeight: node.height, offset: handle.offset)
        return PyreonFlowInteractiveHandle(nodeId: nodeId, handleId: handle.id, type: handle.type, position: handle.position, x: point.x, y: point.y)
    }
}

public func pyreonNearestFlowHandle(_ handles: [PyreonFlowInteractiveHandle], point: PyreonXYPosition, type: String, radius: Double) -> PyreonFlowInteractiveHandle? {
    guard radius >= 0 else { return nil }
    return handles
        .filter { (type == "any" || $0.type == type) && hypot($0.x - point.x, $0.y - point.y) <= radius }
        .min { hypot($0.x - point.x, $0.y - point.y) < hypot($1.x - point.x, $1.y - point.y) }
}

/// The connection a handle drag makes when it ends at `point`, under the web's
/// `connectionMode` rules. `"strict"` (default): only a handle of the OPPOSITE
/// type is accepted, and the result is always source -> target, so a drag that
/// started at a target handle makes the dropped node the source. `"loose"`: any
/// handle, oriented from where the drag started. The start node is never a
/// candidate. `nil` when no acceptable handle is within `radius`.
public func pyreonFlowResolveConnection(from start: PyreonFlowInteractiveHandle, handles: [PyreonFlowInteractiveHandle], point: PyreonXYPosition, radius: Double, connectionMode: String) -> PyreonFlowConnection? {
    let loose = connectionMode == "loose"
    let want = loose ? "any" : (start.type == "target" ? "source" : "target")
    guard let end = pyreonNearestFlowHandle(handles.filter { $0.nodeId != start.nodeId }, point: point, type: want, radius: radius) else { return nil }
    if !loose && start.type == "target" {
        return PyreonFlowConnection(source: end.nodeId, target: start.nodeId, sourceHandle: end.handleId, targetHandle: start.handleId)
    }
    return PyreonFlowConnection(source: start.nodeId, target: end.nodeId, sourceHandle: start.handleId, targetHandle: end.handleId)
}

public func pyreonHandlePosition(_ position: PyreonFlowPosition, nodeX: Double, nodeY: Double, nodeWidth: Double, nodeHeight: Double, offset: Double = 50) -> PyreonXYPosition {
    let ratio = min(100, max(0, offset)) / 100
    switch position {
    case .top: return PyreonXYPosition(x: nodeX + nodeWidth * ratio, y: nodeY)
    case .right: return PyreonXYPosition(x: nodeX + nodeWidth, y: nodeY + nodeHeight * ratio)
    case .bottom: return PyreonXYPosition(x: nodeX + nodeWidth * ratio, y: nodeY + nodeHeight)
    case .left: return PyreonXYPosition(x: nodeX, y: nodeY + nodeHeight * ratio)
    }
}

public func pyreonNodeIntersection(_ box: PyreonFlowRect, toward: PyreonXYPosition) -> PyreonXYPosition {
    let cx = box.x + box.width / 2, cy = box.y + box.height / 2
    let dx = toward.x - cx, dy = toward.y - cy
    if dx == 0 && dy == 0 { return PyreonXYPosition(x: cx, y: cy) }
    let scaleX = dx != 0 ? box.width / 2 / abs(dx) : Double.infinity
    let scaleY = dy != 0 ? box.height / 2 / abs(dy) : Double.infinity
    let scale = min(scaleX, scaleY)
    return PyreonXYPosition(x: cx + dx * scale, y: cy + dy * scale)
}

private func pyreonSideOfPoint(_ box: PyreonFlowRect, _ point: PyreonXYPosition) -> PyreonFlowPosition {
    if abs(point.x - box.x) <= 1 { return .left }
    if abs(point.x - (box.x + box.width)) <= 1 { return .right }
    if abs(point.y - box.y) <= 1 { return .top }
    return .bottom
}

public func pyreonFloatingEndpoints(source: PyreonFlowRect, target: PyreonFlowRect) -> (source: PyreonFlowHandleAnchor, target: PyreonFlowHandleAnchor) {
    let sourceCenter = PyreonXYPosition(x: source.x + source.width / 2, y: source.y + source.height / 2)
    let targetCenter = PyreonXYPosition(x: target.x + target.width / 2, y: target.y + target.height / 2)
    let sp = pyreonNodeIntersection(source, toward: targetCenter), tp = pyreonNodeIntersection(target, toward: sourceCenter)
    return (PyreonFlowHandleAnchor(x: sp.x, y: sp.y, position: pyreonSideOfPoint(source, sp)), PyreonFlowHandleAnchor(x: tp.x, y: tp.y, position: pyreonSideOfPoint(target, tp)))
}

public func pyreonGetFloatingEndpoints<S, T>(_ sourceNode: PyreonFlowNode<S>, targetNode: PyreonFlowNode<T>, dimensions: PyreonFlowNodeBoxDimensions) -> PyreonFlowFloatingEndpoints {
    let endpoints = pyreonFloatingEndpoints(
        source: PyreonFlowRect(x: sourceNode.position.x, y: sourceNode.position.y, width: dimensions.sourceW, height: dimensions.sourceH),
        target: PyreonFlowRect(x: targetNode.position.x, y: targetNode.position.y, width: dimensions.targetW, height: dimensions.targetH))
    return PyreonFlowFloatingEndpoints(source: endpoints.source, target: endpoints.target)
}

public func pyreonResolveHandleAnchor(nodeX: Double, nodeY: Double, nodeWidth: Double, nodeHeight: Double, handleId: String?, type: String, config: [PyreonFlowHandleConfig], measurement: PyreonFlowNodeMeasurement?) -> PyreonFlowHandleAnchor? {
    let measured = measurement?.handles.filter { $0.type == type } ?? []
    if let handleId {
        if let handle = measured.first(where: { $0.id == handleId }) {
            return PyreonFlowHandleAnchor(x: nodeX + handle.x, y: nodeY + handle.y, position: handle.position)
        }
        if let handle = config.first(where: { $0.id == handleId }) {
            let point = pyreonHandlePosition(handle.position, nodeX: nodeX, nodeY: nodeY, nodeWidth: nodeWidth, nodeHeight: nodeHeight, offset: handle.offset)
            return PyreonFlowHandleAnchor(x: point.x, y: point.y, position: handle.position)
        }
    }
    if let handle = measured.first { return PyreonFlowHandleAnchor(x: nodeX + handle.x, y: nodeY + handle.y, position: handle.position) }
    if let handle = config.first {
        let point = pyreonHandlePosition(handle.position, nodeX: nodeX, nodeY: nodeY, nodeWidth: nodeWidth, nodeHeight: nodeHeight, offset: handle.offset)
        return PyreonFlowHandleAnchor(x: point.x, y: point.y, position: handle.position)
    }
    return nil
}

public func pyreonSmartHandlePositions(source: PyreonFlowRect, target: PyreonFlowRect, sourceHandles: [PyreonFlowHandleConfig] = [], targetHandles: [PyreonFlowHandleConfig] = []) -> (source: PyreonFlowPosition, target: PyreonFlowPosition) {
    let dx = target.x + target.width / 2 - (source.x + source.width / 2)
    let dy = target.y + target.height / 2 - (source.y + source.height / 2)
    let horizontal = abs(dx) > abs(dy)
    let sourceSide = sourceHandles.first?.position ?? (horizontal ? (dx > 0 ? .right : .left) : (dy > 0 ? .bottom : .top))
    let targetSide = targetHandles.first?.position ?? (horizontal ? (dx > 0 ? .left : .right) : (dy > 0 ? .top : .bottom))
    return (sourceSide, targetSide)
}

public func pyreonGetSmartHandlePositions<S, T>(_ sourceNode: PyreonFlowNode<S>, targetNode: PyreonFlowNode<T>, dimensions: PyreonFlowNodeBoxDimensions? = nil) -> PyreonFlowSmartPositions {
    let source = PyreonFlowRect(x: sourceNode.position.x, y: sourceNode.position.y, width: dimensions?.sourceW ?? sourceNode.width ?? pyreonFlowDefaultNodeWidth, height: dimensions?.sourceH ?? sourceNode.height ?? pyreonFlowDefaultNodeHeight)
    let target = PyreonFlowRect(x: targetNode.position.x, y: targetNode.position.y, width: dimensions?.targetW ?? targetNode.width ?? pyreonFlowDefaultNodeWidth, height: dimensions?.targetH ?? targetNode.height ?? pyreonFlowDefaultNodeHeight)
    let positions = pyreonSmartHandlePositions(source: source, target: target, sourceHandles: sourceNode.sourceHandles, targetHandles: targetNode.targetHandles)
    return PyreonFlowSmartPositions(sourcePosition: positions.source, targetPosition: positions.target)
}

public func pyreonResolveHandleAnchor<T>(_ node: PyreonFlowNode<T>, handleId: String?, type: String, dimensions: PyreonFlowDimensions, measurement: PyreonFlowNodeMeasurement? = nil) -> PyreonFlowHandleAnchor? {
    pyreonResolveHandleAnchor(nodeX: node.position.x, nodeY: node.position.y, nodeWidth: dimensions.width, nodeHeight: dimensions.height, handleId: handleId, type: type, config: type == "source" ? node.sourceHandles : node.targetHandles, measurement: measurement)
}

public func pyreonComputeEdgePath(type: String, source: PyreonFlowRect, target: PyreonFlowRect, sourceHandleId: String? = nil, targetHandleId: String? = nil, sourceHandles: [PyreonFlowHandleConfig] = [], targetHandles: [PyreonFlowHandleConfig] = [], sourceMeasurement: PyreonFlowNodeMeasurement? = nil, targetMeasurement: PyreonFlowNodeMeasurement? = nil, waypoints: [PyreonXYPosition] = [], borderRadius: Double = 5, offset: Double = 20, curvature: Double = 0.25) -> PyreonFlowPathResult {
    let sa = pyreonResolveHandleAnchor(nodeX: source.x, nodeY: source.y, nodeWidth: source.width, nodeHeight: source.height, handleId: sourceHandleId, type: "source", config: sourceHandles, measurement: sourceMeasurement)
    let ta = pyreonResolveHandleAnchor(nodeX: target.x, nodeY: target.y, nodeWidth: target.width, nodeHeight: target.height, handleId: targetHandleId, type: "target", config: targetHandles, measurement: targetMeasurement)
    let useFloating = sa == nil && ta == nil && waypoints.isEmpty
    let sourceAnchor: PyreonFlowHandleAnchor, targetAnchor: PyreonFlowHandleAnchor
    if useFloating {
        (sourceAnchor, targetAnchor) = pyreonFloatingEndpoints(source: source, target: target)
    } else {
        let smart = pyreonSmartHandlePositions(source: source, target: target, sourceHandles: sourceHandles, targetHandles: targetHandles)
        let sp = pyreonHandlePosition(smart.source, nodeX: source.x, nodeY: source.y, nodeWidth: source.width, nodeHeight: source.height)
        let tp = pyreonHandlePosition(smart.target, nodeX: target.x, nodeY: target.y, nodeWidth: target.width, nodeHeight: target.height)
        sourceAnchor = sa ?? PyreonFlowHandleAnchor(x: sp.x, y: sp.y, position: smart.source)
        targetAnchor = ta ?? PyreonFlowHandleAnchor(x: tp.x, y: tp.y, position: smart.target)
    }
    if !waypoints.isEmpty { return pyreonWaypointPath(sourceX: sourceAnchor.x, sourceY: sourceAnchor.y, targetX: targetAnchor.x, targetY: targetAnchor.y, waypoints: waypoints) }
    switch type {
    case "smoothstep": return pyreonSmoothStepPath(sourceX: sourceAnchor.x, sourceY: sourceAnchor.y, sourcePosition: sourceAnchor.position, targetX: targetAnchor.x, targetY: targetAnchor.y, targetPosition: targetAnchor.position, borderRadius: borderRadius, offset: offset)
    case "straight": return pyreonStraightPath(sourceX: sourceAnchor.x, sourceY: sourceAnchor.y, targetX: targetAnchor.x, targetY: targetAnchor.y)
    case "step": return pyreonStepPath(sourceX: sourceAnchor.x, sourceY: sourceAnchor.y, sourcePosition: sourceAnchor.position, targetX: targetAnchor.x, targetY: targetAnchor.y, targetPosition: targetAnchor.position, offset: offset)
    default: return pyreonBezierPath(sourceX: sourceAnchor.x, sourceY: sourceAnchor.y, sourcePosition: sourceAnchor.position, targetX: targetAnchor.x, targetY: targetAnchor.y, targetPosition: targetAnchor.position, curvature: curvature)
    }
}

/// One drawing primitive in an edge's path — `move`/`line`/`cubic`/`quad`,
/// the exact vocabulary `EdgeSegment` (`types.ts`) defines.
public struct PyreonFlowEdgeSegment: Equatable {
    public var kind: String
    public var x: Double
    public var y: Double
    public var c1x: Double?
    public var c1y: Double?
    public var c2x: Double?
    public var c2y: Double?
    public var cx: Double?
    public var cy: Double?

    public init(
        kind: String,
        x: Double,
        y: Double,
        c1x: Double? = nil,
        c1y: Double? = nil,
        c2x: Double? = nil,
        c2y: Double? = nil,
        cx: Double? = nil,
        cy: Double? = nil
    ) {
        self.kind = kind
        self.x = x
        self.y = y
        self.c1x = c1x
        self.c1y = c1y
        self.c2x = c2x
        self.c2y = c2y
        self.cx = cx
        self.cy = cy
    }

    /// `move`(x, y).
    public static func move(_ x: Double, _ y: Double) -> PyreonFlowEdgeSegment {
        PyreonFlowEdgeSegment(kind: "move", x: x, y: y)
    }
    /// `line`(x, y).
    public static func line(_ x: Double, _ y: Double) -> PyreonFlowEdgeSegment {
        PyreonFlowEdgeSegment(kind: "line", x: x, y: y)
    }
    /// `cubic`(x, y) with two control points.
    public static func cubic(
        _ x: Double, _ y: Double, c1x: Double, c1y: Double, c2x: Double, c2y: Double
    ) -> PyreonFlowEdgeSegment {
        PyreonFlowEdgeSegment(kind: "cubic", x: x, y: y, c1x: c1x, c1y: c1y, c2x: c2x, c2y: c2y)
    }
    /// `quad`(x, y) with one control point.
    public static func quad(_ x: Double, _ y: Double, cx: Double, cy: Double) -> PyreonFlowEdgeSegment {
        PyreonFlowEdgeSegment(kind: "quad", x: x, y: y, cx: cx, cy: cy)
    }
}

public func pyreonStraightPath(sourceX: Double, sourceY: Double, targetX: Double, targetY: Double) -> PyreonFlowPathResult {
    PyreonFlowPathResult(labelX: (sourceX + targetX) / 2, labelY: (sourceY + targetY) / 2, segments: [.move(sourceX, sourceY), .line(targetX, targetY)])
}

public func pyreonBezierPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = .bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = .top, curvature: Double = 0.25) -> PyreonFlowPathResult {
    let distance = hypot(targetX - sourceX, targetY - sourceY)
    let offset = distance * curvature
    var scx = sourceX, scy = sourceY, tcx = targetX, tcy = targetY
    switch sourcePosition { case .top: scy -= offset; case .bottom: scy += offset; case .left: scx -= offset; case .right: scx += offset }
    switch targetPosition { case .top: tcy -= offset; case .bottom: tcy += offset; case .left: tcx -= offset; case .right: tcx += offset }
    return PyreonFlowPathResult(labelX: (sourceX + targetX) / 2, labelY: (sourceY + targetY) / 2, segments: [.move(sourceX, sourceY), .cubic(targetX, targetY, c1x: scx, c1y: scy, c2x: tcx, c2y: tcy)])
}

public func pyreonWaypointPath(sourceX: Double, sourceY: Double, targetX: Double, targetY: Double, waypoints: [PyreonXYPosition]) -> PyreonFlowPathResult {
    guard !waypoints.isEmpty else { return pyreonStraightPath(sourceX: sourceX, sourceY: sourceY, targetX: targetX, targetY: targetY) }
    let points = [PyreonXYPosition(x: sourceX, y: sourceY)] + waypoints + [PyreonXYPosition(x: targetX, y: targetY)]
    let segments: [PyreonFlowEdgeSegment] = points.enumerated().map { index, point in
        index == 0 ? PyreonFlowEdgeSegment.move(point.x, point.y) : PyreonFlowEdgeSegment.line(point.x, point.y)
    }
    let label = waypoints[waypoints.count / 2]
    return PyreonFlowPathResult(labelX: label.x, labelY: label.y, segments: segments)
}

public func pyreonSmoothStepPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = .bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = .top, borderRadius: Double = 5, offset: Double = 20) -> PyreonFlowPathResult {
    let hs = sourcePosition == .left || sourcePosition == .right
    let ht = targetPosition == .left || targetPosition == .right
    let sx = sourceX + (sourcePosition == .right ? offset : sourcePosition == .left ? -offset : 0)
    let sy = sourceY + (sourcePosition == .bottom ? offset : sourcePosition == .top ? -offset : 0)
    let tx = targetX + (targetPosition == .right ? offset : targetPosition == .left ? -offset : 0)
    let ty = targetY + (targetPosition == .bottom ? offset : targetPosition == .top ? -offset : 0)
    let mx = (sx + tx) / 2, my = (sy + ty) / 2, r = borderRadius
    var segments: [PyreonFlowEdgeSegment]
    if hs && !ht {
        let cornerY = ty, runY = cornerY > sy ? cornerY - r : cornerY + r
        let outX = sx + (tx > sx ? r : -r)
        segments = [.move(sourceX, sourceY), .line(sx, sy), .line(sx, runY), .quad(outX, cornerY, cx: sx, cy: cornerY), .line(tx, cornerY), .line(targetX, targetY)]
    } else if !hs && ht {
        let cornerX = tx, runX = cornerX > sx ? cornerX - r : cornerX + r
        let outY = sy + (ty > sy ? r : -r)
        segments = [.move(sourceX, sourceY), .line(sx, sy), .line(runX, sy), .quad(cornerX, outY, cx: cornerX, cy: sy), .line(cornerX, ty), .line(targetX, targetY)]
    } else if hs && ht {
        segments = [.move(sourceX, sourceY), .line(sx, sourceY), .line(mx, sourceY), .quad(mx, my, cx: mx, cy: sourceY), .line(mx, targetY), .line(tx, targetY), .line(targetX, targetY)]
    } else {
        segments = [.move(sourceX, sourceY), .line(sourceX, sy), .line(sourceX, my), .quad(mx, my, cx: sourceX, cy: my), .line(targetX, my), .line(targetX, ty), .line(targetX, targetY)]
    }
    return PyreonFlowPathResult(labelX: (sourceX + targetX) / 2, labelY: (sourceY + targetY) / 2, segments: segments)
}

public func pyreonStepPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = .bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = .top, offset: Double = 20) -> PyreonFlowPathResult {
    pyreonSmoothStepPath(sourceX: sourceX, sourceY: sourceY, sourcePosition: sourcePosition, targetX: targetX, targetY: targetY, targetPosition: targetPosition, borderRadius: 0, offset: offset)
}

public func pyreonEdgePath(type: String, sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition, borderRadius: Double = 5, offset: Double = 20, curvature: Double = 0.25) -> PyreonFlowPathResult {
    switch type {
    case "smoothstep": return pyreonSmoothStepPath(sourceX: sourceX, sourceY: sourceY, sourcePosition: sourcePosition, targetX: targetX, targetY: targetY, targetPosition: targetPosition, borderRadius: borderRadius, offset: offset)
    case "straight": return pyreonStraightPath(sourceX: sourceX, sourceY: sourceY, targetX: targetX, targetY: targetY)
    case "step": return pyreonStepPath(sourceX: sourceX, sourceY: sourceY, sourcePosition: sourcePosition, targetX: targetX, targetY: targetY, targetPosition: targetPosition, offset: offset)
    default: return pyreonBezierPath(sourceX: sourceX, sourceY: sourceY, sourcePosition: sourcePosition, targetX: targetX, targetY: targetY, targetPosition: targetPosition, curvature: curvature)
    }
}

public func pyreonFlowConnectionPreview(type: String, source: PyreonFlowInteractiveHandle, target: PyreonXYPosition) -> [PyreonFlowEdgeSegment] {
    switch type {
    case "smoothstep": return pyreonSmoothStepPath(sourceX: source.x, sourceY: source.y, sourcePosition: source.position, targetX: target.x, targetY: target.y, targetPosition: .left).segments
    case "straight": return pyreonStraightPath(sourceX: source.x, sourceY: source.y, targetX: target.x, targetY: target.y).segments
    case "step": return pyreonStepPath(sourceX: source.x, sourceY: source.y, sourcePosition: source.position, targetX: target.x, targetY: target.y, targetPosition: .left).segments
    default: return pyreonBezierPath(sourceX: source.x, sourceY: source.y, sourcePosition: source.position, targetX: target.x, targetY: target.y, targetPosition: .left).segments
    }
}

/// Builds a SwiftUI `Path` from a segment list. Pure — no SwiftUI View
/// dependency beyond the `Path`/`CGPoint` types, so it unit-tests headlessly
/// by inspecting the resulting path's bounding box / element count.
public func pyreonFlowEdgePath(_ segments: [PyreonFlowEdgeSegment]) -> Path {
    var p = Path()
    for seg in segments {
        switch seg.kind {
        case "move":
            p.move(to: CGPoint(x: seg.x, y: seg.y))
        case "line":
            p.addLine(to: CGPoint(x: seg.x, y: seg.y))
        case "cubic":
            guard let c1x = seg.c1x, let c1y = seg.c1y, let c2x = seg.c2x, let c2y = seg.c2y else {
                continue
            }
            p.addCurve(
                to: CGPoint(x: seg.x, y: seg.y),
                control1: CGPoint(x: c1x, y: c1y),
                control2: CGPoint(x: c2x, y: c2y))
        case "quad":
            guard let cx = seg.cx, let cy = seg.cy else { continue }
            p.addQuadCurve(to: CGPoint(x: seg.x, y: seg.y), control: CGPoint(x: cx, y: cy))
        default:
            continue
        }
    }
    return p
}

public struct PyreonFlowMarkerGlyph: Equatable {
    public var points: [PyreonXYPosition]
    public var closed: Bool
    public var color: String
    public var strokeWidth: Double
}

public func pyreonFlowMarkerGlyph(_ marker: PyreonFlowMarker, segments: [PyreonFlowEdgeSegment], atStart: Bool, edgeColor: String) -> PyreonFlowMarkerGlyph? {
    guard segments.count >= 2 else { return nil }
    let tip: PyreonXYPosition, toward: PyreonXYPosition
    if atStart {
        let first = segments[0], next = segments[1]
        tip = PyreonXYPosition(x: first.x, y: first.y)
        toward = PyreonXYPosition(x: next.c1x ?? next.cx ?? next.x, y: next.c1y ?? next.cy ?? next.y)
    } else {
        let last = segments[segments.count - 1], previous = segments[segments.count - 2]
        tip = PyreonXYPosition(x: last.x, y: last.y)
        toward = PyreonXYPosition(x: last.c2x ?? last.cx ?? previous.x, y: last.c2y ?? last.cy ?? previous.y)
    }
    var dx = tip.x - toward.x, dy = tip.y - toward.y
    let length = hypot(dx, dy); guard length > 0 else { return nil }
    dx /= length; dy /= length
    let back = PyreonXYPosition(x: tip.x - dx * marker.width, y: tip.y - dy * marker.width)
    let px = -dy * marker.height / 2, py = dx * marker.height / 2
    let a = PyreonXYPosition(x: back.x + px, y: back.y + py), b = PyreonXYPosition(x: back.x - px, y: back.y - py)
    return PyreonFlowMarkerGlyph(points: marker.type == "arrowclosed" ? [tip, a, b] : [a, tip, b], closed: marker.type == "arrowclosed", color: marker.color ?? edgeColor, strokeWidth: marker.strokeWidth)
}

private func pyreonPointSegmentDistance(_ point: PyreonXYPosition, _ a: PyreonXYPosition, _ b: PyreonXYPosition) -> Double {
    let dx = b.x - a.x, dy = b.y - a.y
    let length2 = dx * dx + dy * dy
    if length2 == 0 { return hypot(point.x - a.x, point.y - a.y) }
    let t = min(1, max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2))
    return hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/// Distance to the rendered path in graph units. Curves are adaptively
/// approximated with enough chords for pointer hit testing, never drawing.
public func pyreonFlowEdgeDistance(_ segments: [PyreonFlowEdgeSegment], point: PyreonXYPosition, curveSteps: Int = 24) -> Double {
    var current: PyreonXYPosition?
    var best = Double.infinity
    for segment in segments {
        let end = PyreonXYPosition(x: segment.x, y: segment.y)
        if segment.kind == "move" { current = end; continue }
        guard let start = current else { current = end; continue }
        var previous = start
        let steps = segment.kind == "line" ? 1 : max(1, curveSteps)
        for i in 1...steps {
            let t = Double(i) / Double(steps), u = 1 - t
            let sample: PyreonXYPosition
            if segment.kind == "cubic", let c1x = segment.c1x, let c1y = segment.c1y, let c2x = segment.c2x, let c2y = segment.c2y {
                sample = PyreonXYPosition(x: u*u*u*start.x + 3*u*u*t*c1x + 3*u*t*t*c2x + t*t*t*end.x, y: u*u*u*start.y + 3*u*u*t*c1y + 3*u*t*t*c2y + t*t*t*end.y)
            } else if segment.kind == "quad", let cx = segment.cx, let cy = segment.cy {
                sample = PyreonXYPosition(x: u*u*start.x + 2*u*t*cx + t*t*end.x, y: u*u*start.y + 2*u*t*cy + t*t*end.y)
            } else { sample = end }
            best = min(best, pyreonPointSegmentDistance(point, previous, sample)); previous = sample
        }
        current = end
    }
    return best
}

/// Parses `#rgb` / `#rrggbb` into a SwiftUI `Color`, falling back to gray for
/// anything else. Deliberately SELF-CONTAINED rather than reusing
/// `@pyreon/charts`' `pyreonChartColor` (same hex-parsing logic, smaller
/// scope — flow's edge colors are never CSS `rgb()`/`rgba()` strings): the
/// co-source verify gate compiles each package's `native/swift/` files in
/// ISOLATION, and a real app that depends on `@pyreon/flow` but NOT
/// `@pyreon/charts` would never link `PyreonChartCanvas.swift` at all — an
/// implicit cross-package symbol dependency here would be a real, silent
/// break in exactly that app, invisible until someone omits charts.
func pyreonFlowEdgeColor(_ s: String) -> Color {
    let str = s.trimmingCharacters(in: .whitespaces)
    guard str.hasPrefix("#") else { return Color.gray }
    let hex = String(str.dropFirst())
    func code(_ c: Character) -> Double {
        guard let v = c.hexDigitValue else { return 0 }
        return Double(v)
    }
    let chars = Array(hex)
    if chars.count == 3 {
        return Color(
            red: code(chars[0]) * 17.0 / 255.0,
            green: code(chars[1]) * 17.0 / 255.0,
            blue: code(chars[2]) * 17.0 / 255.0)
    }
    if chars.count == 6 {
        return Color(
            red: (code(chars[0]) * 16.0 + code(chars[1])) / 255.0,
            green: (code(chars[2]) * 16.0 + code(chars[3])) / 255.0,
            blue: (code(chars[4]) * 16.0 + code(chars[5])) / 255.0)
    }
    return Color.gray
}

/// One edge's stroke — its segment list plus how to draw it. `id` makes a
/// list of these usable as a SwiftUI `ForEach`-free `Canvas` draw list (the
/// whole canvas is one `Canvas {}` body, not per-edge views — same
/// single-draw-pass shape `PyreonChartCanvas` uses, for the same reason:
/// N edges as N SwiftUI views is real per-view overhead a flat draw list
/// avoids).
///
/// The `Path`, the resolved `Color` and the dash array are computed ONCE, when
/// the stroke is built (and again on `didSet` of the field they derive from),
/// never in the draw closure. Measured on the v1 draw path at E = 9,999: 6.9 ms
/// per draw, of which 3.3 ms was re-parsing hex colors and 2.6 ms rebuilding +
/// re-transforming paths — per frame, at gesture rate. `Equatable` so SwiftUI
/// can prove an unchanged draw list unchanged.
public struct PyreonFlowEdgeStroke: Identifiable, Equatable {
    public var id: String
    public var segments: [PyreonFlowEdgeSegment] { didSet { path = pyreonFlowEdgePath(segments) } }
    public var color: String { didSet { resolvedColor = pyreonFlowEdgeColor(color) } }
    public var width: Double
    public var dash: [Double]? { didSet { dashCG = dash.map { $0.map { CGFloat($0) } } } }
    public var startMarker: PyreonFlowMarkerGlyph?
    public var endMarker: PyreonFlowMarkerGlyph?
    public var interactionWidth: Double

    /// The unscaled path, built once from `segments` (flow coordinates).
    public private(set) var path: Path
    /// `color` parsed once.
    public private(set) var resolvedColor: Color
    /// `dash` converted once (flow units — the canvas transform scales it).
    public private(set) var dashCG: [CGFloat]?

    public init(
        id: String,
        segments: [PyreonFlowEdgeSegment],
        color: String = "#999999",
        width: Double = 1.5,
        dash: [Double]? = nil,
        startMarker: PyreonFlowMarkerGlyph? = nil,
        endMarker: PyreonFlowMarkerGlyph? = nil,
        interactionWidth: Double = 20
    ) {
        self.id = id
        self.segments = segments
        self.color = color
        self.width = width
        self.dash = dash
        self.startMarker = startMarker
        self.endMarker = endMarker
        self.interactionWidth = interactionWidth
        self.path = pyreonFlowEdgePath(segments)
        self.resolvedColor = pyreonFlowEdgeColor(color)
        self.dashCG = dash.map { $0.map { CGFloat($0) } }
    }
}

public func pyreonNearestFlowEdge(_ edges: [PyreonFlowEdgeStroke], point: PyreonXYPosition, zoom: Double) -> PyreonFlowEdgeStroke? {
    let safeZoom = max(zoom, 0.000001)
    return edges.filter { pyreonFlowEdgeDistance($0.segments, point: point) <= $0.interactionWidth / 2 / safeZoom }
        .min { pyreonFlowEdgeDistance($0.segments, point: point) < pyreonFlowEdgeDistance($1.segments, point: point) }
}

/// Draws every edge in `edges`, applying the SAME viewport transform (pan +
/// uniform zoom) the web edge layer's CSS transform applies to its whole
/// `<svg>` — ONE transform on the drawing context, not one per edge. Each
/// stroke's `Path`/`Color`/dash are prebuilt (see `PyreonFlowEdgeStroke`), so
/// the closure does no allocation or parsing per edge: measured E = 9,999,
/// the v1 closure (rebuild + `applying` per edge + hex parse) was 6.9 ms;
/// prebuilt paths under one context transform are ~0.25 ms.
///
/// Stroke width and dash are in FLOW units and scale with the zoom through
/// the context transform — the same visual result as v1's `width * zoom`.
///
/// `Equatable` (edges + viewport): wrap the canvas in `.equatable()` (or
/// `EquatableView`) so a parent invalidation with an unchanged draw list skips
/// the redraw entirely.
public struct PyreonFlowEdgeCanvas: View, Equatable {
    public var edges: [PyreonFlowEdgeStroke]
    public var viewport: PyreonFlowViewport
    public init(edges: [PyreonFlowEdgeStroke], viewport: PyreonFlowViewport = PyreonFlowViewport()) {
        self.edges = edges
        self.viewport = viewport
    }

    public var body: some View {
        Canvas { context, _ in
            var ctx = context
            ctx.translateBy(x: CGFloat(viewport.x), y: CGFloat(viewport.y))
            ctx.scaleBy(x: CGFloat(viewport.zoom), y: CGFloat(viewport.zoom))
            for edge in edges {
                var style = StrokeStyle(lineWidth: CGFloat(edge.width), lineJoin: .round)
                if let d = edge.dashCG { style.dash = d }
                ctx.stroke(edge.path, with: .color(edge.resolvedColor), style: style)
                for marker in [edge.startMarker, edge.endMarker].compactMap({ $0 }) {
                    guard let first = marker.points.first else { continue }
                    var markerPath = Path(); markerPath.move(to: CGPoint(x: first.x, y: first.y))
                    for point in marker.points.dropFirst() { markerPath.addLine(to: CGPoint(x: point.x, y: point.y)) }
                    if marker.closed { markerPath.closeSubpath(); ctx.fill(markerPath, with: .color(pyreonFlowEdgeColor(marker.color))) }
                    else { ctx.stroke(markerPath, with: .color(pyreonFlowEdgeColor(marker.color)), lineWidth: marker.strokeWidth) }
                }
            }
        }
    }
}

/// A compiler target for a shared-source custom edge's SVG `<path>`. The
/// compiler passes the path helper result itself (not the serialized `d`), so
/// native keeps the exact move/line/cubic/quad geometry without parsing SVG.
public struct PyreonFlowCustomEdgePath: View {
    public var result: PyreonFlowPathResult
    /// The stroke colour; `nil` draws no stroke (SVG `stroke: none`).
    public var color: String?
    public var width: Double
    public var dash: [Double]?
    /// The fill colour; `nil` draws no fill (SVG `fill: none`).
    public var fill: String?
    public init(result: PyreonFlowPathResult, color: String? = "#999999", width: Double = 1.5, dash: [Double]? = nil, fill: String? = nil) {
        self.result = result; self.color = color; self.width = width; self.dash = dash; self.fill = fill
    }
    public var body: some View {
        Canvas { context, _ in
            let path = pyreonFlowEdgePath(result.segments)
            if let fill { context.fill(path, with: .color(pyreonFlowEdgeColor(fill))) }
            guard let color else { return }
            var style = StrokeStyle(lineWidth: CGFloat(width), lineJoin: .round)
            if let dash { style.dash = dash.map { CGFloat($0) } }
            context.stroke(path, with: .color(pyreonFlowEdgeColor(color)), style: style)
        }
        .allowsHitTesting(false)
    }
}

extension PyreonFlowPathResult {
    /// Parses SVG path data (the `d` attribute) into the same absolute
    /// segments the path helpers produce, so a custom edge or connection line
    /// drawn from an arbitrary path string renders natively. Every command is
    /// supported, absolute and relative: M L H V C S Q T A Z. Arcs become cubic
    /// curves; `Z` becomes a line back to the subpath start. Parsing stops at
    /// the first malformed token, keeping what came before, as a browser does.
    /// The label point is the centre of the segment endpoints' bounds.
    public init(svgPath d: String) {
        let segments = pyreonFlowParseSvgPath(d)
        let xs = segments.map(\.x), ys = segments.map(\.y)
        let labelX = xs.isEmpty ? 0 : (xs.min()! + xs.max()!) / 2
        let labelY = ys.isEmpty ? 0 : (ys.min()! + ys.max()!) / 2
        self.init(labelX: labelX, labelY: labelY, segments: segments)
    }
}

/// SVG path data to absolute segments. See `PyreonFlowPathResult(svgPath:)`.
public func pyreonFlowParseSvgPath(_ d: String) -> [PyreonFlowEdgeSegment] {
    let chars = Array(d.unicodeScalars)
    var i = 0
    var out: [PyreonFlowEdgeSegment] = []
    var cx = 0.0, cy = 0.0, startX = 0.0, startY = 0.0
    var lastCubic: (Double, Double)? = nil
    var lastQuad: (Double, Double)? = nil
    var command: Character? = nil

    func skipSeparators() {
        while i < chars.count, chars[i] == " " || chars[i] == "," || chars[i] == "\n" || chars[i] == "\t" || chars[i] == "\r" { i += 1 }
    }
    func isCommand(_ c: Unicode.Scalar) -> Bool { "MmLlHhVvCcSsQqTtAaZz".unicodeScalars.contains(c) }
    func number() -> Double? {
        skipSeparators()
        guard i < chars.count else { return nil }
        var text = ""
        var sawDot = false, sawExp = false, sawDigit = false
        if chars[i] == "+" || chars[i] == "-" { text.unicodeScalars.append(chars[i]); i += 1 }
        while i < chars.count {
            let c = chars[i]
            if c >= "0" && c <= "9" { text.unicodeScalars.append(c); sawDigit = true; i += 1 }
            else if c == "." && !sawDot && !sawExp { text.unicodeScalars.append(c); sawDot = true; i += 1 }
            else if (c == "e" || c == "E") && sawDigit && !sawExp {
                sawExp = true; text.unicodeScalars.append(c); i += 1
                if i < chars.count, chars[i] == "+" || chars[i] == "-" { text.unicodeScalars.append(chars[i]); i += 1 }
            } else { break }
        }
        return sawDigit ? Double(text) : nil
    }
    func flag() -> Bool? {
        skipSeparators()
        guard i < chars.count, chars[i] == "0" || chars[i] == "1" else { return nil }
        let value = chars[i] == "1"
        i += 1
        return value
    }

    parse: while true {
        skipSeparators()
        guard i < chars.count else { break }
        if isCommand(chars[i]) {
            command = Character(chars[i])
            i += 1
        } else if command == nil {
            break
        }
        guard let cmd = command else { break }
        let relative = cmd.isLowercase
        let ox = relative ? cx : 0, oy = relative ? cy : 0
        switch cmd.uppercased() {
        case "Z":
            out.append(.line(startX, startY))
            cx = startX; cy = startY
            lastCubic = nil; lastQuad = nil
            command = nil
        case "M":
            guard let x = number(), let y = number() else { break parse }
            cx = ox + x; cy = oy + y; startX = cx; startY = cy
            out.append(.move(cx, cy))
            lastCubic = nil; lastQuad = nil
            // Coordinate pairs after a moveto are implicit linetos.
            command = relative ? "l" : "L"
        case "L":
            guard let x = number(), let y = number() else { break parse }
            cx = ox + x; cy = oy + y
            out.append(.line(cx, cy)); lastCubic = nil; lastQuad = nil
        case "H":
            guard let x = number() else { break parse }
            cx = ox + x
            out.append(.line(cx, cy)); lastCubic = nil; lastQuad = nil
        case "V":
            guard let y = number() else { break parse }
            cy = oy + y
            out.append(.line(cx, cy)); lastCubic = nil; lastQuad = nil
        case "C":
            guard let x1 = number(), let y1 = number(), let x2 = number(), let y2 = number(), let x = number(), let y = number() else { break parse }
            let c2 = (ox + x2, oy + y2)
            cx = ox + x; cy = oy + y
            out.append(.cubic(cx, cy, c1x: ox + x1, c1y: oy + y1, c2x: c2.0, c2y: c2.1))
            lastCubic = c2; lastQuad = nil
        case "S":
            guard let x2 = number(), let y2 = number(), let x = number(), let y = number() else { break parse }
            let c1 = lastCubic.map { (2 * cx - $0.0, 2 * cy - $0.1) } ?? (cx, cy)
            let c2 = (ox + x2, oy + y2)
            cx = ox + x; cy = oy + y
            out.append(.cubic(cx, cy, c1x: c1.0, c1y: c1.1, c2x: c2.0, c2y: c2.1))
            lastCubic = c2; lastQuad = nil
        case "Q":
            guard let x1 = number(), let y1 = number(), let x = number(), let y = number() else { break parse }
            let c = (ox + x1, oy + y1)
            cx = ox + x; cy = oy + y
            out.append(.quad(cx, cy, cx: c.0, cy: c.1))
            lastQuad = c; lastCubic = nil
        case "T":
            guard let x = number(), let y = number() else { break parse }
            let c = lastQuad.map { (2 * cx - $0.0, 2 * cy - $0.1) } ?? (cx, cy)
            cx = ox + x; cy = oy + y
            out.append(.quad(cx, cy, cx: c.0, cy: c.1))
            lastQuad = c; lastCubic = nil
        case "A":
            guard let rx = number(), let ry = number(), let rotation = number(),
                  let large = flag(), let sweep = flag(), let x = number(), let y = number() else { break parse }
            let ex = ox + x, ey = oy + y
            out.append(contentsOf: pyreonFlowArcToCubics(x0: cx, y0: cy, rx: rx, ry: ry, rotation: rotation, largeArc: large, sweep: sweep, x: ex, y: ey))
            cx = ex; cy = ey
            lastCubic = nil; lastQuad = nil
        default:
            break parse
        }
    }
    return out
}

/// An SVG elliptical arc as cubic Béziers (endpoint-to-centre conversion from
/// the SVG spec, appendix F.6), at most a quarter turn per curve.
func pyreonFlowArcToCubics(x0: Double, y0: Double, rx rxIn: Double, ry ryIn: Double, rotation: Double, largeArc: Bool, sweep: Bool, x: Double, y: Double) -> [PyreonFlowEdgeSegment] {
    if x0 == x && y0 == y { return [] }
    var rx = abs(rxIn), ry = abs(ryIn)
    if rx == 0 || ry == 0 { return [.line(x, y)] }
    let phi = rotation * .pi / 180
    let cosPhi = cos(phi), sinPhi = sin(phi)
    let dx = (x0 - x) / 2, dy = (y0 - y) / 2
    let x1p = cosPhi * dx + sinPhi * dy
    let y1p = -sinPhi * dx + cosPhi * dy
    let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lambda > 1 { rx *= lambda.squareRoot(); ry *= lambda.squareRoot() }
    let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    var coef = den == 0 ? 0 : (max(0, num / den)).squareRoot()
    if largeArc == sweep { coef = -coef }
    let cxp = coef * rx * y1p / ry
    let cyp = -coef * ry * x1p / rx
    let centerX = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2
    let centerY = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2
    func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
        let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a
    }
    let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if !sweep && delta > 0 { delta -= 2 * .pi }
    if sweep && delta < 0 { delta += 2 * .pi }
    let pieces = max(1, Int((abs(delta) / (.pi / 2)).rounded(.up)))
    let step = delta / Double(pieces)
    let k = 4.0 / 3.0 * tan(step / 4)
    var out: [PyreonFlowEdgeSegment] = []
    var t = theta1
    func point(_ a: Double) -> (Double, Double) {
        let px = rx * cos(a), py = ry * sin(a)
        return (cosPhi * px - sinPhi * py + centerX, sinPhi * px + cosPhi * py + centerY)
    }
    func derivative(_ a: Double) -> (Double, Double) {
        let px = -rx * sin(a), py = ry * cos(a)
        return (cosPhi * px - sinPhi * py, sinPhi * px + cosPhi * py)
    }
    for piece in 0..<pieces {
        let t2 = t + step
        let p1 = point(t), p2 = point(t2)
        let d1 = derivative(t), d2 = derivative(t2)
        let end = piece == pieces - 1 ? (x, y) : p2
        out.append(.cubic(end.0, end.1, c1x: p1.0 + k * d1.0, c1y: p1.1 + k * d1.1, c2x: p2.0 - k * d2.0, c2y: p2.1 - k * d2.1))
        t = t2
    }
    return out
}

// MARK: - Inline <svg> in a native Flow renderer

/// One shape of a lowered `<svg>`. The compiler turns every SVG shape
/// (`path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, and
/// the shapes inside a `<g>`) into path data, so a single draw routine covers
/// them all. Paint is already resolved, inheritance included.
public struct PyreonFlowSvgShape: Equatable {
    public var result: PyreonFlowPathResult
    /// The stroke colour; `nil` draws no stroke (SVG `stroke: none`, the initial value).
    public var stroke: String?
    public var strokeWidth: Double
    /// The fill colour; `nil` draws no fill (SVG `fill: none`).
    public var fill: String?
    public init(result: PyreonFlowPathResult, stroke: String? = nil, strokeWidth: Double = 1, fill: String? = "#000000") {
        self.result = result; self.stroke = stroke; self.strokeWidth = strokeWidth; self.fill = fill
    }
}

/// The `<svg>` element's rendered size, in points. An explicit `width` and
/// `height` win. With only one, the other follows the viewBox's aspect ratio.
/// With neither, the replaced-element default applies: 300 wide, and 150 high
/// or the viewBox's aspect.
public func pyreonFlowSvgSize(width: Double?, height: Double?, viewBox: [Double]?) -> (width: Double, height: Double) {
    let aspect: Double? = {
        guard let vb = viewBox, vb.count == 4, vb[2] > 0, vb[3] > 0 else { return nil }
        return vb[3] / vb[2]
    }()
    switch (width, height) {
    case let (w?, h?): return (w, h)
    case let (w?, nil): return (w, aspect.map { w * $0 } ?? 150)
    case let (nil, h?): return (aspect.map { h / $0 } ?? 300, h)
    case (nil, nil): return (300, aspect.map { 300 * $0 } ?? 150)
    }
}

/// Maps viewBox units onto the viewport. The default `preserveAspectRatio`
/// (`xMidYMid meet`) scales uniformly to fit and centres; `stretch` is
/// `preserveAspectRatio="none"`. Without a viewBox, user units are points.
public func pyreonFlowSvgTransform(width: Double, height: Double, viewBox: [Double]?, stretch: Bool = false) -> (scaleX: Double, scaleY: Double, translateX: Double, translateY: Double) {
    guard let vb = viewBox, vb.count == 4, vb[2] > 0, vb[3] > 0 else { return (1, 1, 0, 0) }
    if stretch {
        let sx = width / vb[2], sy = height / vb[3]
        return (sx, sy, -vb[0] * sx, -vb[1] * sy)
    }
    let s = min(width / vb[2], height / vb[3])
    return (s, s, -vb[0] * s + (width - vb[2] * s) / 2, -vb[1] * s + (height - vb[3] * s) / 2)
}

/// A lowered inline `<svg>`: its shapes drawn in one `Canvas`, sized and
/// scaled the way the browser sizes and scales the element. Strokes scale
/// with the viewBox, as they do on the web.
public struct PyreonFlowSvg: View {
    public var width: Double?
    public var height: Double?
    public var viewBox: [Double]?
    public var stretch: Bool
    public var shapes: [PyreonFlowSvgShape]
    public init(width: Double? = nil, height: Double? = nil, viewBox: [Double]? = nil, stretch: Bool = false, shapes: [PyreonFlowSvgShape]) {
        self.width = width; self.height = height; self.viewBox = viewBox; self.stretch = stretch; self.shapes = shapes
    }
    public var body: some View {
        let size = pyreonFlowSvgSize(width: width, height: height, viewBox: viewBox)
        let t = pyreonFlowSvgTransform(width: size.width, height: size.height, viewBox: viewBox, stretch: stretch)
        return Canvas { context, _ in
            context.translateBy(x: CGFloat(t.translateX), y: CGFloat(t.translateY))
            context.scaleBy(x: CGFloat(t.scaleX), y: CGFloat(t.scaleY))
            for shape in shapes {
                let path = pyreonFlowEdgePath(shape.result.segments)
                if let fill = shape.fill { context.fill(path, with: .color(pyreonFlowEdgeColor(fill))) }
                if let stroke = shape.stroke {
                    context.stroke(path, with: .color(pyreonFlowEdgeColor(stroke)), style: StrokeStyle(lineWidth: CGFloat(shape.strokeWidth)))
                }
            }
        }
        .frame(width: CGFloat(size.width), height: CGFloat(size.height))
        .allowsHitTesting(false)
    }
}

// MARK: - Stacking order (mirrors the web's z-order.ts)

/// A node's z-index: its own `zIndex`, +1000 while dragged, +100 while selected when `elevate`.
public func pyreonFlowNodeZ(zIndex: Double?, selected: Bool, dragging: Bool, elevate: Bool) -> Double {
    (zIndex ?? 0) + (dragging ? 1000 : (selected && elevate ? 100 : 0))
}

/// An edge's stacking key: its own `zIndex`, +1000 while selected when `elevate`.
public func pyreonFlowEdgeZ(zIndex: Double?, selected: Bool, elevate: Bool) -> Double {
    (zIndex ?? 0) + (selected && elevate ? 1000 : 0)
}

/// Edges in drawing order: a STABLE sort by `pyreonFlowEdgeZ` (Swift's own
/// sort is not stable, so the original index breaks ties). Returns the input
/// unchanged when nothing would move.
public func pyreonFlowOrderedEdges(_ edges: [PyreonFlowEdge], elevate: Bool, isSelected: (String) -> Bool) -> [PyreonFlowEdge] {
    let anyZ = edges.contains { ($0.zIndex ?? 0) != 0 }
    guard anyZ || (elevate && edges.contains { isSelected($0.id) }) else { return edges }
    // Spelled out step by step: the chained form is too slow for swiftc's
    // type checker ("unable to type-check this expression in reasonable time").
    var keyed: [(index: Int, z: Double)] = []
    keyed.reserveCapacity(edges.count)
    for (index, edge) in edges.enumerated() {
        let z: Double = pyreonFlowEdgeZ(zIndex: edge.zIndex, selected: isSelected(edge.id), elevate: elevate)
        keyed.append((index: index, z: z))
    }
    keyed.sort { (a: (index: Int, z: Double), b: (index: Int, z: Double)) -> Bool in
        a.z != b.z ? a.z < b.z : a.index < b.index
    }
    return keyed.map { (entry: (index: Int, z: Double)) -> PyreonFlowEdge in edges[entry.index] }
}

// MARK: - Auto-pan (mirrors the web's auto-pan.ts)

/// How far to pan the viewport this frame while a node or connection is
/// dragged at canvas point (`x`, `y`) in a `width` x `height` canvas: within
/// `threshold` of an edge, toward it, faster the closer; past it, full `speed`.
public func pyreonFlowAutoPanVelocity(x: Double, y: Double, width: Double, height: Double, speed: Double = 15, threshold: Double = 40) -> (x: Double, y: Double) {
    func axis(_ value: Double, _ size: Double) -> Double {
        guard size > 2 * threshold else { return 0 }
        if value < threshold { return min(max(threshold - value, 1), threshold) / threshold }
        if value > size - threshold { return -min(max(value - (size - threshold), 1), threshold) / threshold }
        return 0
    }
    return (axis(x, width) * speed, axis(y, height) * speed)
}
