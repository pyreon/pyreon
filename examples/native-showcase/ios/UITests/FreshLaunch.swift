// Every test in this target starts from a fresh-install app state.
//
// `launchFresh()` passes `-PyreonUITestResetState`, and the app host clears
// what earlier launches stored before it builds anything
// (Sources/UITestAppState.swift). So a test does not inherit state from the
// test before it, or from its own failed first attempt when CI retries it
// (#4745: a crash report recorded by the failed attempt made the retry fail
// "hadCrash was already true before anything was recorded").
//
// `relaunchKeepingState()` is the one way to launch without the reset, for a
// test that proves something survives a real process restart.
//
// Held by `ios-device-test-harness.test.ts`: no test in this target calls a
// bare `launch()`.

import XCTest

let resetAppStateArgument = "-PyreonUITestResetState"

extension XCUIApplication {
    /// Launch from a fresh-install state. Keeps any other launch arguments.
    func launchFresh() {
        if !launchArguments.contains(resetAppStateArgument) {
            launchArguments.append(resetAppStateArgument)
        }
        launch()
    }

    /// Terminate and launch again, KEEPING what the previous launch stored.
    func relaunchKeepingState() {
        terminate()
        launchArguments.removeAll { $0 == resetAppStateArgument }
        launch()
    }
}
