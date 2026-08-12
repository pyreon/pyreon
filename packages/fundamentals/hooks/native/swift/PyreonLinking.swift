// PyreonLinking — the SwiftUI side of Pyreon's external-URL service
// (M3.2b). Mirrors the core `@pyreon/hooks` `useLinking` shape and the
// Kotlin `PyreonLinking` one-for-one.
//
// Surface:
//
//     linking.openUrl("https://pyreon.dev")   // hand the URL to the OS
//
// `UIApplication.shared.open(_:)` asks the system to open the URL in the
// app registered for its scheme (Safari for http/https), backgrounding the
// current app. No presenting view controller and no permission needed —
// simpler than PyreonShare's UIActivityViewController.
//
// UIKit-only: the SPM package targets iOS 17 AND macOS 14, so the UIKit
// call is guarded (`#if canImport(UIKit)`); macOS/Linux builds compile to a
// no-op (matching how PyreonShare / PyreonClipboard branch). No third-party
// dependency.

import Foundation

#if canImport(UIKit)
import UIKit
#endif

/// External-URL opener — the SwiftUI half of `useLinking`.
public final class PyreonLinking {
    public init() {}

    /// Open `url` in the platform browser / the app registered for its
    /// scheme. An unparseable string is ignored.
    public func openUrl(_ url: String) {
        #if canImport(UIKit)
        guard let parsed = URL(string: url) else { return }
        UIApplication.shared.open(parsed, options: [:], completionHandler: nil)
        #endif
    }
}
