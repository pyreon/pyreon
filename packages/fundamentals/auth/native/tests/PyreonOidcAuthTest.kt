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
    var advertiseIss = false
    /** Issue a fresh refresh token per sign-in, as a real provider does. */
    var uniqueRefreshTokens = false
    private var codeCount = 0
    var rotateRefresh = false
    var refreshStatus = 200
    @Volatile var refreshDelayMs = 0L
    var jwksStatus = 200
    /** Advertise an RFC 7009 revocation_endpoint answering with this status. */
    var revocationStatus: Int? = null
    val revoked = ArrayList<Map<String, String>>()
    /** Runs while a token request is in flight, with its grant type (a sign-out racing it). */
    var duringToken: ((String) -> Unit)? = null
    val presentedRefreshTokens = ArrayList<String>()
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
            val m = linkedMapOf<String, Any?>("issuer" to ISS, "authorization_endpoint" to "$ISS/auth", "token_endpoint" to "$ISS/token",
                "jwks_uri" to "$ISS/jwks", "end_session_endpoint" to "$ISS/logout")
            if (advertiseIss) m["authorization_response_iss_parameter_supported"] = true
            if (revocationStatus != null) m["revocation_endpoint"] = "$ISS/revoke"
            return ok(m)
        }
        if (url.endsWith("/revoke")) {
            revoked.add(query(request.body ?: ""))
            return PyreonAuthResponse(revocationStatus ?: 404)
        }
        if (url.endsWith("/jwks")) {
            if (jwksStatus != 200) return PyreonAuthResponse(jwksStatus)
            jwksFetches++
            val w = (keys.public as ECPublicKey).w
            return ok(mapOf("keys" to listOf(mapOf("kty" to "EC", "crv" to "P-256", "kid" to kid, "alg" to "ES256", "use" to "sig",
                "x" to b64(fixed(w.affineX)), "y" to b64(fixed(w.affineY))))))
        }
        val form = query(request.body ?: "")
        form["grant_type"]?.let { g -> duringToken?.let { duringToken = null; it(g) } }
        if (form["grant_type"] == "authorization_code") {
            val grant = codes.remove(form["code"])
            if (grant == null || PyreonPKCE.challengeS256(form["code_verifier"] ?: "") != grant.first) {
                return PyreonAuthResponse(400, """{"error":"invalid_grant"}""")
            }
            return ok(mapOf("access_token" to "at-0", "token_type" to "Bearer", "expires_in" to 3600.0, "refresh_token" to (if (uniqueRefreshTokens) "rt-c${++codeCount}" else "rt-0"),
                "id_token" to idToken(nonceOverride ?: grant.second)))
        }
        if (form["grant_type"] == "refresh_token") {
            presentedRefreshTokens.add(form["refresh_token"] ?: "")
            if (refreshStatus != 200) return PyreonAuthResponse(refreshStatus)
            if (refreshDelayMs > 0) Thread.sleep(refreshDelayMs)
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
    /** Rewrite the callback (e.g. drop `iss`, as a provider that does not send it would). */
    var rewrite: ((String) -> String)? = null

    override fun authorize(url: String, redirectUri: String): String {
        opened.add(url)
        if (cancel) throw PyreonAuthCancelled()
        beforeReturn?.invoke()
        if (URI(url).path == "/logout") return redirectUri
        val back = provider.authorize(url)
        return rewrite?.invoke(back) ?: back
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
    check(store.entries["pyreon.auth.session.app|https://idp.example"] != null) { "session persisted" }
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
    check(store.entries["pyreon.auth.session.app|https://idp.example"] == null) { "persisted session removed" }
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
    check(ws.entries["pyreon.auth.session.app|https://idp.example"] == null && w.accessToken.value == null) { "nothing stored on failure" }

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
    check(ls.entries["pyreon.auth.session.app|https://idp.example"] == null) { "late result not persisted" }
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

    // After a relaunch the session is restored without discovery; provider logout still happens.
    val rp = FakeProvider()
    val rb = FakeBrowser(rp)
    val rs = MemStore()
    make(rp, rs, rb).signIn()
    val restored = make(rp, rs, rb)
    val openedBefore = rb.opened.size
    restored.signOut(endProviderSession = true)
    check(rb.opened.size == openedBefore + 1 && URI(rb.opened.last()).path == "/logout") { "provider logout opened after a relaunch" }
}

fun testRehydrationGuards() {
    val b = FakeBrowser(FakeProvider())
    val es = MemStore()
    es.entries["pyreon.auth.session.app|https://idp.example"] = """{"issuer":"https://idp.example","accessToken":"x","expiresAt":1,"claims":{"sub":"u"}}"""
    val expired = make(FakeProvider(), es, b)
    check(expired.status.value == PyreonOidcStatus.SIGNED_OUT && es.entries.isEmpty()) { "expired session dropped" }
    es.entries["pyreon.auth.session.app|https://idp.example"] = """{"issuer":"https://evil.example","accessToken":"x","claims":{"sub":"u"}}"""
    val foreign = make(FakeProvider(), es, b)
    check(foreign.status.value == PyreonOidcStatus.SIGNED_OUT && es.entries.isEmpty()) { "foreign-issuer session dropped" }
}

fun testConcurrentRefreshSharesOneRequest() {
    val p = FakeProvider()
    p.rotateRefresh = true
    p.refreshDelayMs = 300
    val auth = make(p, MemStore(), FakeBrowser(p))
    auth.signIn()
    val before = p.requests.count { it.endsWith("/token") }
    val threads = List(3) { Thread { auth.refreshNow() } }
    threads.forEach { it.start() }
    threads.forEach { it.join() }
    check(p.requests.count { it.endsWith("/token") } == before + 1) { "concurrent refreshes share one request" }
    check(auth.status.value == PyreonOidcStatus.SIGNED_IN && auth.accessToken.value == "at-1") { "refreshed once: ${auth.error.value}" }
}

fun testSessionKeyedByIssuer() {
    val p = FakeProvider()
    val store = MemStore()
    val b = FakeBrowser(p)
    make(p, store, b).signIn()
    val other = PyreonOidcAuth(
        issuer = "https://other.example", clientId = "app", redirectUri = "com.example.app:/oauth",
        store = store, browser = b, transport = p, executor = INLINE,
    )
    check(other.status.value == PyreonOidcStatus.SIGNED_OUT) { "another issuer's instance does not restore this session" }
    other.signOut()
    other.dispose()
    check(store.entries["pyreon.auth.session.app|https://idp.example"] != null) { "another issuer's instance does not delete this session" }
}

fun testSharedRedirectUri() {
    // N1 (mix-up on a shared native redirect URI): another provider on the same nativeRedirectUri,
    // and this one does not send `iss` — its sign-in is refused before the browser opens.
    PyreonRedirectClaims.reset()
    val p = FakeProvider()
    val b = FakeBrowser(p)
    val other = PyreonOidcAuth(
        issuer = "https://honest.example", clientId = "app", redirectUri = "com.example.app:/oauth",
        store = MemStore(), browser = b, transport = p, executor = INLINE,
    )
    val sharer = make(p, MemStore(), b)
    sharer.signIn()
    check(sharer.error.value == "redirect_shared") { "a provider without iss on a shared native redirect URI is refused: ${sharer.error.value}" }
    check(b.opened.isEmpty() && p.requests.none { it.endsWith("/token") }) { "no browser, no token request" }
    other.dispose()
    sharer.signIn()
    check(sharer.status.value == PyreonOidcStatus.SIGNED_IN) { "after the other provider is disposed the URI is not shared: ${sharer.error.value}" }

    // Providers that send `iss` may share one; a callback without `iss` is then refused.
    PyreonRedirectClaims.reset()
    val tp = FakeProvider()
    tp.advertiseIss = true
    val tb = FakeBrowser(tp)
    val tenantTwo = PyreonOidcAuth(
        issuer = "https://other.example", clientId = "app", redirectUri = "com.example.app:/oauth",
        store = MemStore(), browser = tb, transport = tp, executor = INLINE,
    )
    val tenantOne = make(tp, MemStore(), tb)
    tenantOne.signIn()
    check(tenantOne.status.value == PyreonOidcStatus.SIGNED_IN) { "providers that send iss may share a redirect URI: ${tenantOne.error.value}" }
    tb.rewrite = { it.replace(Regex("&iss=[^&]*"), "") }
    tenantOne.signIn()
    check(tenantOne.error.value == "issuer_missing") { "on a shared redirect URI a callback without iss is refused: ${tenantOne.error.value}" }
    tenantTwo.dispose()
    PyreonRedirectClaims.reset()
}

fun testRefreshDoesNotDiscardSignIn() {
    val p = FakeProvider()
    val b = FakeBrowser(p)
    val auth = make(p, MemStore(), b)
    auth.signIn()
    b.beforeReturn = { auth.refresh() }
    auth.signIn()
    b.beforeReturn = null
    check(auth.status.value == PyreonOidcStatus.SIGNED_IN && auth.accessToken.value == "at-0") { "a refresh does not discard a sign-in in flight: ${auth.accessToken.value}" }
}

fun testOneRefreshPerStoredSession() {
    // Two instances over ONE stored, expired session (an Activity recreation): construction makes
    // no request, and refreshing both presents the refresh token once.
    val p = FakeProvider()
    p.rotateRefresh = true
    p.refreshDelayMs = 300
    val store = MemStore()
    store.entries["pyreon.auth.session.app|https://idp.example"] =
        """{"issuer":"https://idp.example","accessToken":"old","expiresAt":1,"refreshToken":"rt-0","claims":{"sub":"user-1"}}"""
    val b = FakeBrowser(p)
    val a1 = make(p, store, b)
    val a2 = make(p, store, b)
    check(p.requests.isEmpty()) { "restoring an expired session makes no request until start(): ${p.requests}" }
    val threads = listOf(Thread { a1.refreshNow() }, Thread { a2.refreshNow() })
    threads.forEach { it.start() }
    threads.forEach { it.join() }
    val posts = p.requests.count { it.endsWith("/token") }
    check(posts == 1) { "two instances over one stored session refresh once: $posts" }
    check(a1.accessToken.value == "at-1" && a2.accessToken.value == "at-1") { "both adopt the one refresh" }
}

fun testStaleRefreshNotReused() {
    // A refresh in flight for an old session is not handed to a caller of the new one.
    val p = FakeProvider()
    p.uniqueRefreshTokens = true
    p.refreshDelayMs = 300
    val auth = make(p, MemStore(), FakeBrowser(p))
    auth.signIn()
    val stale = Thread { auth.refreshNow() }
    stale.start()
    Thread.sleep(50)
    auth.signOut()
    auth.signIn()
    auth.refreshNow()
    stale.join()
    val refreshGrants = p.requests.count { it.endsWith("/token") } - 2
    check(refreshGrants == 2) { "the new session is refreshed itself: $refreshGrants refresh requests" }
}

fun testDisposedInstanceReclaims() {
    PyreonRedirectClaims.reset()
    val p = FakeProvider()
    val b = FakeBrowser(p)
    val auth = make(p, MemStore(), b)
    auth.dispose()
    auth.signIn()
    val other = PyreonOidcAuth(
        issuer = "https://honest.example", clientId = "app", redirectUri = "com.example.app:/oauth",
        store = MemStore(), browser = b, transport = p, executor = INLINE,
    )
    auth.signIn()
    check(auth.error.value == "redirect_shared") { "a disposed instance that signs in again is registered again: ${auth.error.value}" }
    other.dispose()
    PyreonRedirectClaims.reset()
}

fun testTransientRefreshKeepsSession() {
    val p = FakeProvider()
    val store = MemStore()
    val auth = make(p, store, FakeBrowser(p))
    auth.signIn()
    p.refreshStatus = 503
    auth.refresh()
    check(auth.status.value == PyreonOidcStatus.ERROR && auth.error.value == "provider_unavailable") { "transient failure is an explicit error: ${auth.error.value}" }
    check(store.entries["pyreon.auth.session.app|https://idp.example"] != null) { "a transient failure keeps the stored session" }
    p.refreshStatus = 200
    auth.refresh()
    check(auth.status.value == PyreonOidcStatus.SIGNED_IN && auth.accessToken.value == "at-1") { "the kept refresh token retries: ${auth.error.value}" }
    p.refreshStatus = 400
    auth.refresh()
    check(auth.error.value == "token_exchange_failed" && store.entries["pyreon.auth.session.app|https://idp.example"] == null) { "a refusal deletes the stored session" }
}

fun testExpiredSessionAndFreshToken() {
    val p = FakeProvider()
    val store = MemStore()
    store.entries["pyreon.auth.session.app|https://idp.example"] =
        """{"issuer":"https://idp.example","accessToken":"expired-token","expiresAt":1,"refreshToken":"rt-0","claims":{"sub":"user-1"}}"""
    val auth = make(p, store, FakeBrowser(p))
    check(auth.status.value == PyreonOidcStatus.SIGNING_IN) { "an expired restored session is signingIn: ${auth.status.value}" }
    check(auth.accessToken.value == null) { "the expired token is never exposed" }
    val fresh = auth.freshAccessToken()
    check(fresh == "at-1" && auth.status.value == PyreonOidcStatus.SIGNED_IN) { "freshAccessToken awaits the refresh: $fresh" }
}

fun testAdoptOnlySameUser() {
    val p = FakeProvider()
    val store = MemStore()
    val auth = make(p, store, FakeBrowser(p))
    auth.signIn()
    store.entries["pyreon.auth.session.app|https://idp.example"] =
        """{"issuer":"https://idp.example","accessToken":"other","refreshToken":"rt-other","claims":{"sub":"user-2"}}"""
    auth.refresh()
    check(auth.subject.value == "user-1") { "another user's stored session is not adopted: ${auth.subject.value}" }
    auth.signOut()
    store.entries["pyreon.auth.session.app|https://idp.example"] =
        """{"issuer":"https://idp.example","accessToken":"again","refreshToken":"rt-again","claims":{"sub":"user-1"}}"""
    auth.refresh()
    check(auth.status.value != PyreonOidcStatus.SIGNED_IN && auth.subject.value == null) { "a signed-out instance is not signed in by adoption" }
}

fun testInvalidRedirectUriRefusedAtConstruction() {
    val p = FakeProvider()
    val b = FakeBrowser(p)
    val bad = PyreonOidcAuth(
        issuer = ISS, clientId = "app", redirectUri = "https://bücher.example/cb",
        store = MemStore(), browser = b, transport = p, executor = INLINE,
    )
    check(bad.status.value == PyreonOidcStatus.ERROR && bad.error.value == "invalid_redirect_uri") { "refused at construction: ${bad.error.value}" }
    bad.signIn()
    check(b.opened.isEmpty() && bad.error.value == "invalid_redirect_uri") { "sign-in never starts" }
    bad.dispose()
}

fun testClaimTakenOnActivate() {
    PyreonRedirectClaims.reset()
    val p = FakeProvider()
    val auth = PyreonOidcAuth(
        issuer = ISS, clientId = "app", redirectUri = "com.example.app:/oauth",
        store = MemStore(), browser = FakeBrowser(p), transport = p, executor = INLINE, claimOnCreate = false,
    )
    val observer = PyreonRedirectClaims.claim("com.example.app:/oauth", "https://observer.example")
    check(!observer.isShared) { "a container built with claimOnCreate = false holds no claim (an abandoned composition leaks none)" }
    auth.activate()
    check(observer.isShared) { "activate() takes the claim" }
    auth.dispose()
    check(!observer.isShared) { "dispose() releases it" }
    observer.release()
    PyreonRedirectClaims.reset()
}

fun testRotatedTokenKeptWhenKeysUnavailable() {
    val p = FakeProvider()
    p.rotateRefresh = true
    val store = MemStore()
    store.entries["pyreon.auth.session.app|https://idp.example"] =
        """{"issuer":"https://idp.example","accessToken":"a0","expiresAt":99999999999999,"refreshToken":"rt-0","claims":{"sub":"user-1"}}"""
    val auth = make(p, store, FakeBrowser(p))
    p.jwksStatus = 503
    auth.refresh()
    check(auth.error.value == "jwks_failed") { "the key set outage is reported: ${auth.error.value}" }
    p.jwksStatus = 200
    auth.refresh()
    check(p.presentedRefreshTokens == listOf("rt-0", "rt-1")) { "the retry presents the rotated token: ${p.presentedRefreshTokens}" }
}

fun testNoAdoptionWithoutSubject() {
    val p = FakeProvider()
    val store = MemStore()
    store.entries["pyreon.auth.session.app|https://idp.example"] =
        """{"issuer":"https://idp.example","accessToken":"a0","expiresAt":99999999999999,"refreshToken":"rt-mine","claims":{}}"""
    val auth = make(p, store, FakeBrowser(p))
    store.entries["pyreon.auth.session.app|https://idp.example"] =
        """{"issuer":"https://idp.example","accessToken":"a1","expiresAt":99999999999999,"refreshToken":"rt-theirs","claims":{}}"""
    auth.refresh()
    check(p.presentedRefreshTokens == listOf("rt-mine")) { "no adoption without a known subject: ${p.presentedRefreshTokens}" }
}

fun testExpiredTokenNeverExposed() {
    var now = System.currentTimeMillis()
    val p = FakeProvider()
    val auth = PyreonOidcAuth(
        issuer = ISS, clientId = "app", redirectUri = "com.example.app:/oauth",
        store = MemStore(), browser = FakeBrowser(p), transport = p, executor = INLINE, clock = { now },
    )
    auth.signIn()
    check(auth.accessToken.value == "at-0") { "a live token is returned" }
    now += 3_700_000
    check(auth.accessToken.value == null) { "an expired token is never returned" }
    auth.dispose()
}

fun testFreshAccessTokenRefusesMainThread() {
    val p = FakeProvider()
    val auth = make(p, MemStore(), FakeBrowser(p))
    val before = PyreonOidcAuth.isMainThread
    PyreonOidcAuth.isMainThread = { true }
    try {
        val e = runCatching { auth.freshAccessToken() }.exceptionOrNull()
        check(e is IllegalStateException && e.message!!.startsWith("[Pyreon] auth:")) { "freshAccessToken refuses the main thread: $e" }
    } finally {
        PyreonOidcAuth.isMainThread = before
    }
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

/**
 * An explicitly built metadata (no discovery) with an http token endpoint is refused at
 * USE — before any request is sent — exactly like the web `postToken`.
 */
fun testTokenEndpointHttpsAtUse() {
    var sent = 0
    val transport = PyreonAuthTransport { sent++; PyreonAuthResponse(500) }
    val meta = PyreonOidcMetadata(issuer = "http://evil.example", authorizationEndpoint = "https://idp.example/auth", tokenEndpoint = "http://evil.example/token")
    for (call in listOf<() -> Unit>(
        { PyreonOidcClient.refresh(meta, "app", "rt", transport) },
        { PyreonOidcClient.exchangeCode(meta, "app", PyreonAuthFlow("s", "n", "v", "r", "http://evil.example", 0), "code", transport) },
    )) {
        val e = runCatching(call).exceptionOrNull()
        check(e is PyreonAuthError && e.code == "insecure_url") { "http token endpoint must be refused, got $e" }
    }
    check(sent == 0) { "no request may reach an http token endpoint (sent $sent)" }
    // Loopback http stays allowed for local development.
    val local = meta.copy(tokenEndpoint = "http://127.0.0.1:8080/token")
    val e = runCatching { PyreonOidcClient.refresh(local, "app", "rt", transport) }.exceptionOrNull()
    check(sent == 1 && (e as? PyreonAuthError)?.code == "provider_unavailable") { "loopback reaches the transport (its 500 is provider_unavailable): $e" }
}

fun testSignOutRevokesTokens() {
    PyreonOidcInstances.reset() // instances of earlier cases share the session key
    val p = FakeProvider()
    p.revocationStatus = 200
    val auth = make(p, MemStore(), FakeBrowser(p))
    auth.signIn()
    auth.signOut()
    check(auth.status.value == PyreonOidcStatus.SIGNED_OUT && auth.accessToken.value == null) { "signed out locally" }
    check(p.revoked == listOf(
        mapOf("token" to "rt-0", "client_id" to "app", "token_type_hint" to "refresh_token"),
        mapOf("token" to "at-0", "client_id" to "app", "token_type_hint" to "access_token"),
    )) { "refresh then access token revoked (RFC 7009): ${p.revoked}" }

    // A refused revocation still signs out; nothing is revoked when the provider advertises no endpoint.
    val refused = FakeProvider()
    refused.revocationStatus = 400
    val r = make(refused, MemStore(), FakeBrowser(refused))
    r.signIn()
    r.signOutNow()
    check(r.status.value == PyreonOidcStatus.SIGNED_OUT && refused.revoked.size == 2) { "a refused revocation still signs out" }
    val plain = FakeProvider()
    val n = make(plain, MemStore(), FakeBrowser(plain))
    n.signIn()
    n.signOutNow()
    check(plain.requests.none { it.endsWith("/revoke") }) { "no revocation without an advertised endpoint" }
}

fun testSignOutRevokesEveryInstancesTokens() {
    PyreonOidcInstances.reset() // instances of earlier cases share the session key
    // A sibling refreshed (and rotated) the session: the instance signing out holds only the spent
    // tokens; the live ones are in the sibling and the store, and must be revoked too.
    val p = FakeProvider()
    p.revocationStatus = 200
    p.rotateRefresh = true
    val store = MemStore()
    val b = FakeBrowser(p)
    val a = make(p, store, b)
    a.signIn()
    val sibling = make(p, store, b)
    sibling.refreshNow()
    check(sibling.accessToken.value == "at-1") { "the sibling refreshed: ${sibling.error.value}" }
    a.signOutNow()
    val revoked = p.revoked.map { it["token"] }.toSet()
    check(revoked == setOf("rt-0", "at-0", "rt-1", "at-1")) { "every instance's and the store's tokens revoked: $revoked" }
    check(sibling.status.value == PyreonOidcStatus.SIGNED_OUT) { "the sibling signed out" }

    // The instance signing out holds nothing, a sibling does: still revoked (no early return).
    val p2 = FakeProvider()
    p2.revocationStatus = 200
    val s2 = MemStore()
    val empty = make(p2, s2, FakeBrowser(p2))
    val holder = make(p2, s2, FakeBrowser(p2))
    holder.signIn()
    empty.signOut()
    check(p2.revoked.map { it["token"] }.toSet() == setOf("rt-0", "at-0")) { "revoked from the sibling: ${p2.revoked}" }
    check(holder.status.value == PyreonOidcStatus.SIGNED_OUT) { "the holder signed out" }
}

fun testTokensLandingAfterSignOutAreRevoked() {
    PyreonOidcInstances.reset() // instances of earlier cases share the session key
    // A code exchange still in flight when the user signs out: its tokens are revoked, not dropped.
    val p = FakeProvider()
    p.revocationStatus = 200
    val auth = make(p, MemStore(), FakeBrowser(p))
    p.duringToken = { auth.signOut() }
    auth.signIn()
    check(auth.status.value == PyreonOidcStatus.SIGNED_OUT && auth.accessToken.value == null) { "the late sign-in is discarded" }
    check(p.revoked.map { it["token"] }.toSet() == setOf("rt-0", "at-0")) { "its tokens revoked: ${p.revoked}" }

    // A refresh in flight: sign-out revokes what the session held, the refresh's new tokens when they land.
    val r = FakeProvider()
    r.revocationStatus = 200
    r.rotateRefresh = true
    val ra = make(r, MemStore(), FakeBrowser(r))
    ra.signIn()
    r.duringToken = { ra.signOut() }
    ra.refreshNow()
    check(ra.status.value == PyreonOidcStatus.SIGNED_OUT && ra.accessToken.value == null) { "the late refresh is discarded" }
    check(r.revoked.map { it["token"] }.toSet() == setOf("rt-0", "at-0", "rt-1", "at-1")) { "held and late tokens revoked: ${r.revoked}" }
}

fun testSignOutReachesOtherInstances() {
    PyreonOidcInstances.reset() // instances of earlier cases share the session key
    // Two containers over one stored session (an Activity recreated, two useOidc calls): a sign-out
    // in one removes the record both read, so the other signs out too — it must not keep serving
    // a token the user signed out of, nor refresh it back.
    val p = FakeProvider()
    val store = MemStore()
    val b = FakeBrowser(p)
    val a = make(p, store, b)
    a.signIn()
    val other = make(p, store, b)
    check(other.status.value == PyreonOidcStatus.SIGNED_IN) { "the second instance restored the session" }
    a.signOut()
    check(other.status.value == PyreonOidcStatus.SIGNED_OUT && other.accessToken.value == null && other.subject.value == null) {
        "the other instance signed out: ${other.status.value}"
    }
    val tokenCalls = p.requests.count { it.endsWith("/token") }
    other.refreshNow()
    check(other.status.value != PyreonOidcStatus.SIGNED_IN && p.requests.count { it.endsWith("/token") } == tokenCalls) { "and cannot refresh back" }
    // Another provider's instance (another stored session) is untouched.
    val elsewhere = PyreonOidcAuth(
        issuer = ISS, clientId = "other-app", redirectUri = "com.example.app:/oauth2",
        store = store, browser = b, transport = p, executor = INLINE,
    )
    val otherProvider = FakeProvider()
    val c = make(otherProvider, MemStore(), FakeBrowser(otherProvider))
    c.signIn()
    elsewhere.signOut()
    check(c.status.value == PyreonOidcStatus.SIGNED_IN) { "an instance of another stored session stays signed in" }
    c.signOut()
    elsewhere.dispose()
}

fun main() {
    testTokenEndpointHttpsAtUse()
    testUrlConnectionTransport()
    testSignInRehydrateRefresh()
    testFailures()
    testLateResultAndLogout()
    testRehydrationGuards()
    testKeyRotation()
    testConcurrentRefreshSharesOneRequest()
    testSessionKeyedByIssuer()
    testSharedRedirectUri()
    testRefreshDoesNotDiscardSignIn()
    testOneRefreshPerStoredSession()
    testStaleRefreshNotReused()
    testDisposedInstanceReclaims()
    testTransientRefreshKeepsSession()
    testExpiredSessionAndFreshToken()
    testAdoptOnlySameUser()
    testInvalidRedirectUriRefusedAtConstruction()
    testClaimTakenOnActivate()
    testRotatedTokenKeptWhenKeysUnavailable()
    testNoAdoptionWithoutSubject()
    testExpiredTokenNeverExposed()
    testFreshAccessTokenRefusesMainThread()
    testSignOutRevokesTokens()
    testSignOutReachesOtherInstances()
    testSignOutRevokesEveryInstancesTokens()
    testTokensLandingAfterSignOutAreRevoked()
    println("[PyreonOidcAuthTest] all smoke tests passed")
}
