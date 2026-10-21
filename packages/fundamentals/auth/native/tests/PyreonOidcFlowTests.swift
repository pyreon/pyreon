// End-to-end checks for PyreonOidcAuth against an in-process provider: the real core,
// client, JWKS cache and verifier, with only the network and the browser faked. The fake
// provider enforces what a real one does — PKCE S256 on the code exchange, the nonce bound
// to the code, refresh-token rotation — and signs real ES256 ID tokens.

import AuthenticationServices
import CryptoKit
import Foundation

final class FakeProvider: PyreonAuthTransport, @unchecked Sendable {
    let issuer = "https://idp.example"
    var key = P256.Signing.PrivateKey()
    var kid = "k1"
    var subject = "user-1"
    var nonceOverride: String?
    var rotateRefresh = false
    var refreshStatus = 200
    var jwksFetches = 0
    var requests: [String] = []
    var endSession = true
    private var codes: [String: (challenge: String, nonce: String)] = [:]
    private var refreshCount = 0

    func send(_ r: PyreonAuthRequest) async throws -> PyreonAuthResponse {
        requests.append(r.url)
        func ok(_ o: Any) -> PyreonAuthResponse {
            PyreonAuthResponse(status: 200, body: try! JSONSerialization.data(withJSONObject: o))
        }
        if r.url.hasSuffix("/.well-known/openid-configuration") {
            var m: [String: Any] = ["issuer": issuer, "authorization_endpoint": "\(issuer)/auth",
                                    "token_endpoint": "\(issuer)/token", "jwks_uri": "\(issuer)/jwks"]
            if endSession { m["end_session_endpoint"] = "\(issuer)/logout" }
            return ok(m)
        }
        if r.url.hasSuffix("/jwks") {
            jwksFetches += 1
            let raw = key.publicKey.rawRepresentation
            return ok(["keys": [["kty": "EC", "crv": "P-256", "kid": kid, "alg": "ES256", "use": "sig",
                                 "x": PyreonPKCE.base64url(raw.prefix(32)), "y": PyreonPKCE.base64url(raw.suffix(32))]]])
        }
        let form = Dictionary(uniqueKeysWithValues: (URLComponents(string: "?" + String(decoding: r.body ?? Data(), as: UTF8.self))?
            .queryItems ?? []).map { ($0.name, $0.value ?? "") })
        if form["grant_type"] == "authorization_code" {
            guard let grant = codes.removeValue(forKey: form["code"] ?? ""),
                  PyreonPKCE.challengeS256(form["code_verifier"] ?? "") == grant.challenge
            else { return PyreonAuthResponse(status: 400, body: Data("{\"error\":\"invalid_grant\"}".utf8)) }
            return ok(["access_token": "at-0", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "rt-0",
                       "id_token": idToken(nonce: nonceOverride ?? grant.nonce)])
        }
        if form["grant_type"] == "refresh_token" {
            if refreshStatus != 200 { return PyreonAuthResponse(status: refreshStatus) }
            refreshCount += 1
            var t: [String: Any] = ["access_token": "at-\(refreshCount)", "token_type": "Bearer", "expires_in": 3600,
                                    "id_token": idToken(nonce: nil)]
            if rotateRefresh { t["refresh_token"] = "rt-\(refreshCount)" }
            return ok(t)
        }
        return PyreonAuthResponse(status: 404)
    }

    /// The provider side of the redirect: record the PKCE challenge + nonce, issue a code.
    func authorize(_ url: URL) -> URL {
        let q = Dictionary(uniqueKeysWithValues: (URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [])
            .map { ($0.name, $0.value ?? "") })
        let code = PyreonPKCE.randomToken(bytes: 8)
        codes[code] = (q["code_challenge"] ?? "", q["nonce"] ?? "")
        return URL(string: "\(q["redirect_uri"] ?? "")?code=\(code)&state=\(q["state"] ?? "")&iss=\(issuer)")!
    }

    func idToken(nonce: String?) -> String {
        let now = Date().timeIntervalSince1970
        var claims: [String: Any] = ["iss": issuer, "aud": "app", "sub": subject, "email": "a@example.com",
                                     "iat": Int(now), "exp": Int(now) + 300]
        if let nonce { claims["nonce"] = nonce }
        let h = PyreonPKCE.base64url(try! JSONSerialization.data(withJSONObject: ["alg": "ES256", "kid": kid]))
        let p = PyreonPKCE.base64url(try! JSONSerialization.data(withJSONObject: claims))
        let sig = try! key.signature(for: Data("\(h).\(p)".utf8)).rawRepresentation
        return "\(h).\(p).\(PyreonPKCE.base64url(sig))"
    }
}

@MainActor
final class FakeBrowser: PyreonAuthBrowser {
    let provider: FakeProvider
    var opened: [URL] = []
    var cancel = false
    var beforeReturn: (() -> Void)?
    init(_ provider: FakeProvider) { self.provider = provider }

    func authorize(url: URL, redirectUri: String) async throws -> URL {
        opened.append(url)
        if cancel { throw ASWebAuthenticationSessionError(.canceledLogin) }
        beforeReturn?()
        if url.path == "/logout" { return URL(string: redirectUri)! }
        return provider.authorize(url)
    }
}

@MainActor
enum PyreonOidcFlowTests {
    static func make(_ p: PyreonAuthTransport, _ store: CountingStore, _ b: FakeBrowser) -> PyreonOidcAuth {
        PyreonOidcAuth(issuer: "https://idp.example", clientId: "app", redirectUri: "com.example.app:/oauth",
                       postLogoutRedirectUri: "com.example.app:/bye", store: store, transport: p, browser: b)
    }

    static func run(_ expect: (Bool, String) -> Void) async throws {
        // Sign-in: PKCE + nonce honoured by the provider, the ID token verified, claims exposed.
        let p = FakeProvider(), store = CountingStore(), b = FakeBrowser(p)
        let auth = make(p, store, b)
        expect(auth.status == PyreonOidcStatus.signedOut, "starts signed out")
        await auth.signInNow()
        expect(auth.error == nil, "sign-in error: \(auth.error ?? "")")
        expect(auth.status == PyreonOidcStatus.signedIn && auth.isAuthenticated, "signed in")
        expect(auth.subject == "user-1" && auth.claim("email") == "a@example.com", "verified claims")
        expect(auth.accessToken == "at-0", "access token")
        expect((auth.expiresAt ?? 0) > Date().timeIntervalSince1970 * 1000, "expiresAt in ms")
        expect("\(auth.status)" == "signedIn", "status renders camelCase")
        expect(store.entries["pyreon.auth.session.app"] != nil, "session persisted")
        expect(!store.entries.keys.contains { $0.hasPrefix("pyreon.auth.flow.") }, "pending flow consumed")

        // Rehydrate: a relaunch is signed in from the store, with no network at all.
        let before = p.requests.count
        let relaunched = make(p, store, b)
        expect(relaunched.status == PyreonOidcStatus.signedIn && relaunched.subject == "user-1", "rehydrated")
        expect(relaunched.claim("email") == "a@example.com" && relaunched.accessToken == "at-0", "rehydrated tokens")
        expect(p.requests.count == before, "rehydration makes no request")

        // Refresh keeps the refresh token when not rotated, adopts a rotated one.
        await auth.refreshNow()
        expect(auth.status == PyreonOidcStatus.signedIn && auth.accessToken == "at-1", "refreshed")
        p.rotateRefresh = true
        await auth.refreshNow()
        await auth.refreshNow()
        expect(auth.error == nil && auth.accessToken == "at-3", "rotated refresh used (\(auth.error ?? ""))")

        // A refresh for a different user is refused and clears the session.
        p.subject = "mallory"
        await auth.refreshNow()
        expect(auth.status == PyreonOidcStatus.error && auth.error == "subject_changed", "subject_changed (\(auth.error ?? ""))")
        expect(auth.accessToken == nil && auth.subject == nil, "session cleared")
        expect(store.entries["pyreon.auth.session.app"] == nil, "persisted session removed")
        p.subject = "user-1"

        // No refresh token / provider refusal.
        let fresh = make(FakeProvider(), CountingStore(), b)
        await fresh.refreshNow()
        expect(fresh.error == "no_refresh_token", "no_refresh_token")
        let refused = FakeProvider(), rs = CountingStore(), rb = FakeBrowser(refused)
        let r = make(refused, rs, rb)
        await r.signInNow()
        refused.refreshStatus = 400
        await r.refreshNow()
        expect(r.error == "token_exchange_failed" && r.status == PyreonOidcStatus.error, "refused refresh")

        // An ID token that is not this sign-in's (nonce) never signs in, and nothing is stored.
        let wrong = FakeProvider(), ws = CountingStore()
        wrong.nonceOverride = "someone-else"
        let w = make(wrong, ws, FakeBrowser(wrong))
        await w.signInNow()
        expect(w.status == PyreonOidcStatus.error && w.error == "bad_nonce", "bad_nonce (\(w.error ?? ""))")
        expect(ws.entries["pyreon.auth.session.app"] == nil && w.accessToken == nil, "nothing stored on failure")

        // A transport failure is network_error — the code the web and Android report too.
        let down = make(DownTransport(), CountingStore(), FakeBrowser(FakeProvider()))
        await down.signInNow()
        expect(down.status == PyreonOidcStatus.error && down.error == "network_error", "network_error (\(down.error ?? ""))")

        // The user closing the sheet is a cancellation, not an error state.
        let cp = FakeProvider(), cb = FakeBrowser(cp)
        cb.cancel = true
        let c = make(cp, CountingStore(), cb)
        await c.signInNow()
        expect(c.status == PyreonOidcStatus.signedOut && c.error == "cancelled", "cancelled (\(c.status) \(c.error ?? ""))")

        // signOut during an in-flight sign-in wins: the late result is discarded.
        let lp = FakeProvider(), lb = FakeBrowser(lp), ls = CountingStore()
        let late = make(lp, ls, lb)
        lb.beforeReturn = { late.signOut() }
        await late.signInNow()
        expect(late.status == PyreonOidcStatus.signedOut && late.accessToken == nil, "late result discarded (\(late.status))")
        expect(ls.entries["pyreon.auth.session.app"] == nil, "late result not persisted")
        // …and the code is never even exchanged once the attempt is stale.
        expect(!lp.requests.contains { $0.hasSuffix("/token") }, "no token exchange after signOut")

        // Provider logout carries id_token_hint and the registered post-logout redirect.
        let op = FakeProvider(), ob = FakeBrowser(op)
        let o = make(op, CountingStore(), ob)
        await o.signInNow()
        o.signOut(endProviderSession: true)
        for _ in 0..<50 where ob.opened.count < 2 { await _Concurrency.Task.yield() }
        let logout = ob.opened.last.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
        expect(logout?.path == "/logout", "provider logout opened")
        let items = Dictionary(uniqueKeysWithValues: (logout?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        expect((items["id_token_hint"] ?? "").split(separator: ".").count == 3, "id_token_hint sent")
        expect(items["post_logout_redirect_uri"] == "com.example.app:/bye" && items["client_id"] == "app", "logout params")
        expect(o.status == PyreonOidcStatus.signedOut && o.accessToken == nil, "signed out locally")

        // An expired session with no refresh token is dropped on relaunch, not restored.
        let es = CountingStore()
        es.entries["pyreon.auth.session.app"] = #"{"issuer":"https://idp.example","accessToken":"x","expiresAt":1,"claims":{"sub":"u"}}"#
        let expired = make(FakeProvider(), es, b)
        expect(expired.status == PyreonOidcStatus.signedOut && es.entries.isEmpty, "expired session dropped")
        // …and a session for another issuer is never trusted.
        es.entries["pyreon.auth.session.app"] = #"{"issuer":"https://evil.example","accessToken":"x","claims":{"sub":"u"}}"#
        let foreign = make(FakeProvider(), es, b)
        expect(foreign.status == PyreonOidcStatus.signedOut && es.entries.isEmpty, "foreign-issuer session dropped")

        // Key rotation: an unknown kid re-fetches the keys once the throttle allows it.
        let kp = FakeProvider()
        let t = Clock()
        let meta = try await PyreonOidcClient.discover(kp.issuer, transport: kp)
        let cache = PyreonJwksCache(meta: meta, transport: kp, minRefresh: 60, clock: { t.now })
        _ = try await cache.keys(kid: "k1")
        kp.kid = "k2"
        _ = try await cache.keys(kid: "k2")
        expect(kp.jwksFetches == 1, "unknown kid inside the throttle does not re-fetch")
        t.now += 60
        let rotated = try await cache.keys(kid: "k2")
        expect(kp.jwksFetches == 2 && rotated.keys.first?["kid"] as? String == "k2", "rotation re-fetch")
        async let a1 = cache.keys(kid: nil)
        async let a2 = cache.keys(kid: nil)
        _ = try await (a1, a2)
        expect(kp.jwksFetches == 2, "cached set served")
    }
}

final class Clock: @unchecked Sendable {
    var now: TimeInterval = 1000
}

struct DownTransport: PyreonAuthTransport {
    func send(_ request: PyreonAuthRequest) async throws -> PyreonAuthResponse { throw URLError(.cannotFindHost) }
}
