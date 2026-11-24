import Foundation
import Observation

// PyreonOidcAuth — the native half of `useOidc` (@pyreon/auth): a reactive OIDC session.
//
// One shared component body reads the same members on all three targets:
//
//   auth.status()          "signedOut" / "signingIn" / "signedIn" / "error"
//   auth.isAuthenticated() status == PyreonOidcStatus.signedIn
//   auth.subject()         the verified `sub`, or nil
//   auth.claim("email")    a verified string claim, or nil
//   auth.accessToken()     the current access token, or nil
//   auth.expiresAt()       access-token expiry, epoch milliseconds, or nil
//   auth.error()           the last failure's code ("bad_nonce", "cancelled", …), or nil
//   auth.signIn() / auth.refresh() / auth.signOut(…)
//
// The flow is the web one, step for step: discovery → PKCE + state + nonce (pending flow
// persisted in the secure store) → the system browser (ASWebAuthenticationSession) →
// callback check → code exchange → ID-token verification against the provider's keys →
// signedIn. What differs is only what the platform supplies: the session is PERSISTED in
// the secure store (the Keychain), so the user is still signed in after a relaunch — the
// expectation for a native app — and an expired session with a refresh token refreshes
// itself on launch.

/// The four session states. `status` is a String on every target — exactly the spelling the
/// web `status()` returns — so shared source can render it AND compare it
/// (`auth.status() === 'signedIn'`); an enum would compile on neither native target there.
public enum PyreonOidcStatus {
    public static let signedOut = "signedOut"
    public static let signingIn = "signingIn"
    public static let signedIn = "signedIn"
    public static let error = "error"
}

/// Runs the authorization request in a browser and returns the redirect it ended on.
@MainActor
public protocol PyreonAuthBrowser: AnyObject {
    func authorize(url: URL, redirectUri: String) async throws -> URL
}

@available(iOS 17.0, macOS 14.0, *)
@MainActor
@Observable
public final class PyreonOidcAuth {
    public private(set) var status: String = PyreonOidcStatus.signedOut
    public private(set) var subject: String?
    /// The current access token. Reading it starts the refresh a restored, expired session needs
    /// (see `start()`): SwiftUI may construct and discard extra instances, which are never read.
    public var accessToken: String? {
        start()
        return currentAccessToken
    }
    private var currentAccessToken: String?
    public private(set) var expiresAt: Double?
    public private(set) var error: String?
    private var claims: [String: String] = [:]

    public var isAuthenticated: Bool { status == PyreonOidcStatus.signedIn }

    /// A verified string claim of the signed-in user, or nil.
    public func claim(_ name: String) -> String? { claims[name] }

    @ObservationIgnored public let issuer: String
    @ObservationIgnored public let clientId: String
    @ObservationIgnored public let redirectUri: String
    @ObservationIgnored public let scope: String
    @ObservationIgnored public let postLogoutRedirectUri: String?
    @ObservationIgnored public let authorizationParams: [String: String]
    @ObservationIgnored private let store: PyreonSecureBackend
    @ObservationIgnored private let transport: PyreonAuthTransport
    @ObservationIgnored private let browser: PyreonAuthBrowser?
    @ObservationIgnored private let clock: @Sendable () -> TimeInterval
    @ObservationIgnored private var meta: PyreonOidcMetadata?
    @ObservationIgnored private var jwks: PyreonJwksCache?
    @ObservationIgnored private var idToken: String?
    @ObservationIgnored private var refreshToken: String?
    /// Bumped by every new attempt and by signOut, so a late result never resurrects a session.
    @ObservationIgnored private var epoch = 0

    /// Per client AND issuer: another instance with the same client id at another provider must
    /// not read, overwrite or delete this one's stored session.
    private var sessionKey: String { "pyreon.auth.session.\(clientId)|\(issuer)" }
    /// This instance's claim on its redirect target (see `PyreonRedirectClaims`); released on
    /// `dispose()` or deinit.
    @ObservationIgnored private let redirectClaim: PyreonRedirectToken
    /// Bumped whenever the session itself changes (commit or clear): a refresh applies its result
    /// only to the session it started from.
    @ObservationIgnored private var sessionGen = 0
    /// A restored session expired: refresh it on first use (`start()`), not in the initializer.
    @ObservationIgnored private var launchRefreshPending = false
    /// Refreshes in flight, PROCESS-WIDE, by session key and the refresh token presented: every
    /// instance over one stored session shares one request (see refreshNow).
    private static var inflightRefreshes: [String: _Concurrency.Task<Void, Never>] = [:]

    public init(
        issuer: String,
        clientId: String,
        redirectUri: String,
        scope: String = "openid profile email",
        postLogoutRedirectUri: String? = nil,
        authorizationParams: [String: String] = [:],
        store: PyreonSecureBackend = KeychainSecureBackend(service: "com.pyreon.auth"),
        transport: PyreonAuthTransport = PyreonAuthURLSessionTransport(),
        browser: PyreonAuthBrowser? = nil,
        clock: @escaping @Sendable () -> TimeInterval = { Date().timeIntervalSince1970 }
    ) {
        self.issuer = issuer
        self.clientId = clientId
        self.redirectUri = redirectUri
        self.scope = scope
        self.postLogoutRedirectUri = postLogoutRedirectUri
        self.authorizationParams = authorizationParams
        self.store = store
        self.transport = transport
        self.browser = browser ?? PyreonWebAuthBrowser.makeDefault()
        self.clock = clock
        self.redirectClaim = PyreonRedirectClaims.shared.claim(redirectUri: redirectUri, issuer: issuer)
        rehydrate()
    }

    // MARK: - actions (fire-and-forget for UI; the *Now forms are awaitable)

    public func signIn() { _Concurrency.Task { await signInNow() } }
    public func refresh() { _Concurrency.Task { await refreshNow() } }

    public func signInNow() async {
        epoch += 1
        let my = epoch
        status = PyreonOidcStatus.signingIn
        error = nil
        do {
            let m = try await metadata()
            redirectClaim.reclaimIfReleased()
            guard redirectClaim.advertise(iss: m.issParameterSupported) else { throw PyreonAuthError.redirectShared }
            let core = PyreonAuthCore(backend: store)
            let url = try core.begin(authorizationEndpoint: m.authorizationEndpoint, issuer: m.issuer, clientId: clientId,
                                     redirectUri: redirectUri, scope: scope, authorizationParams: authorizationParams)
            guard let browser else { throw PyreonAuthError("no_browser", "no browser is available to sign in with") }
            let callback = try await browser.authorize(url: url, redirectUri: redirectUri)
            guard my == epoch else { return }
            try await complete(callback, my: my)
        } catch {
            if my == epoch { fail(error) }
        }
    }

    /// Complete a sign-in from a redirect delivered some other way (a universal link).
    public func handleCallback(_ url: String) {
        guard let u = URL(string: url) else { return }
        _Concurrency.Task { await handleCallbackNow(u) }
    }

    public func handleCallbackNow(_ url: URL) async {
        epoch += 1
        let my = epoch
        status = PyreonOidcStatus.signingIn
        do { try await complete(url, my: my) } catch { if my == epoch { fail(error) } }
    }

    private func complete(_ callback: URL, my: Int) async throws {
        let m = try await metadata()
        let core = PyreonAuthCore(backend: store)
        redirectClaim.reclaimIfReleased()
        _ = redirectClaim.advertise(iss: m.issParameterSupported)
        // On a redirect URI another provider also uses, only `iss` says who answered: require it.
        let (code, flow) = try core.complete(callback: callback, issuer: m.issuer,
                                             issuerParamSupported: m.issParameterSupported || redirectClaim.isShared)
        let t = try await PyreonOidcClient.exchangeCode(m, clientId: clientId, flow: flow, code: code, transport: transport)
        let verified = try await verify(m, t.idToken, nonce: flow.nonce)
        guard my == epoch else { return }
        commit(t, refreshToken: t.refreshToken, claims: verified)
    }

    /// One refresh in flight per instance: with rotating refresh tokens and reuse detection, a
    /// second concurrent refresh would present the already-rotated token and the provider would
    /// revoke the whole token family. Concurrent callers await the same request.
    /// Run the refresh a restored, expired session needs, once. Called on first read of
    /// `accessToken` and by `signIn`/`refresh`; safe to call from `onAppear`.
    public func start() {
        guard launchRefreshPending else { return }
        launchRefreshPending = false
        refresh()
    }

    /// One refresh in flight per stored session, PROCESS-WIDE: with rotating refresh tokens and
    /// reuse detection, two instances (or two calls) presenting the same token would get the whole
    /// token family revoked. A caller that finds one running for the same token waits for it and
    /// adopts the stored result; a refresh always presents the newest stored token.
    public func refreshNow() async {
        launchRefreshPending = false
        adoptNewerStoredSession()
        let key = "\(sessionKey)\u{0}\(refreshToken ?? "")"
        if let running = Self.inflightRefreshes[key] {
            await running.value
            adoptNewerStoredSession()
            return
        }
        let task = _Concurrency.Task { await self.performRefresh() }
        Self.inflightRefreshes[key] = task
        await task.value
        if Self.inflightRefreshes[key] == task { Self.inflightRefreshes[key] = nil }
    }

    /// Another instance over the same stored session refreshed it (rotating the refresh token):
    /// take its result instead of presenting the old token.
    private func adoptNewerStoredSession() {
        guard let raw = store.read(key: sessionKey),
              let r = PyreonJose.object(Data(raw.utf8)), (r["issuer"] as? String) == issuer,
              let stored = r["refreshToken"] as? String, stored != refreshToken,
              let access = r["accessToken"] as? String, !access.isEmpty
        else { return }
        sessionGen += 1
        currentAccessToken = access
        refreshToken = stored
        if let id = r["idToken"] as? String { idToken = id }
        claims = (r["claims"] as? [String: Any])?.compactMapValues { $0 as? String } ?? claims
        subject = claims["sub"]
        expiresAt = PyreonJose.number(r["expiresAt"])
        status = PyreonOidcStatus.signedIn
    }

    private func performRefresh() async {
        // A refresh never bumps the epoch, so starting one cannot discard a sign-in in flight. It
        // applies its result only while nothing else happened: no new attempt or sign-out (the
        // epoch) and no other commit (the session generation).
        let my = epoch
        let gen = sessionGen
        func stillCurrent() -> Bool { my == epoch && gen == sessionGen }
        do {
            guard let current = refreshToken else { throw PyreonAuthError("no_refresh_token", "no refresh token — sign in again") }
            let m = try await metadata()
            let t = try await PyreonOidcClient.refresh(m, clientId: clientId, refreshToken: current, transport: transport)
            // A refreshed ID token carries no nonce (OIDC Core §12.2) but must name the same user.
            let verified = try await verify(m, t.idToken, nonce: nil)
            if let verified, let subject, verified["sub"] != subject {
                throw PyreonAuthError("subject_changed", "refreshed id_token is for a different user")
            }
            guard stillCurrent() else { return }
            // Providers may rotate the refresh token; keep the old one when they do not.
            commit(t, refreshToken: t.refreshToken ?? current, claims: verified ?? claims)
        } catch {
            if stillCurrent() { fail(error) }
        }
    }

    /// Release this instance's claim on its redirect URI. Also done on deinit. The instance is not
    /// retired: a later `signIn` or callback registers it again.
    public func dispose() { redirectClaim.release() }

    deinit { redirectClaim.release() }

    /// Clear the session. With `endProviderSession`, also end it AT THE PROVIDER (RP-initiated
    /// logout) — otherwise the next sign-in completes without a prompt.
    public func signOut(endProviderSession: Bool = false) {
        epoch += 1
        let hint = idToken
        clear()
        status = PyreonOidcStatus.signedOut
        error = nil
        guard endProviderSession, let browser else { return }
        let back = postLogoutRedirectUri ?? redirectUri
        _Concurrency.Task {
            // A session restored on relaunch was never discovered, so look the provider up now:
            // skipping the logout there would leave the provider session alive.
            guard let m = try? await self.metadata(),
                  let url = try? PyreonOidcClient.endSessionURL(m, idTokenHint: hint, clientId: self.clientId,
                                                               postLogoutRedirectUri: self.postLogoutRedirectUri)
            else { return }
            _ = try? await browser.authorize(url: url, redirectUri: back)
        }
    }

    // MARK: - internals

    private func metadata() async throws -> PyreonOidcMetadata {
        if let meta { return meta }
        let m = try await PyreonOidcClient.discover(issuer, transport: transport)
        meta = m
        return m
    }

    /// Verified string claims, or nil when the response carried no ID token (OAuth2-only).
    private func verify(_ m: PyreonOidcMetadata, _ token: String?, nonce: String?) async throws -> [String: String]? {
        guard let token else { return nil }
        guard m.jwksUri != nil else {
            throw PyreonAuthError("no_jwks", "provider returned an id_token but publishes no jwks_uri to verify it")
        }
        let cache = jwks ?? PyreonJwksCache(meta: m, transport: transport, clock: clock)
        jwks = cache
        let keys = try await cache.keys(kid: PyreonJose.tokenKid(token))
        let c = try PyreonJose.verifyIdToken(token, keys: keys.keys, issuer: m.issuer, clientId: clientId, nonce: nonce, now: clock())
        return c.compactMapValues { $0 as? String }
    }

    private func commit(_ t: PyreonTokenSet, refreshToken: String?, claims: [String: String]?) {
        sessionGen += 1
        currentAccessToken = t.accessToken
        self.refreshToken = refreshToken
        // A refresh response may omit the ID token; the last one stays the logout hint.
        if let id = t.idToken { idToken = id } else if status != PyreonOidcStatus.signedIn { idToken = nil }
        self.claims = claims ?? [:]
        subject = claims?["sub"]
        expiresAt = t.expiresIn.map { (clock() + $0) * 1000 }
        error = nil
        status = PyreonOidcStatus.signedIn
        persist()
    }

    private func fail(_ e: Error) {
        clear()
        error = (e as? PyreonAuthError)?.code ?? PyreonWebAuthBrowser.code(for: e)
        status = error == "cancelled" ? PyreonOidcStatus.signedOut : PyreonOidcStatus.error
    }

    private func clear() {
        sessionGen += 1
        currentAccessToken = nil
        refreshToken = nil
        idToken = nil
        claims = [:]
        subject = nil
        expiresAt = nil
        _ = store.remove(key: sessionKey)
    }

    // The session record. Claims were verified before they were stored, and the store is
    // the Keychain, so restoring them does not re-verify an ID token that may have expired.
    private func persist() {
        var record: [String: Any] = ["issuer": issuer, "accessToken": currentAccessToken ?? "", "claims": claims]
        if let refreshToken { record["refreshToken"] = refreshToken }
        if let idToken { record["idToken"] = idToken }
        if let expiresAt { record["expiresAt"] = expiresAt }
        if let data = try? JSONSerialization.data(withJSONObject: record) {
            _ = store.write(key: sessionKey, value: String(decoding: data, as: UTF8.self))
        }
    }

    private func rehydrate() {
        guard let raw = store.read(key: sessionKey),
              let r = PyreonJose.object(Data(raw.utf8)), (r["issuer"] as? String) == issuer,
              let access = r["accessToken"] as? String, !access.isEmpty
        else {
            if store.read(key: sessionKey) != nil { _ = store.remove(key: sessionKey) }
            return
        }
        let exp = PyreonJose.number(r["expiresAt"])
        let storedRefresh = r["refreshToken"] as? String
        let expired = exp.map { $0 <= clock() * 1000 } ?? false
        if expired && storedRefresh == nil {
            _ = store.remove(key: sessionKey)
            return
        }
        currentAccessToken = access
        refreshToken = storedRefresh
        idToken = r["idToken"] as? String
        claims = (r["claims"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
        subject = claims["sub"]
        expiresAt = exp
        status = PyreonOidcStatus.signedIn
        // Not refreshed here: an initializer runs for every throwaway instance SwiftUI makes.
        launchRefreshPending = expired
    }
}
