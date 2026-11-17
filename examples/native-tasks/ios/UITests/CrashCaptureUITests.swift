// CrashCaptureUITests — an UNCAUGHT NSException captured on a device and
// reported on the next launch (CRA-3). The Android twin is
// CrashCaptureInstrumentedTest.kt; the screen is src/CrashScreen.tsx.
//
// The crash comes from the host, not the shared source: launched with
// `-PyreonUITestCrashOnSignal`, App.swift raises an NSException when this test
// posts a Darwin notification, after the crash screen's `useCrashReporter()` has
// started. The process dies; the second launch must rehydrate the report the
// reporter persisted on the way down.

import XCTest

private extension XCUIElement {
    /// `waitForExistence(timeout:)` without its one-second first poll (see
    /// `PyreonTasksUITests.swift`).
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

final class CrashCaptureUITests: XCTestCase {
    override func setUpWithError() throws {
        // true, unlike the other suites: XCTest stops a test at ANY recorded issue when this is false, the expected
        // "app crashed" issue included — and that issue is the one this test exists to produce.
        continueAfterFailure = true
    }

    private func openCrashScreen(_ app: XCUIApplication) {
        let username = app.textFields["login-username"].firstMatch
        XCTAssertTrue(username.waitToExist(timeout: 30), "Username field missing")
        username.tap()
        username.typeText("abcde")
        if app.keyboards.count > 0 {
            for label in ["Return", "return", "Done", "done", "Go", "go"] where app.keyboards.buttons[label].exists {
                app.keyboards.buttons[label].tap()
                break
            }
        }
        app.buttons["login-submit"].firstMatch.tap()
        XCTAssertTrue(app.otherElements["tasks-page"].firstMatch.waitToExist(timeout: 20), "Tasks page did not render after login")
        let nav = app.buttons["tasks-crash"].firstMatch
        XCTAssertTrue(nav.waitToExist(timeout: 15), "Crash button missing on tasks page")
        var swipes = 0
        while !nav.isHittable && swipes < 8 {
            app.swipeUp()
            swipes += 1
        }
        nav.tap()
        XCTAssertTrue(app.staticTexts["crash-armed"].firstMatch.waitToExist(timeout: 15), "Crash screen did not render")
    }

    private func label(_ app: XCUIApplication, _ id: String) -> String {
        app.staticTexts[id].firstMatch.label
    }

    func test_anUncaughtNSExceptionIsReportedOnTheNextLaunch() throws {
        // XCTest records the target app's crash as an issue (attributed to the launch after it). Here the crash is
        // the point of the test, so that one issue — and only an issue naming a crash — is expected; every
        // assertion below still fails the test.
        let options = XCTExpectedFailure.Options()
        options.isStrict = true
        options.issueMatcher = { $0.compactDescription.hasSuffix("PyreonTasks crashed") }
        XCTExpectFailure("the app is crashed on purpose", options: options)

        // Start clean: a report left by an earlier run would satisfy the
        // assertions below without this crash.
        let app = XCUIApplication()
        app.launchArguments = ["-PyreonUITestCrashOnSignal"]
        app.launch()
        openCrashScreen(app)
        if label(app, "crash-had") == "Had crash: true" {
            app.buttons["crash-clear"].firstMatch.tap()
        }
        XCTAssertEqual(label(app, "crash-had"), "Had crash: false", "the screen did not start clean")

        // Let the reporter's start() run (it is the screen's .onAppear), then crash the app from the host.
        RunLoop.current.run(until: Date().addingTimeInterval(1))
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName("com.pyreon.tasks.uitest.crash" as CFString), nil, nil, true)
        let deadline = Date().addingTimeInterval(15)
        while app.state == .runningForeground && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTAssertNotEqual(app.state, .runningForeground, "the app did not crash on the uncaught NSException")

        // The next launch reports it.
        let relaunched = XCUIApplication()
        relaunched.launch()
        openCrashScreen(relaunched)
        XCTAssertEqual(label(relaunched, "crash-had"), "Had crash: true", "the next launch found no crash report")
        XCTAssertEqual(label(relaunched, "crash-proof"), "Proof: yes", "the report is not this NSException's")
        relaunched.buttons["crash-clear"].firstMatch.tap()
        relaunched.terminate()
    }
}
