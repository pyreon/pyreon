// PyreonRouterDemoUITests — launch + multi-route navigation smoke
// for the iOS router demo.
//
// Closes Gap 7 part (a) from the 2026-06-05 native-readiness audit:
// adds XCUITest coverage to native-router-demo-ios (was absent — only
// TodoMVC had iOS UI tests before this).
//
// Beyond `xcodebuild build` (proves PMTC emit + the @pyreon/native-
// router-swift SPM dep link), this asserts the navigation contract:
//   - The app launches on a real iOS Simulator
//   - The home page renders (`accessibilityIdentifier=home-page`
//     emitted from `<Stack data-testid="home-page">` in RouterApp.tsx)
//   - Tapping "Go to About" navigates to the about page
//     (`accessibilityIdentifier=about-page`)
//   - Tapping "Back to Home" navigates back to home
//
// The chain proves R1.3's "3 routes + Link navigation + native router
// state" claim at real-simulator scope. R1.1 (home renders at launch)
// + the navigation transitions are both asserted by this single test.
//
// 30s waits — same rationale as native-counter-ios UI tests (first
// launch + scene hand-off on freshly booted Simulator can take a few
// seconds; 30s ceiling for CI noise). Post-launch transitions get a
// shorter 5s ceiling because they're synchronous within an already-
// running app.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule, NOT on every PR. Promote to required once
// green across multiple consecutive nightly runs.

import XCTest

final class PyreonRouterDemoUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_appLaunchesOnHomeRoute() throws {
        let app = XCUIApplication()
        app.launch()

        // PMTC emits `<Stack data-testid="home-page">` →
        // `.accessibilityIdentifier("home-page")` via the canonical
        // data-testid transform. `otherElements` queries non-control
        // views; `.firstMatch` avoids ambiguity if the identifier
        // somehow appears more than once in the tree.
        let homePage = app.otherElements["home-page"].firstMatch
        XCTAssertTrue(
            homePage.waitForExistence(timeout: 30),
            "Home page (accessibilityIdentifier=\"home-page\") did not appear within 30s — R1.1 (home renders at launch) regressed"
        )
    }

    func test_navigatesHomeToAbout() throws {
        let app = XCUIApplication()
        app.launch()

        // Wait for home, then tap the "Go to About" button.
        let homePage = app.otherElements["home-page"].firstMatch
        XCTAssertTrue(
            homePage.waitForExistence(timeout: 30),
            "Home page did not render within 30s"
        )

        // The button text is the literal label from RouterApp.tsx —
        // `<Button onPress={() => navigate('/about')}>Go to About</Button>`.
        // SwiftUI Button labels appear as accessibility labels on the
        // button element.
        let goToAbout = app.buttons["Go to About"]
        XCTAssertTrue(
            goToAbout.exists,
            "\"Go to About\" button missing on home page"
        )
        goToAbout.tap()

        // Assert the about-page identifier appears post-navigation.
        let aboutPage = app.otherElements["about-page"].firstMatch
        XCTAssertTrue(
            aboutPage.waitForExistence(timeout: 15),
            "About page did not render within 5s after tapping \"Go to About\" — router push did not commit"
        )

        // Round-trip back to home to assert reverse navigation.
        let backToHome = app.buttons["Back to Home"]
        XCTAssertTrue(
            backToHome.exists,
            "\"Back to Home\" button missing on about page"
        )
        backToHome.tap()

        XCTAssertTrue(
            homePage.waitForExistence(timeout: 15),
            "Did not return to home page within 5s after tapping \"Back to Home\""
        )
    }

    func test_navigatesToUserDetailWithParam() throws {
        // Tap "View user 42" → assert user-page renders. This
        // exercises the `:id` dynamic route segment + useParams()
        // emit path.
        let app = XCUIApplication()
        app.launch()

        let homePage = app.otherElements["home-page"].firstMatch
        XCTAssertTrue(
            homePage.waitForExistence(timeout: 30),
            "Home page did not render within 30s"
        )

        let viewUser = app.buttons["View user 42"]
        XCTAssertTrue(
            viewUser.exists,
            "\"View user 42\" button missing on home page"
        )
        viewUser.tap()

        let userPage = app.otherElements["user-page"].firstMatch
        XCTAssertTrue(
            userPage.waitForExistence(timeout: 15),
            "User page did not render within 5s after tapping \"View user 42\""
        )

        // Assert the parameter rendered. RouterApp.tsx emits
        // `<Text>Profile for user {props.params.id}</Text>` — the
        // string-interpolated `Profile for user 42` appears as a
        // single accessibility text node when params.id resolves to
        // "42" from the route segment.
        let profileText = app.staticTexts["Profile for user 42"]
        XCTAssertTrue(
            profileText.waitForExistence(timeout: 2),
            "Expected \"Profile for user 42\" text not found — useParams() did not populate id=\"42\" from the route segment"
        )
    }

    // MARK: - Core-UI row closure: Link
    //
    // `Link` was the last of the four canonical primitives the capability
    // matrix listed as "not individually asserted" — and it had no usage in ANY
    // gated app, so there was nothing to assert against.
    //
    // It was also structurally unassertable until now: `<Link>` is a
    // SPECIAL-CASE emitter that returned before the generic modifier tail, so
    // `data-testid` never became `.accessibilityIdentifier` and the element
    // could not be selected by XCUITest at all. This test therefore covers both
    // the identifier reaching the emit AND the navigation behaving.
    func test_linkNavigatesToAbout() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )

        // Selecting BY IDENTIFIER is the load-bearing half: before the emit fix
        // this query timed out against a link that rendered perfectly.
        // PyreonLink wraps its label in a Button, so it surfaces as a button.
        // The identifier lands on the CONTAINER, not the Button: the emit adds
        // `.accessibilityElement(children: .contain)` so PyreonLink's wrapper is
        // not flattened out of the a11y tree. Device-read shape:
        //   Other  identifier: 'home-link-about'
        //     Button  label: 'About via Link'
        let link = app.otherElements["home-link-about"]
        XCTAssertTrue(
            link.waitForExistence(timeout: 10),
            "home-link-about not queryable — data-testid did not reach "
                + "accessibilityIdentifier on the emitted PyreonLink"
        )
        link.tap()

        XCTAssertTrue(
            app.otherElements["about-page"].firstMatch.waitForExistence(timeout: 15),
            "About page did not render after tapping the Link — PyreonLink "
                + "resolved no router from the environment, so router?.push "
                + "silently no-oped"
        )
        XCTAssertFalse(
            app.otherElements["home-page"].firstMatch.exists,
            "Home page still present after Link navigation — the route did not "
                + "actually swap"
        )
    }

    // Core-UI residual closure — Layer / Spacer / Heading, the last three
    // canonical primitives without a dedicated behavioural assertion. Each is
    // asserted by GEOMETRY read off the live accessibility tree (frames), not
    // by mere existence, so a mis-emit is visible. They live in THIS app
    // because the router home screen holds everything in the first screenful;
    // the counter's overflowing column makes tail geometry unmeasurable.
    // The #2593 lesson — an element's a11y frame HUGS its content — is
    // exactly what makes the Heading height and the Spacer gap measurable.

    // <Heading level={2}> lowers to `.font(.title).bold()`. A semantic font
    // role is not directly readable via XCUITest — but the glyph-box HEIGHT
    // is: a .title heading is measurably taller than a body-size Text. A
    // Heading that mis-emitted as plain body text collapses the difference.
    func test_headingRendersLargerThanBodyText() throws {
        let app = XCUIApplication()
        app.launch()

        let heading = app.staticTexts["core-heading"]
        XCTAssertTrue(
            heading.waitForExistence(timeout: 30),
            "core-heading missing — <Heading> did not render or its "
                + "data-testid did not reach accessibilityIdentifier"
        )
        XCTAssertEqual(heading.label, "Core heading")
        let body = app.staticTexts["spacer-left"]
        XCTAssertTrue(body.exists, "body-size reference Text missing")
        XCTAssertGreaterThan(
            heading.frame.height,
            body.frame.height + 2,
            "Heading glyph box is not taller than body text — the level→font "
                + "lowering (.title) did not apply"
        )
    }

    // <Spacer /> inside an <Inline> (HStack) is the flexible gap: it PUSHES
    // the siblings to the row's edges. If the Spacer were dropped the two
    // texts would sit adjacent (single-digit-pt gap), so the measured
    // left-to-right gap IS the assertion.
    func test_spacerPushesInlineSiblingsApart() throws {
        let app = XCUIApplication()
        app.launch()

        let left = app.staticTexts["spacer-left"]
        let right = app.staticTexts["spacer-right"]
        XCTAssertTrue(
            left.waitForExistence(timeout: 30),
            "spacer-left missing — the <Inline> row did not render"
        )
        XCTAssertTrue(right.exists, "spacer-right missing")
        let gap = right.frame.minX - left.frame.maxX
        XCTAssertGreaterThan(
            gap,
            100,
            "Spacer did not push the Inline siblings apart (gap \(gap)pt) — "
                + "adjacent texts mean the Spacer was dropped from the emit"
        )
    }

    // <Layer> lowers to ZStack: children stack on the Z axis, so their
    // frames INTERSECT. A mis-emit to a linear container (VStack) lays them
    // out disjoint — frame intersection is the discriminator.
    func test_layerChildrenOverlapOnZAxis() throws {
        let app = XCUIApplication()
        app.launch()

        let under = app.staticTexts["layer-under"]
        let over = app.staticTexts["layer-over"]
        XCTAssertTrue(
            under.waitForExistence(timeout: 30),
            "layer-under missing — the <Layer> subtree did not render"
        )
        XCTAssertTrue(over.exists, "layer-over missing")
        XCTAssertTrue(
            under.frame.intersects(over.frame),
            "Layer children do not overlap (under \(under.frame), over "
                + "\(over.frame)) — ZStack lowering did not apply"
        )
    }

    // Forms row — useFieldArray device-proven on iOS: add + REMOVE-FIRST
    // drive re-rendering of the emitted `ForEach(tags.items, id: \.key)` —
    // append renders the new row, remove-first drops exactly row 0 with the
    // SURVIVOR still rendered, and the count text pins length reactivity
    // (`tags.length` over the @Observable items array). HONEST SCOPE:
    // text-level assertions prove the mutation→re-render chain, not key
    // IDENTITY (a positional list renders the same texts) — key STABILITY
    // across removals is pinned by the runtime contract suites on both
    // platforms (survivor keys asserted directly).
    func test_fieldArrayAddAndRemoveFirstKeepSurvivorRow() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["Go to About"].tap()
        XCTAssertTrue(
            app.otherElements["about-page"].firstMatch.waitForExistence(timeout: 15),
            "About page did not render"
        )

        let count = app.staticTexts["tag-count"]
        XCTAssertTrue(count.waitForExistence(timeout: 10), "tag-count missing")
        XCTAssertEqual(count.label, "Tags: 1")
        XCTAssertTrue(app.staticTexts["tag: alpha"].exists, "initial row missing")

        app.buttons["tag-add"].tap()
        XCTAssertTrue(
            app.staticTexts["tag: beta"].waitForExistence(timeout: 10),
            "appended row did not render"
        )
        XCTAssertEqual(count.label, "Tags: 2")

        app.buttons["tag-remove"].tap()
        XCTAssertTrue(
            app.staticTexts["Tags: 1"].waitForExistence(timeout: 10),
            "count did not drop after remove-first"
        )
        XCTAssertFalse(app.staticTexts["tag: alpha"].exists, "removed row still rendered")
        XCTAssertTrue(
            app.staticTexts["tag: beta"].exists,
            "SURVIVOR row vanished — stable keys did not hold across remove-first"
        )
    }

    // Animations row — the CONFIGURED animation path runs on-device
    // (show → hide → show through the emitted
    // `.animation(.linear(duration: 2.5), value:)`), with the honest
    // MEASUREMENT LIMIT named: SwiftUI removes the view from the
    // ACCESSIBILITY tree the moment the `if` gate flips — the 2500ms fade
    // is visual-only, so exit TIMING is not observable through XCUITest
    // existence (measured: the box reads gone 0.8s into a 2.5s exit). The
    // same instrument class as rendered colours; screenshot-diff is the
    // tracked follow-up. The DEVICE-LEVEL timing proof for duration config
    // lives in the Android half (virtual-clock, deterministic); the iOS
    // config emit is locked by emit specs + the real-SDK typecheck gate.
    func test_transitionConfigAnimatesShowHide() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View motion"].tap()
        XCTAssertTrue(
            app.otherElements["motion-page"].firstMatch.waitForExistence(timeout: 15),
            "Motion page did not render"
        )
        let box = app.staticTexts["slow-box"]
        XCTAssertTrue(box.waitForExistence(timeout: 10), "slow box missing pre-toggle")

        app.buttons["motion-toggle"].tap()
        XCTAssertTrue(
            box.waitForNonExistence(timeout: 6),
            "slow box never left after hide — the configured animation gate did not flip"
        )
        app.buttons["motion-toggle"].tap()
        XCTAssertTrue(
            box.waitForExistence(timeout: 6),
            "slow box did not return after show — the configured animation gate is stuck"
        )
    }

    // Styling row — defineTheme tokens + styled(Prim) device-proven by
    // GEOMETRY. iOS measurement reality (read off a live frame dump, per
    // the #2593 discipline): a11y frames HUG the glyphs — a container's
    // frame equals its child's, so padding is HORIZONTALLY invisible to
    // XCUITest. But padded boxes consume VERTICAL space exactly, so the
    // token values are pinned through the stack's y-gaps:
    //   title → sm-child gap = stack spacing (12) + sm top pad (8)  = 20
    //   sm-child → xl-child gap = sm bottom (8) + 12 + xl top (40)  = 60
    // The FIRST gap pins spacing.sm individually, so the pair is not
    // swap-symmetric; the second pins the sum. Wrong, defaulted, or
    // dropped tokens shift both. (The Android half asserts the horizontal
    // start-aligned offsets — Compose Columns start-align where SwiftUI
    // VStacks center, which is why the iOS shape is vertical.)
    func test_themeTokenPaddingDrivesLayout() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View styles"].tap()
        XCTAssertTrue(
            app.otherElements["styles-page"].firstMatch.waitForExistence(timeout: 15),
            "Styles page did not render"
        )

        let title = app.staticTexts["Styles"]
        let sm = app.staticTexts["card-sm-child"]
        let xl = app.staticTexts["card-xl-child"]
        XCTAssertTrue(sm.waitForExistence(timeout: 10), "card-sm-child missing")
        XCTAssertTrue(xl.exists, "card-xl-child missing")

        let titleToSm = sm.frame.minY - title.frame.maxY
        XCTAssertEqual(
            titleToSm, 20, accuracy: 4,
            "title→sm gap is \(titleToSm)pt, expected spacing(12) + sm pad(8) "
                + "= 20 — spacing.sm did not drive the styled() layout"
        )
        let smToXl = xl.frame.minY - sm.frame.maxY
        XCTAssertEqual(
            smToXl, 60, accuracy: 4,
            "sm→xl gap is \(smToXl)pt, expected sm(8) + spacing(12) + xl(40) "
                + "= 60 — the defineTheme literals did not drive the layout"
        )
    }

    // Networking row — useWebSocket device-proven: a full frame ROUND TRIP
    // through the REAL network stack against the loopback echo server
    // (scripts/ws-echo-server.ts; the iOS Simulator shares the host
    // loopback). The LOAD-BEARING assertion is the echo: send "ping-42" →
    // server replies "echo:ping-42" → received() re-renders the text. The
    // ws-status gate is deliberately NOT the proof — the Swift runtime
    // marks isConnected optimistically on task.resume(), before any
    // handshake completes, so "WS: open" alone would pass against a dead
    // server; only the echo proves a live socket.
    //
    // Requires the echo server: `bun examples/native-router-demo-ios/scripts/ws-echo-server.ts`
    // (CI starts it in the workflow step; locally the device-test recipe does).
    func test_webSocketEchoRoundTripsOnDevice() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View user 42"].tap()
        XCTAssertTrue(
            app.otherElements["user-page"].firstMatch.waitForExistence(timeout: 15),
            "User page did not render"
        )
        XCTAssertTrue(
            app.staticTexts["ws-status"].waitForExistence(timeout: 10),
            "ws-status missing — the WebSocket section did not render"
        )

        app.buttons["ws-send"].tap()
        if !app.staticTexts["Echo: echo:ping-42"].waitForExistence(timeout: 10) {
            XCTFail(
                "echo never rendered — live state: "
                    + "\"\(app.staticTexts["ws-status"].label) / "
                    + "\(app.staticTexts["ws-last"].label)\" (is the echo "
                    + "server running? bun scripts/ws-echo-server.ts)"
            )
        }
    }

    // Storage row — useSecureStorage device-proven: the secret SURVIVES a
    // genuine terminate + relaunch, which only the Keychain can explain.
    //
    // The home page's `onMount` seeds the rendered value from
    // `secrets.read("demo-secret")` — on the relaunched process that read is
    // the ONLY source of "s3cret" (the signal's initial is "none"), so the
    // post-relaunch assertion proves the write landed in the real Keychain
    // (`KeychainSecureBackend`, SecItemAdd/SecItemCopyMatching), not an
    // in-memory map. Bisect: swapping the emitted default for
    // `InMemorySecureBackend` makes exactly the post-relaunch half fail
    // ("Secret: none") while the same-process round trip still passes —
    // the discriminator between "works" and "persists".
    //
    // First-run tolerant BY CONSTRUCTION: the Keychain outlives even app
    // reinstalls, so the pre-tap value may be "none" (fresh Simulator) or
    // "s3cret" (any prior run) — the test never asserts the initial state,
    // only post-tap and post-relaunch.
    func test_secureStorageWriteSurvivesRelaunch() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["secure-value"].waitForExistence(timeout: 30),
            "secure-value missing — the secure-storage section did not render"
        )
        app.buttons["secure-save"].tap()
        // The save handler reads BACK through the store, so this label proves
        // the same-process write→read round trip.
        if !app.staticTexts["Secret: s3cret"].waitForExistence(timeout: 10) {
            // Name the failing HALF in the message: the app renders
            // "Secret: write-failed" / "Secret: read-failed" / the value.
            XCTFail(
                "post-save read-back did not render s3cret — live state: "
                    + "\"\(app.staticTexts["secure-value"].label)\""
            )
        }

        app.terminate()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["secure-value"].waitForExistence(timeout: 30),
            "secure-value missing after relaunch"
        )
        if !app.staticTexts["Secret: s3cret"].waitForExistence(timeout: 10) {
            XCTFail(
                "secret did not survive terminate+relaunch — live state: "
                    + "\"\(app.staticTexts["secure-value"].label)\""
            )
        }
    }

}
