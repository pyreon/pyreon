// PyreonCamera — the capture side of `@pyreon/hooks`' useCamera.
//
// Mirrors PyreonImagePicker: the two differ only in which system flow they
// open (UIImagePickerController with .camera rather than PHPicker), so the
// surface is deliberately identical — `capture()` resolving a URI string or
// nil, never throwing, with an unavailable camera collapsing to nil.
//
// A CUSTOM viewfinder is out of scope on purpose: an AVCaptureSession layer,
// a CameraX PreviewView and a <video> element are not one thing wearing three
// hats. `useNativeModule` is the escape hatch, as it is for Bluetooth GATT.
//
// The presenter is injected so the state machine is testable with no UIKit,
// no camera and no permission prompt.

import Foundation

/// The platform half of a capture. Swapped for a fake in tests.
public protocol CameraPresenter: AnyObject {
    var isAvailable: Bool { get }
    /// Present the system camera. Calls back with a URI string, or nil when
    /// the user cancelled or the camera is unavailable.
    func present(_ completion: @escaping (String?) -> Void)
}

@available(iOS 17.0, macOS 14.0, *)
public final class PyreonCamera {
    private let presenter: CameraPresenter

    public init(presenter: CameraPresenter) {
        self.presenter = presenter
    }

    public func isAvailable() -> Bool { presenter.isAvailable }

    /// Never throws. A cancelled capture and an unavailable camera are both
    /// nil, because from a caller's side they are the same outcome: no photo.
    public func capture() async -> String? {
        guard presenter.isAvailable else { return nil }
        return await withCheckedContinuation { continuation in
            var resumed = false
            presenter.present { uri in
                // A presenter that calls back twice would otherwise crash on
                // a double resume — cheap to guard, fatal to miss.
                if resumed { return }
                resumed = true
                continuation.resume(returning: uri)
            }
        }
    }
}
