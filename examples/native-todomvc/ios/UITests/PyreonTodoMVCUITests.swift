// PyreonTodoMVCUITests — the Phase-2.2 launch-and-render smoke for iOS.
//
// Beyond `xcodebuild build` (proves the emitted Swift compiles + links
// against real SwiftUI), this asserts the app actually BOOTS on a real
// iOS Simulator and the root view RENDERS. It is the structural proof
// the PMTC arc claims for iOS — "one .tsx → runs on iOS" — and the
// counterpart to the Android Phase-2.2 instrumented test.
//
// What it asserts:
//   - The app launches (XCUIApplication().launch() returns)
//   - An element with accessibilityIdentifier == "todo-app" appears
//     within 30s. That identifier is emitted by PMTC for the root
//     `<Stack data-testid="todo-app">` in `src/TodoApp.tsx`
//     (see emit-swift.ts: `data-testid` → `.accessibilityIdentifier`).
//
// The 30s wait is deliberately generous — first-launch on a freshly
// booted Simulator can take several seconds for the SwiftUI scene to
// hand-off. A real render fails in <2s; the 30s ceiling exists for
// CI scheduling noise.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule, NOT on every PR (macOS-runner cost — same
// rationale as the BUILD steps in `.github/workflows/native-device.yml`).
// Promote to required once green across a few consecutive nightly
// runs.

import XCTest

private extension XCUIElement {
    /// `waitForExistence(timeout:)` with the same contract and none of its
    /// flat cost: true as soon as the element exists, false at the deadline.
    ///
    /// XCTest evaluates that wait's predicate for the FIRST time one second
    /// after the call, so an element that is already on screen still costs
    /// 1.03 s. In one CI job (2026-11-17) 427 of 456 such waits were answered
    /// by that first poll and took 487 s between them. This asks at once, then
    /// ten times a second. Held for every suite by
    /// `ios-device-test-harness.test.ts`.
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

final class PyreonTodoMVCUITests: XCTestCase {
    override func setUpWithError() throws {
        // Stop each test on first failure — every assertion below is a
        // load-bearing step in a sequential flow; cascading failures
        // would only bury the signal.
        continueAfterFailure = false
    }

    func test_appLaunchesAndRendersRootView() throws {
        let app = XCUIApplication()
        app.launchFresh()

        // PMTC emits `data-testid="todo-app"` on the root Stack as
        // `.accessibilityIdentifier("todo-app")` on the SwiftUI view.
        // `otherElements` queries non-control views (Stack/Container
        // shapes); `.firstMatch` avoids ambiguity if the identifier
        // appears more than once in the accessibility tree.
        let root = app.otherElements["todo-app"].firstMatch
        XCTAssertTrue(
            root.waitToExist(timeout: 30),
            "Root view (accessibilityIdentifier=\"todo-app\") did not appear within 30s"
        )
    }

    // M1.2a — useStorage PERSISTENCE asserted (was: exercised on device but
    // never asserted; the capability matrix scores unasserted behavior 0).
    // Adds a uniquely-marked todo, TERMINATES the app (a genuine process
    // exit, not a background/foreground hop), relaunches, and asserts the
    // todo survived — i.e. `useStorage` (UserDefaults-backed on iOS) wrote
    // on `todos.set` and re-hydrated on the cold start. The UUID marker
    // makes the run self-contained: retries or pre-existing simulator
    // state can't false-pass it (the assert is on THIS run's marker).
    func test_todosPersistAcrossRelaunch() throws {
        let app = XCUIApplication()
        app.launchFresh()

        let root = app.otherElements["todo-app"].firstMatch
        XCTAssertTrue(
            root.waitToExist(timeout: 30),
            "Root view did not appear within 30s"
        )

        // Add a todo with a run-unique marker. `data-testid="new-todo"`
        // on the shared <Field> emits `.accessibilityIdentifier`; the
        // trailing return triggers SwiftUI `.onSubmit` → addTodo().
        let marker = "persist-\(UUID().uuidString.prefix(8))"
        let field = app.textFields["new-todo"].firstMatch
        XCTAssertTrue(
            field.waitToExist(timeout: 10),
            "new-todo field did not appear"
        )
        field.tap()
        field.typeText(marker + "\n")
        XCTAssertTrue(
            app.staticTexts[marker].firstMatch.waitToExist(timeout: 10),
            "Added todo did not render before the relaunch"
        )

        // Full cold restart: terminate() kills the process; launch()
        // starts a fresh one. Anything in memory is gone — the todo can
        // ONLY come back through the storage read path.
        app.relaunchKeepingState()

        XCTAssertTrue(
            app.staticTexts[marker].firstMatch.waitToExist(timeout: 30),
            "Todo '\(marker)' did not survive relaunch — useStorage persistence broken"
        )
    }

    // M2.8 — ANIMATED KEYED LIST (<TransitionGroup>) asserted on device. The
    // shared TodoApp.tsx wraps the todo `<For>` in `<TransitionGroup>`, which
    // PMTC lowers to an animated list: iOS wraps the `ForEach` in a stable
    // `VStack` carrying `.animation(.default, value: visible)`; Android
    // `Column(modifier = Modifier.animateContentSize())`.
    //
    // SCOPE (honest, like the M2.2b adaptive proof): the animation TIMING is
    // not queryable, so this is a COMPILE-load-bearing + BEHAVIORAL-on-the-list
    // proof — a broken <TransitionGroup> emit (or the missing
    // androidx.compose.animation.animateContentSize import on Android) fails the
    // build, and this exercises the animated-list ENTER + LEAVE end-to-end:
    //   (1) adding a uniquely-marked todo makes a new row ENTER the animated
    //       list (the `.animation`/`animateContentSize`-wrapped For);
    //   (2) tapping that row's Remove makes it LEAVE.
    // The just-added todo is appended last, so the last "Remove" button is its.
    func test_animatedListAddRemove() throws {
        let app = XCUIApplication()
        app.launchFresh()

        let root = app.otherElements["todo-app"].firstMatch
        XCTAssertTrue(root.waitToExist(timeout: 30), "Root view did not appear")

        let marker = "anim-\(UUID().uuidString.prefix(8))"
        let field = app.textFields["new-todo"].firstMatch
        XCTAssertTrue(field.waitToExist(timeout: 10), "new-todo field did not appear")
        field.tap()
        field.typeText(marker + "\n")

        // (1) ENTER — the new row appears in the TransitionGroup-wrapped list.
        XCTAssertTrue(
            app.staticTexts[marker].firstMatch.waitToExist(timeout: 10),
            "Added todo '\(marker)' did not enter the animated list"
        )

        // (2) LEAVE — remove the just-added (last) row via its Remove button.
        let removeButtons = app.buttons.matching(
            NSPredicate(format: "label == %@", "Remove"))
        XCTAssertGreaterThan(removeButtons.count, 0, "No Remove buttons in the list")
        removeButtons.element(boundBy: removeButtons.count - 1).tap()
        XCTAssertTrue(
            app.staticTexts[marker].firstMatch.waitForNonExistence(timeout: 10),
            "Removed todo '\(marker)' did not leave the animated list"
        )
    }
}
