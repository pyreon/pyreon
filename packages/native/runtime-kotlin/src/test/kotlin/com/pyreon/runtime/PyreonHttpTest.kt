// Smoke tests for PyreonHttp — the richer-request layer. Dependency-free
// `check(...)` harness; runs via `verify-kotlin.ts --service=PyreonHttp`.
//
// Scope: the PURE request builders + response helpers + executor routing.
// The real OkHttp executor is the app's / Android-CI's responsibility.

package com.pyreon.runtime

fun testHttpGetBuilder() {
    val r = PyreonHttpRequest.get("https://api/x", mapOf("Accept" to "application/json"))
    check(r.method == PyreonHttpMethod.GET) { "get() → GET" }
    check(r.url == "https://api/x") { "url set" }
    check(r.headers["Accept"] == "application/json") { "headers set" }
    check(r.body == null) { "get() has no body" }
    check(r.method.verb == "GET") { "verb wire string" }
}

fun testHttpPostBuilder() {
    val r = PyreonHttpRequest.post("https://api/x", body = "raw")
    check(r.method == PyreonHttpMethod.POST) { "post() → POST" }
    check(r.body == "raw") { "post() body set" }
}

fun testHttpPostJsonSetsContentType() {
    val r = PyreonHttpRequest.postJson("https://api/x", jsonBody = "{\"a\":1}")
    check(r.method == PyreonHttpMethod.POST) { "postJson() → POST" }
    check(r.body == "{\"a\":1}") { "postJson() body set" }
    check(r.headers["Content-Type"] == "application/json") { "postJson sets Content-Type" }
}

fun testHttpPostJsonHonorsExistingContentType() {
    // Case-insensitive: an existing content-type header is NOT overwritten.
    val r = PyreonHttpRequest.postJson(
        "https://api/x",
        jsonBody = "{}",
        headers = mapOf("content-type" to "application/vnd.api+json"),
    )
    check(r.headers["content-type"] == "application/vnd.api+json") {
        "existing content-type preserved"
    }
    check(!r.headers.containsKey("Content-Type")) {
        "no duplicate Content-Type added when one exists (case-insensitive)"
    }
}

fun testHttpResponseIsOk() {
    check(PyreonHttpResponse(200).isOk) { "200 is ok" }
    check(PyreonHttpResponse(204).isOk) { "204 is ok" }
    check(PyreonHttpResponse(299).isOk) { "299 is ok" }
    check(!PyreonHttpResponse(199).isOk) { "199 not ok" }
    check(!PyreonHttpResponse(300).isOk) { "300 not ok" }
    check(!PyreonHttpResponse(404).isOk) { "404 not ok" }
    check(!PyreonHttpResponse(500).isOk) { "500 not ok" }
}

fun testHttpResponseBody() {
    val res = PyreonHttpResponse(200, mapOf("X-Trace" to "abc"), "hello")
    check(res.body == "hello") { "body carried" }
    check(res.headers["X-Trace"] == "abc") { "response headers carried" }
}

/**
 * The injected executor routes a request → response. Pins the pluggable-
 * executor contract: a `useFetch` emit calling `executor.send(req)` gets
 * exactly the app's OkHttp result.
 */
fun testHttpExecutorRoutes() {
    var received: PyreonHttpRequest? = null
    val executor = object : PyreonHttpExecutor {
        override fun send(request: PyreonHttpRequest): PyreonHttpResponse {
            received = request
            return PyreonHttpResponse(201, body = "created")
        }
    }
    val req = PyreonHttpRequest.postJson("https://api/users", "{\"name\":\"x\"}")
    val res = executor.send(req)
    check(received === req) { "executor received the exact request" }
    check(res.status == 201) { "executor returned the response" }
    check(res.body == "created") { "response body routed" }
}

/**
 * How `PyreonHttp.send` picks an executor: installed, then the caller's
 * fallback, then a loud `NoExecutor`. The generated code passes the OkHttp
 * executor as the fallback, so before this a scaffolded app (which installs
 * nothing) threw `NoExecutor` on every request with a verb, a header or a body.
 *
 * Runs BEFORE anything is installed, since `install` is process-wide.
 */
fun testHttpSendResolvesFallbackThenInstalled() {
    fun executor(status: Int) = object : PyreonHttpExecutor {
        override fun send(request: PyreonHttpRequest): PyreonHttpResponse = PyreonHttpResponse(status)
    }
    val req = PyreonHttpRequest.get("https://api/x")

    var threw = false
    try {
        PyreonHttp.send(req)
    } catch (_: PyreonHttpError.NoExecutor) {
        threw = true
    }
    check(threw) { "nothing installed and no fallback → NoExecutor, not a silent no-op" }

    check(PyreonHttp.send(req, fallback = executor(201)).status == 201) {
        "nothing installed → the caller's fallback is used"
    }

    PyreonHttp.install(executor(202))
    check(PyreonHttp.send(req, fallback = executor(201)).status == 202) {
        "an installed executor wins over the fallback"
    }
    check(PyreonHttp.send(req).status == 202) { "an installed executor serves calls with no fallback" }
}

// NOTE: the PyreonHttp ⇄ PyreonFetch composition (an executor result feeding
// the fetcher's load path — the shape the useFetch emit produces) is NOT
// tested here: `verify-kotlin.ts` compiles ONE service file at a time, so
// PyreonFetch isn't on the classpath in this service's verify run. The Swift
// side has the same single-service boundary. The composition is covered by
// the (future) useFetch emit's end-to-end device gate.

/** `call` hands the executor the request as built, and REJECTS a non-2xx (the web's `throwHttpErrors` default). */
fun testHttpCallRejectsNon2xx() {
    val seen = ArrayList<PyreonHttpRequest>()
    val exec = object : PyreonHttpExecutor {
        override fun send(request: PyreonHttpRequest): PyreonHttpResponse {
            seen.add(request)
            return PyreonHttpResponse(if (request.url.endsWith("/ok")) 201 else 500)
        }
    }
    val ok = PyreonHttp.call(PyreonHttpRequest(PyreonHttpMethod.POST, "https://h/ok", body = "{}"), fallback = exec)
    check(ok.status == 201) { "a 2xx resolves" }
    var threw: PyreonHttpError? = null
    try {
        PyreonHttp.call(PyreonHttpRequest(PyreonHttpMethod.POST, "https://h/bad"), fallback = exec)
    } catch (e: PyreonHttpError.BadStatus) {
        threw = e
    }
    check((threw as? PyreonHttpError.BadStatus)?.status == 500) { "a 500 throws BadStatus(500)" }
    check(seen.size == 2 && seen[0].body == "{}") { "the request reaches the executor unchanged" }
}

/** The runtime query builder — byte parity with the web is asserted by the compiler's executed differential test. */
fun testUrlQuery() {
    check(PyreonURL.query("?", "q", "a b", "page", 2L, "n", 1.5, "skip", null) == "?q=a+b&page=2&n=1.5") {
        "form-encoded, JS number text, a null pair dropped"
    }
    check(PyreonURL.query("&", "tag", listOf("x", null, "y")) == "&tag=x&tag=y") { "a list repeats its key" }
    check(PyreonURL.query("?", "a", null) == "") { "every pair dropped -> no `?`" }
    check(PyreonURL.query("?", "w", 7.0, "e", 1e21, "ninf", Double.NEGATIVE_INFINITY) == "?w=7&e=1e%2B21&ninf=-Infinity") {
        "whole double, exponent form, non-finite"
    }
}

/**
 * A picked file streams from disk: `from` reads only its name, type and length, the multipart writer copies it past
 * one read buffer intact, and the length it STATES matches the bytes it writes (OkHttp sends that as Content-Length).
 * Byte parity with the web's FormData is asserted by the compiler's executed differential test.
 */
fun testUploadFileStreamsIntoMultipart() {
    val bytes = ByteArray(200_003) { ((it * 31 + 7) and 0xff).toByte() }
    val tmp = java.io.File.createTempFile("pyreon-upload-", ".jpg")
    try {
        tmp.writeBytes(bytes)
        val file = PyreonUploadFiles.from(tmp.toURI().toString())
        check(file.name == tmp.name && file.type == "image/jpeg" && file.length == bytes.size.toLong()) {
            "name, type and length come from the file: ${file.name} ${file.type} ${file.length}"
        }
        val body = PyreonMultipartBody("avatar", file, "caption", "a\nb", "tag", listOf("x", null, "y"))
        val out = java.io.ByteArrayOutputStream()
        body.writeTo(out, "B")
        val written = out.toByteArray()
        check(body.contentLength("B") == written.size.toLong()) { "the stated length is the written length" }
        val text = String(written, Charsets.ISO_8859_1)
        val start = text.indexOf("\r\n\r\n") + 4
        val sent = written.copyOfRange(start, start + bytes.size)
        check(sent.contentEquals(bytes)) { "the file arrives byte for byte" }
        check(text.contains("name=\"caption\"\r\n\r\na\r\nb\r\n")) { "a text value is newline-normalized" }
        check(text.split("name=\"tag\"").size == 3) { "a list field repeats its part, its null dropped" }
        check(text.endsWith("--B--\r\n")) { "the closing delimiter" }

        val unknown = PyreonUploadFile("u.bin", "", null) { java.io.ByteArrayInputStream(byteArrayOf(1, 2)) }
        check(PyreonMultipartBody("f", unknown).contentLength("B") == null) { "an unknown file size is sent chunked" }
    } finally {
        tmp.delete()
    }
}

/** A URI that names no readable file rejects, as `fileFromUri` does on the web; `content://` needs the Android overload. */
fun testUploadFileRejectsUnreadable() {
    for (uri in listOf("file:///definitely/not/here.png", "content://media/1", "https://x/y.png")) {
        var threw = false
        try {
            PyreonUploadFiles.from(uri)
        } catch (_: PyreonHttpError.UnreadableFile) {
            threw = true
        }
        check(threw) { "$uri must throw UnreadableFile" }
    }
}

/** The upload rides on the request to the executor, built where the call is made. */
fun testUploadReachesTheExecutor() {
    var seen: PyreonHttpRequest? = null
    val exec = object : PyreonHttpExecutor {
        override fun send(request: PyreonHttpRequest): PyreonHttpResponse {
            seen = request
            return PyreonHttpResponse(200)
        }
    }
    val file = PyreonUploadFiles.from("data:text/plain;base64,aGk=")
    PyreonHttp.call(PyreonHttpRequest(PyreonHttpMethod.PUT, "https://h/blob", upload = PyreonHttpUpload.File(file)), fallback = exec)
    val up = seen?.upload as? PyreonHttpUpload.File
    check(up != null && up.file.name == "blob" && up.file.type == "text/plain") { "a raw file body: $up" }
}

fun main() {
    testUploadFileStreamsIntoMultipart()
    testUploadFileRejectsUnreadable()
    testUploadReachesTheExecutor()
    testHttpCallRejectsNon2xx()
    testUrlQuery()
    testHttpGetBuilder()
    testHttpPostBuilder()
    testHttpPostJsonSetsContentType()
    testHttpPostJsonHonorsExistingContentType()
    testHttpResponseIsOk()
    testHttpResponseBody()
    testHttpExecutorRoutes()
    testHttpSendResolvesFallbackThenInstalled()
    println("[PyreonHttpTest] all smoke tests passed")
}
