// PyreonTasksUITests — launch + auth-gate + store mutation +
// typed-params smoke for the iOS tasks showcase. Mirror of:
//   - native-router-demo-ios's PyreonRouterDemoUITests (#1452)
//   - native-tasks-android's TasksAppInstrumentedTest
//
// Proves at real-Simulator scope, against the STORE-BACKED TasksApp
// source (Gap 4 closure — see the header of
// `../native-tasks/src/TasksApp.tsx`):
//
//   - App launches → login page renders
//   - Typing a username + Continue flips the store's auth flag and
//     navigates to /tasks — the per-route `beforeEnter` guard reads
//     the SAME `@Observable` store singleton and lets the route render
//   - Typing a title + Add appends to the STORE's task list (cross-
//     screen state, not component-local) and the keyed list re-renders
//   - "Open task 1" navigates to /tasks/:id — typed-params route: the
//     dispatcher constructs `TaskDetailPageParam(id:)` from the
//     matched segment (also auth-gated)
//   - "Back to tasks" returns, "Logout" flips the flag back and lands
//     on /login — the gate re-engages
//
// data-testid attrs on interactive elements in the SHARED
// `../native-tasks/src/TasksApp.tsx` source compile to
// `.accessibilityIdentifier()` markers on the SwiftUI views; XCUITest
// queries via app.otherElements / .buttons / .textFields with the same
// identifier strings.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule. Promote to required once green across
// multiple consecutive nightly runs (Gap 7's streak prerequisite).

import XCTest

final class PyreonTasksUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_appLaunchesOnLoginPage() throws {
        let app = XCUIApplication()
        app.launch()

        let loginPage = app.otherElements["login-page"].firstMatch
        XCTAssertTrue(
            loginPage.waitForExistence(timeout: 30),
            "Login page did not render within 30s"
        )
    }

    func test_authGateStoreMutationAndTypedParamsDetail() throws {
        let app = XCUIApplication()
        app.launch()

        // Phase 1: login — flips the store's auth flag, the beforeEnter
        // guard on /tasks reads it and admits the navigation.
        let username = app.textFields["login-username"].firstMatch
        XCTAssertTrue(
            username.waitForExistence(timeout: 30),
            "Username field missing on login page"
        )
        username.tap()
        username.typeText("alice")

        let submit = app.buttons["login-submit"].firstMatch
        XCTAssertTrue(submit.exists, "Continue button missing")
        submit.tap()

        let tasksPage = app.otherElements["tasks-page"].firstMatch
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 5),
            "Tasks page did not render within 5s after login — the store-backed beforeEnter gate did not admit the navigation"
        )

        // Phase 2: add a task — proves the STORE list mutation
        // (.set spread-append on the @Observable singleton) re-renders
        // the keyed list.
        let titleField = app.textFields["new-task-title"].firstMatch
        XCTAssertTrue(titleField.exists, "New-task field missing on tasks page")
        titleField.tap()
        titleField.typeText("Verify on the simulator")

        let add = app.buttons["new-task-add"].firstMatch
        XCTAssertTrue(add.exists, "Add button missing on tasks page")
        add.tap()

        let newRow = app.staticTexts["Verify on the simulator"].firstMatch
        XCTAssertTrue(
            newRow.waitForExistence(timeout: 5),
            "Added task did not appear — store .set() list mutation did not re-render"
        )

        // Phase 3: typed-params route — /tasks/1 constructs
        // TaskDetailPageParam(id: "1") in the dispatcher (auth-gated).
        let openFirst = app.buttons["tasks-open-first"].firstMatch
        XCTAssertTrue(openFirst.exists, "Open-task-1 button missing on tasks page")
        openFirst.tap()

        let detailPage = app.otherElements["task-detail-page"].firstMatch
        XCTAssertTrue(
            detailPage.waitForExistence(timeout: 5),
            "Task-detail page did not render within 5s — typed-params dispatch did not match /tasks/1"
        )

        let paramText = app.staticTexts["Viewing task 1"].firstMatch
        XCTAssertTrue(
            paramText.waitForExistence(timeout: 5),
            "Typed param text missing — TaskDetailPageParam(id:) was not constructed from the matched segment"
        )

        // Phase 4: back to the list.
        let back = app.buttons["detail-back"].firstMatch
        XCTAssertTrue(back.exists, "Back button missing on detail page")
        back.tap()

        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 5),
            "Did not return to tasks page within 5s after Back"
        )

        // Phase 5: logout — flips the store flag back; lands on /login.
        let logout = app.buttons["tasks-logout"].firstMatch
        XCTAssertTrue(logout.exists, "Logout button missing on tasks page")
        logout.tap()

        let loginAfterLogout = app.otherElements["login-page"].firstMatch
        XCTAssertTrue(
            loginAfterLogout.waitForExistence(timeout: 5),
            "Did not return to login page within 5s after Logout — store flag flip + navigate did not commit"
        )
    }
}
