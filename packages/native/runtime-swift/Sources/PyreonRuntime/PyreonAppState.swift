// PyreonAppState — the native runtime container `useAppState()` lowers to.
//
// An `@Observable` reactive app-lifecycle phase:
//
//     state.phase   // "active" | "inactive" | "background"
//
// A SwiftUI view gating UI on `state.phase` (pause a live poll while
// backgrounded, dim while inactive) re-renders when the phase flips.
//
// The lifecycle STATE + transitions are pure and unit-testable (init +
// `update(_:)`); only the OS-notification wiring in `start()` needs a device.
// Mirrors PyreonNetworkStatus: `phase` is the single observable property,
// `isMonitoring` is `@ObservationIgnored` so a status read doesn't trigger a
// SwiftUI re-render.

import Foundation
#if canImport(UIKit)
import UIKit
#endif
import Observation

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonAppState {
    /// The current lifecycle phase. Drives SwiftUI re-render on change.
    public private(set) var phase: String

    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var _started: Bool = false

    /// Whether the notification observers are attached. NOT observable — a
    /// status read must not force a SwiftUI re-render.
    public var isMonitoring: Bool { _started }

    public init(phase: String = "active") {
        self.phase = phase
    }

    /// Set the phase directly (used by the notification handlers + tests).
    public func update(_ phase: String) {
        self.phase = phase
    }

    /// Begin observing the OS lifecycle notifications. Idempotent — a second
    /// `start()` while already running is a no-op (the existing observers keep
    /// driving `phase`).
    public func start() {
        guard !_started else { return }
        _started = true
        #if canImport(UIKit)
        let center = NotificationCenter.default
        func observe(_ name: Notification.Name, _ value: String) {
            let token = center.addObserver(forName: name, object: nil, queue: .main) {
                [weak self] _ in
                self?.update(value)
            }
            observers.append(token)
        }
        observe(UIApplication.didBecomeActiveNotification, "active")
        observe(UIApplication.willResignActiveNotification, "inactive")
        observe(UIApplication.didEnterBackgroundNotification, "background")
        #endif
    }

    /// Stop observing. Idempotent — a `stop()` before any `start()` is a no-op.
    public func stop() {
        guard _started else { return }
        _started = false
        let center = NotificationCenter.default
        for token in observers { center.removeObserver(token) }
        observers.removeAll()
    }
}
