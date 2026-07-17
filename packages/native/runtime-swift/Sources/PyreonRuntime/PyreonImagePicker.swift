// PyreonImagePicker — the SwiftUI side of Pyreon's photo-picker service (M3.4).
// Mirrors the core `@pyreon/hooks` `useImagePicker` shape and the Kotlin
// `PyreonImagePicker` one-for-one.
//
// Surface:
//
//     let uri = await picker.pick()   // "file:///…" or nil when cancelled
//
// `pick()` is ASYNC — the second Pyreon service with an async RESULT (after
// PyreonBiometrics). PMTC lowers `const uri = await picker.pick()` inside an
// `async` handler to `Task { let uri = await picker.pick() }` (M4.5). It never
// throws to the caller (every failure collapses to `nil`), so the emitted
// `await` needs no `try`.
//
// NO photo-library permission / Info.plist usage description is required:
// PHPickerViewController runs OUT OF PROCESS, so the app never gains library
// access — it receives only the single asset the user explicitly picked. That
// is why this service, unlike a UIImagePickerController-based one, is
// policy-safe by construction.
//
// PhotosUI/UIKit are guarded with `#if canImport` so the type still compiles on
// platforms without them (the emit references the type shape unconditionally).

import Foundation
#if canImport(PhotosUI) && canImport(UIKit)
import PhotosUI
import UIKit
import UniformTypeIdentifiers
#endif

public struct PyreonImagePicker {
    public init() {}

    /// Present the system photo picker and return the picked image's URI, or
    /// `nil` if the user cancelled (or no picker could be presented).
    ///
    /// The returned string is a `file://` URL pointing at a COPY of the picked
    /// image in the app's temporary directory — a stable handle the caller can
    /// hand to an image view or an upload without holding photo-library access.
    /// Treat it as ephemeral: the OS may reclaim `NSTemporaryDirectory()`.
    public func pick() async -> String? {
        #if canImport(PhotosUI) && canImport(UIKit)
        guard let presenter = await PyreonImagePicker.topViewController() else {
            return nil
        }
        var config = PHPickerConfiguration()
        config.filter = .images
        config.selectionLimit = 1

        let result = await withCheckedContinuation { (continuation: CheckedContinuation<PHPickerResult?, Never>) in
            Task { @MainActor in
                let picker = PHPickerViewController(configuration: config)
                let delegate = PyreonPickerDelegate { picked in
                    continuation.resume(returning: picked)
                }
                // PHPickerViewController holds its delegate WEAKLY, so the
                // delegate must outlive this scope or the continuation is never
                // resumed and the caller's `await` hangs forever. Park it on the
                // picker itself so it lives exactly as long as the presentation.
                picker.delegate = delegate
                objc_setAssociatedObject(
                    picker,
                    &PyreonImagePicker.delegateKey,
                    delegate,
                    .OBJC_ASSOCIATION_RETAIN_NONATOMIC
                )
                presenter.present(picker, animated: true)
            }
        }
        guard let result else { return nil }
        return await PyreonImagePicker.copyToTemporaryFile(result)
        #else
        return nil
        #endif
    }

    #if canImport(PhotosUI) && canImport(UIKit)
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

    /// Copy the picked asset's bytes into the temp directory and return a
    /// `file://` URL string. `loadFileRepresentation` hands back a URL that is
    /// only valid inside its completion, so the copy is mandatory.
    private static func copyToTemporaryFile(_ result: PHPickerResult) async -> String? {
        let provider = result.itemProvider
        guard provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else {
            return nil
        }
        return await withCheckedContinuation { (continuation: CheckedContinuation<String?, Never>) in
            // The continuation MUST resume exactly once — `loadFileRepresentation`
            // calls back once, but guard anyway: a double-resume traps.
            let resumed = PyreonResumeGuard()
            provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, _ in
                guard let url else {
                    if resumed.claim() { continuation.resume(returning: nil) }
                    return
                }
                let destination = URL(fileURLWithPath: NSTemporaryDirectory())
                    .appendingPathComponent("pyreon-\(UUID().uuidString)-\(url.lastPathComponent)")
                do {
                    try FileManager.default.copyItem(at: url, to: destination)
                    if resumed.claim() { continuation.resume(returning: destination.absoluteString) }
                } catch {
                    if resumed.claim() { continuation.resume(returning: nil) }
                }
            }
        }
    }
    #endif
}

#if canImport(PhotosUI) && canImport(UIKit)
/// One-shot claim flag guarding a CheckedContinuation against a double-resume.
///
/// `@unchecked Sendable` is accurate rather than a silencer: the only mutable
/// state (`used`) is read and written exclusively under `lock`, so crossing the
/// `@Sendable` boundary into `loadFileRepresentation`'s completion is safe.
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

/// Bridges PHPickerViewController's delegate callback to the async continuation.
/// Dismisses the picker itself — PHPicker does NOT auto-dismiss on pick/cancel,
/// and a picker left on screen blocks app termination (which wedges the
/// Simulator and cascades launch-timeouts through a whole UI-test run).
private final class PyreonPickerDelegate: NSObject, PHPickerViewControllerDelegate {
    private let onFinish: (PHPickerResult?) -> Void

    init(onFinish: @escaping (PHPickerResult?) -> Void) {
        self.onFinish = onFinish
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        onFinish(results.first)
    }
}
#endif
