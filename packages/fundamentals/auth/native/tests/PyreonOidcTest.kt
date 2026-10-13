// Smoke tests for PyreonOidc (PKCE + pending-flow core). Dependency-free `check(...)` harness;
// runs via `verify-kotlin.ts --service=PyreonOidc`. Pure JVM logic, so fully covered here.

package com.pyreon.runtime

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
    val core = PyreonAuthCore(InMemoryAuthFlowStore())
    val u = begin(core)
    check(u.contains("code_challenge_method=S256") && u.contains("nonce=")) { "request params" }
    check(core.complete(cb(u, "&code=abc&iss=$ISS"), ISS).first == "abc") { "code returned" }
    raises<PyreonAuthError.UnknownFlow>("replay") { core.complete(cb(u, "&code=abc"), ISS) }
}

fun testOidcRejections() {
    val core = PyreonAuthCore(InMemoryAuthFlowStore())
    raises<PyreonAuthError.IssuerMismatch>("mix-up") { core.complete(cb(begin(core), "&code=a&iss=https://evil.example"), ISS) }
    raises<PyreonAuthError.IssuerMissing>("iss missing") { core.complete(cb(begin(core), "&code=a"), ISS, issuerParamSupported = true) }
    raises<PyreonAuthError.FlowExpired>("expired") { core.complete(cb(begin(core, System.currentTimeMillis() - 700_000), "&code=a"), ISS) }
    raises<PyreonAuthError.InsecureUrl>("http") { core.begin("http://idp.example/auth", ISS, "a", "r") }
    raises<PyreonAuthError.ProviderError>("provider error") { core.complete(cb(begin(core), "&error=access_denied"), ISS) }
    raises<PyreonAuthError.MissingCode>("no code") { core.complete(cb(begin(core), ""), ISS) }
    raises<PyreonAuthError.UnknownFlow>("unknown state") { core.complete("https://app.example/cb?state=zzz&code=a", ISS) }
}

fun main() {
    testOidcRfc7636Vector()
    testOidcHappyPathAndReplay()
    testOidcRejections()
    println("[PyreonOidcTest] all smoke tests passed")
}
