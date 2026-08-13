// PyreonNetworkStatus — the SwiftUI side of Pyreon's cross-platform
// online/offline story (Phase 4). Mirrors the core `@pyreon/hooks` `useOnline`
// surface and the Kotlin `PyreonNetworkStatus` one-for-one.
//
// ## What this delivers
//
// An `@Observable` reactive connectivity flag:
//
//     net.isOnline   // true while the device has a satisfied network path
//
// A SwiftUI view gating UI on `net.isOnline` (an offline banner, a disabled
// "Sync" button) re-renders when connectivity flips — the native analogue of
// the web `useOnline()` reactive boolean signal.
//
// ## Live monitoring
//
// `start()` attaches an `NWPathMonitor` (Apple's `Network` framework, on iOS
// AND macOS); its `pathUpdateHandler` drives `update(_:)` on the main actor as
// connectivity changes. `stop()` cancels the monitor. Construction does NOT
// auto-start — the `useOnline` compiler emit calls `start()` from the view's
// `.task {}` (mount) and `stop()` on disappear, matching the PyreonFetch
// harness shape.
//
// ## Scope — reactive state container
//
// The connectivity STATE machine (`isOnline` + `update`) is pure and
// synchronously unit-testable; the `NWPathMonitor` wiring is the thin live
// edge (constructed but not asserted in tests, same as PyreonFetch's
// URLSession). The `useOnline` compiler emit builds on this contract in a
// follow-up — the PyreonFetch / PyreonForm / PyreonPermissions
// per-service-port pattern.

import Foundation
import Network
import Observation

/// Observable reactive connectivity flag — the SwiftUI half of `useOnline`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonNetworkStatus {
    /// True while the device has a satisfied network path. Read in a view
    /// body to gate UI on connectivity; re-renders on every flip.
    public private(set) var isOnline: Bool

    /// The live path monitor. Nil until `start()`; held so `stop()` can
    /// cancel it. `@ObservationIgnored` — the monitor itself isn't reactive
    /// state (only `isOnline` is).
    @ObservationIgnored private var monitor: NWPathMonitor?
    @ObservationIgnored private let queue = DispatchQueue(label: "pyreon.network-status")

    /// Lifecycle flag — true iff a `start()` has been matched by no `stop()`
    /// yet. Decoupled from `monitor` (which is nullable for other reasons:
    /// pre-start state) to give `start()` / `stop()` an explicit single-bit
    /// invariant that survives future refactors. Guards against double-start
    /// AND double-stop — calling `stop()` on an already-stopped (or never-
    /// started) instance is a structural no-op, never touches the (possibly
    /// already-cancelled) `NWPathMonitor`.
    @ObservationIgnored private var _started: Bool = false

    /// True iff the instance is currently monitoring connectivity (between a
    /// matched `start()` / `stop()` pair). Useful for SwiftUI debug views
    /// and assertions; cheap to read (single Bool). Not observable for
    /// SwiftUI re-render — wrap in your own `@Observable` if you need to
    /// gate UI on monitoring state itself.
    public var isMonitoring: Bool { _started }

    /// Construct with an initial assumption (default: online). The real value
    /// arrives on the first `NWPathMonitor` callback after `start()`.
    public init(isOnline: Bool = true) {
        self.isOnline = isOnline
    }

    /// Set the connectivity flag. Called by the monitor's path handler, and
    /// directly in tests. Idempotent — writing the same value is a no-op for
    /// observers (SwiftUI coalesces equal writes).
    public func update(_ isOnline: Bool) {
        self.isOnline = isOnline
    }

    /// Begin live monitoring. Idempotent — a second call while already
    /// running is a no-op (the existing monitor keeps driving `isOnline`).
    public func start() {
        guard !_started else { return }
        _started = true
        let m = NWPathMonitor()
        m.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            DispatchQueue.main.async { self?.update(online) }
        }
        monitor = m
        m.start(queue: queue)
    }

    /// Stop live monitoring and release the monitor. Safe to call when not
    /// started (no-op) AND safe to call twice (the second call early-returns
    /// on `_started == false` without touching the already-cancelled
    /// `NWPathMonitor`). The `_started` flag is the source of truth — a
    /// future refactor that nils `monitor` for any other reason can't
    /// accidentally cancel an unstarted one.
    public func stop() {
        guard _started else { return }
        _started = false
        monitor?.cancel()
        monitor = nil
    }
}
