package com.pyreon.runtime

// PyreonSyncTransport — the Android-native equivalent of @pyreon/sync's web
// `connectPyreonSync(doc, channel)`. Wires a `PyreonCrdtDoc` to a peer over a
// string-duplex `PyreonSyncChannel` (a WebSocket, a WebView postMessage bridge,
// an in-memory pair for tests) so two devices editing the same document CONVERGE
// in real time.
//
// Wire format + semantics are IDENTICAL to the web + Swift transports (so an
// Android peer converges with a web and an iOS peer): on open a peer sends its
// FULL state (each register carries its own (clock, actor) stamp, so a state
// dump merges convergently in any order); thereafter it relays only its LOCAL
// ops. Inbound messages merge via `applyMessage`, which fires observers but emits
// NO ops — so echo-prevention is STRUCTURAL, not a re-entrancy flag: an applied
// remote op can never re-broadcast (`onLocalOps` fires only from `set()`).
//
// No android/androidx/kotlinx imports — the pure engine layer, so it compiles
// standalone and unit-tests headlessly, mirroring PyreonCrdt.kt.

/** The minimal string-duplex a transport binding provides. */
interface PyreonSyncChannel {
    fun send(data: String)
    fun onMessage(cb: (String) -> Unit)
    /** Fires when the channel is ready to send. Fire immediately if already open. */
    fun onOpen(cb: () -> Unit)
    fun close()
}

/**
 * Relays a `PyreonCrdtDoc`'s local ops to a peer over `channel`, and merges the
 * peer's ops back in. Construct one per (doc, channel) pair; `dispose()` detaches
 * ONLY this transport's hook + closes the channel — the shared doc survives.
 */
class PyreonSyncTransport(
    private val doc: PyreonCrdtDoc,
    private val channel: PyreonSyncChannel,
) {
    private var disposed = false

    init {
        // Register inbound + outbound BEFORE onOpen so everything is live when
        // the open callback fires (a channel may fire onOpen synchronously if
        // already open).
        channel.onMessage { data -> if (!disposed) doc.applyMessage(data) } // no ops → no echo (structural)
        doc.onLocalOps = { ops -> if (!disposed) channel.send(doc.encodeMessage(ops)) }
        channel.onOpen { if (!disposed) channel.send(doc.encodeMessage(doc.encodeState())) } // initial full-state sync
    }

    /** Idempotent. Detaches ONLY this transport's `onLocalOps` hook and closes
     *  the channel — never touches the shared doc's state. */
    fun dispose() {
        if (disposed) return
        disposed = true
        doc.onLocalOps = null
        channel.close()
    }
}
