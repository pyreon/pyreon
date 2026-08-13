// PyreonSafeArea + PyreonScreenOrientation — the UIKit side of
// `@pyreon/hooks`' useSafeArea / useScreenOrientation.
//
// Both are READ-THROUGH: a rotation, a fold or a Stage Manager resize moves
// them while the app is live, so a value captured at init would silently
// describe the old display. Same contract PyreonDeviceInfo.screen carries.
//
// The platform queries sit behind protocols so the shapes compile and are
// testable with no UIKit and no device; the app supplies the real probes.

import Foundation
import Observation

/// Insets content must avoid — notch, home indicator, rounded corners.
public struct PyreonSafeAreaInsets: Equatable, Codable {
    public let top: Double
    public let right: Double
    public let bottom: Double
    public let left: Double

    public init(top: Double, right: Double, bottom: Double, left: Double) {
        self.top = top
        self.right = right
        self.bottom = bottom
        self.left = left
    }

    public static let zero = PyreonSafeAreaInsets(top: 0, right: 0, bottom: 0, left: 0)
}

/// The platform half. Swapped for a fake in tests.
public protocol SafeAreaProbe: AnyObject {
    var insets: PyreonSafeAreaInsets { get }
}

/// The safe-area insets of the current display.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonSafeArea {
    private let probe: SafeAreaProbe

    public init(probe: SafeAreaProbe) {
        self.probe = probe
    }

    /// Read through on every access — see the file header.
    public var insets: PyreonSafeAreaInsets { probe.insets }
}

/// The platform half of the orientation read.
public protocol OrientationProbe: AnyObject {
    /// "portrait" or "landscape" — normalised, matching the web arm.
    var type: String { get }
    /// 0 / 90 / 180 / 270.
    var angle: Int { get }
}

/// Which way the display is oriented. READ-ONLY by design: locking is an
/// app-level declaration on this platform (supportedInterfaceOrientations),
/// not something a view can request, so it is not part of the surface.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonScreenOrientation {
    private let probe: OrientationProbe

    public init(probe: OrientationProbe) {
        self.probe = probe
    }

    public var type: String { probe.type }
    public var angle: Int { probe.angle }
}
