// PyreonDeviceMotion — the CoreMotion side of `@pyreon/hooks`'
// useDeviceMotion.
//
// Explicit start/stop rather than always-on: a sensor left running past its
// view drains battery for a screen nobody is looking at, and iOS Safari gates
// the web equivalent behind a gesture-triggered prompt — so an always-on hook
// would be wrong on all three targets.
//
// The sensor sits behind `MotionSource`, so the state machine is testable
// with no CoreMotion and no device.

import Foundation
import Observation

public struct PyreonVec3: Equatable, Codable {
    public let x: Double
    public let y: Double
    public let z: Double
    public init(x: Double, y: Double, z: Double) {
        self.x = x; self.y = y; self.z = z
    }
    public static let zero = PyreonVec3(x: 0, y: 0, z: 0)
}

/// The platform half. Swapped for a fake in tests.
public protocol MotionSource: AnyObject {
    var isAvailable: Bool { get }
    /// Begin updates. Returns false when unavailable.
    func begin(_ onSample: @escaping (PyreonVec3, PyreonVec3) -> Void) -> Bool
    /// End updates. Safe when not started.
    func end()
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonDeviceMotion {
    public private(set) var active: Bool = false
    public private(set) var acceleration: PyreonVec3 = .zero
    public private(set) var rotation: PyreonVec3 = .zero

    private let source: MotionSource

    public var supported: Bool { source.isAvailable }

    public init(source: MotionSource) {
        self.source = source
    }

    @discardableResult
    public func start() -> Bool {
        guard source.isAvailable else { return false }
        if active { return true }
        let ok = source.begin { [weak self] accel, rot in
            guard let self else { return }
            self.acceleration = accel
            self.rotation = rot
        }
        if ok { active = true }
        return ok
    }

    public func stop() {
        guard active else { return }
        source.end()
        active = false
    }

    deinit {
        // See the header: an unstopped sensor is a battery leak.
        source.end()
    }
}
