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
    public init(id: String, message: String, type: String) {
        self.id = id
        self.message = message
        self.type = type
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

    public init() {}

    /// Enqueue a toast; returns its id (for `dismiss`/`update`). Schedules an
    /// auto-dismiss after `duration` (defaults to `defaultDuration`; 0 keeps it
    /// until dismissed). The id is a monotonic counter, NOT a timestamp, so two
    /// `add()`s in the same millisecond get distinct ids.
    @discardableResult
    public func add(_ message: String, type: String = "info", duration: TimeInterval? = nil) -> String {
        counter += 1
        let id = "toast-\(counter)"
        toasts.append(PyreonToastItem(id: id, message: message, type: type))
        // Bound the stack: drop the oldest beyond the cap.
        if toasts.count > maxToasts {
            toasts.removeFirst(toasts.count - maxToasts)
        }
        let ttl = duration ?? defaultDuration
        if ttl > 0 {
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(ttl * 1_000_000_000))
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
        toasts.removeAll { $0.id == id }
    }

    /// Remove every toast.
    public func clear() {
        toasts.removeAll()
    }
}
