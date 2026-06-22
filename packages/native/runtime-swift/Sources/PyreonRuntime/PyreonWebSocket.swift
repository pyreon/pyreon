// PyreonWebSocket — the SwiftUI side of Pyreon's cross-platform realtime
// story (Tier 2). Mirrors a web `useWebSocket` reactive surface and the
// Kotlin `PyreonWebSocket` one-for-one.
//
// ## What this delivers
//
// An `@Observable` container holding the reactive fields a realtime hook
// exposes:
//
//     ws.lastMessage   // the most recent inbound frame, nil until first
//     ws.messages      // every inbound frame in order
//     ws.isConnected   // true between open and close/failure
//     ws.error         // the most recent failure, nil on success
//
// A SwiftUI view reads these and re-renders as frames arrive / the
// connection flips — the native analogue of a web `useWebSocket().lastMessage`
// reactive read driving a re-render. `send(_:)` writes an outbound frame;
// `connect(to:)` / `close()` own the live socket lifecycle.
//
// ## Two layers — pure state machine + live socket edge
//
// The reactive STATE MACHINE (`opened` / `received` / `failed` / `closed`)
// is pure and synchronously unit-testable: drive the transitions directly,
// assert the reactive fields. It NEVER touches the socket or the lifecycle
// flag — exactly the split `PyreonNetworkStatus` uses (`update(_:)` is pure;
// `start` / `stop` own the `NWPathMonitor`).
//
// The LIVE EDGE is a real `URLSessionWebSocketTask` (Foundation — no extra
// dependency, same "real edge in the Swift toolchain" choice `NWPathMonitor`
// makes for connectivity). `connect(to:)` opens the task and pumps a receive
// loop that forwards inbound frames to `received` / `failed` on the main
// actor; `send(_:)` / `close()` drive the task. The socket I/O compiles
// under `swift build` but its end-to-end runtime behavior (frames actually
// flowing over a live server) is **device-loop territory, NOT proven by the
// unit tests here** — the tests cover the pure state machine + lifecycle
// idempotency only, matching `PyreonNetworkStatus`'s "monitor constructed,
// not asserted" boundary.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const ws = useWebSocket('wss://…')` and emits a
// `PyreonWebSocket` instance whose `.task { }` calls `connect(to:)` on
// appear and `close()` on disappear; `ws.lastMessage` / `ws.isConnected`
// reads in the component body become reads on this container. Until that
// lands (the per-service-port follow-up, the PyreonFetch / PyreonNetworkStatus
// pattern), this is usable by hand-written SwiftUI code.

import Foundation
import Observation

/// Observable realtime-socket container — the SwiftUI half of `useWebSocket`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonWebSocket {
    /// The most recent inbound frame as text, or `nil` before the first
    /// message. Read in a view body to render the latest message.
    public private(set) var lastMessage: String?

    /// Every inbound frame in arrival order. Read to render a transcript.
    public private(set) var messages: [String] = []

    /// True between `opened()` and `closed()` / `failed(_:)`. Read to gate
    /// UI on the live connection (a "connecting…" spinner, a disabled send
    /// button); re-renders on every flip.
    public private(set) var isConnected: Bool = false

    /// The most recent failure, or `nil` on success / before first connect.
    /// Set by `failed(_:)`; cleared by `opened()`.
    public private(set) var error: Error?

    /// The live socket task. Nil until `connect(to:)`; held so `send` / `close`
    /// can drive it. `@ObservationIgnored` — not reactive view state.
    @ObservationIgnored private var task: URLSessionWebSocketTask?

    /// The URLSession backing the task. Held so `close()` can invalidate it.
    @ObservationIgnored private var session: URLSession?

    /// Lifecycle flag — true iff a `connect(to:)` has been matched by no
    /// `close()` yet. Decoupled from `isConnected` (the REACTIVE flag, which
    /// a `failed(_:)` flips false while the lifecycle stays "connected" until
    /// `close()` cleans up the dead task). Mirrors `PyreonNetworkStatus`'s
    /// `_started` vs `isOnline` split: guards `connect` against double-open
    /// AND `close` against double-close.
    @ObservationIgnored private var _connected: Bool = false

    public init() {}

    /// True iff a `connect(to:)` is currently outstanding (between a matched
    /// `connect` / `close` pair). Distinct from `isConnected` — after a
    /// `failed(_:)` the socket is dead (`isConnected == false`) but the
    /// lifecycle stays open until `close()`. Cheap to read; not observable
    /// for re-render (wrap in your own `@Observable` if you need to gate UI
    /// on lifecycle state itself).
    public var isOpen: Bool { _connected }

    // MARK: - Pure state-machine transitions
    //
    // The live receive loop drives the container through these transitions
    // on the main actor. They touch ONLY the reactive fields — never the
    // socket or the lifecycle flag — so they are synchronously unit-testable
    // by driving them directly (the live socket is exercised only on a real
    // device).

    /// Enter the connected state: `isConnected` true, prior `error` cleared.
    public func opened() {
        isConnected = true
        error = nil
    }

    /// Record an inbound frame: set `lastMessage`, append to `messages`.
    public func received(_ text: String) {
        lastMessage = text
        messages.append(text)
    }

    /// Record a failure: set `error`, flip `isConnected` false. Leaves
    /// `messages` / `lastMessage` in place (stale-while-error). Does NOT
    /// clear the lifecycle flag — call `close()` to release the dead task
    /// before a reconnect.
    public func failed(_ failure: Error) {
        error = failure
        isConnected = false
    }

    /// Record a clean close: flip `isConnected` false. Leaves `error` /
    /// `messages` in place for post-close inspection.
    public func closed() {
        isConnected = false
    }

    // MARK: - Live socket edge (real URLSessionWebSocketTask)

    /// Open a live WebSocket to `url` and start pumping inbound frames into
    /// `received` / `failed`. Idempotent — a second call while already open
    /// is a no-op. Calls `opened()` optimistically on `resume()` (a precise
    /// readiness signal needs a `URLSessionWebSocketDelegate`
    /// `didOpenWithProtocol` callback — a device-loop refinement).
    public func connect(to url: URL) {
        guard !_connected else { return }
        _connected = true
        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: url)
        self.session = session
        self.task = task
        task.resume()
        opened()
        listen()
    }

    /// Send a text frame over the live socket. No-op when not connected.
    /// A send error forwards to `failed(_:)` on the main actor.
    public func send(_ text: String) {
        task?.send(.string(text)) { [weak self] err in
            guard let err else { return }
            DispatchQueue.main.async { self?.failed(err) }
        }
    }

    /// Close the live socket and release the task. Safe to call when not
    /// open (no-op) AND safe to call twice — the second call early-returns
    /// on `_connected == false` without touching the already-cancelled task.
    /// Drives a final `closed()` transition.
    public func close() {
        guard _connected else { return }
        _connected = false
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
        closed()
    }

    /// Recursive receive pump. `URLSessionWebSocketTask.receive` yields ONE
    /// frame per call, so each success re-arms the next receive. Inbound
    /// frames and failures are marshaled to the main actor before touching
    /// the `@Observable` reactive state.
    private func listen() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    DispatchQueue.main.async { self.received(text) }
                case .data(let data):
                    DispatchQueue.main.async {
                        self.received(String(decoding: data, as: UTF8.self))
                    }
                @unknown default:
                    break
                }
                self.listen() // re-arm for the next frame
            case .failure(let err):
                DispatchQueue.main.async { self.failed(err) }
            }
        }
    }
}
