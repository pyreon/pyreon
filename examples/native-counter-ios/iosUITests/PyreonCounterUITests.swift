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

    // M3.2b — LINKING (useLinking) asserted on device. The shared
    // Counter.tsx has `<Button onClick={() => linking.openUrl('https://
    // pyreon.dev')}>Open`; PMTC emits `@State private var linking =
    // PyreonLinking()` + `Button("Open") { linking.openUrl("...") }`.
    // Tapping it hands the URL to `UIApplication.shared.open`, which
    // backgrounds this app and hands off to Safari. OBSERVABLE — assert the
    // app leaves the foreground (and/or Safari foregrounds) — a behavioral
    // R4, not just "does not crash".
    func test_openButtonOpensExternalUrl() throws {
        let app = XCUIApplication()
        app.launch()

        let openButton = app.buttons["Open"]
        XCTAssertTrue(
            openButton.waitForExistence(timeout: 30),
            "Open button (useLinking) did not appear"
        )
        openButton.tap()

        // `UIApplication.shared.open` hands the URL to the OS: this app
        // backgrounds and Safari comes to the foreground. Assert EITHER
        // observable (state reporting varies slightly by Simulator).
        let appBackgrounded = app.wait(for: .runningBackground, timeout: 10)
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        let safariForeground = safari.wait(for: .runningForeground, timeout: 10)
        XCTAssertTrue(
            appBackgrounded || safariForeground,
            "Tapping Open did not hand the URL to the OS — the app stayed "
                + "foreground and Safari did not launch (PyreonLinking.openUrl failed)"
        )
    }

    // M3.3 — NOTIFICATIONS (useNotifications) asserted on device. The shared
    // Counter.tsx has `<Button onClick={() => notifs.notify('Pyreon', '...')}>
    // Notify`; PMTC emits `@State private var notifs = PyreonNotifications()`
    // + `Button("Notify") { notifs.notify("Pyreon", "...") }`. Tapping it
    // requests authorization (a system prompt may appear) then schedules a
    // local notification via UNUserNotificationCenter.
    //
    // This is a NON-BEHAVIORAL R4 (like haptics): a notification's permission
    // prompt + auto-dismissing banner make a reliable behavioral springboard
    // assert infeasible, so the honest proof is "the tap fires the call and
    // the app remains alive". The app's UI stays in the accessibility tree
    // behind any permission alert, so `Count: 0` still exists iff the app did
    // not crash.
    func test_notifyButtonDoesNotCrash() throws {
        let app = XCUIApplication()
        app.launch()

        let notifyButton = app.buttons["Notify"]
        XCTAssertTrue(
            notifyButton.waitForExistence(timeout: 30),
            "Notify button (useNotifications) did not appear"
        )
        notifyButton.tap()

        XCTAssertTrue(
            app.staticTexts["Count: 0"].waitForExistence(timeout: 5),
            "App did not remain alive after the Notify tap — "
                + "PyreonNotifications.notify crashed"
        )
    }

    // M2.2 — SIZE CLASS (useSizeClass) asserted on device. The shared
    // Counter.tsx has `<Text>Size: {sizeClass}</Text>` where
    // `const sizeClass = useSizeClass()`; PMTC emits an
    // `@Environment(\.horizontalSizeClass)` injection + a computed
    // `sizeClass: String { pyreonSizeClass == .regular ? "regular" : "compact" }`,
    // rendered as `Text("Size: \(sizeClass)")`.
    //
    // BEHAVIORAL R4 (unlike haptics/notifications): the rendered value
    // reflects the REAL device environment. An iPhone (this scheme's
    // Simulator destination) reports `.compact`, so the text must read
    // "Size: compact" — proving the hook reads the live size class, not
    // a baked constant. The differentiating counterpart is proven
    // LOCALLY on an iPad Simulator (horizontalSizeClass == .regular →
    // "Size: regular"); the nightly gate runs iPhone only, so the
    // committed assertion is the iPhone/compact side.
    func test_sizeClassReadsCompactOnPhone() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["Size: compact"].waitForExistence(timeout: 30),
            "Expected \"Size: compact\" on an iPhone Simulator — useSizeClass "
                + "did not read the horizontal size class (or emitted a "
                + "non-environment constant)"
        )
    }

    // A11y — the cross-platform AccessibilityProps vocab asserted in the REAL
    // iOS accessibility tree (the first DEVICE assertion of an emit that has
    // only ever been R2/compile-proven). The shared Counter.tsx has
    // `<Text accessibilityLabel="A11y status ready">●</Text>`; PMTC emits
    // `Text("●").accessibilityLabel("A11y status ready")`.
    //
    // DIFFERENTIATING behavioral R4 — it proves the label lowering actually
    // reaches XCUITest's accessibility tree AND overrode the accessible name:
    //   (1) the element is queryable by its LABEL ("A11y status ready"), and
    //   (2) it is NOT queryable by its visible glyph "●" — so
    //       `.accessibilityLabel` genuinely replaced the accessible name in
    //       the live tree (a plain, un-labelled `Text("●")` WOULD be queryable
    //       by "●").
    //
    // Scope note: `accessibilityHidden` stays R2/emit-locked (canonical-
    // primitives.test.ts). XCUITest's `staticTexts` string queries do NOT
    // reliably reflect `.accessibilityHidden(true)` (the automation snapshot
    // still exposes SwiftUI Text by content even when VoiceOver skips it), so
    // a device assertion on it would be flaky — a tooling limitation, not an
    // emit gap.
    func test_accessibilityLabelReachesTree() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["Count: 0"].waitForExistence(timeout: 30),
            "App did not render"
        )

        // (1) accessibilityLabel reached the tree — queryable by the LABEL.
        XCTAssertTrue(
            app.staticTexts["A11y status ready"].waitForExistence(timeout: 5),
            "accessibilityLabel did not reach the iOS accessibility tree — "
                + "the labelled element is not queryable by \"A11y status ready\""
        )
        // (2) The visible glyph "●" is NOT the accessible name (label overrode it).
        XCTAssertFalse(
            app.staticTexts["●"].exists,
            "accessibilityLabel did NOT override the accessible name — the raw "
                + "glyph \"●\" is still in the a11y tree"
        )
    }

    // M2.2b — ADAPTIVE LAYOUT (size-class-driven Stack↔Inline). The shared
    // Counter.tsx has `{sizeClass() === 'regular' ? <Inline>…wide…</Inline> :
    // <Stack>…narrow…</Stack>}` — a ternary between DIFFERENT container types.
    // SwiftUI's ViewBuilder rejects `cond ? HStack {…} : VStack {…}`
    // ("result values in '? :' have mismatching types"), so PMTC lowers a
    // view-branch ternary to `if cond { HStack } else { VStack }`.
    //
    // The load-bearing device proof is that this counter COMPILES at all — a
    // pre-fix `? :` emit would fail `xcodebuild` (typecheck error), so a
    // green build IS the proof the if/else lowering is valid Swift. This test
    // additionally asserts the COMPACT branch renders on the iPhone Simulator
    // (`.regular` picks the HStack branch, `.compact` the VStack branch).
    func test_adaptiveLayoutRendersCompactBranch() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["Layout: narrow"].waitForExistence(timeout: 30),
            "Adaptive Stack↔Inline did not render the compact branch on an "
                + "iPhone — the size-class view-ternary did not lower/select "
                + "correctly"
        )
        // The regular-width branch must NOT be selected on a compact phone.
        XCTAssertFalse(
            app.staticTexts["Layout: wide"].exists,
            "The regular-width branch rendered on a compact phone"
        )
    }

    // Tier-2 i18n (createI18n) asserted in the REAL render tree — the first
    // DEVICE assertion of an emit that has only ever been R2/compile-proven
    // (tier2-i18n-emit.test.ts). The shared Counter.tsx has
    // `const i18n = createI18n({ locale: 'de', fallbackLocale: 'en', messages:
    // { en: { hello: 'Hello!' }, de: { hello: 'Hallo!' } } })` and renders
    // `<Text>Greeting: {i18n.t('hello')}</Text>`; PMTC emits
    // `@State private var i18n = PyreonI18n(locale: "de", messages: […])` +
    // `Text("Greeting: \(i18n.t("hello"))")`.
    //
    // DIFFERENTIATING behavioral R4 — the rendered text proves BOTH that the
    // runtime `.t()` resolved the message table AND that it selected the
    // CONFIGURED locale:
    //   (1) queryable as "Greeting: Hallo!" — the German ('de') value, so the
    //       container honored `locale: 'de'` and looked the key up in the table;
    //   (2) NOT "Greeting: hello" — a passthrough stub would return the raw key;
    //   (3) NOT "Greeting: Hello!" — the English value would mean the wrong
    //       locale (or the fallback) was used.
    func test_i18nTranslatedStringRendersConfiguredLocale() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["Count: 0"].waitForExistence(timeout: 30),
            "App did not render"
        )

        // (1) The configured-locale ('de') translation resolved in the tree.
        XCTAssertTrue(
            app.staticTexts["Greeting: Hallo!"].waitForExistence(timeout: 5),
            "createI18n did not resolve to the configured-locale value — "
                + "expected \"Greeting: Hallo!\" (de), PyreonI18n.t did not "
                + "look up messages[\"de\"][\"hello\"] at runtime"
        )
        // (2) The raw key did NOT leak through (would mean .t() is a passthrough).
        XCTAssertFalse(
            app.staticTexts["Greeting: hello"].exists,
            "PyreonI18n.t returned the raw key instead of resolving the table"
        )
        // (3) The English value must NOT appear (would mean the wrong locale).
        XCTAssertFalse(
            app.staticTexts["Greeting: Hello!"].exists,
            "PyreonI18n resolved the WRONG locale — the English \"Hello!\" "
                + "rendered instead of the configured German \"Hallo!\""
        )
    }
}
