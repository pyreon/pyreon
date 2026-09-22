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

import UIKit
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
    /// Swipe until `element` is hittable, and report how many swipes it took.
    ///
    /// Separate from `tapAfterScrolling` because a COORDINATE tap needs the
    /// scrolling without the tap: `element.coordinate(withNormalizedOffset:)`
    /// is relative to the element, so it is correct once the element is on
    /// screen and meaningless before — an off-screen coordinate tap lands
    /// somewhere else entirely and reports a MISS, which reads as a broken hit
    /// test rather than a test that never touched the chart. That is exactly
    /// how the boxplot band assertion first failed on the simulator.
    @discardableResult
    /** Pixels within a few units of #cccccc — the visualMap's inactive colour. */
    /** Scroll the gallery until the WHOLE element is inside the window: a gesture on an off-screen part lands on nothing. */
    private func scrollFullyOnScreen(_ element: XCUIElement, in app: XCUIApplication) {
        let scroll = app.scrollViews["gal-scroll"].firstMatch
        for _ in 0..<16 {
            let window = app.windows.firstMatch.frame
            if element.frame.minY < window.minY + 100 {
                scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65)))
            } else if element.frame.maxY > window.maxY - 80 {
                scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65)).press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)))
            } else {
                return
            }
        }
    }

    private func waitForValue(_ element: XCUIElement, _ value: String, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate(format: "value == %@", value)
        return XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: element)], timeout: timeout) == .completed
    }

    private func redPixels(_ png: Data) -> Int { colorPixels(png, 255, 0, 0) }
    private func greyPixels(_ png: Data) -> Int { colorPixels(png, 204, 204, 204) }

    private func colorPixels(_ png: Data, _ r: Int, _ g: Int, _ b: Int) -> Int {
        // Redrawn into a known RGBA8 buffer: a screenshot's own pixel format varies by device.
        guard let image = UIImage(data: png)?.cgImage else { return 0 }
        let w = image.width, h = image.height
        var buf = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return 0 }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        var n = 0
        var i = 0
        while i + 3 < buf.count {
            if abs(Int(buf[i]) - r) <= 6 && abs(Int(buf[i + 1]) - g) <= 6 && abs(Int(buf[i + 2]) - b) <= 6 { n += 1 }
            i += 4
        }
        return n
    }

    private func scrollIntoView(
        _ element: XCUIElement,
        in app: XCUIApplication,
        maxSwipes: Int = 8
    ) -> Int {
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
        return swipes
    }

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
        let swipes = scrollIntoView(element, in: app, maxSwipes: maxSwipes)
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

    /// Login -> tasks -> toolkit. Factored out because the crash-reporter proof
    /// needs to reach the toolkit page TWICE (once to record, once after a real
    /// relaunch), and duplicating the login flow would be two places to rot.
    @discardableResult
    private func navigateToToolkit(_ app: XCUIApplication) -> XCUIElement {
        let username = app.textFields["login-username"].firstMatch
        XCTAssertTrue(username.waitForExistence(timeout: 30), "Username field missing")
        // Five characters in one go, deliberately. The big test types "ab"
        // first BECAUSE that fails the min-length validator and must NOT
        // navigate -- copying only that half is why the first run of this
        // helper reported "Toolkit button missing": login had never succeeded.
        username.tap()
        username.typeText("abcde")
        dismissKeyboard(app)

        let submit = app.buttons["login-submit"].firstMatch
        XCTAssertTrue(submit.exists, "Continue button missing")
        submit.tap()

        let tasksPage = app.otherElements["tasks-page"].firstMatch
        XCTAssertTrue(tasksPage.waitForExistence(timeout: 20), "Tasks page did not render after login")

        let toolkitBtn = app.buttons["tasks-toolkit"].firstMatch
        XCTAssertTrue(toolkitBtn.waitForExistence(timeout: 20), "Toolkit button missing")
        toolkitBtn.tap()

        let toolkitPage = app.otherElements["toolkit-page"].firstMatch
        XCTAssertTrue(toolkitPage.waitForExistence(timeout: 15), "Toolkit page did not render")
        return toolkitPage
    }

    /// Crash reporting, device-proven in the only way that means anything: a
    /// REAL process restart.
    ///
    /// `hadCrash` reflects the PREVIOUS session, so it cannot be asserted in the
    /// run that records. And the cheap alternative would be worthless -- this
    /// repo already has a `todosPersistAcrossActivityRecreation` that passed
    /// against an in-memory store, because activity recreation keeps the
    /// process. `terminate()` + `launch()` does not.
    ///
    /// Two halves, and both matter: the handler FIRES (the report survives to
    /// the next session) and the app SURVIVES recording one (a reporter that
    /// takes the process down with it is worse than none).
    func test_crashReporterRecordsPersistsAcrossRelaunchAndAppSurvives() throws {
        let app = XCUIApplication()
        app.launch()
        navigateToToolkit(app)

        // Fresh session: nothing recorded yet. Asserted so the "true" below is a
        // CHANGE and not the value it always had.
        XCTAssertEqual(
            app.staticTexts["toolkit-crash-had"].firstMatch.label,
            "false",
            "hadCrash was already true before anything was recorded"
        )

        let record = app.buttons["toolkit-crash-record"].firstMatch
        XCTAssertTrue(record.waitForExistence(timeout: 10), "Record-error button missing")
        record.tap()

        // SURVIVED: the statement after recordError still ran, and the app is
        // still answering.
        let note = app.staticTexts["toolkit-crash-note"].firstMatch
        XCTAssertTrue(
            note.waitForExistence(timeout: 10),
            "Crash note missing after recording"
        )
        XCTAssertEqual(note.label, "survived", "App did not survive recordError")

        // FIRED: a real process restart, then the report must be back.
        app.terminate()
        app.launch()
        navigateToToolkit(app)

        let had = app.staticTexts["toolkit-crash-had"].firstMatch
        XCTAssertTrue(had.waitForExistence(timeout: 15), "Crash flag missing after relaunch")
        XCTAssertEqual(
            had.label,
            "true",
            "Crash report did not survive a real process restart"
        )

        // Hygiene: leave no persisted report behind for a later test to trip on.
        let clear = app.buttons["toolkit-crash-clear"].firstMatch
        if clear.exists { clear.tap() }
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
        // Flow-native proof: createFlow → PyreonFlowState on the device. Each
        // assertion reads a value the NATIVE engine produced — a count after
        // addNode, the zoom after zoomIn, the selection after selectNode. The
        // labels are read as text so a wrong VALUE fails, not just a missing
        // element.
        let flowNav = app.buttons["tasks-flow"].firstMatch
        XCTAssertTrue(flowNav.exists, "Flow button missing on tasks page")
        tapAfterScrolling(flowNav, in: app)
        let flowPage = app.otherElements["flow-page"].firstMatch
        XCTAssertTrue(flowPage.waitForExistence(timeout: 15), "Flow page did not render")
        let nodeCount = app.staticTexts["flow-node-count"].firstMatch
        XCTAssertTrue(nodeCount.waitForExistence(timeout: 10), "flow-node-count missing")
        XCTAssertEqual(nodeCount.label, "2", "seeded node count")
        XCTAssertEqual(app.staticTexts["flow-edge-count"].firstMatch.label, "1", "seeded edge count")
        XCTAssertEqual(app.staticTexts["flow-zoom"].firstMatch.label, "zoom 1.0", "initial zoom")
        tapAfterScrolling(app.buttons["flow-add"].firstMatch, in: app)
        XCTAssertTrue(waitForLabel(nodeCount, "3", timeout: 5), "addNode did not reach the native engine (label: \(nodeCount.label))")
        tapAfterScrolling(app.buttons["flow-select"].firstMatch, in: app)
        XCTAssertTrue(waitForLabel(app.staticTexts["flow-selected-count"].firstMatch, "1", timeout: 5), "selectNode did not reach the native engine")
        // The RENDERER half (F3/F4): the <Flow> canvas and its chrome, a node
        // DRAG, and the Controls driving the same engine the labels read.
        // The drag runs FIRST, at the initial zoom 1: accessibility frames do
        // not follow the canvas scaleEffect, so at any other zoom a node's
        // reported frame is distorted and a coordinate drag misses it.
        let canvas = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Task flow")).firstMatch
        XCTAssertTrue(canvas.waitForExistence(timeout: 10), "Flow canvas (ariaLabel) did not render")
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "minimap")).firstMatch.exists, "MiniMap chrome missing")
        let startNode = app.staticTexts["Start"].firstMatch
        XCTAssertTrue(startNode.waitForExistence(timeout: 5), "node 'Start' did not render on the canvas")
        XCTAssertTrue(app.staticTexts["End"].firstMatch.exists, "node 'End' did not render on the canvas")
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "source handle out")).firstMatch.waitForExistence(timeout: 5), "source handle did not render")
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "target handle in")).firstMatch.exists, "target handle did not render")
        let aPos = app.staticTexts["flow-a-pos"].firstMatch
        XCTAssertTrue(aPos.waitForExistence(timeout: 5), "flow-a-pos missing")
        let before = aPos.label
        // The label reacts to an engine-driven move — the discriminator that
        // separates "the position channel is live" from "the drag gesture ran".
        tapAfterScrolling(app.buttons["flow-move"].firstMatch, in: app)
        // Swift renders a Double as "25.0"; Android as "25". Either is the moved position.
        XCTAssertTrue(waitForLabel(aPos, "25.0,35.0", timeout: 5) || aPos.label == "25,35", "updateNodePosition did not reach the label (label: \(aPos.label))")
        let placed = aPos.label
        let grab = startNode.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        // Slow, with a hold at each end: a fast synthesized drag reaches SwiftUI
        // as a single jump, and a DragGesture that never sees an intermediate
        // move does not fire.
        grab.press(forDuration: 0.3, thenDragTo: grab.withOffset(CGVector(dx: 70, dy: 40)), withVelocity: .slow, thenHoldForDuration: 0.4)
        let moved = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", placed), object: aPos)
        if XCTWaiter().wait(for: [moved], timeout: 5) != .completed { print("DIAG-HIERARCHY:\n\(app.debugDescription)") }
        XCTAssertNotEqual(aPos.label, placed, "dragging node 'Start' did not move it in the native engine (still \(aPos.label))")

        tapAfterScrolling(app.buttons["flow-zoom-in"].firstMatch, in: app)
        XCTAssertTrue(waitForLabel(app.staticTexts["flow-zoom"].firstMatch, "zoom 1.2", timeout: 5), "zoomIn did not reach the native engine (label: \(app.staticTexts["flow-zoom"].firstMatch.label))")
        // Tapped past maxZoom (2) so the asserted value is the clamp, not a float product.
        let zoomIn = app.buttons["Zoom in"].firstMatch
        XCTAssertTrue(zoomIn.exists, "Controls zoom-in button missing")
        for _ in 0..<4 { zoomIn.tap() }
        XCTAssertTrue(waitForLabel(app.staticTexts["flow-zoom"].firstMatch, "zoom 2.0", timeout: 5), "Controls zoom-in did not clamp the engine at maxZoom (label: \(app.staticTexts["flow-zoom"].firstMatch.label))")
        app.buttons["Fit view"].firstMatch.tap()

        tapAfterScrolling(app.buttons["flow-back"].firstMatch, in: app)
        XCTAssertTrue(app.otherElements["tasks-page"].firstMatch.waitForExistence(timeout: 10), "flow-back did not return to tasks")

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
        // The canvas carries the engine's DATA DESCRIPTION as its accessibility
        // label — the sentence the web `aria-label` reads — so VoiceOver says
        // what the chart shows instead of announcing a blank rectangle. Built
        // from the same series the canvas painted, so the title, the series
        // label and the range are all in it.
        let barsLabel = statsBars.label
        XCTAssertTrue(
            barsLabel.contains("Scores by subject"),
            "bar chart canvas is not described for VoiceOver (label: \(barsLabel))"
        )
        XCTAssertTrue(
            barsLabel.contains("Score") && barsLabel.contains("3 categories"),
            "the description does not carry the painted series and categories (label: \(barsLabel))"
        )
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
        // legend row sits at the canvas top INSET by the engine's 8pt pad
        // (`placeLegend`, #3416 — the emit used to draw it at x 0, y 0, which
        // is 8pt left and 8pt above where a browser puts it): the 'Score'
        // entry box spans x 8…~52, y 8…19, so a tap at (20, 13) is inside it.
        // Hiding the only series leaves no bar geometry, so the band tap reports
        // -1; a second entry tap brings the series back and the band is 0 again.
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 20, dy: 13)).tap()
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 90, dy: 100)).tap()
        XCTAssertTrue(
            waitForLabel(barPick, "-1", timeout: 10),
            "after hiding the series from the legend entry, the band tap did not report -1 (label: \(barPick.label))"
        )
        statsBars.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0)).withOffset(CGVector(dx: 20, dy: 13)).tap()
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
        let zoomText = app.staticTexts["stats-zoom"].firstMatch
        XCTAssertTrue(
            waitForLabel(zoomText, "55-100", timeout: 10),
            "onZoom did not report the window the navigator drag produced (label: \(zoomText.label))"
        )
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
        // #3277: `<PlotChart brush>` — a plain drag across the brush-only line
        // chart's plot (x 50 → W-30, y 60) selects every row → '0-2' through the
        // named onBrush; a tap on the plot clears it → 'none'.
        let statsBrush = app.descendants(matching: .any).matching(identifier: "stats-brush").firstMatch
        XCTAssertTrue(statsBrush.waitForExistence(timeout: 10), "brush chart canvas missing on stats page")
        let brushSel = app.staticTexts["stats-brush-sel"].firstMatch

        // The INDICATOR marks, on the device. `sma` lowers to the crossing
        // `smaValues` and the `bollinger` spread expands to a band plus its
        // middle line — so this is the only place that chain runs on a real
        // simulator rather than through a stub typecheck.
        //
        // The band is what makes the label decisive: "upper bound" appears only
        // if the two-channel a11y crossing worked AND the envelope arithmetic
        // produced numbers. A chart that emitted nothing would still have a
        // label, so the title alone would not prove anything.
        let indicators = app.descendants(matching: .any).matching(identifier: "stats-indicators").firstMatch
        XCTAssertTrue(indicators.waitForExistence(timeout: 10), "indicator chart canvas missing on stats page")
        XCTAssertGreaterThan(indicators.frame.height, 60, "indicator chart canvas has no height")
        let indLabel = indicators.label
        XCTAssertTrue(indLabel.contains("Weekly load"), "indicator chart label lost its title: \(indLabel)")
        XCTAssertTrue(indLabel.contains("upper bound"), "the bollinger band did not describe its two bounds: \(indLabel)")
        XCTAssertTrue(indLabel.contains("lower bound"), "the bollinger band did not describe its two bounds: \(indLabel)")
        XCTAssertTrue(brushSel.waitForExistence(timeout: 10), "brush selection text missing")
        XCTAssertEqual(brushSel.label, "none", "no brush yet, selection should be none")
        let brushOrigin = statsBrush.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        brushOrigin.withOffset(CGVector(dx: 50, dy: 60)).press(forDuration: 0.2, thenDragTo: brushOrigin.withOffset(CGVector(dx: statsBrush.frame.width - 30, dy: 60)))
        XCTAssertTrue(
            waitForLabel(brushSel, "0-2", timeout: 10),
            "a drag across the plot did not brush every row (label: \(brushSel.label))"
        )
        brushOrigin.withOffset(CGVector(dx: 60, dy: 60)).tap()
        XCTAssertTrue(
            waitForLabel(brushSel, "none", timeout: 10),
            "a tap did not clear the brush (label: \(brushSel.label))"
        )
        let statsBack = app.buttons["stats-back"].firstMatch
        XCTAssertTrue(statsBack.exists, "Back button missing on stats page")
        statsBack.tap()
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Did not return to tasks after stats Back"
        )

        // #3279: the DASHBOARD — the native wave's gate. Six families on one
        // shared-source page. Repaint: the funnel's data is a signal; the tap on
        // its top slab reads 'Leads', a button drops that stage, and the SAME tap
        // then reads 'Qualified' — the hit test ran over the re-laid-out canvas.
        let dashNav = app.buttons["tasks-dashboard"].firstMatch
        XCTAssertTrue(dashNav.waitForExistence(timeout: 10), "Dashboard button missing on tasks page")
        dashNav.tap()
        let dashPage = app.otherElements["dash-page"].firstMatch
        XCTAssertTrue(dashPage.waitForExistence(timeout: 15), "Dashboard page did not render")
        let dashFunnel = app.descendants(matching: .any).matching(identifier: "dash-funnel").firstMatch
        XCTAssertTrue(dashFunnel.waitForExistence(timeout: 10), "funnel canvas missing on dashboard")
        let dashStage = app.staticTexts["dash-stage"].firstMatch
        XCTAssertEqual(dashStage.label, "none", "no funnel tap yet")
        let funnelTop = dashFunnel.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0)).withOffset(CGVector(dx: 0, dy: 30))
        funnelTop.tap()
        XCTAssertTrue(waitForLabel(dashStage, "Leads", timeout: 10), "tap on the top slab did not select Leads (label: \(dashStage.label))")
        app.buttons["dash-drop"].firstMatch.tap()
        funnelTop.tap()
        XCTAssertTrue(waitForLabel(dashStage, "Qualified", timeout: 10), "after dropping the first stage, the same tap did not select Qualified — the funnel did not repaint (label: \(dashStage.label))")
        let dashLoad = app.staticTexts["dash-load"].firstMatch
        XCTAssertEqual(dashLoad.label, "40", "gauge load should start at 40")
        app.buttons["dash-load-up"].firstMatch.tap()
        XCTAssertTrue(waitForLabel(dashLoad, "65", timeout: 10), "Load +25 did not move the gauge's signal (label: \(dashLoad.label))")
        for id in ["dash-gauge", "dash-pie", "dash-radar", "dash-heat", "dash-tree", "dash-box"] {
            XCTAssertTrue(app.descendants(matching: .any).matching(identifier: id).firstMatch.exists, "\(id) canvas missing on dashboard")
        }
        // The radar's tap (it had NONE on either target): the first axis points
        // straight up, the Core team scores 4 of 5 on it, the radius is
        // min(W, 200)/2 − 3·fontSize = 67 with the labels on, so the vertex sits
        // at (W/2, 100 − 67·0.8 ≈ 46) — inside the engine's 8pt tolerance.
        let dashRadar = app.descendants(matching: .any).matching(identifier: "dash-radar").firstMatch
        let radarHit = app.staticTexts["dash-radar-hit"].firstMatch
        XCTAssertEqual(radarHit.label, "none", "no radar tap yet")
        // A coordinate tap is relative to the element, so the element has to be
        // ON SCREEN first — see `scrollIntoView`.
        scrollIntoView(dashRadar, in: app)
        XCTAssertTrue(dashRadar.isHittable, "radar canvas never became hittable")
        dashRadar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0)).withOffset(CGVector(dx: 0, dy: 46)).tap()
        XCTAssertTrue(waitForLabel(radarHit, "S0A0", timeout: 10), "tap on the radar's first vertex did not report series 0 / axis 0 (label: \(radarHit.label))")
        // The boxplot host crossed: two bands, a tap in the left third is box 0, in the right third box 1.
        let dashBox = app.descendants(matching: .any).matching(identifier: "dash-box").firstMatch
        let boxPick = app.staticTexts["dash-box-pick"].firstMatch
        XCTAssertEqual(boxPick.label, "-1", "no boxplot tap yet")
        // The boxplot sits last on the dashboard, below the fold on a phone —
        // the first version of this assertion tapped an off-screen coordinate
        // and read the resulting -1 as a failed hit test.
        scrollIntoView(dashBox, in: app)
        XCTAssertTrue(dashBox.isHittable, "boxplot canvas never became hittable")
        dashBox.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.5)).tap()
        XCTAssertTrue(waitForLabel(boxPick, "0", timeout: 10), "tap on the left band did not select box 0 (label: \(boxPick.label))")
        dashBox.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)).tap()
        XCTAssertTrue(waitForLabel(boxPick, "1", timeout: 10), "tap on the right band did not select box 1 (label: \(boxPick.label))")
        app.buttons["dash-back"].firstMatch.tap()
        XCTAssertTrue(tasksPage.waitForExistence(timeout: 15), "Did not return to tasks after dashboard Back")

        // The GALLERY — the ten chart families that had never rendered on a
        // device. Nine of nineteen lowered hosts were device-proven before
        // this; the other ten rested on stub typechecking, which catches a
        // type error and cannot catch a chart that paints nothing.
        //
        // Existence, not coordinates: these assert that each family LAYS OUT
        // AND PAINTS from shared source. The dashboard above proves
        // interaction, and its taps are tuned to ITS layout — which is why
        // these live on their own page rather than as more rows there.
        let galleryBtn = app.buttons["tasks-gallery"].firstMatch
        XCTAssertTrue(galleryBtn.exists, "Chart gallery button missing on tasks page")
        galleryBtn.tap()
        let galPage = app.otherElements["gal-page"].firstMatch
        XCTAssertTrue(galPage.waitForExistence(timeout: 15), "Chart gallery page did not render")
        for id in [
            "gal-calendar", "gal-candlestick", "gal-gantt", "gal-graph", "gal-map",
            "gal-parallel", "gal-polar", "gal-river", "gal-sunburst", "gal-tree",
        ] {
            let canvas = app.descendants(matching: .any).matching(identifier: id).firstMatch
            // Scrolled into view first: ten charts do not fit on a phone, and
            // an off-screen element's `exists` is true while its frame is not
            // meaningful — the same trap that made the boxplot assertion read
            // an off-screen tap as a failed hit test.
            scrollIntoView(canvas, in: app)
            XCTAssertTrue(canvas.waitForExistence(timeout: 10), "\(id) canvas missing on the gallery")
            XCTAssertFalse(canvas.frame.isEmpty, "\(id) rendered with an empty frame — it laid out to nothing")
        }
        // The map ROAMS: a horizontal drag pans it, so its canvas differs.
        let roamMap = app.descendants(matching: .any).matching(identifier: "gal-map").firstMatch
        XCTAssertTrue(roamMap.waitForExistence(timeout: 10), "gal-map canvas missing on the gallery")
        // The gallery loop above left the page scrolled PAST the map (its frame
        // sits above the window), and a drag at off-screen coordinates lands on
        // nothing — so scroll back up until the map is fully on screen.
        let galScroll = app.scrollViews["gal-scroll"].firstMatch
        var upTries = 0
        while roamMap.frame.minY < app.windows.firstMatch.frame.minY + 120 && upTries < 12 {
            galScroll.swipeDown()
            upTries += 1
        }
        let mapBefore = roamMap.screenshot().pngRepresentation
        let mapGrab = roamMap.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5))
        mapGrab.press(forDuration: 0.1, thenDragTo: mapGrab.withOffset(CGVector(dx: 90, dy: 0)), withVelocity: .slow, thenHoldForDuration: 0.2)
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        XCTAssertNotEqual(mapBefore, roamMap.screenshot().pngRepresentation, "dragging the roaming map did not pan it")
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "gal-decal").firstMatch.waitForExistence(timeout: 10), "gal-decal canvas missing on the gallery")
        // The calculable visualMap: dragging its high handle (bottom-left strip) left greys the hottest cells.
        let visualMap = app.descendants(matching: .any).matching(identifier: "gal-visualmap").firstMatch
        XCTAssertTrue(visualMap.waitForExistence(timeout: 10), "gal-visualmap canvas missing on the gallery")
        scrollFullyOnScreen(visualMap, in: app)
        let vmBefore = visualMap.screenshot().pngRepresentation
        let vmOrigin = visualMap.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let vmHandleY = visualMap.frame.height - 41 + 16 + 4
        vmOrigin.withOffset(CGVector(dx: 159, dy: vmHandleY)).press(forDuration: 0.2, thenDragTo: vmOrigin.withOffset(CGVector(dx: 80, dy: vmHandleY)), withVelocity: .slow, thenHoldForDuration: 0.3)
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        // Out-of-range values take the inactive #cccccc: none before the drag, a block of it after.
        XCTAssertLessThan(greyPixels(vmBefore), 50, "the visualMap greyed cells before any drag")
        let vmGrey = greyPixels(visualMap.screenshot().pngRepresentation)
        XCTAssertGreaterThan(vmGrey, 400, "dragging the visualMap handle did not grey the out-of-range cells (grey pixels: \(vmGrey))")
        // The slider dataZoom opens on the low half; dragging the band right shows the tall bars (y extent pinned).
        let zoomChart = app.descendants(matching: .any).matching(identifier: "gal-datazoom").firstMatch
        XCTAssertTrue(zoomChart.waitForExistence(timeout: 10), "gal-datazoom canvas missing on the gallery")
        scrollFullyOnScreen(zoomChart, in: app)
        let redBefore = redPixels(zoomChart.screenshot().pngRepresentation)
        let zoomOrigin = zoomChart.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let zoomStripW = zoomChart.frame.width - 16
        let zoomStripY = zoomChart.frame.height - 18
        zoomOrigin.withOffset(CGVector(dx: 8 + zoomStripW * 0.25, dy: zoomStripY)).press(forDuration: 0.2, thenDragTo: zoomOrigin.withOffset(CGVector(dx: 8 + zoomStripW * 0.75, dy: zoomStripY)), withVelocity: .slow, thenHoldForDuration: 0.3)
        RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        let redAfter = redPixels(zoomChart.screenshot().pngRepresentation)
        XCTAssertGreaterThan(redBefore, 100, "the zoomed bar chart painted no red bars before the drag")
        XCTAssertGreaterThan(redAfter, redBefore * 3, "dragging the dataZoom band did not move the window to the tall bars (red before \(redBefore), after \(redAfter))")
        // The timeline: a tap on the last checkpoint shows that step; next wraps to the first.
        let timeline = app.descendants(matching: .any).matching(identifier: "gal-timeline").firstMatch
        XCTAssertTrue(timeline.waitForExistence(timeout: 10), "gal-timeline missing on the gallery")
        scrollFullyOnScreen(timeline, in: app)
        XCTAssertEqual(timeline.value as? String, "2019", "the timeline did not open on its first step")
        let tlOrigin = timeline.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let tlY = timeline.frame.height - 40 + 16
        tlOrigin.withOffset(CGVector(dx: timeline.frame.width - 48, dy: tlY)).tap()
        XCTAssertTrue(waitForValue(timeline, "2021", timeout: 5), "tapping the last checkpoint did not show it (value: \(String(describing: timeline.value)))")
        tlOrigin.withOffset(CGVector(dx: timeline.frame.width - 33, dy: tlY)).tap()
        XCTAssertTrue(waitForValue(timeline, "2019", timeout: 5), "next did not wrap to the first step (value: \(String(describing: timeline.value)))")
        // dispatchAction: the handle's timelineChange moves the same step a tap does.
        let tlLast = app.buttons["gal-tl-last"].firstMatch
        scrollFullyOnScreen(tlLast, in: app)
        tlLast.tap()
        XCTAssertTrue(waitForValue(timeline, "2021", timeout: 5), "the handle's timelineChange did not move the step (value: \(String(describing: timeline.value)))")
        // The toolbox (dataZoom, back, dataView, line, bar, restore — right-aligned, 25pt apart at the top).
        let toolbox = app.descendants(matching: .any).matching(identifier: "gal-toolbox").firstMatch
        XCTAssertTrue(toolbox.waitForExistence(timeout: 10), "gal-toolbox missing on the gallery")
        scrollFullyOnScreen(toolbox, in: app)
        let tbOrigin = toolbox.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let tool = { (i: Int) -> XCUICoordinate in tbOrigin.withOffset(CGVector(dx: toolbox.frame.width - 9.5 - 25.0 * Double(5 - i), dy: 9.5)) }
        let tbZoom = app.staticTexts["gal-toolbox-zoom"].firstMatch
        tool(0).tap()
        tbOrigin.withOffset(CGVector(dx: toolbox.frame.width * 0.5, dy: toolbox.frame.height * 0.5)).press(forDuration: 0.1, thenDragTo: tbOrigin.withOffset(CGVector(dx: toolbox.frame.width * 0.58, dy: toolbox.frame.height * 0.5)), withVelocity: .slow, thenHoldForDuration: 0.2)
        let zoomedAway = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", "0-100"), object: tbZoom)
        XCTAssertEqual(XCTWaiter().wait(for: [zoomedAway], timeout: 5), .completed, "the toolbox box zoom did not zoom (label: \(tbZoom.label))")
        tool(1).tap()
        XCTAssertTrue(waitForLabel(tbZoom, "0-100", timeout: 5), "back did not undo the box zoom (label: \(tbZoom.label))")
        tool(2).tap()
        let dataView = app.descendants(matching: .any).matching(identifier: "pyreon-dataview").firstMatch
        XCTAssertTrue(dataView.waitForExistence(timeout: 5), "the data view did not open")
        app.buttons["pyreon-dataview-close"].firstMatch.tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: dataView)
        XCTAssertEqual(XCTWaiter().wait(for: [closed], timeout: 5), .completed, "the data view did not close")
        // dispatchAction: the handle's dataZoom and restore move the window the toolbox moves.
        let hZoom = app.buttons["gal-h-zoom"].firstMatch
        scrollFullyOnScreen(hZoom, in: app)
        hZoom.tap()
        XCTAssertTrue(waitForLabel(tbZoom, "0-50", timeout: 5), "the handle's dataZoom did not move the window (label: \(tbZoom.label))")
        let hReset = app.buttons["gal-h-reset"].firstMatch
        scrollFullyOnScreen(hReset, in: app)
        hReset.tap()
        XCTAssertTrue(waitForLabel(tbZoom, "0-100", timeout: 5), "the handle's restore did not reset the window (label: \(tbZoom.label))")
        // saveAsImage on a family chart: the offscreen PNG reaches onSaveImage.
        let saveChart = app.descendants(matching: .any).matching(identifier: "gal-save").firstMatch
        XCTAssertTrue(saveChart.waitForExistence(timeout: 10), "gal-save missing on the gallery")
        scrollFullyOnScreen(saveChart, in: app)
        app.buttons["pyreon-save-image"].firstMatch.tap()
        XCTAssertTrue(waitForLabel(app.staticTexts["gal-saved"].firstMatch, "data:image/png;", timeout: 15), "saveAsImage did not hand onSaveImage a PNG (label: \(app.staticTexts["gal-saved"].firstMatch.label))")
        // The area brush: a lineX drag over the middle bars reports some of them; a tap clears it.
        let areaChart = app.descendants(matching: .any).matching(identifier: "gal-brush").firstMatch
        XCTAssertTrue(areaChart.waitForExistence(timeout: 10), "gal-brush missing on the gallery")
        scrollFullyOnScreen(areaChart, in: app)
        let areaOrigin = areaChart.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let areaCount = app.staticTexts["gal-brush-count"].firstMatch
        areaOrigin.withOffset(CGVector(dx: areaChart.frame.width * 0.4, dy: areaChart.frame.height * 0.5)).press(forDuration: 0.1, thenDragTo: areaOrigin.withOffset(CGVector(dx: areaChart.frame.width * 0.66, dy: areaChart.frame.height * 0.5)), withVelocity: .slow, thenHoldForDuration: 0.2)
        let areaBrushed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label IN %@", ["1:1", "1:2", "1:3", "1:4", "1:5"]), object: areaCount)
        XCTAssertEqual(XCTWaiter().wait(for: [areaBrushed], timeout: 5), .completed, "the lineX brush did not report a partial selection (label: \(areaCount.label))")
        areaOrigin.withOffset(CGVector(dx: areaChart.frame.width * 0.5, dy: areaChart.frame.height * 0.5)).tap()
        XCTAssertTrue(waitForLabel(areaCount, "1:0", timeout: 5), "a tap did not clear the brush (label: \(areaCount.label))")
        // selectedMode="series": a tap pins the whole series it lands on and still reports the datum under it.
        let seriesChart = app.descendants(matching: .any).matching(identifier: "gal-series-select").firstMatch
        XCTAssertTrue(seriesChart.waitForExistence(timeout: 10), "gal-series-select missing on the gallery")
        scrollFullyOnScreen(seriesChart, in: app)
        let seriesOrigin = seriesChart.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
        let seriesDatum = app.staticTexts["gal-series-select-datum"].firstMatch
        seriesOrigin.withOffset(CGVector(dx: seriesChart.frame.width * 0.15, dy: seriesChart.frame.height * 0.82)).tap()
        let seriesPicked = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", "none"), object: seriesDatum)
        XCTAssertEqual(XCTWaiter().wait(for: [seriesPicked], timeout: 5), .completed, "selectedMode series did not report a datum on tap (label: \(seriesDatum.label))")
        // universalTransition: toggling from 3 to 5 rows morphs instead of crashing, and settles on the new count.
        let growthChart = app.descendants(matching: .any).matching(identifier: "gal-growth").firstMatch
        XCTAssertTrue(growthChart.waitForExistence(timeout: 10), "gal-growth missing on the gallery")
        scrollFullyOnScreen(app.buttons["gal-growth-toggle"].firstMatch, in: app)
        app.buttons["gal-growth-toggle"].firstMatch.tap()
        XCTAssertTrue(waitForLabel(app.staticTexts["gal-growth-count"].firstMatch, "5", timeout: 5), "universalTransition row-count toggle did not settle on 5 (label: \(app.staticTexts["gal-growth-count"].firstMatch.label))")
        app.buttons["gal-growth-toggle"].firstMatch.tap()
        XCTAssertTrue(waitForLabel(app.staticTexts["gal-growth-count"].firstMatch, "3", timeout: 5), "universalTransition row-count toggle did not settle back on 3 (label: \(app.staticTexts["gal-growth-count"].firstMatch.label))")
        // The geo route trail MOVES too: two screenshots half a second apart differ.
        let geoTrail = app.descendants(matching: .any).matching(identifier: "gal-geo-trail").firstMatch
        XCTAssertTrue(geoTrail.waitForExistence(timeout: 10), "gal-geo-trail canvas missing on the gallery")
        var trailTries = 0
        // On screen in either direction: an off-screen element's screenshot never changes. This step revisits an
        // EARLY chart from near the page's bottom (every later chart's own scrollFullyOnScreen ran first), so it
        // needs many more iterations than a one-chart-at-a-time scroll — but the SAME proven gesture shape (a
        // 0.05s press, the margin so an interactive chart's own drag never intercepts it).
        while trailTries < 80 {
            let window = app.windows.firstMatch.frame
            // Down the left margin, outside every chart. A chart's TAP no longer takes the page's scroll (it is a
            // SpatialTapGesture, not a zero-distance drag), but one that also carries a DRAG — dataZoom, brush,
            // navigator — still claims a swipe that starts on it.
            let gutter = app.scrollViews["gal-scroll"].firstMatch
            if geoTrail.frame.minY < window.minY + 120 {
                gutter.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.2)).press(forDuration: 0.05, thenDragTo: gutter.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.85)))
            } else if geoTrail.frame.maxY > window.maxY - 60 {
                gutter.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.85)).press(forDuration: 0.05, thenDragTo: gutter.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.2)))
            } else {
                break
            }
            trailTries += 1
        }
        let geoTrailBefore = geoTrail.screenshot().pngRepresentation
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        XCTAssertNotEqual(geoTrailBefore, geoTrail.screenshot().pngRepresentation, "gal-geo-trail did not move between frames (frame \(geoTrail.frame), window \(app.windows.firstMatch.frame))")
        // The lines trail MOVES: two screenshots of its canvas half a second
        // apart differ (the simulator runs with Reduce Motion off).
        let linesChart = app.descendants(matching: .any).matching(identifier: "gal-lines").firstMatch
        scrollFullyOnScreen(linesChart, in: app)
        XCTAssertTrue(linesChart.waitForExistence(timeout: 10), "gal-lines canvas missing on the gallery")
        let framesBefore = linesChart.screenshot().pngRepresentation
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        let framesAfter = linesChart.screenshot().pngRepresentation
        XCTAssertNotEqual(framesBefore, framesAfter, "gal-lines trail did not move between frames")
        // Runs AFTER the two moving-canvas checks on purpose: the hosted flow is a full-width
        // pannable canvas, so once it is on screen a gutter swipe that starts on it PANS the
        // graph instead of scrolling the page, and the geo-trail scroll-back loop above never
        // brings its chart back into view (device-found: 80 futile tries, frame y -1829).
        // `@pyreon/flow/webview` on device: the graph + `fit-view` command are pushed
        // INTO the WKWebView, the hosted renderer fits and posts `viewport-change`
        // BACK over the reverse bridge into native Text — page→host proven without
        // asserting inside the WebView. The button pushes a NEW command id, so the
        // count moving 1→2 (not 3) proves the reactive push AND that `initial-fit`
        // ran once only.
        let flowWebView = app.descendants(matching: .any).matching(identifier: "gal-flow-webview").firstMatch
        XCTAssertTrue(flowWebView.waitForExistence(timeout: 10), "gal-flow-webview missing on the gallery")
        let flowWebEvent = app.staticTexts["gal-flow-webview-event"].firstMatch
        XCTAssertTrue(waitForLabel(flowWebEvent, "viewport-change", timeout: 20), "the hosted flow's initial fit-view never reached the host (label: \(flowWebEvent.label))")
        let flowWebEvents = app.staticTexts["gal-flow-webview-events"].firstMatch
        XCTAssertTrue(waitForLabel(flowWebEvents, "1", timeout: 5), "expected exactly one hosted flow event after load (label: \(flowWebEvents.label))")
        scrollFullyOnScreen(app.buttons["gal-flow-webview-fit"].firstMatch, in: app)
        app.buttons["gal-flow-webview-fit"].firstMatch.tap()
        XCTAssertTrue(waitForLabel(flowWebEvents, "2", timeout: 10), "pushing a second fit-view command did not round-trip (label: \(flowWebEvents.label))")
        app.buttons["gal-back"].firstMatch.tap()
        XCTAssertTrue(tasksPage.waitForExistence(timeout: 15), "Did not return to tasks after gallery Back")

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
        // sync: the CRDT-backed signal was RENDERED but asserted by neither device
        // test until now -- built, shipped, never verified, which is the class
        // this whole arc is about.
        // "0.0", NOT "0" -- and that is a REAL cross-platform divergence this
        // assertion exposed on its first device run, not a formatting nit.
        //
        // The web renders "0": JS has one number type and prints an integral
        // value without a decimal. Both native targets lower a syncedSignal
        // with an integer initial to a DOUBLE -- Kotlin because
        // PyreonScalar.Num carries a Double and has no Int case at all, Swift
        // because the emit follows it (`PyreonSyncedSignal<Double>`) -- so
        // `String(synced())` is "0.0" there. Any app displaying a synced number
        // shows a different string on mobile than on web.
        //
        // Asserted as it actually behaves rather than as it should, so the
        // divergence is RECORDED instead of hidden by having no assertion at
        // all -- which is exactly how it survived until now. Fixing it means
        // giving Kotlin's scalar an Int case, which is a wire-format change and
        // belongs in its own PR.
        XCTAssertEqual(
            app.staticTexts["toolkit-synced"].firstMatch.label,
            "0.0",
            "syncedSignal did not reach the view with its initial value"
        )
        // sync: CONVERGENCE through the map handle. The key is written ONLY on
        // the peer doc, so `has` can be true only if applyOps actually merged
        // the peer's ops into this one. Reading back our own write would pass
        // against a plain Map with no CRDT in it at all.
        XCTAssertEqual(
            app.staticTexts["toolkit-crdt-map"].firstMatch.label,
            "true",
            "CRDT ops did not converge through the map handle on device"
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
