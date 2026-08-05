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

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonVideoPlayer: View {
    private let url: URL?
    private let autoPlay: Bool
    private let loop: Bool
    private let muted: Bool
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
        onStatusChange: ((String) -> Void)? = nil
    ) {
        self.url = url
        self.autoPlay = autoPlay
        self.loop = loop
        self.muted = muted
        self.onStatusChange = onStatusChange
    }

    public var body: some View {
        #if canImport(AVKit)
        VideoPlayer(player: player)
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
