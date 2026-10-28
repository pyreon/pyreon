import Foundation

// Pyreon auth — the OIDC client for the native targets: discovery, the token endpoint
// (authorization code + refresh), RP-initiated logout, and a provider key cache. Each step
// mirrors @pyreon/auth's web module of the same job (src/oidc.ts, src/jwt.ts) and returns
// the same error codes. Network goes through a `PyreonAuthTransport` — by default an
// ephemeral URLSession that refuses redirects — which the smoke tests replace with a fake.
//
// The request/response types are this package's own, not the base runtime's PyreonHttp: in an
// iOS app the base runtime is a SEPARATE Swift module (PyreonRuntime) while co-located package
// sources compile into the app target, so depending on it would need an `import` that only an
// app build can satisfy. Owning two small structs keeps the package self-contained everywhere.

public enum PyreonAuthMethod: String, Sendable { case get = "GET", post = "POST" }

public struct PyreonAuthRequest: Sendable {
    public var method: PyreonAuthMethod
    public var url: String
    public var headers: [String: String]
    public var body: Data?

    public init(method: PyreonAuthMethod = .get, url: String, headers: [String: String] = [:], body: Data? = nil) {
        self.method = method
        self.url = url
        self.headers = headers
        self.body = body
    }

    public static func get(_ url: String, headers: [String: String] = [:]) -> PyreonAuthRequest {
        PyreonAuthRequest(url: url, headers: headers)
    }
}

public struct PyreonAuthResponse: Sendable {
    public let status: Int
    public let body: Data

    public init(status: Int, body: Data = Data()) {
        self.status = status
        self.body = body
    }

    public var isOK: Bool { (200..<300).contains(status) }
}

/// Sends one HTTP request. Implement it to route sign-in through your own HTTP stack.
public protocol PyreonAuthTransport: Sendable {
    func send(_ request: PyreonAuthRequest) async throws -> PyreonAuthResponse
}

/// The default transport: an EPHEMERAL URLSession (no cookie jar shared with the app) that
/// REFUSES redirects — the web sends every auth request with `redirect: 'error'`, because a
/// redirected token request would carry the code and verifier to wherever it points. A 3xx
/// comes back as a non-2xx response and fails the step that made it.
public final class PyreonAuthURLSessionTransport: NSObject, PyreonAuthTransport, URLSessionTaskDelegate, @unchecked Sendable {
    private lazy var session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)

    override public init() {}

    public func send(_ request: PyreonAuthRequest) async throws -> PyreonAuthResponse {
        guard let url = URL(string: request.url) else { throw PyreonAuthError.invalidUrl }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue
        for (k, v) in request.headers { urlRequest.setValue(v, forHTTPHeaderField: k) }
        urlRequest.httpBody = request.body
        urlRequest.cachePolicy = .reloadIgnoringLocalCacheData
        urlRequest.timeoutInterval = 30
        let (data, response) = try await session.data(for: urlRequest)
        return PyreonAuthResponse(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: data)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest) async -> URLRequest? {
        nil
    }
}



/// What the client needs from discovery.
public struct PyreonOidcMetadata: Equatable, Sendable {
    public let issuer: String
    public let authorizationEndpoint: String
    public let tokenEndpoint: String
    public let jwksUri: String?
    public let endSessionEndpoint: String?
    /// RFC 9207 — the provider sends `iss` on the redirect.
    public let issParameterSupported: Bool

    public init(issuer: String, authorizationEndpoint: String, tokenEndpoint: String, jwksUri: String? = nil,
                endSessionEndpoint: String? = nil, issParameterSupported: Bool = false) {
        self.issuer = issuer
        self.authorizationEndpoint = authorizationEndpoint
        self.tokenEndpoint = tokenEndpoint
        self.jwksUri = jwksUri
        self.endSessionEndpoint = endSessionEndpoint
        self.issParameterSupported = issParameterSupported
    }
}

/// A provider key set: parsed JWKs, immutable once built — which is why sharing it across
/// concurrency domains is sound despite `[String: Any]` not being `Sendable`.
public struct PyreonJwkSet: @unchecked Sendable {
    public let keys: [[String: Any]]
    public init(keys: [[String: Any]]) { self.keys = keys }
}

/// A validated token-endpoint response.
public struct PyreonTokenSet: Equatable, Sendable {
    public let accessToken: String
    public let idToken: String?
    public let refreshToken: String?
    /// Lifetime in seconds, when the provider says.
    public let expiresIn: Double?
}

public enum PyreonOidcClient {
    static func json(_ r: PyreonAuthResponse) -> [String: Any]? { PyreonJose.object(r.body) }

    /// One request. A transport failure (no network, DNS, TLS) becomes `network_error` — the
    /// same code the web and Android report — rather than an untyped Error.
    static func send(_ transport: PyreonAuthTransport, _ request: PyreonAuthRequest) async throws -> PyreonAuthResponse {
        do {
            return try await transport.send(request)
        } catch let e as PyreonAuthError {
            throw e
        } catch {
            throw PyreonAuthError("network_error", "request to \(request.url.split(separator: "?").first ?? "") failed")
        }
    }

    /// Fetch + validate OIDC discovery (mirrors the web `discover`): the returned `issuer`
    /// must equal the one asked for, and every advertised endpoint must be https.
    public static func discover(_ issuer: String, transport: PyreonAuthTransport) async throws -> PyreonOidcMetadata {
        let base = try PyreonAuthURL.assertHttps(issuer)
        var path = base.path
        while path.hasSuffix("/") { path.removeLast() }
        var origin = "\(base.scheme ?? "https")://\(base.host ?? "")"
        if let port = base.port { origin += ":\(port)" }
        let res = try await send(transport, .get("\(origin)\(path)/.well-known/openid-configuration", headers: ["accept": "application/json"]))
        if !res.isOK { throw PyreonAuthError("discovery_failed", "discovery returned \(res.status)") }
        guard let m = json(res) else { throw PyreonAuthError("discovery_failed", "discovery document is not a JSON object") }
        let trimmed = issuer.hasSuffix("/") ? String(issuer.dropLast()) : issuer
        guard let got = m["issuer"] as? String, got == trimmed || got == issuer else {
            throw PyreonAuthError("issuer_mismatch", "discovery issuer does not match \"\(issuer)\"")
        }
        guard let auth = m["authorization_endpoint"] as? String, let token = m["token_endpoint"] as? String else {
            throw PyreonAuthError("discovery_failed", "discovery document lacks authorization_endpoint / token_endpoint")
        }
        _ = try PyreonAuthURL.assertHttps(auth)
        _ = try PyreonAuthURL.assertHttps(token)
        for k in ["jwks_uri", "userinfo_endpoint", "end_session_endpoint"] {
            if let v = m[k], !(v is NSNull) {
                guard let s = v as? String else { throw PyreonAuthError("insecure_url", "\(k) is not a URL") }
                _ = try PyreonAuthURL.assertHttps(s)
            }
        }
        return PyreonOidcMetadata(
            issuer: got, authorizationEndpoint: auth, tokenEndpoint: token,
            jwksUri: m["jwks_uri"] as? String, endSessionEndpoint: m["end_session_endpoint"] as? String,
            issParameterSupported: (m["authorization_response_iss_parameter_supported"] as? Bool) == true)
    }

    /// POST to the token endpoint and validate the response (JSON object, a non-empty
    /// `access_token`, `token_type` Bearer) — the same rules as the web `postToken`.
    static func postToken(_ meta: PyreonOidcMetadata, _ form: [(String, String)], transport: PyreonAuthTransport) async throws -> PyreonTokenSet {
        var comps = URLComponents()
        comps.queryItems = form.map { URLQueryItem(name: $0.0, value: $0.1) }
        // URLComponents leaves `+` literal; form encoding must escape it or it reads as a space.
        let body = (comps.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B")
        // The POST carries the code + verifier (or a refresh token): https at USE, like
        // the web, because metadata built directly never went through discovery.
        _ = try PyreonAuthURL.assertHttps(meta.tokenEndpoint)
        let req = PyreonAuthRequest(
            method: .post, url: meta.tokenEndpoint,
            headers: ["content-type": "application/x-www-form-urlencoded", "accept": "application/json"],
            body: Data(body.utf8))
        let res = try await send(transport, req)
        if !res.isOK { throw PyreonAuthError("token_exchange_failed", "token endpoint returned \(res.status)") }
        guard let t = json(res) else { throw PyreonAuthError("bad_token_response", "token response is not a JSON object") }
        guard let access = t["access_token"] as? String, !access.isEmpty,
              (t["token_type"] as? String)?.lowercased() == "bearer"
        else { throw PyreonAuthError("bad_token_response", "token response missing a bearer access_token") }
        return PyreonTokenSet(
            accessToken: access, idToken: t["id_token"] as? String, refreshToken: t["refresh_token"] as? String,
            expiresIn: PyreonJose.number(t["expires_in"]))
    }

    /// Exchange the authorization code (PKCE verifier, public client — no secret).
    public static func exchangeCode(_ meta: PyreonOidcMetadata, clientId: String, flow: PyreonAuthFlow, code: String,
                                    transport: PyreonAuthTransport) async throws -> PyreonTokenSet {
        try await postToken(meta, [
            ("grant_type", "authorization_code"), ("code", code), ("redirect_uri", flow.redirectUri),
            ("client_id", clientId), ("code_verifier", flow.codeVerifier),
        ], transport: transport)
    }

    /// Exchange a refresh token for fresh tokens.
    public static func refresh(_ meta: PyreonOidcMetadata, clientId: String, refreshToken: String,
                               transport: PyreonAuthTransport) async throws -> PyreonTokenSet {
        try await postToken(meta, [
            ("grant_type", "refresh_token"), ("refresh_token", refreshToken), ("client_id", clientId),
        ], transport: transport)
    }

    /// RP-initiated logout URL, or nil when the provider advertises no end-session endpoint.
    public static func endSessionURL(_ meta: PyreonOidcMetadata, idTokenHint: String?, clientId: String?,
                                     postLogoutRedirectUri: String?, state: String? = nil) throws -> URL? {
        guard let endpoint = meta.endSessionEndpoint else { return nil }
        var c = try PyreonAuthURL.assertHttps(endpoint)
        var items = c.queryItems ?? []
        if let idTokenHint, !idTokenHint.isEmpty { items.append(URLQueryItem(name: "id_token_hint", value: idTokenHint)) }
        if let clientId, !clientId.isEmpty { items.append(URLQueryItem(name: "client_id", value: clientId)) }
        if let postLogoutRedirectUri, !postLogoutRedirectUri.isEmpty {
            items.append(URLQueryItem(name: "post_logout_redirect_uri", value: postLogoutRedirectUri))
        }
        if let state, !state.isEmpty { items.append(URLQueryItem(name: "state", value: state)) }
        c.queryItems = items
        return c.url
    }

    /// Fetch the provider key set (the `keys` array of the JWKS document).
    public static func fetchJwks(_ meta: PyreonOidcMetadata, transport: PyreonAuthTransport) async throws -> PyreonJwkSet {
        guard let uri = meta.jwksUri else { throw PyreonAuthError("no_jwks", "provider metadata has no jwks_uri") }
        _ = try PyreonAuthURL.assertHttps(uri)
        let res = try await send(transport, .get(uri))
        if !res.isOK { throw PyreonAuthError("jwks_failed", "jwks returned \(res.status)") }
        guard let doc = json(res), let keys = doc["keys"] as? [Any] else {
            throw PyreonAuthError("jwks_failed", "jwks document has no keys array")
        }
        return PyreonJwkSet(keys: keys.compactMap { $0 as? [String: Any] })
    }
}

/// The provider's key set, cached. Mirrors the web `createJwksCache`: concurrent callers
/// share one in-flight fetch, a failure is not cached, and a token naming an unknown `kid`
/// re-fetches at most once per `minRefresh`, so key rotation needs no restart.
public actor PyreonJwksCache {
    private let meta: PyreonOidcMetadata
    private let transport: PyreonAuthTransport
    private let maxAge: TimeInterval
    private let minRefresh: TimeInterval
    private let clock: @Sendable () -> TimeInterval
    private var cached: PyreonJwkSet?
    private var fetchedAt: TimeInterval = 0
    private var inflight: _Concurrency.Task<PyreonJwkSet, Error>?

    public init(meta: PyreonOidcMetadata, transport: PyreonAuthTransport, maxAge: TimeInterval = 3600,
                minRefresh: TimeInterval = 60, clock: @escaping @Sendable () -> TimeInterval = { Date().timeIntervalSince1970 }) {
        self.meta = meta
        self.transport = transport
        self.maxAge = maxAge
        self.minRefresh = minRefresh
        self.clock = clock
    }

    private func load() async throws -> PyreonJwkSet {
        if let inflight { return try await inflight.value }
        let meta = self.meta, transport = self.transport
        let task = _Concurrency.Task { try await PyreonOidcClient.fetchJwks(meta, transport: transport) }
        inflight = task
        defer { inflight = nil }
        let keys = try await task.value
        cached = keys
        fetchedAt = clock()
        return keys
    }

    public func keys(kid: String?) async throws -> PyreonJwkSet {
        let now = clock()
        guard let cached, now - fetchedAt <= maxAge else { return try await load() }
        if let kid, !kid.isEmpty, !cached.keys.contains(where: { ($0["kid"] as? String) == kid }), now - fetchedAt >= minRefresh {
            return try await load()
        }
        return cached
    }
}

extension PyreonJose {
    /// The `kid` a compact JWS names, or nil. Unverified — used only to pick a key.
    public static func tokenKid(_ token: String) -> String? {
        guard let h = token.split(separator: ".").first, let d = decodeBase64url(String(h)), let o = object(d) else { return nil }
        return o["kid"] as? String
    }
}
