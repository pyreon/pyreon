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

import UIKit
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

    // Adaptive row — the COMPACT half of the responsive-prop proof on the
    // iPhone simulator: the A→B vertical gap carries the compact token
    // (2 → 8pt; a regular resolution would read 24pt, a dropped adaptive
    // prop the Stack default 12pt — all three separable). The REGULAR half
    // is Android's live wm-resize flip (deterministic on one device); the
    // size-class READ on iPad is already device-proven (M2.2).
    func test_adaptivePropsResolveCompactOnPhone() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        let a = app.staticTexts["adaptive-a"]
        let b = app.staticTexts["adaptive-b"]
        XCTAssertTrue(a.waitForExistence(timeout: 10), "adaptive-a missing")
        XCTAssertTrue(b.exists, "adaptive-b missing")
        let gap = b.frame.minY - a.frame.maxY
        XCTAssertEqual(
            gap, 8, accuracy: 3,
            "compact gap is \(gap)pt, expected the compact token (2 → 8pt); "
                + "24 would mean regular resolved on an iPhone, ~12 the "
                + "adaptive prop was dropped for the Stack default"
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

    // Networking row — HTTP VERBS device-proven. The assertion is on what the
    // SERVER SAW: `/echo` reflects the request back, so a POST that silently
    // degraded to a GET — exactly what every version before this arc emitted,
    // because the parser never read `useFetch`'s second argument — renders
    // "Method: GET" and fails here rather than passing quietly.
    //
    // Three things are proven together: the verb reached the wire, the BODY
    // reached it too (a header-only fix would still drop the payload), and a
    // non-2xx REJECTS instead of being handed to the decoder (the /boom PUT).
    // The decode itself is implied by any of the three rendering at all — the
    // reply is only readable as EchoReply if PyreonHttp -> JSONDecoder ran.
    //
    // Requires the fixture: `bun examples/native-router-demo-ios/scripts/ws-echo-server.ts`
    func test_httpVerbAndBodyReachTheWire() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View http"].tap()
        XCTAssertTrue(
            app.otherElements["http-page"].firstMatch.waitForExistence(timeout: 15),
            "http page did not render"
        )

        // The server echoes the METHOD it received.
        if !app.staticTexts["Method: POST"].waitForExistence(timeout: 15) {
            XCTFail(
                "the server did not see a POST — live state: "
                    + "\"\(app.staticTexts["http-method"].label) / "
                    + "\(app.staticTexts["http-body"].label) / "
                    + "\(app.staticTexts["http-id"].label)\" (is the fixture "
                    + "server running? bun scripts/ws-echo-server.ts)"
            )
        }

        // ...and the BODY. Asserted separately because a fix that carried the
        // verb but dropped the payload would pass the check above.
        XCTAssertTrue(
            app.staticTexts["Body: {\"name\":\"pyreon\"}"].waitForExistence(timeout: 10),
            "the request body never reached the server — got "
                + "\"\(app.staticTexts["http-body"].label)\""
        )

        // A non-2xx must surface as an ERROR, not as a decode failure.
        XCTAssertTrue(
            app.staticTexts["Bad: rejected"].waitForExistence(timeout: 10),
            "the 500 from /boom did not reject — got "
                + "\"\(app.staticTexts["http-bad"].label)\""
        )
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

    // Gestures row — the swipe vocabulary, injected as REAL XCUITest
    // swipes (coordinate drags through the compositor, not synthetic
    // events). The status text is three-way separable: 'left'/'right'
    // proves the simultaneous DragGesture fired with the right threshold
    // SIGN; 'tap' after a swipe would mean the drag degraded to the
    // Button's press (the coexistence failure mode); a final REAL tap
    // must still read 'tap' — the drag recognizer must not swallow taps.
    func test_swipeGesturesFireDirectionalHandlers() throws {
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
        let zone = app.buttons["swipe-zone"].firstMatch
        XCTAssertTrue(zone.waitForExistence(timeout: 10), "swipe zone missing")
        XCTAssertTrue(
            app.staticTexts["Swiped: none"].firstMatch.exists,
            "status should start at none"
        )

        zone.swipeLeft()
        XCTAssertTrue(
            app.staticTexts["Swiped: left"].firstMatch.waitForExistence(timeout: 5),
            "left swipe did not fire onSwipeLeft (status: \(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Swiped:'")).firstMatch.label))"
        )

        zone.swipeRight()
        XCTAssertTrue(
            app.staticTexts["Swiped: right"].firstMatch.waitForExistence(timeout: 5),
            "right swipe did not fire onSwipeRight"
        )

        zone.tap()
        XCTAssertTrue(
            app.staticTexts["Swiped: tap"].firstMatch.waitForExistence(timeout: 5),
            "tap no longer fires onPress — the drag gesture swallowed it"
        )
    }

    // Lists-at-scale row — 10,000 keyed rows through <Scroll><For>. Three
    // claims, each separable: (1) CREATION at scale — Row 0 renders inside
    // the timeout (an EAGER 10k build hangs far past it); (2) LAZINESS —
    // the LazyVStack wrap means a deep row is NOT in the a11y tree at
    // launch (a bare ForEach in a ScrollView materializes all 10k);
    // (3) SCROLLING works — after swiping, Row 0 leaves the tree (lazy
    // lists drop off-screen rows). Deep-jump to Row 9999 is Android's half
    // (XCUITest has no scroll-to-element primitive for untagged rows —
    // disclosed, not implied).
    func test_tenThousandRowListIsLazyAndScrolls() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View big list"].tap()
        XCTAssertTrue(
            app.otherElements["biglist-page"].firstMatch.waitForExistence(timeout: 15),
            "Big list page did not render"
        )
        XCTAssertTrue(
            app.staticTexts["Row 0"].firstMatch.waitForExistence(timeout: 10),
            "Row 0 missing — 10k-row creation failed or hung"
        )
        XCTAssertFalse(
            app.staticTexts["Row 9999"].firstMatch.exists,
            "Row 9999 is materialized at launch — the list is EAGER (LazyVStack wrap lost)"
        )
        let scroll = app.scrollViews.firstMatch
        scroll.swipeUp()
        scroll.swipeUp()
        scroll.swipeUp()
        XCTAssertFalse(
            app.staticTexts["Row 0"].firstMatch.exists,
            "Row 0 still on screen after three swipes — the list did not scroll"
        )
    }

    // Accessibility row — the ROLE prop landing in the real accessibility
    // tree. The discriminating shape: a plain Text carrying
    // accessibilityRole="button" + accessibilityLabel. XCUITest derives an
    // element's TYPE from its accessibility traits, so that text is
    // queryable under app.buttons ONLY if .isButton actually landed — and
    // by "Add item" ONLY if the label override landed on the same element.
    // The plain sibling is the negative control (a staticText, not a
    // button). `.isHeader` and .accessibilityHidden stay emit-locked on
    // iOS: XCUITest surfaces neither as a queryable property (disclosed
    // tooling limitation; both are device-asserted on Android, where the
    // Compose semantics tree exposes them directly).
    func test_a11yButtonTraitSurfacesInAccessibilityTree() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View a11y"].tap()
        XCTAssertTrue(
            app.otherElements["a11y-page"].firstMatch.waitForExistence(timeout: 15),
            "A11y page did not render"
        )
        if !app.buttons["Add item"].firstMatch.exists {
            // Self-diagnosing failure: dump the live tree so the element's
            // actual type/label is in the artifact (the read-the-device rule).
            print(app.debugDescription)
        }
        XCTAssertTrue(
            app.buttons["Add item"].firstMatch.exists,
            "Text with accessibilityRole=button + label is not queryable as a button — trait or label emit lost"
        )
        XCTAssertFalse(
            app.buttons["plain sibling"].firstMatch.exists,
            "Plain sibling text surfaces as a button — the trait leaked to siblings"
        )
        XCTAssertTrue(
            app.staticTexts["plain sibling"].firstMatch.exists,
            "Plain sibling text missing entirely"
        )
    }

    // Media row — a REMOTE image through the real network stack. The
    // fixture (ws-echo server /dot.png) serves a solid-RED PNG; the
    // assertion samples the RENDERED element's pixels (screenshot of the
    // element scaled to 1x1 = its average colour), so it can only pass if
    // the bytes were fetched over HTTP, decoded, and drawn. A placeholder,
    // an ATS-blocked fetch, or a dropped AsyncImage emit all read white /
    // not-red. Requires NSAllowsLocalNetworking (this page is what
    // surfaced that ATS gates URLSession cleartext even to localhost —
    // the ws test never saw it because the ws runtime rides
    // Network.framework, which ATS does not cover).
    func test_remoteImageRendersFetchedPixels() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View media"].tap()
        XCTAssertTrue(
            app.otherElements["media-page"].firstMatch.waitForExistence(timeout: 15),
            "Media page did not render"
        )
        let el = app.descendants(matching: .any)["remote-dot"].firstMatch
        XCTAssertTrue(el.waitForExistence(timeout: 15), "remote-dot element missing")

        var sawRed = false
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline {
            if let px = Self.averageColor(of: el.screenshot().image),
               px.r > 200, px.g < 80, px.b < 80 {
                sawRed = true
                break
            }
            usleep(500_000)
        }
        if !sawRed { print(app.debugDescription) }
        XCTAssertTrue(
            sawRed,
            "remote image never rendered red — fetch/decode/draw failed (dead server, ATS block, or lost AsyncImage emit)"
        )
    }

    /// Average colour of a UIImage: draw the whole image into a 1x1 RGBA
    /// context — for the solid-red fixture the average IS the fixture
    /// colour, and averaging is immune to off-by-center sampling.
    private static func averageColor(of image: UIImage) -> (r: Int, g: Int, b: Int)? {
        guard let cg = image.cgImage else { return nil }
        var pixel = [UInt8](repeating: 0, count: 4)
        guard let ctx = CGContext(
            data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        return (Int(pixel[0]), Int(pixel[1]), Int(pixel[2]))
    }

    // Animations row — ASYMMETRIC enter/leave. iOS asserts the BEHAVIOUR of
    // the configured path (both boxes hide and come back), not the timing.
    //
    // That limit is measured, not assumed, and it is the same one the
    // symmetric duration proof already records: SwiftUI drops a view from the
    // ACCESSIBILITY tree the instant the `if` gate flips, so the fade is
    // visual-only and no XCUITest query can distinguish a 200ms removal from
    // a 2500ms one. The asymmetric TIMING is proven on Android's virtual
    // clock instead, where two boxes with opposite configs give opposite
    // answers at one instant; here the load-bearing claim is that
    // `.transition(.asymmetric(insertion:removal:))` — a different emit shape
    // from the symmetric `.animation(_:value:)` container — still mounts and
    // unmounts correctly, which a broken transition modifier would not.
    func test_asymmetricTransitionShowsAndHides() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View anim"].tap()
        XCTAssertTrue(
            app.otherElements["anim-page"].firstMatch.waitForExistence(timeout: 15),
            "Anim page did not render"
        )

        let slow = app.staticTexts["asym-slow-leave"]
        let fast = app.staticTexts["asym-fast-leave"]
        XCTAssertTrue(slow.waitForExistence(timeout: 10), "asymmetric slow-leave box missing")
        XCTAssertTrue(fast.waitForExistence(timeout: 10), "asymmetric fast-leave box missing")

        app.buttons["anim-toggle"].tap()
        XCTAssertTrue(
            slow.waitForNonExistence(timeout: 15),
            "asymmetric slow-leave box never left — the .asymmetric transition did not drive the removal"
        )
        XCTAssertTrue(
            fast.waitForNonExistence(timeout: 15),
            "asymmetric fast-leave box never left"
        )

        // Let the 2500ms removal FINISH before re-showing. This is not
        // padding: re-showing 100ms into an in-flight leave leaves every
        // transition child absent from the accessibility tree on iOS, and it
        // does not return (measured: still absent after 15s, including the
        // pre-existing symmetric slow-box — so it is not specific to the
        // asymmetric emit). The Compose half recovers from the identical
        // interruption on the virtual clock
        // (`reShowingDuringAnInFlightLeaveRecovers`), so the shared source and
        // the emit are sound and this is SwiftUI transition-interruption
        // behaviour. Whether the view is genuinely gone or merely dropped from
        // the a11y tree is NOT determinable with XCUITest — the same
        // instrument limit this row already records for fade timing — so it is
        // disclosed in the matrix as an open question rather than asserted
        // either way.
        Thread.sleep(forTimeInterval: 3.5)
        app.buttons["anim-toggle"].tap()
        XCTAssertTrue(
            slow.waitForExistence(timeout: 15),
            "asymmetric slow-leave box never came back — the insertion side is broken"
        )
        XCTAssertTrue(
            fast.waitForExistence(timeout: 15),
            "asymmetric fast-leave box never came back"
        )
    }

    // Offline/sync row — the DURABILITY half on iOS, across REAL process
    // death. The mounted read seeds the count and state from the DATABASE, so
    // a record still there after `app.terminate()` plus a cold launch can only
    // have come off disk — the second launch shares nothing else with the
    // first.
    //
    // The row's CONNECTIVITY half is Android-only and that is a tooling limit,
    // not an omission: the iOS Simulator has no supported per-app network
    // toggle, so a `useOnline()` flip cannot be driven here. Android proves it
    // as a live radio flip on one device. Asserting the online state alone
    // would be worthless — it passes on a hook hard-wired to `true`, which is
    // exactly what Android's was until this arc.
    //
    // "State: restored" is reachable only through the `if (db.get(...))`
    // presence check, which compiled on NEITHER target until `database.get`
    // joined SERVICE_METHOD_RETURNS.
    func test_offlineWritesSurviveProcessDeath() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View offline"].tap()
        XCTAssertTrue(
            app.otherElements["offline-page"].firstMatch.waitForExistence(timeout: 15),
            "Offline page did not render"
        )

        // Known-empty start so the counts below are unambiguous.
        app.buttons["clear-note"].tap()
        XCTAssertTrue(
            app.staticTexts["Notes: 0"].waitForExistence(timeout: 10),
            "Could not clear the store before the durability check"
        )

        app.buttons["write-note"].tap()
        XCTAssertTrue(
            app.staticTexts["Notes: 1"].waitForExistence(timeout: 10),
            "The write did not land in the database"
        )

        app.terminate()
        app.launch()
        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render after relaunch"
        )
        app.buttons["View offline"].tap()
        XCTAssertTrue(
            app.otherElements["offline-page"].firstMatch.waitForExistence(timeout: 15),
            "Offline page did not render after relaunch"
        )

        XCTAssertTrue(
            app.staticTexts["Notes: 1"].waitForExistence(timeout: 15),
            "The record did not survive process death — the database is not persisting"
        )
        XCTAssertTrue(
            app.staticTexts["State: restored"].waitForExistence(timeout: 10),
            "The presence check did not resolve the stored record after relaunch"
        )

        // Leave the store clean for whichever test runs next.
        app.buttons["clear-note"].tap()
        _ = app.staticTexts["Notes: 0"].waitForExistence(timeout: 10)
    }

    // Platform-APIs row — INBOUND deep links, which had no vocabulary at all
    // (`useLinking()` is outbound-only, so an app could not be opened at a
    // route). Both arrival shapes are asserted, because they take different
    // paths through the runtime and only one of them is the obvious case:
    //
    //   COLD — the app is launched BY the URL. No router exists yet, so
    //          PyreonDeepLink holds the path and the first router consumes it
    //          through its `initialPath` default.
    //   WARM — the app is already running and is handed another URL. A router
    //          exists, so the link is delivered straight to it.
    //
    // A cold-only test would pass on an implementation that drops every link
    // after launch, which is the more common real interaction (tapping a link
    // while the app sits in the background).
    func test_deepLinkOpensTheRouteColdAndWarm() throws {
        let app = XCUIApplication()

        // COLD: launch via the URL itself.
        app.launch()
        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.terminate()

        openURL("pyreondemo://about")
        XCTAssertTrue(
            app.otherElements["about-page"].firstMatch.waitForExistence(timeout: 30),
            "A cold launch via pyreondemo://about did not open the about route — the "
                + "pending link was not consumed by the router's initialPath"
        )

        // WARM: the app is already running; hand it a different link.
        openURL("pyreondemo://styles")
        XCTAssertTrue(
            app.otherElements["styles-page"].firstMatch.waitForExistence(timeout: 20),
            "A warm deep link did not navigate — the live router is not receiving "
                + "links, so every link after launch is dropped"
        )
    }

    /// Open a URL the way the OS would. XCUITest has no API for this, so it
    /// goes through Safari's address bar — the standard XCUITest approach, and
    /// closer to a real user's path than any private hook would be.
    private func openURL(_ url: String) {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.launch()
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20), "Safari did not open")

        // The address field is a text field on the URL bar; its identifier has
        // moved across iOS versions, so match either of the shipped ones.
        let field = safari.textFields["Address"].exists
            ? safari.textFields["Address"]
            : safari.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 20), "Safari address field missing")
        field.tap()
        field.typeText("\(url)\n")

        // Safari asks before handing off to another app.
        let open = safari.buttons["Open"]
        if open.waitForExistence(timeout: 10) { open.tap() }
    }


    // Styling row — @pyreon/coolgrid, listed as supported since it landed but
    // never rendered on a device. The 12-column split is ASYMMETRIC (3/9) so
    // the geometry discriminates: a dropped grid leaves both columns at the
    // row's left edge, and a defaulted or swapped span puts the boundary at
    // the wrong fraction — neither of which a 6/6 split could reveal.
    //
    // iOS reads the wide column's x-ORIGIN rather than any width: XCUITest
    // a11y frames hug their glyphs, so a container's WIDTH is invisible here
    // (the #2593 lesson, which the token-padding proof re-measured before
    // asserting), but where a glyph STARTS is a real layout fact. The wide
    // column begins after the narrow one's 3/12, so its text must sit at
    // roughly a quarter of the screen — and far to the right of the narrow
    // column's text, which a collapsed grid would not do.
    func test_coolgridColumnsSplitTheRowByTheirSpans() throws {
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

        let narrow = app.staticTexts["grid-text-narrow"].firstMatch
        let wide = app.staticTexts["grid-text-wide"].firstMatch
        XCTAssertTrue(narrow.waitForExistence(timeout: 10), "narrow column text missing")
        XCTAssertTrue(wide.waitForExistence(timeout: 10), "wide column text missing")

        // The measurement is each glyph's CENTRE, not a column edge:
        // `containerRelativeFrame(count:span:)` sizes the column and the
        // stack centres its content, so the text sits mid-column. A first
        // reading of 249.75pt on a 402pt screen looked like a broken grid
        // until that was accounted for — it is exactly the midpoint of a
        // column spanning 25%->100%. Centres pin BOTH spans at once:
        // narrow (0->3/12) centres at 12.5% of the screen, wide (3/12->12/12)
        // at 62.5%. A collapsed grid puts both glyphs together near the left.
        let screen = app.windows.firstMatch.frame.width
        let narrowCentre = narrow.frame.midX
        let wideCentre = wide.frame.midX
        XCTAssertEqual(
            narrowCentre, screen * 0.125, accuracy: screen * 0.06,
            "The 3/12 column's text centres at \(narrowCentre) on a \(screen)pt screen; "
                + "a 3/12 span centres near \(screen * 0.125)"
        )
        XCTAssertEqual(
            wideCentre, screen * 0.625, accuracy: screen * 0.06,
            "The 9/12 column's text centres at \(wideCentre) on a \(screen)pt screen; "
                + "a span from 3/12 to 12/12 centres near \(screen * 0.625). A collapsed "
                + "grid would leave both columns bunched at the row's left edge"
        )
        XCTAssertGreaterThan(
            wideCentre, narrow.frame.maxX,
            "The wide column's text is not to the right of the narrow column's — the "
                + "columns are not being laid out side by side at all"
        )
    }


    // Styling row — @pyreon/elements' Element, the other named gap with no
    // native example. `padding={4}` is scale step 4 -> 16pt. Padded boxes
    // consume VERTICAL space exactly on iOS (horizontal padding is invisible
    // to a11y frames, vertical is not), so the assertion is the offset from
    // the marker above: the 12pt stack gap plus 16pt of padding.
    func test_elementPaddingConsumesRealVerticalSpace() throws {
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

        let marker = app.staticTexts["element-marker"].firstMatch
        let child = app.staticTexts["element-child"].firstMatch
        XCTAssertTrue(marker.waitForExistence(timeout: 10), "marker text missing")
        XCTAssertTrue(child.waitForExistence(timeout: 10), "element child text missing")

        let gap = child.frame.minY - marker.frame.maxY
        XCTAssertEqual(
            gap, 28, accuracy: 6,
            "marker->child offset is \(gap)pt; expected ~28 (12pt stack gap + 16pt "
                + "Element padding). A bare ~12 means the padding never reached layout"
        )
    }

    // Background/push — the RECEIPT half device-asserted through the REAL
    // system pipeline. The shared PushPage renders
    // `Push: {push.lastNotification?.title ?? 'none'}`; the emit's
    // `.onAppear { push.start() }` installs a container-owned
    // UNUserNotificationCenter delegate, and `xcrun simctl push` injects an
    // actual APNs payload through that delegate — no credentials involved.
    //
    // Two-part like the geolocation coordinate assert:
    //   - Plain CI run: page renders, the container starts without crashing,
    //     the initial "Push: none" state is committed. The system permission
    //     alert (requestAuthorization fires on appear) is dismissed via
    //     Springboard so it cannot wedge later launches (the modal-wedge
    //     class, #2314).
    //   - Under scripts/push-device-test.sh (TEST_RUNNER_PYREON_PUSH_INJECTED):
    //     the script pushes a payload every 3s while this test polls for the
    //     rendered title — asserting delivery -> delegate -> container ->
    //     SwiftUI re-render, the full chain.
    func test_pushReceiptRendersInjectedPayload() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.otherElements["home-page"].firstMatch.waitForExistence(timeout: 30),
            "Home page did not render"
        )
        app.buttons["View push"].tap()
        XCTAssertTrue(
            app.otherElements["push-page"].firstMatch.waitForExistence(timeout: 15),
            "Push page did not render"
        )

        // The no-arg start() requests notification authorization on appear —
        // answer the Springboard-owned alert so it can't linger over later
        // tests. "Allow" specifically: an authorized app is also the shape
        // the injected-payload half needs for the banner presentation path.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Allow", "OK"] {
            let button = springboard.buttons[label]
            if button.waitForExistence(timeout: 3) {
                button.tap()
                break
            }
        }

        guard ProcessInfo.processInfo.environment["PYREON_PUSH_INJECTED"] == "1" else {
            // No injector running — assert the committed INITIAL state: the
            // container started without crashing and the reads rendered.
            // This assert is only valid here: under the injector the first
            // payload lands within ~3s of page-appear, so "Push: none" is a
            // transient the poll below has usually already missed (the first
            // local run failed exactly that way — the tree showed
            // "Push: Hello from Pyreon" / "Count: 4" while the test was
            // still waiting for "none"). The delivery assertion needs
            // scripts/push-device-test.sh (it passes
            // TEST_RUNNER_PYREON_PUSH_INJECTED — a bare env var does NOT
            // reach the runner).
            XCTAssertTrue(
                app.staticTexts["Push: none"].waitForExistence(timeout: 10),
                "Push page did not commit its initial state — the container "
                    + "start() crashed or the reads never rendered"
            )
            return
        }

        // The injector loops `simctl push` with this title every 3s; the
        // delegate's willPresent must land it in the container and SwiftUI
        // must re-render the read. 60s is ~20 injection attempts.
        XCTAssertTrue(
            app.staticTexts["Push: Hello from Pyreon"].waitForExistence(timeout: 60),
            "Injected APNs payload never rendered — delivery through the "
                + "UNUserNotificationCenter delegate did not reach the container "
                + "(observed: \(app.staticTexts["push-title"].firstMatch.label))"
        )
    }
}
