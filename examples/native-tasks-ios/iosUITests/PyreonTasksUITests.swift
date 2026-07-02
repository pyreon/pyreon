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
        openFirst.tap()

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
        vocabBack.tap()
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
        let statsBack = app.buttons["stats-back"].firstMatch
        XCTAssertTrue(statsBack.exists, "Back button missing on stats page")
        statsBack.tap()
        XCTAssertTrue(
            tasksPage.waitForExistence(timeout: 15),
            "Did not return to tasks after stats Back"
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
