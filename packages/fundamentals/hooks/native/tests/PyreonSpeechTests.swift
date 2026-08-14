// Executable checks for PyreonSpeech + PyreonDeviceMotion. NOT @main —
// PyreonBluetoothTests owns this directory's entry point.
//
// Both platform halves are fakes, so these run with no AVFoundation, no
// CoreMotion and no device.

import Foundation

final class FakeSpeechSynth: SpeechSynth {
    var isAvailable: Bool
    private(set) var calls: [String] = []
    init(available: Bool = true) { self.isAvailable = available }
    func speak(_ text: String) { calls.append("speak:\(text)") }
    func cancel() { calls.append("cancel") }
}

final class FakeMotionSource: MotionSource {
    var isAvailable: Bool
    var grants: Bool
    private(set) var ends = 0
    private var sink: ((PyreonVec3, PyreonVec3) -> Void)?

    init(available: Bool = true, grants: Bool = true) {
        self.isAvailable = available
        self.grants = grants
    }

    func begin(_ onSample: @escaping (PyreonVec3, PyreonVec3) -> Void) -> Bool {
        guard grants else { return false }
        sink = onSample
        return true
    }

    func end() { ends += 1; sink = nil }

    /// Push a sample, as the real sensor would.
    func emit(_ a: PyreonVec3, _ r: PyreonVec3) { sink?(a, r) }
}

@available(iOS 17.0, macOS 14.0, *)
enum PyreonSpeechTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        cancelsBeforeSpeaking()
        emptyTextIsANoOp()
        unsupportedNeverSpeaks()
        motionSamplesFlowAfterStart()
        motionDenialIsAnOrdinaryFalse()
        print("PyreonSpeechTests: ok")
    }

    static func cancelsBeforeSpeaking() {
        let synth = FakeSpeechSynth()
        let s = PyreonSpeech(synth: synth)
        expect(s.speak("one"), "speaks")
        expect(s.speak("two"), "speaks again")
        // Queueing is the platform default; without the cancel the second
        // press would talk OVER the first instead of replacing it. The web
        // arm asserts the identical sequence.
        expect(synth.calls == ["cancel", "speak:one", "cancel", "speak:two"], "cancel precedes each speak")
    }

    static func emptyTextIsANoOp() {
        let synth = FakeSpeechSynth()
        // BIND the instance. A temporary deallocates the moment the
        // expression ends, firing deinit — which cancels, by design — so an
        // inline `PyreonSpeech(synth:).speak("")` records a cancel and the
        // assertion below would fail against correct code.
        let s = PyreonSpeech(synth: synth)
        expect(!s.speak(""), "empty is false")
        expect(synth.calls.isEmpty, "and touches nothing")
    }

    static func unsupportedNeverSpeaks() {
        let synth = FakeSpeechSynth(available: false)
        let s = PyreonSpeech(synth: synth)
        expect(!s.supported, "reports unsupported")
        expect(!s.speak("hi"), "returns false")
        expect(synth.calls.isEmpty, "never touched the synth")
    }

    static func motionSamplesFlowAfterStart() {
        let src = FakeMotionSource()
        let m = PyreonDeviceMotion(source: src)
        expect(m.start(), "starts")
        expect(m.active, "active")
        src.emit(PyreonVec3(x: 1, y: 2, z: 3), PyreonVec3(x: 4, y: 5, z: 6))
        expect(m.acceleration.x == 1, "acceleration flows")
        expect(m.rotation.z == 6, "rotation flows")
        m.stop()
        expect(!m.active, "stopped")
        // An unstopped sensor drains battery for a screen nobody is watching.
        expect(src.ends == 1, "source ended exactly once")
    }

    static func motionDenialIsAnOrdinaryFalse() {
        let m = PyreonDeviceMotion(source: FakeMotionSource(grants: false))
        expect(!m.start(), "start returns false")
        expect(!m.active, "never became active")
    }
}
