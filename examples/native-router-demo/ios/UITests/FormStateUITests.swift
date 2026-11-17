// FormStateUITests — `useWatch`, `useFormState` and `form.resetField` on iOS
// (FRM-3). The Android twin is `FormStateInstrumentedTest.kt`; the page is
// `src/FormStatePage.tsx`.

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

final class FormStateUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func expect(_ app: XCUIApplication, _ id: String, _ want: String) {
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline {
            if app.staticTexts[id].firstMatch.label == want { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertEqual(app.staticTexts[id].firstMatch.label, want)
    }

    func test_watchFormStateAndResetFieldFollowTheForm() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://form-state")))
        XCTAssertTrue(app.otherElements["form-state-page"].firstMatch.waitToExist(timeout: 20), "the page did not open")
        expect(app, "fs-watch", "Watch: ")
        expect(app, "fs-can", "Can submit: no")

        // useWatch follows the input; useFormState turns yes once dirty and valid.
        let field = app.textFields["fs-email"].firstMatch
        XCTAssertTrue(field.waitToExist(timeout: 5), "the email field is missing")
        field.tap()
        field.typeText("ab")
        expect(app, "fs-watch", "Watch: ab")
        expect(app, "fs-can", "Can submit: yes")

        // A failed submit sets the error, which makes the form invalid.
        app.buttons["fs-submit"].tap()
        expect(app, "fs-error", "Error: too short")
        expect(app, "fs-can", "Can submit: no")

        // Fixing the value re-validates the field that carries an error.
        field.tap()
        field.typeText("c")
        expect(app, "fs-watch", "Watch: abc")
        expect(app, "fs-error", "Error: ")
        expect(app, "fs-can", "Can submit: yes")

        // resetField restores the initial value: clean again, no error.
        field.typeText("x")
        app.buttons["fs-submit"].tap()
        app.buttons["fs-reset"].tap()
        expect(app, "fs-watch", "Watch: ")
        expect(app, "fs-can", "Can submit: no")
        expect(app, "fs-error", "Error: ")
        app.terminate()
    }
}
