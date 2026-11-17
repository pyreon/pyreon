// HttpMiddlewareUITests — `createHttp` client middleware on iOS (NET-3). The
// Android twin is `HttpMiddlewareInstrumentedTest.kt`; the page is
// `src/HttpMiddlewarePage.tsx`, the fixture `/flaky` in
// `scripts/ws-echo-server.ts` (the Simulator shares the host's localhost).
//
// The fixture answers 503 once after a reset and 200 afterwards, reporting how
// many requests it saw and the Authorization header of the last one.

import XCTest

private extension XCUIElement {
    /// `waitForExistence(timeout:)` without its one-second first poll (see
    /// `PyreonRouterDemoUITests.swift`).
    func waitToExist(timeout: TimeInterval) -> Bool {
        if exists { return true }
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            if exists { return true }
        }
        return false
    }
}

final class HttpMiddlewareUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func resetFixture() throws {
        let done = expectation(description: "flaky-reset")
        var body = ""
        URLSession.shared.dataTask(with: try XCTUnwrap(URL(string: "http://localhost:8790/flaky-reset"))) { data, _, _ in
            body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            done.fulfill()
        }.resume()
        wait(for: [done], timeout: 10)
        XCTAssertEqual(body, "reset", "the fixture did not reset")
    }

    func test_retryResendsA503AndBearerSendsTheToken() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        try resetFixture()
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://http-mw")))
        XCTAssertTrue(app.otherElements["http-mw-page"].firstMatch.waitToExist(timeout: 20), "the page did not open")
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline
            && app.staticTexts["http-mw-attempts"].firstMatch.label == "Attempts: 0"
            && app.staticTexts["http-mw-error"].firstMatch.label == "Error: no" {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertEqual(app.staticTexts["http-mw-error"].firstMatch.label, "Error: no")
        XCTAssertEqual(app.staticTexts["http-mw-attempts"].firstMatch.label, "Attempts: 2")
        XCTAssertEqual(app.staticTexts["http-mw-auth"].firstMatch.label, "Auth: Bearer tok-mw")
        app.terminate()
    }
}
