// PyreonHaptics — the SwiftUI side of Pyreon's haptic-feedback service
// (M3.1). Mirrors the core `@pyreon/hooks` `useHaptics` shape and the
// Kotlin `PyreonHaptics` one-for-one.
//
// ## What this delivers
//
// A fire-and-forget haptics wrapper (no reactive state) exposing the
// same surface a `useHaptics()` web user expects:
//
//     haptics.impact("light")          // UIImpactFeedbackGenerator
//     haptics.notification("success")  // UINotificationFeedbackGenerator
//     haptics.selection()              // UISelectionFeedbackGenerator
//
// iOS is the RICHEST target: five impact styles, three notification
// outcomes, and a distinct selection tick. The web/Android sides are
// coarser (see the `@pyreon/hooks` doc + the Kotlin port) — an honest
// platform difference, not a bug.
//
// ## Scope — UIFeedbackGenerator wrappers
//
// The three generator families live in UIKit. iPadOS shares them (iPads
// with no Taptic Engine simply no-op — Apple's own behavior). visionOS /
// macOS / Catalyst have no UIKit haptics, so those builds compile to
// no-op method bodies via the `#if canImport(UIKit)` guard (matching how
// PyreonClipboard conditionally imports UIKit vs AppKit — the SPM package
// declares both iOS and macOS platforms, so every file must build on
// both). No third-party dependency.
//
// NOTE: a haptic has NO observable UI and does nothing on the iOS
// Simulator (only physical devices have a Taptic Engine). The device
// gate's proof is therefore "builds + runs + the tap that fires it does
// not crash", not a behavioral assertion — an honest R4 limitation
// documented in docs/multiplatform.md.

import Foundation

#if canImport(UIKit)
import UIKit
#endif

/// Fire-and-forget haptic-feedback wrapper — the SwiftUI half of `useHaptics`.
public final class PyreonHaptics {
    public init() {}

    /// A physical impact. Maps the style string to a
    /// `UIImpactFeedbackGenerator.FeedbackStyle` (light/medium/heavy/
    /// soft/rigid — all available on the iOS 17 deployment target).
    /// Unknown / omitted → `.medium`.
    public func impact(_ style: String = "medium") {
        #if canImport(UIKit)
        let feedbackStyle: UIImpactFeedbackGenerator.FeedbackStyle
        switch style {
        case "light": feedbackStyle = .light
        case "heavy": feedbackStyle = .heavy
        case "soft": feedbackStyle = .soft
        case "rigid": feedbackStyle = .rigid
        default: feedbackStyle = .medium
        }
        let generator = UIImpactFeedbackGenerator(style: feedbackStyle)
        generator.prepare()
        generator.impactOccurred()
        #endif
    }

    /// A semantic outcome (success/warning/error). Unknown → `.warning`.
    public func notification(_ type: String) {
        #if canImport(UIKit)
        let feedbackType: UINotificationFeedbackGenerator.FeedbackType
        switch type {
        case "success": feedbackType = .success
        case "error": feedbackType = .error
        default: feedbackType = .warning
        }
        UINotificationFeedbackGenerator().notificationOccurred(feedbackType)
        #endif
    }

    /// A light tick for a discrete selection change.
    public func selection() {
        #if canImport(UIKit)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }
}
