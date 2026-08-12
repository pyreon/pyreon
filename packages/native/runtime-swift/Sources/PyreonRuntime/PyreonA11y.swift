// PyreonA11y — the native runtime `@pyreon/a11y`'s `announce()` lowers to.
//
// The web `announce("Saved")` writes to an `aria-live` region so a screen
// reader speaks it; the native equivalent posts a VoiceOver announcement:
//
//     PyreonA11y.announce("Saved")             // polite
//     PyreonA11y.announce("Error", assertive: true)
//
// iOS has ONE announcement channel (`UIAccessibility.post(.announcement)`);
// the `assertive` flag raises the speech PRIORITY on iOS 17+ (an assertive
// announcement interrupts; a polite one queues) via an attributed argument,
// falling back to a plain post where the attribute is unavailable.
//
// A pure static entry point (no instance state) — the announcement is a
// fire-and-forget OS call, so there is nothing to observe or unit-test beyond
// "it doesn't crash off-device" (the UIKit call is a no-op on macOS/Linux).

import Foundation
#if canImport(UIKit)
import UIKit
#endif

public enum PyreonA11y {
    /// Announce `message` to screen-reader users. `assertive` interrupts;
    /// otherwise the announcement is polite (queued). Politeness maps to the
    /// iOS 17+ speech-announcement priority; older systems post plainly.
    public static func announce(_ message: String, assertive: Bool = false) {
        #if canImport(UIKit)
        if #available(iOS 17.0, *) {
            var attributed = AttributedString(message)
            attributed.accessibilitySpeechAnnouncementPriority = assertive ? .high : .default
            UIAccessibility.post(notification: .announcement, argument: attributed)
        } else {
            UIAccessibility.post(notification: .announcement, argument: message)
        }
        #endif
    }
}
