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
 * The live containers, by stored-session key (client and issuer), so a sign-out reaches every
 * instance over the session it removes. Weak: an instance the app drops is not kept alive, and a
 * collected one is pruned on every access to its key (a key with none left is removed), so the
 * map is bounded by the live instances.
 */
internal object PyreonOidcInstances {
    private val live = HashMap<String, MutableList<java.lang.ref.WeakReference<PyreonOidcAuth>>>()

    fun add(key: String, auth: PyreonOidcAuth): Unit = synchronized(this) {
        val list = live.getOrPut(key) { ArrayList() }
        list.removeAll { it.get() == null }
        list.add(java.lang.ref.WeakReference(auth))
    }

    fun others(key: String, auth: PyreonOidcAuth): List<PyreonOidcAuth> = synchronized(this) {
        val list = live[key] ?: return emptyList()
        list.removeAll { it.get() == null }
        if (list.isEmpty()) live.remove(key)
        list.mapNotNull { it.get() }.filter { it !== auth }
    }
}

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

/** A read-only value that is recomputed on every read (reads of Compose state inside it subscribe). */
public class PyreonTokenValue internal constructor(private val read: () -> String?) {
    public val value: String? get() = read()
}

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
    /**
     * Claim the redirect URI now. `rememberPyreonOidcAuth` passes false and claims in its effect
     * ([activate]), so a composition Compose abandons before the effect runs never leaks a claim.
     */
    claimOnCreate: Boolean = true,
) {
    public val status: MutableState<String> = mutableStateOf(PyreonOidcStatus.SIGNED_OUT)
    public val subject: MutableState<String?> = mutableStateOf(null)
    private val rawAccessToken: MutableState<String?> = mutableStateOf(null)

    /**
     * The current access token, or null — also once it has EXPIRED (`expiresAt` passed): an expired
     * token is never handed out. Read inside a composable it recomposes like Compose state.
     * [freshAccessToken] (off the main thread) or [refresh] gets a new one.
     */
    public val accessToken: PyreonTokenValue = PyreonTokenValue {
        val exp = expiresAt.value
        val token = rawAccessToken.value
        if (exp != null && exp <= clock()) null else token
    }
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
    // Per client AND issuer: another instance with the same client id at another provider must
    // not read, overwrite or delete this one's stored session.
    private val sessionKey get() = "pyreon.auth.session.$clientId|$issuer"

    // Declared before `init`: rehydration may start a refresh while the object is constructed.
    // This instance's claim on its redirect target (see PyreonRedirectClaims); released by dispose().
    private val redirectClaim: PyreonRedirectToken =
        if (claimOnCreate) PyreonRedirectClaims.claim(redirectUri, issuer) else PyreonRedirectClaims.unclaimed(redirectUri, issuer)
    // The redirect URI cannot be matched safely: every sign-in fails with `invalid_redirect_uri`.
    private val redirectUriValid = PyreonRedirect.target(redirectUri) != null
    // `signOut()` was called: a session another instance stores is not adopted into this one.
    @Volatile private var signedOutExplicitly = false
    // Bumped whenever the session itself changes (commit or clear): a refresh applies its result
    // only to the session it started from.
    @Volatile private var sessionGen = 0
    // A restored session expired: refresh it on first use (`start()`), not in the constructor.
    @Volatile private var launchRefreshPending = false

    init {
        PyreonOidcInstances.add(sessionKey, this)
        if (!redirectUriValid) {
            // A misconfiguration fails at construction, visibly, not at every sign-in.
            status.value = PyreonOidcStatus.ERROR
            error.value = PyreonAuthError.InvalidRedirectUri.code
        } else {
            rehydrate()
        }
    }

    // ---- actions (fire-and-forget for UI; the *Now forms block, for tests) ----

    public fun signIn() { val my = epoch.incrementAndGet(); status.value = PyreonOidcStatus.SIGNING_IN; error.value = null; executor.execute { signInNow(my) } }
    // A refresh does not bump the epoch: two refreshes must not invalidate each other (only
    // sign-in and sign-out do), and they share one request — see refreshNow.
    public fun refresh() { val my = epoch.get(); executor.execute { refreshNow(my) } }

    public fun signInNow(my: Int = epoch.incrementAndGet()) {
        if (!redirectUriValid) {
            fail(PyreonAuthError.InvalidRedirectUri)
            return
        }
        launchRefreshPending = false
        status.value = PyreonOidcStatus.SIGNING_IN
        error.value = null
        try {
            val m = metadata()
            redirectClaim.reclaimIfReleased()
            if (!redirectClaim.advertise(m.issParameterSupported)) throw PyreonAuthError.RedirectShared
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
        redirectClaim.reclaimIfReleased()
        redirectClaim.advertise(m.issParameterSupported)
        // On a redirect URI another provider also uses, only `iss` says who answered: require it.
        val (code, flow) = PyreonAuthCore(store).complete(callback, m.issuer, m.issParameterSupported || redirectClaim.isShared)
        val t = PyreonOidcClient.exchangeCode(m, clientId, flow, code, transport)
        val verified = verify(m, t.idToken, flow.nonce)
        if (my != epoch.get()) return
        commit(t, t.refreshToken, verified)
    }

    /**
     * Run the refresh a restored, expired session needs, once. `rememberPyreonOidcAuth` calls it
     * when the container enters the composition; it is not done in the constructor, which runs for
     * every Activity recreation.
     */
    /**
     * Claim the redirect URI (again, after [dispose] or when constructed with `claimOnCreate =
     * false`) and run the launch refresh. `rememberPyreonOidcAuth` calls it when the container
     * enters the composition.
     */
    public fun activate() {
        redirectClaim.reclaimIfReleased()
        start()
    }

    /**
     * The access token, refreshed first when it has expired (or null: signed out, or the refresh
     * failed — see [status] / [error]). It never returns an expired token. Blocking: it throws
     * `IllegalStateException` when called on the Android main thread.
     */
    public fun freshAccessToken(): String? {
        // On the main thread this would block the UI on a network request (and on another
        // instance's refresh): refuse it instead of risking an ANR.
        check(!isMainThread()) {
            "[Pyreon] auth: freshAccessToken() blocks on the network — call it off the main thread (a coroutine on Dispatchers.IO, an executor), or read accessToken and call refresh()."
        }
        launchRefreshPending = false
        val exp = expiresAt.value
        val expired = exp != null && exp <= clock()
        if ((rawAccessToken.value == null || expired) && refreshToken != null) refreshNow()
        return accessToken.value
    }

    public fun start() {
        if (!launchRefreshPending) return
        launchRefreshPending = false
        refresh()
    }

    /**
     * One refresh in flight per stored session, PROCESS-WIDE: with rotating refresh tokens and
     * reuse detection, two instances (or two calls) presenting the same token would get the whole
     * token family revoked. A caller that finds one running for the same token waits for it and
     * adopts the stored result; a refresh always presents the newest stored token.
     */
    public fun refreshNow(my: Int = epoch.get()) {
        launchRefreshPending = false
        adoptNewerStoredSession()
        val key = sessionKey + "\u0000" + (refreshToken ?: "")
        var owner = false
        val latch = synchronized(INFLIGHT) {
            INFLIGHT[key] ?: java.util.concurrent.CountDownLatch(1).also {
                INFLIGHT[key] = it
                owner = true
            }
        }
        if (!owner) {
            latch.await()
            adoptNewerStoredSession()
            return
        }
        try {
            performRefresh(my)
        } finally {
            synchronized(INFLIGHT) { if (INFLIGHT[key] === latch) INFLIGHT.remove(key) }
            latch.countDown()
        }
    }

    /** Another instance over the same stored session refreshed it: take its result, not the old token. */
    private fun adoptNewerStoredSession() {
        val r = store.read(sessionKey)?.let { PyreonAuthJson.obj(it) } ?: return
        val stored = r["refreshToken"] as? String ?: return
        val access = r["accessToken"] as? String
        if (r["issuer"] != issuer || stored == refreshToken || access.isNullOrEmpty()) return
        // Only the SAME user's session (another instance refreshed it), never into an instance that
        // was signed out: that would switch or resurrect a session silently.
        // Both subjects must be KNOWN and equal: two sessions without an ID token (OAuth2 only)
        // cannot be told apart, so they are never adopted.
        val storedSub = (r["claims"] as? Map<*, *>)?.get("sub") as? String
        if (signedOutExplicitly || storedSub == null || storedSub != subject.value) return
        sessionGen++
        rawAccessToken.value = access
        refreshToken = stored
        (r["idToken"] as? String)?.let { idToken = it }
        @Suppress("UNCHECKED_CAST")
        val c = (r["claims"] as? Map<String, Any?>)?.entries?.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }?.toMap()
        if (c != null) {
            claims.value = c
            subject.value = c["sub"]
        }
        expiresAt.value = PyreonJose.number(r["expiresAt"])
        status.value = PyreonOidcStatus.SIGNED_IN
    }


    private fun performRefresh(my: Int) {
        // A refresh never bumps the epoch, so starting one cannot discard a sign-in in flight. It
        // applies its result only while nothing else happened: no new attempt or sign-out (the
        // epoch) and no other commit (the session generation).
        val gen = sessionGen
        fun stillCurrent() = my == epoch.get() && gen == sessionGen
        try {
            val current = refreshToken ?: throw PyreonAuthError("no_refresh_token", "no refresh token — sign in again")
            val m = metadata()
            val t = PyreonOidcClient.refresh(m, clientId, current, transport)
            // A refreshed ID token carries no nonce (OIDC Core §12.2) but must name the same user.
            val verified = try {
                verify(m, t.idToken, null)
            } catch (e: PyreonAuthError) {
                // The token endpoint already ROTATED the refresh token: keep (and store) the new one
                // even though the new ID token cannot be checked right now, or the retry would
                // present the spent token and a provider with reuse detection would revoke the family.
                if (e.code !in PyreonAuthError.TRANSIENT_REFRESH_CODES) throw e
                if (stillCurrent()) keepRotated(t, t.refreshToken ?: current, e.code)
                return
            }
            val sub = subject.value
            if (verified != null && sub != null && verified["sub"] != sub) {
                throw PyreonAuthError("subject_changed", "refreshed id_token is for a different user")
            }
            if (!stillCurrent()) return
            // Providers may rotate the refresh token; keep the old one when they do not.
            commit(t, t.refreshToken ?: current, verified ?: claims.value)
        } catch (e: Throwable) {
            if (!stillCurrent()) return
            // Offline or the provider unavailable: keep the session (and the stored record) for a
            // retry — status `error` with the code, `refresh()` tries again. Only a refusal (the
            // refresh token rejected or revoked, a bad ID token) ends the session.
            val code = (e as? PyreonAuthError)?.code
            if (code != null && code in PyreonAuthError.TRANSIENT_REFRESH_CODES) {
                error.value = code
                status.value = PyreonOidcStatus.ERROR
            } else {
                fail(e)
            }
        }
    }

    /**
     * Release this instance's claim on its redirect URI (`rememberPyreonOidcAuth` does it when it
     * leaves the composition). The instance is not retired: a later sign-in or callback registers
     * it again.
     */
    public fun dispose() {
        redirectClaim.release()
    }

    /**
     * Clear the session — here and in every other live instance over the same stored session
     * (same client and issuer), which shares the record this removes. Then, in the background,
     * revoke its tokens at the provider when it advertises a `revocation_endpoint` (RFC 7009), and
     * with [endProviderSession] also end the session AT THE PROVIDER (RP-initiated logout) —
     * otherwise the next sign-in completes without a prompt.
     */
    public fun signOut(endProviderSession: Boolean = false) {
        val held = beginSignOut()
        if (held.isEmpty && !endProviderSession) return
        executor.execute { finishSignOut(held, endProviderSession) }
    }

    /** [signOut], blocking until the provider work is done (tests). */
    public fun signOutNow(endProviderSession: Boolean = false) {
        finishSignOut(beginSignOut(), endProviderSession)
    }

    private class HeldTokens(val access: String?, val refresh: String?, val idToken: String?) {
        val isEmpty: Boolean get() = access == null && refresh == null
    }

    private fun beginSignOut(): HeldTokens {
        val held = HeldTokens(rawAccessToken.value, refreshToken, idToken)
        signOutLocally()
        for (other in PyreonOidcInstances.others(sessionKey, this)) if (other.holdsSession) other.signOutLocally()
        return held
    }

    private val holdsSession: Boolean get() = rawAccessToken.value != null || refreshToken != null

    private fun signOutLocally() {
        signedOutExplicitly = true
        epoch.incrementAndGet()
        clear()
        error.value = null
        status.value = PyreonOidcStatus.SIGNED_OUT
    }

    private fun finishSignOut(held: HeldTokens, endProviderSession: Boolean) {
        try {
            // A session restored on relaunch was never discovered, so look the provider up now:
            // skipping the revocation or the logout there would leave them undone.
            val m = metadata()
            if (m.revocationEndpoint != null) {
                // The refresh token first: at most providers that also ends its grant's access tokens.
                held.refresh?.let { t -> runCatching { PyreonOidcClient.revoke(m, clientId, t, "refresh_token", transport) } }
                held.access?.let { t -> runCatching { PyreonOidcClient.revoke(m, clientId, t, "access_token", transport) } }
            }
            if (!endProviderSession) return
            val b = browser ?: return
            val url = PyreonOidcClient.endSessionUrl(m, held.idToken, clientId, postLogoutRedirectUri) ?: return
            b.authorize(url, postLogoutRedirectUri ?: redirectUri)
        } catch (_: Throwable) {}
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

    /** The token response succeeded but its ID token could not be verified yet: keep the new tokens, report the error. */
    private fun keepRotated(t: PyreonTokenSet, refresh: String?, code: String) {
        sessionGen++
        rawAccessToken.value = t.accessToken
        refreshToken = refresh
        expiresAt.value = t.expiresIn?.let { clock() + it * 1000 }
        error.value = code
        status.value = PyreonOidcStatus.ERROR
        persist()
    }

    private fun commit(t: PyreonTokenSet, refresh: String?, verified: Map<String, String>?) {
        signedOutExplicitly = false
        sessionGen++
        refreshToken = refresh
        // A refresh response may omit the ID token; the last one stays the logout hint.
        if (t.idToken != null) idToken = t.idToken else if (status.value != PyreonOidcStatus.SIGNED_IN) idToken = null
        claims.value = verified ?: emptyMap()
        subject.value = verified?.get("sub")
        rawAccessToken.value = t.accessToken
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
        sessionGen++
        rawAccessToken.value = null
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
        val record = linkedMapOf<String, Any?>("issuer" to issuer, "accessToken" to (rawAccessToken.value ?: ""), "claims" to claims.value)
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
        // An expired access token is never exposed; the session waits for its refresh (`start()`).
        rawAccessToken.value = if (expired) null else access
        refreshToken = storedRefresh
        idToken = r["idToken"] as? String
        val c = (r["claims"] as? Map<String, Any?>)?.entries?.mapNotNull { (k, v) -> (v as? String)?.let { k to it } }?.toMap() ?: emptyMap()
        claims.value = c
        subject.value = c["sub"]
        expiresAt.value = exp
        status.value = if (expired) PyreonOidcStatus.SIGNING_IN else PyreonOidcStatus.SIGNED_IN
        // Not refreshed here: the constructor runs for every Activity recreation.
        launchRefreshPending = expired
    }

    public companion object {
        /** One background thread for auth work: requests are sequential per session anyway. */
        private val DEFAULT_EXECUTOR: Executor by lazy {
            Executors.newSingleThreadExecutor { r -> Thread(r, "pyreon-auth").apply { isDaemon = true } }
        }

        /** Whether the caller is on the Android main thread (false on a plain JVM). Replaceable in tests. */
        @Volatile internal var isMainThread: () -> Boolean = {
            try {
                val looper = Class.forName("android.os.Looper")
                looper.getMethod("myLooper").invoke(null) == looper.getMethod("getMainLooper").invoke(null)
            } catch (_: Throwable) {
                false
            }
        }

        /** Refreshes in flight, process-wide, by session key and the refresh token presented. */
        private val INFLIGHT = HashMap<String, java.util.concurrent.CountDownLatch>()
    }
}
