// Smoke tests for PyreonStream — wire parsers, backoff, and the connection
// loop over a scripted transport. The Kotlin twin of PyreonStreamTests.swift;
// runs via `verify-kotlin.ts --service=PyreonStream`.
//
// Byte-for-byte agreement with the WEB parser is proven by execution in
// @pyreon/native-compiler's native-stream-parser-parity test.

package com.pyreon.runtime

private fun sse(vararg chunks: String): List<PyreonSseMessage> {
    val splitter = PyreonStreamLineSplitter()
    val parser = PyreonSseParser()
    val out = ArrayList<PyreonSseMessage>()
    for (c in chunks) {
        for (b in c.toByteArray(Charsets.UTF_8)) {
            val line = splitter.push(b) ?: continue
            parser.line(line)?.let { out.add(it) }
        }
    }
    return out
}

fun testGrammar() {
    check(sse("event: tick\ndata: a\ndata: b\n\n") == listOf(PyreonSseMessage("tick", "a\nb", "", null))) { "multi-line data" }
    check(sse(": keep-alive\n\ndata: x\n\n").map { it.type } == listOf("message")) { "comment + default type" }
    check(sse("data: one\r", "\n\r", "\ndata: two\r\n\r\n").map { it.data } == listOf("one", "two")) { "split CRLF" }
    check(sse("﻿data: x\n\n").map { it.data } == listOf("x")) { "BOM stripped" }
    check(sse("﻿﻿data: x\n\n").isEmpty()) { "a second BOM is content" }
    val ids = sse("id: 1\ndata: a\n\ndata: b\n\nid: 2\u0000x\ndata: c\n\nid\ndata: d\n\n").map { it.id }
    check(ids == listOf("1", "1", "1", "")) { "id semantics: $ids" }
    val retries = sse("retry: 1x\ndata: a\n\nretry: 250\n\ndata: b\n\n").map { it.retry }
    check(retries == listOf(null, 250L)) { "retry semantics: $retries" }
    check(sse("data\ndata:  two spaces\nfoo: bar\n\n").map { it.data } == listOf("\n two spaces")) { "space + no-colon" }
    check(sse("event: x\n\ndata: done\n\ndata: partial").map { it.data } == listOf("done")) { "unterminated discarded" }
    check(sse("data: héllo 🙂\n\n").map { it.data } == listOf("héllo 🙂")) { "multi-byte" }
}

fun testDecoder() {
    check(pyreonStreamDecode("héllo 🙂".toByteArray(Charsets.UTF_8)) == "héllo 🙂") { "valid utf-8" }
    // Maximal subparts: a truncated 3-byte sequence is ONE replacement; a lone
    // continuation byte is one; the byte that broke a sequence starts the next.
    val bad = byteArrayOf(0xE2.toByte(), 0x82.toByte(), 0x41, 0x80.toByte(), 0xF0.toByte(), 0x9F.toByte())
    check(pyreonStreamDecode(bad) == "�A��") { "replacement: ${pyreonStreamDecode(bad)}" }
}

fun testNdjsonLines() {
    val splitter = PyreonStreamLineSplitter()
    val lines = PyreonNdjsonLines()
    val got = ArrayList<String>()
    for (b in "{\"a\":1}\n\n  \n{\"a\":2}\n{\"a\":3}".toByteArray(Charsets.UTF_8)) {
        val l = splitter.push(b) ?: continue
        lines.line(l)?.let { got.add("${it.first}:${it.second}") }
    }
    splitter.finish()?.let { t -> lines.line(t)?.let { got.add("${it.first}:${it.second}") } }
    check(got == listOf("1:{\"a\":1}", "4:{\"a\":2}", "5:{\"a\":3}")) { "ndjson lines: $got" }
}

fun testPolicy() {
    check(PyreonStreamPolicy.isRetryable(java.io.IOException("reset"))) { "network retries" }
    check(PyreonStreamPolicy.isRetryable(PyreonStreamError.BadStatus(503))) { "5xx retries" }
    check(PyreonStreamPolicy.isRetryable(PyreonStreamError.BadStatus(429))) { "429 retries" }
    check(!PyreonStreamPolicy.isRetryable(PyreonStreamError.BadStatus(401))) { "401 does not" }
    check(!PyreonStreamPolicy.isRetryable(PyreonStreamError.Decode("x", null))) { "decode does not" }
    check(PyreonStreamPolicy.wait(true, 1000, 1, 30_000) == 1000L) { "1st" }
    check(PyreonStreamPolicy.wait(true, 1000, 3, 30_000) == 4000L) { "3rd" }
    check(PyreonStreamPolicy.wait(true, 1000, 9, 30_000) == 30_000L) { "capped" }
    check(PyreonStreamPolicy.wait(false, 250, 4, 100) == 250L) { "clean end" }
}

/** A transport that replays scripted responses and records request headers. */
private class Scripted(private val script: List<Pair<Int, String?>>) : PyreonStreamTransport {
    val seen = ArrayList<Map<String, String>>()
    override fun open(request: PyreonStreamRequest, headers: Map<String, String>): PyreonStreamResponse {
        synchronized(seen) { seen.add(headers) }
        val (status, text) = script[minOf(seen.size - 1, script.size - 1)]
        if (text == null) throw java.io.IOException("connection refused")
        return PyreonStreamResponse(status, java.io.ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)))
    }
}

private fun <E> awaitStatus(s: PyreonStream<E>, vararg done: String) {
    val deadline = System.currentTimeMillis() + 10_000
    while (s.status.value !in done) {
        check(System.currentTimeMillis() < deadline) { "timed out waiting for ${done.toList()}; status=${s.status.value}" }
        Thread.sleep(5)
    }
}

fun testLoopReconnectsWithLastEventId() {
    // Connection 1 delivers id 1 then drops (network error on reconnect 1),
    // connection 3 resumes and ends cleanly.
    val t = Scripted(
        listOf(
            200 to "id: 1\nretry: 5\ndata: {\"n\":1}\n\n",
            0 to null,
            200 to "id: 2\ndata: {\"n\":2}\n\n",
            // A terminal status ends the run deterministically.
            401 to "",
        ),
    )
    val s = PyreonStream<PyreonSseEvent<String>>()
    // onEnd so the clean end of connection 1 reconnects, as EventSource does.
    s.startSse(
        PyreonStreamRequest(url = "http://x/events", headers = mapOf("Authorization" to "Bearer t", "accept" to "ignored")),
        PyreonSseOptions(reconnect = PyreonStreamReconnect(attempts = 3, delay = 5, maxDelay = 50, onEnd = true)),
        transport = t,
    ) { PyreonSseEvent(it.type, it.data, it.id) }
    awaitStatus(s, "error")
    check((s.error.value as? PyreonStreamError.BadStatus)?.status == 401) { "ended on the scripted 401: ${s.error.value}" }
    check(s.events.value.map { it.id } == listOf("1", "2")) { "events: ${s.events.value}" }
    val first = synchronized(t.seen) { t.seen[0] }
    val later = synchronized(t.seen) { t.seen[2] }
    check(synchronized(t.seen) { t.seen[1] }["Last-Event-ID"] == "1") { "the retry after a failure resumes too" }
    check(first["Accept"] == "text/event-stream") { "accept header: $first" }
    check(first["Authorization"] == "Bearer t") { "caller headers kept: $first" }
    check(!first.containsKey("accept")) { "the stream's accept wins: $first" }
    check(!first.containsKey("Last-Event-ID")) { "no id on the first request" }
    check(later["Last-Event-ID"] == "1") { "resumes with the last id: $later" }
}

fun testLoopGivesUpOnNonRetryable() {
    val t = Scripted(listOf(401 to ""))
    val s = PyreonStream<PyreonSseEvent<String>>()
    s.startSse(PyreonStreamRequest(url = "http://x"), PyreonSseOptions(), transport = t) { PyreonSseEvent(it.type, it.data, it.id) }
    awaitStatus(s, "error")
    val e = s.error.value
    check(e is PyreonStreamError.BadStatus && e.status == 401) { "401 is terminal: $e" }
    check(t.seen.size == 1) { "no retry on 401: ${t.seen.size}" }
}

fun testNdjsonLoop() {
    val t = Scripted(listOf(200 to "1\n\n2\n3"))
    val s = PyreonStream<Int>()
    s.startNdjson(PyreonStreamRequest(url = "http://x"), transport = t) { it.trim().toInt() }
    awaitStatus(s, "closed", "error")
    check(s.status.value == "closed") { "closed: ${s.error.value}" }
    check(s.events.value == listOf(1, 2, 3)) { "values incl. the unterminated tail: ${s.events.value}" }
    check(t.seen[0]["Accept"] == "application/x-ndjson") { "ndjson accept" }

    val bad = PyreonStream<Int>()
    bad.startNdjson(PyreonStreamRequest(url = "http://x"), transport = Scripted(listOf(200 to "1\nnope\n"))) { it.trim().toInt() }
    awaitStatus(bad, "error")
    val e = bad.error.value
    check(e is PyreonStreamError.Parse && e.line == 2) { "parse error names the line: $e" }
    check(bad.events.value == listOf(1)) { "values before the bad line stay" }
}

fun testContainer() {
    val s = PyreonStream<Int>(maxEvents = 2)
    check(s.status.value == "idle") { "starts idle" }
    s.begin()
    s.push(1); s.push(2); s.push(3)
    check(s.events.value == listOf(2, 3)) { "bounded: ${s.events.value}" }
    check(s.latest.value == 3 && s.status.value == "open") { "latest + open" }
    s.abort()
    check(s.status.value == "closed") { "abort closes" }
    s.startNdjson(PyreonStreamRequest(url = "http://x"), transport = Scripted(listOf(200 to "9\n"))) { it.toInt() }
    Thread.sleep(50)
    check(s.status.value == "closed") { "an aborted stream does not start again until restart()" }
    val tick = s.restartTick.value
    s.restart()
    check(s.restartTick.value == tick + 1) { "restart bumps the effect key" }
}

/** `onEvent` runs once per event that lands, after the state write, in order. */
fun testOnEvent() {
    val seen = java.util.Collections.synchronizedList(ArrayList<String>())
    val s = PyreonStream<Int>()
    s.startNdjson(
        PyreonStreamRequest(url = "http://x"),
        transport = Scripted(listOf(200 to "1\n2\n3\n")),
        onEvent = { v -> seen.add("$v:${s.events.value.size}") },
    ) { it.trim().toInt() }
    awaitStatus(s, "closed", "error")
    // The size read inside the callback proves the push happened FIRST.
    check(seen == listOf("1:1", "2:2", "3:3")) { "onEvent per event, after the push: $seen" }
}

/** `enabled` → false: stop, read `idle`, keep what was received. */
fun testIdle() {
    val s = PyreonStream<Int>()
    s.begin()
    s.push(4)
    s.idle()
    check(s.status.value == "idle") { "idle reads idle: ${s.status.value}" }
    check(s.events.value == listOf(4)) { "idle keeps the events: ${s.events.value}" }
    s.abort()
    s.idle()
    check(s.status.value == "closed") { "idle after abort is a no-op, like the web effect" }
}

/** An executor that only QUEUES — the test drains it, standing in for a main looper. */
private class Queued : java.util.concurrent.Executor {
    val queue = java.util.concurrent.LinkedBlockingQueue<Runnable>()
    override fun execute(command: Runnable) { queue.add(command) }
    fun awaitSize(n: Int) {
        val deadline = System.currentTimeMillis() + 10_000
        while (queue.size < n) {
            check(System.currentTimeMillis() < deadline) { "timed out: ${queue.size} of $n posts queued" }
            Thread.sleep(5)
        }
    }
    fun drain() { while (true) (queue.poll() ?: return).run() }
}

/**
 * Nothing observable happens on the reader thread: every state write and every
 * `onEvent` call waits for the `main` executor, in wire order. On Android that
 * executor is the main looper, which is where the web runs the whole hook.
 */
fun testObservableWorkRunsOnMain() {
    val main = Queued()
    val seen = ArrayList<String>()
    val s = PyreonStream<Int>(main = main)
    s.startNdjson(
        PyreonStreamRequest(url = "http://x"),
        transport = Scripted(listOf(200 to "1\n2\n3\n")),
        onEvent = { v -> seen.add("$v:${s.events.value.size}:${Thread.currentThread().name}") },
    ) { it.trim().toInt() }
    // open, three push+onEvent blocks, closed.
    main.awaitSize(5)
    check(s.status.value == "connecting" && s.events.value.isEmpty() && seen.isEmpty()) {
        "the reader thread wrote state directly: ${s.status.value} ${s.events.value} $seen"
    }
    main.drain()
    check(s.status.value == "closed") { "closed once drained: ${s.status.value}" }
    check(s.events.value == listOf(1, 2, 3)) { "events once drained: ${s.events.value}" }
    val me = Thread.currentThread().name
    check(seen == listOf("1:1:$me", "2:2:$me", "3:3:$me")) { "onEvent on the draining thread, after its push: $seen" }

    // A stop() between the post and its execution wins: queued writes are dropped.
    val later = Queued()
    val t = PyreonStream<Int>(main = later)
    t.startNdjson(PyreonStreamRequest(url = "http://x"), transport = Scripted(listOf(200 to "7\n"))) { it.trim().toInt() }
    later.awaitSize(3)
    t.stop()
    later.drain()
    check(t.events.value.isEmpty() && t.status.value == "connecting") {
        "writes queued before stop() landed after it: ${t.status.value} ${t.events.value}"
    }
}

fun main() {
    testGrammar()
    testDecoder()
    testNdjsonLines()
    testPolicy()
    testLoopReconnectsWithLastEventId()
    testLoopGivesUpOnNonRetryable()
    testNdjsonLoop()
    testContainer()
    testOnEvent()
    testIdle()
    testObservableWorkRunsOnMain()
    println("[PyreonStreamTest] all checks passed")
}
