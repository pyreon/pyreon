// FieldArrayUITests — `useFieldArray` rows driven through `<Field>` inputs on
// iOS (FRM-1). The Android twin is `FieldArrayInstrumentedTest.kt`; the page is
// `src/FieldArrayPage.tsx`.
//
// Typing into a row must reach the array (`Values` reads it back); removing the
// first row must leave the survivors bound to their own items; and a write
// typed AFTER the removal must land in the row it was typed into — the write
// goes by the row's key, so an index shifted by the removal cannot misroute it.

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

final class FieldArrayUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func waitForLabel(_ app: XCUIApplication, _ id: String, _ want: String) -> Bool {
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline {
            if app.staticTexts[id].firstMatch.label == want { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return app.staticTexts[id].firstMatch.label == want
    }

    private func type(_ app: XCUIApplication, row key: Int, _ text: String) {
        let field = app.textFields["fa-row-\(key)"].firstMatch
        XCTAssertTrue(field.waitToExist(timeout: 5), "row \(key) has no input")
        field.tap()
        field.typeText(text)
    }

    func test_rowsAreInputsBoundToTheirItemsAcrossARemoval() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://field-array")))
        XCTAssertTrue(app.otherElements["field-array-page"].firstMatch.waitToExist(timeout: 20), "the page did not open")
        XCTAssertEqual(app.staticTexts["fa-values"].firstMatch.label, "Values: alpha,beta")

        // Typing into the second row edits that item.
        type(app, row: 1, "X")
        XCTAssertTrue(
            waitForLabel(app, "fa-values", "Values: alpha,betaX"),
            "typing into row 1 did not reach the array (\(app.staticTexts["fa-values"].firstMatch.label))")

        // An appended row is an input too.
        app.buttons["fa-add"].tap()
        XCTAssertTrue(waitForLabel(app, "fa-count", "Rows: 3"), "add did not append a row")
        type(app, row: 2, "gamma")
        XCTAssertTrue(
            waitForLabel(app, "fa-values", "Values: alpha,betaX,gamma"),
            "typing into the appended row did not reach the array (\(app.staticTexts["fa-values"].firstMatch.label))")

        // Remove the first row: the survivors keep their own text.
        app.buttons["fa-remove-first"].tap()
        XCTAssertTrue(
            waitForLabel(app, "fa-values", "Values: betaX,gamma"),
            "remove-first left \(app.staticTexts["fa-values"].firstMatch.label)")
        XCTAssertFalse(app.textFields["fa-row-0"].firstMatch.exists, "the removed row's input is still rendered")
        XCTAssertEqual(app.textFields["fa-row-1"].firstMatch.value as? String, "betaX", "row 1's input lost its text")
        XCTAssertEqual(app.textFields["fa-row-2"].firstMatch.value as? String, "gamma", "row 2's input lost its text")

        // A write after the removal lands in the row it was typed into, though
        // that row's index moved from 2 to 1.
        type(app, row: 2, "!")
        XCTAssertTrue(
            waitForLabel(app, "fa-values", "Values: betaX,gamma!"),
            "a write after the removal went to the wrong row (\(app.staticTexts["fa-values"].firstMatch.label))")
        app.terminate()
    }
}
