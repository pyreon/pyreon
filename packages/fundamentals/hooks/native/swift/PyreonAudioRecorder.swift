// PyreonAudioRecorder — the AVFoundation side of `@pyreon/hooks`'
// useAudioRecorder.
//
// `start()` returns a Bool rather than throwing: a denied microphone
// permission is the most likely outcome of this call and an ordinary branch
// in any UI that uses it. `stop()` returns a file URL string, or nil when
// nothing was captured — matching the web arm, which returns an object URL
// or null. The URL is the one representation all three targets produce and
// every consumer can use.
//
// The capture device sits behind `RecordingEngine`, so the state machine is
// testable with no AVFoundation, no microphone and no permission prompt.

import Foundation
import Observation

/// The platform half of recording. Swapped for a fake in tests.
public protocol RecordingEngine: AnyObject {
    var isAvailable: Bool { get }
    /// Request permission and begin. Returns false when denied or unavailable.
    func begin() -> Bool
    /// End and return a file URL string, or nil if nothing was captured.
    func end() -> String?
    /// Release the device. Safe when not recording — this is what turns the
    /// OS recording indicator off.
    func release()
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonAudioRecorder {
    public private(set) var recording: Bool = false
    public private(set) var error: String = ""

    private let engine: RecordingEngine

    public var supported: Bool { engine.isAvailable }

    public init(engine: RecordingEngine) {
        self.engine = engine
    }

    @discardableResult
    public func start() -> Bool {
        guard engine.isAvailable else {
            error = "Audio recording is not available on this platform"
            return false
        }
        if recording { return true }
        guard engine.begin() else {
            error = "Microphone permission was denied or no device is available"
            return false
        }
        error = ""
        recording = true
        return true
    }

    public func stop() -> String? {
        guard recording else { return nil }
        recording = false
        let url = engine.end()
        engine.release()
        return url
    }

    deinit {
        // A live capture outliving its view leaves the mic hot with nothing
        // listening — the privacy-visible form of a leak.
        engine.release()
    }
}
