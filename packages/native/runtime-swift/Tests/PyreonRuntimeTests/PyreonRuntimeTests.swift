// Smoke tests for the PyreonRuntime Swift package scaffold.
//
// These are NOT functional tests — they only verify the package's
// public symbols are reachable and the package builds + links + tests
// cleanly. Once the runtime grows real surface (effect bridging,
// token tables, ViewModifier types), per-file functional tests
// land alongside.

import XCTest
@testable import PyreonRuntime

final class PyreonRuntimeTests: XCTestCase {
    func testChartLocaleFormattersMatchWebDefaults() throws {
        XCTAssertEqual(pyreonLocaleNumberFormatter("en-US")(1234.5), "1,234.5")
        XCTAssertEqual(pyreonLocaleDateFormatter("en-US")(1_704_153_600_000), "Jan 2")
        XCTAssertEqual(pyreonLocaleNumberFormatter("not_a_locale")(.infinity), "")
        XCTAssertEqual(pyreonLocaleDateFormatter("not_a_locale")(.nan), "")
    }

    /// The `PyreonTokens` namespace is reachable + carries the
    /// placeholder version constant. PR 7a replaces the version
    /// with real token tables.
    func testPyreonTokensIsReachable() throws {
        XCTAssertEqual(PyreonTokens.version, "0.0.0-phase0-scaffold")
    }

    /// The `PyreonReactivity` namespace is reachable + carries the
    /// runtime-name constant. Real reactive helpers land in later PRs.
    func testPyreonReactivityIsReachable() throws {
        XCTAssertEqual(
            PyreonReactivity.runtimeName,
            "@pyreon/native-runtime-swift"
        )
    }

    /// The `PyreonStylable` protocol exists and has its default
    /// `pyreonSource` implementation. PR 7b will use this protocol
    /// for emitter-generated ViewModifier types.
    func testPyreonStylableDefaultImpl() throws {
        struct DummyStylable: PyreonStylable {}
        XCTAssertEqual(DummyStylable.pyreonSource, "(unspecified)")
    }

    /// A conforming type that overrides `pyreonSource` (the shape
    /// the styler emitter will produce). Locks the override pattern
    /// as part of the contract.
    func testPyreonStylableOverridden() throws {
        struct CustomStylable: PyreonStylable {
            static let pyreonSource = "Button.primary.medium"
        }
        XCTAssertEqual(CustomStylable.pyreonSource, "Button.primary.medium")
    }

    // MARK: - PyreonHttp (richer requests for the useFetch fetcher)
    //
    // These cover the PURE request builders + `buildURLRequest` + response
    // helpers. The real `URLSession` `send(_:)` compiles under `swift build`
    // but a live round-trip is integration/device territory, NOT asserted
    // here — the same "real edge constructed, not asserted" boundary the
    // other runtime services use.

    /// `.get` builds a GET with headers + no body.
    func testPyreonHttpGetBuilder() throws {
        let r = PyreonHttpRequest.get("https://api/x", headers: ["Accept": "application/json"])
        XCTAssertEqual(r.method, .get)
        XCTAssertEqual(r.url, "https://api/x")
        XCTAssertEqual(r.headers["Accept"], "application/json")
        XCTAssertNil(r.body)
        XCTAssertEqual(r.method.rawValue, "GET")
    }

    /// `.post(jsonBody:)` sets `Content-Type: application/json`.
    func testPyreonHttpPostJsonSetsContentType() throws {
        let body = Data("{\"a\":1}".utf8)
        let r = PyreonHttpRequest.post("https://api/x", jsonBody: body)
        XCTAssertEqual(r.method, .post)
        XCTAssertEqual(r.body, body)
        XCTAssertEqual(r.headers["Content-Type"], "application/json")
    }

    /// `.post(jsonBody:)` does NOT overwrite an existing content-type
    /// (case-insensitive).
    func testPyreonHttpPostJsonHonorsExistingContentType() throws {
        let r = PyreonHttpRequest.post(
            "https://api/x",
            jsonBody: Data(),
            headers: ["content-type": "application/vnd.api+json"]
        )
        XCTAssertEqual(r.headers["content-type"], "application/vnd.api+json")
        XCTAssertNil(r.headers["Content-Type"])
    }

    /// `buildURLRequest` wires method + headers + body onto a `URLRequest`.
    func testPyreonHttpBuildURLRequest() throws {
        let body = Data("payload".utf8)
        let req = PyreonHttpRequest(
            method: .put,
            url: "https://api/x",
            headers: ["Authorization": "Bearer t"],
            body: body
        )
        let urlRequest = try XCTUnwrap(PyreonHttp.buildURLRequest(req))
        XCTAssertEqual(urlRequest.httpMethod, "PUT")
        XCTAssertEqual(urlRequest.value(forHTTPHeaderField: "Authorization"), "Bearer t")
        XCTAssertEqual(urlRequest.httpBody, body)
        XCTAssertEqual(urlRequest.url?.absoluteString, "https://api/x")
    }

    // NOTE: there is intentionally no unit test for the `.invalidURL` error
    // path. Modern Foundation's `URL(string:)` percent-encodes nearly any
    // input (e.g. "not a valid url" → "not%20a%20valid%20url") rather than
    // returning nil, so the nil branch isn't reliably triggerable across
    // Foundation versions — a test for it would assert Foundation's leniency,
    // not Pyreon code. The `.invalidURL` guard stays in the API as a
    // defensive measure for platforms/inputs where `URL(string:)` does fail.

    /// Response helpers: `isOK` (2xx), `text` (UTF-8), `decode` (JSON).
    func testPyreonHttpResponseHelpers() throws {
        XCTAssertTrue(PyreonHttpResponse(status: 200).isOK)
        XCTAssertTrue(PyreonHttpResponse(status: 204).isOK)
        XCTAssertFalse(PyreonHttpResponse(status: 404).isOK)
        XCTAssertFalse(PyreonHttpResponse(status: 500).isOK)

        let textRes = PyreonHttpResponse(status: 200, body: Data("hello".utf8))
        XCTAssertEqual(textRes.text, "hello")

        struct User: Decodable, Equatable { let id: Int; let name: String }
        let jsonRes = PyreonHttpResponse(
            status: 200,
            body: Data("{\"id\":7,\"name\":\"x\"}".utf8)
        )
        XCTAssertEqual(try jsonRes.decode(User.self), User(id: 7, name: "x"))
    }

    // MARK: - PyreonHttp client middleware (the lowered `use: [...]` array)
    //
    // Mirrors the Kotlin PyreonHttpTest smokes; the cross-language parity
    // against the WEB middleware is native-http-middleware-parity.test.ts.

    /// One entry per attempt: a status, or -1 for a thrown network error.
    private final class Scripted {
        let script: [Int]
        let headers: [String: String]
        var seen: [PyreonHttpRequest] = []
        init(_ script: Int..., headers: [String: String] = [:]) {
            self.script = script
            self.headers = headers
        }
        func send(_ request: PyreonHttpRequest) throws -> PyreonHttpResponse {
            let step = script[min(seen.count, script.count - 1)]
            seen.append(request)
            if step < 0 { throw URLError(.notConnectedToInternet) }
            return PyreonHttpResponse(status: step, headers: headers)
        }
    }

    private final class Recorder {
        var sleeps: [Double] = []
        var lines: [String] = []
        func env(debug: Bool = true, now: Double = 0) -> PyreonHttpPipelineEnv {
            PyreonHttpPipelineEnv(
                sleep: { self.sleeps.append($0) },
                random: { 0.5 },
                now: { now },
                log: { line, _ in self.lines.append(line) },
                isDebug: debug
            )
        }
    }

    func testMiddlewareBearerReplacesAuthorizationOnce() async throws {
        let t = Scripted(200)
        var reads = 0
        let res = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("https://a.dev/api/u", headers: ["Authorization": "old"]),
            middleware: [.bearer(baseUrl: "https://a.dev/api", crossOrigin: false, token: { reads += 1; return "tok" })],
            env: Recorder().env()
        ) { try t.send($0) }
        XCTAssertEqual(res.status, 200)
        XCTAssertEqual(t.seen.first?.headers, ["authorization": "Bearer tok"])
        XCTAssertEqual(reads, 1)
    }

    func testMiddlewareBearerNilOrEmptyTokenSendsNoHeader() async throws {
        for token in [nil, ""] as [String?] {
            let t = Scripted(200)
            _ = try await PyreonHttpPipeline.run(
                PyreonHttpRequest.get("/api/u"),
                middleware: [.bearer(baseUrl: "/api", crossOrigin: false, token: { token })],
                env: Recorder().env()
            ) { try t.send($0) }
            XCTAssertEqual(t.seen.first?.headers, [:])
        }
    }

    func testMiddlewareBearerStaysOnBaseOrigin() async throws {
        let t = Scripted(200)
        _ = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("https://evil.dev/x"),
            middleware: [.bearer(baseUrl: "https://a.dev/api", crossOrigin: false, token: { "tok" })],
            env: Recorder().env()
        ) { try t.send($0) }
        XCTAssertEqual(t.seen.first?.headers, [:])
    }

    func testMiddlewareRetryReplaysWithBackoff() async throws {
        let t = Scripted(503, 503, 200)
        let r = Recorder()
        let res = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("/api/u"), middleware: [.retry(PyreonRetryPolicy())], env: r.env()
        ) { try t.send($0) }
        XCTAssertEqual(res.status, 200)
        XCTAssertEqual(t.seen.count, 3)
        XCTAssertEqual(r.sleeps, [750, 1500])
    }

    func testMiddlewareRetryLimitPostAndRetryAfter() async throws {
        let t = Scripted(500)
        let res = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("/x"), middleware: [.retry(PyreonRetryPolicy(limit: 1))], env: Recorder().env()
        ) { try t.send($0) }
        XCTAssertEqual(res.status, 500)
        XCTAssertEqual(t.seen.count, 2)

        let post = Scripted(503)
        _ = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.post("/x", body: Data()), middleware: [.retry(PyreonRetryPolicy())], env: Recorder().env()
        ) { try post.send($0) }
        XCTAssertEqual(post.seen.count, 1, "POST is never replayed")

        let r = Recorder()
        let after = Scripted(429, 200, headers: ["Retry-After": "2"])
        _ = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("/x"),
            middleware: [.retry(PyreonRetryPolicy(limit: 1, maxDelay: 1500))],
            env: r.env()
        ) { try after.send($0) }
        XCTAssertEqual(r.sleeps, [1500])
        XCTAssertEqual(PyreonHttpPipeline.parseRetryAfter("Thu, 01 Jan 1970 00:00:10 GMT", now: 4000), 6000)
        XCTAssertNil(PyreonHttpPipeline.parseRetryAfter("soon", now: 0))
    }

    func testMiddlewareRetryNetworkErrorsAndCancellation() async throws {
        let t = Scripted(-1, 200)
        let res = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("/x"), middleware: [.retry(PyreonRetryPolicy())], env: Recorder().env()
        ) { try t.send($0) }
        XCTAssertEqual(res.status, 200)

        var attempts = 0
        do {
            _ = try await PyreonHttpPipeline.run(
                PyreonHttpRequest.get("/x"), middleware: [.retry(PyreonRetryPolicy())], env: Recorder().env()
            ) { _ in attempts += 1; throw CancellationError() }
            XCTFail("cancellation must propagate")
        } catch is CancellationError {
            XCTAssertEqual(attempts, 1, "a cancelled request is never retried")
        }
    }

    func testMiddlewareOrderIsAnOnionAndLoggerRedacts() async throws {
        var reads = 0
        let t = Scripted(503, 200)
        _ = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("/api/x"),
            middleware: [.retry(PyreonRetryPolicy()), .bearer(baseUrl: "/api", crossOrigin: false, token: { reads += 1; return "t\(reads)" })],
            env: Recorder().env()
        ) { try t.send($0) }
        XCTAssertEqual(t.seen.map { $0.headers["authorization"] }, ["Bearer t1", "Bearer t2"])

        let r = Recorder()
        _ = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("https://u:p@a.dev/x?token=s#f"), middleware: [.logger(production: false)], env: r.env()
        ) { _ in PyreonHttpResponse(status: 204) }
        XCTAssertEqual(r.lines, ["[Pyreon] http GET https://a.dev/x → 204"])

        let quiet = Recorder()
        _ = try await PyreonHttpPipeline.run(
            PyreonHttpRequest.get("/x"), middleware: [.logger(production: false)], env: quiet.env(debug: false)
        ) { _ in PyreonHttpResponse(status: 200) }
        XCTAssertEqual(quiet.lines, [])
    }


    /// The shared schema types every emitted schema struct throws / returns.
    /// Declared once in the runtime so two schema-bearing modules in one
    /// target cannot both declare them.
    func testPyreonSchemaTypes() throws {
        let e: Error = PyreonSchemaError.constraintViolation(field: "name", rule: "min length 2")
        guard case let PyreonSchemaError.constraintViolation(field, rule)? = e as? PyreonSchemaError else {
            return XCTFail("expected constraintViolation")
        }
        XCTAssertEqual(field, "name")
        XCTAssertEqual(rule, "min length 2")
        let ok = PyreonParseResult(success: true, data: 3)
        XCTAssertTrue(ok.success)
        XCTAssertEqual(ok.data, 3)
        let bad = PyreonParseResult<Int>(success: false, data: nil)
        XCTAssertFalse(bad.success)
        XCTAssertNil(bad.data)
    }

    /// A typed value becomes the `[String: Any]` an emitted schema reads —
    /// through its own Codable encoding, with booleans as Swift `Bool` and
    /// numbers keeping NSNumber's JS-like bridging.
    func testPyreonSchemaInputFromTypedValue() throws {
        struct Owner: Codable { var email: String }
        struct Pet: Codable {
            var name: String
            var age: Int
            var weight: Double
            var ok: Bool
            var tags: [String]
            var owner: Owner
            var nick: String?
        }
        let input = pyreonSchemaInput(Pet(
            name: "Rex", age: 3, weight: 3.5, ok: true, tags: ["a"], owner: Owner(email: "a@b.co"), nick: nil
        ))
        XCTAssertEqual(input["name"] as? String, "Rex")
        XCTAssertEqual(input["age"] as? Int, 3)
        XCTAssertNil(input["weight"] as? Int, "3.5 is not an Int, as in JS")
        XCTAssertEqual(input["weight"] as? Double, 3.5)
        XCTAssertEqual(input["ok"] as? Bool, true)
        XCTAssertNil(input["ok"] as? Int, "a Bool must not pass as a number")
        XCTAssertEqual(input["tags"] as? [String], ["a"])
        XCTAssertEqual((input["owner"] as? [String: Any])?["email"] as? String, "a@b.co")
        XCTAssertNil(input["nick"], "a nil optional is omitted, as a missing field")
        let literal: [String: Any] = ["a": 1]
        XCTAssertEqual(pyreonSchemaInput(literal)["a"] as? Int, 1)
    }
}

/// Tiny mutable-reference-type flag so a `@Sendable` `onChange` closure
/// (Swift 6 mode) can mutate it. Reference-type mutation through a
/// closure-captured `let` binding is Sendable-clean. Used only by the
/// `IsMonitoringIsNotObservable` / `IsOnlineIsObservable` test pair
/// where var-capture would trip `#SendableClosureCaptures` warnings.
/// Marked `@unchecked Sendable` because `Bool` IS Sendable; the class
/// wrapper is the only thing that needs the brand. Tests run
/// single-threaded so atomicity is not a concern.
final class ObservationFlag: @unchecked Sendable {
    var fired: Bool = false
}
