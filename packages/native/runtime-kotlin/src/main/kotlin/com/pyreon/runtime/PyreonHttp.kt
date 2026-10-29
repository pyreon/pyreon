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
//   `executor.send(request)`. This keeps the file SDK-free. The OkHttp-backed
//   executor lives in PyreonHttpOkHttp.kt.
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
    /**
     * A file or `multipart/form-data` body, STREAMED by the executor rather
     * than held in memory (a picked video must not be read whole). Takes
     * precedence over [body].
     */
    val upload: PyreonHttpUpload? = null,
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

    /** A `fileFromUri` URI that names no readable file, or a scheme the runtime cannot read. */
    public class UnreadableFile(public val uri: String) : PyreonHttpError("cannot read file: $uri")

    /** No executor was installed and no default could be created. */
    public class NoExecutor : PyreonHttpError(
        "no PyreonHttpExecutor installed — call PyreonHttp.install(executor) " +
            "or depend on the OkHttp default (PyreonHttpOkHttp)",
    )
}

/**
 * The entry point the `useFetch` / `useQuery` emits call.
 *
 * Mirrors Swift's `PyreonHttp.send(_:)` so ONE shared source lowers to the same
 * request on both targets. The executor is resolved per call: an explicitly
 * [install]ed one wins (tests, a custom stack), then the [send] caller's
 * `fallback`, and failing both this throws rather than silently doing nothing.
 *
 * The generated code passes `fallback = PyreonHttpOkHttp`. That default has to
 * come from the CALL SITE, not from this file: this file is deliberately
 * dependency-free (it is verified alone against stubs), so it cannot name the
 * OkHttp executor, and an OkHttp object is never initialised until something
 * references it — so it cannot "register itself" either. Finding it by
 * reflection would compile, and then R8 would strip or rename it in a minified
 * release build. A direct reference from the generated code is the one shape
 * that works in every build, with no per-app setup.
 */
public object PyreonHttp {
    @Volatile
    private var executor: PyreonHttpExecutor? = null

    /** Install a custom executor (tests, or a non-OkHttp stack). */
    public fun install(executor: PyreonHttpExecutor) {
        this.executor = executor
    }

    /**
     * Execute [request] with the installed executor, else [fallback]. Blocking —
     * callers run it off the main thread.
     */
    public fun send(
        request: PyreonHttpRequest,
        fallback: PyreonHttpExecutor? = null,
        middleware: List<PyreonHttpMiddleware> = emptyList(),
    ): PyreonHttpResponse {
        val exec = executor ?: fallback ?: throw PyreonHttpError.NoExecutor()
        if (middleware.isEmpty()) return exec.send(request)
        return PyreonHttpPipeline.run(request, middleware) { exec.send(it) }
    }

    /**
     * [send], then REJECT a non-2xx -- what awaiting an `@pyreon/http`
     * endpoint call means on the web (`throwHttpErrors` defaults to true). The
     * compiler emits it, off the main thread, for an endpoint awaited in an
     * event handler. Blocking, like [send].
     */
    public fun call(request: PyreonHttpRequest, fallback: PyreonHttpExecutor? = null): PyreonHttpResponse {
        val response = send(request, fallback)
        if (!response.isOk) throw PyreonHttpError.BadStatus(response.status)
        return response
    }
}

// --- Uploads -----------------------------------------------------------------

/** A streamed request body: a file (`body: await fileFromUri(uri)`) or a multipart form. */
public sealed class PyreonHttpUpload {
    public class File(public val file: PyreonUploadFile) : PyreonHttpUpload()
    public class Multipart(public val body: PyreonMultipartBody) : PyreonHttpUpload()
}

/**
 * A file to upload -- what `fileFromUri(uri, { name, type })` lowers to. It
 * names the file and knows how to OPEN it; nothing is read until the request
 * is sent, and then it is streamed, so a large picked video is never held in
 * memory (or read twice).
 *
 * [length] is the byte count when the source knows it (a file, an inline
 * `data:` URI, a content provider reporting its size), else null.
 */
public class PyreonUploadFile(
    public val name: String,
    public val type: String,
    public val length: Long?,
    private val opener: () -> java.io.InputStream,
) {
    public fun open(): java.io.InputStream = opener()
}

/**
 * Resolving a URI into a [PyreonUploadFile]. `file://` and `data:` are read
 * here; `content://` needs an Android `ContentResolver` and lives in
 * `PyreonUploadAndroid.kt`, which delegates the other schemes back to [from].
 */
public object PyreonUploadFiles {
    /** A `file://` or `data:` URI; anything else (or an unreadable file) throws [PyreonHttpError.UnreadableFile]. */
    public fun from(uri: String, name: String? = null, type: String? = null): PyreonUploadFile {
        if (uri.startsWith("data:")) {
            val parsed = parseDataUri(uri) ?: throw PyreonHttpError.UnreadableFile(uri)
            val bytes = parsed.second
            return PyreonUploadFile(name ?: "blob", type ?: parsed.first, bytes.size.toLong()) {
                java.io.ByteArrayInputStream(bytes)
            }
        }
        if (uri.startsWith("file:")) {
            val file = java.io.File(java.net.URI(uri))
            if (!file.isFile || !file.canRead()) throw PyreonHttpError.UnreadableFile(uri)
            return PyreonUploadFile(name ?: file.name, type ?: mimeTypeForExtension(file.extension), file.length()) {
                java.io.FileInputStream(file)
            }
        }
        throw PyreonHttpError.UnreadableFile(uri)
    }

    /** `data:[<type>][;base64],<payload>` -- the lower-cased type and the decoded bytes. */
    internal fun parseDataUri(uri: String): Pair<String, ByteArray>? {
        val comma = uri.indexOf(',')
        if (comma < 0) return null
        var meta = uri.substring(5, comma)
        // Percent-decoded to BYTES, as the Fetch standard does: `%FF` is the byte 0xFF, not a UTF-8 replacement.
        val payload = percentDecode(uri.substring(comma + 1))
        val base64 = meta.trimEnd().lowercase().endsWith(";base64")
        if (base64) meta = meta.trimEnd().dropLast(";base64".length)
        val bytes = try {
            if (base64) {
                java.util.Base64.getDecoder().decode(String(payload, Charsets.ISO_8859_1).filterNot { it.isWhitespace() })
            } else {
                payload
            }
        } catch (_: IllegalArgumentException) {
            return null
        }
        return dataUriType(meta) to bytes
    }

    /** `%XX` → that byte; everything else is its UTF-8 bytes. A malformed escape stays literal, as the Fetch standard keeps it. */
    internal fun percentDecode(text: String): ByteArray {
        val raw = text.toByteArray(Charsets.UTF_8)
        val out = java.io.ByteArrayOutputStream(raw.size)
        var i = 0
        while (i < raw.size) {
            val b = raw[i].toInt() and 0xff
            if (b == '%'.code && i + 2 < raw.size) {
                val hi = Character.digit(raw[i + 1].toInt(), 16)
                val lo = Character.digit(raw[i + 2].toInt(), 16)
                if (hi >= 0 && lo >= 0) {
                    out.write(hi * 16 + lo)
                    i += 3
                    continue
                }
            }
            out.write(b)
            i += 1
        }
        return out.toByteArray()
    }

    /**
     * The Fetch standard's data-URL type: absent means `text/plain;charset=US-ASCII`, and a bare parameter list
     * (`;charset=utf-8`) is a parameter of `text/plain` -- what `fetch(uri).blob().type` reports on the web.
     */
    internal fun dataUriType(meta: String): String {
        val trimmed = meta.trim()
        if (trimmed.isEmpty()) return "text/plain;charset=us-ascii"
        if (trimmed.startsWith(";")) return ("text/plain$trimmed").lowercase()
        return trimmed.lowercase()
    }

    /** The common upload types by extension; unknown is `""`, sent as `application/octet-stream`, as the web does. */
    public fun mimeTypeForExtension(ext: String): String = when (ext.lowercase()) {
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        "heic" -> "image/heic"
        "heif" -> "image/heif"
        "svg" -> "image/svg+xml"
        "pdf" -> "application/pdf"
        "json" -> "application/json"
        "txt" -> "text/plain"
        "csv" -> "text/csv"
        "html", "htm" -> "text/html"
        "zip" -> "application/zip"
        "mp4" -> "video/mp4"
        "mov" -> "video/quicktime"
        "m4a" -> "audio/mp4"
        "mp3" -> "audio/mpeg"
        "wav" -> "audio/wav"
        else -> ""
    }
}

/**
 * A `multipart/form-data` body, serialized exactly as the web's `FormData`
 * (WHATWG) -- the Swift `PyreonMultipartBody` is its twin, `encodeMultipart`
 * from `@pyreon/http` the oracle.
 *
 * Built from alternating name / value arguments in SOURCE order: `null` is
 * omitted, a list repeats its name, a [PyreonUploadFile] is a file part,
 * anything else a text part holding JavaScript's `String(value)` (the compiler
 * serializes an object value with `JSON.stringify` before it gets here).
 */
public class PyreonMultipartBody(vararg pairs: Any?) {
    public sealed class Value {
        public class Text(public val text: String) : Value()
        public class File(public val file: PyreonUploadFile) : Value()
    }

    public class Part(public val name: String, public val value: Value)

    public val parts: List<Part>

    init {
        val out = ArrayList<Part>()
        fun part(name: String, value: Any?) {
            when (value) {
                null -> Unit
                is PyreonUploadFile -> out.add(Part(name, Value.File(value)))
                else -> out.add(Part(name, Value.Text(PyreonURL.jsString(value))))
            }
        }
        // `encodeMultipart` expands ONE level: an array field appends each element as its own part.
        fun add(name: String, value: Any?) {
            when (value) {
                is Iterable<*> -> value.forEach { part(name, it) }
                is Array<*> -> value.forEach { part(name, it) }
                else -> part(name, value)
            }
        }
        var index = 0
        while (index + 1 < pairs.size) {
            val name = pairs[index]
            if (name is String) add(name, pairs[index + 1])
            index += 2
        }
        parts = out
    }

    private fun head(part: Part, boundary: String): ByteArray {
        val name = escape(normalizeNewlines(part.name))
        val text = when (val v = part.value) {
            is Value.Text -> "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n"
            is Value.File -> "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"; filename=\"${escape(v.file.name)}\"\r\n" +
                "Content-Type: ${v.file.type.ifEmpty { "application/octet-stream" }}\r\n\r\n"
        }
        return text.toByteArray(Charsets.UTF_8)
    }

    /** The exact byte length, or null when a file part's size is unknown (the body is then sent chunked). */
    public fun contentLength(boundary: String): Long? {
        var total = 0L
        for (part in parts) {
            total += head(part, boundary).size + 2
            total += when (val v = part.value) {
                is Value.Text -> normalizeNewlines(v.text).toByteArray(Charsets.UTF_8).size.toLong()
                is Value.File -> v.file.length ?: return null
            }
        }
        return total + "--$boundary--\r\n".toByteArray(Charsets.UTF_8).size
    }

    /** Write the body, streaming each file part from its source in chunks. */
    public fun writeTo(out: java.io.OutputStream, boundary: String) {
        for (part in parts) {
            out.write(head(part, boundary))
            when (val v = part.value) {
                is Value.Text -> out.write(normalizeNewlines(v.text).toByteArray(Charsets.UTF_8))
                is Value.File -> v.file.open().use { it.copyTo(out, 64 * 1024) }
            }
            out.write("\r\n".toByteArray(Charsets.UTF_8))
        }
        out.write("--$boundary--\r\n".toByteArray(Charsets.UTF_8))
    }

    public companion object {
        /** A boundary in the shape browsers use; random so it cannot occur in a part. */
        public fun newBoundary(): String {
            val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
            val random = java.security.SecureRandom()
            return "----PyreonFormBoundary" + (1..16).map { alphabet[random.nextInt(alphabet.length)] }.joinToString("")
        }

        /** CR, LF and CRLF all become CRLF -- the spec's newline normalization for names and text values. */
        internal fun normalizeNewlines(text: String): String =
            text.replace("\r\n", "\n").replace('\r', '\n').replace("\n", "\r\n")

        /** A name or filename inside the quoted Content-Disposition parameter. */
        internal fun escape(text: String): String =
            text.replace("\n", "%0A").replace("\r", "%0D").replace("\"", "%22")
    }
}

// ── Client middleware ───────────────────────────────────────────────────────
//
// The native half of `@pyreon/http`'s `use: [...]` array — the Kotlin twin of
// the Swift `PyreonHttpMiddleware`. The compiler lowers each statically
// readable entry of a LITERAL `use` array to one class below; anything it
// cannot read (`refresh`, `dedupe`, a custom function) keeps the client's
// endpoint calls on the web, with a named warning.
//
// Semantics mirror packages/fundamentals/http/src/middleware/*.ts, and a
// differential test runs both on the same inputs
// (native-http-middleware-parity.test.ts):
//
//   - a real ONION (`dispatch(index)` → `next()`), so order means what it does
//     on the web: `[bearer, retry]` reads the token once, `[retry, bearer]`
//     per attempt;
//   - ONE mutable request box shared by the chain, because the web mutates
//     `request.headers` in place;
//   - randomness, sleeping, the clock and the log sink come from
//     [PyreonHttpPipelineEnv], so the backoff schedule is testable exactly.
//
// Blocking, like `PyreonHttp.send` — the emitted harness already runs inside
// `withContext(Dispatchers.IO)`, so the backoff `Thread.sleep` never touches
// the main thread. Dependency-free (no kotlinx), so the smoke test RUNS.

/** `retry(...)`'s options, with the web's defaults. */
public data class PyreonRetryPolicy(
    /** Retries AFTER the initial attempt. */
    val limit: Int = 2,
    /** Wire verbs eligible for a retry. */
    val methods: List<String> = IDEMPOTENT,
    /** Statuses worth replaying. */
    val statuses: List<Int> = RETRYABLE,
    /** Retry transport failures (offline, DNS). */
    val network: Boolean = true,
    /** Honour a `Retry-After` response header. */
    val respectRetryAfter: Boolean = true,
    /** Upper bound for any single wait, in ms. */
    val maxDelay: Double = 30_000.0,
) {
    public companion object {
        public val IDEMPOTENT: List<String> = listOf("GET", "HEAD", "PUT", "DELETE", "OPTIONS")
        public val RETRYABLE: List<Int> = listOf(408, 413, 429, 500, 502, 503, 504)
    }
}

/** One lowered entry of a client's `use: [...]` array. */
public sealed class PyreonHttpMiddleware {
    /** `bearer(() => token, { crossOrigin })`; a null or empty token sends no header. */
    public class Bearer(
        public val baseUrl: String,
        public val crossOrigin: Boolean = false,
        public val token: () -> String?,
    ) : PyreonHttpMiddleware()

    /** `retry({ … })`. */
    public class Retry(public val policy: PyreonRetryPolicy = PyreonRetryPolicy()) : PyreonHttpMiddleware()

    /** `logger({ production })`; only when [PyreonHttpPipelineEnv.isDebug], unless [production]. */
    public class Logger(public val production: Boolean = false) : PyreonHttpMiddleware()
}

/** Everything the pipeline needs from the outside world, injectable for tests. */
public class PyreonHttpPipelineEnv(
    public val sleep: (Double) -> Unit,
    public val random: () -> Double,
    public val now: () -> Double,
    public val log: (String, Double) -> Unit,
    public val isDebug: Boolean,
) {
    public companion object {
        /**
         * Whether `logger()` treats this as a debug build — the stand-in for
         * the web's `NODE_ENV !== 'production'`.
         *
         * This file cannot see the app's `BuildConfig` (it is verified alone,
         * dependency-free), so the default is `true`; a release build sets
         * `PyreonHttpPipelineEnv.debugBuild = BuildConfig.DEBUG` once at
         * startup. Swift reads `#if DEBUG` and needs no setup.
         */
        @Volatile
        @JvmStatic
        public var debugBuild: Boolean = true

        public val live: PyreonHttpPipelineEnv
            get() = PyreonHttpPipelineEnv(
                sleep = { ms -> if (ms > 0) Thread.sleep(ms.toLong()) },
                random = { Math.random() },
                now = { System.currentTimeMillis().toDouble() },
                log = { line, ms -> println("$line (${Math.round(ms)}ms)") },
                isDebug = debugBuild,
            )
    }
}

public object PyreonHttpPipeline {
    /** The request as the chain sees it: one box, mutated in place. */
    private class Box(var request: PyreonHttpRequest)

    /** Run [request] through [middleware] (outermost first) into [transport]. */
    @JvmStatic
    public fun run(
        request: PyreonHttpRequest,
        middleware: List<PyreonHttpMiddleware>,
        env: PyreonHttpPipelineEnv = PyreonHttpPipelineEnv.live,
        transport: (PyreonHttpRequest) -> PyreonHttpResponse,
    ): PyreonHttpResponse = dispatch(0, Box(request), middleware, env, transport)

    private fun dispatch(
        index: Int,
        box: Box,
        middleware: List<PyreonHttpMiddleware>,
        env: PyreonHttpPipelineEnv,
        transport: (PyreonHttpRequest) -> PyreonHttpResponse,
    ): PyreonHttpResponse {
        if (index >= middleware.size) return transport(box.request)
        val next = { dispatch(index + 1, box, middleware, env, transport) }
        return when (val mw = middleware[index]) {
            is PyreonHttpMiddleware.Bearer -> {
                if (mw.crossOrigin || targetsBaseOrigin(box.request.url, mw.baseUrl)) {
                    val value = mw.token()
                    if (!value.isNullOrEmpty()) {
                        box.request = box.request.copy(
                            headers = withHeader(box.request.headers, "authorization", "Bearer $value"),
                        )
                    }
                }
                next()
            }
            is PyreonHttpMiddleware.Retry -> retry(mw.policy, box, env, next)
            is PyreonHttpMiddleware.Logger -> {
                if (!mw.production && !env.isDebug) return next()
                val started = env.now()
                val description = "${box.request.method.verb} ${redactUrl(box.request.url)}"
                try {
                    val response = next()
                    env.log("[Pyreon] http $description → ${response.status}", env.now() - started)
                    response
                } catch (error: Throwable) {
                    env.log("[Pyreon] http $description → failed", env.now() - started)
                    throw error
                }
            }
        }
    }

    private fun retry(
        policy: PyreonRetryPolicy,
        box: Box,
        env: PyreonHttpPipelineEnv,
        next: () -> PyreonHttpResponse,
    ): PyreonHttpResponse {
        // A native body is a String in memory, always replayable.
        if (policy.limit <= 0 || box.request.method.verb !in policy.methods) return next()
        var attempt = 0
        while (true) {
            val response: PyreonHttpResponse
            try {
                response = next()
            } catch (error: Throwable) {
                // Cancellation is never a failure to retry.
                if (isAbort(error) || !policy.network || attempt >= policy.limit) throw error
                attempt += 1
                env.sleep(minOf(defaultBackoff(attempt, env.random()), policy.maxDelay))
                continue
            }
            if (response.status !in policy.statuses) return response
            if (attempt >= policy.limit) return response
            attempt += 1
            val after = if (policy.respectRetryAfter) {
                parseRetryAfter(header(response.headers, "retry-after"), env.now())
            } else {
                null
            }
            env.sleep(minOf(after ?: defaultBackoff(attempt, env.random()), policy.maxDelay))
        }
    }

    /** Exponential backoff with full jitter — the web's `defaultBackoff`. */
    @JvmStatic
    public fun defaultBackoff(attempt: Int, random: Double): Double {
        val base = minOf(1000.0 * Math.pow(2.0, (attempt - 1).toDouble()), 20_000.0)
        return Math.round(base / 2 + random * (base / 2)).toDouble()
    }

    private val DECIMAL = Regex("^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?$")

    /** `Retry-After` as delta-seconds or an HTTP date, in ms; null when absent or unparseable. */
    @JvmStatic
    public fun parseRetryAfter(header: String?, now: Double): Double? {
        if (header.isNullOrEmpty()) return null
        val trimmed = header.trim()
        // JavaScript's `Number('')` (whitespace-only) is 0.
        if (trimmed.isEmpty()) return 0.0
        if (DECIMAL.matches(trimmed)) {
            val seconds = trimmed.toDoubleOrNull()
            if (seconds != null && seconds.isFinite()) return maxOf(0.0, seconds * 1000)
        }
        return try {
            val format = java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", java.util.Locale.US)
            format.timeZone = java.util.TimeZone.getTimeZone("GMT")
            format.isLenient = false
            val date = format.parse(trimmed) ?: return null
            maxOf(0.0, date.time.toDouble() - now)
        } catch (_: java.text.ParseException) {
            null
        }
    }

    private val ABSOLUTE = Regex("^[A-Za-z][A-Za-z\\d+\\-.]*://")

    /** The web's `targetsBaseOrigin`: does the request stay on the `baseUrl`'s origin? */
    @JvmStatic
    public fun targetsBaseOrigin(url: String, baseUrl: String): Boolean {
        if (baseUrl.isEmpty()) return true
        val trimmed = if (baseUrl.endsWith("/")) baseUrl.dropLast(1) else baseUrl
        if (url == trimmed || url.startsWith("$trimmed/")) return true
        if (!ABSOLUTE.containsMatchIn(url) && !ABSOLUTE.containsMatchIn(baseUrl) && !url.startsWith("//")) {
            return true
        }
        val a = origin(url) ?: return false
        val b = origin(baseUrl) ?: return false
        return a == b
    }

    /** The web's `redactUrl`: no query, no fragment, no userinfo. */
    @JvmStatic
    public fun redactUrl(url: String): String {
        val cut = url.indexOfFirst { it == '?' || it == '#' }
        val base = if (cut >= 0) url.substring(0, cut) else url
        val scheme = ABSOLUTE.find(base) ?: return base
        val rest = base.substring(scheme.range.last + 1)
        val authorityEnd = rest.indexOf('/').let { if (it < 0) rest.length else it }
        // The web's `[^/@]*@` stops at the FIRST `@` of the authority.
        val at = rest.substring(0, authorityEnd).indexOf('@')
        if (at < 0) return base
        return base.substring(0, scheme.range.last + 1) + rest.substring(at + 1)
    }

    private fun isAbort(error: Throwable): Boolean =
        error is InterruptedException || error is java.util.concurrent.CancellationException

    /** The ORIGIN a URL resolves to, relative to the web's no-`location` placeholder origin. */
    private fun origin(url: String): String? {
        val resolved = when {
            ABSOLUTE.containsMatchIn(url) -> url
            url.startsWith("//") -> "http:$url"
            else -> "http://pyreon.invalid"
        }
        return try {
            val uri = java.net.URI(resolved)
            val scheme = uri.scheme?.lowercase() ?: return null
            val host = uri.host?.lowercase() ?: return null
            val defaults = mapOf("http" to 80, "https" to 443, "ws" to 80, "wss" to 443)
            if (uri.port != -1 && uri.port != defaults[scheme]) "$scheme://$host:${uri.port}" else "$scheme://$host"
        } catch (_: java.net.URISyntaxException) {
            null
        }
    }

    /** `Headers.set` — replaces every case-variant of [name]. */
    private fun withHeader(headers: Map<String, String>, name: String, value: String): Map<String, String> =
        headers.filterKeys { !it.equals(name, ignoreCase = true) } + (name to value)

    /** `Headers.get` — case-insensitive. */
    private fun header(headers: Map<String, String>, name: String): String? =
        headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value
}

/**
 * URL construction shared with the generated fetch/query call sites.
 *
 * A path parameter supplied at RUNTIME cannot be percent-encoded at compile
 * time, so the encoding has to live here -- and it has to agree with the web
 * exactly, or the same call reaches a different URL on each platform.
 *
 * The web spells it `encodeURIComponent(String(value))` (`@pyreon/http`'s
 * `applyPathParams`), so BOTH halves are mirrored: the JavaScript `String()`
 * conversion for the value, then the encode.
 */
object PyreonURL {
    private const val UNRESERVED = "-_.!~*'()"
    private const val HEX = "0123456789ABCDEF"

    /**
     * Percent-encode one path SEGMENT, matching JavaScript's
     * `encodeURIComponent`.
     *
     * Hand-rolled rather than `URLEncoder.encode`, which is
     * application/x-www-form-urlencoded: it turns a space into `+` and escapes
     * `!`, `~`, `*`, `'`, `(` and `)` that `encodeURIComponent` leaves alone.
     * Using it here would produce a different URL than the web for any of
     * those characters.
     *
     * Note this is the PATH encoder. A query value IS form-encoded, so the
     * same character differs by position and one encoder for both positions is
     * wrong in both.
     */
    @JvmStatic
    fun encodePathParam(value: String): String {
        val out = StringBuilder(value.length)
        for (byte in value.toByteArray(Charsets.UTF_8)) {
            val b = byte.toInt() and 0xFF
            val c = b.toChar()
            // ASCII alphanumerics only -- a multi-byte character's bytes are
            // all >= 0x80, so they can never take this branch.
            val isAsciiAlnum = c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9'
            if (isAsciiAlnum || UNRESERVED.indexOf(c) >= 0) {
                out.append(c)
            } else {
                out.append('%').append(HEX[(b shr 4) and 0xF]).append(HEX[b and 0xF])
            }
        }
        return out.toString()
    }

    /**
     * Integer overload. Kotlin's `Int.toString()` already matches JavaScript's
     * `String(number)` for every integral value, so this only encodes.
     */
    @JvmStatic
    fun encodePathParam(value: Int): String = encodePathParam(value.toString())

    /** Long overload -- same reasoning as [encodePathParam] for `Int`. */
    @JvmStatic
    fun encodePathParam(value: Long): String = encodePathParam(value.toString())

    /**
     * Floating-point overload, and the one place the two languages disagree by
     * default: JavaScript has a single number type, so `String(1.0)` is `"1"`,
     * while Kotlin's is `"1.0"`. A whole-valued Double is therefore rendered
     * as an integer, which is what the web would have sent.
     *
     * Outside that range the default `toString` is used. Very large magnitudes
     * (>= 1e21, where JavaScript switches to exponent notation) and the
     * non-finite values are a KNOWN divergence -- a path parameter is an
     * identifier, so neither shape occurs in practice, and inventing a
     * JavaScript number formatter to cover them would be more code than the
     * case is worth.
     */
    @JvmStatic
    fun encodePathParam(value: Double): String {
        if (value.isFinite() && value == Math.rint(value) && Math.abs(value) < 1e21) {
            return encodePathParam(value.toLong().toString())
        }
        return encodePathParam(value.toString())
    }

    /**
     * A query string built at RUNTIME, matching the web's `buildQuery`
     * (`@pyreon/http` -> `URLSearchParams`) byte for byte. The Swift
     * `PyreonURL.query` is its twin.
     *
     * [pairs] alternates a key and its value, in SOURCE order -- the order the
     * web appends them. `null` drops the pair, a list repeats the key per
     * non-null element, a number is JavaScript's `String(number)` (`1`, not
     * `1.0`), a boolean `true` / `false`. Keys and values are
     * application/x-www-form-urlencoded (a space is `+`; only `*-._` and ASCII
     * alphanumerics stay literal), which is not the path encoding. Returns `""`
     * when every pair was dropped, else [joiner] (`?`, or `&` when the path
     * already carries a query) followed by the pairs.
     */
    @JvmStatic
    fun query(joiner: String, vararg pairs: Any?): String {
        val out = ArrayList<String>()
        var index = 0
        while (index + 1 < pairs.size) {
            val key = pairs[index]
            if (key is String) {
                for (value in queryValues(pairs[index + 1])) out.add(formEncode(key) + "=" + formEncode(value))
            }
            index += 2
        }
        return if (out.isEmpty()) "" else joiner + out.joinToString("&")
    }

    internal fun queryValues(value: Any?): List<String> = when (value) {
        null -> emptyList()
        is Iterable<*> -> value.filterNotNull().map(::jsString)
        is Array<*> -> value.filterNotNull().map(::jsString)
        else -> listOf(jsString(value))
    }

    /** JavaScript's `String(value)` for the scalar shapes a query value takes. */
    internal fun jsString(value: Any): String = when (value) {
        is String -> value
        is Boolean -> if (value) "true" else "false"
        is Double -> jsNumberString(value)
        is Float -> jsNumberString(value.toDouble())
        else -> value.toString()
    }

    /** `String(number)`: JavaScript's spelling of the non-finite values, else the ECMAScript digits. */
    internal fun jsNumberString(value: Double): String = when {
        value.isNaN() -> "NaN"
        value == Double.POSITIVE_INFINITY -> "Infinity"
        value == Double.NEGATIVE_INFINITY -> "-Infinity"
        else -> jsFiniteNumber(value)
    }

    /**
     * ECMAScript `Number::toString` for a finite value -- the same algorithm as
     * `PyreonJson.jsNumber`, repeated here because this file is verified ALONE
     * against stubs (it must not reference the kotlinx-backed PyreonJson). The
     * shortest digits that round-trip are SEARCHED with BigDecimal: the JVM's
     * `Double.toString` was not guaranteed shortest before JDK 19, and Android's
     * libcore is its own implementation.
     */
    private fun jsFiniteNumber(value: Double): String {
        if (value == 0.0) return "0"
        val abs = Math.abs(value)
        val exact = java.math.BigDecimal(abs)
        var best: java.math.BigDecimal = exact
        search@ for (p in 1..17) {
            var chosen: java.math.BigDecimal? = null
            for (mode in arrayOf(java.math.RoundingMode.HALF_EVEN, java.math.RoundingMode.FLOOR, java.math.RoundingMode.CEILING)) {
                val c = exact.round(java.math.MathContext(p, mode))
                if (c.toDouble() != abs) continue
                val cur = chosen
                if (cur == null || c.subtract(exact).abs() < cur.subtract(exact).abs()) chosen = c
            }
            if (chosen != null) {
                best = chosen
                break@search
            }
        }
        val unscaled = best.unscaledValue().toString()
        val n = unscaled.length - best.scale()
        val s = unscaled.trimEnd('0').ifEmpty { "0" }
        val k = s.length
        val text = when {
            k <= n && n <= 21 -> s + "0".repeat(n - k)
            0 < n && n <= 21 -> s.substring(0, n) + "." + s.substring(n)
            -6 < n && n <= 0 -> "0." + "0".repeat(-n) + s
            else -> {
                val e = n - 1
                val tail = if (k == 1) "" else "." + s.substring(1)
                s.substring(0, 1) + tail + "e" + (if (e < 0) "-" else "+") + Math.abs(e)
            }
        }
        return (if (value < 0) "-" else "") + text
    }

    /** The application/x-www-form-urlencoded byte serializer `URLSearchParams` uses. */
    @JvmStatic
    fun formEncode(text: String): String {
        val out = StringBuilder(text.length)
        for (byte in text.toByteArray(Charsets.UTF_8)) {
            val b = byte.toInt() and 0xFF
            val c = b.toChar()
            val literal = c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c == '*' || c == '-' || c == '.' || c == '_'
            when {
                literal -> out.append(c)
                b == 0x20 -> out.append('+')
                else -> out.append('%').append(HEX[(b shr 4) and 0xF]).append(HEX[b and 0xF])
            }
        }
        return out.toString()
    }
}
