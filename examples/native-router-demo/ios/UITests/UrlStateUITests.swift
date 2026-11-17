// UrlStateUITests — `useUrlState` round trips through the router's search
// params on iOS (NAV-2). The Android twin is `UrlStateInstrumentedTest.kt`; the
// page is `src/QueryPage.tsx`.
//
// IN: a deep link carrying a query sets every value, each parsed back into its
// type. OUT: each write serializes into the committed URL; leaving the page and
// going Back re-commits that URL, so the values shown afterwards were parsed
// from the serialized text, not read from the value just written.

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

final class UrlStateUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
    }

    override func tearDownWithError() throws {
        app.terminate()
    }

    private func open(_ link: String) throws {
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://\(link)")))
        XCTAssertTrue(app.otherElements["query-page"].firstMatch.waitToExist(timeout: 20), "the query page did not open")
    }

    private func assertValues(term: String, page: String, archived: String, tags: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(app.staticTexts["query-term"].firstMatch.label, "Term: \(term)", file: file, line: line)
        XCTAssertEqual(app.staticTexts["query-page-number"].firstMatch.label, "Page: \(page)", file: file, line: line)
        XCTAssertEqual(app.staticTexts["query-archived"].firstMatch.label, "Archived: \(archived)", file: file, line: line)
        XCTAssertEqual(app.staticTexts["query-tags"].firstMatch.label, "Tags: \(tags)", file: file, line: line)
    }

    func test_aDeepLinksQuerySetsEveryTypedValue() throws {
        try open("query?q=hello%20world&page=7&archived=true&tags=a,b")
        assertValues(term: "hello world", page: "7", archived: "yes", tags: "a|b")
    }

    func test_writesSerializeIntoTheUrlAndParseBack() throws {
        try open("query")
        assertValues(term: "", page: "1", archived: "no", tags: "news")
        for label in ["Set term", "Next page", "Next page", "Toggle archived", "Add tag"] {
            app.buttons[label].firstMatch.tap()
        }
        assertValues(term: "cats & dogs", page: "3", archived: "yes", tags: "news|sport")

        // Leave and come back: Back re-commits the serialized URL, which the router parses again.
        app.buttons["Leave query"].firstMatch.tap()
        XCTAssertTrue(app.otherElements["about-page"].firstMatch.waitToExist(timeout: 10), "the about page did not open")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.otherElements["query-page"].firstMatch.waitToExist(timeout: 10), "Back did not return to the query page")
        assertValues(term: "cats & dogs", page: "3", archived: "yes", tags: "news|sport")
    }
}
