// PyreonSortable — the iOS-native port of @pyreon/dnd's `useSortable`.
//
// The web hook is pointer-driven (pragmatic-drag-and-drop over DOM events).
// That engine does NOT cross: a drag on iOS is a platform gesture, not a
// pointer-event protocol. What DOES cross is the part an author reasons about
// — the REORDER SEMANTICS: which item is lifted, which item it is over, which
// EDGE of that item the pointer is nearest, and where the moved element lands.
// That logic is pure, and `moveIndex` below is a verbatim port of the
// TypeScript `performReorder` arithmetic, so a drop at a given edge produces
// the SAME array on web, iOS and Android.
//
// The gesture layer on top is deliberately NOT a DOM re-implementation: it is
// SwiftUI's own `.draggable` / `.dropDestination`, so a drag reads as a normal
// iOS drag (lift, system preview, spring-loading). It is also the only option
// available: PMTC lowers `<For>` to a bare `ForEach`, never a `List`, so
// `ForEach.onMove` — which requires a `List` — cannot be reached from
// compiled Pyreon source.
//
// The drag PAYLOAD is the item's key as a `String`. `String` already conforms
// to `Transferable`, so a consumer's row type needs no conformance of its own.
//
// `PyreonSortableState` is pure logic plus `@Observable` — the SwiftUI view
// modifiers live below the fold, so the engine unit-tests headlessly.

import Foundation
import Observation
import SwiftUI

/// Which way the list runs. Mirrors the web `axis` option.
public enum PyreonSortAxis: String, Equatable {
    case vertical
    case horizontal
}

/// The edge of the hovered item nearest the pointer — the insert side.
/// Mirrors the web `DropEdge`.
public enum PyreonDropEdge: String, Equatable {
    case top
    case bottom
    case left
    case right
}

/// Sortable-list state: which key is lifted, which key it is over, and the
/// edge of that key. Mutating through the methods below drives a SwiftUI
/// re-render (`@Observable`).
///
/// The reactive item source is wired AFTER init via `bind` (from SwiftUI's
/// `.onAppear`), because a `@State` property initializer cannot capture the
/// view's own state — the same constraint `PyreonTableState.setData` documents.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonSortableState<T> {
    private var itemsProvider: () -> [T] = { [] }
    private var keyOf: (T) -> String = { _ in "" }
    private var onReorderFn: ([T]) -> Void = { _ in }

    /// The key of the item being dragged, `nil` when idle.
    public private(set) var activeKey: String?
    /// The key of the item currently hovered, `nil` when none.
    public private(set) var overKey: String?
    /// The nearest edge of `overKey`, `nil` when none.
    public private(set) var currentEdge: PyreonDropEdge?

    public let axis: PyreonSortAxis

    public init(axis: PyreonSortAxis = .vertical) {
        self.axis = axis
    }

    /// Wire the reactive item source + reorder sink. Called from `.onAppear`.
    public func bind(
        items: @escaping () -> [T],
        by: @escaping (T) -> String,
        onReorder: @escaping ([T]) -> Void
    ) {
        self.itemsProvider = items
        self.keyOf = by
        self.onReorderFn = onReorder
    }

    // ── the web result surface, name-for-name ────────────────────────────────
    // `useSortable` returns `isActive` / `isOverKey` / `activeId` / `overId` /
    // `overEdge`, so the native engine spells them IDENTICALLY and returns the
    // same value shapes (edge as its raw string). That is what lets a row
    // template — `<Text opacity={s.isActive(t.id) ? 0.5 : 1}>` — compile
    // unchanged on all three targets with no compiler-side name mapping.
    public func isActive(_ key: String) -> Bool { activeKey == key }
    public func isOverKey(_ key: String) -> Bool { overKey == key }
    public func activeId() -> String? { activeKey }
    public func overId() -> String? { overKey }
    public func overEdge() -> String? { currentEdge?.rawValue }

    // ── drag lifecycle ───────────────────────────────────────────────────────
    /// The drag lifted off `key`.
    public func pickUp(_ key: String) { activeKey = key }

    /// The pointer is over `key`, nearest `edge`.
    public func dragOver(_ key: String, edge: PyreonDropEdge) {
        overKey = key
        currentEdge = edge
    }

    /// The pointer left `key`. A leave for a STALE key must not clear the live
    /// one — SwiftUI delivers the outgoing target's `isTargeted(false)` after
    /// the incoming target's `true`, so an unguarded clear blanks the
    /// highlight the user is actually over.
    public func dragLeave(_ key: String) {
        guard overKey == key else { return }
        overKey = nil
        currentEdge = nil
    }

    /// The drag ended without a drop.
    public func cancel() {
        activeKey = nil
        overKey = nil
        currentEdge = nil
    }

    /// Commit a drop of `source` onto `target` at `edge`. Returns `true` when
    /// the list actually changed, so a drop destination can report handled.
    @discardableResult
    public func drop(source: String, on target: String, edge: PyreonDropEdge) -> Bool {
        defer { cancel() }
        guard let next = reordered(dragKey: source, dropKey: target, edge: edge) else {
            return false
        }
        onReorderFn(next)
        return true
    }

    // ── the shared reorder algorithm ─────────────────────────────────────────
    /// Move the element at `from` so that it sits at `to`, where `to` is an
    /// index in the list WITHOUT the moved element. The single mutation
    /// primitive both the edge path and any displacement path route through,
    /// so every platform lands on identical arithmetic.
    public static func moveIndex(_ list: [T], from: Int, to: Int) -> [T] {
        var out = list
        let moved = out.remove(at: from)
        out.insert(moved, at: max(0, min(to, out.count)))
        return out
    }

    /// Pure reorder: move `dragKey` next to `dropKey`, inserting on `edge`'s
    /// side. Returns `nil` when the move is a no-op (same key, or either key
    /// missing) — matching the TypeScript `performReorder` guards exactly.
    ///
    /// The insert-index arithmetic is a verbatim port of the web engine; that
    /// is what makes a drop produce the same array on all three targets.
    public func reordered(dragKey: String, dropKey: String, edge: PyreonDropEdge) -> [T]? {
        if dragKey == dropKey { return nil }
        let current = itemsProvider()
        guard
            let dragIndex = current.firstIndex(where: { keyOf($0) == dragKey }),
            let dropIndex = current.firstIndex(where: { keyOf($0) == dropKey })
        else { return nil }

        let after = edge == .bottom || edge == .right
        let rawInsert: Int
        if after {
            rawInsert = dropIndex >= dragIndex ? dropIndex : dropIndex + 1
        } else {
            rawInsert = dropIndex <= dragIndex ? dropIndex : dropIndex - 1
        }
        return PyreonSortableState.moveIndex(current, from: dragIndex, to: rawInsert)
    }

    /// The edge nearest a drop `point` inside a view of `size`, on this
    /// state's axis. Vertical lists split top/bottom at the midline;
    /// horizontal lists split left/right.
    public func edgeAt(_ point: CGPoint, in size: CGSize) -> PyreonDropEdge {
        switch axis {
        case .vertical:
            return point.y < size.height / 2 ? .top : .bottom
        case .horizontal:
            return point.x < size.width / 2 ? .left : .right
        }
    }
}

// ─────────────────────────── SwiftUI binding ────────────────────────────────

/// The per-item drag/drop wiring. A `ViewModifier` (not a bare `View`
/// extension) because it needs its OWN `@State` for the measured item size:
/// the drop `location` arrives in the item's LOCAL space, and the edge is
/// meaningless without the item's height/width.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonSortableItemModifier<T>: ViewModifier {
    private let state: PyreonSortableState<T>
    private let key: String
    @State private var measured: CGSize = .zero

    public init(state: PyreonSortableState<T>, key: String) {
        self.state = state
        self.key = key
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
            // The lifted row dims — the standard iOS drag affordance.
            .opacity(state.isActive(key) ? 0.5 : 1)
            .draggable(key) {
                // The drag preview. Returning `content` would re-enter this
                // modifier; a neutral chip keeps the preview cheap.
                Text(key).padding(6)
            }
            .dropDestination(for: String.self) { payload, location in
                guard let source = payload.first else { return false }
                return state.drop(
                    source: source,
                    on: key,
                    edge: state.edgeAt(location, in: measured)
                )
            } isTargeted: { targeted in
                if targeted {
                    // The precise edge arrives with the drop location; on
                    // entry seed the leading edge so a hover highlight has
                    // something to read.
                    state.dragOver(key, edge: state.axis == .vertical ? .top : .left)
                } else {
                    state.dragLeave(key)
                }
            }
    }
}

@available(iOS 17.0, macOS 14.0, *)
extension View {
    /// Make this view a sortable item of `state`, identified by `key`.
    /// Emitted by PMTC for `ref={s.itemRef(key)}`.
    public func pyreonSortableItem<T>(
        _ state: PyreonSortableState<T>,
        key: String
    ) -> some View {
        modifier(PyreonSortableItemModifier(state: state, key: key))
    }

    /// Mark this view as the sortable CONTAINER of `state`. Emitted by PMTC
    /// for `ref={s.containerRef}`. It groups the items for assistive
    /// technology and carries the reorder hint; the per-item modifier owns the
    /// drag itself.
    public func pyreonSortableContainer<T>(
        _ state: PyreonSortableState<T>
    ) -> some View {
        accessibilityElement(children: .contain)
            .accessibilityHint(Text("Drag an item to reorder the list"))
    }
}
