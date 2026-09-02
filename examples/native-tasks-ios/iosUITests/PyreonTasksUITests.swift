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

    /// Poll a static text's label — a state change lands a frame later than
    /// the gesture that caused it, so an immediate assert races the render.
    private func waitForLabel(_ el: XCUIElement, _ expected: String, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if el.exists && el.label == expected { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return el.exists && el.label == expected
    }

    /// Tap an element on a long screen, scrolling the containing ScrollView
    /// ourselves rather than relying on XCUITest's scroll-to-visible.
    ///
    /// `XCUIElement.tap()` first performs `kAXScrollToVisibleAction`, and on a
    /// SwiftUI ScrollView that action fails outright:
    ///
    ///     Failed to scroll to visible (by AX action) Button, label: 'Open',
    ///     error: kAXErrorCannotComplete performing kAXScrollToVisibleAction
    ///
    /// This screen has hit it twice now, on two different elements — the sign
    /// that it is a property of the screen rather than of any one button.
    /// Wrapping the page in `<Scroll>` made the content REACHABLE; it did not
    /// make the AX action work, and those are separate things.
    ///
    /// Swiping is what a person does, and it is what XCUITest can actually
    /// perform on a SwiftUI ScrollView. Bounded rather than open-ended: a
    /// missing element must fail as "never became hittable" after a known
    /// number of swipes, not spin.
    private func tapAfterScrolling(
        _ element: XCUIElement,
        in app: XCUIApplication,
        maxSwipes: Int = 8,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        if element.exists && element.isHittable {
            element.tap()
            return
        }
        let scroller = app.scrollViews.firstMatch
        var swipes = 0
        while swipes < maxSwipes && !(element.exists && element.isHittable) {
            if scroller.exists {
                scroller.swipeUp()
            } else {
                app.swipeUp()
            }
            swipes += 1
        }
        XCTAssertTrue(
            element.exists && element.isHittable,
            // The count is in the message on purpose: "not hittable" and "not
            // hittable after eight swipes" send you to different places.
            //
            // And say WHICH of the three it is rather than listing them. The
            // first version offered "absent, zero-size, or covered by
            // something", which is the guess the reader would have made
            // unaided — a device round costs 35 minutes, so the message has to
            // carry the answer.
            "element never became hittable after \(swipes) swipe(s) — "
                + "exists=\(element.exists) hittable=\(element.isHittable) "
                + "frame=\(element.exists ? "\(element.frame)" : "n/a") "
                + "keyboardShown=\(app.keyboards.count > 0)",
            file: file,
            line: line
        )
        element.tap()
    }

    /// Put the software keyboard away.
    ///
    /// A `typeText` raises it, and it covers the bottom of the screen — so the
    /// control directly under the field you just typed into is not hittable,
    /// and no amount of scrolling makes it so: the keyboard is above the scroll
    /// view, not inside it. That is what took out `toolkit-schema-submit`,
    /// which sits immediately below `toolkit-schema-name`.
    ///
    /// Dismissed via the keyboard's own return key rather than by typing a
    /// newline into the field, which would fire the field's `onSubmit` and
    /// change app state as a side effect of a test helper.
    ///
    /// A no-op when no software keyboard is up — a CI runner with a hardware
    /// keyboard attached may never raise one, in which case nothing was
    /// covered.
    private func dismissKeyboard(_ app: XCUIApplication) {
        guard app.keyboards.count > 0 else { return }
        for label in ["Return", "return", "Done", "done", "Go", "go", "Search"] {
            let key = app.keyboards.buttons[label]
            if key.exists && key.isHittable {
                key.tap()
                return
            }
        }
    }

    func test_appLaunchesOnLoginPage() throws {
        let app = XCUIApplication()
        app.launch()

        let loginPage = app.otherElements["login-page"].firstMatch
        XCTAssertTrue(
            loginPage.waitForExistence(timeout: 30),
            "Login page did not render within 30s"
        )

        // Asset-pipeline arc: the branded header is a BUNDLED image —
        // `Image("pyreon-logo")` from the materialized Assets.xcassets.
        // A missing catalog (assets step didn't run) renders an empty
        // image NODE, so assert existence via the accessibility id the
        // emit threads (the testid contract).
        let brandLogo = app.images["brand-logo"].firstMatch
        XCTAssertTrue(
            brandLogo.waitForExistence(timeout: 15),
            "Bundled brand logo missing — did scripts/build.sh materialize Assets.xcassets from ../native-tasks/assets?"
        )

        // Font-pipeline arc (PR-1.4): the title uses the bundled Brand
        // font (Font.custom with the PostScript name from the manifest).
        // The glyph rendering isn't queryable, but the node's presence
        // proves the UIAppFonts registration + Font.custom didn't crash
        // (a bad PostScript name silently falls back; a bad bundle entry
        // is a launch-time console error, not a crash — so this is a
        // smoke, paired with the deterministic materializer unit test).
        let brandTitle = app.staticTexts["brand-title"].firstMatch
        XCTAssertTrue(
            brandTitle.waitForExistence(timeout: 15),
            "Branded title missing — the custom-font Text did not render"
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
        username.typeText("ab")
        dismissKeyboard(app)

        let submit = app.buttons["login-submit"].firstMatch
        XCTAssertTrue(submit.exists, "Continue button missing")

        // Phase 1a: the ERROR path — "ab" fails the min-3 validator:
        // the error text renders, navigation is BLOCKED (form.submit()
        // gates on validateAll), and we stay on the login page. This is
        // the device-scope proof of the form-binding arc.
        submit.tap()

        let validationError = app.staticTexts["At least 3 characters"].firstMatch
        XCTAssertTrue(
            validationError.waitForExistence(timeout: 15),
            "Validator error text did not render — form.submit() did not run the validator"
        )
        XCTAssertTrue(
            app.otherElements["login-page"].firstMatch.exists,
            "Navigation was not blocked by the failing validator"
        )

        // Phase 1b: typing more characters fixes the field — setValue
        // re-validates after an error, so the message clears live.
        username.tap()
        username.typeText("cde")
        dismissKeyboard(app)
        submit.tap()

        let tasksPage = app.otherElements["tasks-page"].firstMatch
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Tasks page did not render within 5s after login — the store-backed beforeEnter gate did not admit the navigation"
        )

        // Icon-mapping arc (PR-1.3): the header's canonical
        // <Icon name="star"> maps to SF Symbol star.fill via ICON_MAP.
        let headerIcon = app.images["header-icon"].firstMatch
        XCTAssertTrue(
            headerIcon.waitForExistence(timeout: 15),
            "Header icon missing — the canonical icon name did not map to an SF Symbol"
        )

        // Phase 2: add a task — proves the STORE list mutation
        // (.set spread-append on the @Observable singleton) re-renders
        // the keyed list.
        let titleField = app.textFields["new-task-title"].firstMatch
        XCTAssertTrue(titleField.exists, "New-task field missing on tasks page")
        titleField.tap()
        titleField.typeText("Verify on the simulator")
        dismissKeyboard(app)

        let add = app.buttons["new-task-add"].firstMatch
        XCTAssertTrue(add.exists, "Add button missing on tasks page")
        add.tap()

        let newRow = app.staticTexts["Verify on the simulator"].firstMatch
        XCTAssertTrue(
            newRow.waitForExistence(timeout: 15),
            "Added task did not appear — store .set() list mutation did not re-render"
        )

        // Phase 3: typed-params route — /tasks/1 constructs
        // TaskDetailPageParam(id: "1") in the dispatcher (auth-gated).
        let openFirst = app.buttons["tasks-open-first"].firstMatch
        XCTAssertTrue(openFirst.exists, "Open-task-1 button missing on tasks page")
        tapAfterScrolling(openFirst, in: app)

        let detailPage = app.otherElements["task-detail-page"].firstMatch
        XCTAssertTrue(
            detailPage.waitForExistence(timeout: 15),
            "Task-detail page did not render within 5s — typed-params dispatch did not match /tasks/1"
        )

        let paramText = app.staticTexts["Viewing task 1"].firstMatch
        XCTAssertTrue(
            paramText.waitForExistence(timeout: 15),
            "Typed param text missing — TaskDetailPageParam(id:) was not constructed from the matched segment"
        )

        // Phase 4: back to the list.
        let back = app.buttons["detail-back"].firstMatch
        XCTAssertTrue(back.exists, "Back button missing on detail page")
        back.tap()

        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Did not return to tasks page within 5s after Back"
        )

        // Phase 5: networked fetch (the fetch-arc device proof) — the
        // quotes screen runs useFetch<Quote[]> through the emitted
        // URLSession `.task {}` harness against the CI fixture server
        // (http://127.0.0.1:8787 — the Simulator shares the host
        // loopback; ATS allows it via NSAllowsLocalNetworking). The
        // decoded rows asserted BY CONTENT (a fixture quote's text), so
        // a 200-with-wrong-body can't pass.
        let quotesNav = app.buttons["tasks-quotes"].firstMatch
        XCTAssertTrue(quotesNav.exists, "Quotes button missing on tasks page")
        quotesNav.tap()

        let quotesPage = app.otherElements["quotes-page"].firstMatch
        XCTAssertTrue(
            quotesPage.waitForExistence(timeout: 15),
            "Quotes page did not render — /quotes route dispatch failed"
        )

        let firstQuote = app.staticTexts["Make it work, make it right, make it fast."].firstMatch
        XCTAssertTrue(
            firstQuote.waitForExistence(timeout: 20),
            "Fetched quote text did not render — the URLSession harness did not resolve data from the fixture server (is the CI file server on 8787 up?)"
        )

        let quotesBack = app.buttons["quotes-back"].firstMatch
        XCTAssertTrue(quotesBack.exists, "Back button missing on quotes page")
        quotesBack.tap()

        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Did not return to tasks page after quotes Back"
        )

        // Vocabulary-completion proof: Scroll (ScrollView) + remote Image
        // (AsyncImage over the fixture server) + Modal (.sheet/Dialog).
        let vocabNav = app.buttons["tasks-vocab"].firstMatch
        XCTAssertTrue(vocabNav.exists, "Vocab button missing on tasks page")
        vocabNav.tap()

        // Scroll (ScrollView) renders the page; the open-modal button +
        // remote-image node are in the tree. iOS needs NO import changes
        // for Scroll/Modal/AsyncImage (all native SwiftUI) — the
        // androidx-import fix this change carries is Kotlin-only, fully
        // proven by the Android gradle build + Espresso below. iOS just
        // confirms the screen renders; async-image DECODE timing and the
        // .sheet present are render-timing-flaky on the Simulator and
        // orthogonal to the import fix, so they're asserted on Android
        // (Compose) where the fix actually lands.
        // Type-agnostic query: SwiftUI collapses the page's root VStack into
        // its dominant child — here the <Scroll>'s `ScrollView` (the
        // `EmptyView().sheet` Modal sibling is zero-size) — so the
        // `vocab-page` identifier lands on a ScrollView, NOT an `Other`.
        // `app.otherElements[…]` (type-specific) never matches it. Query
        // across all descendant types so the page-container's element TYPE
        // (Other vs ScrollView, content-dependent) doesn't break the assert.
        let vocabPage = app.descendants(matching: .any)["vocab-page"].firstMatch
        XCTAssertTrue(
            vocabPage.waitForExistence(timeout: 15),
            "Vocab page did not render — /vocab dispatch failed (Scroll wrap broke the screen?)"
        )
        let openModal = app.buttons["vocab-open-modal"].firstMatch
        XCTAssertTrue(
            openModal.waitForExistence(timeout: 15),
            "Open-dialog button missing — the Modal/Button subtree did not render inside the Scroll"
        )
        let vocabBack = app.buttons["vocab-back"].firstMatch
        XCTAssertTrue(vocabBack.exists, "Back button missing on vocab page")
        tapAfterScrolling(vocabBack, in: app)
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Did not return to tasks after vocab Back"
        )

        // Phase 5.5: lifecycle (Phase 2 real-semantics proof). The
        // ErrorBoundary wraps a fetch to a MISSING path → the container
        // rejects → hasError true → its fallback renders. That fallback
        // appearing is the DETERMINISTIC discriminator vs the old inert
        // wrapper, which never showed a fallback. The Suspense's content
        // (lc-quote, from the good fetch) also renders after it settles.
        let lifecycleNav = app.buttons["tasks-lifecycle"].firstMatch
        XCTAssertTrue(lifecycleNav.exists, "Lifecycle button missing on tasks page")
        lifecycleNav.tap()

        let lifecyclePage = app.otherElements["lifecycle-page"].firstMatch
        XCTAssertTrue(
            lifecyclePage.waitForExistence(timeout: 15),
            "Lifecycle page did not render"
        )
        // DIAGNOSTIC: check the GOOD fetch (Suspense content) first — if it
        // renders, the fetch+observation pipeline works and the host
        // fixture server is reachable. Then the error path.
        let suspenseContent = app.staticTexts["lc-quote"].firstMatch
        if !suspenseContent.waitForExistence(timeout: 20) {
            print("DIAG-HIERARCHY:\n\(app.debugDescription)")
        }
        XCTAssertTrue(
            suspenseContent.exists,
            "Suspense content did not render after the fetch settled"
        )
        let errorFallback = app.staticTexts["lc-error"].firstMatch
        if !errorFallback.waitForExistence(timeout: 20) {
            print("DIAG-HIERARCHY-ERR:\n\(app.debugDescription)")
        }
        XCTAssertTrue(
            errorFallback.exists,
            "ErrorBoundary fallback did not show — the boundary did not observe the failed fetch's error (real semantics broken)"
        )
        let lifecycleBack = app.buttons["lifecycle-back"].firstMatch
        XCTAssertTrue(lifecycleBack.exists, "Back button missing on lifecycle page")
        lifecycleBack.tap()
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Did not return to tasks after lifecycle Back"
        )

        // Phase 5.6: stats — the 2026-07 P1-sprint vocabulary in one page:
        // Object.keys/values over a DECLARED struct (typeRef resolution),
        // seeded reduce, Double division, the filter-map flatMap idiom, a
        // 2-param indexed filter with Int×Double coercion + mixed
        // comparison, and an identity-keyed <For> over a string list
        // (id: \.self — the For-by fix this page surfaced). Int-derived
        // texts are asserted exactly ("247" / "2"); Double TEXT is not
        // (Swift/Kotlin stringify Doubles differently) — the average
        // rendering at all proves the Double pipeline.
        let statsNav = app.buttons["tasks-stats"].firstMatch
        XCTAssertTrue(statsNav.exists, "Stats button missing on tasks page")
        statsNav.tap()

        let statsPage = app.otherElements["stats-page"].firstMatch
        XCTAssertTrue(
            statsPage.waitForExistence(timeout: 15),
            "Stats page did not render"
        )
        let statsTotal = app.staticTexts["stats-total"].firstMatch
        XCTAssertTrue(statsTotal.waitForExistence(timeout: 10), "Stats total missing")
        XCTAssertEqual(statsTotal.label, "247", "Object.values reduce total wrong")
        let statsHigh = app.staticTexts["stats-high"].firstMatch
        XCTAssertTrue(statsHigh.exists, "Stats high-count missing")
        XCTAssertEqual(statsHigh.label, "2", "filter-map high count wrong")
        let statsAvg = app.staticTexts["stats-average"].firstMatch
        XCTAssertTrue(statsAvg.exists, "Stats average (Double pipeline) missing")
        // #3255: the plot engine's native HOST — `<SankeyChart>` lowers to a
        // SwiftUI Canvas walking the generated engine's draw list. The canvas
        // carries the testid as its identifier and the title as its label;
        // a Canvas is not a type-specific element, so query by ANY type. A
        // non-zero frame proves the host was laid out (GeometryReader +
        // .frame(height:)), not merely present in the tree.
        let statsFlow = app.descendants(matching: .any).matching(identifier: "stats-flow").firstMatch
        XCTAssertTrue(statsFlow.waitForExistence(timeout: 10), "Sankey chart canvas missing on stats page")
        XCTAssertGreaterThan(statsFlow.frame.height, 100, "Sankey chart canvas has no height")
        XCTAssertGreaterThan(statsFlow.frame.width, 100, "Sankey chart canvas has no width")
        // #3257: `onSelectIndex` — a tap on the canvas runs the engine's hit test
        // (hitSankeyIndex over the same layout the canvas painted) and binds the
        // node index. The first band (Backlog) sits at x 80–96 inside the canvas
        // (the host's 80pt gutter) and spans nearly the full height, so a tap at
        // (88, 80) from the canvas origin lands on node 0; the bound text proves
        // the gesture reached the state, not merely that a gesture exists.
        let flowPick = app.staticTexts["stats-flow-pick"].firstMatch
        XCTAssertTrue(flowPick.waitForExistence(timeout: 10), "flow pick text missing")
        XCTAssertEqual(flowPick.label, "-1", "no tap yet, pick should be -1")
        statsFlow.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 88, dy: 80)).tap()
        XCTAssertTrue(
            waitForLabel(flowPick, "0", timeout: 10),
            "tap on the first Sankey band did not bind node 0 (label: \(flowPick.label))"
        )
        // #3263: `<PlotChart marks>` — the cartesian family natively. The bars
        // canvas carries the testid; a tap runs the engine's plotHitBars over
        // the same spec the canvas painted. Three category bands share the plot
        // (left gutter ~35pt for the y labels), so (90, 100) from the canvas
        // origin is inside the first bar — every bar spans that height, with
        // or without the preset strip that shortens the plot from below.
        let statsBars = app.descendants(matching: .any).matching(identifier: "stats-bars").firstMatch
        XCTAssertTrue(statsBars.waitForExistence(timeout: 10), "bar chart canvas missing on stats page")
        XCTAssertGreaterThan(statsBars.frame.height, 100, "bar chart canvas has no height")
        let barPick = app.staticTexts["stats-bars-pick"].firstMatch
        XCTAssertTrue(barPick.waitForExistence(timeout: 10), "bar pick text missing")
        XCTAssertEqual(barPick.label, "-1", "no tap yet, bar pick should be -1")
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "0", timeout: 10),
            "tap on the first bar did not bind index 0 (label: \(barPick.label))"
        )
        // #3268: `<PlotChart dataZoom>` — a pinch drives the engine's fraction
        // window through MagnificationGesture. 4.5x on three rows keeps only
        // row 1 (any scale in 3…6 does), so the sole band now IS 'art' and a
        // tap must report the GLOBAL index 1: gesture, slice and rebase, together.
        statsBars.pinch(withScale: 4.5, velocity: 2)
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "1", timeout: 10),
            "after the pinch, a tap on the sole band did not bind the GLOBAL index 1 (label: \(barPick.label))"
        )
        // #3270: `<PlotChart zoomPresets>` — the engine lays the strip out along
        // the canvas bottom (22pt), right-aligned: 'all' is the last button (~34pt
        // wide, centred ~25pt in from the right edge), 'last 1' sits left of it
        // (~49pt wide, centred ~72pt in). 'last 1' keeps only the LAST row, so the
        // sole band must report the GLOBAL index 2; 'all' restores every row and
        // the first band is row 0 again. A missed button leaves the previous
        // window in place, which the next band tap exposes as the wrong index.
        let barsW = statsBars.frame.width
        let barsH = statsBars.frame.height
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: barsW - 72, dy: barsH - 11)).tap()
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "2", timeout: 10),
            "after the 'last 1' preset, a tap on the sole band did not bind the GLOBAL index 2 (label: \(barPick.label))"
        )
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: barsW - 25, dy: barsH - 11)).tap()
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "0", timeout: 10),
            "after the 'all' preset, a tap on the first band did not bind index 0 again (label: \(barPick.label))"
        )
        // #3272: the legend tap toggle. The chart has no title chrome, so the
        // legend row is the canvas top: the 'Score' entry box spans x 0…~44, y 0…11.
        // Hiding the only series leaves no bar geometry, so the band tap reports
        // -1; a second entry tap brings the series back and the band is 0 again.
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 20, dy: 6)).tap()
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "-1", timeout: 10),
            "after hiding the series from the legend entry, the band tap did not report -1 (label: \(barPick.label))"
        )
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 20, dy: 6)).tap()
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "0", timeout: 10),
            "after showing the series again from the legend entry, the band tap did not bind 0 (label: \(barPick.label))"
        )
        // #3274: the navigator strip (x 8…W-8, centred 40pt above the canvas
        // bottom, above the preset strip). Dragging the LEFT handle right by 55%
        // of the strip leaves rows 1..2, so the first band is the GLOBAL index 1;
        // dragging the band left by 55% brings rows 0..1 back, so it is 0 again.
        let navY = barsH - 40
        let stripW = barsW - 16
        let navOrigin = statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        navOrigin.withOffset(CGVector(dx: 10, dy: navY)).press(forDuration: 0.2, thenDragTo: navOrigin.withOffset(CGVector(dx: 10 + stripW * 0.55, dy: navY)))
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "1", timeout: 10),
            "after dragging the navigator's left handle, the first band did not bind the GLOBAL index 1 (label: \(barPick.label))"
        )
        navOrigin.withOffset(CGVector(dx: 8 + stripW * 0.775, dy: navY)).press(forDuration: 0.2, thenDragTo: navOrigin.withOffset(CGVector(dx: 8 + stripW * 0.225, dy: navY)))
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "0", timeout: 10),
            "after dragging the navigator band left, the first band did not bind 0 again (label: \(barPick.label))"
        )
        let statsBack = app.buttons["stats-back"].firstMatch
        XCTAssertTrue(statsBack.exists, "Back button missing on stats page")
        statsBack.tap()
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Did not return to tasks after stats Back"
        )

        // Phase 5b: the TOOLKIT screen — the one place eleven packages that had
        // only ever been snippet-proven actually run. The web e2e asserts the
        // same values in a browser; this is the native half, and until it
        // existed the screen was COMPILE-proven on device and nothing more.
        //
        // Values, not existence: a permissions container that wrongly denies
        // renders "false", which exists just as happily as "true".
        let toolkitBtn = app.buttons["tasks-toolkit"].firstMatch
        XCTAssertTrue(toolkitBtn.exists, "Toolkit button missing on tasks page")
        toolkitBtn.tap()

        let toolkitPage = app.otherElements["toolkit-page"].firstMatch
        XCTAssertTrue(
            toolkitPage.waitForExistence(timeout: 15),
            "Toolkit page did not render"
        )

        // i18n: the TRANSLATED title. A missing catalogue renders the key.
        let toolkitTitle = app.staticTexts["toolkit-title"].firstMatch
        XCTAssertTrue(toolkitTitle.waitForExistence(timeout: 10), "Toolkit title missing")
        XCTAssertEqual(toolkitTitle.label, "Toolkit", "i18n lookup did not resolve")

        // url-state: the default reaches the view through the router's query.
        XCTAssertEqual(
            app.staticTexts["toolkit-filter"].firstMatch.label,
            "all",
            "useUrlState default did not reach the view"
        )
        // permissions: seeded with tasks.write, so the check GRANTS.
        XCTAssertEqual(
            app.staticTexts["toolkit-perm"].firstMatch.label,
            "true",
            "PyreonPermissions denied a seeded grant"
        )
        // table: one row at pageSize 10 is exactly one page.
        XCTAssertEqual(
            app.staticTexts["toolkit-tablepages"].firstMatch.label,
            "1",
            "PyreonTableState page count wrong"
        )
        // rx: [1,2,3,4] -> evens -> doubled, so a length of 2.
        XCTAssertEqual(
            app.staticTexts["toolkit-evens"].firstMatch.label,
            "2",
            "the rx chain did not lower to chained computeds"
        )
        // state-tree: the model's declared default.
        XCTAssertEqual(
            app.staticTexts["toolkit-pagesize"].firstMatch.label,
            "20",
            "state-tree model default did not reach the view"
        )

        // ui-system: styler + elements lower to native view modifiers. The
        // styling itself is not queryable from XCUITest, so assert what IS —
        // that each styled wrapper renders its CHILDREN. A wrapper that lowers
        // to nothing, or to an invented view, fails here. The web e2e asserts
        // the computed CSS, which is the half only a browser can see.
        XCTAssertTrue(
            app.staticTexts["toolkit-card-text"].firstMatch.waitForExistence(timeout: 10),
            "styled() wrapper did not render its child"
        )
        XCTAssertTrue(
            app.staticTexts["toolkit-rocket-text"].firstMatch.exists,
            "rocketstyle .theme() wrapper did not render its child"
        )
        XCTAssertTrue(
            app.staticTexts["toolkit-el-a"].firstMatch.exists,
            "Element did not render its first child"
        )
        XCTAssertTrue(
            app.staticTexts["toolkit-el-b"].firstMatch.exists,
            "Element did not render its second child"
        )

        // attrs + coolgrid: both are structural wrappers, so what a device can
        // see is that each renders its leaf. A wrapper that lowers to nothing,
        // or to an invented view, fails here; the web e2e asserts attrs' baked
        // `gap` default, which only a computed style can show.
        XCTAssertTrue(
            app.staticTexts["toolkit-attrs-text"].firstMatch.exists,
            "attrs() wrapper did not render its child"
        )
        XCTAssertTrue(
            app.staticTexts["toolkit-grid-cell"].firstMatch.exists,
            "coolgrid Container > Row > Col did not render its leaf"
        )
        // hotkeys: the counter renders at its initial value. The PRESS is not
        // asserted here — `.keyboardShortcut` needs a hardware keyboard the
        // simulator has no reliable way to drive from XCUITest, so the web e2e
        // owns that half and presses the real combo.
        XCTAssertEqual(
            app.staticTexts["toolkit-hotkey"].firstMatch.label,
            "0",
            "useHotkey's bound counter did not render"
        )

        // validation: the schema-driven form. `isValid` is derived from errors
        // and an untouched field has none, so its initial value proves nothing —
        // submit is what runs the schema.
        let schemaName = app.textFields["toolkit-schema-name"].firstMatch
        XCTAssertTrue(schemaName.exists, "Schema form field missing on toolkit page")
        tapAfterScrolling(schemaName, in: app)
        schemaName.typeText("ab")
        dismissKeyboard(app)
        tapAfterScrolling(app.buttons["toolkit-schema-submit"].firstMatch, in: app)
        XCTAssertEqual(
            app.staticTexts["toolkit-schema-valid"].firstMatch.label,
            "false",
            "the zodSchema declaration did not reject a too-short value"
        )

        // WebView bridge — the mechanism charts / code / flow / rich-text ride
        // on, and the one with no device proof at all until now. The hosted
        // page echoes the host-pushed `__pyreonData` back over the reverse
        // channel, so BOTH directions land in a native Text this test can read.
        // That indirection is the point: asserting INSIDE a WKWebView is what
        // XCUITest cannot do reliably.
        let bridge = app.staticTexts["toolkit-bridge"].firstMatch
        XCTAssertTrue(bridge.waitForExistence(timeout: 15), "Bridge readout missing")
        // The page loads asynchronously, so poll rather than assert once.
        let echoed = NSPredicate(format: "label == %@", "ping")
        expectation(for: echoed, evaluatedWith: bridge, handler: nil)
        waitForExpectations(timeout: 20) { error in
            XCTAssertNil(
                error,
                "WebView bridge did not round-trip: host data never reached the page, or pyreonPostMessage never reached the host (label was \(bridge.label))"
            )
        }

        // The screen scrolls (see <Scroll> in the shared source), so a control
        // below the fold has to be brought into view before it can be tapped —
        // XCUITest's implicit scroll-to-visible is what failed here when the
        // container did not scroll at all.
        let machineToggleBtn = app.buttons["toolkit-machine-toggle"].firstMatch
        if !machineToggleBtn.isHittable {
            app.swipeUp()
        }

        // machine: the declared initial state, then a transition that must
        // actually MOVE it — the initial value alone would pass against a
        // machine that ignores every event.
        XCTAssertEqual(
            app.staticTexts["toolkit-machine"].firstMatch.label,
            "off",
            "PyreonMachine did not start in its declared initial state"
        )
        let machineToggle = app.buttons["toolkit-machine-toggle"].firstMatch
        XCTAssertTrue(machineToggle.exists, "Machine toggle missing on toolkit page")
        tapAfterScrolling(machineToggle, in: app)
        XCTAssertEqual(
            app.staticTexts["toolkit-machine"].firstMatch.label,
            "on",
            "PyreonMachine did not transition on send()"
        )
        // storage: the default, since nothing has persisted a value yet.
        XCTAssertEqual(
            app.staticTexts["toolkit-storage"].firstMatch.label,
            "light",
            "useStorage default did not reach the view"
        )

        // url-state WRITE: flipping it must move the value, which is the half a
        // default-only assertion cannot see.
        let filterDone = app.buttons["toolkit-filter-done"].firstMatch
        XCTAssertTrue(filterDone.exists, "Filter button missing on toolkit page")
        tapAfterScrolling(filterDone, in: app)
        XCTAssertEqual(
            app.staticTexts["toolkit-filter"].firstMatch.label,
            "done",
            "useUrlState write did not reach the router query"
        )

        let toolkitBack = app.buttons["toolkit-back"].firstMatch
        XCTAssertTrue(toolkitBack.exists, "Back button missing on toolkit page")
        tapAfterScrolling(toolkitBack, in: app)
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Did not return to tasks after toolkit Back"
        )

        // Phase 6: logout — flips the store flag back; lands on /login.
        let logout = app.buttons["tasks-logout"].firstMatch
        XCTAssertTrue(logout.exists, "Logout button missing on tasks page")
        logout.tap()

        let loginAfterLogout = app.otherElements["login-page"].firstMatch
        XCTAssertTrue(
            loginAfterLogout.waitForExistence(timeout: 15),
            "Did not return to login page within 5s after Logout — store flag flip + navigate did not commit"
        )
    }
}
