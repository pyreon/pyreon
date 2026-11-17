// NetErrorsUITests — a request deadline and an unreachable host each end in
// the error state on iOS (NET-4). The Android twin is
// `NetErrorsInstrumentedTest.kt`; the page is `src/NetErrorsPage.tsx`, the slow
// fixture `/slow` in `scripts/ws-echo-server.ts`.
//
// `/slow` answers after 5 s and the call asks for 500 ms, so the error must
// show well before the answer could: the test waits at most 4 s.

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

final class NetErrorsUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://net-errors")))
        XCTAssertTrue(app.otherElements["net-errors-page"].firstMatch.waitToExist(timeout: 20), "the page did not open")
    }

    override func tearDownWithError() throws {
        app.terminate()
    }

    private func label(_ id: String) -> String { app.staticTexts[id].firstMatch.label }

    func test_aRequestPastItsTimeoutEndsInTheErrorState() throws {
        // 4 s: past the 500 ms deadline, before the fixture's 5 s answer.
        let deadline = Date().addingTimeInterval(4)
        while Date() < deadline && label("net-timeout") == "Timeout: pending" {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertEqual(label("net-timeout"), "Timeout: error", "the request outlived its 500 ms timeout")
    }

    func test_anUnreachableHostEndsInTheErrorState() throws {
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline && label("net-unreachable") == "Unreachable: pending" {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertEqual(label("net-unreachable"), "Unreachable: error", "a request to an unresolvable host did not reject")
    }
}
