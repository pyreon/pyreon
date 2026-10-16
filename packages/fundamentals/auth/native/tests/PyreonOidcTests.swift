// Executable checks for PyreonOidc — mirror of PyreonOidcTest.kt. Owns this directory's @main.
// No Keychain, no network: the flow store is the in-memory one.

import Foundation

@main
struct PyreonOidcTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static let iss = "https://idp.example"
    static let ep = "https://idp.example/auth"

    static func begin(_ core: PyreonAuthCore, now: Date = Date()) throws -> URL {
        try core.begin(authorizationEndpoint: ep, issuer: iss, clientId: "app", redirectUri: "https://app.example/cb", now: now)
    }

    static func cb(_ u: URL, _ extra: String) -> URL {
        let s = URLComponents(url: u, resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "state" }!.value!
        return URL(string: "https://app.example/cb?state=\(s)\(extra)")!
    }

    static func raises(_ what: String, _ want: PyreonAuthError, _ f: () throws -> Void) {
        do { try f(); expect(false, "\(what): expected \(want)") }
        catch let e as PyreonAuthError { expect(e == want, "\(what): got \(e)") }
        catch { expect(false, "\(what): unexpected \(error)") }
    }

    static func main() throws {
        expect(PyreonPKCE.challengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "RFC 7636 vector")
        let a = PyreonPKCE.randomToken()
        expect(a.count == 43 && a != PyreonPKCE.randomToken(), "verifier shape/unique")

        let core = PyreonAuthCore(backend: InMemoryAuthFlowStore())
        let u = try begin(core)
        expect(u.absoluteString.contains("code_challenge_method=S256") && u.absoluteString.contains("nonce="), "request params")
        expect(try core.complete(callback: cb(u, "&code=abc&iss=\(iss)"), issuer: iss).code == "abc", "code returned")
        raises("replay", .unknownFlow) { _ = try core.complete(callback: cb(u, "&code=abc"), issuer: iss) }

        raises("mix-up", .issuerMismatch) { _ = try core.complete(callback: cb(try begin(core), "&code=a&iss=https://evil.example"), issuer: iss) }
        raises("iss missing", .issuerMissing) { _ = try core.complete(callback: cb(try begin(core), "&code=a"), issuer: iss, issuerParamSupported: true) }
        raises("expired", .flowExpired) { _ = try core.complete(callback: cb(try begin(core, now: Date(timeIntervalSinceNow: -700)), "&code=a"), issuer: iss) }
        raises("http", .insecureUrl) { _ = try core.begin(authorizationEndpoint: "http://idp.example/auth", issuer: iss, clientId: "a", redirectUri: "r") }
        raises("provider error", .providerError("access_denied")) { _ = try core.complete(callback: cb(try begin(core), "&error=access_denied"), issuer: iss) }
        raises("no code", .missingCode) { _ = try core.complete(callback: cb(try begin(core), ""), issuer: iss) }
        raises("unknown state", .unknownFlow) { _ = try core.complete(callback: URL(string: "https://app.example/cb?state=zzz&code=a")!, issuer: iss) }
        print("[PyreonOidcTests] all smoke tests passed")
    }
}
