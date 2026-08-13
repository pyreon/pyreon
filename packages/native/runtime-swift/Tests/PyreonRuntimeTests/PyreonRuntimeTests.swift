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
