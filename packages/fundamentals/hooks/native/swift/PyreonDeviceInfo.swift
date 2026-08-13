// PyreonDeviceInfo — the UIKit side of `@pyreon/hooks`' useDeviceInfo.
//
// ## The asymmetry with the web arm is the point
//
// `model` and `osVersion` are REAL here and empty strings on the web, because
// the browser has no reliable way to answer them (deprecated
// `navigator.platform`, Chromium-only UA Client Hints, and UA parsing that
// rots as browsers change their strings). This file is where those fields
// actually mean something, so the surface is shaped by what native can answer
// honestly rather than reduced to the web's floor.
//
// `platform` is a compile-time constant on this target and is not stored.
//
// ## No UIKit import at this layer
//
// The device queries live behind `DeviceProbe`, so the shape below compiles
// and is testable with no UIKit and no device. `UIKitDeviceProbe` is the real
// implementation and is verified on hardware — an approximated stub of a
// display subsystem would prove nothing.

import Foundation
import Observation

/// Screen geometry, in points plus the backing scale factor.
public struct PyreonDeviceScreen: Equatable, Codable {
    public let width: Double
    public let height: Double
    public let scale: Double

    public init(width: Double, height: Double, scale: Double) {
        self.width = width
        self.height = height
        self.scale = scale
    }
}

/// The platform half of the device queries. Swapped for a fake in tests.
public protocol DeviceProbe: AnyObject {
    var model: String { get }
    var osVersion: String { get }
    var isTouch: Bool { get }
    var screen: PyreonDeviceScreen { get }
}

/// Observable device description — the SwiftUI half of `useDeviceInfo`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonDeviceInfo {
    private let probe: DeviceProbe

    public init(probe: DeviceProbe) {
        self.probe = probe
    }

    /// Compile-time constant on this target.
    public var platform: String { "ios" }
    public var model: String { probe.model }
    public var osVersion: String { probe.osVersion }
    public var isTouch: Bool { probe.isTouch }

    /// Read through on every access rather than cached at init: a fold, a
    /// rotation or a Stage Manager resize moves this while the app is live,
    /// and a value captured once would silently describe the old geometry.
    public var screen: PyreonDeviceScreen { probe.screen }
}
