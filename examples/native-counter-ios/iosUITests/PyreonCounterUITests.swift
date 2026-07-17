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

    override func tearDownWithError() throws {
        // Return every test to a clean slate. THE CI-flake root cause this
        // guards: a test that leaves a system modal open (the Share sheet) or
        // the app backgrounded (Linking → Safari) makes the harness's next
        // launch hang — `Failed to terminate … : Failed to terminate` →
        // `Timed out while launching application via Xcode` — which WEDGES the
        // Simulator so EVERY later test in the run fails to launch. Explicitly
        // terminating the app here tears down any app-owned modal with it, so a
        // wedge can never cascade past a single test. (todomvc's suite already
        // does this — the counter suite was the one that lacked it.) The
        // per-test dismissals below make the app already-clean, so this
        // terminate is fast and cannot itself hang on a modal.
        XCUIApplication().terminate()
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

        // DISMISS the share sheet before the test ends. An OPEN
        // UIActivityViewController blocks clean app termination, which wedges
        // the Simulator and cascades launch-timeouts into every later test in
        // the run — the exact CI flake this file used to produce. Dismiss via
        // the "Close" button (iOS 16/17 layout) if present, else tap the dimmed
        // backdrop above the bottom sheet; then confirm it's gone so teardown's
        // terminate can't hang on it.
        let closeButton = app.buttons["Close"]
        if closeButton.exists {
            closeButton.tap()
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.04)).tap()
        }
        _ = activityView.waitForNonExistence(timeout: 5)
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

        // Bring the app back to the foreground so it doesn't end the test
        // backgrounded behind Safari — a backgrounded app + a foregrounded
        // Safari is another state that can slow/wedge the next test's launch.
        // `activate()` foregrounds the counter; teardown then terminates it
        // from a clean, foreground state.
        app.activate()
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

        // Dismiss the notification-permission system alert if it appeared. It's
        // owned by Springboard (not the app), so app-terminate at teardown
        // won't clear it — left up, it can linger over the next test's launch.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Allow", "Don't Allow", "Don’t Allow", "OK"] {
            let button = springboard.buttons[label]
            if button.waitForExistence(timeout: 2) {
                button.tap()
                break
            }
        }
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

    // Dark mode (useColorScheme) asserted in the REAL render tree — the first
    // DEVICE assertion of a hook that shipped "emit-only by design" (R2). The
    // shared Counter.tsx has `const colorScheme = useColorScheme()` and renders
    // `<Text>Theme: {colorScheme}</Text>`; PMTC emits
    // `@Environment(\.colorScheme) private var pyreonColorScheme` + a computed
    // `colorScheme: String { pyreonColorScheme == .dark ? "dark" : "light" }` +
    // `Text("Theme: \(colorScheme)")`.
    //
    // BEHAVIORAL R4: the rendered value reflects the REAL Simulator appearance.
    // The nightly gate runs the default (light) appearance, so the committed
    // assertion is "Theme: light". The DIFFERENTIATING counterpart is proven
    // LOCALLY by flipping `xcrun simctl ui <sim> appearance dark` and re-running
    // (the render becomes "Theme: dark") — so the emit reads the live
    // `@Environment(\.colorScheme)` channel, not a baked constant (a constant
    // would render the same string under both appearances). Same pattern as
    // useSizeClass (iPhone `Size: compact` committed, iPad `Size: regular`
    // proven locally).
    func test_colorSchemeReadsLightAppearance() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["Theme: light"].waitForExistence(timeout: 30),
            "Expected \"Theme: light\" under the default (light) Simulator "
                + "appearance — useColorScheme did not read "
                + "@Environment(\\.colorScheme) (or emitted a non-environment "
                + "constant)"
        )
        // The dark-appearance string must NOT appear under light.
        XCTAssertFalse(
            app.staticTexts["Theme: dark"].exists,
            "\"Theme: dark\" rendered under the light Simulator appearance — "
                + "the color-scheme read is inverted or constant"
        )
    }

    // Tier-2 state machine (createMachine) asserted in the REAL render tree —
    // the first DEVICE assertion of a @pyreon/machine transition (the emit has
    // only ever been R2/compile-proven, tier2-machine-emit-broken.test.ts). The
    // shared Counter.tsx has `const power = createMachine({ initial: 'off',
    // states: { off: { on: { TOGGLE: 'on' } }, on: { on: { TOGGLE: 'off' } } }
    // })`, renders `<Text>Power: {power()}</Text>`, and a Toggle button calls
    // `power.send('TOGGLE')`; PMTC emits `@State private var power =
    // PyreonMachine(initial: "off", transitions: […])` +
    // `Text("Power: \(power())")` + `Button("Toggle Power") { power.send("TOGGLE") }`.
    //
    // DIFFERENTIATING behavioral R4 — this is a stronger proof than a static
    // read: it exercises an actual STATE TRANSITION driven by a tap AND the
    // reactive re-render it triggers (PyreonMachine is @Observable, so SwiftUI
    // recomposes on `send`):
    //   (1) launch shows the initial state "Power: off";
    //   (2) tapping "Toggle Power" applies the off --TOGGLE--> on transition
    //       and the text updates to "Power: on".
    // A dropped/broken machine (or one whose send didn't re-render) would stay
    // on "Power: off".
    func test_stateMachineTransitionsOnTap() throws {
        let app = XCUIApplication()
        app.launch()

        // (1) Initial state.
        XCTAssertTrue(
            app.staticTexts["Power: off"].waitForExistence(timeout: 30),
            "createMachine did not render its initial state — expected "
                + "\"Power: off\" (PyreonMachine initial not seeded, or the "
                + "declaration was dropped)"
        )

        // (2) Transition on tap → reactive re-render.
        let toggle = app.buttons["Toggle Power"]
        XCTAssertTrue(toggle.exists, "Toggle Power button missing")
        toggle.tap()

        XCTAssertTrue(
            app.staticTexts["Power: on"].waitForExistence(timeout: 5),
            "The off --TOGGLE--> on transition did not re-render — PyreonMachine "
                + ".send did not apply the transition or did not trigger a "
                + "SwiftUI re-render (@Observable)"
        )
        // The old state must be gone (proves a real swap, not an additive draw).
        XCTAssertFalse(
            app.staticTexts["Power: off"].exists,
            "\"Power: off\" still present after the transition — the state text "
                + "did not update"
        )
    }

    // M2.7 — ANIMATIONS (<Transition show>) asserted in the REAL render tree.
    // The shared Counter.tsx has `<Transition show={() => boxVisible()}><Text>
    // Animated Box</Text></Transition>` with a Toggle Box button flipping the
    // `boxVisible` signal; PMTC lowers `<Transition>` to an animated show-gate:
    // iOS `ZStack { if boxVisible { Text("Animated Box").transition(.opacity) } }
    // .animation(.default, value: boxVisible)`, Android `AnimatedVisibility(
    // visible = boxVisible) { … }`.
    //
    // DIFFERENTIATING behavioral R4 (on the show/hide; the fade TIMING itself
    // is not asserted — XCUITest can't observe an opacity curve): the animated
    // child toggles visibility through the platform animation path. A dropped
    // <Transition> (or a broken show-gate) would leave the child permanently
    // visible or permanently absent. Sequence:
    //   (1) launch — `show` defaults visible, so "Animated Box" is present;
    //   (2) tap Toggle Box — the `.transition(.opacity)` fade-out completes and
    //       the child is removed from the tree;
    //   (3) tap Toggle Box again — it animates back in.
    func test_transitionAnimatesShowHide() throws {
        let app = XCUIApplication()
        app.launch()

        let box = app.staticTexts["Animated Box"]
        // (1) Visible on launch.
        XCTAssertTrue(
            box.waitForExistence(timeout: 30),
            "Animated Box not visible on launch — the <Transition> show-gate "
                + "did not render its child (show defaults to visible)"
        )

        let toggle = app.buttons["Toggle Box"]
        XCTAssertTrue(toggle.exists, "Toggle Box button missing")

        // (2) Hide → the animated child is removed after the opacity fade-out.
        toggle.tap()
        XCTAssertTrue(
            box.waitForNonExistence(timeout: 5),
            "Animated Box still present after Toggle Box — the animated "
                + "show-gate did not remove the child on show=false"
        )

        // (3) Show → it animates back in.
        toggle.tap()
        XCTAssertTrue(
            box.waitForExistence(timeout: 5),
            "Animated Box did not reappear after a second Toggle Box — the "
                + "show-gate did not re-mount the child on show=true"
        )
    }

    // M4.5 — the ASYNC-AWAIT LOWERING asserted in the REAL render tree. This is
    // the device proof that the lowering RUNS, not just compiles (the compile
    // half is locked by native-async.test.ts's swiftc gate). The shared
    // Counter.tsx has an Unlock button whose handler is `async () => { const ok
    // = await bio.authenticate('Unlock'); lockStatus.set(ok ? 'unlocked' :
    // 'denied') }`; PMTC wraps it in a Swift `Button("Unlock") { Task { let ok =
    // await bio.authenticate("Unlock"); lockStatus = … } }` (a sync action slot
    // cannot `await`).
    //
    // DETERMINISTIC on-device: the CI Simulator has NO enrolled biometrics, so
    // `PyreonBiometrics.authenticate` short-circuits via `canEvaluatePolicy` and
    // resolves `false` with NO system prompt (biometrics-only policy — never a
    // passcode fallback). So the observable outcome is "Lock: denied", produced
    // from INSIDE the Task after the await completed:
    //   (1) launch — `lockStatus` seeds "idle";
    //   (2) tap Unlock — the Task runs, awaits the gate (false, no prompt), and
    //       the post-await `lockStatus = "denied"` re-renders the text.
    // A dropped async scope (an un-wrapped `await` in a sync closure) would not
    // compile; a lowering that ran the flip OUTSIDE/BEFORE the await would leave
    // "idle". Because the gate never prompts here, no modal can wedge the sim.
    /// M3.4 — the system photo picker presents, and its async result flows back
    /// across the sheet dismissal into a re-render.
    ///
    /// Drives the CANCEL path deliberately: picking a real asset would depend
    /// on the Simulator's seeded photo library (which varies by Xcode version
    /// and runtime image), whereas Cancel is available on every one — the same
    /// determinism argument as the biometric gate's unenrolled→denied path.
    /// Cancelling still proves the whole chain: PHPickerViewController
    /// presented, the delegate resumed the continuation with nil, the awaited
    /// Task resumed, and the post-await signal flip re-rendered.
    func test_imagePickerPresentsAndCancelFlowsBackOnDevice() throws {
        let app = XCUIApplication()
        app.launch()

        // (1) Initial state — the async handler has not run yet.
        XCTAssertTrue(
            app.staticTexts["Photo: idle"].waitForExistence(timeout: 30),
            "Expected the initial \"Photo: idle\" — the photoStatus signal was "
                + "not seeded (or the Photo text was dropped from the emit)"
        )

        // (2) Tap Pick Photo → the async Task runs and PHPicker presents.
        let pick = app.buttons["Pick Photo"]
        XCTAssertTrue(pick.exists, "Pick Photo button missing")
        pick.tap()

        // The presented PHPickerViewController is a system sheet, so its
        // identifiers vary by iOS version — check several robust indicators.
        let cancelButton = app.buttons["Cancel"]
        let photosNavBar = app.navigationBars["Photos"]
        let presented =
            cancelButton.waitForExistence(timeout: 10)
            || photosNavBar.waitForExistence(timeout: 5)
        XCTAssertTrue(
            presented,
            "Tapping Pick Photo did not present the system photo picker — "
                + "PyreonImagePicker failed to present a PHPickerViewController "
                + "from the key window (or the async Task never ran)"
        )

        // (3) DISMISS the picker. Mandatory, not hygiene: an open system sheet
        // blocks app termination, which wedges the Simulator and cascades
        // launch-timeouts into every later test in the run — the exact CI flake
        // this suite was fixed for. It is also the assertion itself: cancelling
        // is what makes pick() resolve nil.
        if cancelButton.exists {
            cancelButton.tap()
        } else {
            // Fall back to swiping the sheet down if no Cancel is exposed.
            app.swipeDown()
        }

        XCTAssertTrue(
            app.staticTexts["Photo: cancelled"].waitForExistence(timeout: 10),
            "\"Photo: cancelled\" never appeared after dismissing the picker — "
                + "the PHPicker delegate did not resume the continuation with "
                + "nil, so the awaited pick() hung and the post-await "
                + "photoStatus re-render never fired. (A hung continuation is "
                + "the exact failure the delegate's strong-retain guards.)"
        )
        // The old state must be gone — proves a real re-render, not an additive draw.
        XCTAssertFalse(
            app.staticTexts["Photo: idle"].exists,
            "\"Photo: idle\" still present after the pick was cancelled — the "
                + "post-await signal flip did not re-render inside the Task scope"
        )
    }

    func test_biometricAsyncGateRunsOnDevice() throws {
        let app = XCUIApplication()
        app.launch()

        // (1) Initial state — the async handler has not run yet.
        XCTAssertTrue(
            app.staticTexts["Lock: idle"].waitForExistence(timeout: 30),
            "Expected the initial \"Lock: idle\" — the lockStatus signal was not "
                + "seeded (or the Lock text was dropped from the emit)"
        )

        // (2) Tap Unlock → the async Task { await … } runs and flips the text.
        let unlock = app.buttons["Unlock"]
        XCTAssertTrue(unlock.exists, "Unlock button missing")
        unlock.tap()

        XCTAssertTrue(
            app.staticTexts["Lock: denied"].waitForExistence(timeout: 5),
            "\"Lock: denied\" never appeared after tapping Unlock — the async "
                + "handler was not wrapped in a Task (so the awaited "
                + "bio.authenticate never ran) or the post-await lockStatus "
                + "re-render did not fire. On an unenrolled Simulator the gate "
                + "resolves false with no prompt, so this is deterministic."
        )
        // The old state must be gone — proves a real re-render, not an additive draw.
        XCTAssertFalse(
            app.staticTexts["Lock: idle"].exists,
            "\"Lock: idle\" still present after Unlock — the post-await signal "
                + "flip did not re-render inside the Task scope"
        )
    }
}
