// PyreonVideoPlayer — the SwiftUI side of Pyreon's `<Video>` primitive.
//
// AVKit's `VideoPlayer` over an `AVPlayer`, with the player's
// `timeControlStatus` surfaced through `onStatusChange` as the same
// three-value vocabulary the web `<video>` events map to
// (`waiting` / `playing` / `paused`) — that observable status text is the
// device-test assertion surface: playback STATE is provable through the
// accessibility tree, rendered video FRAMES are not (the video draws on a
// surface layer XCUITest cannot capture; disclosed in the matrix).
//
// Mirrors the Kotlin `PyreonVideoPlayer` (Media3 ExoPlayer) one-for-one.

import SwiftUI
#if canImport(AVKit)
import AVKit
#endif
#if canImport(UIKit)
import UIKit
#endif

#if canImport(AVKit) && canImport(UIKit)
/// The chrome-less video surface, for `<Video controls={false}>`.
///
/// AVKit's `VideoPlayer` ALWAYS draws transport controls — there is no
/// parameter to turn them off — so honouring the prop needs the layer directly.
/// `AVPlayerLayer` is the same thing `VideoPlayer` renders into, minus the
/// chrome, which is why this is a faithful mapping rather than a substitute.
///
/// Kotlin needs nothing equivalent: `PlayerView.useController` is a plain
/// boolean. The prop is symmetric, the amount of work behind it is not, and
/// that asymmetry is why the Swift half sat unimplemented.
@available(iOS 17.0, *)
struct PyreonPlayerLayerView: UIViewRepresentable {
    let player: AVPlayer?

    final class LayerBackedView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> LayerBackedView {
        let view = LayerBackedView()
        view.playerLayer.player = player
        // Matches VideoPlayer's own default, so turning the chrome off does not
        // also silently change how the video is scaled.
        view.playerLayer.videoGravity = .resizeAspect
        return view
    }

    func updateUIView(_ view: LayerBackedView, context: Context) {
        if view.playerLayer.player !== player {
            view.playerLayer.player = player
        }
    }
}
#endif

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonVideoPlayer: View {
    private let url: URL?
    private let autoPlay: Bool
    private let loop: Bool
    private let muted: Bool
    private let controls: Bool
    private let onStatusChange: ((String) -> Void)?

    #if canImport(AVKit)
    @State private var player: AVPlayer? = nil
    @State private var statusObservation: NSKeyValueObservation? = nil
    @State private var loopObserver: NSObjectProtocol? = nil
    #endif

    public init(
        url: URL?,
        autoPlay: Bool = false,
        loop: Bool = false,
        muted: Bool = false,
        controls: Bool = true,
        onStatusChange: ((String) -> Void)? = nil
    ) {
        self.url = url
        self.autoPlay = autoPlay
        self.loop = loop
        self.muted = muted
        self.controls = controls
        self.onStatusChange = onStatusChange
    }

    public var body: some View {
        #if canImport(AVKit)
        // Two surfaces, one lifecycle: whichever is shown gets the same
        // start/stop, so `controls` changes the chrome and nothing else.
        Group {
            #if canImport(UIKit)
            if controls {
                VideoPlayer(player: player)
            } else {
                PyreonPlayerLayerView(player: player)
            }
            #else
            VideoPlayer(player: player)
            #endif
        }
        .onAppear { start() }
        .onDisappear { stop() }
        #else
        // Non-AVKit targets (Linux typecheck): the primitive's frame exists,
        // playback does not — the same degrade-not-crash shape as the other
        // canImport-gated runtime edges.
        Color.clear
        #endif
    }

    #if canImport(AVKit)
    private func start() {
        guard player == nil, let url else { return }
        let p = AVPlayer(url: url)
        p.isMuted = muted
        // KVO on timeControlStatus — the SAME three states the web events
        // map to. `.initial` fires the current value so the UI starts at
        // "waiting" rather than blank.
        statusObservation = p.observe(\.timeControlStatus, options: [.initial, .new]) { pl, _ in
            let status: String
            switch pl.timeControlStatus {
            case .playing: status = "playing"
            case .paused: status = "paused"
            default: status = "waiting"
            }
            DispatchQueue.main.async { onStatusChange?(status) }
        }
        if loop {
            loopObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: p.currentItem,
                queue: .main
            ) { _ in
                p.seek(to: .zero)
                p.play()
            }
        }
        player = p
        if autoPlay { p.play() }
    }

    private func stop() {
        statusObservation?.invalidate()
        statusObservation = nil
        if let loopObserver { NotificationCenter.default.removeObserver(loopObserver) }
        loopObserver = nil
        player?.pause()
        player = nil
    }
    #endif
}
