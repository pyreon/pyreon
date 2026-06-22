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

// NOTE: the PyreonHttp ⇄ PyreonFetch composition (an executor result feeding
// the fetcher's load path — the shape the useFetch emit produces) is NOT
// tested here: `verify-kotlin.ts` compiles ONE service file at a time, so
// PyreonFetch isn't on the classpath in this service's verify run. The Swift
// side has the same single-service boundary. The composition is covered by
// the (future) useFetch emit's end-to-end device gate.

fun main() {
    testHttpGetBuilder()
    testHttpPostBuilder()
    testHttpPostJsonSetsContentType()
    testHttpPostJsonHonorsExistingContentType()
    testHttpResponseIsOk()
    testHttpResponseBody()
    testHttpExecutorRoutes()
    println("[PyreonHttpTest] all smoke tests passed")
}
