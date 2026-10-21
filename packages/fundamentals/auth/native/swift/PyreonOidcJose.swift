import CryptoKit
import Foundation
import Security

// Pyreon auth — ID-token verification for the native targets. Mirrors @pyreon/auth's
// `verifyIdToken` (src/jwt.ts) check for check and IN ORDER, so a token gets the same
// verdict and the same error code on web, iOS and Android; `native/tests/vectors.json`
// holds all three to one answer sheet.
//
//   compact JWS → header/payload JSON objects → no `crit` → alg ∈ {RS256, ES256}
//   → candidate keys (kid, alg, use, kty) → signature → iss → aud → azp → exp → nbf
//   → sub → nonce

/// An auth failure. `code` is the stable, cross-target string — the same codes the web
/// `AuthError` carries — and is what the reactive container exposes as `error`.
public struct PyreonAuthError: Error, Equatable, CustomStringConvertible {
    public let code: String
    public let message: String

    public init(_ code: String, _ message: String) {
        self.code = code
        self.message = message
    }

    public var description: String { "[Pyreon] auth: \(message)" }

    public static let insecureUrl = PyreonAuthError("insecure_url", "endpoint must be https")
    public static let invalidUrl = PyreonAuthError("invalid_url", "not a valid URL")
    public static let flowExpired = PyreonAuthError("flow_expired", "authorization attempt expired")
    public static func providerError(_ error: String) -> PyreonAuthError {
        PyreonAuthError("provider_error", "provider returned \"\(error)\"")
    }
    public static let stateMismatch = PyreonAuthError("state_mismatch", "state mismatch")
    public static let issuerMismatch = PyreonAuthError("issuer_mismatch", "callback iss mismatch (mix-up)")
    public static let issuerMissing = PyreonAuthError("issuer_missing", "provider advertises iss but callback omitted it")
    public static let missingCode = PyreonAuthError("missing_code", "callback has no code")
    public static let unknownFlow = PyreonAuthError("unknown_flow", "no pending authorization for this state")
}

public enum PyreonJose {
    /// Strict base64url (RFC 4648 §5, no padding): url-safe alphabet only, and the
    /// input must be the canonical encoding of its bytes. Mirrors `decodeBase64url`.
    public static func decodeBase64url(_ s: String) -> Data? {
        for c in s.utf8 {
            let ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c == 45 || c == 95
            if !ok { return nil }
        }
        if s.utf8.count % 4 == 1 { return nil }
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.utf8.count % 4 != 0 { b += "=" }
        guard let data = Data(base64Encoded: b), PyreonPKCE.base64url(data) == s else { return nil }
        return data
    }

    /// A JSON object, or nil for anything else (array, scalar, invalid UTF-8, bad JSON).
    public static func object(_ data: Data) -> [String: Any]? {
        guard String(data: data, encoding: .utf8) != nil,
              let v = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        else { return nil }
        return v as? [String: Any]
    }

    /// A JSON number as a Double — never a JSON boolean, which Foundation also bridges
    /// to NSNumber. The web checks `typeof x === 'number'`.
    public static func number(_ v: Any?) -> Double? {
        guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        return n.doubleValue
    }

    public static func string(_ v: Any?) -> String? { v as? String }

    /// Verify an OIDC ID token and return its claims. `now` is seconds since the epoch.
    public static func verifyIdToken(
        _ token: String,
        keys: [[String: Any]],
        issuer: String,
        clientId: String,
        nonce: String?,
        now: TimeInterval = Date().timeIntervalSince1970,
        skew: TimeInterval = 60
    ) throws -> [String: Any] {
        func bad(_ code: String, _ msg: String) -> PyreonAuthError { PyreonAuthError(code, msg) }
        let segs = token.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard segs.count == 3 else { throw bad("bad_token", "not a compact JWS") }
        guard let hd = decodeBase64url(segs[0]), let pd = decodeBase64url(segs[1]),
              let header = object(hd), let claims = object(pd)
        else { throw bad("bad_token", "token header and payload must be JSON objects") }
        if header["crit"] != nil { throw bad("bad_token", "token declares critical header extensions") }
        guard let alg = header["alg"] as? String, alg == "RS256" || alg == "ES256" else {
            throw bad("bad_alg", "unsupported alg")
        }
        let kty = alg == "RS256" ? "RSA" : "EC"
        let candidates = keys.filter { k in
            selects(header["kid"], k["kid"]) && unsetOr(k["alg"], alg) && unsetOr(k["use"], "sig")
                && (k["kty"] as? String) == kty
        }
        if candidates.isEmpty { throw bad("no_key", "no matching signing key") }
        guard let signature = decodeBase64url(segs[2]) else { throw bad("bad_signature", "signature is not base64url") }
        let input = Data("\(segs[0]).\(segs[1])".utf8)
        var valid = false
        for jwk in candidates where verify(alg: alg, jwk: jwk, signature: signature, input: input) {
            valid = true
            break
        }
        if !valid { throw bad("bad_signature", "signature verification failed") }

        let nowS = floor(now)
        if (claims["iss"] as? String) != issuer { throw bad("bad_iss", "iss does not match the provider") }
        let aud: [Any] = (claims["aud"] as? [Any]) ?? [claims["aud"] as Any]
        if !aud.contains(where: { ($0 as? String) == clientId }) { throw bad("bad_aud", "aud does not include this client") }
        if aud.count > 1 && (claims["azp"] as? String) != clientId { throw bad("bad_azp", "multi-audience token needs azp = client") }
        guard let exp = number(claims["exp"]), exp + skew >= nowS else { throw bad("expired", "token expired") }
        if claims["nbf"] != nil {
            guard let nbf = number(claims["nbf"]), nbf - skew <= nowS else { throw bad("not_yet_valid", "token is not valid yet (nbf)") }
        }
        guard let sub = claims["sub"] as? String, !sub.isEmpty else { throw bad("bad_token", "missing sub") }
        if let nonce, !PyreonPKCE.constantTimeEqual(claims["nonce"] as? String ?? "\u{0}", nonce) {
            throw bad("bad_nonce", "nonce mismatch")
        }
        return claims
    }

    /// A field is UNSET when absent, JSON null or "" — one rule on all three targets
    /// (the web states it explicitly too, instead of leaning on JS truthiness).
    static func isUnset(_ v: Any?) -> Bool {
        v == nil || v is NSNull || (v as? String) == ""
    }

    /// A key field (`alg`, `use`) matches when unset or equal to the expected string.
    static func unsetOr(_ v: Any?, _ expected: String) -> Bool {
        isUnset(v) || (v as? String) == expected
    }

    /// A token's `kid` selects keys only when it is a non-empty string; unset selects all.
    static func selects(_ tokenKid: Any?, _ keyKid: Any?) -> Bool {
        if isUnset(tokenKid) { return true }
        guard let want = tokenKid as? String else { return false }
        return (keyKid as? String) == want
    }

    /// One candidate key; a key that cannot be imported verifies nothing (as on the web).
    static func verify(alg: String, jwk: [String: Any], signature: Data, input: Data) -> Bool {
        if alg == "ES256" {
            guard (jwk["crv"] as? String) == "P-256",
                  let x = (jwk["x"] as? String).flatMap(decodeBase64url), let y = (jwk["y"] as? String).flatMap(decodeBase64url),
                  x.count == 32, y.count == 32,
                  let key = try? P256.Signing.PublicKey(rawRepresentation: x + y),
                  let sig = try? P256.Signing.ECDSASignature(rawRepresentation: signature)
            else { return false }
            return key.isValidSignature(sig, for: input)
        }
        guard let n = (jwk["n"] as? String).flatMap(decodeBase64url), let e = (jwk["e"] as? String).flatMap(decodeBase64url),
              let key = rsaPublicKey(n: n, e: e)
        else { return false }
        return SecKeyVerifySignature(key, .rsaSignatureMessagePKCS1v15SHA256, input as CFData, signature as CFData, nil)
    }

    /// PKCS#1 RSAPublicKey (SEQUENCE { INTEGER n, INTEGER e }) → SecKey.
    static func rsaPublicKey(n: Data, e: Data) -> SecKey? {
        func length(_ count: Int) -> Data {
            if count < 0x80 { return Data([UInt8(count)]) }
            var bytes: [UInt8] = []
            var c = count
            while c > 0 { bytes.insert(UInt8(c & 0xff), at: 0); c >>= 8 }
            return Data([0x80 | UInt8(bytes.count)] + bytes)
        }
        func integer(_ raw: Data) -> Data {
            var v = Data(raw.drop(while: { $0 == 0 }))
            if v.isEmpty { v = Data([0]) }
            if v[v.startIndex] & 0x80 != 0 { v.insert(0, at: v.startIndex) }
            return Data([0x02]) + length(v.count) + v
        }
        let body = integer(n) + integer(e)
        let der = Data([0x30]) + length(body.count) + body
        let attrs: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
            kSecAttrKeyClass as String: kSecAttrKeyClassPublic,
        ]
        return SecKeyCreateWithData(der as CFData, attrs as CFDictionary, nil)
    }
}
