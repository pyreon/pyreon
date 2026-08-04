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
 * Injected HTTP executor. Kept injected so THIS file needs no Android HTTP
 * dependency (it compiles under the kotlinc stub set like every other core
 * container); the real OkHttp implementation lives in its own file so the
 * dependency is attributable to exactly one source — the same split
 * `PyreonWebSocket` / `PyreonWebSocketOkHttp` uses.
 */
public interface PyreonHttpExecutor {
    /** Execute [request] and return the response. */
    public fun send(request: PyreonHttpRequest): PyreonHttpResponse
}

/** HTTP failures distinct from the transport's own exceptions. */
public sealed class PyreonHttpError(message: String) : Exception(message) {
    /** The url could not be parsed. */
    public class InvalidUrl(public val url: String) : PyreonHttpError("invalid url: $url")

    /**
     * The server answered with a non-2xx status.
     *
     * Distinct from a decode failure on purpose — handing an error page to
     * the JSON decoder surfaces as "the server sent bad JSON", which sends
     * the reader looking at their model types when the real answer is a 404.
     */
    public class BadStatus(public val status: Int) : PyreonHttpError("HTTP $status")

    /** No executor was installed and no default could be created. */
    public class NoExecutor : PyreonHttpError(
        "no PyreonHttpExecutor installed — call PyreonHttp.install(executor) " +
            "or depend on the OkHttp default (PyreonHttpOkHttp)",
    )
}

/**
 * The entry point the `useFetch` emit calls.
 *
 * Mirrors Swift's `PyreonHttp.send(_:)` one-for-one so ONE shared source
 * lowers to the same request on both targets. The executor is resolved once:
 * an explicitly installed one wins, otherwise the OkHttp default is used when
 * it is on the classpath (it registers itself), and failing both this throws
 * rather than silently doing nothing.
 */
public object PyreonHttp {
    @Volatile
    private var executor: PyreonHttpExecutor? = null

    /** Install a custom executor (tests, or a non-OkHttp stack). */
    public fun install(executor: PyreonHttpExecutor) {
        this.executor = executor
    }

    /** Execute [request]. Blocking — callers run it off the main thread. */
    public fun send(request: PyreonHttpRequest): PyreonHttpResponse {
        val exec = executor ?: throw PyreonHttpError.NoExecutor()
        return exec.send(request)
    }
}
