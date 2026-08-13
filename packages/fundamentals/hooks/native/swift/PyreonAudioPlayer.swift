// PyreonAudioPlayer — the AVFoundation side of `<Audio>`.
//
// ## Why this is a View at all, when audio has none
//
// `<Audio>` sits in a JSX tree, so it must lower to something placeable. Audio
// itself has no view here — AVAudioPlayer is an object — so the emit needs a
// host that occupies no space but is REAL.
//
// `EmptyView()` is not it: a modifier attached to EmptyView is silently inert,
// which is how `<Modal>` shipped a sheet that never presented (fixed in the
// PMTC Modal emit). And a `.task` attached to a transparent `Group` wrapping a
// conditional is cancelled and restarted on every state flip. So the host is a
// concrete zero-size `Color.clear`, and the lifecycle hangs off that stable
// identity.
//
// The engine is injected so the state machine is testable with no
// AVFoundation and no device.

import Foundation
import Observation
import SwiftUI

/// The platform half of playback. Swapped for a fake in tests.
public protocol AudioEngine: AnyObject {
    func load(url: URL, loop: Bool, muted: Bool, volume: Double)
    func play()
    func pause()
    func stop()
}

/// Playback status, matching the web arm's `onStatusChange` values.
public enum PyreonAudioStatus: String {
    case waiting
    case playing
    case paused
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonAudioState {
    public private(set) var status: PyreonAudioStatus = .waiting
    private let engine: AudioEngine

    public init(engine: AudioEngine) {
        self.engine = engine
    }

    /// Clamped, not rejected: a volume outside 0...1 is a caller slip, and
    /// refusing to play is a worse answer than the nearest legal level. The
    /// web arm and the Kotlin runtime clamp identically.
    public static func clampVolume(_ v: Double) -> Double {
        min(1, max(0, v))
    }

    public func start(url: URL, autoPlay: Bool, loop: Bool, muted: Bool, volume: Double) {
        engine.load(url: url, loop: loop, muted: muted, volume: Self.clampVolume(volume))
        if autoPlay {
            engine.play()
            status = .playing
        } else {
            status = .paused
        }
    }

    public func play() {
        engine.play()
        status = .playing
    }

    public func pause() {
        engine.pause()
        status = .paused
    }

    public func stop() {
        engine.stop()
        status = .paused
    }
}

/// The placeable host. Zero-size and non-interactive, but a REAL view — see
/// the file header for why EmptyView would be silently inert.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonAudioPlayer: View {
    private let url: URL?
    private let autoPlay: Bool
    private let loop: Bool
    private let muted: Bool
    private let volume: Double
    private let onStatusChange: ((String) -> Void)?
    @State private var state: PyreonAudioState

    public init(
        url: URL?,
        autoPlay: Bool = false,
        loop: Bool = false,
        muted: Bool = false,
        volume: Double = 1,
        engine: AudioEngine,
        onStatusChange: ((String) -> Void)? = nil
    ) {
        self.url = url
        self.autoPlay = autoPlay
        self.loop = loop
        self.muted = muted
        self.volume = volume
        self.onStatusChange = onStatusChange
        _state = State(initialValue: PyreonAudioState(engine: engine))
    }

    public var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .allowsHitTesting(false)
            .onAppear {
                guard let url else { return }
                state.start(url: url, autoPlay: autoPlay, loop: loop, muted: muted, volume: volume)
                onStatusChange?(state.status.rawValue)
            }
            .onDisappear {
                // Audio outliving its view is the battery-and-confusion shape
                // of a leak: the sound keeps playing over a screen that is gone.
                state.stop()
            }
    }
}
