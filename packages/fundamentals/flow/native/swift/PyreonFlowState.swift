// PyreonFlowState — the iOS-native port of @pyreon/flow's dependency-free
// `createFlow`. Same node/edge/viewport/selection behaviour as the
// TypeScript engine (`flow.ts`), so a diagram author gets 1:1 results on
// web AND native from one mental model.
//
// Scope: node/edge CRUD, selection, viewport (pan/zoom/fitView), graph
// queries, configuration, layout, search, snapping, endpoint/path geometry,
// and the interactive native hosts are ported.
//
// Unlike `PyreonTableState` (which WRAPS an external reactive data source),
// `createFlow({ nodes, edges })` OWNS its data — nodes/edges are seeded once
// and mutated through this class's own methods. That means no post-init
// `.onAppear` wiring dance is needed here; the `@State` initializer is
// fully self-contained, closer to `PyreonMachine`'s shape than the table's.
//
// `containerSize` is SETTABLE (not init-only) because it mirrors the web
// engine's `containerSize: Signal<{width,height}>` — written by the hosting
// view's own size measurement (`GeometryReader`/`onSizeChanged`), exactly
// the same "component writes back into the engine" shape the web
// `<Flow>` component's `ResizeObserver` uses. `fitView` reads it.

import Foundation
import Observation

/// Resolves one declaration from Flow's portable inline CSS-string surface.
/// Native renderers intentionally consume only properties with direct native
/// equivalents; unknown declarations remain preserved on the model.
public func pyreonFlowStyleValue(_ style: String?, _ property: String) -> String? {
    guard let style else { return nil }
    let wanted = property.lowercased()
    for declaration in style.split(separator: ";") {
        let pair = declaration.split(separator: ":", maxSplits: 1)
        guard pair.count == 2,
              pair[0].trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == wanted
        else { continue }
        let value = pair[1].trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
    return nil
}

public func pyreonFlowStyleNumber(_ style: String?, _ property: String) -> Double? {
    guard var value = pyreonFlowStyleValue(style, property) else { return nil }
    if value.lowercased().hasSuffix("px") { value.removeLast(2) }
    return Double(value.trimmingCharacters(in: .whitespacesAndNewlines))
}

public struct PyreonFlowNodeInlineStyle: Equatable {
    public var width: Double?; public var height: Double?; public var padding: Double
    public var backgroundColor: String?; public var borderColor: String?
    public var borderWidth: Double; public var borderRadius: Double; public var opacity: Double
}

public func pyreonFlowNodeInlineStyle(_ style: String?) -> PyreonFlowNodeInlineStyle {
    let background = pyreonFlowStyleValue(style, "background-color") ?? pyreonFlowStyleValue(style, "background")
    return PyreonFlowNodeInlineStyle(
        width: pyreonFlowStyleNumber(style, "width"),
        height: pyreonFlowStyleNumber(style, "height"),
        padding: max(0, pyreonFlowStyleNumber(style, "padding") ?? 0),
        backgroundColor: background?.hasPrefix("#") == true ? background : nil,
        borderColor: pyreonFlowStyleValue(style, "border-color").flatMap { $0.hasPrefix("#") ? $0 : nil },
        borderWidth: max(0, pyreonFlowStyleNumber(style, "border-width") ?? 0),
        borderRadius: max(0, pyreonFlowStyleNumber(style, "border-radius") ?? 0),
        opacity: min(1, max(0, pyreonFlowStyleNumber(style, "opacity") ?? 1)))
}
import Dispatch
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// A 2D point in flow (unscaled diagram) coordinates.
public struct PyreonXYPosition: Equatable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}
public struct PyreonFlowDimensions: Equatable {
    public let width: Double
    public let height: Double
    public init(width: Double, height: Double) { self.width = width; self.height = height }
}

/// Pan/zoom state — mirrors the web `Viewport`.
public struct PyreonFlowViewport: Equatable {
    public var x: Double
    public var y: Double
    public var zoom: Double
    public init(x: Double = 0, y: Double = 0, zoom: Double = 1) {
        self.x = x
        self.y = y
        self.zoom = zoom
    }
}

/// A node — generic over `T`, the user's `data` payload (mirrors `FlowNode<TData>`).
/// `Equatable` when `T` is, so a SwiftUI view can be `Equatable` over it.
public struct PyreonFlowNode<T> {
    public var id: String
    public var type: String?
    public var position: PyreonXYPosition
    public var data: T
    public var width: Double?
    public var height: Double?
    public var draggable: Bool?
    public var selectable: Bool?
    public var connectable: Bool?
    public var focusable: Bool?
    public var ariaLabel: String?
    public var hidden: Bool?
    public var deletable: Bool?
    public var className: String?
    public var style: String?
    public var parentId: String?
    public var extent: PyreonFlowNodeExtent?
    public var extentParent: Bool
    public var expandParent: Bool?
    public var group: Bool?
    public var sourceHandles: [PyreonFlowHandleConfig]
    public var targetHandles: [PyreonFlowHandleConfig]

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
        targetHandles: [PyreonFlowHandleConfig] = []
    ) {
        self.id = id
        self.type = type
        self.position = position
        self.data = data
        self.width = width
        self.height = height
        self.draggable = draggable
        self.selectable = selectable
        self.connectable = connectable
        self.focusable = focusable
        self.ariaLabel = ariaLabel
        self.hidden = hidden
        self.deletable = deletable
        self.className = className
        self.style = style
        self.parentId = parentId
        self.extent = extent
        self.extentParent = extentParent
        self.expandParent = expandParent
        self.group = group
        self.sourceHandles = sourceHandles
        self.targetHandles = targetHandles
    }
}

extension PyreonFlowNode: Equatable where T: Equatable {}

/// The hosting view's measured pixel size — mirrors the web `containerSize`
/// signal. A STRUCT (not the tuple v1 used) so it has one spelling on both
/// targets (`PyreonFlowContainerSize` in Kotlin) and a shape PMTC can lower to.
public struct PyreonFlowContainerSize: Equatable {
    public var width: Double
    public var height: Double
    public init(width: Double = 0, height: Double = 0) {
        self.width = width
        self.height = height
    }
}

public struct PyreonFlowNodeExtent: Equatable {
    public var minX: Double
    public var minY: Double
    public var maxX: Double
    public var maxY: Double
    public init(minX: Double, minY: Double, maxX: Double, maxY: Double) {
        self.minX = minX; self.minY = minY; self.maxX = maxX; self.maxY = maxY
    }
}
public struct PyreonFlowSelection<T> {
    public let nodes: [PyreonFlowNode<T>]
    public let edges: [PyreonFlowEdge]
}
public struct PyreonFlowNodeChange: Equatable {
    public let type: String
    public let id: String
    public let position: PyreonXYPosition?
    public init(type: String, id: String, position: PyreonXYPosition? = nil) { self.type = type; self.id = id; self.position = position }
}
public struct PyreonFlowEdgeChange: Equatable {
    public let type: String
    public let id: String?
    public let edge: PyreonFlowEdge?
    public init(type: String, id: String? = nil, edge: PyreonFlowEdge? = nil) { self.type = type; self.id = id; self.edge = edge }
}
public struct PyreonFlowConnectStart: Equatable { public let nodeId: String; public let handleId: String }
public struct PyreonFlowPaneEvent: Equatable { public let position: PyreonXYPosition }
public struct PyreonFlowSnapshot<T> {
    public let nodes: [PyreonFlowNode<T>]
    public let edges: [PyreonFlowEdge]
    public let viewport: PyreonFlowViewport?
    public init(nodes: [PyreonFlowNode<T>], edges: [PyreonFlowEdge], viewport: PyreonFlowViewport? = nil) {
        self.nodes = nodes; self.edges = edges; self.viewport = viewport
    }
}
public struct PyreonFlowSnapLines: Equatable {
    public let x: Double?
    public let y: Double?
    public let snappedPosition: PyreonXYPosition
    public init(x: Double?, y: Double?, snappedPosition: PyreonXYPosition) {
        self.x = x; self.y = y; self.snappedPosition = snappedPosition
    }
}
public struct PyreonFlowLayoutPosition: Equatable {
    public let id: String
    public let position: PyreonXYPosition
}
public struct PyreonFlowLayoutOptions: Equatable {
    public var direction: String
    public var nodeSpacing: Double
    public var layerSpacing: Double
    public var animate: Bool
    public var animationDuration: Double
    public init(direction: String = "DOWN", nodeSpacing: Double = 20, layerSpacing: Double = 40, animate: Bool = true, animationDuration: Double = 300) {
        self.direction = direction; self.nodeSpacing = nodeSpacing; self.layerSpacing = layerSpacing
        self.animate = animate; self.animationDuration = animationDuration
    }
}

/// Native twin of the public async `computeLayout` helper. The engine itself
/// is synchronous on every target; `async` preserves shared-source call sites.
public func pyreonComputeFlowLayout<T>(
    _ nodes: [PyreonFlowNode<T>],
    edges: [PyreonFlowEdge],
    algorithm: String = "layered",
    options: PyreonFlowLayoutOptions = PyreonFlowLayoutOptions()
) async -> [PyreonFlowLayoutPosition] {
    var positions: [PyreonFlowLayoutPosition]
    switch algorithm {
    case "tree": positions = pyreonFlowTreeLayout(nodes, edges: edges, direction: options.direction, nodeSpacing: options.nodeSpacing, layerSpacing: options.layerSpacing)
    case "force": positions = pyreonFlowForceLayout(nodes, edges: edges, nodeSpacing: options.nodeSpacing)
    case "stress": positions = pyreonFlowStressLayout(nodes, edges: edges, nodeSpacing: options.nodeSpacing)
    case "radial": positions = pyreonFlowRadialLayout(nodes, edges: edges, nodeSpacing: options.nodeSpacing)
    case "box": positions = pyreonFlowPackingLayout(nodes, spacing: options.nodeSpacing)
    case "rectpacking": positions = pyreonFlowPackingLayout(nodes, spacing: options.nodeSpacing, sortByHeight: true)
    default: positions = pyreonFlowLayeredLayout(nodes, edges: edges, direction: options.direction, nodeSpacing: options.nodeSpacing, layerSpacing: options.layerSpacing)
    }
    let minimumX = positions.map(\.position.x).min() ?? 0
    let minimumY = positions.map(\.position.y).min() ?? 0
    guard minimumX < 0 || minimumY < 0 else { return positions }
    return positions.map { item in
        PyreonFlowLayoutPosition(id: item.id, position: PyreonXYPosition(
            x: item.position.x - min(0, minimumX),
            y: item.position.y - min(0, minimumY)))
    }
}

public func pyreonFlowPackingLayout<T>(_ nodes: [PyreonFlowNode<T>], spacing: Double = 20, sortByHeight: Bool = false) -> [PyreonFlowLayoutPosition] {
    let indexed = Array(nodes.enumerated())
    let items = sortByHeight ? indexed.sorted {
        let ah = $0.element.height ?? pyreonFlowDefaultNodeHeight, bh = $1.element.height ?? pyreonFlowDefaultNodeHeight
        if ah != bh { return ah > bh }
        let aw = $0.element.width ?? pyreonFlowDefaultNodeWidth, bw = $1.element.width ?? pyreonFlowDefaultNodeWidth
        if aw != bw { return aw > bw }
        return $0.offset < $1.offset
    } : indexed
    guard !items.isEmpty else { return [] }
    let columns = max(1, Int(ceil(sqrt(Double(items.count)))))
    let widest = items.map { $0.element.width ?? pyreonFlowDefaultNodeWidth }.max() ?? pyreonFlowDefaultNodeWidth
    let target = widest * Double(columns) + spacing * Double(columns - 1)
    var x = 0.0, y = 0.0, rowHeight = 0.0
    return items.map { item in
        let node = item.element
        let width = node.width ?? pyreonFlowDefaultNodeWidth
        let height = node.height ?? pyreonFlowDefaultNodeHeight
        if x > 0 && x + width > target { x = 0; y += rowHeight + spacing; rowHeight = 0 }
        let result = PyreonFlowLayoutPosition(id: node.id, position: PyreonXYPosition(x: x, y: y))
        x += width + spacing; rowHeight = max(rowHeight, height)
        return result
    }
}

public func pyreonFlowTreeLayout<T>(
    _ nodes: [PyreonFlowNode<T>],
    edges: [PyreonFlowEdge],
    direction: String = "DOWN",
    nodeSpacing: Double = 20,
    layerSpacing: Double = 40
) -> [PyreonFlowLayoutPosition] {
    guard !nodes.isEmpty else { return [] }
    let ids = nodes.map(\.id)
    let known = Set(ids)
    let boxes = Dictionary(uniqueKeysWithValues: nodes.map {
        ($0.id, (width: $0.width ?? pyreonFlowDefaultNodeWidth, height: $0.height ?? pyreonFlowDefaultNodeHeight))
    })
    var adjacency = Dictionary(uniqueKeysWithValues: ids.map { ($0, [String]()) })
    for edge in edges where known.contains(edge.source) && known.contains(edge.target) && edge.source != edge.target {
        adjacency[edge.source, default: []].append(edge.target)
    }
    var indegree = Dictionary(uniqueKeysWithValues: ids.map { ($0, 0) })
    for outgoing in adjacency.values {
        for target in outgoing { indegree[target, default: 0] += 1 }
    }
    var children = Dictionary(uniqueKeysWithValues: ids.map { ($0, [String]()) })
    var depth: [String: Int] = [:]
    var queue = ids.filter { indegree[$0] == 0 }
    if queue.isEmpty, let first = ids.first { queue = [first] }
    for root in queue { depth[root] = 0 }
    var cursor = 0
    while cursor < queue.count {
        let id = queue[cursor]
        cursor += 1
        for child in adjacency[id] ?? [] where depth[child] == nil {
            depth[child] = (depth[id] ?? 0) + 1
            children[id, default: []].append(child)
            queue.append(child)
        }
    }
    for id in ids where depth[id] == nil { depth[id] = 0 }
    let maxDepth = ids.map { depth[$0] ?? 0 }.max() ?? 0
    var layers = Array(repeating: [String](), count: maxDepth + 1)
    for id in ids { layers[depth[id] ?? 0].append(id) }
    let horizontal = direction == "LEFT" || direction == "RIGHT"
    func cross(_ id: String) -> Double { horizontal ? boxes[id]!.height : boxes[id]!.width }
    func main(_ id: String) -> Double { horizontal ? boxes[id]!.width : boxes[id]!.height }
    let extents = layers.map { layer in
        layer.enumerated().reduce(0.0) { $0 + cross($1.element) + ($1.offset > 0 ? nodeSpacing : 0) }
    }
    let widest = extents.max() ?? 0
    var positions: [String: PyreonXYPosition] = [:]
    var mainOffset = 0.0
    for (layerIndex, layer) in layers.enumerated() {
        let layerDepth = layer.map(main).max() ?? 0
        var crossOffset = (widest - extents[layerIndex]) / 2
        for id in layer {
            let along = mainOffset + (layerDepth - main(id)) / 2
            positions[id] = horizontal ? PyreonXYPosition(x: along, y: crossOffset) : PyreonXYPosition(x: crossOffset, y: along)
            crossOffset += cross(id) + nodeSpacing
        }
        mainOffset += layerDepth + layerSpacing
    }
    if maxDepth > 0 {
        for layerIndex in stride(from: maxDepth - 1, through: 0, by: -1) {
            for id in layers[layerIndex] {
                let kids = children[id] ?? []
                guard !kids.isEmpty else { continue }
                let centres = kids.map { child -> Double in
                    let point = positions[child]!
                    return horizontal ? point.y + boxes[child]!.height / 2 : point.x + boxes[child]!.width / 2
                }
                let middle = ((centres.min() ?? 0) + (centres.max() ?? 0)) / 2
                let point = positions[id]!
                positions[id] = horizontal
                    ? PyreonXYPosition(x: point.x, y: middle - boxes[id]!.height / 2)
                    : PyreonXYPosition(x: middle - boxes[id]!.width / 2, y: point.y)
            }
        }
    }
    for layer in layers {
        let sorted = layer.sorted {
            let a = positions[$0]!, b = positions[$1]!
            return horizontal ? a.y < b.y : a.x < b.x
        }
        var edge = -Double.infinity
        for id in sorted {
            let point = positions[id]!
            let start = horizontal ? point.y : point.x
            let next = max(start, edge)
            positions[id] = horizontal ? PyreonXYPosition(x: point.x, y: next) : PyreonXYPosition(x: next, y: point.y)
            edge = next + cross(id) + nodeSpacing
        }
    }
    if direction == "UP" || direction == "LEFT" {
        let maximum = ids.map { id -> Double in
            let point = positions[id]!
            return horizontal ? point.x + boxes[id]!.width : point.y + boxes[id]!.height
        }.max() ?? 0
        for id in ids {
            let point = positions[id]!
            positions[id] = horizontal
                ? PyreonXYPosition(x: maximum - point.x - boxes[id]!.width, y: point.y)
                : PyreonXYPosition(x: point.x, y: maximum - point.y - boxes[id]!.height)
        }
    }
    return ids.map { PyreonFlowLayoutPosition(id: $0, position: positions[$0]!) }
}

private func pyreonFlowRelaxOverlaps<T>(_ nodes: [PyreonFlowNode<T>], positions: inout [String: PyreonXYPosition], spacing: Double, passes: Int = 10) {
    guard !nodes.isEmpty else { return }
    let half = 1 << 15, span = half * 2
    func key(_ x: Int, _ y: Int) -> Int { (x + half) * span + (y + half) }
    let boxes = Dictionary(uniqueKeysWithValues: nodes.map {
        ($0.id, (width: $0.width ?? pyreonFlowDefaultNodeWidth, height: $0.height ?? pyreonFlowDefaultNodeHeight))
    })
    let cell = max(1, nodes.map { max($0.width ?? pyreonFlowDefaultNodeWidth, $0.height ?? pyreonFlowDefaultNodeHeight) }.max()! + spacing)
    for _ in 0..<passes {
        var buckets: [Int: [String]] = [:], bucketOrder: [Int] = []
        for node in nodes {
            let point = positions[node.id]!, cellKey = key(Int(floor(point.x / cell)), Int(floor(point.y / cell)))
            if buckets[cellKey] == nil { buckets[cellKey] = []; bucketOrder.append(cellKey) }
            buckets[cellKey]!.append(node.id)
        }
        var moved = false
        for bucketKey in bucketOrder {
            let cx = bucketKey / span - half, cy = bucketKey % span - half
            var near: [String] = []
            for ox in -1...1 { for oy in -1...1 { near.append(contentsOf: buckets[key(cx + ox, cy + oy)] ?? []) } }
            for id in buckets[bucketKey]! { for otherID in near where id != otherID {
                var a = positions[id]!, b = positions[otherID]!
                let ba = boxes[id]!, bb = boxes[otherID]!
                let overlapX = (ba.width + bb.width) / 2 + spacing - abs(a.x + ba.width / 2 - (b.x + bb.width / 2))
                let overlapY = (ba.height + bb.height) / 2 + spacing - abs(a.y + ba.height / 2 - (b.y + bb.height / 2))
                if overlapX <= 0 || overlapY <= 0 { continue }
                moved = true
                if overlapX < overlapY {
                    let direction = a.x <= b.x ? -1.0 : 1.0
                    a.x += direction * overlapX / 2; b.x -= direction * overlapX / 2
                } else {
                    let direction = a.y <= b.y ? -1.0 : 1.0
                    a.y += direction * overlapY / 2; b.y -= direction * overlapY / 2
                }
                positions[id] = a; positions[otherID] = b
            } }
        }
        if !moved { break }
    }
}

private struct PyreonFlowRandom {
    private var state: UInt32
    init(seed: UInt32 = 0x02f6e2b1) { state = seed }
    mutating func next() -> Double {
        state ^= state << 13
        state ^= UInt32(bitPattern: Int32(bitPattern: state) >> 17)
        state ^= state << 5
        return Double(state) / Double(UInt32.max)
    }
}

public func pyreonFlowForceLayout<T>(
    _ nodes: [PyreonFlowNode<T>], edges: [PyreonFlowEdge], nodeSpacing: Double = 20
) -> [PyreonFlowLayoutPosition] {
    guard !nodes.isEmpty else { return [] }
    let ids = nodes.map(\.id), count = nodes.count
    let average = nodes.reduce(0.0) { sum, node in
        sum + max(node.width ?? pyreonFlowDefaultNodeWidth, node.height ?? pyreonFlowDefaultNodeHeight)
    } / Double(count)
    let ideal = (average + nodeSpacing) * 1.4, area = ideal * sqrt(Double(count))
    let iterations = count <= 100 ? 300 : count <= 400 ? 120 : 60
    let cell = ideal * 2, half = 1 << 15, span = half * 2, maxPartners = 24
    func exactKey(_ x: Int, _ y: Int) -> Int { (x + half) * span + (y + half) }
    func key(_ x: Double, _ y: Double) -> Int { exactKey(Int(floor(x)), Int(floor(y))) }
    var random = PyreonFlowRandom(), x = Array(repeating: 0.0, count: count), y = x
    let index = Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($0.element, $0.offset) })
    for i in 0..<count {
        let angle = Double(i) / Double(count) * Double.pi * 2
        x[i] = cos(angle) * area + random.next() * ideal * 0.1
        y[i] = sin(angle) * area + random.next() * ideal * 0.1
    }
    let known = Set(ids)
    let links = edges.compactMap { edge -> (Int, Int)? in
        guard known.contains(edge.source), known.contains(edge.target), edge.source != edge.target else { return nil }
        return (index[edge.source]!, index[edge.target]!)
    }
    var dx = Array(repeating: 0.0, count: count), dy = dx, temperature = area / 4
    for _ in 0..<iterations {
        dx = Array(repeating: 0, count: count); dy = dx
        var buckets: [Int: [Int]] = [:], bucketOrder: [Int] = []
        for i in 0..<count {
            let bucketKey = key(x[i] / cell, y[i] / cell)
            if buckets[bucketKey] == nil { buckets[bucketKey] = []; bucketOrder.append(bucketKey) }
            buckets[bucketKey]!.append(i)
        }
        for bucketKey in bucketOrder {
            let cx = bucketKey / span - half, cy = bucketKey % span - half
            var partners: [Int] = []
            outer: for ox in -1...1 { for oy in -1...1 {
                for value in buckets[exactKey(cx + ox, cy + oy)] ?? [] {
                    partners.append(value)
                    if partners.count >= maxPartners { break outer }
                }
            } }
            for i in buckets[bucketKey]! { for j in partners where i != j {
                var ux = x[i] - x[j], uy = y[i] - y[j], distance = sqrt(ux * ux + uy * uy)
                if distance < 0.01 {
                    ux = (random.next() - 0.5) * 0.1; uy = (random.next() - 0.5) * 0.1
                    distance = sqrt(ux * ux + uy * uy); if distance == 0 { distance = 0.01 }
                }
                let repulsion = ideal * ideal / distance
                dx[i] += ux / distance * repulsion; dy[i] += uy / distance * repulsion
            } }
        }
        for (a, b) in links {
            let ux = x[a] - x[b], uy = y[a] - y[b]
            var distance = sqrt(ux * ux + uy * uy); if distance == 0 { distance = 0.01 }
            let attraction = distance * distance / ideal
            dx[a] -= ux / distance * attraction; dy[a] -= uy / distance * attraction
            dx[b] += ux / distance * attraction; dy[b] += uy / distance * attraction
        }
        for i in 0..<count {
            var magnitude = sqrt(dx[i] * dx[i] + dy[i] * dy[i]); if magnitude == 0 { magnitude = 1 }
            x[i] += dx[i] / magnitude * min(magnitude, temperature)
            y[i] += dy[i] / magnitude * min(magnitude, temperature)
        }
        temperature *= 0.975
    }
    let minX = x.min() ?? 0, minY = y.min() ?? 0
    var positions = Dictionary(uniqueKeysWithValues: ids.enumerated().map {
        ($0.element, PyreonXYPosition(x: x[$0.offset] - minX, y: y[$0.offset] - minY))
    })
    pyreonFlowRelaxOverlaps(nodes, positions: &positions, spacing: nodeSpacing)
    return ids.map { PyreonFlowLayoutPosition(id: $0, position: positions[$0]!) }
}

public func pyreonFlowStressLayout<T>(
    _ nodes: [PyreonFlowNode<T>], edges: [PyreonFlowEdge], nodeSpacing: Double = 20
) -> [PyreonFlowLayoutPosition] {
    guard !nodes.isEmpty else { return [] }
    let ids = nodes.map(\.id), count = nodes.count
    let index = Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($0.element, $0.offset) })
    let average = nodes.reduce(0.0) { sum, node in
        sum + max(node.width ?? pyreonFlowDefaultNodeWidth, node.height ?? pyreonFlowDefaultNodeHeight)
    } / Double(count)
    let unit = average + nodeSpacing, known = Set(ids)
    var adjacency = Array(repeating: [Int](), count: count)
    for edge in edges where known.contains(edge.source) && known.contains(edge.target) && edge.source != edge.target {
        let source = index[edge.source]!, target = index[edge.target]!
        adjacency[source].append(target); adjacency[target].append(source)
    }
    func bfs(_ source: Int) -> [Double] {
        var row = Array(repeating: Double.infinity, count: count); row[source] = 0
        var queue = [source], cursor = 0
        while cursor < queue.count {
            let current = queue[cursor]; cursor += 1
            for next in adjacency[current] where row[next] == .infinity {
                row[next] = row[current] + 1; queue.append(next)
            }
        }
        return row
    }
    let pivotCount = min(count, 64)
    var pivots = [0], rows = [bfs(0)], best = rows[0]
    while pivots.count < pivotCount {
        var far = 0, farDistance = -1.0
        for i in 0..<count where best[i] != .infinity && best[i] > farDistance {
            farDistance = best[i]; far = i
        }
        if pivots.contains(far) {
            guard let unused = (0..<count).first(where: { !pivots.contains($0) }) else { break }
            far = unused
        }
        pivots.append(far)
        let row = bfs(far); rows.append(row)
        for i in 0..<count where row[i] < best[i] { best[i] = row[i] }
    }
    var diameter = 1.0
    for row in rows { for distance in row where distance != .infinity { diameter = max(diameter, distance) } }
    for rowIndex in rows.indices { for i in 0..<count where rows[rowIndex][i] == .infinity { rows[rowIndex][i] = diameter + 1 } }
    let pivotTotal = pivots.count
    var flat = Array(repeating: 0.0, count: pivotTotal * count)
    for pivotIndex in 0..<pivotTotal { for i in 0..<count { flat[pivotIndex * count + i] = rows[pivotIndex][i] } }
    var random = PyreonFlowRandom(seed: 0x51f3a7)
    let radius = unit * sqrt(Double(count))
    var x = Array(repeating: 0.0, count: count), y = x
    for i in 0..<count {
        let angle = Double(i) / Double(count) * Double.pi * 2
        x[i] = cos(angle) * radius + random.next() * 0.01
        y[i] = sin(angle) * radius + random.next() * 0.01
    }
    let iterations = count <= 200 ? 150 : count <= 600 ? 60 : 30
    for _ in 0..<iterations { for i in 0..<count {
        var nextX = 0.0, nextY = 0.0, weightSum = 0.0
        for pivotIndex in 0..<pivotTotal {
            let other = pivots[pivotIndex]
            if i == other { continue }
            let target = flat[pivotIndex * count + i] * unit
            if target <= 0 { continue }
            let weight = 1 / (target * target), deltaX = x[i] - x[other], deltaY = y[i] - y[other]
            var distance = sqrt(deltaX * deltaX + deltaY * deltaY); if distance == 0 { distance = 0.01 }
            nextX += weight * (x[other] + target * deltaX / distance)
            nextY += weight * (y[other] + target * deltaY / distance)
            weightSum += weight
        }
        if weightSum > 0 { x[i] = nextX / weightSum; y[i] = nextY / weightSum }
    } }
    let minX = x.min() ?? 0, minY = y.min() ?? 0
    var positions = Dictionary(uniqueKeysWithValues: ids.enumerated().map {
        ($0.element, PyreonXYPosition(x: x[$0.offset] - minX, y: y[$0.offset] - minY))
    })
    pyreonFlowRelaxOverlaps(nodes, positions: &positions, spacing: nodeSpacing)
    return ids.map { PyreonFlowLayoutPosition(id: $0, position: positions[$0]!) }
}

public func pyreonFlowLayeredLayout<T>(
    _ nodes: [PyreonFlowNode<T>], edges: [PyreonFlowEdge], direction: String = "DOWN",
    nodeSpacing: Double = 20, layerSpacing: Double = 40
) -> [PyreonFlowLayoutPosition] {
    guard !nodes.isEmpty else { return [] }
    let ids = nodes.map(\.id), known = Set(nodes.map(\.id))
    let boxes = Dictionary(uniqueKeysWithValues: nodes.map {
        ($0.id, (width: $0.width ?? pyreonFlowDefaultNodeWidth, height: $0.height ?? pyreonFlowDefaultNodeHeight))
    })
    var adjacency = Dictionary(uniqueKeysWithValues: ids.map { ($0, [String]()) })
    for edge in edges where known.contains(edge.source) && known.contains(edge.target) && edge.source != edge.target {
        adjacency[edge.source, default: []].append(edge.target)
    }
    var state = Dictionary(uniqueKeysWithValues: ids.map { ($0, 0) })
    var dag = Dictionary(uniqueKeysWithValues: ids.map { ($0, [String]()) })
    func visit(_ id: String) {
        state[id] = 1
        for next in adjacency[id] ?? [] {
            let nextState = state[next] ?? 0
            if nextState == 1 { dag[next, default: []].append(id); continue }
            dag[id, default: []].append(next)
            if nextState == 0 { visit(next) }
        }
        state[id] = 2
    }
    for id in ids where state[id] == 0 { visit(id) }
    var indegree = Dictionary(uniqueKeysWithValues: ids.map { ($0, 0) })
    for outgoing in dag.values { for target in outgoing { indegree[target, default: 0] += 1 } }
    var depth = Dictionary(uniqueKeysWithValues: ids.map { ($0, 0) })
    var queue = ids.filter { indegree[$0] == 0 }, seen = Set(ids.filter { indegree[$0] == 0 }), cursor = 0
    while cursor < queue.count {
        let id = queue[cursor]; cursor += 1
        for target in dag[id] ?? [] {
            depth[target] = max(depth[target] ?? 0, (depth[id] ?? 0) + 1)
            let left = (indegree[target] ?? 0) - 1; indegree[target] = left
            if left == 0 && !seen.contains(target) { seen.insert(target); queue.append(target) }
        }
    }
    let maxDepth = ids.map { depth[$0] ?? 0 }.max() ?? 0
    var layers = Array(repeating: [String](), count: maxDepth + 1)
    for id in ids { layers[depth[id] ?? 0].append(id) }
    var predecessors = Dictionary(uniqueKeysWithValues: ids.map { ($0, [String]()) })
    for (source, outgoing) in dag { for target in outgoing { predecessors[target, default: []].append(source) } }
    for sweep in 0..<4 {
        let downward = sweep % 2 == 0
        let layerIndices = downward ? Array(1..<layers.count) : Array((0..<max(0, layers.count - 1)).reversed())
        for layerIndex in layerIndices {
            let fixed = downward ? layers[layerIndex - 1] : layers[layerIndex + 1]
            let fixedPosition = Dictionary(uniqueKeysWithValues: fixed.enumerated().map { ($0.element, $0.offset) })
            func neighbours(_ id: String) -> [String] { downward ? (predecessors[id] ?? []) : (dag[id] ?? []) }
            func median(_ id: String) -> Int {
                let values = neighbours(id).compactMap { fixedPosition[$0] }.sorted()
                return values.isEmpty ? -1 : values[values.count / 2]
            }
            let stable = Dictionary(uniqueKeysWithValues: layers[layerIndex].enumerated().map { ($0.element, $0.offset) })
            layers[layerIndex].sort { a, b in
                let left = median(a), right = median(b)
                if left == -1 || right == -1 { return stable[a]! < stable[b]! }
                return left == right ? stable[a]! < stable[b]! : left < right
            }
            func crossings(_ left: String, _ right: String) -> Int {
                let a = neighbours(left).compactMap { fixedPosition[$0] }, b = neighbours(right).compactMap { fixedPosition[$0] }
                return a.reduce(0) { sum, x in sum + b.filter { x > $0 }.count }
            }
            for _ in 0..<2 {
                var swapped = false
                if layers[layerIndex].count > 1 { for i in 0..<(layers[layerIndex].count - 1) {
                    let a = layers[layerIndex][i], b = layers[layerIndex][i + 1]
                    if crossings(b, a) < crossings(a, b) {
                        layers[layerIndex][i] = b; layers[layerIndex][i + 1] = a; swapped = true
                    }
                } }
                if !swapped { break }
            }
        }
    }
    let horizontal = direction == "LEFT" || direction == "RIGHT"
    func cross(_ id: String) -> Double { horizontal ? boxes[id]!.height : boxes[id]!.width }
    func main(_ id: String) -> Double { horizontal ? boxes[id]!.width : boxes[id]!.height }
    let extents = layers.map { layer in layer.enumerated().reduce(0.0) { $0 + cross($1.element) + ($1.offset > 0 ? nodeSpacing : 0) } }
    let widest = extents.max() ?? 0
    var mainOffset = 0.0, positions: [String: PyreonXYPosition] = [:]
    for (layerIndex, layer) in layers.enumerated() {
        let layerDepth = layer.map(main).max() ?? 0; var crossOffset = (widest - extents[layerIndex]) / 2
        for id in layer {
            let along = mainOffset + (layerDepth - main(id)) / 2
            positions[id] = horizontal ? PyreonXYPosition(x: along, y: crossOffset) : PyreonXYPosition(x: crossOffset, y: along)
            crossOffset += cross(id) + nodeSpacing
        }
        mainOffset += layerDepth + layerSpacing
    }
    if direction == "UP" || direction == "LEFT" {
        let maximum = ids.map { id -> Double in let point = positions[id]!; return horizontal ? point.x + boxes[id]!.width : point.y + boxes[id]!.height }.max() ?? 0
        for id in ids {
            let point = positions[id]!
            positions[id] = horizontal ? PyreonXYPosition(x: maximum - point.x - boxes[id]!.width, y: point.y) : PyreonXYPosition(x: point.x, y: maximum - point.y - boxes[id]!.height)
        }
    }
    return ids.map { PyreonFlowLayoutPosition(id: $0, position: positions[$0]!) }
}

public func pyreonFlowRadialLayout<T>(
    _ nodes: [PyreonFlowNode<T>], edges: [PyreonFlowEdge], nodeSpacing: Double = 20
) -> [PyreonFlowLayoutPosition] {
    guard !nodes.isEmpty else { return [] }
    let ids = nodes.map(\.id), known = Set(nodes.map(\.id))
    let boxes = Dictionary(uniqueKeysWithValues: nodes.map {
        ($0.id, (width: $0.width ?? pyreonFlowDefaultNodeWidth, height: $0.height ?? pyreonFlowDefaultNodeHeight))
    })
    var adjacency = Dictionary(uniqueKeysWithValues: ids.map { ($0, [String]()) })
    for edge in edges where known.contains(edge.source) && known.contains(edge.target) && edge.source != edge.target {
        adjacency[edge.source, default: []].append(edge.target)
    }
    var indegree = Dictionary(uniqueKeysWithValues: ids.map { ($0, 0) })
    for outgoing in adjacency.values { for target in outgoing { indegree[target, default: 0] += 1 } }
    let roots = ids.filter { indegree[$0] == 0 }
    var queue = roots.first.map { [$0] } ?? Array(ids.prefix(1))
    var depth: [String: Int] = [:]
    for root in queue { depth[root] = 0 }
    var cursor = 0
    while cursor < queue.count {
        let id = queue[cursor]; cursor += 1
        for child in adjacency[id] ?? [] where depth[child] == nil {
            depth[child] = (depth[id] ?? 0) + 1; queue.append(child)
        }
    }
    for id in ids where depth[id] == nil { depth[id] = 1 }
    let average = nodes.reduce(0.0) { sum, node in
        sum + max(node.width ?? pyreonFlowDefaultNodeWidth, node.height ?? pyreonFlowDefaultNodeHeight)
    } / Double(nodes.count)
    let ring = average + nodeSpacing * 2
    var byDepth: [Int: [String]] = [:]
    for id in ids { byDepth[depth[id] ?? 0, default: []].append(id) }
    var raw: [String: PyreonXYPosition] = [:]
    var previousRadius = 0.0
    for level in byDepth.keys.sorted() {
        let layer = byDepth[level]!
        if level == 0 {
            for (index, id) in layer.enumerated() {
                let box = boxes[id]!
                raw[id] = PyreonXYPosition(x: Double(index) * (average + nodeSpacing) - box.width / 2, y: -box.height / 2)
            }
            continue
        }
        let rootCount = byDepth[0]?.count ?? 1
        let centreClear = Double(rootCount) * (average + nodeSpacing) / 2 + average / 2 + nodeSpacing
        let radius = max(Double(level) * ring, centreClear, Double(layer.count) * (average + nodeSpacing) / (2 * Double.pi), previousRadius + average + nodeSpacing)
        previousRadius = radius
        for (index, id) in layer.enumerated() {
            let angle = Double(index) / Double(layer.count) * Double.pi * 2, box = boxes[id]!
            raw[id] = PyreonXYPosition(x: cos(angle) * radius - box.width / 2, y: sin(angle) * radius - box.height / 2)
        }
    }
    let minX = ids.map { raw[$0]?.x ?? 0 }.min() ?? 0, minY = ids.map { raw[$0]?.y ?? 0 }.min() ?? 0
    var positions = Dictionary(uniqueKeysWithValues: ids.map { id in
        let point = raw[id] ?? PyreonXYPosition(x: 0, y: 0)
        return (id, PyreonXYPosition(x: point.x - minX, y: point.y - minY))
    })
    pyreonFlowRelaxOverlaps(nodes, positions: &positions, spacing: nodeSpacing)
    return ids.map { PyreonFlowLayoutPosition(id: $0, position: positions[$0]!) }
}

/// An edge — mirrors `FlowEdge`'s core fields, including editable waypoints.
public indirect enum PyreonFlowDataValue: Equatable, CustomStringConvertible {
    case string(String), number(Double), bool(Bool), object(PyreonFlowData), array([PyreonFlowDataValue]), null
    public var description: String {
        switch self {
        case .string(let value): return value
        case .number(let value): return value.rounded() == value ? String(Int(value)) : String(value)
        case .bool(let value): return String(value)
        case .object(let value): return String(describing: value)
        case .array(let value): return String(describing: value)
        case .null: return "null"
        }
    }
}

@dynamicMemberLookup
public struct PyreonFlowData: Equatable {
    public var values: [String: PyreonFlowDataValue]
    public init(_ values: [String: PyreonFlowDataValue] = [:]) { self.values = values }
    public subscript(dynamicMember key: String) -> PyreonFlowDataValue? { values[key] }
    public subscript(_ key: String) -> PyreonFlowDataValue? { values[key] }
}

public struct PyreonFlowEdge: Equatable {
    public var id: String
    public var source: String
    public var target: String
    public var sourceHandle: String?
    public var targetHandle: String?
    /// Never `nil` once stored: the engine applies the web `normalizeEdge`
    /// default (`type ?? 'bezier'`) on seed AND `addEdge`, so `edges[i].type`
    /// reads the same on every target.
    public var type: String?
    public var label: String?
    public var animated: Bool
    public var animatedSpecified: Bool
    public var focusable: Bool?
    public var ariaLabel: String?
    public var hidden: Bool?
    public var deletable: Bool?
    public var reconnectable: Bool?
    public var interactionWidth: Double?
    public var className: String?
    public var style: String?
    public var data: PyreonFlowData?
    public var curvature: Double?
    public var borderRadius: Double?
    public var pathOffset: Double?
    public var markerStart: PyreonFlowMarker?
    public var markerEnd: PyreonFlowMarker?
    public var markerEndSpecified: Bool
    public var waypoints: [PyreonXYPosition]

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
        waypoints: [PyreonXYPosition] = []
    ) {
        self.id = id
        self.source = source
        self.target = target
        self.sourceHandle = sourceHandle
        self.targetHandle = targetHandle
        self.type = type
        self.label = label
        self.animated = animated
        self.animatedSpecified = animatedSpecified || animated
        self.focusable = focusable
        self.ariaLabel = ariaLabel
        self.hidden = hidden
        self.deletable = deletable
        self.reconnectable = reconnectable
        self.interactionWidth = interactionWidth
        self.className = className
        self.style = style
        self.data = data
        self.curvature = curvature
        self.borderRadius = borderRadius
        self.pathOffset = pathOffset
        self.markerStart = markerStart
        self.markerEnd = markerEnd
        self.markerEndSpecified = markerEndSpecified
        self.waypoints = waypoints
    }
}

/// Deterministic missing-id fallback used by the web Flow engine.
public func pyreonFlowEdgeId(source: String, target: String, sourceHandle: String? = nil, targetHandle: String? = nil) -> String {
    "e-\(source)\(sourceHandle.map { "-\($0)" } ?? "")-\(target)\(targetHandle.map { "-\($0)" } ?? "")"
}

public struct PyreonFlowDefaultEdgeOptions: Equatable {
    public var type: String?; public var label: String?; public var animated: Bool?
    public var focusable: Bool?; public var ariaLabel: String?; public var hidden: Bool?
    public var deletable: Bool?; public var reconnectable: Bool?; public var interactionWidth: Double?
    public var curvature: Double?; public var borderRadius: Double?; public var pathOffset: Double?
    public var markerStart: PyreonFlowMarker?; public var markerEnd: PyreonFlowMarker?; public var markerEndSpecified: Bool
    public init(type: String? = nil, label: String? = nil, animated: Bool? = nil, focusable: Bool? = nil, ariaLabel: String? = nil, hidden: Bool? = nil, deletable: Bool? = nil, reconnectable: Bool? = nil, interactionWidth: Double? = nil, curvature: Double? = nil, borderRadius: Double? = nil, pathOffset: Double? = nil, markerStart: PyreonFlowMarker? = nil, markerEnd: PyreonFlowMarker? = nil, markerEndSpecified: Bool = false) {
        self.type = type; self.label = label; self.animated = animated; self.focusable = focusable; self.ariaLabel = ariaLabel; self.hidden = hidden; self.deletable = deletable; self.reconnectable = reconnectable; self.interactionWidth = interactionWidth; self.curvature = curvature; self.borderRadius = borderRadius; self.pathOffset = pathOffset; self.markerStart = markerStart; self.markerEnd = markerEnd; self.markerEndSpecified = markerEndSpecified
    }
}

public struct PyreonFlowConnection: Equatable {
    public var source: String
    public var target: String
    public var sourceHandle: String?
    public var targetHandle: String?
    public init(source: String, target: String, sourceHandle: String? = nil, targetHandle: String? = nil) {
        self.source = source; self.target = target; self.sourceHandle = sourceHandle; self.targetHandle = targetHandle
    }
}

public struct PyreonFlowMarker: Equatable {
    public var type: String
    public var color: String?
    public var width: Double
    public var height: Double
    public var strokeWidth: Double
    public init(type: String, color: String? = nil, width: Double = 10, height: Double = 7, strokeWidth: Double = 1) {
        self.type = type; self.color = color; self.width = width; self.height = height; self.strokeWidth = strokeWidth
    }
}

public struct PyreonFlowResolvedMarkers: Equatable {
    public let start: PyreonFlowMarker?
    public let end: PyreonFlowMarker?
    public init(start: PyreonFlowMarker?, end: PyreonFlowMarker?) { self.start = start; self.end = end }
}

public let pyreonFlowDefaultMarkerEnd = PyreonFlowMarker(type: "arrowclosed")

public func pyreonResolveFlowMarker(_ marker: PyreonFlowMarker?) -> PyreonFlowMarker? {
    guard let marker else { return nil }
    return PyreonFlowMarker(type: marker.type, color: marker.color ?? "#999999", width: marker.width, height: marker.height, strokeWidth: marker.strokeWidth)
}

private func pyreonFlowMarkerNumber(_ value: Double) -> String {
    value.rounded() == value ? String(Int(value)) : String(value)
}

public func pyreonFlowMarkerId(_ marker: PyreonFlowMarker) -> String {
    let color = (marker.color ?? "#999999").lowercased().replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression)
    return "pyreon-flow-marker-\(marker.type)-\(color)-\(pyreonFlowMarkerNumber(marker.width))x\(pyreonFlowMarkerNumber(marker.height))-\(pyreonFlowMarkerNumber(marker.strokeWidth))"
}

public func pyreonResolveFlowEdgeMarkers(_ edge: PyreonFlowEdge, defaultMarkerEnd: PyreonFlowMarker?) -> PyreonFlowResolvedMarkers {
    PyreonFlowResolvedMarkers(start: pyreonResolveFlowMarker(edge.markerStart), end: pyreonResolveFlowMarker(edge.markerEndSpecified ? edge.markerEnd : defaultMarkerEnd))
}

public func pyreonCollectFlowEdgeMarkers(_ edges: [PyreonFlowEdge], defaultMarkerEnd: PyreonFlowMarker?) -> [String: PyreonFlowMarker] {
    var result: [String: PyreonFlowMarker] = [:]
    for edge in edges {
        let markers = pyreonResolveFlowEdgeMarkers(edge, defaultMarkerEnd: defaultMarkerEnd)
        if let start = markers.start { result[pyreonFlowMarkerId(start)] = start }
        if let end = markers.end { result[pyreonFlowMarkerId(end)] = end }
    }
    return result
}

/// Default node box when a node declares no explicit width/height — the
/// SAME `150×40` fallback `DEFAULT_NODE_WIDTH`/`DEFAULT_NODE_HEIGHT` use on
/// web (`edges.ts`), so `fitView` frames the graph identically on every
/// target even before real measured sizes are wired in (a Phase 2 follow-up:
/// a per-node `GeometryReader` writing its real size back, mirroring the web
/// `measurements` map).
public let pyreonFlowDefaultNodeWidth: Double = 150
public let pyreonFlowDefaultNodeHeight: Double = 40

/// The web `normalizeEdge` default — `type ?? 'bezier'` (`flow.ts`).
public let pyreonFlowDefaultEdgeType = "bezier"

/// One node's observable cell. This is the whole reason the state is not a
/// single `[PyreonFlowNode]` property: with `@Observable`, an ARRAY is one
/// tracked property, so a view reading `nodes[i].position` re-evaluates
/// whenever ANY element changes — measured 1000/1000 node views invalidated
/// by one `updateNodePosition` at N = 1,000. The web engine gates fan-out
/// per id (`flow.ts` per-id equality computeds: O(1 + deg) per drag frame).
/// Per-node boxes restore that: a position write touches only this box's
/// `node`, so only the views that read THIS node re-evaluate. Views that
/// read the whole `nodes` array still see every change — correctly.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonFlowNodeBox<T> {
    public internal(set) var node: PyreonFlowNode<T>
    init(_ node: PyreonFlowNode<T>) { self.node = node }
}

/// Reactive flow-diagram state: nodes, edges, viewport, selection. Behaviour-
/// identical to the TS `createFlow` for the v1 surface documented above.
///
/// `@Observable` so a SwiftUI view reading `nodes`/`edges`/`viewport`
/// re-renders on mutation — same binding shape as `PyreonTableState`.
///
/// STORAGE (the performance contract — measured before/after, see the PR):
///   - the engine's OWN truth is `nodeStore: [String: PyreonFlowNode<T>]` +
///     `order: [String]`, both `@ObservationIgnored`: id-keyed, so `getNode`/
///     `updateNodePosition` are O(1) hash lookups on a NON-generic `String`
///     key (the v1 `nodes.first { $0.id == id }` scan was O(n) AND paid a
///     15–33× unspecialized-generic penalty in Debug/simulator builds — the
///     builds every device gate runs), and plain, so internal loops
///     (`fitView`, `deleteSelected`, graph queries) iterate at array speed.
///   - `boxes: [String: PyreonFlowNodeBox<T>]` are NOTIFICATION cells only:
///     every write lands in the store AND the node's box. `getNode(id)`
///     reads the box, so it is the per-node subscription point for a view.
///     Boxes are deliberately NOT read by engine internals: an `@Observable`
///     property read costs ~2.6 µs of registrar work, and a first cut that
///     iterated boxes made `fitView` 100× SLOWER (26 ms at N = 10,000).
///   - `nodesVersion` is the ONE observable a whole-array reader subscribes
///     to: `nodes` reads it, then walks the plain store. Bumped on every
///     node add/remove/move, so a `nodes` reader sees every change while a
///     `getNode(id)` reader sees only its own.
///   - selection is an insertion-ordered array (what `selectedNodes()`
///     returns — the web `Set` iterates in insertion order too) PAIRED with a
///     `Set<String>` for O(1) membership; v1's array named `…IdSet` was O(K)
///     per `isNodeSelected`, i.e. O(N·K) per render pass.
///   - `edgeIds: Set<String>` makes `addEdge`'s dedupe O(1).
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonFlowState<T> {
    private struct HistorySnapshot {
        let nodes: [PyreonFlowNode<T>]
        let edges: [PyreonFlowEdge]
    }
    @ObservationIgnored private var order: [String] = []
    @ObservationIgnored private var nodeStore: [String: PyreonFlowNode<T>] = [:]
    public private(set) var measurements: [String: PyreonFlowNodeMeasurement] = [:]
    @ObservationIgnored private var boxes: [String: PyreonFlowNodeBox<T>] = [:]
    /// Bumped on every node add/remove/move — the whole-array subscription.
    private var nodesVersion: UInt = 0
    /// Every node in insertion order. Reading it subscribes to EVERY node
    /// change (use `getNode(id)` in per-node views).
    public var nodes: [PyreonFlowNode<T>] {
        _ = nodesVersion
        return order.map { nodeStore[$0]! }
    }
    /// Reactive O(1) lookup view matching the web FlowInstance computed.
    public var nodeLookup: [String: PyreonFlowNode<T>] {
        _ = nodesVersion
        return nodeStore
    }

    public private(set) var edges: [PyreonFlowEdge] = []
    private var edgeIds: Set<String> = []
    public var edgeLookup: [String: PyreonFlowEdge] {
        Dictionary(uniqueKeysWithValues: edges.map { ($0.id, $0) })
    }

    public private(set) var viewport: PyreonFlowViewport
    /// Written by the hosting view's own size measurement — see the file header.
    public var containerSize = PyreonFlowContainerSize()

    private var selectedNodeIds: [String] = []
    private var selectedNodeIdSet: Set<String> = []
    private var selectedEdgeIds: [String] = []
    private var selectedEdgeIdSet: Set<String> = []

    private let minZoom: Double
    private let maxZoom: Double
    private var nodeExtent: PyreonFlowNodeExtent?
    private let snapToGrid: Bool
    private let snapGrid: Double
    private let connectionRules: [String: [String]]?
    public let defaultMarkerEnd: PyreonFlowMarker?
    public let nodesDraggable: Bool; public let nodesConnectable: Bool; public let nodesSelectable: Bool; public let nodesFocusable: Bool
    public let edgesFocusable: Bool; public let disableKeyboardA11y: Bool; public let nodesDeletable: Bool; public let edgesDeletable: Bool; public let edgesReconnectable: Bool
    public let edgeInteractionWidth: Double; public let connectionRadius: Double; public let pannable: Bool; public let panOnDrag: Bool; public let panOnScroll: Bool; public let panOnScrollSpeed: Double; public let zoomable: Bool; public let zoomOnScroll: Bool; public let zoomOnPinch: Bool; public let zoomOnDoubleClick: Bool; public let selectionOnDrag: Bool; public let selectionMode: String; public let multiSelect: Bool; public let onlyRenderVisibleElements: Bool; public let snapToObjects: Bool
    public let defaultEdgeType: String; public let connectionLineType: String; public let defaultEdgeOptions: PyreonFlowDefaultEdgeOptions; public let fitViewOnLoad: Bool; public let fitViewPadding: Double
    public let autoHistory: Bool
    public let deleteKeys: [String]?; public let multiSelectionKey: String?; public let selectionKey: String?; public let zoomActivationKey: String?; public let preventScrolling: Bool
    @ObservationIgnored private var undoStack: [HistorySnapshot] = []
    @ObservationIgnored private var redoStack: [HistorySnapshot] = []
    @ObservationIgnored private var mutationVersion = 0
    @ObservationIgnored private var checkpointVersion = -1
    @ObservationIgnored private var clipboard: HistorySnapshot?
    @ObservationIgnored private var pasteCounter = 0
    @ObservationIgnored private var connectListeners: [UUID: (PyreonFlowConnection) -> Void] = [:]
    @ObservationIgnored private var viewportListeners: [UUID: (PyreonFlowViewport) -> Void] = [:]
    @ObservationIgnored private var nodeClickListeners: [UUID: (PyreonFlowNode<T>) -> Void] = [:]
    @ObservationIgnored private var nodeDoubleClickListeners: [UUID: (PyreonFlowNode<T>) -> Void] = [:]
    @ObservationIgnored private var nodeDragStartListeners: [UUID: (PyreonFlowNode<T>) -> Void] = [:]
    @ObservationIgnored private var nodeDragListeners: [UUID: (PyreonFlowNode<T>) -> Void] = [:]
    @ObservationIgnored private var nodeDragEndListeners: [UUID: (PyreonFlowNode<T>) -> Void] = [:]
    @ObservationIgnored private var edgeClickListeners: [UUID: (PyreonFlowEdge) -> Void] = [:]
    @ObservationIgnored private var selectionListeners: [UUID: (PyreonFlowSelection<T>) -> Void] = [:]
    @ObservationIgnored private var nodesDeleteListeners: [UUID: ([PyreonFlowNode<T>]) -> Void] = [:]
    @ObservationIgnored private var edgesDeleteListeners: [UUID: ([PyreonFlowEdge]) -> Void] = [:]
    @ObservationIgnored private var nodesChangeListeners: [UUID: ([PyreonFlowNodeChange]) -> Void] = [:]
    @ObservationIgnored private var edgesChangeListeners: [UUID: ([PyreonFlowEdgeChange]) -> Void] = [:]
    @ObservationIgnored private var connectStartListeners: [UUID: (PyreonFlowConnectStart) -> Void] = [:]
    @ObservationIgnored private var connectEndListeners: [UUID: (PyreonFlowConnection?) -> Void] = [:]
    @ObservationIgnored private var paneClickListeners: [UUID: (PyreonFlowPaneEvent) -> Void] = [:]
    @ObservationIgnored private let connectionValidator: ((PyreonFlowConnection) -> Bool)?
    @ObservationIgnored private let searchText: ((T) -> String?)?
    @ObservationIgnored private var viewportAnimationGeneration = 0
    @ObservationIgnored private var layoutAnimationGeneration = 0
    private let reducedMotion: Bool?
    private var shouldReduceMotion: Bool {
        if let reducedMotion { return reducedMotion }
#if canImport(UIKit)
        return UIAccessibility.isReduceMotionEnabled
#elseif canImport(AppKit)
        return NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
#else
        return false
#endif
    }

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
        edgeInteractionWidth: Double = 20, connectionRadius: Double = 0, pannable: Bool = true, panOnDrag: Bool = true, panOnScroll: Bool = false, panOnScrollSpeed: Double = 0.5, zoomable: Bool = true, zoomOnScroll: Bool = true, zoomOnPinch: Bool = true, zoomOnDoubleClick: Bool = false, selectionOnDrag: Bool = false, selectionMode: String = "partial", multiSelect: Bool = true, onlyRenderVisibleElements: Bool = false, snapToObjects: Bool = true,
        defaultEdgeType: String = "bezier", connectionLineType: String = "bezier", defaultEdgeOptions: PyreonFlowDefaultEdgeOptions = PyreonFlowDefaultEdgeOptions(), fitView: Bool = false, fitViewPadding: Double = 0.1, autoHistory: Bool = true,
        isValidConnection: ((PyreonFlowConnection) -> Bool)? = nil,
        searchText: ((T) -> String?)? = nil,
        reducedMotion: Bool? = nil,
        deleteKeys: [String]? = ["Delete", "Backspace"], multiSelectionKey: String? = "shift", selectionKey: String? = "shift", zoomActivationKey: String? = "ctrl", preventScrolling: Bool = true
    ) {
        self.viewport = viewport
        self.minZoom = minZoom
        self.maxZoom = maxZoom
        self.snapToGrid = snapToGrid
        self.snapGrid = snapGrid
        self.nodeExtent = nodeExtent
        self.connectionRules = connectionRules
        self.defaultMarkerEnd = defaultMarkerEnd
        self.nodesDraggable = nodesDraggable; self.nodesConnectable = nodesConnectable; self.nodesSelectable = nodesSelectable; self.nodesFocusable = nodesFocusable
        self.edgesFocusable = edgesFocusable; self.disableKeyboardA11y = disableKeyboardA11y; self.nodesDeletable = nodesDeletable; self.edgesDeletable = edgesDeletable; self.edgesReconnectable = edgesReconnectable
        self.edgeInteractionWidth = edgeInteractionWidth; self.connectionRadius = max(0, connectionRadius); self.pannable = pannable; self.panOnDrag = panOnDrag; self.panOnScroll = panOnScroll; self.panOnScrollSpeed = panOnScrollSpeed; self.zoomable = zoomable; self.zoomOnScroll = zoomOnScroll; self.zoomOnPinch = zoomOnPinch; self.zoomOnDoubleClick = zoomOnDoubleClick; self.selectionOnDrag = selectionOnDrag; self.selectionMode = selectionMode == "full" ? "full" : "partial"; self.multiSelect = multiSelect; self.onlyRenderVisibleElements = onlyRenderVisibleElements; self.snapToObjects = snapToObjects
        self.defaultEdgeType = defaultEdgeType; self.connectionLineType = connectionLineType; self.defaultEdgeOptions = defaultEdgeOptions; self.fitViewOnLoad = fitView; self.fitViewPadding = max(0, fitViewPadding)
        self.autoHistory = autoHistory
        self.connectionValidator = isValidConnection
        self.searchText = searchText
        self.reducedMotion = reducedMotion
        self.deleteKeys = deleteKeys; self.multiSelectionKey = multiSelectionKey; self.selectionKey = selectionKey; self.zoomActivationKey = zoomActivationKey; self.preventScrolling = preventScrolling
        for node in nodes { insertNode(node) }
        for edge in edges { insertEdge(edge) }
        mutationVersion = 0
    }

    private func markMutation() { mutationVersion &+= 1 }
    public func batch(_ operation: () -> Void) { operation() }
    public func dispose() {
        viewportAnimationGeneration &+= 1; layoutAnimationGeneration &+= 1
        undoStack.removeAll(); redoStack.removeAll(); clipboard = nil
        connectListeners.removeAll(); viewportListeners.removeAll()
        nodeClickListeners.removeAll(); nodeDoubleClickListeners.removeAll()
        nodeDragStartListeners.removeAll(); nodeDragListeners.removeAll(); nodeDragEndListeners.removeAll()
        edgeClickListeners.removeAll(); selectionListeners.removeAll()
        nodesDeleteListeners.removeAll(); edgesDeleteListeners.removeAll()
        nodesChangeListeners.removeAll(); edgesChangeListeners.removeAll()
        connectStartListeners.removeAll(); connectEndListeners.removeAll(); paneClickListeners.removeAll()
    }
    public func layout(_ algorithm: String = "layered", options: PyreonFlowLayoutOptions = PyreonFlowLayoutOptions()) {
        let startNodes = nodes
        var targets: [PyreonFlowLayoutPosition]
        switch algorithm {
        case "tree": targets = pyreonFlowTreeLayout(startNodes, edges: edges, direction: options.direction, nodeSpacing: options.nodeSpacing, layerSpacing: options.layerSpacing)
        case "force": targets = pyreonFlowForceLayout(startNodes, edges: edges, nodeSpacing: options.nodeSpacing)
        case "stress": targets = pyreonFlowStressLayout(startNodes, edges: edges, nodeSpacing: options.nodeSpacing)
        case "radial": targets = pyreonFlowRadialLayout(startNodes, edges: edges, nodeSpacing: options.nodeSpacing)
        case "box": targets = pyreonFlowPackingLayout(startNodes, spacing: options.nodeSpacing)
        case "rectpacking": targets = pyreonFlowPackingLayout(startNodes, spacing: options.nodeSpacing, sortByHeight: true)
        default: targets = pyreonFlowLayeredLayout(startNodes, edges: edges, direction: options.direction, nodeSpacing: options.nodeSpacing, layerSpacing: options.layerSpacing)
        }
        let minimumX = targets.map(\.position.x).min() ?? 0, minimumY = targets.map(\.position.y).min() ?? 0
        if minimumX < 0 || minimumY < 0 {
            targets = targets.map { target in PyreonFlowLayoutPosition(id: target.id, position: PyreonXYPosition(x: target.position.x - min(0, minimumX), y: target.position.y - min(0, minimumY))) }
        }
        checkpoint(); layoutAnimationGeneration &+= 1
        let generation = layoutAnimationGeneration
        let targetMap = Dictionary(uniqueKeysWithValues: targets.map { ($0.id, $0.position) })
        guard options.animate && !shouldReduceMotion && options.animationDuration > 0 else { applyLayoutPositions(targetMap); return }
        let starts = Dictionary(uniqueKeysWithValues: startNodes.map { ($0.id, $0.position) })
        scheduleLayoutFrame(generation: generation, starts: starts, targets: targetMap, startTime: ProcessInfo.processInfo.systemUptime, duration: options.animationDuration / 1000)
    }
    private func applyLayoutPositions(_ positions: [String: PyreonXYPosition]) {
        var changes: [PyreonFlowNodeChange] = []
        for id in order where positions[id] != nil && nodeStore[id] != nil {
            let position = positions[id]!
            nodeStore[id]!.position = position; boxes[id]!.node.position = position
            changes.append(PyreonFlowNodeChange(type: "position", id: id, position: position))
        }
        guard !changes.isEmpty else { return }
        nodesVersion &+= 1; markMutation(); emitNodeChanges(changes)
    }
    private func scheduleLayoutFrame(generation: Int, starts: [String: PyreonXYPosition], targets: [String: PyreonXYPosition], startTime: TimeInterval, duration: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 60.0) { [weak self] in
            guard let self, self.layoutAnimationGeneration == generation else { return }
            let t = min((ProcessInfo.processInfo.systemUptime - startTime) / duration, 1), eased = 1 - pow(1 - t, 3)
            let frame = Dictionary(uniqueKeysWithValues: targets.compactMap { id, target -> (String, PyreonXYPosition)? in
                guard let start = starts[id] else { return nil }
                return (id, PyreonXYPosition(x: start.x + (target.x - start.x) * eased, y: start.y + (target.y - start.y) * eased))
            })
            self.applyLayoutPositions(frame)
            if t < 1 { self.scheduleLayoutFrame(generation: generation, starts: starts, targets: targets, startTime: startTime, duration: duration) }
        }
    }
    public func animateViewport(x: Double? = nil, y: Double? = nil, zoom: Double? = nil, duration: Double = 300) {
        viewportAnimationGeneration &+= 1
        let generation = viewportAnimationGeneration
        let start = viewport
        let end = PyreonFlowViewport(x: x ?? start.x, y: y ?? start.y, zoom: zoom ?? start.zoom)
        guard duration > 0 && !shouldReduceMotion else { viewport = end; emitViewportChange(); return }
        scheduleViewportFrame(generation: generation, start: start, end: end, startTime: ProcessInfo.processInfo.systemUptime, duration: duration / 1000)
    }
    private func scheduleViewportFrame(generation: Int, start: PyreonFlowViewport, end: PyreonFlowViewport, startTime: TimeInterval, duration: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0 / 60.0) { [weak self] in
            guard let self, self.viewportAnimationGeneration == generation else { return }
            let t = min((ProcessInfo.processInfo.systemUptime - startTime) / duration, 1)
            let eased = 1 - pow(1 - t, 3)
            self.viewport = PyreonFlowViewport(
                x: start.x + (end.x - start.x) * eased,
                y: start.y + (end.y - start.y) * eased,
                zoom: start.zoom + (end.zoom - start.zoom) * eased)
            self.emitViewportChange()
            if t < 1 { self.scheduleViewportFrame(generation: generation, start: start, end: end, startTime: startTime, duration: duration) }
        }
    }
    @discardableResult public func onConnect(_ callback: @escaping (PyreonFlowConnection) -> Void) -> () -> Void {
        let token = UUID(); connectListeners[token] = callback
        return { [weak self] in self?.connectListeners[token] = nil }
    }
    @discardableResult public func onViewportChange(_ callback: @escaping (PyreonFlowViewport) -> Void) -> () -> Void {
        let token = UUID(); viewportListeners[token] = callback
        return { [weak self] in self?.viewportListeners[token] = nil }
    }
    private func addNodeListener(_ callback: @escaping (PyreonFlowNode<T>) -> Void, to listeners: ReferenceWritableKeyPath<PyreonFlowState<T>, [UUID: (PyreonFlowNode<T>) -> Void]>) -> () -> Void {
        let token = UUID(); self[keyPath: listeners][token] = callback
        return { [weak self] in self?[keyPath: listeners][token] = nil }
    }
    @discardableResult public func onNodeClick(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { addNodeListener(callback, to: \.nodeClickListeners) }
    @discardableResult public func onNodeDoubleClick(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { addNodeListener(callback, to: \.nodeDoubleClickListeners) }
    @discardableResult public func onNodeDragStart(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { addNodeListener(callback, to: \.nodeDragStartListeners) }
    @discardableResult public func onNodeDrag(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { addNodeListener(callback, to: \.nodeDragListeners) }
    @discardableResult public func onNodeDragEnd(_ callback: @escaping (PyreonFlowNode<T>) -> Void) -> () -> Void { addNodeListener(callback, to: \.nodeDragEndListeners) }
    public func emitNodeClick(_ id: String) { if let node = nodeStore[id] { for callback in nodeClickListeners.values { callback(node) } } }
    public func emitNodeDoubleClick(_ id: String) { if let node = nodeStore[id] { for callback in nodeDoubleClickListeners.values { callback(node) } } }
    public func emitNodeDragStart(_ id: String) { if let node = nodeStore[id] { for callback in nodeDragStartListeners.values { callback(node) } } }
    public func emitNodeDrag(_ id: String) { if let node = nodeStore[id] { for callback in nodeDragListeners.values { callback(node) } } }
    public func emitNodeDragEnd(_ id: String) { if let node = nodeStore[id] { for callback in nodeDragEndListeners.values { callback(node) } } }
    @discardableResult public func onEdgeClick(_ callback: @escaping (PyreonFlowEdge) -> Void) -> () -> Void {
        let token = UUID(); edgeClickListeners[token] = callback
        return { [weak self] in self?.edgeClickListeners[token] = nil }
    }
    @discardableResult public func onSelectionChange(_ callback: @escaping (PyreonFlowSelection<T>) -> Void) -> () -> Void {
        let token = UUID(); selectionListeners[token] = callback
        return { [weak self] in self?.selectionListeners[token] = nil }
    }
    @discardableResult public func onNodesDelete(_ callback: @escaping ([PyreonFlowNode<T>]) -> Void) -> () -> Void {
        let token = UUID(); nodesDeleteListeners[token] = callback
        return { [weak self] in self?.nodesDeleteListeners[token] = nil }
    }
    @discardableResult public func onEdgesDelete(_ callback: @escaping ([PyreonFlowEdge]) -> Void) -> () -> Void {
        let token = UUID(); edgesDeleteListeners[token] = callback
        return { [weak self] in self?.edgesDeleteListeners[token] = nil }
    }
    @discardableResult public func onNodesChange(_ callback: @escaping ([PyreonFlowNodeChange]) -> Void) -> () -> Void {
        let token = UUID(); nodesChangeListeners[token] = callback
        return { [weak self] in self?.nodesChangeListeners[token] = nil }
    }
    @discardableResult public func onEdgesChange(_ callback: @escaping ([PyreonFlowEdgeChange]) -> Void) -> () -> Void {
        let token = UUID(); edgesChangeListeners[token] = callback
        return { [weak self] in self?.edgesChangeListeners[token] = nil }
    }
    @discardableResult public func onConnectStart(_ callback: @escaping (PyreonFlowConnectStart) -> Void) -> () -> Void {
        let token = UUID(); connectStartListeners[token] = callback
        return { [weak self] in self?.connectStartListeners[token] = nil }
    }
    @discardableResult public func onConnectEnd(_ callback: @escaping (PyreonFlowConnection?) -> Void) -> () -> Void {
        let token = UUID(); connectEndListeners[token] = callback
        return { [weak self] in self?.connectEndListeners[token] = nil }
    }
    @discardableResult public func onPaneClick(_ callback: @escaping (PyreonFlowPaneEvent) -> Void) -> () -> Void {
        let token = UUID(); paneClickListeners[token] = callback
        return { [weak self] in self?.paneClickListeners[token] = nil }
    }
    public func emitConnectStart(nodeId: String, handleId: String?) { let event = PyreonFlowConnectStart(nodeId: nodeId, handleId: handleId ?? ""); for callback in connectStartListeners.values { callback(event) } }
    public func emitConnectEnd(_ connection: PyreonFlowConnection?) { for callback in connectEndListeners.values { callback(connection) } }
    public func emitPaneClick(_ position: PyreonXYPosition) { let event = PyreonFlowPaneEvent(position: position); for callback in paneClickListeners.values { callback(event) } }
    private func emitNodeChanges(_ changes: [PyreonFlowNodeChange]) { if !changes.isEmpty { for callback in nodesChangeListeners.values { callback(changes) } } }
    private func emitEdgeChanges(_ changes: [PyreonFlowEdgeChange]) { if !changes.isEmpty { for callback in edgesChangeListeners.values { callback(changes) } } }
    private func emitDeleted(nodes: [PyreonFlowNode<T>], edges: [PyreonFlowEdge]) {
        emitNodeChanges(nodes.map { PyreonFlowNodeChange(type: "remove", id: $0.id) })
        emitEdgeChanges(edges.map { PyreonFlowEdgeChange(type: "remove", id: $0.id) })
        if !nodes.isEmpty { for callback in nodesDeleteListeners.values { callback(nodes) } }
        if !edges.isEmpty { for callback in edgesDeleteListeners.values { callback(edges) } }
    }
    public func emitEdgeClick(_ id: String) { if let edge = getEdge(id) { for callback in edgeClickListeners.values { callback(edge) } } }
    private func emitSelectionChange() {
        let selection = PyreonFlowSelection(nodes: selectedNodeIds.compactMap { nodeStore[$0] }, edges: selectedEdgeIds.compactMap(getEdge))
        for callback in selectionListeners.values { callback(selection) }
    }
    private func emitSelectionChange(ifNodeIdsWere nodes: [String], edgeIdsWere edges: [String]) {
        if nodes != selectedNodeIds || edges != selectedEdgeIds { emitSelectionChange() }
    }
    private func emitViewportChange() { for callback in viewportListeners.values { callback(viewport) } }
    private func checkpoint() { if autoHistory { pushHistory() } }
    public func pushHistory() {
        guard mutationVersion != checkpointVersion else { return }
        checkpointVersion = mutationVersion
        undoStack.append(HistorySnapshot(nodes: nodes, edges: edges))
        if undoStack.count > 50 { undoStack.removeFirst() }
        redoStack.removeAll(keepingCapacity: true)
    }
    private func restore(_ snapshot: HistorySnapshot) {
        order.removeAll(keepingCapacity: true); nodeStore.removeAll(keepingCapacity: true); boxes.removeAll(keepingCapacity: true); measurements.removeAll(keepingCapacity: true)
        edges.removeAll(keepingCapacity: true); edgeIds.removeAll(keepingCapacity: true)
        for node in snapshot.nodes { insertNode(node) }
        for edge in snapshot.edges { insertEdge(edge) }
        clearSelection()
        nodesVersion &+= 1
    }
    public func undo() {
        guard let previous = undoStack.popLast() else { return }
        redoStack.append(HistorySnapshot(nodes: nodes, edges: edges))
        restore(previous)
    }
    public func redo() {
        guard let next = redoStack.popLast() else { return }
        undoStack.append(HistorySnapshot(nodes: nodes, edges: edges))
        restore(next)
    }

    public func toJSON() -> PyreonFlowSnapshot<T> {
        PyreonFlowSnapshot(nodes: nodes, edges: edges, viewport: viewport)
    }
    public func fromJSON(_ snapshot: PyreonFlowSnapshot<T>) {
        checkpoint()
        let oldSelectedNodes = selectedNodeIds, oldSelectedEdges = selectedEdgeIds
        order.removeAll(keepingCapacity: true); nodeStore.removeAll(keepingCapacity: true); boxes.removeAll(keepingCapacity: true); measurements.removeAll(keepingCapacity: true)
        edges.removeAll(keepingCapacity: true); edgeIds.removeAll(keepingCapacity: true)
        for node in snapshot.nodes { insertNode(node) }
        for edge in snapshot.edges { insertEdge(edge) }
        selectedNodeIds.removeAll(keepingCapacity: true); selectedNodeIdSet.removeAll(keepingCapacity: true)
        selectedEdgeIds.removeAll(keepingCapacity: true); selectedEdgeIdSet.removeAll(keepingCapacity: true)
        if let restoredViewport = snapshot.viewport {
            viewport = restoredViewport
            emitViewportChange()
        }
        emitSelectionChange(ifNodeIdsWere: oldSelectedNodes, edgeIdsWere: oldSelectedEdges)
        nodesVersion &+= 1
    }

    /// Current zoom factor — `viewport.zoom`, exposed the same way the web
    /// `zoom: Computed<number>` is: a derived read, no independent storage.
    public var zoom: Double { viewport.zoom }

    // ── storage primitives (the web engine's `nodeMap`/`edgeMap`, kept in sync) ──
    private func insertNode(_ node: PyreonFlowNode<T>) {
        guard nodeStore[node.id] == nil else { return }
        nodeStore[node.id] = node
        boxes[node.id] = PyreonFlowNodeBox(node)
        order.append(node.id)
        nodesVersion &+= 1
        markMutation()
    }
    /// Applies the web `normalizeEdge` default (`type ?? 'bezier'`); dedupes by id.
    private func insertEdge(_ edge: PyreonFlowEdge) {
        guard !edgeIds.contains(edge.id) else { return }
        var e = edge
        if e.type == nil { e.type = defaultEdgeOptions.type ?? defaultEdgeType }
        if e.label == nil { e.label = defaultEdgeOptions.label }
        if !e.animatedSpecified, let animated = defaultEdgeOptions.animated { e.animated = animated }
        if e.focusable == nil { e.focusable = defaultEdgeOptions.focusable }
        if e.ariaLabel == nil { e.ariaLabel = defaultEdgeOptions.ariaLabel }
        if e.hidden == nil { e.hidden = defaultEdgeOptions.hidden }
        if e.deletable == nil { e.deletable = defaultEdgeOptions.deletable }
        if e.reconnectable == nil { e.reconnectable = defaultEdgeOptions.reconnectable }
        if e.interactionWidth == nil { e.interactionWidth = defaultEdgeOptions.interactionWidth }
        if e.curvature == nil { e.curvature = defaultEdgeOptions.curvature }
        if e.borderRadius == nil { e.borderRadius = defaultEdgeOptions.borderRadius }
        if e.pathOffset == nil { e.pathOffset = defaultEdgeOptions.pathOffset }
        if e.markerStart == nil { e.markerStart = defaultEdgeOptions.markerStart }
        if !e.markerEndSpecified, defaultEdgeOptions.markerEndSpecified { e.markerEnd = defaultEdgeOptions.markerEnd; e.markerEndSpecified = true }
        edges.append(e)
        edgeIds.insert(e.id)
        markMutation()
    }
    /// ONE in-place pass over `edges` decides what goes; the removed ids are
    /// collected into a LOCAL as it runs (no observable access and no
    /// per-element hashing inside the loop — a second `removeAll {
    /// set.contains }` pass measured 10× slower at E = 10,000 purely from
    /// String hashing), then each observable collection is written once.
    private func removeEdges(where shouldRemove: (PyreonFlowEdge) -> Bool) {
        var removedIds: [String] = []
        // In place: `removeAll(where:)` compacts without copying the kept
        // elements (a build-a-new-array pass measured 4× slower at E = 10k).
        edges.removeAll { edge in
            guard shouldRemove(edge) else { return false }
            removedIds.append(edge.id)
            return true
        }
        guard !removedIds.isEmpty else { return }
        markMutation()
        for id in removedIds { edgeIds.remove(id) }
        var touchedSelection = false
        for id in removedIds where selectedEdgeIdSet.remove(id) != nil { touchedSelection = true }
        if touchedSelection {
            let removed = Set(removedIds)
            selectedEdgeIds.removeAll { removed.contains($0) }
        }
    }
    private func removeNodes(_ ids: Set<String>) {
        guard !ids.isEmpty else { return }
        order.removeAll { ids.contains($0) }
        for id in ids {
            nodeStore[id] = nil
            boxes[id] = nil
            measurements[id] = nil
        }
        nodesVersion &+= 1
        markMutation()
        if !selectedNodeIdSet.isDisjoint(with: ids) {
            selectedNodeIdSet.subtract(ids)
            selectedNodeIds.removeAll { ids.contains($0) }
        }
        removeEdges { ids.contains($0.source) || ids.contains($0.target) }
    }

    // ── node operations ─────────────────────────────────────────────────────
    /// O(1). Reading it in a view subscribes to THIS node only.
    public func getNode(_ id: String) -> PyreonFlowNode<T>? {
        boxes[id]?.node
    }
    public func getNodeDimensions(_ id: String) -> PyreonFlowDimensions {
        guard let node = nodeStore[id] else { return PyreonFlowDimensions(width: pyreonFlowDefaultNodeWidth, height: pyreonFlowDefaultNodeHeight) }
        return pyreonEffectiveDimensions(node, measurement: measurements[id])
    }
    public func updateNodeMeasurement(_ id: String, width: Double, height: Double, handles: [PyreonFlowMeasuredHandle] = []) {
        guard nodeStore[id] != nil, width > 0, height > 0 else { return }
        let next = PyreonFlowNodeMeasurement(width: width, height: height, handles: handles)
        if measurements[id] != next { measurements[id] = next }
    }
    public func clearNodeMeasurement(_ id: String) { measurements[id] = nil }
    public func addNode(_ node: PyreonFlowNode<T>) {
        guard nodeStore[node.id] == nil else { return }
        checkpoint()
        insertNode(node)
    }
    public func addNodes(_ nodes: [PyreonFlowNode<T>]) {
        guard !nodes.isEmpty else { return }
        checkpoint()
        for node in nodes { insertNode(node) }
    }
    public func setNodes(_ nodes: [PyreonFlowNode<T>]) {
        let oldSelectedNodes = selectedNodeIds, oldSelectedEdges = selectedEdgeIds
        checkpoint()
        let nextIds = Set(nodes.map(\.id))
        order.removeAll(keepingCapacity: true)
        nodeStore.removeAll(keepingCapacity: true)
        boxes.removeAll(keepingCapacity: true)
        for node in nodes { insertNode(node) }
        measurements = measurements.filter { nextIds.contains($0.key) }
        setNodeSelection(selectedNodeIds.filter { nextIds.contains($0) })
        removeEdges { !nextIds.contains($0.source) || !nextIds.contains($0.target) }
        nodesVersion &+= 1
        emitSelectionChange(ifNodeIdsWere: oldSelectedNodes, edgeIdsWere: oldSelectedEdges)
    }
    public func setNodes(_ update: ([PyreonFlowNode<T>]) -> [PyreonFlowNode<T>]) {
        setNodes(update(nodes))
    }
    /// Removes the node AND every edge connected to it (source or target) —
    /// same as the web `removeNode`.
    public func removeNode(_ id: String) {
        guard nodeStore[id] != nil else { return }
        let removedNodes = [nodeStore[id]!]
        let removedEdges = edges.filter { $0.source == id || $0.target == id }
        checkpoint()
        let oldSelectedNodes = selectedNodeIds, oldSelectedEdges = selectedEdgeIds
        removeNodes([id])
        emitSelectionChange(ifNodeIdsWere: oldSelectedNodes, edgeIdsWere: oldSelectedEdges)
        emitDeleted(nodes: removedNodes, edges: removedEdges)
    }
    public func removeNodes(_ ids: [String]) {
        let gone = Set(ids.filter { nodeStore[$0] != nil })
        guard !gone.isEmpty else { return }
        let removedNodes = nodes.filter { gone.contains($0.id) }
        let removedEdges = edges.filter { gone.contains($0.source) || gone.contains($0.target) }
        checkpoint()
        let oldSelectedNodes = selectedNodeIds, oldSelectedEdges = selectedEdgeIds
        removeNodes(gone)
        emitSelectionChange(ifNodeIdsWere: oldSelectedNodes, edgeIdsWere: oldSelectedEdges)
        emitDeleted(nodes: removedNodes, edges: removedEdges)
    }
    /// O(1); invalidates the views reading THIS node (its box) and whole-array
    /// readers (`nodesVersion`) — never the other nodes' views.
    public func updateNodePosition(_ id: String, _ position: PyreonXYPosition) {
        guard nodeStore[id] != nil else { return }
        let node = nodeStore[id]!
        let snapped = snapToGrid && snapGrid != 0
            ? PyreonXYPosition(x: floor(position.x / snapGrid + 0.5) * snapGrid, y: floor(position.y / snapGrid + 0.5) * snapGrid)
            : position
        let width = node.width ?? pyreonFlowDefaultNodeWidth
        let height = node.height ?? pyreonFlowDefaultNodeHeight
        let parent = node.parentId.flatMap { nodeStore[$0] }
        let effectiveExtent = node.extentParent && parent != nil
            ? PyreonFlowNodeExtent(minX: 0, minY: 0, maxX: parent!.width ?? pyreonFlowDefaultNodeWidth, maxY: parent!.height ?? pyreonFlowDefaultNodeHeight)
            : node.extent ?? nodeExtent
        var clamped = clamp(snapped, to: effectiveExtent, width, height)
        if node.expandParent == true, var parent, let parentId = node.parentId {
            clamped = PyreonXYPosition(x: max(0, clamped.x), y: max(0, clamped.y))
            parent.width = max(parent.width ?? pyreonFlowDefaultNodeWidth, clamped.x + width)
            parent.height = max(parent.height ?? pyreonFlowDefaultNodeHeight, clamped.y + height)
            nodeStore[parentId] = parent
            boxes[parentId]?.node = parent
        }
        nodeStore[id]!.position = clamped
        boxes[id]!.node.position = clamped
        nodesVersion &+= 1
        markMutation()
        emitNodeChanges([PyreonFlowNodeChange(type: "position", id: id, position: clamped)])
    }
    public func updateNodeData(_ id: String, _ update: (inout T) -> Void) {
        guard nodeStore[id] != nil else { return }
        checkpoint()
        update(&nodeStore[id]!.data)
        boxes[id]!.node.data = nodeStore[id]!.data
        nodesVersion &+= 1
        markMutation()
    }
    /// Callback form of the web API: computes data from the complete current node.
    public func updateNodeDataFromNode(_ id: String, _ update: (PyreonFlowNode<T>) -> T) {
        guard var node = nodeStore[id] else { return }
        checkpoint()
        node.data = update(node)
        nodeStore[id] = node
        boxes[id]!.node = node
        nodesVersion &+= 1
        markMutation()
    }
    public func updateNode(_ id: String, _ update: (inout PyreonFlowNode<T>) -> Void) {
        guard var node = nodeStore[id] else { return }
        update(&node)
        node.id = id
        nodeStore[id] = node
        boxes[id]!.node = node
        nodesVersion &+= 1
        markMutation()
    }
    public func setNodeExtent(minX: Double, minY: Double, maxX: Double, maxY: Double) {
        nodeExtent = PyreonFlowNodeExtent(minX: minX, minY: minY, maxX: maxX, maxY: maxY)
    }
    public func clearNodeExtent() { nodeExtent = nil }
    public func clampToExtent(_ position: PyreonXYPosition, _ nodeWidth: Double = pyreonFlowDefaultNodeWidth, _ nodeHeight: Double = pyreonFlowDefaultNodeHeight) -> PyreonXYPosition {
        clamp(position, to: nodeExtent, nodeWidth, nodeHeight)
    }
    private func clamp(_ position: PyreonXYPosition, to extent: PyreonFlowNodeExtent?, _ nodeWidth: Double, _ nodeHeight: Double) -> PyreonXYPosition {
        guard let extent else { return position }
        return PyreonXYPosition(
            x: min(max(position.x, extent.minX), max(extent.minX, extent.maxX - nodeWidth)),
            y: min(max(position.y, extent.minY), max(extent.minY, extent.maxY - nodeHeight))
        )
    }
    public func snappedNodePosition(_ id: String, _ position: PyreonXYPosition, excluding: Set<String> = [], threshold: Double = 5) -> PyreonXYPosition {
        guard snapToObjects else { return position }
        return getSnapLines(id, position, threshold: threshold, excluding: excluding).snappedPosition
    }
    public func getSnapLines(_ id: String, _ position: PyreonXYPosition, threshold: Double = 5, excluding: Set<String> = []) -> PyreonFlowSnapLines {
        guard let dragged = nodeStore[id] else { return PyreonFlowSnapLines(x: nil, y: nil, snappedPosition: position) }
        let width = dragged.width ?? pyreonFlowDefaultNodeWidth
        let height = dragged.height ?? pyreonFlowDefaultNodeHeight
        var result = position
        var snapX: Double? = nil
        var snapY: Double? = nil
        for candidate in nodes where candidate.id != id && !excluding.contains(candidate.id) {
            let candidateWidth = candidate.width ?? pyreonFlowDefaultNodeWidth
            let candidateHeight = candidate.height ?? pyreonFlowDefaultNodeHeight
            let xPairs = [(position.x + width / 2, candidate.position.x + candidateWidth / 2, candidate.position.x + candidateWidth / 2 - width / 2), (position.x, candidate.position.x, candidate.position.x), (position.x + width, candidate.position.x + candidateWidth, candidate.position.x + candidateWidth - width)]
            for (actual, guide, target) in xPairs where abs(actual - guide) < threshold { snapX = guide; result.x = target }
            let yPairs = [(position.y + height / 2, candidate.position.y + candidateHeight / 2, candidate.position.y + candidateHeight / 2 - height / 2), (position.y, candidate.position.y, candidate.position.y), (position.y + height, candidate.position.y + candidateHeight, candidate.position.y + candidateHeight - height)]
            for (actual, guide, target) in yPairs where abs(actual - guide) < threshold { snapY = guide; result.y = target }
        }
        return PyreonFlowSnapLines(x: snapX, y: snapY, snappedPosition: result)
    }

    // ── edge operations ─────────────────────────────────────────────────────
    public func getEdge(_ id: String) -> PyreonFlowEdge? {
        guard edgeIds.contains(id) else { return nil }
        return edges.first { $0.id == id }
    }
    public func resolvedMarkers(_ edge: PyreonFlowEdge) -> (start: PyreonFlowMarker?, end: PyreonFlowMarker?) {
        (edge.markerStart, edge.markerEndSpecified ? edge.markerEnd : defaultMarkerEnd)
    }
    public func isValidConnection(_ connection: PyreonFlowConnection) -> Bool {
        if let connectionValidator, !connectionValidator(connection) { return false }
        guard let connectionRules else { return true }
        guard let source = nodeStore[connection.source] else { return false }
        guard let outputs = connectionRules[source.type ?? "default"] else { return true }
        guard let target = nodeStore[connection.target] else { return false }
        return outputs.contains(target.type ?? "default")
    }
    @discardableResult
    public func connect(_ connection: PyreonFlowConnection, id: String? = nil) -> PyreonFlowEdge? {
        guard isValidConnection(connection) else { return nil }
        let edge = PyreonFlowEdge(
            id: id ?? "edge-\(UUID().uuidString.lowercased())",
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle)
        guard !edgeIds.contains(edge.id) else { return nil }
        checkpoint()
        insertEdge(edge)
        emitEdgeChanges([PyreonFlowEdgeChange(type: "add", edge: getEdge(edge.id))])
        for callback in connectListeners.values { callback(connection) }
        return getEdge(edge.id)
    }
    /// Adds the edge unless an edge with the same `id` already exists — same
    /// dedupe-by-id contract as the web `addEdge`; applies `type ?? 'bezier'`.
    public func addEdge(_ edge: PyreonFlowEdge) {
        guard !edgeIds.contains(edge.id) else { return }
        checkpoint()
        insertEdge(edge)
        emitEdgeChanges([PyreonFlowEdgeChange(type: "add", edge: getEdge(edge.id))])
        let connection = PyreonFlowConnection(source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle)
        for callback in connectListeners.values { callback(connection) }
    }
    public func addEdges(_ edges: [PyreonFlowEdge]) {
        let fresh = edges.filter { !edgeIds.contains($0.id) }
        guard !fresh.isEmpty else { return }
        checkpoint()
        var added: [PyreonFlowEdge] = []
        var connections: [PyreonFlowConnection] = []
        for edge in fresh {
            insertEdge(edge)
            if let stored = getEdge(edge.id) { added.append(stored) }
            connections.append(PyreonFlowConnection(source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle))
        }
        emitEdgeChanges(added.map { PyreonFlowEdgeChange(type: "add", edge: $0) })
        for connection in connections { for callback in connectListeners.values { callback(connection) } }
    }
    public func setEdges(_ next: [PyreonFlowEdge]) {
        let oldSelectedNodes = selectedNodeIds, oldSelectedEdges = selectedEdgeIds
        checkpoint()
        edges.removeAll(keepingCapacity: true)
        edgeIds.removeAll(keepingCapacity: true)
        for edge in next { insertEdge(edge) }
        setEdgeSelection(selectedEdgeIds.filter { edgeIds.contains($0) })
        emitSelectionChange(ifNodeIdsWere: oldSelectedNodes, edgeIdsWere: oldSelectedEdges)
    }
    public func setEdges(_ update: ([PyreonFlowEdge]) -> [PyreonFlowEdge]) {
        setEdges(update(edges))
    }
    public func removeEdge(_ id: String) {
        guard edgeIds.contains(id) else { return }
        let removedEdge = getEdge(id)!
        checkpoint()
        let oldSelectedNodes = selectedNodeIds, oldSelectedEdges = selectedEdgeIds
        // Single id: find-then-remove (one String compare per element, no
        // closure indirection) — the predicate path exists for node-driven
        // removal, where many edges can go in one pass.
        guard let i = edges.firstIndex(where: { $0.id == id }) else { return }
        edges.remove(at: i)
        edgeIds.remove(id)
        if selectedEdgeIdSet.remove(id) != nil { selectedEdgeIds.removeAll { $0 == id } }
        markMutation()
        emitSelectionChange(ifNodeIdsWere: oldSelectedNodes, edgeIdsWere: oldSelectedEdges)
        emitDeleted(nodes: [], edges: [removedEdge])
    }
    public func updateEdge(_ id: String, _ update: (inout PyreonFlowEdge) -> Void) {
        guard let index = edges.firstIndex(where: { $0.id == id }) else { return }
        var edge = edges[index]
        update(&edge)
        edge.id = id
        edges[index] = edge
        markMutation()
    }
    public func reconnectEdge(_ id: String, source: String? = nil, target: String? = nil, sourceHandle: String? = nil, targetHandle: String? = nil) {
        guard let i = edges.firstIndex(where: { $0.id == id }) else { return }
        if let source { edges[i].source = source }
        if let target { edges[i].target = target }
        if let sourceHandle { edges[i].sourceHandle = sourceHandle }
        if let targetHandle { edges[i].targetHandle = targetHandle }
        markMutation()
    }
    @discardableResult
    public func reconnectEdge(_ id: String, connection: PyreonFlowConnection) -> Bool {
        guard isValidConnection(connection), let i = edges.firstIndex(where: { $0.id == id }) else { return false }
        edges[i].source = connection.source
        edges[i].target = connection.target
        edges[i].sourceHandle = connection.sourceHandle
        edges[i].targetHandle = connection.targetHandle
        markMutation()
        return true
    }
    public func addEdgeWaypoint(_ edgeId: String, _ point: PyreonXYPosition, _ index: Int? = nil) {
        guard let i = edges.firstIndex(where: { $0.id == edgeId }) else { return }
        if let index {
            let count = edges[i].waypoints.count
            let insertionIndex = index < 0 ? max(count + index, 0) : min(index, count)
            edges[i].waypoints.insert(point, at: insertionIndex)
        }
        else { edges[i].waypoints.append(point) }
        markMutation()
    }
    public func removeEdgeWaypoint(_ edgeId: String, _ index: Int) {
        guard let i = edges.firstIndex(where: { $0.id == edgeId }) else { return }
        let removalIndex = index < 0 ? max(edges[i].waypoints.count + index, 0) : index
        guard edges[i].waypoints.indices.contains(removalIndex) else { return }
        edges[i].waypoints.remove(at: removalIndex)
        markMutation()
    }
    public func updateEdgeWaypoint(_ edgeId: String, _ index: Int, _ point: PyreonXYPosition) {
        guard let i = edges.firstIndex(where: { $0.id == edgeId }), edges[i].waypoints.indices.contains(index) else { return }
        edges[i].waypoints[index] = point
        markMutation()
    }
    public func removeEdges(_ ids: [String]) {
        let gone = Set(ids.filter { edgeIds.contains($0) })
        guard !gone.isEmpty else { return }
        let removedEdges = edges.filter { gone.contains($0.id) }
        checkpoint()
        let oldSelectedNodes = selectedNodeIds, oldSelectedEdges = selectedEdgeIds
        removeEdges { gone.contains($0.id) }
        emitSelectionChange(ifNodeIdsWere: oldSelectedNodes, edgeIdsWere: oldSelectedEdges)
        emitDeleted(nodes: [], edges: removedEdges)
    }

    // ── selection ────────────────────────────────────────────────────────────
    // Selecting a node NON-additively clears edge selection, and vice versa —
    // the two selections are mutually exclusive unless additive. Mirrors the
    // web `selectNode`/`selectEdge` exactly.
    public func isNodeSelected(_ id: String) -> Bool { selectedNodeIdSet.contains(id) }
    public func isEdgeSelected(_ id: String) -> Bool { selectedEdgeIdSet.contains(id) }
    /// Insertion order — the same order the web `Set` iterates.
    public func selectedNodes() -> [String] { selectedNodeIds }
    public func selectedEdges() -> [String] { selectedEdgeIds }

    private func setNodeSelection(_ ids: [String]) {
        selectedNodeIds = ids
        selectedNodeIdSet = Set(ids)
    }
    private func setEdgeSelection(_ ids: [String]) {
        selectedEdgeIds = ids
        selectedEdgeIdSet = Set(ids)
    }

    public func selectNode(_ id: String, additive: Bool = false) {
        if additive && multiSelect {
            if selectedNodeIdSet.insert(id).inserted { selectedNodeIds.append(id) }
        } else {
            setNodeSelection([id])
            setEdgeSelection([])
        }
        emitSelectionChange()
    }
    public func selectNodes(_ ids: [String], additive: Bool = false) {
        if additive && multiSelect {
            for id in ids where selectedNodeIdSet.insert(id).inserted { selectedNodeIds.append(id) }
        } else {
            var unique: [String] = []
            var seen = Set<String>()
            for id in ids where seen.insert(id).inserted { unique.append(id) }
            setNodeSelection(unique)
            setEdgeSelection([])
        }
        emitSelectionChange()
    }
    public func nodesInSelection(from start: PyreonXYPosition, to end: PyreonXYPosition) -> [String] {
        let minX = min(start.x, end.x), minY = min(start.y, end.y)
        let maxX = max(start.x, end.x), maxY = max(start.y, end.y)
        return nodes.compactMap { node in
            guard node.hidden != true else { return nil }
            let p = node.parentId == nil ? node.position : getAbsolutePosition(node.id)
            let width = node.width ?? pyreonFlowDefaultNodeWidth, height = node.height ?? pyreonFlowDefaultNodeHeight
            let hit = selectionMode == "full"
                ? p.x >= minX && p.x + width <= maxX && p.y >= minY && p.y + height <= maxY
                : p.x + width > minX && p.x < maxX && p.y + height > minY && p.y < maxY
            return hit ? node.id : nil
        }
    }
    public func deselectNode(_ id: String) {
        if selectedNodeIdSet.remove(id) != nil { selectedNodeIds.removeAll { $0 == id } }
        emitSelectionChange()
    }
    public func selectEdge(_ id: String, additive: Bool = false) {
        if additive && multiSelect {
            if selectedEdgeIdSet.insert(id).inserted { selectedEdgeIds.append(id) }
        } else {
            setEdgeSelection([id])
            setNodeSelection([])
        }
        emitSelectionChange()
    }
    public func clearSelection() {
        setNodeSelection([])
        setEdgeSelection([])
        emitSelectionChange()
    }
    /// Selects every node. Edge selection is LEFT ALONE — the web `selectAll`
    /// (`flow.ts`) only replaces the node set; v1 of both native ports also
    /// cleared the edge set, a divergence the tests locked in by omission.
    public func selectAll() {
        setNodeSelection(order)
        emitSelectionChange()
    }
    /// Removes every currently-selected node (and its connected edges) and
    /// every currently-selected edge — the SAME net effect AND the same
    /// single-pass shape as the web `deleteSelected` (`flow.ts`): the
    /// selection sets are built ONCE and each collection is scanned ONCE,
    /// O(N + E) — never one `removeNode` call per selected id, which re-scans
    /// on every iteration and makes "select all, then delete" quadratic.
    public func deleteSelected() {
        let nodeIdsToRemove = Set(selectedNodeIds.filter { id in nodeStore[id].map { $0.deletable ?? nodesDeletable } ?? false })
        let edgeIdsToRemove = Set(selectedEdgeIds.filter { id in edges.first(where: { $0.id == id }).map { $0.deletable ?? edgesDeletable } ?? false })
        guard !nodeIdsToRemove.isEmpty || !edgeIdsToRemove.isEmpty else { return }
        let removedNodes = nodes.filter { nodeIdsToRemove.contains($0.id) }
        let removedEdges = edges.filter { edgeIdsToRemove.contains($0.id) || nodeIdsToRemove.contains($0.source) || nodeIdsToRemove.contains($0.target) }
        checkpoint()
        if !nodeIdsToRemove.isEmpty {
            removeNodes(nodeIdsToRemove)
            if !edgeIdsToRemove.isEmpty {
                removeEdges { edgeIdsToRemove.contains($0.id) }
            }
        } else if !edgeIdsToRemove.isEmpty {
            removeEdges { edgeIdsToRemove.contains($0.id) }
        }
        setNodeSelection([])
        setEdgeSelection([])
        emitSelectionChange()
        emitDeleted(nodes: removedNodes, edges: removedEdges)
    }

    // ── copy / paste ────────────────────────────────────────────────────────
    public func copySelected() {
        guard !selectedNodeIdSet.isEmpty else { return }
        let copiedNodes = nodes.filter { selectedNodeIdSet.contains($0.id) }
        let copiedIds = Set(copiedNodes.map(\.id))
        clipboard = HistorySnapshot(
            nodes: copiedNodes,
            edges: edges.filter { copiedIds.contains($0.source) && copiedIds.contains($0.target) }
        )
    }
    public func paste(_ offset: PyreonXYPosition = PyreonXYPosition(x: 50, y: 50)) {
        guard let clipboard else { return }
        checkpoint()
        var idMap: [String: String] = [:]
        var pastedIds: [String] = []
        for var node in clipboard.nodes {
            pasteCounter += 1
            let newId = "\(node.id)-copy-\(pasteCounter)"
            idMap[node.id] = newId
            node.id = newId
            node.position = PyreonXYPosition(x: node.position.x + offset.x, y: node.position.y + offset.y)
            insertNode(node)
            pastedIds.append(newId)
        }
        for var edge in clipboard.edges {
            edge.source = idMap[edge.source] ?? edge.source
            edge.target = idMap[edge.target] ?? edge.target
            let sourceHandle = edge.sourceHandle.map { "-\($0)" } ?? ""
            let targetHandle = edge.targetHandle.map { "-\($0)" } ?? ""
            edge.id = "e-\(edge.source)\(sourceHandle)-\(edge.target)\(targetHandle)"
            insertEdge(edge)
        }
        setNodeSelection(pastedIds)
        setEdgeSelection([])
        emitSelectionChange()
    }

    // ── viewport ─────────────────────────────────────────────────────────────
    public func zoomTo(_ z: Double, duration: Double = 0) {
        let target = min(max(z, minZoom), maxZoom)
        setViewport(zoom: target, duration: duration)
    }
    public func zoomIn(duration: Double = 0) {
        zoomTo(viewport.zoom * 1.2, duration: duration)
    }
    public func zoomOut(duration: Double = 0) {
        zoomTo(viewport.zoom / 1.2, duration: duration)
    }
    /// Pans so `position` (in flow coordinates) lands at the viewport origin —
    /// an ABSOLUTE pan-to-point, not a relative nudge. Matches the web `panTo`.
    public func panTo(_ position: PyreonXYPosition) {
        setViewport(x: -position.x * viewport.zoom, y: -position.y * viewport.zoom)
    }
    public func setViewport(x: Double? = nil, y: Double? = nil, zoom: Double? = nil, duration: Double = 0) {
        if duration > 0 && !shouldReduceMotion { animateViewport(x: x, y: y, zoom: zoom, duration: duration); return }
        viewportAnimationGeneration &+= 1
        viewport = PyreonFlowViewport(x: x ?? viewport.x, y: y ?? viewport.y, zoom: zoom ?? viewport.zoom)
        emitViewportChange()
    }
    public func setViewport(_ next: PyreonFlowViewport) {
        setViewport(x: next.x, y: next.y, zoom: next.zoom)
    }
    public func setViewport(_ update: (PyreonFlowViewport) -> PyreonFlowViewport) {
        setViewport(update(viewport))
    }
    public func replaceContainerSize(_ next: PyreonFlowContainerSize) { containerSize = next }
    public func updateContainerSize(_ update: (PyreonFlowContainerSize) -> PyreonFlowContainerSize) {
        replaceContainerSize(update(containerSize))
    }
    public func setCenter(_ x: Double, _ y: Double, zoom: Double? = nil, duration: Double = 0) {
        let z = min(max(zoom ?? viewport.zoom, minZoom), maxZoom)
        setViewport(x: -x * z + containerSize.width / 2, y: -y * z + containerSize.height / 2, zoom: z, duration: duration)
    }
    public func screenToFlowPosition(_ position: PyreonXYPosition) -> PyreonXYPosition {
        PyreonXYPosition(x: (position.x - viewport.x) / viewport.zoom, y: (position.y - viewport.y) / viewport.zoom)
    }
    public func flowToScreenPosition(_ position: PyreonXYPosition) -> PyreonXYPosition {
        PyreonXYPosition(x: position.x * viewport.zoom + viewport.x, y: position.y * viewport.zoom + viewport.y)
    }
    public func isNodeVisible(_ id: String) -> Bool {
        guard let node = nodeStore[id] else { return false }
        let absolute = getAbsolutePosition(id)
        let x = absolute.x * viewport.zoom + viewport.x
        let y = absolute.y * viewport.zoom + viewport.y
        let width = (node.width ?? pyreonFlowDefaultNodeWidth) * viewport.zoom
        let height = (node.height ?? pyreonFlowDefaultNodeHeight) * viewport.zoom
        return x + width > 0 && x < containerSize.width && y + height > 0 && y < containerSize.height
    }
    /// Frames every node (or just `nodeIds`, when given) inside the current
    /// `containerSize`, with `padding` as a fraction of the graph's extent on
    /// each axis (default `0.1`, matching the web `fitViewPadding` default).
    /// A no-op when there is nothing to frame, or `containerSize` hasn't been
    /// measured yet (both `0`).
    public func fitView(_ nodeIds: [String]? = nil, padding: Double? = nil, duration: Double = 0) {
        guard containerSize.width > 0, containerSize.height > 0 else { return }
        let padding = max(0, padding ?? fitViewPadding)
        // A bounding box needs no order: walk the store's values directly
        // (no per-node hash lookup) unless a subset was named.
        var count = 0
        var minX = Double.infinity
        var minY = Double.infinity
        var maxX = -Double.infinity
        var maxY = -Double.infinity
        func include(_ node: PyreonFlowNode<T>) {
            count += 1
            let w = node.width ?? pyreonFlowDefaultNodeWidth
            let h = node.height ?? pyreonFlowDefaultNodeHeight
            let position = node.parentId == nil ? node.position : getAbsolutePosition(node.id)
            minX = min(minX, position.x)
            minY = min(minY, position.y)
            maxX = max(maxX, position.x + w)
            maxY = max(maxY, position.y + h)
        }
        if let ids = nodeIds {
            for id in ids { if let node = nodeStore[id] { include(node) } }
        } else {
            for node in nodeStore.values { include(node) }
        }
        guard count > 0 else { return }

        let graphWidth = maxX - minX
        let graphHeight = maxY - minY
        guard graphWidth > 0 || graphHeight > 0 else { return }

        let zoomX = graphWidth > 0 ? containerSize.width / (graphWidth * (1 + padding * 2)) : .infinity
        let zoomY = graphHeight > 0 ? containerSize.height / (graphHeight * (1 + padding * 2)) : .infinity
        let newZoom = min(max(min(zoomX, zoomY), minZoom), maxZoom)

        let centerX = (minX + maxX) / 2
        let centerY = (minY + maxY) / 2

        setViewport(x: containerSize.width / 2 - centerX * newZoom, y: containerSize.height / 2 - centerY * newZoom, zoom: newZoom, duration: duration)
    }

    // ── graph queries ────────────────────────────────────────────────────────
    public func getConnectedEdges(_ nodeId: String) -> [PyreonFlowEdge] {
        edges.filter { $0.source == nodeId || $0.target == nodeId }
    }
    /// Nodes with an edge INTO `nodeId`, in node insertion order (web parity).
    public func getIncomers(_ nodeId: String) -> [PyreonFlowNode<T>] {
        let sourceIds = Set(edges.filter { $0.target == nodeId }.map(\.source))
        return order.compactMap { sourceIds.contains($0) ? nodeStore[$0]! : nil }
    }
    public func getOutgoers(_ nodeId: String) -> [PyreonFlowNode<T>] {
        let targetIds = Set(edges.filter { $0.source == nodeId }.map(\.target))
        return order.compactMap { targetIds.contains($0) ? nodeStore[$0]! : nil }
    }
    public func findNodes(_ predicate: (PyreonFlowNode<T>) -> Bool) -> [PyreonFlowNode<T>] {
        nodes.filter(predicate)
    }
    public func searchNodes(_ query: String) -> [PyreonFlowNode<T>] {
        let needle = query.lowercased()
        return nodes.filter { node in
            (searchText?(node.data) ?? node.id).lowercased().contains(needle)
        }
    }
    public func getChildNodes(_ parentId: String) -> [PyreonFlowNode<T>] {
        order.compactMap { nodeStore[$0]?.parentId == parentId ? nodeStore[$0] : nil }
    }
    public func getAbsolutePosition(_ nodeId: String) -> PyreonXYPosition {
        func walk(_ id: String, _ seen: inout Set<String>) -> PyreonXYPosition {
            guard let node = nodeStore[id] else { return PyreonXYPosition(x: 0, y: 0) }
            guard let parentId = node.parentId, parentId != id else { return node.position }
            if seen.contains(id) { return node.position }
            seen.insert(id)
            let parent = walk(parentId, &seen)
            return PyreonXYPosition(x: parent.x + node.position.x, y: parent.y + node.position.y)
        }
        var seen = Set<String>()
        return walk(nodeId, &seen)
    }
    public func getProximityConnection(_ nodeId: String, _ threshold: Double = 50) -> PyreonFlowConnection? {
        guard let node = nodeStore[nodeId] else { return nil }
        let centerX = node.position.x + (node.width ?? pyreonFlowDefaultNodeWidth) / 2
        let centerY = node.position.y + (node.height ?? pyreonFlowDefaultNodeHeight) / 2
        var closest: (id: String, distance: Double)?
        for other in nodes where other.id != nodeId {
            if edges.contains(where: { ($0.source == nodeId && $0.target == other.id) || ($0.source == other.id && $0.target == nodeId) }) { continue }
            let dx = centerX - other.position.x - (other.width ?? pyreonFlowDefaultNodeWidth) / 2
            let dy = centerY - other.position.y - (other.height ?? pyreonFlowDefaultNodeHeight) / 2
            let distance = hypot(dx, dy)
            if distance < threshold && (closest == nil || distance < closest!.distance) { closest = (other.id, distance) }
        }
        guard let closest else { return nil }
        let connection = PyreonFlowConnection(source: nodeId, target: closest.id)
        return isValidConnection(connection) ? connection : nil
    }
    public func getOverlappingNodes(_ nodeId: String) -> [PyreonFlowNode<T>] {
        guard let node = nodeStore[nodeId] else { return [] }
        let right = node.position.x + (node.width ?? pyreonFlowDefaultNodeWidth)
        let bottom = node.position.y + (node.height ?? pyreonFlowDefaultNodeHeight)
        return nodes.filter { other in
            guard other.id != nodeId else { return false }
            let otherRight = other.position.x + (other.width ?? pyreonFlowDefaultNodeWidth)
            let otherBottom = other.position.y + (other.height ?? pyreonFlowDefaultNodeHeight)
            return node.position.x < otherRight && right > other.position.x && node.position.y < otherBottom && bottom > other.position.y
        }
    }
    public func resolveCollisions(_ nodeId: String, _ spacing: Double = 10) {
        guard let node = nodeStore[nodeId] else { return }
        let width = node.width ?? pyreonFlowDefaultNodeWidth
        let height = node.height ?? pyreonFlowDefaultNodeHeight
        for other in getOverlappingNodes(nodeId) {
            let otherWidth = other.width ?? pyreonFlowDefaultNodeWidth
            let otherHeight = other.height ?? pyreonFlowDefaultNodeHeight
            let overlapX = min(node.position.x + width - other.position.x, other.position.x + otherWidth - node.position.x)
            let overlapY = min(node.position.y + height - other.position.y, other.position.y + otherHeight - node.position.y)
            if overlapX < overlapY {
                let dx = node.position.x < other.position.x ? -(overlapX + spacing) / 2 : (overlapX + spacing) / 2
                updateNodePosition(other.id, PyreonXYPosition(x: other.position.x - dx, y: other.position.y))
            } else {
                let dy = node.position.y < other.position.y ? -(overlapY + spacing) / 2 : (overlapY + spacing) / 2
                updateNodePosition(other.id, PyreonXYPosition(x: other.position.x, y: other.position.y - dy))
            }
        }
    }
    public func moveSelectedNodes(_ dx: Double, _ dy: Double) {
        for id in selectedNodeIds where nodeStore[id] != nil {
            let position = nodeStore[id]!.position
            updateNodePosition(id, PyreonXYPosition(x: position.x + dx, y: position.y + dy))
        }
    }

    /// Shared hardware-keyboard contract used by the SwiftUI host. Returns
    /// true when Flow consumed the key; an editable native child can keep the
    /// event by handling it before it reaches the canvas.
    @discardableResult
    public func handleKeyboardCommand(
        _ key: String,
        nodeId: String? = nil,
        shift: Bool = false,
        command: Bool = false,
        repeatKey: Bool = false
    ) -> Bool {
        if disableKeyboardA11y { return false }
        if let nodeId, let node = nodeStore[nodeId] {
            if key == "Enter" || key == " " {
                guard node.selectable ?? nodesSelectable else { return false }
                selectNode(nodeId, additive: shift)
                return true
            }
            let delta: (Double, Double)? = switch key {
            case "ArrowLeft": (-1, 0)
            case "ArrowRight": (1, 0)
            case "ArrowUp": (0, -1)
            case "ArrowDown": (0, 1)
            default: nil
            }
            if let delta {
                guard node.draggable ?? nodesDraggable else { return false }
                if !repeatKey { pushHistory() }
                if !isNodeSelected(nodeId) { selectNode(nodeId) }
                let step = shift ? 100.0 : 10.0
                moveSelectedNodes(delta.0 * step, delta.1 * step)
                return true
            }
        }
        if deleteKeys?.contains(key) == true {
            pushHistory(); deleteSelected(); return true
        }
        if key == "Escape" { clearSelection(); return true }
        guard command else { return false }
        switch key.lowercased() {
        case "a": selectAll(); return true
        case "c": copySelected(); return true
        case "v": paste(); return true
        case "z": shift ? redo() : undo(); return true
        default: return false
        }
    }
    public func focusNode(_ nodeId: String, _ focusZoom: Double? = nil) {
        guard let node = nodeStore[nodeId] else { return }
        let position = node.parentId == nil ? node.position : getAbsolutePosition(nodeId)
        let z = min(max(focusZoom ?? viewport.zoom, minZoom), maxZoom)
        let centerX = position.x + (node.width ?? pyreonFlowDefaultNodeWidth) / 2
        let centerY = position.y + (node.height ?? pyreonFlowDefaultNodeHeight) / 2
        viewport = PyreonFlowViewport(x: -centerX * z + containerSize.width / 2, y: -centerY * z + containerSize.height / 2, zoom: z)
        emitViewportChange()
        selectNode(nodeId)
    }
}
