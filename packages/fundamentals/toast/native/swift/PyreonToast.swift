// PyreonToast — the native runtime `@pyreon/toast` lowers to.
//
// A process-global, observable QUEUE of active toast notifications. The web
// package is imperative (`toast("Saved!")` from anywhere, no provider) + a
// `<Toaster />` renders the stack; this mirrors that shape natively:
//
//     PyreonToast.shared.add("Saved!")            // enqueue (auto-dismisses)
//     PyreonToast.shared.add("Failed", type: "error")
//     PyreonToast.shared.toasts                    // the live stack a Toaster reads
//     PyreonToast.shared.dismiss(id)               // remove one
//     PyreonToast.shared.clear()                   // remove all
//
// The QUEUE STATE (add / dismiss / remove / clear) is pure and synchronously
// unit-testable — the async auto-dismiss is a separate `Task.sleep` that calls
// the same `remove(_:)`. A `<Toaster />` reads `toasts` reactively; the emit
// wires it to a SwiftUI overlay.
//
// Mirrors the web store: newest toast last, a monotonic id counter (NOT a
// clock — rapid `add()` within one tick must not collide), a bounded stack
// (drop the oldest past `maxToasts`, matching the web `MAX_TOASTS` guard).

import Foundation
import Observation

/// One active toast. `Identifiable` so a SwiftUI `ForEach(toasts)` keys on `id`.
public struct PyreonToastItem: Identifiable, Equatable, Sendable {
    public let id: String
    public let message: String
    /// `"info" | "success" | "warning" | "error"` — drives the overlay's color.
    public let type: String
    /// Shows the card's dismiss button. Default true, as on the web.
    public let dismissible: Bool
    /// Optional secondary line under the message (the web's `description`).
    public let description: String?
    /// The action button's label, when the toast has one. Its handler is
    /// kept by `PyreonToast` (a closure would make the item neither
    /// `Equatable` nor `Sendable`).
    public let actionLabel: String?
    public init(id: String, message: String, type: String, dismissible: Bool = true, description: String? = nil, actionLabel: String? = nil) {
        self.id = id
        self.message = message
        self.type = type
        self.dismissible = dismissible
        self.description = description
        self.actionLabel = actionLabel
    }
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonToast {
    /// The app-wide store `toast(...)` enqueues into and `<Toaster />` renders.
    public static let shared = PyreonToast()

    /// The live stack, oldest first. Drives a SwiftUI re-render on change.
    public private(set) var toasts: [PyreonToastItem] = []

    /// Default auto-dismiss, seconds. 0 = persistent (caller dismisses). Mirrors
    /// the web `DEFAULT_DURATION` (4s).
    @ObservationIgnored public var defaultDuration: TimeInterval = 4

    /// Bound the stack so a runaway producer (a toast in an effect / a
    /// websocket firing one per message) can't grow it without limit — mirrors
    /// the web `MAX_TOASTS`.
    @ObservationIgnored public var maxToasts: Int = 50

    @ObservationIgnored private var counter = 0

    /// Action handlers by toast id. Dropped with the toast, so a dismissed
    /// toast's closure (and whatever it captured) is released.
    @ObservationIgnored private var actions: [String: () -> Void] = [:]

    /// `onDismiss` handlers by toast id. Like the web, one fires exactly once
    /// when its toast leaves the queue by ANY path — dismiss, expiry, `clear`,
    /// or eviction past `maxToasts`. Taken out of the table before it runs, so
    /// a handler that enqueues or dismisses another toast is re-entrancy safe.
    @ObservationIgnored private var dismissHandlers: [String: () -> Void] = [:]

    public init() {}

    /// Enqueue a toast; returns its id (for `dismiss`/`update`). Schedules an
    /// auto-dismiss after `duration` (defaults to `defaultDuration`; 0 keeps it
    /// until dismissed). The id is a monotonic counter, NOT a timestamp, so two
    /// `add()`s in the same millisecond get distinct ids.
    @discardableResult
    public func add(_ message: String, type: String = "info", duration: TimeInterval? = nil, dismissible: Bool = true, description: String? = nil, actionLabel: String? = nil, onAction: (() -> Void)? = nil, onDismiss: (() -> Void)? = nil) -> String {
        counter += 1
        let id = "toast-\(counter)"
        let hasAction = actionLabel != nil && onAction != nil
        toasts.append(PyreonToastItem(id: id, message: message, type: type, dismissible: dismissible, description: description, actionLabel: hasAction ? actionLabel : nil))
        if hasAction, let onAction { actions[id] = onAction }
        if let onDismiss { dismissHandlers[id] = onDismiss }
        // Bound the stack: drop the oldest beyond the cap. An evicted toast
        // has left the queue, so its `onDismiss` fires (as on the web).
        if toasts.count > maxToasts {
            let dropped = toasts.prefix(toasts.count - maxToasts).map(\.id)
            toasts.removeFirst(toasts.count - maxToasts)
            for droppedId in dropped { release(droppedId) }
        }
        let ttl = duration ?? defaultDuration
        if ttl > 0 {
            // `_Concurrency.Task`, not a bare `Task`: this file is compiled INTO
            // the app target, so an app with its own `Task` model shadows the
            // concurrency type and the bare name resolves to the user's struct
            // (`argument type '_' does not conform to expected type 'any
            // Decoder'`). A tasks app is exactly the app that has one. The
            // emitter already qualifies this for the same reason; the shipped
            // runtime did not, and nothing compiled it until now.
            _Concurrency.Task { @MainActor [weak self] in
                try? await _Concurrency.Task.sleep(nanoseconds: UInt64(ttl * 1_000_000_000))
                self?.remove(id)
            }
        }
        return id
    }

    /// Remove one toast by id (a no-op if already gone — e.g. auto-dismissed).
    public func dismiss(_ id: String) {
        remove(id)
    }

    /// The hard removal both `dismiss` and the auto-dismiss timer call.
    public func remove(_ id: String) {
        guard toasts.contains(where: { $0.id == id }) else { return }
        toasts.removeAll { $0.id == id }
        release(id)
    }

    /// Remove every toast; each one's `onDismiss` fires, oldest first.
    public func clear() {
        let ids = toasts.map(\.id)
        toasts.removeAll()
        for id in ids { release(id) }
    }

    /// Drop a departed toast's handlers, then fire its `onDismiss` once.
    private func release(_ id: String) {
        actions[id] = nil
        dismissHandlers.removeValue(forKey: id)?()
    }

    /// Run a toast's action handler. Like the web, the toast stays until it is
    /// dismissed or expires; a no-op once the toast is gone.
    public func runAction(_ id: String) {
        actions[id]?()
    }
}
