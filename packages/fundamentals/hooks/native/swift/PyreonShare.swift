// PyreonShare — the SwiftUI side of Pyreon's share service (M3.2).
// Mirrors the core `@pyreon/hooks` `useShare` shape and the Kotlin
// `PyreonShare` one-for-one.
//
// ## What this delivers
//
// An imperative share wrapper (no reactive state) exposing the same
// surface a `useShare()` web user expects:
//
//     share.text("Hello")               // share plain text
//     share.url("https://pyreon.dev")    // share a URL (rich preview)
//     share.textUrl("Look:", url)        // text + URL
//     share.canShare()                   // → true on iOS
//
// ## Scope — UIActivityViewController from the key window
//
// Unlike the fire-and-forget PyreonHaptics, a share sheet must be
// PRESENTED from a view controller. SwiftUI has no imperative "present"
// API, so — like every imperative-share library — we reach the key
// window's root view controller (walking to the topmost presented VC so
// the sheet stacks above any open modal) and present a
// `UIActivityViewController` there.
//
// iPad note: on a regular-width layout `UIActivityViewController` is a
// popover and CRASHES without a `sourceView`/`sourceRect` anchor, so we
// set one at the presenting view's center. iPhone ignores it.
//
// UIKit-only: the SPM package targets iOS 17 AND macOS 14, so the UIKit
// calls are guarded (`#if canImport(UIKit)`); macOS/Linux builds compile
// to no-op method bodies (matching how PyreonClipboard branches on the
// host UI framework). No third-party dependency.

import Foundation

#if canImport(UIKit)
import UIKit
#endif

/// Imperative share-sheet wrapper — the SwiftUI half of `useShare`.
public final class PyreonShare {
    public init() {}

    /// Share plain text.
    public func text(_ text: String) {
        present([text])
    }

    /// Share a URL. A valid URL is shared as a `URL` item (rich preview /
    /// "Copy Link"); an unparseable string falls back to plain text.
    public func url(_ url: String) {
        let item: Any = URL(string: url) ?? url
        present([item])
    }

    /// Share text with an accompanying URL.
    public func textUrl(_ text: String, _ url: String) {
        let urlItem: Any = URL(string: url) ?? url
        present([text, urlItem])
    }

    /// Whether sharing is available. Always true on iOS.
    public func canShare() -> Bool {
        #if canImport(UIKit)
        return true
        #else
        return false
        #endif
    }

    #if canImport(UIKit)
    private func present(_ items: [Any]) {
        guard let root = Self.keyWindowRootViewController() else { return }
        // Stack above any already-presented sheet/modal.
        var top = root
        while let presented = top.presentedViewController {
            top = presented
        }
        let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)
        // iPad: a popover with no anchor crashes. Anchor at the view's center.
        if let popover = activityVC.popoverPresentationController {
            popover.sourceView = top.view
            popover.sourceRect = CGRect(
                x: top.view.bounds.midX,
                y: top.view.bounds.midY,
                width: 0,
                height: 0,
            )
            popover.permittedArrowDirections = []
        }
        top.present(activityVC, animated: true)
    }

    private static func keyWindowRootViewController() -> UIViewController? {
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene else { continue }
            for window in windowScene.windows where window.isKeyWindow {
                return window.rootViewController
            }
        }
        // Fallback: the first window of the first window scene.
        let firstScene = UIApplication.shared.connectedScenes.first as? UIWindowScene
        return firstScene?.windows.first?.rootViewController
    }
    #else
    private func present(_ items: [Any]) {}
    #endif
}
