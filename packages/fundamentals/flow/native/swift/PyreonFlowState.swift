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
/// `Equatable` when `T` is, so a SwiftUI view can be `Equatable` over it.
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

/// An edge — mirrors `FlowEdge`'s core (non-marker/waypoint) fields.
public struct PyreonFlowEdge: Equatable {
    public var id: String
    public var source: String
    public var target: String
    /// Never `nil` once stored: the engine applies the web `normalizeEdge`
    /// default (`type ?? 'bezier'`) on seed AND `addEdge`, so `edges[i].type`
    /// reads the same on every target.
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
    @ObservationIgnored private var order: [String] = []
    @ObservationIgnored private var nodeStore: [String: PyreonFlowNode<T>] = [:]
    @ObservationIgnored private var boxes: [String: PyreonFlowNodeBox<T>] = [:]
    /// Bumped on every node add/remove/move — the whole-array subscription.
    private var nodesVersion: UInt = 0
    /// Every node in insertion order. Reading it subscribes to EVERY node
    /// change (use `getNode(id)` in per-node views).
    public var nodes: [PyreonFlowNode<T>] {
        _ = nodesVersion
        return order.map { nodeStore[$0]! }
    }

    public private(set) var edges: [PyreonFlowEdge] = []
    private var edgeIds: Set<String> = []

    public private(set) var viewport: PyreonFlowViewport
    /// Written by the hosting view's own size measurement — see the file header.
    public var containerSize = PyreonFlowContainerSize()

    private var selectedNodeIds: [String] = []
    private var selectedNodeIdSet: Set<String> = []
    private var selectedEdgeIds: [String] = []
    private var selectedEdgeIdSet: Set<String> = []

    private let minZoom: Double
    private let maxZoom: Double

    public init(
        nodes: [PyreonFlowNode<T>] = [],
        edges: [PyreonFlowEdge] = [],
        viewport: PyreonFlowViewport = PyreonFlowViewport(),
        minZoom: Double = 0.1,
        maxZoom: Double = 4
    ) {
        self.viewport = viewport
        self.minZoom = minZoom
        self.maxZoom = maxZoom
        for node in nodes { insertNode(node) }
        for edge in edges { insertEdge(edge) }
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
    }
    /// Applies the web `normalizeEdge` default (`type ?? 'bezier'`); dedupes by id.
    private func insertEdge(_ edge: PyreonFlowEdge) {
        guard !edgeIds.contains(edge.id) else { return }
        var e = edge
        if e.type == nil { e.type = pyreonFlowDefaultEdgeType }
        edges.append(e)
        edgeIds.insert(e.id)
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
        }
        nodesVersion &+= 1
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
    public func addNode(_ node: PyreonFlowNode<T>) {
        insertNode(node)
    }
    /// Removes the node AND every edge connected to it (source or target) —
    /// same as the web `removeNode`.
    public func removeNode(_ id: String) {
        guard nodeStore[id] != nil else { return }
        removeNodes([id])
    }
    /// O(1); invalidates the views reading THIS node (its box) and whole-array
    /// readers (`nodesVersion`) — never the other nodes' views.
    public func updateNodePosition(_ id: String, _ position: PyreonXYPosition) {
        guard nodeStore[id] != nil else { return }
        nodeStore[id]!.position = position
        boxes[id]!.node.position = position
        nodesVersion &+= 1
    }

    // ── edge operations ─────────────────────────────────────────────────────
    public func getEdge(_ id: String) -> PyreonFlowEdge? {
        guard edgeIds.contains(id) else { return nil }
        return edges.first { $0.id == id }
    }
    /// Adds the edge unless an edge with the same `id` already exists — same
    /// dedupe-by-id contract as the web `addEdge`; applies `type ?? 'bezier'`.
    public func addEdge(_ edge: PyreonFlowEdge) {
        insertEdge(edge)
    }
    public func removeEdge(_ id: String) {
        guard edgeIds.contains(id) else { return }
        // Single id: find-then-remove (one String compare per element, no
        // closure indirection) — the predicate path exists for node-driven
        // removal, where many edges can go in one pass.
        guard let i = edges.firstIndex(where: { $0.id == id }) else { return }
        edges.remove(at: i)
        edgeIds.remove(id)
        if selectedEdgeIdSet.remove(id) != nil { selectedEdgeIds.removeAll { $0 == id } }
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
        if additive {
            if selectedNodeIdSet.insert(id).inserted { selectedNodeIds.append(id) }
        } else {
            setNodeSelection([id])
            setEdgeSelection([])
        }
    }
    public func deselectNode(_ id: String) {
        if selectedNodeIdSet.remove(id) != nil { selectedNodeIds.removeAll { $0 == id } }
    }
    public func selectEdge(_ id: String, additive: Bool = false) {
        if additive {
            if selectedEdgeIdSet.insert(id).inserted { selectedEdgeIds.append(id) }
        } else {
            setEdgeSelection([id])
            setNodeSelection([])
        }
    }
    public func clearSelection() {
        setNodeSelection([])
        setEdgeSelection([])
    }
    /// Selects every node. Edge selection is LEFT ALONE — the web `selectAll`
    /// (`flow.ts`) only replaces the node set; v1 of both native ports also
    /// cleared the edge set, a divergence the tests locked in by omission.
    public func selectAll() {
        setNodeSelection(order)
    }
    /// Removes every currently-selected node (and its connected edges) and
    /// every currently-selected edge — the SAME net effect AND the same
    /// single-pass shape as the web `deleteSelected` (`flow.ts`): the
    /// selection sets are built ONCE and each collection is scanned ONCE,
    /// O(N + E) — never one `removeNode` call per selected id, which re-scans
    /// on every iteration and makes "select all, then delete" quadratic.
    public func deleteSelected() {
        let nodeIdsToRemove = selectedNodeIdSet
        let edgeIdsToRemove = selectedEdgeIdSet
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
        guard containerSize.width > 0, containerSize.height > 0 else { return }
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
            minX = min(minX, node.position.x)
            minY = min(minY, node.position.y)
            maxX = max(maxX, node.position.x + w)
            maxY = max(maxY, node.position.y + h)
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
    /// Nodes with an edge INTO `nodeId`, in node insertion order (web parity).
    public func getIncomers(_ nodeId: String) -> [PyreonFlowNode<T>] {
        let sourceIds = Set(edges.filter { $0.target == nodeId }.map(\.source))
        return order.compactMap { sourceIds.contains($0) ? nodeStore[$0]! : nil }
    }
    public func getOutgoers(_ nodeId: String) -> [PyreonFlowNode<T>] {
        let targetIds = Set(edges.filter { $0.source == nodeId }.map(\.target))
        return order.compactMap { targetIds.contains($0) ? nodeStore[$0]! : nil }
    }
}
