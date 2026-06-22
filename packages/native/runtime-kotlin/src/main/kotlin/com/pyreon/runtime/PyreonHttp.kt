// PyreonHttp — the Compose side of Pyreon's cross-platform HTTP story
// (Tier 0e — richer requests). `PyreonFetch` is the reactive RESULT
// container with an injected fetcher; `PyreonHttp` is the request/response
// layer that fetcher uses, so `useFetch`-style code can do POST / PUT /
// DELETE with custom headers + a JSON body, not just a bare GET.
//
// ## API design — mirrors @pyreon/native-runtime-swift
//
//   Swift                                  | Kotlin
//   ---------------------------------------+----------------------------------
//   PyreonHttpMethod (.get/.post/…)        | PyreonHttpMethod (GET/POST/…)
//   PyreonHttpRequest (body: Data?)        | PyreonHttpRequest (body: String?)
//   PyreonHttpResponse (.isOK/.text/.decode)| PyreonHttpResponse (.isOk/.body)
//   PyreonHttp.send (real URLSession)      | PyreonHttpExecutor (injected OkHttp)
//
// ## Implementation status — request/response ship; executor injected
//
// The request BUILDERS + response helpers ship and are unit-testable. The
// SAME asymmetry the other services document:
//
// - **Swift** ships a real `URLSession` `send(_:)` (Foundation is in the
//   toolchain).
// - **Kotlin** real HTTP needs OkHttp / `java.net.http` — a dependency the
//   minimal `kotlinc`-against-Compose-stubs gate CAN'T provide. So the app
//   wires a [PyreonHttpExecutor] (OkHttp-backed); the container / emit calls
//   `executor.send(request)`. This keeps the file SDK-free. An OkHttp-backed
//   convenience is a Phase-2+ Android-CI follow-up.
//
// NOTE the body asymmetry: Swift uses `Data?` (arbitrary bytes); Kotlin uses
// `String?` (UTF-8 text — the dominant JSON case) to avoid a `ByteArray`-in-
// data-class equality footgun. Both carry a JSON body identically.

package com.pyreon.runtime

/** HTTP method. [verb] is the wire string. */
public enum class PyreonHttpMethod(public val verb: String) {
    GET("GET"),
    POST("POST"),
    PUT("PUT"),
    PATCH("PATCH"),
    DELETE("DELETE"),
}

/** A richer HTTP request — method + URL + headers + optional text body. */
public data class PyreonHttpRequest(
    val method: PyreonHttpMethod = PyreonHttpMethod.GET,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
) {
    public companion object {
        /** A GET request. */
        public fun get(url: String, headers: Map<String, String> = emptyMap()): PyreonHttpRequest =
            PyreonHttpRequest(PyreonHttpMethod.GET, url, headers)

        /** A POST request with a raw text body. */
        public fun post(
            url: String,
            body: String? = null,
            headers: Map<String, String> = emptyMap(),
        ): PyreonHttpRequest = PyreonHttpRequest(PyreonHttpMethod.POST, url, headers, body)

        /** A POST request with a JSON body — sets `Content-Type:
         * application/json` (unless the caller already provided one). */
        public fun postJson(
            url: String,
            jsonBody: String?,
            headers: Map<String, String> = emptyMap(),
        ): PyreonHttpRequest {
            val hasContentType = headers.keys.any { it.equals("content-type", ignoreCase = true) }
            val h = if (hasContentType) headers else headers + ("Content-Type" to "application/json")
            return PyreonHttpRequest(PyreonHttpMethod.POST, url, h, jsonBody)
        }
    }
}

/** An HTTP response — status + headers + text body. */
public data class PyreonHttpResponse(
    val status: Int,
    val headers: Map<String, String> = emptyMap(),
    val body: String = "",
) {
    /** True for a 2xx status. */
    public val isOk: Boolean get() = status in 200..299
}

/**
 * Injected HTTP executor — the app wires an OkHttp-backed implementation;
 * the container / `useFetch` emit calls [send]. Kept injected so this file
 * needs no Android HTTP dependency (kotlinc-stub compatible). A real
 * OkHttp executor is a Phase-2+ Android-CI follow-up.
 */
public interface PyreonHttpExecutor {
    /** Execute [request] and return the response. */
    public fun send(request: PyreonHttpRequest): PyreonHttpResponse
}
