// PyreonTasksUITests — launch + auth-gate + navigation smoke for the
// iOS tasks showcase. Mirror of:
//   - native-router-demo-ios's PyreonRouterDemoUITests (#1452)
//   - native-tasks-android's planned RouterDemoInstrumentedTest
//
// Proves the Gap 2 (#1440) per-route `beforeEnter` auth-gate end-to-
// end on iOS at real-Simulator scope:
//
//   - App launches → login page renders (catch-all root → /login redirect)
//   - Typing username + tapping Continue logs in + navigates to /tasks
//   - /tasks renders the task list (auth-gated; would have blocked without login)
//   - Tapping "New Task" navigates to /tasks/new
//   - Tapping "Logout" navigates back to /login (auth state cleared)
//
// data-testid attrs on every interactive element in the SHARED
// `../native-tasks/src/TasksApp.tsx` source compile to
// `.accessibilityIdentifier()` markers on the SwiftUI views; XCUITest
// queries via app.otherElements / .buttons / .textFields with the same
// identifier strings.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule. Promote to required once green across
// multiple consecutive nightly runs (Gap 7's 2-week-streak prerequisite).

import XCTest

final class PyreonTasksUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_appLaunchesOnLoginPage() throws {
        // Catch-all `/` route maps to LoginPage. The beforeEnter
        // auth-gate on /tasks redirects unauthenticated users back
        // to /login on direct deep-link; the initial route catches
        // / before any auth signal flip.
        let app = XCUIApplication()
        app.launch()

        let loginPage = app.otherElements["login-page"].firstMatch
        XCTAssertTrue(
            loginPage.waitForExistence(timeout: 30),
            "Login page did not render within 30s"
        )
    }

    func test_authGateLoginAndNavigateThroughScreens() throws {
        // End-to-end auth flow:
        //   login-page → type username → Continue → tasks-page →
        //   New Task → new-task-page → Cancel → tasks-page →
        //   Logout → login-page
        let app = XCUIApplication()
        app.launch()

        // Phase 1: login.
        let username = app.textFields["login-username"].firstMatch
        XCTAssertTrue(
            username.waitForExistence(timeout: 30),
            "Username field missing on login page"
        )
        username.tap()
        username.typeText("alice")

        let submit = app.buttons["login-submit"]
        XCTAssertTrue(submit.exists, "Continue button missing")
        submit.tap()

        // Phase 2: assert task-list rendered (auth-gate passed).
        let tasksPage = app.otherElements["tasks-page"].firstMatch
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 5),
            "Tasks page did not render within 5s after login — beforeEnter auth-gate did not commit navigation"
        )

        // Phase 3: navigate to new-task page.
        let newTask = app.buttons["tasks-new"]
        XCTAssertTrue(newTask.exists, "New Task button missing on tasks page")
        newTask.tap()

        let newTaskPage = app.otherElements["new-task-page"].firstMatch
        XCTAssertTrue(
            newTaskPage.waitForExistence(timeout: 5),
            "New-task page did not render within 5s after tapping New Task"
        )

        // Phase 4: cancel back to tasks.
        let cancel = app.buttons["new-task-cancel"]
        XCTAssertTrue(cancel.exists, "Cancel button missing on new-task page")
        cancel.tap()

        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 5),
            "Did not return to tasks page within 5s after Cancel"
        )

        // Phase 5: logout → auth-gate re-engages, return to login.
        let logout = app.buttons["tasks-logout"]
        XCTAssertTrue(logout.exists, "Logout button missing on tasks page")
        logout.tap()

        let loginAfterLogout = app.otherElements["login-page"].firstMatch
        XCTAssertTrue(
            loginAfterLogout.waitForExistence(timeout: 5),
            "Did not return to login page within 5s after Logout — auth signal flip + navigate did not commit"
        )
    }
}
