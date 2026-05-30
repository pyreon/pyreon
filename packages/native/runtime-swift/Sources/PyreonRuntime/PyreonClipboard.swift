// PyreonClipboard — the SwiftUI side of Pyreon's clipboard service
// (Phase 4). Mirrors the core `@pyreon/hooks` `useClipboard` shape and
// the Kotlin `PyreonClipboard` one-for-one.
//
// ## What this delivers
//
// An `@Observable` reactive clipboard wrapper exposing the same
// surface a `useClipboard()` web user expects:
//
//     clipboard.copy("Hello")    // write text to UIPasteboard
//     clipboard.copied           // reactive Bool — true for 2s
//                                // after a successful copy
//
// A SwiftUI view binding to `clipboard.copied` re-renders when the
// flag flips — the native analogue of the web `copied` signal
// (`@pyreon/hooks`'s contract: auto-resets after 2s).
//
// ## Scope — UIPasteboard wrapper
//
// `UIPasteboard.general` is the system clipboard on iOS. iPadOS and
// visionOS share the same API. macOS Catalyst routes through it too.
// No third-party dependency.
//
// The reset timer is a Task with a 2-second sleep; cancellation isn't
// strictly needed (the value just stays true longer if a second copy
// fires before the first reset) but is cheap to add and matches the
// web hook's debounce behaviour.

import Foundation
import Observation

// Round-2 audit fix: PyreonClipboard.swift used to import UIKit
// unconditionally, but the SPM Package.swift declares BOTH iOS 17
// AND macOS 14 platforms. UIKit isn't on macOS — `swift build`
// failed with "no such module 'UIKit'" on every macOS CI / local
// `swift test`. The other 8 PyreonRuntime files use only
// Foundation + SwiftUI + Observation + Network (all cross-platform);
// Clipboard was the lone offender.
//
// Conditional import: keep iOS UIPasteboard; macOS falls back to
// AppKit's NSPasteboard (the equivalent system clipboard). The
// reactive state machine (`copied` flag + reset Task) is fully
// cross-platform — only the actual write needs to branch on the
// host UI framework.
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Observable reactive clipboard wrapper — the SwiftUI half of `useClipboard`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonClipboard {
    /// True for ~2 seconds after a successful `copy(_:)`. Drives
    /// "Copied!" feedback in the UI without manual timer wiring.
    public private(set) var copied: Bool = false

    private var resetTask: Task<Void, Never>?

    public init() {}

    /// Write `text` to the system clipboard and flip `copied` to true
    /// for ~2s. Cancels any pending reset from a prior copy so the
    /// flag stays true for the full 2s window after the LATEST copy.
    ///
    /// Per-platform clipboard backing:
    /// - iOS / iPadOS / visionOS / Catalyst → `UIPasteboard.general`
    /// - macOS (AppKit) → `NSPasteboard.general` (clears then sets the
    ///   .string type — the standard macOS clipboard convention)
    /// - other targets (Linux Foundation, etc.) → no-op for the
    ///   actual write; the `copied` state flip still fires so views
    ///   bound to it behave consistently (tests run without crashing).
    public func copy(_ text: String) {
        #if canImport(UIKit)
        UIPasteboard.general.string = text
        #elseif canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #endif
        copied = true
        resetTask?.cancel()
        resetTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if Task.isCancelled { return }
            await MainActor.run { self?.copied = false }
        }
    }

    /// Force the flag back to false immediately (rarely needed —
    /// the 2s timer handles the common case).
    public func reset() {
        resetTask?.cancel()
        copied = false
    }
}
