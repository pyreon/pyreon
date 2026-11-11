// Device test for the Today showcase on a real iOS Simulator.
//
// The app is ../native-showcase/src/TodayApp.tsx compiled to SwiftUI. Every
// identifier below is a `data-testid` in that source, which PMTC emits as
// `.accessibilityIdentifier(...)`; the web build exposes the same strings as
// `data-testid` and the Android build as Compose test tags.
//
// test_addToggleRemove is the story the homepage loop shows: three todos, add
// one, check it off, remove it, close the keyboard, and the screen is back
// where it started.
//
// With the environment variable PYREON_SHOWCASE_CAPTURE=1 (pass it to
// xcodebuild as TEST_RUNNER_PYREON_SHOWCASE_CAPTURE=1) the same test types one
// key at a time and holds each state, so a screen recording of it reads like a
// person using the app. It prints one `[beat] <name> <unix-seconds>` line per
// step for lining the recording up with the web and Android ones.

import XCTest

final class PyreonShowcaseUITests: XCTestCase {
    private let capture = ProcessInfo.processInfo.environment["PYREON_SHOWCASE_CAPTURE"] == "1"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func beat(_ name: String, hold: TimeInterval) {
        guard capture else { return }
        print("[beat] \(name) \(Date().timeIntervalSince1970)")
        Thread.sleep(forTimeInterval: hold)
    }

    func test_addToggleRemove() throws {
        let app = XCUIApplication()
        app.launch()

        let root = app.otherElements["today-app"].firstMatch
        XCTAssertTrue(root.waitForExistence(timeout: 30), "TodayApp did not render within 30s")
        let count = app.staticTexts["today-count"]
        XCTAssertEqual(count.label, "2 left")
        XCTAssertTrue(app.staticTexts["Water the basil"].exists)
        XCTAssertTrue(app.staticTexts["Book the dentist"].exists)
        XCTAssertTrue(app.staticTexts["Call Grandma back"].exists)
        beat("list", hold: 2.0)

        let field = app.textFields["today-input"]
        field.tap()
        beat("focus", hold: 0.4)
        let text = "Pick up oat milk"
        if capture {
            // one key at a time, so the recording shows the typing
            for ch in text { field.typeText(String(ch)) }
        } else {
            field.typeText(text)
        }
        beat("typed", hold: 0.6)

        app.buttons["today-add"].tap()
        let added = app.staticTexts["Pick up oat milk"]
        XCTAssertTrue(added.waitForExistence(timeout: 5), "the new todo did not appear")
        XCTAssertEqual(count.label, "3 left")
        beat("added", hold: 1.6)

        // Tap the switch itself (its trailing edge): a SwiftUI Toggle's
        // element frame also covers its empty label.
        let done = app.switches["todo-4-done"]
        XCTAssertTrue(done.exists)
        done.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5)).tap()
        XCTAssertTrue(count.waitForLabel("2 left"), "toggling the new todo did not update the count")
        beat("toggled", hold: 1.6)

        app.buttons["todo-4-remove"].tap()
        XCTAssertTrue(added.waitForNonExistence(timeout: 5), "the removed todo is still listed")
        XCTAssertEqual(count.label, "2 left")
        beat("removed", hold: 1.2)

        // Return closes the keyboard (with an empty field, onSubmit adds nothing),
        // so the screen ends where it started.
        app.typeText("\n")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "the keyboard did not close")
        XCTAssertEqual(count.label, "2 left")
        beat("dismissed", hold: 2.0)
    }

    func test_removingEverythingShowsTheEmptyState() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["today-app"].firstMatch.waitForExistence(timeout: 30))
        for id in 1...3 {
            app.buttons["todo-\(id)-remove"].tap()
        }
        XCTAssertTrue(
            app.staticTexts["All clear. Enjoy the afternoon."].waitForExistence(timeout: 5),
            "the empty state did not appear after removing every todo"
        )
        XCTAssertEqual(app.staticTexts["today-count"].label, "0 left")
    }
}

private extension XCUIElement {
    /// Waits until the element's label equals `expected`.
    func waitForLabel(_ expected: String, timeout: TimeInterval = 5) -> Bool {
        let predicate = NSPredicate(format: "label == %@", expected)
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: self)
        return XCTWaiter().wait(for: [expectation], timeout: timeout) == .completed
    }
}
