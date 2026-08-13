// PyreonWebSocket — the Compose side of Pyreon's cross-platform realtime
// story (Tier 2). Mirrors a web `useWebSocket` reactive surface and the
// Swift `PyreonWebSocket` one-for-one.
//
// ## What this delivers
//
// Reactive realtime state (Compose `MutableState`, read `.value`):
//
//     ws.lastMessage.value   // the most recent inbound frame, null until first
//     ws.messages.value      // every inbound frame in order
//     ws.isConnected.value   // true between open and close/failure
//     ws.error.value         // the most recent failure, null on success
//
// A Composable reading these recomposes as frames arrive / the connection
// flips — the Compose analogue of a web `useWebSocket().lastMessage`
// reactive read. `send(_)` writes an outbound frame; `connect(register)` /
// `close()` own the live socket lifecycle.
//
// ## API design — mirrors @pyreon/native-runtime-swift
//
//   Swift                                  | Kotlin
//   ---------------------------------------+----------------------------------
//   ws.lastMessage          (@Observable)  | ws.lastMessage.value (MutableState)
//   ws.messages             (@Observable)  | ws.messages.value    (MutableState)
//   ws.isConnected          (@Observable)  | ws.isConnected.value (MutableState)
//   ws.error                (@Observable)  | ws.error.value       (MutableState)
//   ws.opened/received/failed/closed       | ws.opened/received/failed/closed
//   ws.connect(to:) (real URLSessionWS)    | ws.connect(register) (injected)
//   ws.send(_) / ws.close()                | ws.send(_) / ws.close()
//
// ## Implementation status — reactive state ships; live transport injected
//
// **The realtime STATE machine ships and is unit-testable** (`opened` /
// `received` / `failed` / `closed` + the reactive fields). The LIVE
// transport differs per platform's toolchain availability — the SAME
// asymmetry `PyreonNetworkStatus` / `PyreonStorage` document:
//
// - **Swift** uses a real `URLSessionWebSocketTask` (`Foundation` is in the
//   Swift toolchain) for `connect(to:)` / `send` / `close`.
// - **Kotlin** real transport needs OkHttp (or `java.net.http.WebSocket` on
//   a JDK target) — a dependency the minimal `kotlinc`-against-Compose-stubs
//   gate CAN'T provide. So `connect(register)` here takes the platform
//   transport the APP wires: the app's OkHttp `WebSocketListener` forwards
//   to the supplied handler thunks (`onOpen` / `onMessage` / `onError` /
//   `onClosed`) and returns a [WebSocketSender] the container drives for
//   `send` / `close`. This keeps the file Android-SDK-free + kotlinc-stub
//   compatible. An OkHttp-backed `connect(url)` convenience overload is a
//   Phase-2+ follow-up that needs Android CI to verify end-to-end.
//
// The pure container is enough to unit-test the state machine, validate the
// kotlinc surface, and back the `useWebSocket` compiler emit (a follow-up —
// the PyreonFetch / PyreonNetworkStatus per-service-port pattern).

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * Handler thunks the app's platform transport (OkHttp `WebSocketListener`,
 * etc.) forwards inbound socket events to. Supplied to the app's `register`
 * by [PyreonWebSocket.connect]; each forwards to the matching pure
 * state-machine transition.
 */
public class WebSocketHandlers(
    /** Call when the socket opens → drives [PyreonWebSocket.opened]. */
    public val onOpen: () -> Unit,
    /** Call with each inbound text frame → drives [PyreonWebSocket.received]. */
    public val onMessage: (String) -> Unit,
    /** Call on transport failure → drives [PyreonWebSocket.failed]. */
    public val onError: (Throwable) -> Unit,
    /** Call on clean close → drives [PyreonWebSocket.closed]. */
    public val onClosed: () -> Unit,
)

/**
 * The outbound side of an injected transport — returned by the app's
 * `register` so the container can drive `send` / `close` without importing
 * the platform socket type.
 */
public class WebSocketSender(
    /** Send a text frame over the live socket. */
    public val send: (String) -> Unit,
    /** Close the live socket. */
    public val close: () -> Unit,
)

/**
 * Reactive realtime-socket container — the Compose half of `useWebSocket`.
 * Exposes [lastMessage] / [messages] / [isConnected] / [error] as Compose
 * `MutableState` (read `.value`).
 */
public class PyreonWebSocket {
    /** The most recent inbound frame, or null before the first message. */
    public val lastMessage: MutableState<String?> = mutableStateOf(null)

    /** Every inbound frame in arrival order. */
    public val messages: MutableState<List<String>> = mutableStateOf(emptyList())

    /** True between [opened] and [closed] / [failed]. Read `.value` to gate
     * UI on the live connection; recomposes on every flip. */
    public val isConnected: MutableState<Boolean> = mutableStateOf(false)

    /** The most recent failure, or null on success / before first connect.
     * Set by [failed]; cleared by [opened]. */
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    // MARK: - Pure state-machine transitions
    //
    // The app's injected transport forwards inbound socket events to these
    // via [WebSocketHandlers]. They touch ONLY the reactive fields — never
    // the sender or the lifecycle flag — so they are synchronously
    // unit-testable by driving them directly (the live transport is the
    // app's / Android-CI's responsibility).

    /** Enter the connected state: [isConnected] true, prior [error] cleared. */
    public fun opened() {
        isConnected.value = true
        error.value = null
    }

    /** Record an inbound frame: set [lastMessage], append to [messages]. */
    public fun received(text: String) {
        lastMessage.value = text
        messages.value = messages.value + text
    }

    /** Record a failure: set [error], flip [isConnected] false. Leaves
     * [messages] / [lastMessage] in place (stale-while-error). Does NOT
     * clear the lifecycle flag — call [close] to release before reconnect. */
    public fun failed(failure: Throwable) {
        error.value = failure
        isConnected.value = false
    }

    /** Record a clean close: flip [isConnected] false. Leaves [error] /
     * [messages] in place for post-close inspection. */
    public fun closed() {
        isConnected.value = false
    }

    // MARK: - Injected transport edge

    /**
     * Open a live socket via the app-supplied [register]. The app wires its
     * platform transport (OkHttp `WebSocketListener`, etc.) to forward
     * inbound events to the [WebSocketHandlers] thunks (which drive the pure
     * transitions), and returns a [WebSocketSender] the container stores for
     * [send] / [close]. Keeping the transport injected keeps this file
     * Android-SDK-free (kotlinc-stub compatible); an OkHttp `connect(url)`
     * convenience overload is a Phase-2+ Android-CI follow-up.
     *
     * Idempotent — a second call while already open is a no-op (the existing
     * transport keeps driving the container); the supplied [register] is NOT
     * invoked a second time.
     */
    public fun connect(register: (WebSocketHandlers) -> WebSocketSender) {
        if (connected) return // idempotent — already open
        connected = true
        sender = register(
            WebSocketHandlers(
                onOpen = { opened() },
                onMessage = { received(it) },
                onError = { failed(it) },
                onClosed = { closed() },
            ),
        )
    }

    /** Send a text frame over the live socket. No-op when not connected. */
    public fun send(text: String) {
        sender?.send(text)
    }

    /**
     * Close the live socket and release the sender. Safe to call when not
     * open (no-op) AND safe to call twice — the second call early-returns on
     * [connected] without re-invoking the (possibly already-released) sender.
     * Drives a final [closed] transition. The [connected] flag is the source
     * of truth.
     */
    public fun close() {
        if (!connected) return
        connected = false
        sender?.close()
        sender = null
        closed()
    }

    /** True iff a [connect] is currently outstanding (between a matched
     * [connect] / [close] pair). Distinct from [isConnected] — after a
     * [failed] the socket is dead (`isConnected.value == false`) but the
     * lifecycle stays open until [close]. Cheap to read; not Compose-reactive
     * — wrap in your own `mutableStateOf` to gate UI on lifecycle itself. */
    public val isOpen: Boolean get() = connected

    /** Lifecycle flag — true iff a [connect] has been matched by no [close]
     * yet. Decoupled from [isConnected] (the reactive flag a [failed] flips
     * false while the lifecycle stays open). Guards against double-open AND
     * double-close. */
    private var connected: Boolean = false
    private var sender: WebSocketSender? = null
}
