// PyreonWakeLock — the UIKit side of `@pyreon/hooks`' useWakeLock.
//
// ## Why this one is simpler than its web arm
//
// `isIdleTimerDisabled` survives backgrounding: the app resumes with the
// screen still held. The WEB has the awkward half of this contract — a
// WakeLockSentinel is released on tab-hide and never reacquired — so the web
// hook re-acquires on visibilitychange to reach the behaviour this file gets
// for free. The normalization is deliberately one-directional: native is the
// reference, because "the screen stays on until I say otherwise" is what a
// caller means.
//
// ## No UIKit import at this layer
//
// The flag lives behind `IdleTimerController`, so the held/released state
// machine below compiles and runs with no UIKit and no device. `UIKitIdleTimer`
// is the real implementation and is verified on hardware — an approximated
// stub of the display subsystem would prove nothing.

import Foundation
import Observation

/// The platform half of a wake lock. Swapped for a fake in tests.
public protocol IdleTimerController: AnyObject {
    /// True when the platform can hold a wake lock at all.
    var isSupported: Bool { get }
    /// Hold or release the screen. Idempotent on both edges.
    func setIdleTimerDisabled(_ disabled: Bool)
}

/// Observable screen wake lock — the SwiftUI half of `useWakeLock`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonWakeLock {
    public private(set) var active: Bool = false

    private let controller: IdleTimerController

    public var supported: Bool { controller.isSupported }

    public init(controller: IdleTimerController) {
        self.controller = controller
    }

    /// Acquire the lock. Returns whether it is now held — false when the
    /// platform cannot hold one, matching the web arm's rejected-request
    /// path rather than throwing.
    @discardableResult
    public func request() -> Bool {
        guard controller.isSupported else { return false }
        if active { return true }
        controller.setIdleTimerDisabled(true)
        active = true
        return true
    }

    /// Release the lock. Safe to call when not held.
    public func release() {
        guard active else { return }
        controller.setIdleTimerDisabled(false)
        active = false
    }

    deinit {
        // A lock outliving its view keeps the screen lit with nothing on it.
        if active { controller.setIdleTimerDisabled(false) }
    }
}
