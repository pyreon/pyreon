// Executable checks for PyreonOidc — mirror of PyreonOidcTest.kt. Owns this directory's @main.
// No Keychain, no network: the store is in memory and the provider is an in-process fake.

import Foundation

@main
struct PyreonOidcTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    // The shared redirect-matching vectors (native/tests/redirect-vectors.json); vectors.test.ts checks this copy.
    // <redirect-vectors:begin>
    static let redirectVectors = #"[["https://app.example/cb","https app.example /cb"],["HTTPS://App.Example:443/cb?x=1#f","https app.example /cb"],["https://app.example:8443/cb","https app.example:8443 /cb"],["http://localhost:80/cb","http localhost /cb"],["https://app.example","https app.example /"],["com.example.app:/oauth","com.example.app  /oauth"],["com.example.app:///oauth","com.example.app  /oauth"],["Com.Example.App:/oauth?code=1&state=s","com.example.app  /oauth"],["com.example.app:/oauth/google","com.example.app  /oauth/google"],["app:cb","app  cb"],["app://cb","app cb "],["app://Host/x","app host /x"],["https://app.example/a%2Fb","https app.example /a%2Fb"],["https://app.example/a/b","https app.example /a/b"],["custom://h:443/x","custom h:443 /x"],["https://app.example/cb/","https app.example /cb/"],["https://app.example/./cb","https app.example /cb"],["https://app.example/a/../cb","https app.example /cb"],["https://app.example/a/b/../../cb/.","https app.example /cb/"],["https://app.example/c%62","https app.example /c%62"],["https://app.example:0443/cb","https app.example /cb"],["https://user:pw@app.example/cb","https app.example /cb"],["http://[::1]:8080/cb","http [::1]:8080 /cb"],["com.example.app:/oauth/","com.example.app  /oauth/"],["com.example.app:oauth?x=1","com.example.app  oauth"],["COM.EXAMPLE.APP:/OAUTH","com.example.app  /OAUTH"],["https://app.example//cb","https app.example //cb"],["https://xn--bcher-kva.example/cb","https xn--bcher-kva.example /cb"],["https://bücher.example/cb",""],["https://b%C3%BCcher.example/cb",""],["https://app.example\\cb",""],["https://app.example/c b",""],["https://app.example/%2e%2e/cb",""],["https://app.example/cb?next=/a b\\c","https app.example /cb"]]"#
    // <redirect-vectors:end>

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

    @MainActor
    static func main() async throws {
        expect(PyreonPKCE.challengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "RFC 7636 vector")
        let a = PyreonPKCE.randomToken()
        expect(a.count == 43 && a != PyreonPKCE.randomToken(), "verifier shape/unique")

        let core = PyreonAuthCore(backend: CountingStore())
        let u = try begin(core)
        expect(u.absoluteString.contains("code_challenge_method=S256") && u.absoluteString.contains("nonce="), "request params")
        expect(try core.complete(callback: cb(u, "&code=abc&iss=\(iss)"), issuer: iss).code == "abc", "code returned")
        raises("replay", .unknownFlow) { _ = try core.complete(callback: cb(u, "&code=abc"), issuer: iss) }

        raises("mix-up", .issuerMismatch) { _ = try core.complete(callback: cb(try begin(core), "&code=a&iss=https://evil.example"), issuer: iss) }
        raises("flow of another issuer", .issuerMismatch) { _ = try core.complete(callback: cb(try begin(core), "&code=a"), issuer: "https://other.example") }
        raises("callback at another redirect URI", .redirectMismatch) {
            let s = URLComponents(url: try begin(core), resolvingAgainstBaseURL: false)!.queryItems!.first { $0.name == "state" }!.value!
            _ = try core.complete(callback: URL(string: "https://app.example/other?state=\(s)&code=a")!, issuer: iss)
        }
        // One redirect-matching rule on web, iOS and Android.
        let vectors = try JSONSerialization.jsonObject(with: Data(redirectVectors.utf8)) as! [[String]]
        for v in vectors { expect((PyreonRedirect.target(v[0]) ?? "") == v[1], // "" = refused
                                   "redirect target of \(v[0]): got \(PyreonRedirect.target(v[0]) ?? "nil"), want \(v[1])") }
        raises("response_mode is reserved", PyreonAuthError("reserved_param", "authorizationParams cannot set \"response_mode\" — it is managed by the flow")) {
            _ = try core.begin(authorizationEndpoint: ep, issuer: iss, clientId: "a", redirectUri: "r", authorizationParams: ["response_mode": "form_post"])
        }
        raises("iss missing", .issuerMissing) { _ = try core.complete(callback: cb(try begin(core), "&code=a"), issuer: iss, issuerParamSupported: true) }
        raises("expired", .flowExpired) { _ = try core.complete(callback: cb(try begin(core, now: Date(timeIntervalSinceNow: -700)), "&code=a"), issuer: iss) }
        raises("http", .insecureUrl) { _ = try core.begin(authorizationEndpoint: "http://idp.example/auth", issuer: iss, clientId: "a", redirectUri: "r") }
        // Loopback http is a local dev provider, as on the web.
        expect((try? core.begin(authorizationEndpoint: "http://localhost:8080/auth", issuer: iss, clientId: "a", redirectUri: "r")) != nil, "loopback http allowed")
        raises("reserved param", PyreonAuthError("reserved_param", "authorizationParams cannot set \"state\" — it is managed by the flow")) {
            _ = try core.begin(authorizationEndpoint: ep, issuer: iss, clientId: "a", redirectUri: "r", authorizationParams: ["state": "x"])
        }
        let withParams = try core.begin(authorizationEndpoint: ep, issuer: iss, clientId: "a", redirectUri: "r", authorizationParams: ["prompt": "consent"])
        expect(withParams.absoluteString.contains("prompt=consent"), "authorizationParams added")
        raises("provider error", .providerError("access_denied")) { _ = try core.complete(callback: cb(try begin(core), "&error=access_denied"), issuer: iss) }
        raises("no code", .missingCode) { _ = try core.complete(callback: cb(try begin(core), ""), issuer: iss) }
        raises("unknown state", .unknownFlow) { _ = try core.complete(callback: URL(string: "https://app.example/cb?state=zzz&code=a")!, issuer: iss) }

        // Abandoned flows: a sign-in the user never completes must not stay in the
        // persistent store forever. `begin` sweeps expired flows and caps the rest.
        let store = CountingStore()
        let sweep = PyreonAuthCore(backend: store)
        let old = Date(timeIntervalSinceNow: -11 * 60)
        for _ in 0..<5 { _ = try begin(sweep, now: old) }
        let fresh = try begin(sweep)
        expect(store.count == 2, "expired flows swept on begin (got \(store.count))")
        _ = try sweep.complete(callback: cb(fresh, "&code=c"), issuer: iss)
        expect(store.count == 0, "completing the last flow empties the store (got \(store.count))")
        for _ in 0..<(PyreonAuthCore.maxPendingFlows + 5) { _ = try begin(sweep) }
        expect(store.count == PyreonAuthCore.maxPendingFlows + 1, "live flows are capped (got \(store.count))")
        PyreonOidcVectorChecks.run(expect)
        try await PyreonOidcFlowTests.run(expect)
        try await PyreonOidcTransportTests.run(expect)
        print("[PyreonOidcTests] all smoke tests passed")
    }
}

/// The in-memory secure store, counting its entries.
final class CountingStore: PyreonSecureBackend {
    var entries: [String: String] = [:]
    var count: Int { entries.count }
    func write(key: String, value: String) -> Bool { entries[key] = value; return true }
    func read(key: String) -> String? { entries[key] }
    func remove(key: String) -> Bool { entries.removeValue(forKey: key) != nil }
}
