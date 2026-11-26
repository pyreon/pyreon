import Foundation
import CryptoKit

// Pyreon auth — native OIDC/PKCE core. Mirrors @pyreon/auth's web logic (S256 only, state + nonce,
// RFC 9207 `iss` check, 10-minute single-use flows). The pending flow is persisted through a
// PyreonSecureBackend (@pyreon/storage — the Keychain on device) so a flow survives process death
// during the system-browser round trip.

public struct PyreonAuthFlow: Codable, Equatable {
    public let state: String
    public let nonce: String
    public let codeVerifier: String
    public let redirectUri: String
    public let issuer: String
    public let createdAt: TimeInterval
}

/// What a redirect URI is matched on — the same rule as the web `redirectTarget`, held to the shared
/// vectors in `native/tests/redirect-vectors.json`: `scheme host path`, scheme and host lowercased,
/// default ports (80 http, 443 https) dropped, the path as written (not percent-decoded), `/` for an
/// empty http(s) path, the scheme-specific part for an opaque URI; query and fragment ignored.
public enum PyreonRedirect {
    public static func target(_ s: String) -> String? {
        // Spellings the three parsers disagree on are refused everywhere (see the web rule).
        let head = String(s.prefix { $0 != "?" && $0 != "#" })
        if head.contains("\\") || head.contains(where: { $0.isWhitespace }) || head.lowercased().contains("%2e")
            || !head.allSatisfy({ $0.isASCII }) { return nil }
        if let r = head.range(of: "://"), head[r.upperBound...].prefix(while: { $0 != "/" }).contains("%") { return nil }
        guard let c = URLComponents(string: s), let rawScheme = c.scheme else { return nil }
        let scheme = rawScheme.lowercased()
        // `encodedHost` keeps an ASCII (punycode) host as written; Foundation may decode it in `host`.
        var host = (c.encodedHost ?? c.percentEncodedHost ?? "").lowercased()
        if let port = c.port, !((scheme == "http" && port == 80) || (scheme == "https" && port == 443)) { host += ":\(port)" }
        var path = c.percentEncodedPath
        if path.hasPrefix("/") { path = removeDotSegments(path) }
        if path.isEmpty && (scheme == "http" || scheme == "https") { path = "/" }
        return "\(scheme) \(host) \(path)"
    }

    /// RFC 3986 §5.2.4 for an absolute path, as the web URL parser applies it.
    static func removeDotSegments(_ path: String) -> String {
        var out: [Substring] = []
        let segs = path.dropFirst().split(separator: "/", omittingEmptySubsequences: false)
        for (i, seg) in segs.enumerated() {
            let last = i == segs.count - 1
            if seg == "." { if last { out.append("") }; continue }
            if seg == ".." {
                if !out.isEmpty { out.removeLast() }
                if last { out.append("") }
                continue
            }
            out.append(seg)
        }
        return "/" + out.joined(separator: "/")
    }
}

/// The query of a callback URL, read by the web rule (`new URL(url).searchParams.get(name)`), held to
/// the shared vectors in `native/tests/callback-vectors.json`: the part between the first `?` and the
/// first `#`, split on `&`, `+` read as a space, percent-decoded, and the FIRST value of a repeated
/// name wins — on every target. Decoding is URLSearchParams': a `%` not followed by two hex digits
/// stays literal, and bytes that are not UTF-8 become U+FFFD — a stray bad escape in one parameter
/// never empties the whole query.
public enum PyreonCallbackQuery {
    public static func parse(_ url: String) -> [String: String] {
        let head = url.prefix { $0 != "#" }
        guard let q = head.firstIndex(of: "?") else { return [:] }
        var out: [String: String] = [:]
        for part in head[head.index(after: q)...].split(separator: "&", omittingEmptySubsequences: true) {
            let eq = part.firstIndex(of: "=")
            let k = decode(eq.map { part[..<$0] } ?? part[...])
            let v = eq.map { decode(part[part.index(after: $0)...]) } ?? ""
            if out[k] == nil { out[k] = v }
        }
        return out
    }

    /// application/x-www-form-urlencoded percent-decoding, as the WHATWG URL standard defines it.
    static func decode(_ s: Substring) -> String {
        let bytes = Array(s.replacingOccurrences(of: "+", with: " ").utf8)
        func hex(_ b: UInt8) -> UInt8? {
            switch b {
            case 0x30...0x39: return b - 0x30
            case 0x61...0x66: return b - 0x61 + 10
            case 0x41...0x46: return b - 0x41 + 10
            default: return nil
            }
        }
        var out: [UInt8] = []
        out.reserveCapacity(bytes.count)
        var i = 0
        while i < bytes.count {
            if bytes[i] == 0x25, i + 2 < bytes.count, let h = hex(bytes[i + 1]), let l = hex(bytes[i + 2]) {
                out.append(h * 16 + l)
                i += 3
            } else {
                out.append(bytes[i])
                i += 1
            }
        }
        // Invalid UTF-8 becomes U+FFFD, as on the web.
        return String(decoding: out, as: UTF8.self)
    }
}

/// Which issuers have a live `PyreonOidcAuth` on which redirect target — process-wide, the same rule
/// as the web `claimRedirect` (RFC 9700 §4.4 mix-up). A target is SHARED while two or more issuers
/// hold it; on a shared target a provider must send RFC 9207 `iss` (sign-in refuses one that does not
/// advertise it, `redirect_shared`) and every callback must carry `iss` (`issuer_missing`). Native
/// apps nearly always share one scheme, so give each provider its own path: `com.example.app:/oauth/google`.
public final class PyreonRedirectClaims: @unchecked Sendable {
    public static let shared = PyreonRedirectClaims()
    private struct Claim { var count: Int; var iss: Bool? }
    private let lock = NSLock()
    private var claims: [String: [String: Claim]] = [:]

    /// Register one instance; the returned token releases it (idempotent).
    public func claim(redirectUri: String, issuer: String) -> PyreonRedirectToken {
        let target = PyreonRedirect.target(redirectUri) ?? redirectUri
        let name = issuer.hasSuffix("/") ? String(issuer.dropLast()) : issuer
        add(target: target, issuer: name)
        return PyreonRedirectToken(registry: self, target: target, issuer: name)
    }

    fileprivate func add(target: String, issuer: String) {
        lock.lock()
        claims[target, default: [:]][issuer, default: Claim(count: 0, iss: nil)].count += 1
        lock.unlock()
    }

    fileprivate func release(target: String, issuer: String) {
        lock.lock()
        defer { lock.unlock() }
        guard var byIssuer = claims[target], var c = byIssuer[issuer] else { return }
        c.count -= 1
        if c.count > 0 { byIssuer[issuer] = c } else { byIssuer[issuer] = nil }
        claims[target] = byIssuer.isEmpty ? nil : byIssuer
    }

    fileprivate func isShared(_ target: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return (claims[target]?.count ?? 0) > 1
    }

    /// Record whether the provider sends `iss`; false when that is not allowed (shared target, no `iss`).
    fileprivate func advertise(target: String, issuer: String, iss: Bool) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        claims[target]?[issuer]?.iss = iss
        return iss || (claims[target]?.count ?? 0) < 2
    }

    /// Forget every claim (tests).
    public func reset() {
        lock.lock()
        claims = [:]
        lock.unlock()
    }
}

/// One instance's claim on its redirect target.
public final class PyreonRedirectToken: @unchecked Sendable {
    private let registry: PyreonRedirectClaims
    public let target: String
    private let issuer: String
    private let lock = NSLock()
    private var released = false

    fileprivate init(registry: PyreonRedirectClaims, target: String, issuer: String) {
        self.registry = registry
        self.target = target
        self.issuer = issuer
    }

    public var isShared: Bool { registry.isShared(target) }
    public func advertise(iss: Bool) -> Bool { registry.advertise(target: target, issuer: issuer, iss: iss) }

    public func release() {
        lock.lock()
        let first = !released
        released = true
        lock.unlock()
        if first { registry.release(target: target, issuer: issuer) }
    }

    /// Register again after `release()` (a disposed instance that signs in again).
    public func reclaimIfReleased() {
        lock.lock()
        let again = released
        released = false
        lock.unlock()
        if again { registry.add(target: target, issuer: issuer) }
    }
}

/// The https rule every endpoint follows, shared with the web `assertHttps`.
public enum PyreonAuthURL {
    static let loopback: Set<String> = ["localhost", "127.0.0.1", "::1", "[::1]"]

    /// https, or http on a loopback host (local development).
    public static func assertHttps(_ url: String) throws -> URLComponents {
        guard let c = URLComponents(string: url), let scheme = c.scheme?.lowercased(),
              let host = c.host, !host.isEmpty
        else { throw PyreonAuthError.invalidUrl }
        if scheme == "https" || (scheme == "http" && loopback.contains(host.lowercased())) { return c }
        throw PyreonAuthError.insecureUrl
    }

    /// Authorization-request parameters the flow owns; `authorizationParams` may not set them.
    public static let reservedParams: Set<String> = [
        "response_type", "response_mode", "client_id", "redirect_uri", "scope", "state", "nonce", "code_challenge", "code_challenge_method",
    ]
}

public enum PyreonPKCE {
    /// base64url without padding (RFC 4648 §5).
    public static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    public static func randomToken(bytes: Int = 32) -> String {
        var b = [UInt8](repeating: 0, count: bytes)
        precondition(SecRandomCopyBytes(kSecRandomDefault, bytes, &b) == errSecSuccess, "[Pyreon] auth: secure random failed")
        return base64url(Data(b))
    }

    public static func challengeS256(_ verifier: String) -> String {
        base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    /// Length-leaking-only comparison of two tokens we generated.
    public static func constantTimeEqual(_ a: String, _ b: String) -> Bool {
        let x = Array(a.utf8), y = Array(b.utf8)
        if x.count != y.count { return false }
        var d: UInt8 = 0
        for i in 0..<x.count { d |= x[i] ^ y[i] }
        return d == 0
    }
}

public final class PyreonAuthCore {
    public static let flowTtl: TimeInterval = 10 * 60
    /// Upper bound on pending flows kept in the backend at once.
    public static let maxPendingFlows = 16
    private let backend: PyreonSecureBackend

    public init(backend: PyreonSecureBackend) { self.backend = backend }

    private func key(_ state: String) -> String { "pyreon.auth.flow.\(state)" }
    private static let indexKey = "pyreon.auth.flows"

    // The backend is persistent (Keychain), and a sign-in the user abandons in the
    // system browser is never completed — without an index its flow would stay
    // in the Keychain forever. The index (state -> createdAt) lets `begin` sweep
    // expired flows and cap how many are kept.
    private func readIndex() -> [String: TimeInterval] {
        guard let raw = backend.read(key: Self.indexKey),
              let m = try? JSONDecoder().decode([String: TimeInterval].self, from: Data(raw.utf8)) else { return [:] }
        return m
    }

    private func writeIndex(_ m: [String: TimeInterval]) {
        if m.isEmpty { _ = backend.remove(key: Self.indexKey); return }
        if let d = try? JSONEncoder().encode(m) { _ = backend.write(key: Self.indexKey, value: String(decoding: d, as: UTF8.self)) }
    }

    /// Build the authorization URL and persist the pending flow.
    public func begin(authorizationEndpoint: String, issuer: String, clientId: String, redirectUri: String,
                      scope: String = "openid profile email", now: Date = Date(),
                      authorizationParams: [String: String] = [:]) throws -> URL {
        var comps = try PyreonAuthURL.assertHttps(authorizationEndpoint)
        for k in authorizationParams.keys where PyreonAuthURL.reservedParams.contains(k) {
            throw PyreonAuthError("reserved_param", "authorizationParams cannot set \"\(k)\" — it is managed by the flow")
        }
        let flow = PyreonAuthFlow(state: PyreonPKCE.randomToken(), nonce: PyreonPKCE.randomToken(),
                                  codeVerifier: PyreonPKCE.randomToken(), redirectUri: redirectUri,
                                  issuer: issuer, createdAt: now.timeIntervalSince1970)
        var index = readIndex()
        let nowS = now.timeIntervalSince1970
        for (s, t) in index where nowS - t > Self.flowTtl {
            _ = backend.remove(key: key(s))
            index[s] = nil
        }
        while index.count >= Self.maxPendingFlows, let oldest = index.min(by: { $0.value < $1.value })?.key {
            _ = backend.remove(key: key(oldest))
            index[oldest] = nil
        }
        let data = try JSONEncoder().encode(flow)
        _ = backend.write(key: key(flow.state), value: String(decoding: data, as: UTF8.self))
        index[flow.state] = flow.createdAt
        writeIndex(index)
        comps.queryItems = (comps.queryItems ?? []) + [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "state", value: flow.state),
            URLQueryItem(name: "nonce", value: flow.nonce),
            URLQueryItem(name: "code_challenge", value: PyreonPKCE.challengeS256(flow.codeVerifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ] + authorizationParams.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        guard let url = comps.url else { throw PyreonAuthError.insecureUrl }
        return url
    }

    /// Validate the redirect. The flow is read-and-deleted: a callback URL can never be replayed.
    public func complete(callback: URL, issuer: String, issuerParamSupported: Bool = false,
                         now: Date = Date()) throws -> (code: String, flow: PyreonAuthFlow) {
        let items = PyreonCallbackQuery.parse(callback.absoluteString)
        func q(_ n: String) -> String? { items[n] }
        let state = q("state") ?? ""
        guard let raw = backend.read(key: key(state)) else { throw PyreonAuthError.unknownFlow }
        // Read-and-delete, including an entry that fails to decode.
        _ = backend.remove(key: key(state))
        var index = readIndex()
        if index.removeValue(forKey: state) != nil { writeIndex(index) }
        guard let flow = try? JSONDecoder().decode(PyreonAuthFlow.self, from: Data(raw.utf8)) else {
            throw PyreonAuthError.unknownFlow
        }
        if now.timeIntervalSince1970 - flow.createdAt > Self.flowTtl { throw PyreonAuthError.flowExpired }
        // A flow started for another provider must never reach this provider's token endpoint
        // (OAuth mix-up), whether or not the callback carries RFC 9207 `iss`.
        guard flow.issuer == issuer else { throw PyreonAuthError.issuerMismatch }
        // RFC 9700 §4.4: without `iss`, the redirect URI is what says which provider answered.
        guard let got = PyreonRedirect.target(callback.absoluteString), got == PyreonRedirect.target(flow.redirectUri)
        else { throw PyreonAuthError.redirectMismatch }
        if let e = q("error") { throw PyreonAuthError.providerError(e) }
        guard PyreonPKCE.constantTimeEqual(state, flow.state) else { throw PyreonAuthError.stateMismatch }
        if let iss = q("iss") { guard iss == issuer else { throw PyreonAuthError.issuerMismatch } }
        else if issuerParamSupported { throw PyreonAuthError.issuerMissing }
        guard let code = q("code"), !code.isEmpty else { throw PyreonAuthError.missingCode }
        return (code, flow)
    }
}
