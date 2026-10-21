import Foundation
import CryptoKit

// Pyreon auth — native OIDC/PKCE core. Mirrors @pyreon/auth's web logic (S256 only, state + nonce,
// RFC 9207 `iss` check, 10-minute single-use flows). The pending flow is persisted through a
// PyreonAuthFlowStore so a flow survives process death during the system-browser round trip.
// App-facing state is the existing `useAuth` container (@pyreon/hooks `PyreonAuth`); this file is the
// MECHANISM that drives it (begin -> system browser -> complete -> signInSucceeded).

public struct PyreonAuthFlow: Codable, Equatable {
    public let state: String
    public let nonce: String
    public let codeVerifier: String
    public let redirectUri: String
    public let issuer: String
    public let createdAt: TimeInterval
}

public enum PyreonAuthError: Error, Equatable {
    case insecureUrl
    case flowExpired
    case providerError(String)
    case stateMismatch
    case issuerMismatch
    case issuerMissing
    case missingCode
    case unknownFlow
}

/// Where the pending flow lives across the redirect. The shape matches `PyreonSecureBackend`
/// (`@pyreon/storage`), so a Keychain backend conforms with one line:
/// `extension KeychainSecureBackend: PyreonAuthFlowStore {}`. Never back it with UserDefaults.
public protocol PyreonAuthFlowStore {
    @discardableResult func write(key: String, value: String) -> Bool
    func read(key: String) -> String?
    @discardableResult func remove(key: String) -> Bool
}

public final class InMemoryAuthFlowStore: PyreonAuthFlowStore {
    private var store: [String: String] = [:]
    public init() {}
    public func write(key: String, value: String) -> Bool { store[key] = value; return true }
    public func read(key: String) -> String? { store[key] }
    public func remove(key: String) -> Bool { store.removeValue(forKey: key) != nil }
    /// Number of stored entries (flows plus the pending-flow index).
    public var count: Int { store.count }
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
    private let backend: PyreonAuthFlowStore

    public init(backend: PyreonAuthFlowStore) { self.backend = backend }

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
                      scope: String = "openid profile email", now: Date = Date()) throws -> URL {
        guard var comps = URLComponents(string: authorizationEndpoint), comps.scheme == "https" else {
            throw PyreonAuthError.insecureUrl
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
        ]
        guard let url = comps.url else { throw PyreonAuthError.insecureUrl }
        return url
    }

    /// Validate the redirect. The flow is read-and-deleted: a callback URL can never be replayed.
    public func complete(callback: URL, issuer: String, issuerParamSupported: Bool = false,
                         now: Date = Date()) throws -> (code: String, flow: PyreonAuthFlow) {
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func q(_ n: String) -> String? { items.first { $0.name == n }?.value }
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
        if let e = q("error") { throw PyreonAuthError.providerError(e) }
        guard PyreonPKCE.constantTimeEqual(state, flow.state) else { throw PyreonAuthError.stateMismatch }
        if let iss = q("iss") { guard iss == issuer else { throw PyreonAuthError.issuerMismatch } }
        else if issuerParamSupported { throw PyreonAuthError.issuerMissing }
        guard let code = q("code"), !code.isEmpty else { throw PyreonAuthError.missingCode }
        return (code, flow)
    }
}
