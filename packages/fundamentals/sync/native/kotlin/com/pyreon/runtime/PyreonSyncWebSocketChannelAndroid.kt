// PyreonSyncWebSocketChannelAndroid — the real Android network edge for
// @pyreon/sync. A `PyreonSyncChannel` (the string-duplex `PyreonSyncTransport`
// wires a `PyreonCrdtDoc` onto) backed by a live OkHttp `WebSocket`. With it,
// two devices editing the same document CONVERGE over a WebSocket relay — the
// native counterpart of the web transport, and the Android mirror of
// `PyreonSyncWebSocketChannel.swift`.
//
// ## Why a SEPARATE file, DEVICE-gated (not in the stub co-source gate)
//
// The pure engine (`PyreonCrdt` / `PyreonSyncedSignal` / `PyreonSyncTransport`)
// is deliberately Android-SDK-free — it compiles against kotlinc stubs in the
// `check-native-cosource` gate. This file is the ONLY sync runtime source that
// imports `okhttp3` (and `android.os`), which the stub bundle does not carry,
// so it is declared `pyreon.native.kotlinSdkOnly` and OMITTED from the stub
// compile. Its real behavior is device-gate territory — the same boundary
// `PyreonWebView.kt` (hooks) and the base runtime's `PyreonWebSocketOkHttp.kt`
// use. The Swift sibling needs no such carve-out: `URLSessionWebSocketTask` is
// in Foundation, so swiftc typechecks it in-gate.
//
// ## Callback threading
//
// OkHttp delivers every `WebSocketListener` callback on its own reader thread.
// The handlers below feed `PyreonSyncTransport`, whose `onMessage` routes into
// `doc.applyMessage` → observers → `PyreonSyncedSignal`'s Compose `MutableState`.
// Writing Compose state off the main thread races the UI thread and throws
// `IllegalArgumentException: Detected multithreaded access to
// SnapshotStateObserver` — the exact hazard `PyreonWebSocketOkHttp` documents
// and fixes by hopping to the main looper. Every callback is posted to the main
// thread here for the same reason; no compile-level gate can catch its absence,
// so the device gate is the only proof.
//
// ## Client lifecycle
//
// One shared [OkHttpClient] for every Pyreon sync socket (OkHttp's own
// guidance: clients share a connection pool + dispatcher; per-connect clients
// leak their executor). Lazy so an app that never syncs never allocates it.
// Deliberately NOT shared with the hooks/http OkHttp clients — those are their
// own lazy singletons, so a sync-only app allocates only this one.

package com.pyreon.runtime

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

private val sharedSyncOkHttpClient: OkHttpClient by lazy { OkHttpClient() }

/**
 * Main-thread hop for listener callbacks. Posts unconditionally rather than
 * checking `Looper.myLooper() == mainLooper` first: OkHttp never delivers on
 * main, so the check would always take the post branch anyway, and posting
 * unconditionally keeps the ORDER of `onOpen`/`onMessage` intact — a "run
 * inline when already on main" fast path can reorder a later callback ahead of
 * an earlier queued one.
 */
private val syncMainThread: Handler by lazy { Handler(Looper.getMainLooper()) }

/**
 * A `PyreonSyncChannel` over a live OkHttp [WebSocket]. Construct one per
 * (doc, relay-url) pair and hand it to `PyreonSyncTransport(doc, channel)`; the
 * transport registers `onMessage` / `onOpen` synchronously at construction
 * (before the async handshake fires), then the socket opens and convergence
 * begins. `close()` sends a normal (1000) closure.
 */
class PyreonSyncWebSocketChannel(url: String) : PyreonSyncChannel {
    private val socket: WebSocket
    private var messageHandler: ((String) -> Unit)? = null
    private var openHandler: (() -> Unit)? = null

    /** True once OkHttp's real `onOpen` fired. Guards `onOpen`'s "fire
     *  immediately if already open" contract for a late registration. */
    private var opened = false

    /** Idempotency for `close()`. */
    private var closed = false

    init {
        socket = sharedSyncOkHttpClient.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    syncMainThread.post {
                        opened = true
                        openHandler?.invoke()
                    }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    syncMainThread.post { messageHandler?.invoke(text) }
                }
            },
        )
    }

    override fun send(data: String) {
        if (!closed) socket.send(data)
    }

    override fun onMessage(cb: (String) -> Unit) {
        messageHandler = cb
    }

    override fun onOpen(cb: () -> Unit) {
        openHandler = cb
        // Fire immediately if the handshake already completed (main thread).
        if (opened) syncMainThread.post { cb() }
    }

    override fun close() {
        if (closed) return
        closed = true
        socket.close(1000, null)
    }
}
