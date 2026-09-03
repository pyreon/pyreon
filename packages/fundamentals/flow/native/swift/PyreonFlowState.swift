// PyreonFlowState — the iOS-native port of @pyreon/flow's dependency-free
// `createFlow`. Same node/edge/viewport/selection behaviour as the
// TypeScript engine (`flow.ts`), so a diagram author gets 1:1 results on
// web AND native from one mental model.
//
// Scope (v1 — mirrors the discipline `PyreonTableState` set: a real, useful
// subset now, the rest named as follow-ups rather than silently missing):
//   - Node/edge CRUD, selection, viewport (pan/zoom/fitView), graph queries.
//   - NOT YET ported: `updateNode` (partial merge — no faithful Swift shape
//     without a builder closure), `isValidConnection` (needs connection-rule
//     config), bulk `selectNodes`, `layout()` (the separate layout-engine
//     crossing), `undo`/`redo`/`pushHistory`, `copySelected`/`paste`,
//     `moveSelectedNodes`/snap-lines (drag-session internals — tied to the
//     native gesture layer, a follow-up), sub-flow/group queries.
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

/// A 2D point in flow (unscaled diagram) coordinates.
public struct PyreonXYPosition: Equatable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
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
public struct PyreonFlowNode<T> {
    public var id: String
    public var type: String?
    public var position: PyreonXYPosition
    public var data: T
    public var width: Double?
    public var height: Double?

    public init(
        id: String,
        type: String? = nil,
        position: PyreonXYPosition,
        data: T,
        width: Double? = nil,
        height: Double? = nil
    ) {
        self.id = id
        self.type = type
        self.position = position
        self.data = data
        self.width = width
        self.height = height
    }
}

/// An edge — mirrors `FlowEdge`'s core (non-marker/waypoint) fields.
public struct PyreonFlowEdge: Equatable {
    public var id: String
    public var source: String
    public var target: String
    public var type: String?
    public var label: String?
    public var animated: Bool

    public init(
        id: String,
        source: String,
        target: String,
        type: String? = nil,
        label: String? = nil,
        animated: Bool = false
    ) {
        self.id = id
        self.source = source
        self.target = target
        self.type = type
        self.label = label
        self.animated = animated
    }
}

/// Default node box when a node declares no explicit width/height — the
/// SAME `150×40` fallback `DEFAULT_NODE_WIDTH`/`DEFAULT_NODE_HEIGHT` use on
/// web (`edges.ts`), so `fitView` frames the graph identically on every
/// target even before real measured sizes are wired in (a Phase 2 follow-up:
/// a per-node `GeometryReader` writing its real size back, mirroring the web
/// `measurements` map).
public let pyreonFlowDefaultNodeWidth: Double = 150
public let pyreonFlowDefaultNodeHeight: Double = 40

/// Reactive flow-diagram state: nodes, edges, viewport, selection. Behaviour-
/// identical to the TS `createFlow` for the v1 surface documented above.
///
/// `@Observable` so a SwiftUI view reading `nodes()`/`edges()`/`viewport()`
/// re-renders on mutation — same binding shape as `PyreonTableState`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonFlowState<T> {
    public private(set) var nodes: [PyreonFlowNode<T>]
    public private(set) var edges: [PyreonFlowEdge]
    public private(set) var viewport: PyreonFlowViewport
    /// Written by the hosting view's own size measurement — see the file header.
    public var containerSize: (width: Double, height: Double) = (0, 0)

    private var selectedNodeIdSet: [String] = []
    private var selectedEdgeIdSet: [String] = []

    private let minZoom: Double
    private let maxZoom: Double

    public init(
        nodes: [PyreonFlowNode<T>] = [],
        edges: [PyreonFlowEdge] = [],
        viewport: PyreonFlowViewport = PyreonFlowViewport(),
        minZoom: Double = 0.1,
        maxZoom: Double = 4
    ) {
        self.nodes = nodes
        self.edges = edges
        self.viewport = viewport
        self.minZoom = minZoom
        self.maxZoom = maxZoom
    }

    /// Current zoom factor — `viewport.zoom`, exposed the same way the web
    /// `zoom: Computed<number>` is: a derived read, no independent storage.
    public var zoom: Double { viewport.zoom }

    // ── node operations ─────────────────────────────────────────────────────
    public func getNode(_ id: String) -> PyreonFlowNode<T>? {
        nodes.first { $0.id == id }
    }
    public func addNode(_ node: PyreonFlowNode<T>) {
        nodes.append(node)
    }
    /// Removes the node AND every edge connected to it (source or target) —
    /// same as the web `removeNode`.
    public func removeNode(_ id: String) {
        nodes.removeAll { $0.id == id }
        edges.removeAll { $0.source == id || $0.target == id }
        selectedNodeIdSet.removeAll { $0 == id }
    }
    public func updateNodePosition(_ id: String, _ position: PyreonXYPosition) {
        guard let i = nodes.firstIndex(where: { $0.id == id }) else { return }
        nodes[i].position = position
    }

    // ── edge operations ─────────────────────────────────────────────────────
    public func getEdge(_ id: String) -> PyreonFlowEdge? {
        edges.first { $0.id == id }
    }
    /// Adds the edge unless an edge with the same `id` already exists — same
    /// dedupe-by-id contract as the web `addEdge`.
    public func addEdge(_ edge: PyreonFlowEdge) {
        guard !edges.contains(where: { $0.id == edge.id }) else { return }
        edges.append(edge)
    }
    public func removeEdge(_ id: String) {
        edges.removeAll { $0.id == id }
        selectedEdgeIdSet.removeAll { $0 == id }
    }

    // ── selection ────────────────────────────────────────────────────────────
    // Selecting a node NON-additively clears edge selection, and vice versa —
    // the two selections are mutually exclusive unless additive. Mirrors the
    // web `selectNode`/`selectEdge` exactly.
    public func isNodeSelected(_ id: String) -> Bool { selectedNodeIdSet.contains(id) }
    public func isEdgeSelected(_ id: String) -> Bool { selectedEdgeIdSet.contains(id) }
    public func selectedNodes() -> [String] { selectedNodeIdSet }
    public func selectedEdges() -> [String] { selectedEdgeIdSet }

    public func selectNode(_ id: String, additive: Bool = false) {
        if additive {
            if !selectedNodeIdSet.contains(id) { selectedNodeIdSet.append(id) }
        } else {
            selectedNodeIdSet = [id]
            selectedEdgeIdSet = []
        }
    }
    public func deselectNode(_ id: String) {
        selectedNodeIdSet.removeAll { $0 == id }
    }
    public func selectEdge(_ id: String, additive: Bool = false) {
        if additive {
            if !selectedEdgeIdSet.contains(id) { selectedEdgeIdSet.append(id) }
        } else {
            selectedEdgeIdSet = [id]
            selectedNodeIdSet = []
        }
    }
    public func clearSelection() {
        selectedNodeIdSet = []
        selectedEdgeIdSet = []
    }
    public func selectAll() {
        selectedNodeIdSet = nodes.map(\.id)
        selectedEdgeIdSet = []
    }
    /// Removes every currently-selected node (and its connected edges) and
    /// every currently-selected edge — the SAME net effect AND the same
    /// single-pass shape as the web `deleteSelected` (`flow.ts`).
    ///
    /// A prior version built this from the CRUD primitives above — one
    /// `removeNode`/`removeEdge` call per selected id — which is correct but
    /// quadratic: each `removeNode` call re-scans the WHOLE `nodes` and
    /// `edges` arrays, so K selected nodes cost O(K × (N + E)), not O(N + E).
    /// "Select all, then delete" is the shape that makes K = N: on a
    /// thousand-node graph that is ~1,000,000 comparisons for one keypress
    /// instead of ~2,000. The web engine avoids exactly this — its
    /// `deleteSelected` builds `Set`s from the selection ONCE and does ONE
    /// `filter` pass each over `nodes`/`edges` — and this native port is
    /// documented as byte-aligned with it, so the loop was a real divergence
    /// from the reference it claims to match, not a deliberate trade-off.
    ///
    /// This was never a batching question (the removed comment's "no
    /// batching win to chase" was correct on its own narrow point — native
    /// mutations need no `batch()`-style notification coalescing — but that
    /// is a different axis from how many times the arrays get SCANNED, and
    /// conflating the two is what let the O(n²) shape read as intentional).
    public func deleteSelected() {
        if !selectedNodeIdSet.isEmpty {
            let nodeIdsToRemove = Set(selectedNodeIdSet)
            let edgeIdsToRemove = Set(selectedEdgeIdSet)
            nodes.removeAll { nodeIdsToRemove.contains($0.id) }
            edges.removeAll {
                nodeIdsToRemove.contains($0.source) || nodeIdsToRemove.contains($0.target)
                    || edgeIdsToRemove.contains($0.id)
            }
        } else if !selectedEdgeIdSet.isEmpty {
            let edgeIdsToRemove = Set(selectedEdgeIdSet)
            edges.removeAll { edgeIdsToRemove.contains($0.id) }
        }
        selectedNodeIdSet = []
        selectedEdgeIdSet = []
    }

    // ── viewport ─────────────────────────────────────────────────────────────
    public func zoomTo(_ z: Double) {
        viewport.zoom = min(max(z, minZoom), maxZoom)
    }
    public func zoomIn() {
        viewport.zoom = min(viewport.zoom * 1.2, maxZoom)
    }
    public func zoomOut() {
        viewport.zoom = max(viewport.zoom / 1.2, minZoom)
    }
    /// Pans so `position` (in flow coordinates) lands at the viewport origin —
    /// an ABSOLUTE pan-to-point, not a relative nudge. Matches the web `panTo`.
    public func panTo(_ position: PyreonXYPosition) {
        viewport.x = -position.x * viewport.zoom
        viewport.y = -position.y * viewport.zoom
    }
    /// Frames every node (or just `nodeIds`, when given) inside the current
    /// `containerSize`, with `padding` as a fraction of the graph's extent on
    /// each axis (default `0.1`, matching the web `fitViewPadding` default).
    /// A no-op when there is nothing to frame, or `containerSize` hasn't been
    /// measured yet (both `0`).
    public func fitView(_ nodeIds: [String]? = nil, padding: Double = 0.1) {
        let target = nodeIds.map { ids in nodes.filter { ids.contains($0.id) } } ?? nodes
        guard !target.isEmpty, containerSize.width > 0, containerSize.height > 0 else { return }

        var minX = Double.infinity
        var minY = Double.infinity
        var maxX = -Double.infinity
        var maxY = -Double.infinity
        for node in target {
            let w = node.width ?? pyreonFlowDefaultNodeWidth
            let h = node.height ?? pyreonFlowDefaultNodeHeight
            minX = min(minX, node.position.x)
            minY = min(minY, node.position.y)
            maxX = max(maxX, node.position.x + w)
            maxY = max(maxY, node.position.y + h)
        }

        let graphWidth = maxX - minX
        let graphHeight = maxY - minY
        guard graphWidth > 0 || graphHeight > 0 else { return }

        let zoomX = graphWidth > 0 ? containerSize.width / (graphWidth * (1 + padding * 2)) : .infinity
        let zoomY = graphHeight > 0 ? containerSize.height / (graphHeight * (1 + padding * 2)) : .infinity
        let newZoom = min(max(min(zoomX, zoomY), minZoom), maxZoom)

        let centerX = (minX + maxX) / 2
        let centerY = (minY + maxY) / 2

        viewport = PyreonFlowViewport(
            x: containerSize.width / 2 - centerX * newZoom,
            y: containerSize.height / 2 - centerY * newZoom,
            zoom: newZoom
        )
    }

    // ── graph queries ────────────────────────────────────────────────────────
    public func getConnectedEdges(_ nodeId: String) -> [PyreonFlowEdge] {
        edges.filter { $0.source == nodeId || $0.target == nodeId }
    }
    public func getIncomers(_ nodeId: String) -> [PyreonFlowNode<T>] {
        let sourceIds = Set(edges.filter { $0.target == nodeId }.map(\.source))
        return nodes.filter { sourceIds.contains($0.id) }
    }
    public func getOutgoers(_ nodeId: String) -> [PyreonFlowNode<T>] {
        let targetIds = Set(edges.filter { $0.source == nodeId }.map(\.target))
        return nodes.filter { targetIds.contains($0.id) }
    }
}
