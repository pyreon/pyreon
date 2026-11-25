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
    var advertiseIss = false
    /// Issue a fresh refresh token per sign-in (a real provider does), and delay refresh responses.
    var uniqueRefreshTokens = false
    var refreshDelayNanos: UInt64 = 0
    var jwksStatus = 200
    var refreshExpiresIn = 3600
    var presentedRefreshTokens: [String] = []
    private var codeCount = 0
    var rotateRefresh = false
    var refreshStatus = 200
    var jwksFetches = 0
    var requests: [String] = []
    var endSession = true
    /// Advertise an RFC 7009 revocation_endpoint answering with this status.
    var revocationStatus: Int?
    var revoked: [[String: String]] = []
    /// Runs on the main actor while a token request is in flight, with its grant type (a sign-out racing it).
    var duringToken: (@MainActor (String) -> Void)?
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
            if advertiseIss { m["authorization_response_iss_parameter_supported"] = true }
            if revocationStatus != nil { m["revocation_endpoint"] = "\(issuer)/revoke" }
            return ok(m)
        }
        if r.url.hasSuffix("/jwks") {
            if jwksStatus != 200 { return PyreonAuthResponse(status: jwksStatus) }
            jwksFetches += 1
            let raw = key.publicKey.rawRepresentation
            return ok(["keys": [["kty": "EC", "crv": "P-256", "kid": kid, "alg": "ES256", "use": "sig",
                                 "x": PyreonPKCE.base64url(raw.prefix(32)), "y": PyreonPKCE.base64url(raw.suffix(32))]]])
        }
        let form = Dictionary(uniqueKeysWithValues: (URLComponents(string: "?" + String(decoding: r.body ?? Data(), as: UTF8.self))?
            .queryItems ?? []).map { ($0.name, $0.value ?? "") })
        if let g = form["grant_type"], let hook = duringToken {
            duringToken = nil
            await MainActor.run { hook(g) }
        }
        if r.url.hasSuffix("/revoke") {
            revoked.append(form)
            return PyreonAuthResponse(status: revocationStatus ?? 404)
        }
        if form["grant_type"] == "authorization_code" {
            guard let grant = codes.removeValue(forKey: form["code"] ?? ""),
                  PyreonPKCE.challengeS256(form["code_verifier"] ?? "") == grant.challenge
            else { return PyreonAuthResponse(status: 400, body: Data("{\"error\":\"invalid_grant\"}".utf8)) }
            codeCount += 1
            return ok(["access_token": "at-0", "token_type": "Bearer", "expires_in": 3600,
                       "refresh_token": uniqueRefreshTokens ? "rt-c\(codeCount)" : "rt-0",
                       "id_token": idToken(nonce: nonceOverride ?? grant.nonce)])
        }
        if form["grant_type"] == "refresh_token" {
            presentedRefreshTokens.append(form["refresh_token"] ?? "")
            if refreshStatus != 200 { return PyreonAuthResponse(status: refreshStatus) }
            if refreshDelayNanos > 0 { try? await _Concurrency.Task.sleep(nanoseconds: refreshDelayNanos) }
            refreshCount += 1
            var t: [String: Any] = ["access_token": "at-\(refreshCount)", "token_type": "Bearer", "expires_in": refreshExpiresIn,
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
    /// Rewrite the callback (e.g. drop `iss`, as a provider that does not send it would).
    var rewrite: ((URL) -> URL)?
    init(_ provider: FakeProvider) { self.provider = provider }

    func authorize(url: URL, redirectUri: String) async throws -> URL {
        opened.append(url)
        if cancel { throw ASWebAuthenticationSessionError(.canceledLogin) }
        beforeReturn?()
        if url.path == "/logout" { return URL(string: redirectUri)! }
        let back = provider.authorize(url)
        return rewrite?(back) ?? back
    }
}

@MainActor
enum PyreonOidcFlowTests {
    static func make(_ p: PyreonAuthTransport, _ store: PyreonSecureBackend, _ b: FakeBrowser) -> PyreonOidcAuth {
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
        expect(store.entries["pyreon.auth.session.app|https://idp.example"] != nil, "session persisted")
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
        expect(store.entries["pyreon.auth.session.app|https://idp.example"] == nil, "persisted session removed")
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
        expect(ws.entries["pyreon.auth.session.app|https://idp.example"] == nil && w.accessToken == nil, "nothing stored on failure")

        // A transport failure is network_error — the code the web and Android report too.
        let down = make(DownTransport(), CountingStore(), FakeBrowser(FakeProvider()))
        await down.signInNow()
        expect(down.status == PyreonOidcStatus.error && down.error == "network_error", "network_error (\(down.error ?? ""))")

        // Metadata built directly (no discovery) with an http token endpoint is refused at
        // USE, before any request is sent — the same rule as the web `postToken`.
        let counting = CountingTransport()
        let insecure = PyreonOidcMetadata(issuer: "http://evil.example", authorizationEndpoint: "https://idp.example/auth",
                                          tokenEndpoint: "http://evil.example/token")
        for (label, call) in [
            ("refresh", { _ = try await PyreonOidcClient.refresh(insecure, clientId: "app", refreshToken: "rt", transport: counting) }),
            ("exchangeCode", {
                let flow = PyreonAuthFlow(state: "s", nonce: "n", codeVerifier: "v", redirectUri: "r", issuer: "http://evil.example", createdAt: 0)
                _ = try await PyreonOidcClient.exchangeCode(insecure, clientId: "app", flow: flow, code: "c", transport: counting)
            }),
        ] as [(String, () async throws -> Void)] {
            do { try await call(); expect(false, "\(label): http token endpoint accepted") }
            catch let e as PyreonAuthError { expect(e.code == "insecure_url", "\(label): insecure_url (\(e.code))") }
        }
        expect(counting.count == 0, "no request reached an http token endpoint (\(counting.count))")
        let loopback = PyreonOidcMetadata(issuer: "http://127.0.0.1", authorizationEndpoint: "http://127.0.0.1/auth",
                                          tokenEndpoint: "http://127.0.0.1:8080/token")
        _ = try? await PyreonOidcClient.refresh(loopback, clientId: "app", refreshToken: "rt", transport: counting)
        expect(counting.count == 1, "loopback http still reaches the transport (local development)")

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
        expect(ls.entries["pyreon.auth.session.app|https://idp.example"] == nil, "late result not persisted")
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

        // After a relaunch the session is restored without discovery; provider logout still happens.
        let lop = FakeProvider(), lob = FakeBrowser(lop), los = CountingStore()
        await make(lop, los, lob).signInNow()
        let restored = make(lop, los, lob)
        let openedBefore = lob.opened.count
        restored.signOut(endProviderSession: true)
        for _ in 0..<500 where lob.opened.count == openedBefore { await _Concurrency.Task.yield() }
        expect(lob.opened.count == openedBefore + 1 && lob.opened.last?.path == "/logout", "provider logout opened after a relaunch")

        // Sign-out revokes the refresh and then the access token when the provider advertises
        // revocation (RFC 7009); a refused revocation still signs out; none without the endpoint.
        let rvp = FakeProvider(), rvb = FakeBrowser(rvp)
        rvp.revocationStatus = 200
        let rv = make(rvp, CountingStore(), rvb)
        await rv.signInNow()
        await rv.signOutNow()
        expect(rv.status == PyreonOidcStatus.signedOut && rv.accessToken == nil, "signed out locally")
        expect(rvp.revoked == [["token": "rt-0", "client_id": "app", "token_type_hint": "refresh_token"],
                               ["token": "at-0", "client_id": "app", "token_type_hint": "access_token"]],
               "refresh then access token revoked: \(rvp.revoked)")
        let rfp = FakeProvider(), rfb = FakeBrowser(rfp)
        rfp.revocationStatus = 400
        let rf = make(rfp, CountingStore(), rfb)
        await rf.signInNow()
        await rf.signOutNow()
        expect(rf.status == PyreonOidcStatus.signedOut && rfp.revoked.count == 2, "a refused revocation still signs out")
        let nrp = FakeProvider(), nrb = FakeBrowser(nrp)
        let nr = make(nrp, CountingStore(), nrb)
        await nr.signInNow()
        await nr.signOutNow()
        expect(!nrp.requests.contains { $0.hasSuffix("/revoke") }, "no revocation without an advertised endpoint")

        // Two containers over one stored session: a sign-out in one removes the record both read,
        // so the other signs out too and cannot refresh back.
        let shp = FakeProvider(), shb = FakeBrowser(shp), shs = CountingStore()
        let first = make(shp, shs, shb)
        await first.signInNow()
        let second = make(shp, shs, shb)
        expect(second.status == PyreonOidcStatus.signedIn, "the second instance restored the session")
        first.signOut()
        expect(second.status == PyreonOidcStatus.signedOut && second.accessToken == nil && second.subject == nil,
               "the other instance signed out (\(second.status))")
        let soTokenPosts = shp.requests.filter { $0.hasSuffix("/token") }.count
        await second.refreshNow()
        expect(second.status != PyreonOidcStatus.signedIn && shp.requests.filter { $0.hasSuffix("/token") }.count == soTokenPosts,
               "and cannot refresh back")

        // A session is defined by where it is persisted: the same client and issuer over two
        // different stores are two sessions; a sign-out in one neither signs out nor revokes the other.
        let dsp = FakeProvider(), dsb = FakeBrowser(dsp)
        dsp.revocationStatus = 200
        dsp.uniqueRefreshTokens = true
        let mine = make(dsp, CountingStore(), dsb)
        let theirs = make(dsp, CountingStore(), dsb)
        await mine.signInNow() // rt-c1
        await theirs.signInNow() // rt-c2
        await mine.signOutNow()
        expect(theirs.status == PyreonOidcStatus.signedIn && theirs.accessToken != nil,
               "the other store's session stays signed in (\(theirs.status))")
        let dsRevoked = dsp.revoked.compactMap { $0["token"] }
        expect(dsRevoked.contains("rt-c1"), "this store's refresh token is revoked: \(dsRevoked)")
        expect(!dsRevoked.contains("rt-c2"), "the other store's refresh token is not revoked: \(dsRevoked)")
        await theirs.signOutNow()
        // Two backend OBJECTS over one location are one store: a sibling there still signs out.
        let locShared = SharedEntries()
        let lsp = FakeProvider(), lsb = FakeBrowser(lsp)
        let one = make(lsp, LocatedStore(location: "test:shared", entries: locShared), lsb)
        await one.signInNow()
        let two = make(lsp, LocatedStore(location: "test:shared", entries: locShared), lsb)
        expect(two.status == PyreonOidcStatus.signedIn, "restored through the second backend object")
        await one.signOutNow()
        expect(two.status == PyreonOidcStatus.signedOut && two.accessToken == nil, "the sibling over the same location signed out")

        // A sibling refreshed (and rotated) the session: the instance signing out holds only the
        // spent tokens; the live ones are in the sibling and the store, and are revoked too.
        let svp = FakeProvider(), svb = FakeBrowser(svp), svs = CountingStore()
        svp.revocationStatus = 200
        svp.rotateRefresh = true
        let stale = make(svp, svs, svb)
        await stale.signInNow()
        let sib = make(svp, svs, svb)
        await sib.refreshNow()
        expect(sib.accessToken == "at-1", "the sibling refreshed (\(sib.error ?? ""))")
        await stale.signOutNow()
        expect(Set(svp.revoked.compactMap { $0["token"] }) == ["rt-0", "at-0", "rt-1", "at-1"],
               "every instance's and the store's tokens revoked: \(svp.revoked)")
        expect(sib.status == PyreonOidcStatus.signedOut, "the sibling signed out")
        // The instance signing out holds nothing, a sibling does: still revoked (no early return).
        let hvp = FakeProvider(), hvs = CountingStore()
        hvp.revocationStatus = 200
        let emptyInst = make(hvp, hvs, FakeBrowser(hvp))
        let holder = make(hvp, hvs, FakeBrowser(hvp))
        await holder.signInNow()
        await emptyInst.signOutNow()
        expect(Set(hvp.revoked.compactMap { $0["token"] }) == ["rt-0", "at-0"], "revoked from the sibling: \(hvp.revoked)")
        expect(holder.status == PyreonOidcStatus.signedOut, "the holder signed out")

        // A code exchange in flight when the user signs out: its tokens are revoked, not dropped.
        let lxp = FakeProvider(), lxb = FakeBrowser(lxp)
        lxp.revocationStatus = 200
        let lx = make(lxp, CountingStore(), lxb)
        lxp.duringToken = { _ in lx.signOut() }
        await lx.signInNow()
        for _ in 0..<500 where lx.pendingRevocations > 0 { await _Concurrency.Task.yield() }
        expect(lx.status == PyreonOidcStatus.signedOut && lx.accessToken == nil, "the late sign-in is discarded")
        expect(Set(lxp.revoked.compactMap { $0["token"] }) == ["rt-0", "at-0"], "its tokens revoked: \(lxp.revoked)")
        // A refresh in flight: sign-out revokes what the session held, the refresh's tokens when they land.
        let lrp = FakeProvider(), lrb = FakeBrowser(lrp)
        lrp.revocationStatus = 200
        lrp.rotateRefresh = true
        let lr = make(lrp, CountingStore(), lrb)
        await lr.signInNow()
        lrp.duringToken = { _ in lr.signOut() }
        await lr.refreshNow()
        for _ in 0..<500 where lr.pendingRevocations > 0 || lrp.revoked.count < 4 { await _Concurrency.Task.yield() }
        expect(lr.status == PyreonOidcStatus.signedOut && lr.accessToken == nil, "the late refresh is discarded")
        expect(Set(lrp.revoked.compactMap { $0["token"] }) == ["rt-0", "at-0", "rt-1", "at-1"], "held and late tokens revoked: \(lrp.revoked)")

        // Concurrent refreshes share one request (rotating refresh tokens + reuse detection).
        let concP = FakeProvider(), concB = FakeBrowser(concP)
        concP.rotateRefresh = true
        let conc = make(concP, CountingStore(), concB)
        await conc.signInNow()
        let tokenPostsBefore = concP.requests.filter { $0.hasSuffix("/token") }.count
        async let r1: Void = conc.refreshNow()
        async let r2: Void = conc.refreshNow()
        async let r3: Void = conc.refreshNow()
        _ = await (r1, r2, r3)
        expect(concP.requests.filter { $0.hasSuffix("/token") }.count == tokenPostsBefore + 1, "concurrent refreshes share one request")
        expect(conc.accessToken == "at-1" && conc.error == nil, "refreshed once (\(conc.error ?? ""))")

        // The stored session is keyed by client AND issuer: an instance with the same client id at
        // another provider neither sees nor deletes it.
        let keyP = FakeProvider(), keyB = FakeBrowser(keyP), keyStore = CountingStore()
        await make(keyP, keyStore, keyB).signInNow()
        let otherIssuer = PyreonOidcAuth(issuer: "https://other.example", clientId: "app", redirectUri: "com.example.app:/oauth",
                                         store: keyStore, transport: keyP, browser: keyB)
        expect(otherIssuer.status == PyreonOidcStatus.signedOut, "another issuer's instance does not restore this session")
        otherIssuer.signOut()
        otherIssuer.dispose()
        expect(keyStore.entries["pyreon.auth.session.app|https://idp.example"] != nil, "another issuer's instance does not delete this session")

        // N1 (mix-up on a shared native redirect URI): a second provider on the same
        // nativeRedirectUri, and this one does not send `iss` — its sign-in is refused before the
        // browser opens, so no code can reach its token endpoint.
        PyreonRedirectClaims.shared.reset()
        let mixP = FakeProvider(), mixB = FakeBrowser(mixP)
        let otherProvider = PyreonOidcAuth(issuer: "https://honest.example", clientId: "app", redirectUri: "com.example.app:/oauth",
                                           store: CountingStore(), transport: mixP, browser: mixB)
        let sharer = make(mixP, CountingStore(), mixB)
        await sharer.signInNow()
        expect(sharer.error == "redirect_shared", "a provider without iss on a shared native redirect URI is refused (\(sharer.error ?? "nil"))")
        expect(mixB.opened.isEmpty && !mixP.requests.contains { $0.hasSuffix("/token") }, "no browser, no token request")
        otherProvider.dispose()
        await sharer.signInNow()
        expect(sharer.status == PyreonOidcStatus.signedIn, "after the other provider is disposed the redirect URI is not shared (\(sharer.error ?? "nil"))")

        // Providers that send `iss` may share one; a callback without `iss` is then refused.
        PyreonRedirectClaims.shared.reset()
        let tenP = FakeProvider(), tenB = FakeBrowser(tenP)
        tenP.advertiseIss = true
        let tenantTwo = PyreonOidcAuth(issuer: "https://other.example", clientId: "app", redirectUri: "com.example.app:/oauth",
                                       store: CountingStore(), transport: tenP, browser: tenB)
        let tenantOne = make(tenP, CountingStore(), tenB)
        await tenantOne.signInNow()
        expect(tenantOne.status == PyreonOidcStatus.signedIn, "providers that send iss may share a redirect URI (\(tenantOne.error ?? "nil"))")
        tenB.rewrite = { u in
            var c = URLComponents(url: u, resolvingAgainstBaseURL: false)!
            c.queryItems = c.queryItems?.filter { $0.name != "iss" }
            return c.url!
        }
        await tenantOne.signInNow()
        expect(tenantOne.error == "issuer_missing", "on a shared redirect URI a callback without iss is refused (\(tenantOne.error ?? "nil"))")
        tenantTwo.dispose()
        PyreonRedirectClaims.shared.reset()

        // A refresh that starts while a sign-in is in flight does not discard that sign-in.
        let rfP = FakeProvider(), rfB = FakeBrowser(rfP)
        let rfAuth = make(rfP, CountingStore(), rfB)
        await rfAuth.signInNow()
        rfB.beforeReturn = { _Concurrency.Task { await rfAuth.refreshNow() } }
        await rfAuth.signInNow()
        rfB.beforeReturn = nil
        for _ in 0..<500 { await _Concurrency.Task.yield() }
        expect(rfAuth.status == PyreonOidcStatus.signedIn && rfAuth.accessToken == "at-0", "a refresh does not discard a sign-in in flight (\(rfAuth.accessToken ?? "nil"))")

        // Two instances over ONE stored, expired session (SwiftUI's throwaway @State values, a
        // recreated view): construction makes no request, and refreshing both presents the refresh
        // token once — a provider with reuse detection would otherwise revoke the family.
        let shP = FakeProvider(), shB = FakeBrowser(shP), shStore = CountingStore()
        shP.rotateRefresh = true
        shStore.entries["pyreon.auth.session.app|https://idp.example"] =
            #"{"issuer":"https://idp.example","accessToken":"old","expiresAt":1,"refreshToken":"rt-0","claims":{"sub":"user-1"}}"#
        let shA = make(shP, shStore, shB)
        let shBInst = make(shP, shStore, shB)
        for _ in 0..<50 { await _Concurrency.Task.yield() }
        expect(shP.requests.isEmpty, "restoring an expired session makes no request until first use (\(shP.requests))")
        async let s1: Void = shA.refreshNow()
        async let s2: Void = shBInst.refreshNow()
        _ = await (s1, s2)
        let shTokenPosts = shP.requests.filter { $0.hasSuffix("/token") }.count
        expect(shTokenPosts == 1, "two instances over one stored session refresh once (\(shTokenPosts))")
        expect(shA.accessToken == "at-1" && shBInst.accessToken == "at-1", "both adopt the one refresh")

        // A refresh in flight for an old session is not handed to a caller of the new one.
        let stP = FakeProvider(), stB = FakeBrowser(stP)
        stP.uniqueRefreshTokens = true
        stP.refreshDelayNanos = 50_000_000
        let stAuth = make(stP, CountingStore(), stB)
        await stAuth.signInNow()
        let staleRefresh = _Concurrency.Task { await stAuth.refreshNow() }
        // Wait until the old session's refresh is on the wire.
        for _ in 0..<1000 where stP.requests.filter({ $0.hasSuffix("/token") }).count < 2 { await _Concurrency.Task.yield() }
        stAuth.signOut()
        await stAuth.signInNow()
        await stAuth.refreshNow()
        await staleRefresh.value
        let refreshGrants = stP.requests.filter { $0.hasSuffix("/token") }.count - 2
        expect(refreshGrants == 2, "the new session is refreshed itself (\(refreshGrants) refresh requests)")

        // A disposed instance that signs in again claims its redirect URI again.
        PyreonRedirectClaims.shared.reset()
        let dcP = FakeProvider(), dcB = FakeBrowser(dcP)
        let dcAuth = make(dcP, CountingStore(), dcB)
        dcAuth.dispose()
        await dcAuth.signInNow()
        let dcOther = PyreonOidcAuth(issuer: "https://honest.example", clientId: "app", redirectUri: "com.example.app:/oauth",
                                     store: CountingStore(), transport: dcP, browser: dcB)
        await dcAuth.signInNow()
        expect(dcAuth.error == "redirect_shared", "a disposed instance that signs in again is registered again (\(dcAuth.error ?? "nil"))")
        dcOther.dispose()
        PyreonRedirectClaims.shared.reset()

        // N2: a transient refresh failure keeps the session (and the stored record) for a retry;
        // a refusal ends it.
        let trP = FakeProvider(), trB = FakeBrowser(trP), trStore = CountingStore()
        let trAuth = make(trP, trStore, trB)
        await trAuth.signInNow()
        trP.refreshStatus = 503
        await trAuth.refreshNow()
        expect(trAuth.status == PyreonOidcStatus.error && trAuth.error == "provider_unavailable", "transient failure is an explicit error (\(trAuth.error ?? "nil"))")
        expect(trStore.entries["pyreon.auth.session.app|https://idp.example"] != nil, "a transient failure keeps the stored session")
        trP.refreshStatus = 200
        await trAuth.refreshNow()
        expect(trAuth.status == PyreonOidcStatus.signedIn && trAuth.accessToken == "at-1", "the kept refresh token retries (\(trAuth.error ?? "nil"))")
        trP.refreshStatus = 400
        await trAuth.refreshNow()
        expect(trAuth.error == "token_exchange_failed" && trStore.entries["pyreon.auth.session.app|https://idp.example"] == nil, "a refusal deletes the stored session")

        // N3: a restored, expired session never exposes its expired token, and freshAccessToken()
        // awaits the refresh.
        let exP = FakeProvider(), exB = FakeBrowser(exP), exStore = CountingStore()
        exStore.entries["pyreon.auth.session.app|https://idp.example"] =
            #"{"issuer":"https://idp.example","accessToken":"expired-token","expiresAt":1,"refreshToken":"rt-0","claims":{"sub":"user-1"}}"#
        let exAuth = make(exP, exStore, exB)
        expect(exAuth.status == PyreonOidcStatus.signingIn, "an expired restored session is signingIn, not signedIn (\(exAuth.status))")
        expect(exAuth.accessToken == nil, "the expired token is never returned")
        let exFresh = await exAuth.freshAccessToken()
        expect(exFresh == "at-1" && exAuth.status == PyreonOidcStatus.signedIn, "freshAccessToken awaits the refresh (\(exFresh ?? "nil"))")

        // N4: a stored session of ANOTHER user is not adopted, nor any into a signed-out instance.
        let adP = FakeProvider(), adB = FakeBrowser(adP), adStore = CountingStore()
        let adAuth = make(adP, adStore, adB)
        await adAuth.signInNow()
        adStore.entries["pyreon.auth.session.app|https://idp.example"] =
            #"{"issuer":"https://idp.example","accessToken":"other","refreshToken":"rt-other","claims":{"sub":"user-2"}}"#
        await adAuth.refreshNow()
        expect(adAuth.subject == "user-1", "another user's stored session is not adopted (\(adAuth.subject ?? "nil"))")
        adAuth.signOut()
        adStore.entries["pyreon.auth.session.app|https://idp.example"] =
            #"{"issuer":"https://idp.example","accessToken":"again","refreshToken":"rt-again","claims":{"sub":"user-1"}}"#
        await adAuth.refreshNow()
        expect(adAuth.status != PyreonOidcStatus.signedIn && adAuth.subject == nil, "a signed-out instance is not signed in by adoption")

        // N1: a redirect URI the matcher refuses fails at construction, and sign-in never starts.
        let badB = FakeBrowser(FakeProvider())
        let bad = PyreonOidcAuth(issuer: "https://idp.example", clientId: "app", redirectUri: "https://bücher.example/cb",
                                 store: CountingStore(), transport: FakeProvider(), browser: badB)
        expect(bad.status == PyreonOidcStatus.error && bad.error == "invalid_redirect_uri", "refused at construction (\(bad.error ?? "nil"))")
        await bad.signInNow()
        expect(badB.opened.isEmpty && bad.error == "invalid_redirect_uri", "sign-in never starts")
        bad.dispose()

        // R1: the token endpoint rotated the refresh token but the key set is down — the NEW
        // refresh token is kept (and stored), so the retry does not present the spent one.
        let rjP = FakeProvider(), rjB = FakeBrowser(rjP), rjStore = CountingStore()
        rjP.rotateRefresh = true
        rjStore.entries["pyreon.auth.session.app|https://idp.example"] =
            #"{"issuer":"https://idp.example","accessToken":"a0","expiresAt":99999999999999,"refreshToken":"rt-0","claims":{"sub":"user-1"}}"#
        let rj = make(rjP, rjStore, rjB)
        rjP.jwksStatus = 503
        await rj.refreshNow()
        expect(rj.error == "jwks_failed", "the key set outage is reported (\(rj.error ?? "nil"))")
        rjP.jwksStatus = 200
        await rj.refreshNow()
        expect(rjP.presentedRefreshTokens == ["rt-0", "rt-1"], "the retry presents the rotated token (\(rjP.presentedRefreshTokens))")

        // R4a: two sessions without a subject cannot be told apart, so they are never adopted.
        let nsP = FakeProvider(), nsB = FakeBrowser(nsP), nsStore = CountingStore()
        nsStore.entries["pyreon.auth.session.app|https://idp.example"] =
            #"{"issuer":"https://idp.example","accessToken":"a0","expiresAt":99999999999999,"refreshToken":"rt-mine","claims":{}}"#
        let ns = make(nsP, nsStore, nsB)
        nsStore.entries["pyreon.auth.session.app|https://idp.example"] =
            #"{"issuer":"https://idp.example","accessToken":"a1","expiresAt":99999999999999,"refreshToken":"rt-theirs","claims":{}}"#
        await ns.refreshNow()
        expect(nsP.presentedRefreshTokens == ["rt-mine"], "no adoption without a known subject (\(nsP.presentedRefreshTokens))")

        // R4b: a provider issuing already-expired tokens does not turn every read into a refresh.
        let boClock = Clock()
        boClock.now = Date().timeIntervalSince1970
        let boP = FakeProvider(), boB = FakeBrowser(boP)
        let bo = PyreonOidcAuth(issuer: "https://idp.example", clientId: "app", redirectUri: "com.example.app:/oauth",
                                store: CountingStore(), transport: boP, browser: boB, clock: { boClock.now })
        await bo.signInNow()
        boP.refreshExpiresIn = 0
        await bo.refreshNow()
        let boBefore = boP.presentedRefreshTokens.count
        for _ in 0..<5 {
            _ = bo.accessToken
            for _ in 0..<50 { await _Concurrency.Task.yield() }
        }
        expect(boP.presentedRefreshTokens.count - boBefore <= 1, "reads of an expired token start at most one refresh per 30 s (\(boP.presentedRefreshTokens.count - boBefore))")
        bo.dispose()

        // An expired session with no refresh token is dropped on relaunch, not restored.
        let es = CountingStore()
        es.entries["pyreon.auth.session.app|https://idp.example"] = #"{"issuer":"https://idp.example","accessToken":"x","expiresAt":1,"claims":{"sub":"u"}}"#
        let expired = make(FakeProvider(), es, b)
        expect(expired.status == PyreonOidcStatus.signedOut && es.entries.isEmpty, "expired session dropped")
        // …and a session for another issuer is never trusted.
        es.entries["pyreon.auth.session.app|https://idp.example"] = #"{"issuer":"https://evil.example","accessToken":"x","claims":{"sub":"u"}}"#
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

/// The entries two `LocatedStore`s share.
final class SharedEntries { var map: [String: String] = [:] }

/// A store with a `location`: two of these over one `SharedEntries` are one persisted store, as two
/// `KeychainSecureBackend`s with one service are.
final class LocatedStore: PyreonSecureBackend {
    let location: String?
    let entries: SharedEntries
    init(location: String, entries: SharedEntries) { self.location = location; self.entries = entries }
    func write(key: String, value: String) -> Bool { entries.map[key] = value; return true }
    func read(key: String) -> String? { entries.map[key] }
    func remove(key: String) -> Bool { entries.map.removeValue(forKey: key) != nil }
}

final class Clock: @unchecked Sendable {
    var now: TimeInterval = 1000
}

final class CountingTransport: PyreonAuthTransport, @unchecked Sendable {
    var count = 0
    func send(_ request: PyreonAuthRequest) async throws -> PyreonAuthResponse { count += 1; return PyreonAuthResponse(status: 500) }
}

struct DownTransport: PyreonAuthTransport {
    func send(_ request: PyreonAuthRequest) async throws -> PyreonAuthResponse { throw URLError(.cannotFindHost) }
}
