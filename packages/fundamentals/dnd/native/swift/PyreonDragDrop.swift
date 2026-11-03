// PyreonDragDrop — the iOS-native port of @pyreon/dnd's `useDraggable` / `useDroppable`.
//
// The web hooks register DOM elements with pragmatic-drag-and-drop. That engine does NOT cross: a drag on iOS is a
// platform gesture. What DOES cross is the part an author reasons about — WHAT is carried (`data`), WHERE it may
// land (`canDrop`), WHAT happens on landing (`onDrop(source, { edge })`), and the hover state a target renders
// (`isOver`, `overEdge`). The gesture layer is SwiftUI's own `.onDrag` / `.onDrop(of:delegate:)`, so a drag reads as a
// normal iOS drag.
//
// The PAYLOAD is JSON text. A draggable's `data` is an object literal on the web (`{ id, kind }`), so the draggable
// carries a dictionary of scalars and a droppable decodes it into whatever `Decodable` type its `onDrop` parameter is
// annotated with — the two hooks never need to share a Swift type, exactly as they share none on the web.
//
// Two honest limits, both documented on the plugin and in the docs:
//   * SwiftUI reports no callback when a drag is CANCELLED, so `isDragging` returns to false on the next DROP
//     anywhere (via `PyreonDragSession`) but not after a cancelled drag.
//   * `canDrop` needs the decoded payload, which UIKit only delivers asynchronously at drop time, so it is evaluated
//     when the drop lands, not while hovering — `isOver` can highlight a target that then rejects the drop.

import Foundation
import Observation
import SwiftUI

/// One JSON-scalar of a draggable's `data` object.
public enum PyreonDragValue: Encodable, Equatable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)

    public init(_ value: String) { self = .string(value) }
    public init(_ value: Int) { self = .int(value) }
    public init(_ value: Double) { self = .double(value) }
    public init(_ value: Bool) { self = .bool(value) }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .bool(let v): try container.encode(v)
        }
    }
}

/// The JSON text a drag carries. Keys are sorted so one `data` always serialises to the same string.
public enum PyreonDragPayload {
    public static func encode(_ data: [String: PyreonDragValue]) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let bytes = try? encoder.encode(data), let text = String(data: bytes, encoding: .utf8) else {
            return "{}"
        }
        return text
    }

    /// `nil` when the text is not a JSON object of the expected shape — a foreign drag (a plain string from
    /// another app) must be refused, never crash the drop.
    public static func decode<S: Decodable>(_ text: String, as type: S.Type) -> S? {
        guard let bytes = text.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(S.self, from: bytes)
    }
}

/// Where a drop landed — the second argument of `onDrop(source, location)`. `edge` is the nearest CONFIGURED edge
/// (`nil` when the droppable configured none), captured before the hover state resets, as on the web.
public struct PyreonDropLocation: Equatable {
    public let edge: String?
    public init(edge: String?) { self.edge = edge }
}

/// Which draggable is mid-drag, so a drop landing anywhere can clear its `isDragging`. One slot, replaced on
/// every drag start — bounded by construction, no registry to leak.
public enum PyreonDragSession {
    nonisolated(unsafe) private static var finishActive: (() -> Void)?

    public static func begin(_ finish: @escaping () -> Void) {
        finishActive?()
        finishActive = finish
    }

    public static func finish() {
        let done = finishActive
        finishActive = nil
        done?()
    }
}

/// The nearest of the configured `edges` to `point` inside a view of `size` — pdnd's closest-edge, over only the
/// edges the author asked for. `nil` with no edges configured.
public func pyreonClosestEdge(_ point: CGPoint, in size: CGSize, edges: [PyreonDropEdge]) -> PyreonDropEdge? {
    var best: (PyreonDropEdge, Double)?
    for edge in edges {
        let distance: Double
        switch edge {
        case .top: distance = Double(point.y)
        case .bottom: distance = Double(size.height - point.y)
        case .left: distance = Double(point.x)
        case .right: distance = Double(size.width - point.x)
        }
        if best == nil || distance < best!.1 { best = (edge, distance) }
    }
    return best?.0
}

/// Draggable state. The data source is wired AFTER init via `bind` (from `.onAppear`), for the same reason as
/// `PyreonSortableState`: a `@State` initializer cannot capture the view's own state.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonDraggableState {
    private var dataProvider: () -> [String: PyreonDragValue] = { [:] }
    private var disabledProvider: () -> Bool = { false }

    /// True from drag start until the next drop (see the header for the cancelled-drag limit).
    public private(set) var dragging = false

    public init() {}

    public func bind(data: @escaping () -> [String: PyreonDragValue], disabled: @escaping () -> Bool = { false }) {
        self.dataProvider = data
        self.disabledProvider = disabled
    }

    // The web result surface, name-for-name (`isDragging`), so a row template compiles unchanged.
    public func isDragging() -> Bool { dragging }
    public func isDisabled() -> Bool { disabledProvider() }

    /// The drag lifted: mark it and hand back the JSON payload.
    public func begin() -> String {
        dragging = true
        PyreonDragSession.begin { [weak self] in self?.end() }
        return PyreonDragPayload.encode(dataProvider())
    }

    public func end() { dragging = false }
}

/// Droppable state: whether a drag hovers, the nearest configured edge, and the three sinks.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonDroppableState<S: Decodable> {
    private var canDropFn: (S) -> Bool = { _ in true }
    private var onDropFn: (S, PyreonDropLocation) -> Void = { _, _ in }
    private var onEnterFn: () -> Void = {}
    private var onLeaveFn: () -> Void = {}

    public private(set) var over = false
    public private(set) var edge: PyreonDropEdge?
    public let edges: [PyreonDropEdge]

    public init(edges: [PyreonDropEdge] = []) {
        self.edges = edges
    }

    public func bind(
        canDrop: @escaping (S) -> Bool = { _ in true },
        onDrop: @escaping (S, PyreonDropLocation) -> Void = { _, _ in },
        onDragEnter: @escaping () -> Void = {},
        onDragLeave: @escaping () -> Void = {}
    ) {
        self.canDropFn = canDrop
        self.onDropFn = onDrop
        self.onEnterFn = onDragEnter
        self.onLeaveFn = onDragLeave
    }

    public func isOver() -> Bool { over }
    public func overEdge() -> String? { edge?.rawValue }

    public func enter() {
        if !over { onEnterFn() }
        over = true
    }

    public func move(_ point: CGPoint, in size: CGSize) {
        edge = pyreonClosestEdge(point, in: size, edges: edges)
    }

    public func leave() {
        if over { onLeaveFn() }
        over = false
        edge = nil
    }

    /// A drop landed with `text` as its payload. Returns whether it was accepted. The edge is captured BEFORE the
    /// hover state resets, as on the web.
    @discardableResult
    public func accept(_ text: String, at point: CGPoint, in size: CGSize) -> Bool {
        let landed = pyreonClosestEdge(point, in: size, edges: edges)
        over = false
        edge = nil
        guard let source = PyreonDragPayload.decode(text, as: S.self), canDropFn(source) else {
            PyreonDragSession.finish()
            return false
        }
        onDropFn(source, PyreonDropLocation(edge: landed?.rawValue))
        PyreonDragSession.finish()
        return true
    }
}

// ─────────────────────────── SwiftUI binding ────────────────────────────────

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonDraggableModifier: ViewModifier {
    private let state: PyreonDraggableState

    public init(state: PyreonDraggableState) {
        self.state = state
    }

    public func body(content: Content) -> some View {
        if state.isDisabled() {
            content
        } else {
            content.onDrag {
                NSItemProvider(object: state.begin() as NSString)
            }
        }
    }
}

@available(iOS 17.0, macOS 14.0, *)
private struct PyreonDropHandler<S: Decodable>: DropDelegate {
    let state: PyreonDroppableState<S>
    let size: CGSize

    func dropEntered(info: DropInfo) {
        state.enter()
        state.move(info.location, in: size)
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        state.move(info.location, in: size)
        return DropProposal(operation: .move)
    }

    func dropExited(info: DropInfo) { state.leave() }

    func validateDrop(info: DropInfo) -> Bool { info.hasItemsConforming(to: [.plainText]) }

    func performDrop(info: DropInfo) -> Bool {
        guard let provider = info.itemProviders(for: [.plainText]).first else {
            state.leave()
            return false
        }
        let point = info.location
        let size = self.size
        let state = self.state
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            let text = (object as? NSString) as String?
            DispatchQueue.main.async {
                guard let text else {
                    state.leave()
                    PyreonDragSession.finish()
                    return
                }
                state.accept(text, at: point, in: size)
            }
        }
        return true
    }
}

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonDroppableModifier<S: Decodable>: ViewModifier {
    private let state: PyreonDroppableState<S>
    @State private var measured: CGSize = .zero

    public init(state: PyreonDroppableState<S>) {
        self.state = state
    }

    public func body(content: Content) -> some View {
        content
            .background(
                GeometryReader { proxy in
                    Color.clear
                        .onAppear { measured = proxy.size }
                        .onChange(of: proxy.size) { _, next in measured = next }
                }
            )
            .onDrop(of: [.plainText], delegate: PyreonDropHandler(state: state, size: measured))
    }
}

@available(iOS 17.0, macOS 14.0, *)
extension View {
    /// Make this view draggable with `state`'s data. Emitted by PMTC for `ref={d.ref}` on a `useDraggable`.
    public func pyreonDraggable(_ state: PyreonDraggableState) -> some View {
        modifier(PyreonDraggableModifier(state: state))
    }

    /// Make this view a drop target of `state`. Emitted by PMTC for `ref={d.ref}` on a `useDroppable`.
    public func pyreonDroppable<S: Decodable>(_ state: PyreonDroppableState<S>) -> some View {
        modifier(PyreonDroppableModifier(state: state))
    }
}
