package com.pyreon.runtime

import java.net.URLEncoder

// Pyreon auth — the OIDC client for Android: discovery, the token endpoint (authorization
// code + refresh), RP-initiated logout, and a provider key cache. Kotlin twin of
// PyreonOidcClient.swift; each step mirrors @pyreon/auth's web module of the same job and
// returns the same error codes. Network goes through a [PyreonAuthTransport] — by default
// HttpURLConnection with redirects refused — which the smoke tests replace with a fake. Calls
// BLOCK; the container runs them off the main thread. The request/response types are this
// package's own (as on iOS, where the base runtime is a separate module), so the auth runtime
// depends on nothing but the JDK and @pyreon/storage.

public enum class PyreonAuthMethod(public val verb: String) { GET("GET"), POST("POST") }

public data class PyreonAuthRequest(
    val method: PyreonAuthMethod = PyreonAuthMethod.GET,
    val url: String,
    val headers: Map<String, String> = emptyMap(),
    val body: String? = null,
) {
    public companion object {
        public fun get(url: String, headers: Map<String, String> = emptyMap()): PyreonAuthRequest =
            PyreonAuthRequest(PyreonAuthMethod.GET, url, headers)

        public fun post(url: String, body: String, headers: Map<String, String> = emptyMap()): PyreonAuthRequest =
            PyreonAuthRequest(PyreonAuthMethod.POST, url, headers, body)
    }
}

public data class PyreonAuthResponse(val status: Int, val body: String = "") {
    public val isOk: Boolean get() = status in 200..299
}

/** Sends one HTTP request. Implement it to route sign-in through your own HTTP stack. Blocking. */
public fun interface PyreonAuthTransport {
    public fun send(request: PyreonAuthRequest): PyreonAuthResponse
}

/**
 * The default transport: `HttpURLConnection`, with redirects REFUSED — the web sends every auth
 * request with `redirect: 'error'`, because a redirected token request would carry the code and
 * verifier to wherever it points; a 3xx comes back as a non-2xx response and fails the step.
 * Dependency-free on purpose: sign-in must not depend on the host app having installed an
 * executor for the shared `PyreonHttp` (on Android it throws until one is).
 */
public object PyreonUrlConnectionAuthTransport : PyreonAuthTransport {
    override fun send(request: PyreonAuthRequest): PyreonAuthResponse {
        val c = java.net.URL(request.url).openConnection() as java.net.HttpURLConnection
        try {
            c.instanceFollowRedirects = false
            c.useCaches = false
            c.connectTimeout = 30_000
            c.readTimeout = 30_000
            c.requestMethod = request.method.verb
            for ((k, v) in request.headers) c.setRequestProperty(k, v)
            val body = request.body
            if (body != null) {
                c.doOutput = true
                c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = c.responseCode
            val stream = if (status >= 400) c.errorStream else c.inputStream
            val text = stream?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
            return PyreonAuthResponse(status, text)
        } finally {
            c.disconnect()
        }
    }
}



/** What the client needs from discovery. */
public data class PyreonOidcMetadata(
    val issuer: String,
    val authorizationEndpoint: String,
    val tokenEndpoint: String,
    val jwksUri: String? = null,
    val endSessionEndpoint: String? = null,
    /** RFC 9207 — the provider sends `iss` on the redirect. */
    val issParameterSupported: Boolean = false,
)

/** A validated token-endpoint response. */
public data class PyreonTokenSet(
    val accessToken: String,
    val idToken: String?,
    val refreshToken: String?,
    /** Lifetime in seconds, when the provider says. */
    val expiresIn: Double?,
)

public object PyreonOidcClient {
    private fun json(r: PyreonAuthResponse): Map<String, Any?>? = PyreonAuthJson.obj(r.body)

    /**
     * One request. A transport failure (no network, DNS, TLS, no executor installed) becomes
     * `network_error` — the same code the web and iOS report.
     */
    internal fun send(transport: PyreonAuthTransport, request: PyreonAuthRequest): PyreonAuthResponse = try {
        transport.send(request)
    } catch (e: PyreonAuthError) {
        throw e
    } catch (e: Exception) {
        throw PyreonAuthError("network_error", "request to ${request.url.substringBefore('?')} failed")
    }

    /** Fetch + validate OIDC discovery — the returned `issuer` must equal the one asked for. */
    public fun discover(issuer: String, transport: PyreonAuthTransport): PyreonOidcMetadata {
        val base = PyreonAuthUrl.assertHttps(issuer)
        val path = (base.rawPath ?: "").trimEnd('/')
        val port = if (base.port >= 0) ":${base.port}" else ""
        val res = send(transport, 
            PyreonAuthRequest.get("${base.scheme}://${base.host}$port$path/.well-known/openid-configuration", mapOf("accept" to "application/json")),
        )
        if (!res.isOk) throw PyreonAuthError("discovery_failed", "discovery returned ${res.status}")
        val m = json(res) ?: throw PyreonAuthError("discovery_failed", "discovery document is not a JSON object")
        val got = m["issuer"]
        if (got !is String || (got != issuer.trimEnd('/') && got != issuer)) {
            throw PyreonAuthError("issuer_mismatch", "discovery issuer does not match \"$issuer\"")
        }
        val auth = m["authorization_endpoint"]
        val token = m["token_endpoint"]
        if (auth !is String || token !is String) {
            throw PyreonAuthError("discovery_failed", "discovery document lacks authorization_endpoint / token_endpoint")
        }
        PyreonAuthUrl.assertHttps(auth)
        PyreonAuthUrl.assertHttps(token)
        for (k in listOf("jwks_uri", "userinfo_endpoint", "end_session_endpoint")) {
            val v = m[k]
            if (v == null || v === PyreonJsonNull) continue
            if (v !is String) throw PyreonAuthError("insecure_url", "$k is not a URL")
            PyreonAuthUrl.assertHttps(v)
        }
        return PyreonOidcMetadata(
            issuer = got,
            authorizationEndpoint = auth,
            tokenEndpoint = token,
            jwksUri = m["jwks_uri"] as? String,
            endSessionEndpoint = m["end_session_endpoint"] as? String,
            issParameterSupported = m["authorization_response_iss_parameter_supported"] == true,
        )
    }

    /** POST to the token endpoint and validate the response — the same rules as the web `postToken`. */
    private fun postToken(meta: PyreonOidcMetadata, form: List<Pair<String, String>>, transport: PyreonAuthTransport): PyreonTokenSet {
        val body = form.joinToString("&") { "${URLEncoder.encode(it.first, "UTF-8")}=${URLEncoder.encode(it.second, "UTF-8")}" }
        val res = send(transport, 
            PyreonAuthRequest.post(
                meta.tokenEndpoint,
                body,
                mapOf("content-type" to "application/x-www-form-urlencoded", "accept" to "application/json"),
            ),
        )
        if (!res.isOk) throw PyreonAuthError("token_exchange_failed", "token endpoint returned ${res.status}")
        val t = json(res) ?: throw PyreonAuthError("bad_token_response", "token response is not a JSON object")
        val access = t["access_token"]
        val type = t["token_type"]
        if (access !is String || access.isEmpty() || type !is String || type.lowercase() != "bearer") {
            throw PyreonAuthError("bad_token_response", "token response missing a bearer access_token")
        }
        return PyreonTokenSet(access, t["id_token"] as? String, t["refresh_token"] as? String, PyreonJose.number(t["expires_in"]))
    }

    /** Exchange the authorization code (PKCE verifier, public client — no secret). */
    public fun exchangeCode(meta: PyreonOidcMetadata, clientId: String, flow: PyreonAuthFlow, code: String, transport: PyreonAuthTransport): PyreonTokenSet =
        postToken(
            meta,
            listOf(
                "grant_type" to "authorization_code", "code" to code, "redirect_uri" to flow.redirectUri,
                "client_id" to clientId, "code_verifier" to flow.codeVerifier,
            ),
            transport,
        )

    /** Exchange a refresh token for fresh tokens. */
    public fun refresh(meta: PyreonOidcMetadata, clientId: String, refreshToken: String, transport: PyreonAuthTransport): PyreonTokenSet =
        postToken(meta, listOf("grant_type" to "refresh_token", "refresh_token" to refreshToken, "client_id" to clientId), transport)

    /** RP-initiated logout URL, or null when the provider advertises no end-session endpoint. */
    public fun endSessionUrl(
        meta: PyreonOidcMetadata,
        idTokenHint: String?,
        clientId: String?,
        postLogoutRedirectUri: String?,
        state: String? = null,
    ): String? {
        val endpoint = meta.endSessionEndpoint ?: return null
        PyreonAuthUrl.assertHttps(endpoint)
        fun e(s: String) = URLEncoder.encode(s, "UTF-8")
        val params = listOfNotNull(
            idTokenHint?.takeIf { it.isNotEmpty() }?.let { "id_token_hint" to it },
            clientId?.takeIf { it.isNotEmpty() }?.let { "client_id" to it },
            postLogoutRedirectUri?.takeIf { it.isNotEmpty() }?.let { "post_logout_redirect_uri" to it },
            state?.takeIf { it.isNotEmpty() }?.let { "state" to it },
        )
        if (params.isEmpty()) return endpoint
        val sep = if (endpoint.contains("?")) "&" else "?"
        return endpoint + sep + params.joinToString("&") { "${e(it.first)}=${e(it.second)}" }
    }

    /** Fetch the provider key set (the `keys` array of the JWKS document). */
    @Suppress("UNCHECKED_CAST")
    public fun fetchJwks(meta: PyreonOidcMetadata, transport: PyreonAuthTransport): List<Map<String, Any?>> {
        val uri = meta.jwksUri ?: throw PyreonAuthError("no_jwks", "provider metadata has no jwks_uri")
        PyreonAuthUrl.assertHttps(uri)
        val res = send(transport, PyreonAuthRequest.get(uri))
        if (!res.isOk) throw PyreonAuthError("jwks_failed", "jwks returned ${res.status}")
        val keys = json(res)?.get("keys") as? List<*> ?: throw PyreonAuthError("jwks_failed", "jwks document has no keys array")
        return keys.mapNotNull { it as? Map<String, Any?> }
    }
}

/**
 * The provider's key set, cached. Mirrors the web `createJwksCache`: concurrent callers share
 * one fetch, a failure is not cached, and an unknown `kid` re-fetches at most once per
 * [minRefreshMs], so key rotation needs no restart.
 */
public class PyreonJwksCache(
    private val meta: PyreonOidcMetadata,
    private val transport: PyreonAuthTransport,
    private val maxAgeMs: Long = 3_600_000,
    private val minRefreshMs: Long = 60_000,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private val lock = Any()
    private var cached: List<Map<String, Any?>>? = null
    private var fetchedAt = 0L

    /** The current key set; re-fetched when stale, or once when [kid] is unknown (rotation). */
    public fun keys(kid: String?): List<Map<String, Any?>> = synchronized(lock) {
        // One fetch at a time: concurrent callers block on the lock and then find it fresh.
        val now = clock()
        val c = cached
        val rotated = c != null && !kid.isNullOrEmpty() && c.none { it["kid"] == kid } && now - fetchedAt >= minRefreshMs
        if (c != null && now - fetchedAt <= maxAgeMs && !rotated) {
            c
        } else {
            val keys = PyreonOidcClient.fetchJwks(meta, transport)
            cached = keys
            fetchedAt = clock()
            keys
        }
    }
}

/** The `kid` a compact JWS names, or null. Unverified — used only to pick a key. */
public fun PyreonJose.tokenKid(token: String): String? {
    val h = token.substringBefore('.')
    val bytes = decodeBase64url(h) ?: return null
    return PyreonAuthJson.obj(bytes)?.get("kid") as? String
}
