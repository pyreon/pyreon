// Executable checks for PyreonCamera. NOT @main — PyreonBluetoothTests owns
// this directory's entry point and calls runAll().
//
// The presenter is a fake, so these run with no UIKit, no camera and no
// permission prompt. Under test: that cancel and unavailable both collapse to
// nil (from a caller's side they are the same outcome — no photo), and that a
// presenter calling back twice cannot double-resume the continuation.

import Foundation

final class FakeCameraPresenter: CameraPresenter {
    var isAvailable: Bool
    var result: String?
    /// Fire the completion twice, to prove the guard holds.
    var callsBackTwice = false
    private(set) var presents = 0

    init(available: Bool = true, result: String? = "file:///tmp/shot.jpg") {
        self.isAvailable = available
        self.result = result
    }

    func present(_ completion: @escaping (String?) -> Void) {
        presents += 1
        completion(result)
        if callsBackTwice { completion(result) }
    }
}

@available(iOS 17.0, macOS 14.0, *)
enum PyreonCameraTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        let sem = DispatchSemaphore(value: 0)
        Task {
            await capturesAUri()
            await cancelIsNil()
            await unavailableIsNilAndNeverPresents()
            await aDoubleCallbackDoesNotCrash()
            sem.signal()
        }
        sem.wait()
        print("PyreonCameraTests: ok")
    }

    static func capturesAUri() async {
        let cam = PyreonCamera(presenter: FakeCameraPresenter())
        let uri = await cam.capture()
        expect(uri == "file:///tmp/shot.jpg", "returns the captured uri")
    }

    static func cancelIsNil() async {
        let cam = PyreonCamera(presenter: FakeCameraPresenter(result: nil))
        expect(await cam.capture() == nil, "cancel is nil")
    }

    static func unavailableIsNilAndNeverPresents() async {
        let p = FakeCameraPresenter(available: false)
        let cam = PyreonCamera(presenter: p)
        expect(await cam.capture() == nil, "unavailable is nil")
        expect(!cam.isAvailable(), "reports unavailable")
        // Never open a flow that cannot work.
        expect(p.presents == 0, "never presented")
    }

    static func aDoubleCallbackDoesNotCrash() async {
        // Resuming a continuation twice is a hard crash in Swift, not a
        // warning — cheap to guard, fatal to miss.
        let p = FakeCameraPresenter()
        p.callsBackTwice = true
        let cam = PyreonCamera(presenter: p)
        expect(await cam.capture() == "file:///tmp/shot.jpg", "survives a double callback")
    }
}
