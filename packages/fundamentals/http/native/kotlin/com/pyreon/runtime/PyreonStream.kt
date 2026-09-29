// PyreonStream — the Compose side of `@pyreon/http/stream` + `useStream`, the
// Kotlin twin of PyreonStream.swift.
//
// Server-Sent Events and NDJSON over `HttpURLConnection` (the JDK — no OkHttp
// or coroutines dependency), with the web's reconnect and `Last-Event-ID`
// semantics, stopped when the composable leaves the composition.
//
// ## Two halves
//
// The WIRE PARSERS are pure and must agree with the web byte-for-byte. They
// sit between the BEGIN/END markers because `@pyreon/native-compiler`'s
// `native-stream-parser-parity.test.ts` extracts that region VERBATIM,
// compiles it with kotlinc, and diffs its output against the web parser over
// a corpus of byte streams and chunkings. Keep the region dependency-free.
//
// The CONTAINER is the `useStream` result (`events`, `latest`, `status`,
// `error` as Compose `MutableState`) plus the connection loop, a port of
// `createStream`. The loop runs on its own daemon thread, started from the
// emitted `DisposableEffect` and stopped by its `onDispose`: a blocking socket
// read ignores coroutine cancellation, so the only reliable way to end one is
// to close the connection from outside, which `stop()` does. Writes to
// `MutableState` from that thread are the same shape PyreonWebSocket's OkHttp
// callbacks already use; Compose snapshots accept them.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

// ─── Wire parsing (pure) — BEGIN ─────────────────────────────────────────────

/**
 * Split a byte stream into lines exactly as the SSE grammar defines them —
 * `\r\n`, `\n` or a lone `\r` ends a line — stripping ONE leading UTF-8 BOM.
 */
public class PyreonStreamLineSplitter {
    private var line = java.io.ByteArrayOutputStream()
    private var pendingCr = false
    private var bomHeld: ByteArray? = ByteArray(0)

    /** Push one byte; returns a completed line when this byte ended one. */
    public fun push(byte: Byte): ByteArray? {
        val held = bomHeld
        if (held != null) {
            if (byte == BOM[held.size]) {
                val next = held + byte
                bomHeld = if (next.size == BOM.size) null else next
                return null
            }
            // Not a BOM after all: the held bytes are content (never CR/LF).
            bomHeld = null
            line.write(held, 0, held.size)
        }
        if (pendingCr) {
            pendingCr = false
            if (byte == LF) return null
        }
        if (byte == LF || byte == CR) {
            if (byte == CR) pendingCr = true
            val done = line.toByteArray()
            line = java.io.ByteArrayOutputStream()
            return done
        }
        line.write(byte.toInt())
        return null
    }

    /** End of stream: the unterminated tail, if there is one. */
    public fun finish(): ByteArray? {
        val held = bomHeld
        if (held != null) {
            bomHeld = null
            line.write(held, 0, held.size)
        }
        if (line.size() == 0) return null
        val done = line.toByteArray()
        line = java.io.ByteArrayOutputStream()
        return done
    }

    private companion object {
        val BOM = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())
        const val LF: Byte = 10
        const val CR: Byte = 13
    }
}

/**
 * Decode bytes as UTF-8, replacing each MAXIMAL invalid subpart with U+FFFD —
 * the WHATWG decoder, which is what the web's `TextDecoder` implements.
 *
 * Written out rather than `String(bytes, UTF_8)`: the JDK's replacement
 * granularity for truncated and overlong sequences is not specified to match,
 * and a stream that disagrees on one byte renders different text per target.
 */
public fun pyreonStreamDecode(bytes: ByteArray): String {
    val out = StringBuilder(bytes.size)
    var i = 0
    val n = bytes.size
    while (i < n) {
        val b0 = bytes[i].toInt() and 0xFF
        if (b0 < 0x80) {
            out.append(b0.toChar())
            i++
            continue
        }
        val need: Int
        var lower = 0x80
        var upper = 0xBF
        var cp: Int
        when (b0) {
            in 0xC2..0xDF -> { need = 1; cp = b0 and 0x1F }
            in 0xE0..0xEF -> {
                need = 2
                cp = b0 and 0x0F
                if (b0 == 0xE0) lower = 0xA0
                if (b0 == 0xED) upper = 0x9F
            }
            in 0xF0..0xF4 -> {
                need = 3
                cp = b0 and 0x07
                if (b0 == 0xF0) lower = 0x90
                if (b0 == 0xF4) upper = 0x8F
            }
            else -> {
                out.append('�')
                i++
                continue
            }
        }
        var j = i + 1
        var seen = 0
        var ok = true
        while (seen < need) {
            if (j >= n) { ok = false; break }
            val b = bytes[j].toInt() and 0xFF
            if (b < lower || b > upper) { ok = false; break }
            lower = 0x80
            upper = 0xBF
            cp = (cp shl 6) or (b and 0x3F)
            j++
            seen++
        }
        if (!ok) {
            // The maximal subpart [i, j) is ONE replacement; the byte that broke
            // it is re-examined as the start of the next sequence.
            out.append('�')
            i = j
            continue
        }
        out.appendCodePoint(cp)
        i = j
    }
    return out.toString()
}

/** One dispatched Server-Sent Event, before its `data` is decoded. */
public data class PyreonSseMessage(
    /** The `event:` field, or `"message"` when the event did not name one. */
    val type: String,
    /** Every `data:` line of the event, joined with `\n`. */
    val data: String,
    /** The last event id seen on this stream (`""` until one arrives). */
    val id: String,
    /** The reconnection time the server last set with `retry:`, in ms. */
    val retry: Long?,
)

/** The WHATWG `text/event-stream` grammar over lines. Fields compare as BYTES. */
public class PyreonSseParser(lastEventId: String = "") {
    private val data = ArrayList<String>()
    private var type = ""
    private var id = lastEventId
    private var retry: Long? = null

    /** Feed one line; returns the event it dispatched, if any. */
    public fun line(bytes: ByteArray): PyreonSseMessage? {
        if (bytes.isEmpty()) {
            val msg = if (data.isEmpty()) {
                null
            } else {
                PyreonSseMessage(if (type.isEmpty()) "message" else type, data.joinToString("\n"), id, retry)
            }
            data.clear()
            type = ""
            return msg
        }
        if (bytes[0] == COLON) return null
        val colon = bytes.indexOf(COLON)
        val field = if (colon < 0) bytes else bytes.copyOfRange(0, colon)
        var value = if (colon < 0) ByteArray(0) else bytes.copyOfRange(colon + 1, bytes.size)
        if (value.isNotEmpty() && value[0] == SPACE) value = value.copyOfRange(1, value.size)
        when {
            field.contentEquals(DATA) -> data.add(pyreonStreamDecode(value))
            field.contentEquals(EVENT) -> type = pyreonStreamDecode(value)
            field.contentEquals(ID) -> if (!value.contains(0.toByte())) id = pyreonStreamDecode(value)
            field.contentEquals(RETRY) ->
                if (value.isNotEmpty() && value.all { it in 48..57 }) {
                    retry = pyreonStreamDecode(value).toLongOrNull() ?: Long.MAX_VALUE
                }
        }
        return null
    }

    private companion object {
        const val COLON: Byte = 58
        const val SPACE: Byte = 32
        val DATA = "data".toByteArray()
        val EVENT = "event".toByteArray()
        val ID = "id".toByteArray()
        val RETRY = "retry".toByteArray()
    }
}

/** NDJSON / JSON Lines: which lines carry a value, and their 1-based numbers. */
public class PyreonNdjsonLines {
    private var n = 0

    /** Feed one line; returns `(lineNumber, text)` when it carries a value. */
    public fun line(bytes: ByteArray): Pair<Int, String>? {
        n++
        val text = pyreonStreamDecode(bytes)
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            if (!isJsWhitespace(cp)) return n to text
            i += Character.charCount(cp)
        }
        return null
    }

    public companion object {
        /** JavaScript's `String.prototype.trim` set, spelled out. */
        public fun isJsWhitespace(cp: Int): Boolean = when (cp) {
            0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029,
            0x202F, 0x205F, 0x3000, 0xFEFF -> true
            in 0x2000..0x200A -> true
            else -> false
        }
    }
}

// ─── Wire parsing (pure) — END ───────────────────────────────────────────────

/** When and how an SSE stream reconnects — `ReconnectPolicy` on the web. */
public data class PyreonStreamReconnect(
    val attempts: Long = 5L,
    val delay: Long = 1000,
    val maxDelay: Long = 30_000,
    val onEnd: Boolean = false,
)

/** The lowered subset of `EventStreamOptions`. `reconnect = null` disables it. */
public data class PyreonSseOptions(
    val events: List<String>? = null,
    val lastEventId: String? = null,
    val reconnect: PyreonStreamReconnect? = PyreonStreamReconnect(),
)

/** The request a stream opens. */
public data class PyreonStreamRequest(
    val method: String = "GET",
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
)

/** Why a stream ended in `error`. */
public sealed class PyreonStreamError(message: String) : Exception(message) {
    public class BadStatus(public val status: Int) : PyreonStreamError("HTTP $status")
    public class Decode(public val payload: String, cause: Throwable?) :
        PyreonStreamError("a streamed event did not match its type: ${cause?.message}")
    public class Parse(public val line: Int, public val text: String, cause: Throwable?) :
        PyreonStreamError("NDJSON line $line did not decode: ${cause?.message}")
}

public object PyreonStreamPolicy {
    /** `isRetryableStreamError`: network, 408, 429, 5xx retry; decode/parse and other 4xx do not. */
    public fun isRetryable(error: Throwable): Boolean = when (error) {
        is PyreonStreamError.BadStatus -> error.status == 408 || error.status == 429 || error.status >= 500
        is PyreonStreamError.Decode, is PyreonStreamError.Parse -> false
        else -> true
    }

    /** The wait before the next attempt, in ms — base * 2^(n-1) capped, or the base after a clean end. */
    public fun wait(failed: Boolean, base: Long, failures: Int, maxDelay: Long): Long {
        if (!failed) return base
        var d = base
        var i = 1
        while (i < failures && d < maxDelay) {
            d = if (d > Long.MAX_VALUE / 2) Long.MAX_VALUE else d * 2
            i++
        }
        return minOf(d, maxDelay)
    }
}

/** A decoded Server-Sent Event — `SseEvent<T>` on the web. */
public data class PyreonSseEvent<T>(val type: String, val data: T, val id: String)

/** An opened response: its status and body. `close()` aborts a blocked read. */
public class PyreonStreamResponse(
    public val status: Int,
    public val body: java.io.InputStream?,
    private val onClose: () -> Unit = {},
) {
    public fun close() {
        try { body?.close() } catch (_: Throwable) {}
        onClose()
    }
}

/** How a stream opens a connection. Pluggable so the loop is testable. */
public fun interface PyreonStreamTransport {
    public fun open(request: PyreonStreamRequest, headers: Map<String, String>): PyreonStreamResponse
}

/** The default transport: the JDK's `HttpURLConnection`. */
public object PyreonStreamHttpTransport : PyreonStreamTransport {
    override fun open(request: PyreonStreamRequest, headers: Map<String, String>): PyreonStreamResponse {
        val conn = java.net.URL(request.url).openConnection() as java.net.HttpURLConnection
        conn.requestMethod = request.method
        conn.readTimeout = 0 // a stream may be silent for a long time
        conn.useCaches = false
        for ((k, v) in headers) conn.setRequestProperty(k, v)
        if (request.body != null) {
            conn.doOutput = true
            conn.outputStream.use { it.write(request.body.toByteArray(Charsets.UTF_8)) }
        }
        val status = conn.responseCode
        val body = if (status in 200..299) conn.inputStream else null
        return PyreonStreamResponse(status, body) { conn.disconnect() }
    }
}

/**
 * The `useStream` result plus the connection loop the emitted
 * `DisposableEffect` starts. `status` uses the web's vocabulary exactly.
 */
public class PyreonStream<E>(public val maxEvents: Long = 1000L) {
    public val events: MutableState<List<E>> = mutableStateOf(emptyList())
    public val latest: MutableState<E?> = mutableStateOf(null)
    public val status: MutableState<String> = mutableStateOf("idle")
    public val error: MutableState<Throwable?> = mutableStateOf(null)
    /** Bumped by [restart]; the emitted effect keys on it. */
    public val restartTick: MutableState<Int> = mutableStateOf(0)

    @Volatile private var aborted = false
    @Volatile private var session: Session? = null
    private val lock = Any()

    // ─── Pure transitions ────────────────────────────────────────────────

    public fun begin() {
        events.value = emptyList()
        latest.value = null
        error.value = null
        status.value = "connecting"
    }

    public fun push(event: E) {
        val prev = events.value
        events.value = when {
            maxEvents <= 0 -> emptyList()
            prev.size >= maxEvents -> prev.drop((prev.size - maxEvents + 1).toInt()) + event
            else -> prev + event
        }
        latest.value = event
        if (status.value != "open") status.value = "open"
    }

    public fun fail(failure: Throwable) {
        error.value = failure
        status.value = "error"
    }

    /** Stop the stream. A later input change does NOT restart it — [restart] does. */
    public fun abort() {
        aborted = true
        stop()
        status.value = "closed"
    }

    /** Start a fresh stream (events cleared), undoing an [abort]. */
    public fun restart() {
        aborted = false
        restartTick.value = restartTick.value + 1
    }

    /** End the running stream without touching the observable state (dispose). */
    public fun stop() {
        synchronized(lock) {
            session?.cancel()
            session = null
        }
    }

    // ─── Connection loop ─────────────────────────────────────────────────

    /** Open an SSE stream on a background thread. */
    public fun startSse(
        request: PyreonStreamRequest,
        options: PyreonSseOptions = PyreonSseOptions(),
        accept: String = "text/event-stream",
        transport: PyreonStreamTransport = PyreonStreamHttpTransport,
        decode: (PyreonSseMessage) -> E,
    ) {
        val allowed = options.events?.toSet()
        start(request, accept, true, options.reconnect, options.lastEventId, transport, { msg ->
            if (allowed != null && msg.type !in allowed) {
                null
            } else {
                try { decode(msg) } catch (e: Throwable) { throw PyreonStreamError.Decode(msg.data, e) }
            }
        }, null)
    }

    /** Open an NDJSON stream. NDJSON has no resume id, so a failure ends it. */
    public fun startNdjson(
        request: PyreonStreamRequest,
        accept: String = "application/x-ndjson",
        transport: PyreonStreamTransport = PyreonStreamHttpTransport,
        decode: (String) -> E,
    ) {
        start(request, accept, false, null, null, transport, null) { line, text ->
            try { decode(text) } catch (e: Throwable) { throw PyreonStreamError.Parse(line, text, e) }
        }
    }

    private fun start(
        request: PyreonStreamRequest,
        accept: String,
        sse: Boolean,
        policy: PyreonStreamReconnect?,
        initialId: String?,
        transport: PyreonStreamTransport,
        onSse: ((PyreonSseMessage) -> E?)?,
        onLine: ((Int, String) -> E)?,
    ) {
        if (aborted) return
        val s = Session()
        synchronized(lock) {
            session?.cancel()
            session = s
        }
        begin()
        val thread = Thread({ s.run(request, accept, sse, policy, initialId, transport, onSse, onLine) }, "pyreon-stream")
        thread.isDaemon = true
        s.thread = thread
        thread.start()
    }

    private inner class Session {
        @Volatile var cancelled = false
        @Volatile var thread: Thread? = null
        @Volatile private var response: PyreonStreamResponse? = null
        private val wake = java.util.concurrent.CountDownLatch(1)

        fun live(): Boolean = !cancelled && session === this

        fun cancel() {
            cancelled = true
            response?.close()
            wake.countDown()
        }

        fun run(
            request: PyreonStreamRequest,
            accept: String,
            sse: Boolean,
            policy: PyreonStreamReconnect?,
            initialId: String?,
            transport: PyreonStreamTransport,
            onSse: ((PyreonSseMessage) -> E?)?,
            onLine: ((Int, String) -> E)?,
        ) {
            var lastId = initialId
            var delay = policy?.delay ?: 0L
            var attempt = 0
            var failures = 0
            while (true) {
                if (!live()) return
                if (attempt > 0) status.value = "reconnecting"
                var failure: Throwable? = null
                var ended = false
                try {
                    // The stream's own headers win (`streamHeaders` on the web).
                    val headers = LinkedHashMap<String, String>()
                    for ((k, v) in request.headers) {
                        val lk = k.lowercase()
                        if (lk != "accept" && lk != "last-event-id") headers[k] = v
                    }
                    headers["Accept"] = accept
                    val id = lastId
                    if (sse && !id.isNullOrEmpty()) headers["Last-Event-ID"] = id
                    val res = transport.open(request, headers)
                    response = res
                    if (!live()) { res.close(); return }
                    if (res.status !in 200..299) {
                        res.close()
                        throw PyreonStreamError.BadStatus(res.status)
                    }
                    val body = res.body
                    if (res.status == 204 || body == null) {
                        res.close()
                        ended = true
                    } else {
                        status.value = "open"
                        val splitter = PyreonStreamLineSplitter()
                        val parser = PyreonSseParser(lastId ?: "")
                        val lines = PyreonNdjsonLines()
                        val handle = { line: ByteArray ->
                            if (onSse != null) {
                                val msg = parser.line(line)
                                if (msg != null) {
                                    if (msg.id.isNotEmpty()) lastId = msg.id
                                    val r = msg.retry
                                    if (r != null && policy != null) delay = r
                                    val event = onSse(msg)
                                    if (event != null && live()) {
                                        failures = 0
                                        push(event)
                                    }
                                }
                            } else if (onLine != null) {
                                val hit = lines.line(line)
                                if (hit != null) {
                                    val event = onLine(hit.first, hit.second)
                                    if (live()) push(event)
                                }
                            }
                        }
                        val buf = ByteArray(8192)
                        try {
                            while (true) {
                                val read = body.read(buf)
                                if (read < 0) break
                                if (!live()) return
                                for (k in 0 until read) {
                                    val line = splitter.push(buf[k])
                                    if (line != null) handle(line)
                                }
                            }
                            // An unterminated SSE event is DISCARDED; an
                            // unterminated NDJSON line is still a value.
                            if (!sse) splitter.finish()?.let(handle)
                        } finally {
                            res.close()
                        }
                        ended = true
                    }
                } catch (e: Throwable) {
                    if (!live()) return
                    failure = e
                }
                if (ended && policy?.onEnd != true) {
                    if (live()) status.value = "closed"
                    return
                }
                if (failure != null) {
                    if (policy == null || !PyreonStreamPolicy.isRetryable(failure) || failures >= policy.attempts) {
                        if (live()) fail(failure)
                        return
                    }
                    failures++
                }
                val wait = PyreonStreamPolicy.wait(failure != null, delay, failures, policy?.maxDelay ?: 0L)
                attempt++
                if (live() && wait > 0) wake.await(wait, java.util.concurrent.TimeUnit.MILLISECONDS)
            }
        }
    }
}
