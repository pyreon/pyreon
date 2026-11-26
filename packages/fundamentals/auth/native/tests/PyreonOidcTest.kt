// Smoke tests for PyreonOidc (PKCE + pending-flow core). Dependency-free `check(...)` harness;
// runs via `verify-kotlin.ts --service=PyreonOidc`. Pure JVM logic, so fully covered here.

package com.pyreon.runtime

// The shared redirect-matching vectors (native/tests/redirect-vectors.json); vectors.test.ts checks this copy.
// <redirect-vectors:begin>
private const val REDIRECT_VECTORS = """[["https://app.example/cb","https app.example /cb"],["HTTPS://App.Example:443/cb?x=1#f","https app.example /cb"],["https://app.example:8443/cb","https app.example:8443 /cb"],["http://localhost:80/cb","http localhost /cb"],["https://app.example","https app.example /"],["com.example.app:/oauth","com.example.app  /oauth"],["com.example.app:///oauth","com.example.app  /oauth"],["Com.Example.App:/oauth?code=1&state=s","com.example.app  /oauth"],["com.example.app:/oauth/google","com.example.app  /oauth/google"],["app:cb","app  cb"],["app://cb","app cb "],["app://Host/x","app host /x"],["https://app.example/a%2Fb","https app.example /a%2Fb"],["https://app.example/a/b","https app.example /a/b"],["custom://h:443/x","custom h:443 /x"],["https://app.example/cb/","https app.example /cb/"],["https://app.example/./cb","https app.example /cb"],["https://app.example/a/../cb","https app.example /cb"],["https://app.example/a/b/../../cb/.","https app.example /cb/"],["https://app.example/c%62","https app.example /c%62"],["https://app.example:0443/cb","https app.example /cb"],["https://user:pw@app.example/cb","https app.example /cb"],["http://[::1]:8080/cb","http [::1]:8080 /cb"],["com.example.app:/oauth/","com.example.app  /oauth/"],["com.example.app:oauth?x=1","com.example.app  oauth"],["COM.EXAMPLE.APP:/OAUTH","com.example.app  /OAUTH"],["https://app.example//cb","https app.example //cb"],["https://xn--bcher-kva.example/cb","https xn--bcher-kva.example /cb"],["https://bücher.example/cb",""],["https://b%C3%BCcher.example/cb",""],["https://app.example\\cb",""],["https://app.example/c b",""],["https://app.example/%2e%2e/cb",""],["https://app.example/cb?next=/a b\\c","https app.example /cb"]]"""
// <redirect-vectors:end>

// The shared callback-query vectors (native/tests/callback-vectors.json); review-r2.test.ts checks this copy.
// <callback-vectors:begin>
private const val CALLBACK_VECTORS = """[["https://app.example/cb?code=a&code=b","code","a"],["https://app.example/cb?state=s1&code=c&state=s2","state","s1"],["https://app.example/cb?code=&code=b","code",""],["https://app.example/cb?code","code",""],["https://app.example/cb?code=a+b","code","a b"],["https://app.example/cb?code=a%2Bb","code","a+b"],["https://app.example/cb?code=%E2%9C%93","code","✓"],["https://app.example/cb?code=a=b","code","a=b"],["https://app.example/cb?a=1&&code=c","code","c"],["https://app.example/cb?code=c#code=d","code","c"],["https://app.example/cb#code=d","code",null],["https://app.example/cb?x=1","code",null],["https://app.example/cb?iss=https%3A%2F%2Fidp.example&code=c","iss","https://idp.example"],["https://app.example/cb?c%6Fde=c","code","c"],["com.example.app:/oauth?code=c&state=s","state","s"],["com.example.app:oauth?code=c&state=s","code","c"],["com.example.app:/oauth?error=access_denied&error=x","error","access_denied"],["https://app.example/cb?code=c&state=S&x=%zz","code","c"],["https://app.example/cb?code=c&state=S&x=%zz","x","%zz"],["https://app.example/cb?x=a%2","x","a%2"],["https://app.example/cb?x=%%41","x","%A"],["https://app.example/cb?x=%FF","x","�"],["https://app.example/cb?x=a%FFb","x","a�b"],["https://app.example/cb?state=%zz","state","%zz"]]"""
// <callback-vectors:end>

private const val ISS = "https://idp.example"
private const val EP = "https://idp.example/auth"

private fun begin(core: PyreonAuthCore, now: Long = System.currentTimeMillis()) =
    core.begin(EP, ISS, "app", "https://app.example/cb", nowMs = now)

private fun cb(authUrl: String, extra: String): String {
    val state = Regex("state=([^&]+)").find(authUrl)!!.groupValues[1]
    return "https://app.example/cb?state=$state$extra"
}

private inline fun <reified T : Throwable> raises(msg: String, f: () -> Unit) {
    try {
        f()
        check(false) { "$msg: expected ${T::class.simpleName}" }
    } catch (e: Throwable) {
        check(e is T) { "$msg: got $e" }
    }
}

fun testOidcRfc7636Vector() {
    check(PyreonPKCE.challengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM") { "S256 vector" }
    val a = PyreonPKCE.randomToken()
    check(Regex("^[A-Za-z0-9_-]{43}$").matches(a) && a != PyreonPKCE.randomToken()) { "verifier shape/unique" }
}

fun testOidcHappyPathAndReplay() {
    val core = PyreonAuthCore(CountingStore())
    val u = begin(core)
    check(u.contains("code_challenge_method=S256") && u.contains("nonce=")) { "request params" }
    check(core.complete(cb(u, "&code=abc&iss=$ISS"), ISS).first == "abc") { "code returned" }
    raises<PyreonAuthError.UnknownFlow>("replay") { core.complete(cb(u, "&code=abc"), ISS) }
}

fun testOidcRejections() {
    val core = PyreonAuthCore(CountingStore())
    raises<PyreonAuthError.IssuerMismatch>("mix-up") { core.complete(cb(begin(core), "&code=a&iss=https://evil.example"), ISS) }
    raises<PyreonAuthError.IssuerMismatch>("flow of another issuer") { core.complete(cb(begin(core), "&code=a"), "https://other.example") }
    raises<PyreonAuthError.RedirectMismatch>("callback at another redirect URI") {
        core.complete(cb(begin(core), "&code=a").replace("https://app.example/cb", "https://app.example/other"), ISS)
    }
    raises<PyreonAuthError.IssuerMissing>("iss missing") { core.complete(cb(begin(core), "&code=a"), ISS, issuerParamSupported = true) }
    raises<PyreonAuthError.FlowExpired>("expired") { core.complete(cb(begin(core, System.currentTimeMillis() - 700_000), "&code=a"), ISS) }
    raises<PyreonAuthError.InsecureUrl>("http") { core.begin("http://idp.example/auth", ISS, "a", "r") }
    // Loopback http is a local dev provider, as on the web.
    check(core.begin("http://localhost:8080/auth", ISS, "a", "r").startsWith("http://localhost:8080/auth?")) { "loopback http allowed" }
    raises<PyreonAuthError>("reserved param") { core.begin(EP, ISS, "a", "r", authorizationParams = mapOf("state" to "x")) }
    check(core.begin(EP, ISS, "a", "r", authorizationParams = mapOf("prompt" to "consent")).contains("prompt=consent")) { "authorizationParams added" }
    raises<PyreonAuthError.ProviderError>("provider error") { core.complete(cb(begin(core), "&error=access_denied"), ISS) }
    raises<PyreonAuthError.MissingCode>("no code") { core.complete(cb(begin(core), ""), ISS) }
    raises<PyreonAuthError.UnknownFlow>("unknown state") { core.complete("https://app.example/cb?state=zzz&code=a", ISS) }
}

fun testRedirectVectors() {
    @Suppress("UNCHECKED_CAST")
    val vectors = PyreonAuthJson.parse(REDIRECT_VECTORS) as List<List<String>>
    for (v in vectors) {
        val got = PyreonRedirect.target(v[0])
        check((got ?: "") == v[1]) { // "" = refused
            "redirect target of ${v[0]}: got $got, want ${v[1]}" }
    }
    raises<PyreonAuthError>("response_mode is reserved") {
        PyreonAuthCore(CountingStore()).begin(EP, ISS, "a", "r", authorizationParams = mapOf("response_mode" to "form_post"))
    }
}

fun testCallbackQueryVectors() {
    @Suppress("UNCHECKED_CAST")
    val vectors = PyreonAuthJson.parse(CALLBACK_VECTORS) as List<List<Any>>
    for (v in vectors) {
        val got = PyreonCallbackQuery.parse(v[0] as String)[v[1] as String]
        check(got == v[2] as? String) { "callback ${v[0]} param ${v[1]}: got $got, want ${v[2]}" }
    }
    // A repeated parameter means the same as on the web and iOS: the first value wins.
    val core = PyreonAuthCore(CountingStore())
    check(core.complete(cb(begin(core), "&code=first&code=second"), ISS).first == "first") { "first code wins" }
    val u = begin(core)
    check(core.complete(cb(u, "&code=c&state=forged"), ISS).first == "c") { "first state wins" }
}

fun testRedirectAnswersRequest() {
    // What the exported Android redirect activity forwards: only the answer to the request in flight.
    val core = PyreonAuthCore(CountingStore())
    val req = begin(core)
    val state = Regex("state=([^&]+)").find(req)!!.groupValues[1]
    val r = "https://app.example/cb"
    check(PyreonRedirect.answers("$r?state=$state&code=c", req, r)) { "the real redirect is forwarded" }
    check(PyreonRedirect.answers("HTTPS://APP.EXAMPLE:443/cb?state=$state&error=access_denied", req, r)) { "a provider error with the state is forwarded" }
    check(!PyreonRedirect.answers(null, req, r)) { "no data: dropped (another app cancelling the sign-in)" }
    check(!PyreonRedirect.answers("$r?code=c", req, r)) { "no state: dropped" }
    check(!PyreonRedirect.answers("$r?state=forged&code=c", req, r)) { "another state: dropped" }
    check(!PyreonRedirect.answers("$r?state=forged&state=$state&code=c", req, r)) { "a repeated state is read as its first value" }
    check(!PyreonRedirect.answers("https://app.example/other?state=$state&code=c", req, r)) { "another target: dropped" }
    check(!PyreonRedirect.answers("https://app.example\\cb?state=$state", req, r)) { "an unmatchable spelling: dropped" }
    // A request without a state (the provider logout) is answered by any redirect to its target.
    check(PyreonRedirect.answers("com.example.app:/logout", "https://idp.example/logout?client_id=a", "com.example.app:/logout")) { "logout return" }
}

fun main() {
    testRedirectVectors()
    testRedirectAnswersRequest()
    testCallbackQueryVectors()
    testOidcRfc7636Vector()
    testOidcHappyPathAndReplay()
    testOidcRejections()
    testOidcAbandonedFlowsAreSwept()
    testOidcMalformedCallbackIsUnknownFlow()
    println("[PyreonOidcTest] all smoke tests passed")
}

fun testOidcAbandonedFlowsAreSwept() {
    // A sign-in the user never completes must not stay in the persistent store
    // forever: `begin` sweeps expired flows and caps the rest.
    val store = CountingStore()
    val core = PyreonAuthCore(store)
    val old = System.currentTimeMillis() - 11 * 60 * 1000
    repeat(5) { begin(core, old) }
    val fresh = begin(core)
    check(store.size == 2) { "expired flows swept on begin (got ${store.size})" }
    core.complete(cb(fresh, "&code=c"), ISS)
    check(store.size == 0) { "completing the last flow empties the store (got ${store.size})" }
    repeat(PyreonAuthCore.MAX_PENDING_FLOWS + 5) { begin(core) }
    check(store.size == PyreonAuthCore.MAX_PENDING_FLOWS + 1) { "live flows are capped (got ${store.size})" }
}

fun testOidcMalformedCallbackIsUnknownFlow() {
    val core = PyreonAuthCore(CountingStore())
    raises<PyreonAuthError.UnknownFlow>("bad % escape") { core.complete("https://app.example/cb?state=%zz&code=a", ISS) }
}

/** The in-memory secure store, counting its entries. */
class CountingStore : PyreonSecureBackend {
    val entries = HashMap<String, String>()
    val size: Int get() = entries.size
    override fun write(key: String, value: String): Boolean { entries[key] = value; return true }
    override fun read(key: String): String? = entries[key]
    override fun remove(key: String): Boolean = entries.remove(key) != null
}
