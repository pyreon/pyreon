// PyreonCounterUITests — launch-and-render + signal-write smoke for
// the iOS counter sample.
//
// Closes Gap 7 part (a) from the 2026-06-05 native-readiness audit:
// "native-router-demo-ios + native-counter-ios have no test coverage.
// The TodoMVC iOS/Android XCUITest gates exist but are label-gated
// advisory." This is the counter half (router-demo sibling under
// `native-router-demo-ios/iosUITests/`).
//
// Beyond `xcodebuild build` (proves the emitted Swift compiles +
// links against real SwiftUI), this asserts:
//   - The app launches on a real iOS Simulator
//   - The root `Count: 0` text renders within 30s
//   - Tapping the "Increment" button updates the text to `Count: 1`
//     (the signal → @State round-trip Phase 0 success criterion #2)
//
// The counter source `examples/native-counter-ios/src/*.tsx` doesn't
// carry `data-testid` attrs (predates the canonical-primitives migration),
// so this test queries by `staticTexts["Count: N"]` content instead.
// More fragile than `accessibilityIdentifier` but stable enough for
// a smoke against a deterministic literal initial state.
//
// 30s wait is deliberately generous — first-launch on a freshly
// booted Simulator can take several seconds for the SwiftUI scene to
// hand-off. A real render fails in <2s; the 30s ceiling exists for
// CI scheduling noise.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule, NOT on every PR (macOS-runner cost — same
// rationale as the BUILD steps in `.github/workflows/native-device.yml`).
// Promote to required once green across multiple consecutive nightly
// runs (Gap 7's 2-week-streak prerequisite).

import XCTest

final class PyreonCounterUITests: XCTestCase {
    override func setUpWithError() throws {
        // Stop the test run on first failure — the launch-and-render
        // smoke has a small sequence; cascading shouldn't happen but
        // if it does the first failure is the load-bearing signal.
        continueAfterFailure = false
    }

    func test_appLaunchesAndIncrementsCounter() throws {
        let app = XCUIApplication()
        app.launch()

        // Phase 1: assert initial render.
        // The PMTC emit produces a SwiftUI `Text("Count: \(count)")`
        // where count starts at 0; the literal text "Count: 0" appears
        // in the accessibility tree as a static text node.
        let initialText = app.staticTexts["Count: 0"]
        XCTAssertTrue(
            initialText.waitForExistence(timeout: 30),
            "Initial \"Count: 0\" text did not appear within 30s"
        )

        // Phase 2: assert signal-driven re-render.
        // The "Increment" button (PMTC emit of
        // `<Button onClick={() => count.set(count() + 1)}>Increment</Button>`)
        // calls count.set on tap. SwiftUI's automatic re-render fires
        // when @State changes, so the text should update synchronously.
        let incrementButton = app.buttons["Increment"]
        XCTAssertTrue(
            incrementButton.exists,
            "Increment button missing"
        )
        incrementButton.tap()

        let updatedText = app.staticTexts["Count: 1"]
        XCTAssertTrue(
            updatedText.waitForExistence(timeout: 15),
            "Count text did not update to \"Count: 1\" within 5s after tap"
        )
    }

    // M2.3 — GESTURE (long-press) asserted on device. The shared
    // Counter.tsx has a long-press-only `<Press onLongPress={() =>
    // count.set(0)} data-testid="reset-zone">`; PMTC emits it as a
    // chrome-less `Button(action: {}) { … }.onLongPressGesture { count = 0
    // }` with `.accessibilityIdentifier("reset-zone")`. This proves the
    // emitted long-press GESTURE actually fires on a real Simulator — a
    // tap does nothing, a >=0.5s hold resets the counter. Pre-M2.3
    // `onLongPress` was silently dropped from the native emit.
    func test_longPressResetsCounter() throws {
        let app = XCUIApplication()
        app.launch()

        let incrementButton = app.buttons["Increment"]
        XCTAssertTrue(
            incrementButton.waitForExistence(timeout: 30),
            "Increment button did not appear"
        )
        // Drive the count up so a reset is observable (0 -> 2).
        incrementButton.tap()
        incrementButton.tap()
        XCTAssertTrue(
            app.staticTexts["Count: 2"].waitForExistence(timeout: 5),
            "Count did not reach 2 after two taps"
        )

        // The `<Press>` emits a Button carrying the reset-zone identifier.
        let resetZone = app.buttons["reset-zone"]
        XCTAssertTrue(
            resetZone.waitForExistence(timeout: 5),
            "reset-zone (<Press>) did not appear"
        )
        // A 1s hold = a long press → `.onLongPressGesture` fires count = 0.
        resetZone.press(forDuration: 1.0)
        XCTAssertTrue(
            app.staticTexts["Count: 0"].waitForExistence(timeout: 5),
            "Long-press did not reset the counter — onLongPress gesture not firing"
        )
    }

    // M3.2 — SHARE (useShare) asserted on device. The shared Counter.tsx
    // has `<Button onClick={() => share.url('https://pyreon.dev')}>Share`;
    // PMTC emits `@State private var share = PyreonShare()` +
    // `Button("Share") { share.url("https://pyreon.dev") }`. Tapping it
    // presents a UIActivityViewController from the key window. UNLIKE
    // haptics this is OBSERVABLE — the system share sheet appears — so
    // this is a behavioral R4, not just "does not crash". The share sheet
    // container carries the `ActivityListView` identifier on iOS 17+, and
    // "Copy" is a reliable activity for a URL share; assert either appears.
    func test_shareButtonPresentsShareSheet() throws {
        let app = XCUIApplication()
        app.launch()

        let shareButton = app.buttons["Share"]
        XCTAssertTrue(
            shareButton.waitForExistence(timeout: 30),
            "Share button (useShare) did not appear"
        )
        shareButton.tap()

        // The presented UIActivityViewController is a system sheet. Check
        // multiple robust indicators (identifiers vary by iOS version).
        let activityView = app.otherElements["ActivityListView"]
        let copyButton = app.buttons["Copy"]
        let appeared =
            activityView.waitForExistence(timeout: 5)
            || copyButton.waitForExistence(timeout: 5)
        XCTAssertTrue(
            appeared,
            "Tapping Share did not present the system share sheet — "
                + "PyreonShare failed to present a UIActivityViewController"
        )
    }
}
