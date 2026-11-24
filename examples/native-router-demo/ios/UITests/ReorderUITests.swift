// ReorderUITests — keyed list REORDER on iOS (LST-1). The Android twin is
// `ReorderInstrumentedTest.kt`; the page is `src/ReorderPage.tsx`.
//
// `<For each by>` lowers to `ForEach(list, id: \.id)`. The id is what makes a
// row view's identity (and its `@State`) follow the row when the list is
// reordered. Keyed by position, the labels would still show the new order and
// every row's local state would stay in the slot it was in. Each row on the
// page holds a local `marked` flag, so the test marks a row, reorders, and
// asserts the mark moved with that row.

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

final class ReorderUITests: XCTestCase {
    private let labels = ["Alpha", "Bravo", "Charlie", "Delta"]
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchFresh()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://reorder")))
        XCTAssertTrue(app.otherElements["reorder-page"].firstMatch.waitToExist(timeout: 20), "Reorder page did not open")
    }

    override func tearDownWithError() throws {
        app.terminate()
    }

    private func rowText(_ name: String) -> XCUIElement {
        let marked = app.staticTexts["\(name) marked"].firstMatch
        return marked.exists ? marked : app.staticTexts[name].firstMatch
    }

    /// The rows are DRAWN top to bottom in `order`, not just listed in the model.
    private func assertRendered(_ order: [String], file: StaticString = #filePath, line: UInt = #line) {
        let summary = app.staticTexts["reorder-order"].firstMatch
        XCTAssertEqual(summary.label, "Order: \(order.joined(separator: ","))", file: file, line: line)
        let tops = order.map { rowText($0).frame.minY }
        XCTAssertEqual(tops, tops.sorted(), "rows are not drawn in the order \(order) (tops \(tops))", file: file, line: line)
    }

    /// Exactly `names` carry a mark — the marks moved with their rows.
    private func assertMarked(_ names: [String], after: String, file: StaticString = #filePath, line: UInt = #line) {
        for name in labels {
            let marked = app.staticTexts["\(name) marked"].firstMatch.exists
            XCTAssertEqual(
                marked, names.contains(name),
                "after \(after), '\(name)' \(marked ? "carries" : "lost") a mark — row state did not follow its id",
                file: file, line: line
            )
        }
    }

    func test_keyedReorderKeepsEachRowsStateWithItsRow() throws {
        assertRendered(["Alpha", "Bravo", "Charlie", "Delta"])
        app.buttons["Mark Bravo"].tap()
        XCTAssertTrue(app.staticTexts["Bravo marked"].firstMatch.waitToExist(timeout: 5), "marking Bravo did not render")
        assertMarked(["Bravo"], after: "marking Bravo")

        // Move: Bravo goes from slot 1 to slot 0; position identity would leave the mark on Charlie.
        app.buttons["Move first"].tap()
        assertRendered(["Bravo", "Charlie", "Delta", "Alpha"])
        assertMarked(["Bravo"], after: "move first")

        // Sort: Bravo goes to slot 2.
        app.buttons["Sort desc"].tap()
        assertRendered(["Delta", "Charlie", "Bravo", "Alpha"])
        assertMarked(["Bravo"], after: "sort desc")

        // Swap: Delta (slot 0) and Alpha (slot 3) trade places.
        app.buttons["Mark Delta"].tap()
        XCTAssertTrue(app.staticTexts["Delta marked"].firstMatch.waitToExist(timeout: 5), "marking Delta did not render")
        app.buttons["Swap ends"].tap()
        assertRendered(["Alpha", "Charlie", "Bravo", "Delta"])
        assertMarked(["Bravo", "Delta"], after: "swap ends")
    }

    func test_tenThousandRowReverseSettles() throws {
        XCTAssertTrue(app.staticTexts["Item 0"].firstMatch.waitToExist(timeout: 10), "Item 0 missing before the reverse")
        XCTAssertFalse(app.staticTexts["Item 9999"].firstMatch.exists, "Item 9999 exists before the reverse — the list is not lazy")
        let started = Date()
        app.buttons["Reverse big"].tap()
        XCTAssertTrue(
            app.staticTexts["Item 9999"].firstMatch.waitToExist(timeout: 10),
            "Item 9999 did not reach the top within 10 s of reversing 10,000 rows"
        )
        print("[ReorderUITests] 10k reverse settled in \(Int(Date().timeIntervalSince(started) * 1000)) ms")
        XCTAssertFalse(
            app.staticTexts["Item 0"].firstMatch.exists,
            "Item 0 is still on screen after reversing 10,000 rows — the old head did not leave the top"
        )
        XCTAssertTrue(app.staticTexts["Item 9998"].firstMatch.exists, "Item 9998 is not next to the new head")
    }
}
