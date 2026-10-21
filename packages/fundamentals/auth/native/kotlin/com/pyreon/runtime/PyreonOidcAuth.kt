package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

// PyreonOidcAuth — the Android half of `useOidc` (@pyreon/auth); Kotlin twin of
// PyreonOidcAuth.swift. One shared component body reads the same members on all targets:
//
//   auth.status()          "signedOut" / "signingIn" / "signedIn" / "error"
//   auth.isAuthenticated() status == SIGNED_IN
//   auth.subject()         the verified `sub`, or null
//   auth.claim("email")    a verified string claim, or null
//   auth.accessToken()     the current access token, or null
//   auth.expiresAt()       access-token expiry, epoch milliseconds, or null
//   auth.error()           the last failure's code ("bad_nonce", "cancelled", …), or null
//   auth.signIn() / auth.refresh() / auth.signOut(…)
//
// No coroutines (they are not in the stub gate, and the container must RUN in the smoke
// test): work runs on an [Executor] — a background thread by default, the calling thread in
// tests — and state is Compose MutableState, which may be written from any thread. The
// browser call blocks that background thread until the redirect arrives.

/**
 * The four session states. `status` is a String on every target — exactly the spelling the web
 * `status()` returns — so shared source can render it AND compare it (`auth.status() === 'signedIn'`);
 * an enum would not compile there.
 */
public object PyreonOidcStatus {
    public const val SIGNED_OUT: String = "signedOut"
    public const val SIGNING_IN: String = "signingIn"
    public const val SIGNED_IN: String = "signedIn"
    public const val ERROR: String = "error"
}

/** Runs the authorization request in a browser and returns the redirect it ended on. Blocking. */
public fun interface PyreonAuthBrowser {
    public fun authorize(url: String, redirectUri: String): String
}

/** Thrown by a browser when the user closes it — a cancellation, not an error state. */
public class PyreonAuthCancelled : PyreonAuthError("cancelled", "sign-in was cancelled")

public class PyreonOidcAuth(
    public val issuer: String,
    public val clientId: String,
    public val redirectUri: String,
    public val scope: String = "openid profile email",
    public val postLogoutRedirectUri: String? = null,
    public val authorizationParams: Map<String, String> = emptyMap(),
    private val store: PyreonSecureBackend,
    private val browser: PyreonAuthBrowser?,
    private val transport: PyreonAuthTransport = PyreonUrlConnectionAuthTransport,
    private val executor: Executor = DEFAULT_EXECUTOR,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    public val status: MutableState<String> = mutableStateOf(PyreonOidcStatus.SIGNED_OUT)
    public val subject: MutableState<String?> = mutableStateOf(null)
    public val accessToken: MutableState<String?> = mutableStateOf(null)
    public val expiresAt: MutableState<Double?> = mutableStateOf(null)
    public val error: MutableState<String?> = mutableStateOf(null)
    private val claims: MutableState<Map<String, String>> = mutableStateOf(emptyMap())

    public val isAuthenticated: Boolean get() = status.value == PyreonOidcStatus.SIGNED_IN

    /** A verified string claim of the signed-in user, or null. */
    public fun claim(name: String): String? = claims.value[name]

    @Volatile private var meta: PyreonOidcMetadata? = null
    @Volatile private var jwks: PyreonJwksCache? = null
    @Volatile private var idToken: String? = null
    @Volatile private var refreshToken: String? = null

    /** Bumped by every new attempt and by signOut, so a late result never resurrects a session. */
    private val epoch = AtomicInteger(0)
    private val sessionKey get() = "pyreon.auth.session.$clientId"

    init {
        rehydrate()
    }

    // ---- actions (fire-and-forget for UI; the *Now forms block, for tests) ----

    public fun signIn() { val my = epoch.incrementAndGet(); status.value = PyreonOidcStatus.SIGNING_IN; error.value = null; executor.execute { signInNow(my) } }
    public fun refresh() { val my = epoch.incrementAndGet(); executor.execute { refreshNow(my) } }

    public fun signInNow(my: Int = epoch.incrementAndGet()) {
        status.value = PyreonOidcStatus.SIGNING_IN
        error.value = null
        try {
            val m = metadata()
            val url = PyreonAuthCore(store).begin(
                m.authorizationEndpoint, m.issuer, clientId, redirectUri, scope, authorizationParams = authorizationParams,
            )
            val b = browser ?: throw PyreonAuthError("no_browser", "no browser is available to sign in with")
            val callback = b.authorize(url, redirectUri)
            if (my != epoch.get()) return
            complete(callback, my)
        } catch (e: Throwable) {
            if (my == epoch.get()) fail(e)
        }
    }

    /** Complete a sign-in from a redirect delivered some other way (an App Link). */
    public fun handleCallback(url: String) {
        val my = epoch.incrementAndGet()
        status.value = PyreonOidcStatus.SIGNING_IN
        executor.execute {
            try { complete(url, my) } catch (e: Throwable) { if (my == epoch.get()) fail(e) }
        }
    }

    private fun complete(callback: String, my: Int) {
        val m = metadata()
        val (code, flow) = PyreonAuthCore(store).complete(callback, m.issuer, m.issParameterSupported)
        val t = PyreonOidcClient.exchangeCode(m, clientId, flow, code, transport)
        val verified = verify(m, t.idToken, flow.nonce)
        if (my != epoch.get()) return
        commit(t, t.refreshToken, verified)
    }

    public fun refreshNow(my: Int = epoch.incrementAndGet()) {
        try {
            val current = refreshToken ?: throw PyreonAuthError("no_refresh_token", "no refresh token — sign in again")
            val m = metadata()
            val t = PyreonOidcClient.refresh(m, clientId, current, transport)
            // A refreshed ID token carries no nonce (OIDC Core §12.2) but must name the same user.
            val verified = verify(m, t.idToken, null)
            val sub = subject.value
            if (verified != null && sub != null && verified["sub"] != sub) {
                throw PyreonAuthError("subject_changed", "refreshed id_token is for a different user")
            }
            if (my != epoch.get()) return
            // Providers may rotate the refresh token; keep the old one when they do not.
            commit(t, t.refreshToken ?: current, verified ?: claims.value)
        } catch (e: Throwable) {
            if (my == epoch.get()) fail(e)
        }
    }

    /**
     * Clear the session. With [endProviderSession], also end it AT THE PROVIDER (RP-initiated
     * logout) — otherwise the next sign-in completes without a prompt.
     */
    public fun signOut(endProviderSession: Boolean = false) {
        epoch.incrementAndGet()
        val hint = idToken
        clear()
        error.value = null
        status.value = PyreonOidcStatus.SIGNED_OUT
        val m = meta ?: return
        val b = browser ?: return
        if (!endProviderSession) return
        val url = try {
            PyreonOidcClient.endSessionUrl(m, hint, clientId, postLogoutRedirectUri)
        } catch (_: PyreonAuthError) {
            null
        } ?: return
        executor.execute { try { b.authorize(url, postLogoutRedirectUri ?: redirectUri) } catch (_: Throwable) {} }
    }

    // ---- internals ----

    private fun metadata(): PyreonOidcMetadata = meta ?: PyreonOidcClient.discover(issuer, transport).also { meta = it }

    /** Verified string claims, or null when the response carried no ID token (OAuth2-only). */
    private fun verify(m: PyreonOidcMetadata, token: String?, nonce: String?): Map<String, String>? {
        if (token == null) return null
        if (m.jwksUri == null) throw PyreonAuthError("no_jwks", "provider returned an id_token but publishes no jwks_uri to verify it")
        val cache = jwks ?: PyreonJwksCache(m, transport, clock = clock).also { jwks = it }
        val keys = cache.keys(PyreonJose.tokenKid(token))
        val c = PyreonJose.verifyIdToken(token, keys, m.issuer, clientId, nonce, clock() / 1000.0)
        return c.entries.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }.toMap()
    }

    private fun commit(t: PyreonTokenSet, refresh: String?, verified: Map<String, String>?) {
        refreshToken = refresh
        // A refresh response may omit the ID token; the last one stays the logout hint.
        if (t.idToken != null) idToken = t.idToken else if (status.value != PyreonOidcStatus.SIGNED_IN) idToken = null
        claims.value = verified ?: emptyMap()
        subject.value = verified?.get("sub")
        accessToken.value = t.accessToken
        expiresAt.value = t.expiresIn?.let { clock() + it * 1000 }
        error.value = null
        status.value = PyreonOidcStatus.SIGNED_IN
        persist()
    }

    private fun fail(e: Throwable) {
        clear()
        val code = (e as? PyreonAuthError)?.code ?: "unknown"
        error.value = code
        status.value = if (code == "cancelled") PyreonOidcStatus.SIGNED_OUT else PyreonOidcStatus.ERROR
    }

    private fun clear() {
        accessToken.value = null
        refreshToken = null
        idToken = null
        claims.value = emptyMap()
        subject.value = null
        expiresAt.value = null
        store.remove(sessionKey)
    }

    // The session record. Claims were verified before they were stored, and the store is the
    // Keystore-backed one, so restoring them does not re-verify an ID token that may have expired.
    private fun persist() {
        val record = linkedMapOf<String, Any?>("issuer" to issuer, "accessToken" to (accessToken.value ?: ""), "claims" to claims.value)
        refreshToken?.let { record["refreshToken"] = it }
        idToken?.let { record["idToken"] = it }
        expiresAt.value?.let { record["expiresAt"] = it }
        store.write(sessionKey, PyreonAuthJson.stringify(record))
    }

    @Suppress("UNCHECKED_CAST")
    private fun rehydrate() {
        val raw = store.read(sessionKey) ?: return
        val r = PyreonAuthJson.obj(raw)
        val access = r?.get("accessToken") as? String
        if (r == null || r["issuer"] != issuer || access.isNullOrEmpty()) {
            store.remove(sessionKey)
            return
        }
        val exp = PyreonJose.number(r["expiresAt"])
        val storedRefresh = r["refreshToken"] as? String
        val expired = exp != null && exp <= clock()
        if (expired && storedRefresh == null) {
            store.remove(sessionKey)
            return
        }
        accessToken.value = access
        refreshToken = storedRefresh
        idToken = r["idToken"] as? String
        val c = (r["claims"] as? Map<String, Any?>)?.entries?.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }?.toMap() ?: emptyMap()
        claims.value = c
        subject.value = c["sub"]
        expiresAt.value = exp
        status.value = PyreonOidcStatus.SIGNED_IN
        if (expired) refresh()
    }

    public companion object {
        /** One background thread for auth work: requests are sequential per session anyway. */
        private val DEFAULT_EXECUTOR: Executor by lazy {
            Executors.newSingleThreadExecutor { r -> Thread(r, "pyreon-auth").apply { isDaemon = true } }
        }
    }
}
