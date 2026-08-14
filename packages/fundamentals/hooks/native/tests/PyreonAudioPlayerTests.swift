// Executable checks for PyreonAudioState — mirror of
// PyreonAudioPlayerTest.kt. NOT @main: PyreonBluetoothTests owns this
// directory's single entry point and calls runAll().
//
// The engine is a fake, so these run with no AVFoundation and no device. The
// status machine and the volume clamp must match the web arm and the Kotlin
// runtime call for call.

import Foundation

final class FakeAudioEngine: AudioEngine {
    var calls: [String] = []
    var loadedVolume: Double = -1

    func load(url: URL, loop: Bool, muted: Bool, volume: Double) {
        loadedVolume = volume
        calls.append("load:\(url.lastPathComponent):loop=\(loop):muted=\(muted)")
    }

    func play() { calls.append("play") }
    func pause() { calls.append("pause") }
    func stop() { calls.append("stop") }
}

@available(iOS 17.0, macOS 14.0, *)
enum PyreonAudioPlayerTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static let url = URL(string: "https://x.dev/a.mp3")!

    static func runAll() {
        autoPlayStartsPlaying()
        withoutAutoPlayItLoadsButDoesNotPlay()
        volumeIsClampedNotRejected()
        transportMovesStatus()
        print("PyreonAudioPlayerTests: ok")
    }

    static func autoPlayStartsPlaying() {
        let e = FakeAudioEngine()
        let s = PyreonAudioState(engine: e)
        expect(s.status == .waiting, "starts waiting")
        s.start(url: url, autoPlay: true, loop: false, muted: false, volume: 1)
        expect(s.status == .playing, "playing after autoPlay start")
        expect(e.calls == ["load:a.mp3:loop=false:muted=false", "play"], "load then play")
    }

    static func withoutAutoPlayItLoadsButDoesNotPlay() {
        let e = FakeAudioEngine()
        let s = PyreonAudioState(engine: e)
        s.start(url: url, autoPlay: false, loop: false, muted: false, volume: 1)
        expect(s.status == .paused, "paused without autoPlay")
        expect(e.calls == ["load:a.mp3:loop=false:muted=false"], "loaded, not played")
    }

    static func volumeIsClampedNotRejected() {
        // A volume outside 0...1 is a caller slip; refusing to play would be
        // a worse answer than the nearest legal level. All three arms clamp.
        expect(PyreonAudioState.clampVolume(1.7) == 1, "clamps above")
        expect(PyreonAudioState.clampVolume(-3) == 0, "clamps below")
        expect(PyreonAudioState.clampVolume(0.4) == 0.4, "leaves legal values alone")

        let e = FakeAudioEngine()
        PyreonAudioState(engine: e).start(url: url, autoPlay: false, loop: false, muted: false, volume: 9)
        expect(e.loadedVolume == 1, "the ENGINE receives the clamped value")
    }

    static func transportMovesStatus() {
        let e = FakeAudioEngine()
        let s = PyreonAudioState(engine: e)
        s.start(url: url, autoPlay: true, loop: false, muted: false, volume: 1)
        s.pause()
        expect(s.status == .paused, "paused")
        s.play()
        expect(s.status == .playing, "playing again")
        s.stop()
        expect(s.status == .paused, "stop reports paused")
    }
}
