// PyreonSyncWebSocketChannel — the real iOS network edge for @pyreon/sync.
// A `PyreonSyncChannel` (the string-duplex `PyreonSyncTransport` wires a
// `PyreonCrdtDoc` onto) backed by a live `URLSessionWebSocketTask`. With it,
// two devices editing the same document CONVERGE over a WebSocket relay —
// the native counterpart of the web transport's `ws`/`WebSocketProvider`.
//
// ## Two layers — pure transport + live socket edge
//
// The CHANNEL CONTRACT (`send` / `onMessage` / `onOpen` / `close`) and the
// convergence semantics on top of it are already proven headlessly by
// `PyreonSyncTransport`'s in-memory `TransportMemoryChannel` tests. This file
// is the REAL-channel implementation: a Foundation `URLSessionWebSocketTask`.
// It compiles under `swiftc` (Foundation is in the toolchain, so the
// co-source gate typechecks it), but an actual frame flowing over a live
// relay is device/integration territory, NOT asserted here — the same
// "real edge constructed, not asserted" boundary `PyreonHttp.send` and
// `PyreonWebSocket.connect(to:)` use.
//
// Foundation-only (no SwiftUI / Observation import) so it compiles standalone,
// mirroring PyreonSyncTransport.swift / PyreonCrdt.swift.
//
// ## Callback threading
//
// Inbound frames and the open event are marshaled to the MAIN queue before
// the handlers run. `PyreonSyncTransport` routes `onMessage` into
// `doc.applyMessage`, whose observers drive `PyreonSyncedSignal`'s reactive
// state — writing that off the main thread races SwiftUI's render, the same
// hazard `PyreonWebSocket` documents. Hopping here keeps the writes on the
// thread that owns the state.

import Foundation

/// A `PyreonSyncChannel` over a live `URLSessionWebSocketTask`. Construct one
/// per (doc, relay-url) pair and hand it to `PyreonSyncTransport(doc:channel:)`;
/// the transport registers `onMessage` / `onOpen` synchronously at construction
/// (before the async network handshake can fire), then the socket opens and
/// convergence begins. `close()` tears down the task + session.
public final class PyreonSyncWebSocketChannel: PyreonSyncChannel {
    /// The live socket task. Held so `send` / `close` can drive it.
    private var task: URLSessionWebSocketTask?

    /// The session backing the task. Held so `close()` can invalidate it —
    /// which is what releases the retained delegate.
    private var session: URLSession?

    /// Retained so the delegate outlives `init`. `URLSession` retains it too;
    /// clearing both on `close()` releases it, which is why `close()`
    /// invalidates the session rather than only cancelling the task.
    private var delegate: NSObject?

    /// Registered handler thunks. Set by `onMessage` / `onOpen` — the transport
    /// registers both synchronously at construction, before any network I/O.
    private var messageHandler: ((String) -> Void)?
    private var openHandler: (() -> Void)?

    /// True once the real handshake completed. Guards `onOpen`'s
    /// "fire immediately if already open" contract for a late registration.
    private var isOpen = false

    /// Idempotency for `close()` — a second call is a no-op.
    private var closed = false

    /// Open a live WebSocket to `url` and start pumping inbound frames. The
    /// handshake is asynchronous, so a `PyreonSyncChannel` consumer that
    /// registers its handlers right after construction (as `PyreonSyncTransport`
    /// does) always wins the race against the real open.
    public init(url: URL) {
        let socketDelegate = SocketDelegate(onOpen: { [weak self] in self?.handleOpen() })
        self.delegate = socketDelegate
        let session = URLSession(configuration: .default, delegate: socketDelegate, delegateQueue: nil)
        let task = session.webSocketTask(with: url)
        self.session = session
        self.task = task
        task.resume()
        listen()
    }

    /// Convenience initializer from a string URL. Returns `nil` for an
    /// unparseable URL rather than opening a task that can never connect.
    public convenience init?(url string: String) {
        guard let url = URL(string: string) else { return nil }
        self.init(url: url)
    }

    // MARK: - PyreonSyncChannel

    /// Send a text frame. No-op after `close()`. A send failure is silent
    /// here (the transport surfaces convergence issues, not per-frame errors) —
    /// matching the string-duplex contract, which has no error channel.
    public func send(_ data: String) {
        guard !closed else { return }
        task?.send(.string(data)) { _ in }
    }

    /// Register the inbound-frame handler. Frames are delivered on the main
    /// queue (see the threading note).
    public func onMessage(_ cb: @escaping (String) -> Void) {
        messageHandler = cb
    }

    /// Register the ready-to-send handler. Fires when the real handshake
    /// completes; if the socket is ALREADY open when this is called, fires
    /// immediately (on the main queue) so a late registration is not lost.
    public func onOpen(_ cb: @escaping () -> Void) {
        openHandler = cb
        if isOpen {
            DispatchQueue.main.async { cb() }
        }
    }

    /// Close the socket and release the task/session/delegate. Idempotent.
    public func close() {
        guard !closed else { return }
        closed = true
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
        delegate = nil
    }

    // MARK: - Internals

    /// Marks the socket open and fires the registered `onOpen` handler on main.
    private func handleOpen() {
        isOpen = true
        guard let openHandler else { return }
        DispatchQueue.main.async { openHandler() }
    }

    /// Recursive receive pump. `URLSessionWebSocketTask.receive` yields ONE
    /// frame per call, so each success re-arms the next receive. Inbound frames
    /// are forwarded to the message handler on the main queue.
    private func listen() {
        task?.receive { [weak self] result in
            guard let self, !self.closed else { return }
            if case .success(let message) = result {
                let text: String
                switch message {
                case .string(let s): text = s
                case .data(let d): text = String(decoding: d, as: UTF8.self)
                @unknown default: text = ""
                }
                if let handler = self.messageHandler {
                    DispatchQueue.main.async { handler(text) }
                }
                self.listen() // re-arm for the next frame
            }
            // On `.failure` the receive loop stops; `close()` releases the task.
        }
    }

    /// Bridges `URLSessionWebSocketDelegate.didOpenWithProtocol` back to the
    /// channel. A separate object because `URLSession` retains its delegate —
    /// making the channel itself the delegate would create a cycle it could
    /// not break.
    private final class SocketDelegate: NSObject, URLSessionWebSocketDelegate {
        private let onOpen: () -> Void
        init(onOpen: @escaping () -> Void) { self.onOpen = onOpen }

        func urlSession(
            _ session: URLSession,
            webSocketTask: URLSessionWebSocketTask,
            didOpenWithProtocol protocolName: String?
        ) {
            onOpen()
        }
    }
}
