// End-to-end checks for PyreonOidcAuth against an in-process provider — Kotlin twin of
// PyreonOidcFlowTests.swift. The real core, client, key cache and verifier run; only the
// network and the browser are faked. The fake provider enforces PKCE S256 on the code
// exchange, binds the nonce to the code, and signs real ES256 ID tokens.

package com.pyreon.runtime

import java.net.URI
import java.net.URLDecoder
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.concurrent.Executor

private const val ISS = "https://idp.example"

private fun query(s: String): Map<String, String> = s.split("&").filter { it.contains("=") }.associate {
    val i = it.indexOf('=')
    URLDecoder.decode(it.substring(0, i), "UTF-8") to URLDecoder.decode(it.substring(i + 1), "UTF-8")
}

private fun b64(b: ByteArray) = PyreonPKCE.base64url(b)

/** Fixed-width big-endian encoding of a coordinate / signature half. */
private fun fixed(v: java.math.BigInteger): ByteArray {
    val raw = v.toByteArray().dropWhile { it == 0.toByte() }.toByteArray()
    return ByteArray(32 - raw.size) + raw
}

/** JDK DER ECDSA signature → JOSE raw r||s. */
private fun derToRaw(der: ByteArray): ByteArray {
    var o = 2
    fun int(): java.math.BigInteger {
        val len = der[o + 1].toInt()
        val v = java.math.BigInteger(1, der.copyOfRange(o + 2, o + 2 + len))
        o += 2 + len
        return v
    }
    val r = int()
    val s = int()
    return fixed(r) + fixed(s)
}

class FakeProvider : PyreonAuthTransport {
    var keys: KeyPair = newKey()
    var kid = "k1"
    var subject = "user-1"
    var nonceOverride: String? = null
    var rotateRefresh = false
    var refreshStatus = 200
    var jwksFetches = 0
    val requests = ArrayList<String>()
    private val codes = HashMap<String, Pair<String, String>>()
    private var refreshCount = 0

    companion object {
        fun newKey(): KeyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    }

    private fun ok(o: Any?) = PyreonAuthResponse(200, PyreonAuthJson.stringify(o))

    override fun send(request: PyreonAuthRequest): PyreonAuthResponse {
        requests.add(request.url)
        val url = request.url
        if (url.endsWith("/.well-known/openid-configuration")) {
            return ok(mapOf("issuer" to ISS, "authorization_endpoint" to "$ISS/auth", "token_endpoint" to "$ISS/token",
                "jwks_uri" to "$ISS/jwks", "end_session_endpoint" to "$ISS/logout"))
        }
        if (url.endsWith("/jwks")) {
            jwksFetches++
            val w = (keys.public as ECPublicKey).w
            return ok(mapOf("keys" to listOf(mapOf("kty" to "EC", "crv" to "P-256", "kid" to kid, "alg" to "ES256", "use" to "sig",
                "x" to b64(fixed(w.affineX)), "y" to b64(fixed(w.affineY))))))
        }
        val form = query(request.body ?: "")
        if (form["grant_type"] == "authorization_code") {
            val grant = codes.remove(form["code"])
            if (grant == null || PyreonPKCE.challengeS256(form["code_verifier"] ?: "") != grant.first) {
                return PyreonAuthResponse(400, """{"error":"invalid_grant"}""")
            }
            return ok(mapOf("access_token" to "at-0", "token_type" to "Bearer", "expires_in" to 3600.0, "refresh_token" to "rt-0",
                "id_token" to idToken(nonceOverride ?: grant.second)))
        }
        if (form["grant_type"] == "refresh_token") {
            if (refreshStatus != 200) return PyreonAuthResponse(refreshStatus)
            refreshCount++
            val t = linkedMapOf<String, Any?>("access_token" to "at-$refreshCount", "token_type" to "Bearer", "expires_in" to 3600.0,
                "id_token" to idToken(null))
            if (rotateRefresh) t["refresh_token"] = "rt-$refreshCount"
            return ok(t)
        }
        return PyreonAuthResponse(404)
    }

    /** The provider side of the redirect: record the PKCE challenge + nonce, issue a code. */
    fun authorize(url: String): String {
        val q = query(URI(url).rawQuery)
        val code = PyreonPKCE.randomToken(8)
        codes[code] = (q["code_challenge"] ?: "") to (q["nonce"] ?: "")
        return "${q["redirect_uri"]}?code=$code&state=${q["state"]}&iss=$ISS"
    }

    fun idToken(nonce: String?): String {
        val now = System.currentTimeMillis() / 1000
        val claims = linkedMapOf<String, Any?>("iss" to ISS, "aud" to "app", "sub" to subject, "email" to "a@example.com",
            "iat" to now.toDouble(), "exp" to (now + 300).toDouble())
        if (nonce != null) claims["nonce"] = nonce
        val h = b64(PyreonAuthJson.stringify(mapOf("alg" to "ES256", "kid" to kid)).toByteArray())
        val p = b64(PyreonAuthJson.stringify(claims).toByteArray())
        val der = Signature.getInstance("SHA256withECDSA").run {
            initSign(keys.private)
            update("$h.$p".toByteArray())
            sign()
        }
        return "$h.$p.${b64(derToRaw(der))}"
    }
}

class FakeBrowser(private val provider: FakeProvider) : PyreonAuthBrowser {
    val opened = ArrayList<String>()
    var cancel = false
    var beforeReturn: (() -> Unit)? = null

    override fun authorize(url: String, redirectUri: String): String {
        opened.add(url)
        if (cancel) throw PyreonAuthCancelled()
        beforeReturn?.invoke()
        if (URI(url).path == "/logout") return redirectUri
        return provider.authorize(url)
    }
}

class MemStore : PyreonSecureBackend {
    val entries = HashMap<String, String>()
    override fun write(key: String, value: String): Boolean { entries[key] = value; return true }
    override fun read(key: String): String? = entries[key]
    override fun remove(key: String): Boolean = entries.remove(key) != null
}

private val INLINE = Executor { it.run() }

private fun make(p: FakeProvider, s: MemStore, b: FakeBrowser) = PyreonOidcAuth(
    issuer = ISS, clientId = "app", redirectUri = "com.example.app:/oauth", postLogoutRedirectUri = "com.example.app:/bye",
    store = s, browser = b, transport = p, executor = INLINE,
)

fun testSignInRehydrateRefresh() {
    val p = FakeProvider()
    val store = MemStore()
    val b = FakeBrowser(p)
    val auth = make(p, store, b)
    check(auth.status.value == PyreonOidcStatus.SIGNED_OUT) { "starts signed out" }
    auth.signIn()
    check(auth.error.value == null) { "sign-in error: ${auth.error.value}" }
    check(auth.status.value == PyreonOidcStatus.SIGNED_IN && auth.isAuthenticated) { "signed in" }
    check(auth.subject.value == "user-1" && auth.claim("email") == "a@example.com") { "verified claims" }
    check(auth.accessToken.value == "at-0") { "access token" }
    check((auth.expiresAt.value ?: 0.0) > System.currentTimeMillis()) { "expiresAt in ms" }
    check(auth.status.value.toString() == "signedIn") { "status renders camelCase" }
    check(store.entries["pyreon.auth.session.app"] != null) { "session persisted" }
    check(store.entries.keys.none { it.startsWith("pyreon.auth.flow.") }) { "pending flow consumed" }

    // Rehydrate: a relaunch is signed in from the store, with no network at all.
    val before = p.requests.size
    val relaunched = make(p, store, b)
    check(relaunched.status.value == PyreonOidcStatus.SIGNED_IN && relaunched.subject.value == "user-1") { "rehydrated" }
    check(relaunched.claim("email") == "a@example.com" && relaunched.accessToken.value == "at-0") { "rehydrated tokens" }
    check(p.requests.size == before) { "rehydration makes no request" }

    auth.refresh()
    check(auth.status.value == PyreonOidcStatus.SIGNED_IN && auth.accessToken.value == "at-1") { "refreshed: ${auth.error.value}" }
    p.rotateRefresh = true
    auth.refresh()
    auth.refresh()
    check(auth.error.value == null && auth.accessToken.value == "at-3") { "rotated refresh used: ${auth.error.value}" }

    p.subject = "mallory"
    auth.refresh()
    check(auth.status.value == PyreonOidcStatus.ERROR && auth.error.value == "subject_changed") { "subject_changed: ${auth.error.value}" }
    check(auth.accessToken.value == null && auth.subject.value == null) { "session cleared" }
    check(store.entries["pyreon.auth.session.app"] == null) { "persisted session removed" }
}

fun testFailures() {
    val fresh = make(FakeProvider(), MemStore(), FakeBrowser(FakeProvider()))
    fresh.refresh()
    check(fresh.error.value == "no_refresh_token") { "no_refresh_token" }

    val refused = FakeProvider()
    val r = make(refused, MemStore(), FakeBrowser(refused))
    r.signIn()
    refused.refreshStatus = 400
    r.refresh()
    check(r.error.value == "token_exchange_failed" && r.status.value == PyreonOidcStatus.ERROR) { "refused refresh" }

    val wrong = FakeProvider().apply { nonceOverride = "someone-else" }
    val ws = MemStore()
    val w = make(wrong, ws, FakeBrowser(wrong))
    w.signIn()
    check(w.status.value == PyreonOidcStatus.ERROR && w.error.value == "bad_nonce") { "bad_nonce: ${w.error.value}" }
    check(ws.entries["pyreon.auth.session.app"] == null && w.accessToken.value == null) { "nothing stored on failure" }

    // A transport failure is network_error — the code the web and iOS report too.
    val down = PyreonOidcAuth(
        issuer = ISS, clientId = "app", redirectUri = "com.example.app:/oauth", store = MemStore(),
        browser = FakeBrowser(FakeProvider()), transport = { throw java.io.IOException("no route to host") }, executor = INLINE,
    )
    down.signIn()
    check(down.status.value == PyreonOidcStatus.ERROR && down.error.value == "network_error") { "network_error: ${down.error.value}" }

    val cp = FakeProvider()
    val cb = FakeBrowser(cp).apply { cancel = true }
    val c = make(cp, MemStore(), cb)
    c.signIn()
    check(c.status.value == PyreonOidcStatus.SIGNED_OUT && c.error.value == "cancelled") { "cancelled: ${c.status.value} ${c.error.value}" }
}

fun testLateResultAndLogout() {
    val lp = FakeProvider()
    val lb = FakeBrowser(lp)
    val ls = MemStore()
    val late = make(lp, ls, lb)
    lb.beforeReturn = { late.signOut() }
    late.signIn()
    check(late.status.value == PyreonOidcStatus.SIGNED_OUT && late.accessToken.value == null) { "late result discarded: ${late.status.value}" }
    check(ls.entries["pyreon.auth.session.app"] == null) { "late result not persisted" }
    check(lp.requests.none { it.endsWith("/token") }) { "no token exchange after signOut" }

    val op = FakeProvider()
    val ob = FakeBrowser(op)
    val o = make(op, MemStore(), ob)
    o.signIn()
    o.signOut(endProviderSession = true)
    val logout = URI(ob.opened.last())
    check(logout.path == "/logout") { "provider logout opened" }
    val q = query(logout.rawQuery)
    check((q["id_token_hint"] ?: "").split(".").size == 3) { "id_token_hint sent" }
    check(q["post_logout_redirect_uri"] == "com.example.app:/bye" && q["client_id"] == "app") { "logout params" }
    check(o.status.value == PyreonOidcStatus.SIGNED_OUT && o.accessToken.value == null) { "signed out locally" }
}

fun testRehydrationGuards() {
    val b = FakeBrowser(FakeProvider())
    val es = MemStore()
    es.entries["pyreon.auth.session.app"] = """{"issuer":"https://idp.example","accessToken":"x","expiresAt":1,"claims":{"sub":"u"}}"""
    val expired = make(FakeProvider(), es, b)
    check(expired.status.value == PyreonOidcStatus.SIGNED_OUT && es.entries.isEmpty()) { "expired session dropped" }
    es.entries["pyreon.auth.session.app"] = """{"issuer":"https://evil.example","accessToken":"x","claims":{"sub":"u"}}"""
    val foreign = make(FakeProvider(), es, b)
    check(foreign.status.value == PyreonOidcStatus.SIGNED_OUT && es.entries.isEmpty()) { "foreign-issuer session dropped" }
}

fun testKeyRotation() {
    val kp = FakeProvider()
    var t = 1_000_000L
    val meta = PyreonOidcClient.discover(ISS, kp)
    val cache = PyreonJwksCache(meta, kp, minRefreshMs = 60_000, clock = { t })
    cache.keys("k1")
    kp.kid = "k2"
    cache.keys("k2")
    check(kp.jwksFetches == 1) { "unknown kid inside the throttle does not re-fetch" }
    t += 60_000
    val rotated = cache.keys("k2")
    check(kp.jwksFetches == 2 && rotated.first()["kid"] == "k2") { "rotation re-fetch" }
    cache.keys(null)
    check(kp.jwksFetches == 2) { "cached set served" }
}

/** The default transport against a real HTTP server: a round trip, and a redirect REFUSED. */
fun testUrlConnectionTransport() {
    val server = com.sun.net.httpserver.HttpServer.create(java.net.InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/token") { ex ->
        val got = ex.requestBody.readBytes().toString(Charsets.UTF_8)
        val reply = "${ex.requestMethod} $got".toByteArray()
        ex.sendResponseHeaders(200, reply.size.toLong())
        ex.responseBody.use { it.write(reply) }
    }
    server.createContext("/moved") { ex ->
        ex.responseHeaders.add("Location", "/token")
        ex.sendResponseHeaders(302, -1)
        ex.close()
    }
    server.start()
    try {
        val base = "http://127.0.0.1:${server.address.port}"
        val r = PyreonUrlConnectionAuthTransport.send(PyreonAuthRequest.post("$base/token", "a=1"))
        check(r.status == 200 && r.body == "POST a=1") { "round trip: ${r.status} ${r.body}" }
        val moved = PyreonUrlConnectionAuthTransport.send(PyreonAuthRequest.post("$base/moved", "a=1"))
        check(moved.status == 302) { "redirect refused, not followed (got ${moved.status})" }
    } finally {
        server.stop(0)
    }
}

fun main() {
    testUrlConnectionTransport()
    testSignInRehydrateRefresh()
    testFailures()
    testLateResultAndLogout()
    testRehydrationGuards()
    testKeyRotation()
    println("[PyreonOidcAuthTest] all smoke tests passed")
}
