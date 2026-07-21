// PyreonFilePicker — the SwiftUI side of Pyreon's document-picker service
// (M3.8). Mirrors the core `@pyreon/hooks` `useFilePicker` shape and the Kotlin
// `PyreonFilePicker` one-for-one. The document sibling of PyreonImagePicker
// (any file, not just photos).
//
// Surface:
//
//     let uri = await files.pick()   // "file:///…" or nil when cancelled
//
// `pick()` is ASYNC — the third Pyreon service with an async RESULT (after
// PyreonBiometrics and PyreonImagePicker). PMTC lowers `const uri = await
// files.pick()` inside an `async` handler to `Task { let uri = await
// files.pick() }` (M4.5). It never throws to the caller (every failure
// collapses to `nil`), so the emitted `await` needs no `try`.
//
// NO storage permission / entitlement is required: UIDocumentPickerViewController
// runs OUT OF PROCESS, so the app never gains broad filesystem access — it
// receives only the single document the user explicitly picked (as a
// security-scoped URL).
//
// UIKit / UniformTypeIdentifiers are guarded with `#if canImport` so the type
// still compiles on platforms without them (the emit references the type shape
// unconditionally). macOS has UniformTypeIdentifiers but not
// UIDocumentPickerViewController, so the whole implementation is gated on UIKit.

import Foundation
#if canImport(UIKit)
import UIKit
import UniformTypeIdentifiers
#endif

public struct PyreonFilePicker {
    public init() {}

    /// Present the system document picker and return the picked file's URI, or
    /// `nil` if the user cancelled (or no picker could be presented).
    ///
    /// The returned string is a `file://` URL pointing at a COPY of the picked
    /// document in the app's temporary directory. The copy is MANDATORY: the
    /// picker hands back a SECURITY-SCOPED URL that is only accessible between
    /// `startAccessingSecurityScopedResource()` / `stop…`, so the bytes must be
    /// copied into an app-owned location before that access ends. Treat the
    /// result as ephemeral: the OS may reclaim `NSTemporaryDirectory()`.
    public func pick() async -> String? {
        #if canImport(UIKit)
        guard let presenter = await PyreonFilePicker.topViewController() else {
            return nil
        }
        return await withCheckedContinuation { (continuation: CheckedContinuation<String?, Never>) in
            Task { @MainActor in
                // `.item` is the broadest UTType — any file. A typed filter is a
                // follow-up (the emit passes no argument today).
                let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.item])
                picker.allowsMultipleSelection = false

                // The continuation MUST resume exactly once. didPick and
                // wasCancelled are mutually exclusive, but guard anyway — a
                // double-resume traps.
                let resumed = PyreonResumeGuard()
                let delegate = PyreonDocumentPickerDelegate(
                    onPick: { url in
                        if resumed.claim() {
                            continuation.resume(returning: PyreonFilePicker.copyToTemporaryFile(url))
                        }
                    },
                    onCancel: {
                        if resumed.claim() { continuation.resume(returning: nil) }
                    }
                )
                // UIDocumentPickerViewController holds its delegate WEAKLY, so
                // the delegate must outlive this scope or the continuation is
                // never resumed and the caller's `await` hangs forever. Park it
                // on the picker so it lives exactly as long as the presentation.
                picker.delegate = delegate
                objc_setAssociatedObject(
                    picker,
                    &PyreonFilePicker.delegateKey,
                    delegate,
                    .OBJC_ASSOCIATION_RETAIN_NONATOMIC
                )
                presenter.present(picker, animated: true)
            }
        }
        #else
        return nil
        #endif
    }

    #if canImport(UIKit)
    private static var delegateKey: UInt8 = 0

    /// The view controller to present from — the key window's root, walked down
    /// through any already-presented controllers so we never try to present on
    /// top of a controller that is itself presenting (which UIKit rejects).
    @MainActor
    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = scenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
            ?? scenes.compactMap { $0 as? UIWindowScene }.first
        guard var top = windowScene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
            ?? windowScene?.windows.first?.rootViewController
        else { return nil }
        while let presented = top.presentedViewController {
            top = presented
        }
        return top
    }

    /// Copy the picked document's bytes into the temp directory and return a
    /// `file://` URL string. The source URL is security-scoped, so access must
    /// be bracketed by `start/stopAccessingSecurityScopedResource()`.
    fileprivate static func copyToTemporaryFile(_ url: URL) -> String? {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
        let destination = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("pyreon-\(UUID().uuidString)-\(url.lastPathComponent)")
        do {
            try FileManager.default.copyItem(at: url, to: destination)
            return destination.absoluteString
        } catch {
            return nil
        }
    }
    #endif
}

#if canImport(UIKit)
/// One-shot claim flag guarding a CheckedContinuation against a double-resume.
///
/// `@unchecked Sendable` is accurate rather than a silencer: the only mutable
/// state (`used`) is read and written exclusively under `lock`, so crossing the
/// `@Sendable` boundary is safe.
private final class PyreonResumeGuard: @unchecked Sendable {
    private let lock = NSLock()
    private var used = false
    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if used { return false }
        used = true
        return true
    }
}

/// Bridges UIDocumentPickerViewController's delegate callbacks to the async
/// continuation. UIDocumentPickerViewController auto-dismisses on pick/cancel,
/// so — unlike PHPicker — this delegate does not dismiss it manually.
private final class PyreonDocumentPickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let onPick: (URL) -> Void
    private let onCancel: () -> Void

    init(onPick: @escaping (URL) -> Void, onCancel: @escaping () -> Void) {
        self.onPick = onPick
        self.onCancel = onCancel
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else {
            onCancel()
            return
        }
        onPick(url)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        onCancel()
    }
}
#endif
