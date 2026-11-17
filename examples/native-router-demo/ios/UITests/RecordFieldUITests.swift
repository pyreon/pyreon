// RecordFieldUITests — a database field read through its record
// (`saved.fields.body`) on iOS. The Android twin is
// `RecordFieldInstrumentedTest.kt`; the page is OfflinePage in
// `src/RouterApp.tsx`.
//
// Natively a record's field bag is a dictionary, and this dot path was emitted
// verbatim (`saved.fields.body`) and failed the build with no warning. It now
// lowers to a subscript, so the value written is the value shown.

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

final class RecordFieldUITests: XCTestCase {
    func test_aFieldReadThroughTheRecordShowsTheWrittenValue() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://offline")))
        XCTAssertTrue(app.otherElements["offline-page"].firstMatch.waitToExist(timeout: 20), "the offline page did not open")
        app.buttons["clear-note"].firstMatch.tap()
        XCTAssertEqual(app.staticTexts["note-body"].firstMatch.label, "Body: none")
        app.buttons["write-note"].firstMatch.tap()
        XCTAssertEqual(app.staticTexts["note-body"].firstMatch.label, "Body: written-offline")
        app.buttons["clear-note"].firstMatch.tap()
        app.terminate()
    }
}
