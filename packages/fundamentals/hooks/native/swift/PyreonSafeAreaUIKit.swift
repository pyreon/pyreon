// UIKitSafeAreaProbe + UIKitOrientationProbe — the real probes
// `useSafeArea()` / `useScreenOrientation()` lower to on iOS. Own file so
// PyreonSafeArea.swift stays UIKit-free (compiles and runs on Linux under the
// stub gate); this half is guarded by `canImport(UIKit)`.
//
// The emit named both classes but they existed only in `swift-stubs.ts`, so an
// app using either hook could not compile against the real SDK.
//
// Both read through on every access (see PyreonSafeArea.swift): SwiftUI
// re-evaluates `body` on a trait/size change, and each read asks UIKit afresh.

import Foundation

#if canImport(UIKit)
import UIKit

@MainActor
private func pyreonActiveWindowScene() -> UIWindowScene? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
}

/// Safe-area insets of the foreground window, in points.
public final class UIKitSafeAreaProbe: SafeAreaProbe {
    public init() {}

    public var insets: PyreonSafeAreaInsets {
        MainActor.assumeIsolated {
            guard let w = pyreonActiveWindowScene()?.keyWindow else { return .zero }
            let i = w.safeAreaInsets
            return PyreonSafeAreaInsets(
                top: Double(i.top), right: Double(i.right),
                bottom: Double(i.bottom), left: Double(i.left))
        }
    }
}

/// Orientation of the foreground window scene.
public final class UIKitOrientationProbe: OrientationProbe {
    public init() {}

    private var interface: UIInterfaceOrientation {
        MainActor.assumeIsolated {
            pyreonActiveWindowScene()?.interfaceOrientation ?? .portrait
        }
    }

    public var type: String { interface.isLandscape ? "landscape" : "portrait" }

    /// Degrees the display is rotated counter-clockwise from upright, matching
    /// `screen.orientation.angle` and Android's `Surface.ROTATION_*`. UIKit's
    /// INTERFACE orientation names the side the home indicator sits on, which
    /// is the mirror of the device rotation, hence landscapeRight -> 90.
    public var angle: Int {
        switch interface {
        case .landscapeRight: return 90
        case .portraitUpsideDown: return 180
        case .landscapeLeft: return 270
        default: return 0
        }
    }
}
#endif
