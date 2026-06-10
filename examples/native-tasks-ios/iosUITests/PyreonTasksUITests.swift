// PyreonTasksUITests — launch + navigation + typed-params smoke for
// the iOS tasks showcase. Mirror of:
//   - native-router-demo-ios's PyreonRouterDemoUITests (#1452)
//   - native-tasks-android's TasksAppInstrumentedTest
//
// Proves at real-Simulator scope, against the REWRITTEN TasksApp
// source (the original scaffold over-reached the Tier-1 vocabulary —
// see the header of `../native-tasks/src/TasksApp.tsx`):
//
//   - App launches → home page renders
//   - "Open tasks" navigates to /tasks (list with 2 seeded tasks)
//   - Typing a title + tapping Add appends a third task (signal-driven
//     list mutation re-renders the SwiftUI tree)
//   - "Open task 1" navigates to /tasks/:id — the TYPED-PARAMS route:
//     the dispatcher constructs `TaskDetailPageParam(id: ...)` from the
//     matched path segment (the typed-params compiler arc, gated here
//     at device level)
//   - "Back to tasks" returns to /tasks
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

    func test_appLaunchesOnHomePage() throws {
        let app = XCUIApplication()
        app.launch()

        let homePage = app.otherElements["home-page"].firstMatch
        XCTAssertTrue(
            homePage.waitForExistence(timeout: 30),
            "Home page did not render within 30s"
        )
    }

    func test_navigateAddTaskAndOpenTypedParamsDetail() throws {
        let app = XCUIApplication()
        app.launch()

        // Phase 1: home → tasks.
        let openTasks = app.buttons["home-open-tasks"].firstMatch
        XCTAssertTrue(
            openTasks.waitForExistence(timeout: 30),
            "Open-tasks button missing on home page"
        )
        openTasks.tap()

        let tasksPage = app.otherElements["tasks-page"].firstMatch
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 5),
            "Tasks page did not render within 5s after Open tasks"
        )

        // Phase 2: add a task — proves signal-driven list mutation
        // (.set spread-append) re-renders the keyed list.
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
            "Added task did not appear in the list within 5s — .set() list mutation did not re-render"
        )

        // Phase 3: typed-params route — /tasks/1 constructs
        // TaskDetailPageParam(id: "1") in the dispatcher.
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
    }
}
