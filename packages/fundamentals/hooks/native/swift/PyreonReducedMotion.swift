// PyreonReducedMotion — the native runtime container `useReducedMotion()` lowers to.
//
// An `@Observable` reactive flag for the OS "Reduce Motion" setting:
//
//     motion.enabled   // true while the user asks for less animation
//
// The web `useReducedMotion()` is an accessor over `(prefers-reduced-motion: reduce)`; this is the same signal from
// `UIAccessibility.isReduceMotionEnabled`. Unlike the web, the platform tells us when it changes
// (`reduceMotionStatusDidChangeNotification`), so `start()` observes that rather than polling.
//
// The flag + `update(_:)` are pure and unit-testable; only `start()`'s notification wiring needs UIKit (a no-op on
// macOS, where the tests run). Construction reads the CURRENT setting, so a screen opened while Reduce Motion is
// already on does not flash a motion-heavy first frame before the first notification.

import Foundation
#if canImport(UIKit)
import UIKit
#endif
import Observation

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonReducedMotion {
    /// True while Reduce Motion is on. Drives SwiftUI re-render on change.
    public private(set) var enabled: Bool

    @ObservationIgnored private var observer: NSObjectProtocol?
    @ObservationIgnored private var _started: Bool = false

    /// Whether the change observer is attached. NOT observable — a status read must not force a re-render.
    public var isMonitoring: Bool { _started }

    /// `enabled` defaults to the live OS setting; pass a value to pin it (tests, previews).
    public init(enabled: Bool? = nil) {
        self.enabled = enabled ?? PyreonReducedMotion.systemValue()
    }

    /// The current OS setting. `false` where there is no accessibility API (macOS test host).
    public static func systemValue() -> Bool {
        #if canImport(UIKit)
        return UIAccessibility.isReduceMotionEnabled
        #else
        return false
        #endif
    }

    /// Set the flag directly (used by the notification handler + tests).
    public func update(_ enabled: Bool) {
        self.enabled = enabled
    }

    /// Begin observing the setting. Idempotent — a second `start()` while running is a no-op. Re-reads the setting
    /// on start, so a change between construction and mount is not missed.
    public func start() {
        guard !_started else { return }
        _started = true
        update(PyreonReducedMotion.systemValue())
        #if canImport(UIKit)
        observer = NotificationCenter.default.addObserver(
            forName: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.update(PyreonReducedMotion.systemValue())
        }
        #endif
    }

    /// Stop observing. Idempotent — a `stop()` before any `start()` is a no-op.
    public func stop() {
        guard _started else { return }
        _started = false
        if let token = observer { NotificationCenter.default.removeObserver(token) }
        observer = nil
    }
}
