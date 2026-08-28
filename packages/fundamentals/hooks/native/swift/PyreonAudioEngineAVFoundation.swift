// AVFoundationAudioEngine — the concrete `AudioEngine` the `<Audio>` emit names.
//
// This did not exist. The emit produces
// `PyreonAudioPlayer(url: …, engine: AVFoundationAudioEngine())`, and the only
// definition of that type anywhere in the repo was the swiftc validation stub —
// so `<Audio>` passed the stub gate and could not have compiled against the real
// SDK. Its Kotlin counterpart `Media3AudioEngine` was stub-only too, and there
// was no Compose composable at all, so the primitive had never built on EITHER
// platform. No example uses `<Audio>`, which is why no device gate ever said so.
//
// Found by typechecking a probe app that exercises every primitive against the
// real iOS SDK with the runtime sources — the one configuration with no stubs
// in it. `cannot find 'AVFoundationAudioEngine' in scope`.
//
// AVPlayer rather than AVAudioPlayer: `<Audio src>` accepts a remote URL, and
// AVAudioPlayer takes local data only. AVPlayer is also what the video runtime
// uses, so the two halves of media playback share a mental model.

import Foundation
#if canImport(AVFoundation)
import AVFoundation
#endif

/// Plays `<Audio>` through AVFoundation.
///
/// `load` REPLACES any current item, so a changed `src` starts the new source
/// rather than layering a second one over the first — audio has no z-order to
/// make that visible, only volume, which is the worst way to discover it.
@available(iOS 17.0, macOS 14.0, *)
public final class AVFoundationAudioEngine: AudioEngine {
    #if canImport(AVFoundation)
    private var player: AVPlayer?
    private var loopObserver: NSObjectProtocol?
    #endif

    public init() {}

    deinit {
        // The looping observer is on NotificationCenter, which holds it
        // strongly: without this the engine's own deallocation leaves a live
        // token that keeps restarting a player nobody can reach.
        #if canImport(AVFoundation)
        if let loopObserver {
            NotificationCenter.default.removeObserver(loopObserver)
        }
        #endif
    }

    public func load(url: URL, loop: Bool, muted: Bool, volume: Double) {
        #if canImport(AVFoundation)
        stop()
        let item = AVPlayerItem(url: url)
        let created = AVPlayer(playerItem: item)
        created.isMuted = muted
        // The state machine already clamped this; clamping again keeps the
        // engine correct when driven directly, as tests do.
        created.volume = Float(min(1, max(0, volume)))
        if loop {
            loopObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: item,
                queue: .main
            ) { [weak created] _ in
                created?.seek(to: .zero)
                created?.play()
            }
        }
        player = created
        #endif
    }

    public func play() {
        #if canImport(AVFoundation)
        player?.play()
        #endif
    }

    public func pause() {
        #if canImport(AVFoundation)
        player?.pause()
        #endif
    }

    public func stop() {
        #if canImport(AVFoundation)
        player?.pause()
        if let loopObserver {
            NotificationCenter.default.removeObserver(loopObserver)
            self.loopObserver = nil
        }
        player = nil
        #endif
    }
}
