package com.pyreon.runtime

import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

// Pyreon auth — native OIDC/PKCE core (Kotlin twin of PyreonAuth.swift and @pyreon/auth's web logic).
// JVM-only on purpose: no androidx, no org.json, so the same file compiles in the stub gate and on device.
// The pending flow is persisted through a PyreonAuthFlowStore so it survives process death while the
// user is in the system browser. App-facing state is the existing `useAuth` container (PyreonAuth in
// @pyreon/hooks); this file is the mechanism that drives it.

public data class PyreonAuthFlow(
    val state: String,
    val nonce: String,
    val codeVerifier: String,
    val redirectUri: String,
    val issuer: String,
    val createdAtMs: Long,
)

public sealed class PyreonAuthError(message: String) : Exception("[Pyreon] auth: $message") {
    public object InsecureUrl : PyreonAuthError("authorization endpoint must be https")
    public object FlowExpired : PyreonAuthError("authorization attempt expired")
    public class ProviderError(public val code: String) : PyreonAuthError("provider returned \"$code\"")
    public object StateMismatch : PyreonAuthError("state mismatch")
    public object IssuerMismatch : PyreonAuthError("callback iss mismatch (mix-up)")
    public object IssuerMissing : PyreonAuthError("provider advertises iss but callback omitted it")
    public object MissingCode : PyreonAuthError("callback has no code")
    public object UnknownFlow : PyreonAuthError("no pending authorization for this state")
}

/**
 * Where the pending flow lives across the redirect. Same shape as `PyreonSecureBackend`
 * (`@pyreon/storage`), so an Android Keystore-backed backend adapts with a one-line delegate.
 */
public interface PyreonAuthFlowStore {
    public fun write(key: String, value: String): Boolean
    public fun read(key: String): String?
    public fun remove(key: String): Boolean
}

public class InMemoryAuthFlowStore : PyreonAuthFlowStore {
    private val store = HashMap<String, String>()
    override fun write(key: String, value: String): Boolean { store[key] = value; return true }
    override fun read(key: String): String? = store[key]
    override fun remove(key: String): Boolean = store.remove(key) != null
    /** Number of stored entries (flows plus the pending-flow index). */
    public val size: Int get() = store.size
}

public object PyreonPKCE {
    private val rng = SecureRandom()

    /** base64url without padding (RFC 4648 section 5). */
    public fun base64url(bytes: ByteArray): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    public fun randomToken(bytes: Int = 32): String {
        val b = ByteArray(bytes)
        rng.nextBytes(b)
        return base64url(b)
    }

    public fun challengeS256(verifier: String): String =
        base64url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.UTF_8)))

    /** Length-leaking-only comparison of two tokens we generated. */
    public fun constantTimeEqual(a: String, b: String): Boolean =
        MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))
}

public class PyreonAuthCore(private val backend: PyreonAuthFlowStore) {
    public companion object {
        public const val FLOW_TTL_MS: Long = 10 * 60 * 1000
        /** Upper bound on pending flows kept in the backend at once. */
        public const val MAX_PENDING_FLOWS: Int = 16
        private const val INDEX_KEY = "pyreon.auth.flows"
        private fun key(state: String) = "pyreon.auth.flow.$state"
        private fun enc(s: String) = PyreonPKCE.base64url(s.toByteArray(Charsets.UTF_8))
        private fun dec(s: String) = String(Base64.getUrlDecoder().decode(s), Charsets.UTF_8)
    }

    private fun serialize(f: PyreonAuthFlow): String =
        listOf(f.state, f.nonce, f.codeVerifier, f.redirectUri, f.issuer, f.createdAtMs.toString())
            .joinToString(".") { enc(it) }

    private fun deserialize(s: String): PyreonAuthFlow? = try {
        val p = s.split(".").map { dec(it) }
        if (p.size != 6) null else PyreonAuthFlow(p[0], p[1], p[2], p[3], p[4], p[5].toLong())
    } catch (e: IllegalArgumentException) {
        null
    }

    // The backend is persistent (Keystore), and a sign-in the user abandons in the
    // system browser is never completed — without an index its flow would stay
    // stored forever. The index (state -> createdAtMs) lets `begin` sweep expired
    // flows and cap how many are kept. States are base64url, so ':' and ',' are safe
    // separators.
    private fun readIndex(): MutableMap<String, Long> {
        val raw = backend.read(INDEX_KEY) ?: return mutableMapOf()
        val m = mutableMapOf<String, Long>()
        for (e in raw.split(",")) {
            val i = e.indexOf(':')
            if (i <= 0) continue
            e.substring(i + 1).toLongOrNull()?.let { m[e.substring(0, i)] = it }
        }
        return m
    }

    private fun writeIndex(m: Map<String, Long>) {
        if (m.isEmpty()) backend.remove(INDEX_KEY)
        else backend.write(INDEX_KEY, m.entries.joinToString(",") { "${it.key}:${it.value}" })
    }

    // A malformed query (a bad `%` escape) reads as empty — the callback then fails
    // as UnknownFlow, the same as Swift, where URLComponents returns nil.
    private fun query(url: String): Map<String, String> = try {
        val raw = URI(url).rawQuery
        if (raw == null) emptyMap()
        else raw.split("&").filter { it.isNotEmpty() }.associate {
            val i = it.indexOf('=')
            val k = URLDecoder.decode(if (i < 0) it else it.substring(0, i), "UTF-8")
            val v = if (i < 0) "" else URLDecoder.decode(it.substring(i + 1), "UTF-8")
            k to v
        }
    } catch (e: IllegalArgumentException) {
        emptyMap()
    } catch (e: java.net.URISyntaxException) {
        emptyMap()
    }

    /** Build the authorization URL and persist the pending flow. */
    public fun begin(
        authorizationEndpoint: String,
        issuer: String,
        clientId: String,
        redirectUri: String,
        scope: String = "openid profile email",
        nowMs: Long = System.currentTimeMillis(),
    ): String {
        if (!authorizationEndpoint.startsWith("https://")) throw PyreonAuthError.InsecureUrl
        val flow = PyreonAuthFlow(
            PyreonPKCE.randomToken(), PyreonPKCE.randomToken(), PyreonPKCE.randomToken(),
            redirectUri, issuer, nowMs,
        )
        val index = readIndex()
        index.entries.removeAll { (s, t) ->
            val expired = nowMs - t > FLOW_TTL_MS
            if (expired) backend.remove(key(s))
            expired
        }
        while (index.size >= MAX_PENDING_FLOWS) {
            val oldest = index.minByOrNull { it.value }!!.key
            backend.remove(key(oldest))
            index.remove(oldest)
        }
        backend.write(key(flow.state), serialize(flow))
        index[flow.state] = flow.createdAtMs
        writeIndex(index)
        fun e(s: String) = URLEncoder.encode(s, "UTF-8")
        val params = listOf(
            "response_type" to "code", "client_id" to clientId, "redirect_uri" to redirectUri,
            "scope" to scope, "state" to flow.state, "nonce" to flow.nonce,
            "code_challenge" to PyreonPKCE.challengeS256(flow.codeVerifier), "code_challenge_method" to "S256",
        ).joinToString("&") { "${e(it.first)}=${e(it.second)}" }
        val sep = if (authorizationEndpoint.contains("?")) "&" else "?"
        return "$authorizationEndpoint$sep$params"
    }

    /** Validate the redirect. The flow is read-and-deleted: a callback URL can never be replayed. */
    public fun complete(
        callbackUrl: String,
        issuer: String,
        issuerParamSupported: Boolean = false,
        nowMs: Long = System.currentTimeMillis(),
    ): Pair<String, PyreonAuthFlow> {
        val q = query(callbackUrl)
        val state = q["state"] ?: ""
        val raw = backend.read(key(state)) ?: throw PyreonAuthError.UnknownFlow
        // Read-and-delete, including an entry that fails to decode.
        backend.remove(key(state))
        val index = readIndex()
        if (index.remove(state) != null) writeIndex(index)
        val flow = deserialize(raw) ?: throw PyreonAuthError.UnknownFlow
        if (nowMs - flow.createdAtMs > FLOW_TTL_MS) throw PyreonAuthError.FlowExpired
        q["error"]?.let { throw PyreonAuthError.ProviderError(it) }
        if (!PyreonPKCE.constantTimeEqual(state, flow.state)) throw PyreonAuthError.StateMismatch
        val iss = q["iss"]
        if (iss != null) {
            if (iss != issuer) throw PyreonAuthError.IssuerMismatch
        } else if (issuerParamSupported) {
            throw PyreonAuthError.IssuerMissing
        }
        val code = q["code"]
        if (code.isNullOrEmpty()) throw PyreonAuthError.MissingCode
        return code to flow
    }
}
