// PyreonHttpOkHttp — the real Android edge for [PyreonHttp].
//
// `PyreonHttp.kt` shipped with request/response data classes, an executor
// INTERFACE, and a comment calling the real implementation "a Phase-2+
// Android-CI follow-up". Nothing ever implemented it, and — separately —
// nothing in the compiler lowered to it either, so the whole HTTP layer was
// unreachable on both targets: Swift had a live `URLSession` edge no emit
// called, Android had no edge at all. `useFetch` emitted a bare GET
// (`URL(url).readText()`), and an author writing `{ method: 'POST' }` got a
// silent GET with no diagnostic anywhere.
//
// ## Why a SEPARATE file (not an implementation inside PyreonHttp.kt)
//
// Same reason `PyreonWebSocketOkHttp` is separate from `PyreonWebSocket`: the
// core container is deliberately dependency-free ("Android-SDK-free +
// kotlinc-stub compatible") because every consumer compiles it via the srcDir
// include whether or not they make HTTP calls. This file is the only runtime
// source besides the websocket transport that imports okhttp3, so the
// dependency stays attributable to exactly one file per capability, and the
// per-service kotlinc verify compiles it against an okhttp3 stub set that
// mirrors the real 4.x surface EXACTLY (a superset stub masks — the
// 4x-documented stub-design rule).
//
// ## Threading
//
// `send` BLOCKS (OkHttp's `Call.execute()`), which is why the emitted
// `useFetch` harness wraps it in `withContext(Dispatchers.IO)`. Unlike the
// websocket transport there is no main-thread hop here: nothing in this file
// touches Compose state — the caller resolves the container back on its own
// dispatcher once `send` returns.
//
// ## Client lifecycle
//
// One shared [OkHttpClient], lazily created, per OkHttp's own guidance
// (clients share a connection pool + dispatcher; per-call clients leak their
// executor). Deliberately NOT shared with the websocket file's client: that
// one is created lazily too, and coupling them would make an app that only
// makes HTTP calls allocate the websocket machinery and vice versa.

package com.pyreon.runtime

import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

private val sharedHttpClient: OkHttpClient by lazy { OkHttpClient() }

/**
 * OkHttp-backed [PyreonHttpExecutor].
 *
 * Install it with `PyreonHttp.install(PyreonHttpOkHttp)` — the scaffolded
 * Android entry point does this so `useFetch` works out of the box.
 */
public object PyreonHttpOkHttp : PyreonHttpExecutor {
    override fun send(request: PyreonHttpRequest): PyreonHttpResponse {
        val builder = Request.Builder().url(request.url)
        for ((key, value) in request.headers) builder.addHeader(key, value)

        // OkHttp REQUIRES a body for POST/PUT/PATCH and REJECTS one for GET —
        // passing the wrong shape throws `IllegalArgumentException` at build
        // time, not at the server, so the mapping has to be explicit. A verb
        // that must carry a body but was given none sends an empty one rather
        // than throwing: an empty POST is a legitimate request.
        val contentType = request.headers.entries
            .firstOrNull { it.key.equals("Content-Type", ignoreCase = true) }
            ?.value
            ?.toMediaTypeOrNull()
        val body: RequestBody? = when (request.method) {
            PyreonHttpMethod.GET -> null
            PyreonHttpMethod.DELETE -> request.body?.toRequestBody(contentType)
            else -> (request.body ?: "").toRequestBody(contentType)
        }
        builder.method(request.method.verb, body)

        sharedHttpClient.newCall(builder.build()).execute().use { response ->
            val headers = LinkedHashMap<String, String>()
            for ((name, value) in response.headers) headers[name] = value
            return PyreonHttpResponse(
                status = response.code,
                headers = headers,
                // `body?.string()` consumes the stream exactly once — reading
                // it twice returns empty, which is why it is captured here
                // rather than handed out lazily.
                body = response.body?.string() ?: "",
            )
        }
    }
}
