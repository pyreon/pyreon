// PyreonWebSocketOkHttp — the default OkHttp-backed transport for
// [PyreonWebSocket]: the `connect(url)` convenience the core file's design
// doc tracks as the "Phase-2+ follow-up". With it, the compiler can emit a
// faithful `ws.connect(url)` on Android (mirroring Swift's
// `connect(to: URL)`) instead of the host-supplied-transport warning — and
// lifecycle AUTO-START becomes emittable on both targets.
//
// ## Why a SEPARATE file (not an overload inside PyreonWebSocket.kt)
//
// The core container is deliberately dependency-free ("Android-SDK-free +
// kotlinc-stub compatible" — its own design doc): every consumer compiles it
// via the srcDir include whether or not they use websockets. This file is
// the ONLY runtime source importing okhttp3, so the okhttp dependency is
// attributable to exactly one file — and the per-service kotlinc verify
// compiles it against an okhttp3 stub set that mirrors the real 4.x surface
// EXACTLY (a superset stub masks — the 4×-documented stub-design rule).
//
// ## Client lifecycle
//
// One shared [OkHttpClient] for every Pyreon socket (OkHttp's own guidance:
// clients share a connection pool + dispatcher; per-connect clients leak
// their executor). Lazy so apps that never connect never allocate it.
//
// ## Close codes
//
// `close()` sends 1000 (normal closure). The container's `closed()`
// transition fires via the listener's `onClosed` callback, keeping ONE
// state-machine driver (the listener) for both local and remote closes.

package com.pyreon.runtime

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

private val sharedOkHttpClient: OkHttpClient by lazy { OkHttpClient() }

/**
 * Open a live socket to [url] over the shared OkHttp client — the default
 * transport for [PyreonWebSocket.connect]'s `register` seam. The compiler
 * emits this for the TS surface `ws.connect()` (the `useWebSocket(url)`
 * decl carries the url). Idempotent via the core `connect`'s guard.
 */
public fun PyreonWebSocket.connect(url: String) {
    connect { handlers ->
        val socket: WebSocket = sharedOkHttpClient.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    handlers.onOpen()
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handlers.onMessage(text)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    handlers.onError(t)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    handlers.onClosed()
                }
            },
        )
        WebSocketSender(
            send = { socket.send(it) },
            close = { socket.close(1000, null) },
        )
    }
}
