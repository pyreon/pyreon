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

final class PyreonTodoMVCUITests: XCTestCase {
    override func setUpWithError() throws {
        // Stop the test run on first failure — the launch-and-render
        // smoke has exactly ONE assertion; cascading shouldn't happen
        // but if it does, the first failure is the load-bearing signal.
        continueAfterFailure = false
    }

    func test_appLaunchesAndRendersRootView() throws {
        let app = XCUIApplication()
        app.launch()

        // PMTC emits `data-testid="todo-app"` on the root Stack as
        // `.accessibilityIdentifier("todo-app")` on the SwiftUI view.
        // `otherElements` queries non-control views (Stack/Container
        // shapes); `.firstMatch` avoids ambiguity if the identifier
        // appears more than once in the accessibility tree.
        let root = app.otherElements["todo-app"].firstMatch
        XCTAssertTrue(
            root.waitForExistence(timeout: 30),
            "Root view (accessibilityIdentifier=\"todo-app\") did not appear within 30s"
        )
    }
}
