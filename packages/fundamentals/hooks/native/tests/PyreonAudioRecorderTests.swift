// Executable checks for PyreonAudioRecorder. NOT @main — PyreonBluetoothTests
// owns this directory's entry point and calls runAll().
//
// The engine is a fake, so these run with no AVFoundation, no microphone and
// no permission prompt. Under test: that a DENIAL is an ordinary false rather
// than a throw, and that the device is always released.

import Foundation

final class FakeRecordingEngine: RecordingEngine {
    var isAvailable: Bool
    var grants: Bool
    var result: String?
    private(set) var releases = 0

    init(available: Bool = true, grants: Bool = true, result: String? = "file:///tmp/a.m4a") {
        self.isAvailable = available
        self.grants = grants
        self.result = result
    }

    func begin() -> Bool { grants }
    func end() -> String? { result }
    func release() { releases += 1 }
}

@available(iOS 17.0, macOS 14.0, *)
enum PyreonAudioRecorderTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        recordsAndReturnsAUrl()
        deniedIsAnOrdinaryFalse()
        unsupportedNeverRecords()
        stopWhileIdleIsNil()
        print("PyreonAudioRecorderTests: ok")
    }

    static func recordsAndReturnsAUrl() {
        let e = FakeRecordingEngine()
        let r = PyreonAudioRecorder(engine: e)
        expect(r.start(), "start succeeds")
        expect(r.recording, "recording")
        expect(r.stop() == "file:///tmp/a.m4a", "stop returns the url")
        expect(!r.recording, "no longer recording")
        // Releasing is what turns the OS recording indicator off.
        expect(e.releases == 1, "device released exactly once")
    }

    static func deniedIsAnOrdinaryFalse() {
        // The most likely outcome of this call, and a normal UI branch — so a
        // Bool, not a throw. The web arm resolves false for the same reason.
        let r = PyreonAudioRecorder(engine: FakeRecordingEngine(grants: false))
        expect(!r.start(), "start returns false")
        expect(!r.recording, "never became recording")
        expect(r.error.contains("permission"), "error names the cause")
    }

    static func unsupportedNeverRecords() {
        let e = FakeRecordingEngine(available: false)
        let r = PyreonAudioRecorder(engine: e)
        expect(!r.supported, "reports unsupported")
        expect(!r.start(), "start returns false")
        expect(!r.recording, "never became recording")
    }

    static func stopWhileIdleIsNil() {
        let e = FakeRecordingEngine()
        let r = PyreonAudioRecorder(engine: e)
        expect(r.stop() == nil, "stop while idle is nil")
        expect(e.releases == 0, "and touches nothing")
    }
}
