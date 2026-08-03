// REAL-APP device proof for PMTC.
//
// Every other device assertion in this repo runs against a DEMO app: the
// counter (one screen, one hook per assertion), todomvc (one list),
// router-demo (navigation only), tasks (fetch + form). Each proves a hook in
// isolation. None proves that a realistic app — multiple screens, a shared
// store, an auth gate, derived state — actually composes on a device.
//
// This suite does. The shared `examples/native-finance/src/FinanceApp.tsx`
// compiles to SwiftUI and the flow below exercises, in one pass:
//
//   useForm validation  →  the useAuth<User> state transition
//   →  a store-backed route guard  →  a computed balance over store state
//   →  a keyed <For> list mutation with a useDatabase side-channel
//
// `useAuth` in particular had NEVER been device-asserted (the per-hook audit
// listed it R1–R2): the tasks app's login is useForm + a guard, not useAuth.
//
// Seed ledger (from the store): Salary +4200, Rent −1500 → balance 2700.

import XCTest

final class PyreonFinanceUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Terminate between tests so each starts from a cold launch. Without
    /// this, a test that leaves the app on the dashboard makes the next
    /// test's "login page is showing" assertion pass or fail depending on
    /// ordering — and a left-open modal can wedge the Simulator for every
    /// later test (the documented modal-wedge cascade).
    override func tearDownWithError() throws {
        XCUIApplication().terminate()
    }

    /// Sign out if the app is on the dashboard, so this test leaves the
    /// persisted session CLEARED for the next one.
    ///
    /// Once the Keychain actually persists (it silently did not while the CI
    /// step built the app unsigned — securityd denies SecItemAdd), a test that
    /// ends signed in leaves a session the NEXT test rehydrates. The
    /// `launchOnLoginScreen` self-heal covers that, but it decides by PROBING
    /// for the dashboard on a timeout, and a slow cold launch can land the
    /// rehydrate after the probe — an intermittent failure, which is worse
    /// than none. Clearing here makes the steady state deterministic and
    /// leaves the probe as a crash-recovery net rather than the mechanism.
    private func signOutIfSignedIn(_ app: XCUIApplication) {
        guard app.otherElements["dashboard-page"].exists else { return }
        app.buttons["dash-logout"].tap()
        _ = app.otherElements["login-page"].waitForExistence(timeout: 15)
    }

    /// Launch, and guarantee we start on the LOGIN screen.
    ///
    /// Session rehydration writes a real Keychain entry, and the Keychain
    /// outlives both the app process and the test method — so a test that
    /// assumes a signed-out launch cannot trust JUnit/XCTest ordering. Rather
    /// than adding a test-only reset hatch to the shipped app, this self-heals
    /// through the UI: if the launch rehydrated onto the dashboard, sign out
    /// (which clears the token) and continue from login.
    ///
    /// The dashboard probe has to come AFTER a settle window, not before: a
    /// rehydrating launch mounts LoginPage and navigates away within a frame
    /// or two, so `login-page` exists transiently even when we are about to
    /// land on the dashboard.
    @discardableResult
    private func launchOnLoginScreen(
        file: StaticString = #filePath, line: UInt = #line,
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(
            app.otherElements["login-page"].waitForExistence(timeout: 30)
                || app.otherElements["dashboard-page"].exists,
            "App did not render either screen", file: file, line: line,
        )
        if app.otherElements["dashboard-page"].waitForExistence(timeout: 3) {
            app.buttons["dash-logout"].tap()
            XCTAssertTrue(
                app.otherElements["login-page"].waitForExistence(timeout: 15),
                "Could not sign out of a rehydrated session", file: file, line: line,
            )
        }
        return app
    }

    // The useAuth READ. `<Text data-testid="auth-status">{auth.status}</Text>`
    // emits `Text("\(auth.status)")` over the PyreonAuth container's enum, so
    // the rendered string is the live container state — not a literal in the
    // shared source.
    func test_launchesOnLoginWithSignedOutAuthState() throws {
        let app = launchOnLoginScreen()

        XCTAssertTrue(
            app.otherElements["login-page"].waitForExistence(timeout: 30),
            "Login page did not render — the RouterProvider's initial route did not mount"
        )
        XCTAssertTrue(
            app.staticTexts["auth-status"].waitForExistence(timeout: 10),
            "auth-status text missing — the useAuth<User> container did not emit"
        )
        XCTAssertEqual(
            app.staticTexts["auth-status"].label,
            "signedOut",
            "Expected the PyreonAuth container's initial state to render as signedOut"
        )
    }

    // The useForm validation GATE — a short username must keep us on the login
    // screen. This is the negative half: proving the guard actually blocks,
    // not just that the happy path works.
    func test_shortUsernameIsRejectedAndDoesNotNavigate() throws {
        let app = launchOnLoginScreen()

        let field = app.textFields["login-username"]
        XCTAssertTrue(field.waitForExistence(timeout: 30), "Username field did not render")
        field.tap()
        field.typeText("ab")
        app.buttons["login-submit"].tap()

        XCTAssertTrue(
            app.staticTexts["login-error"].waitForExistence(timeout: 10),
            "Expected the useForm validator's message — a <3-character username should be rejected"
        )
        XCTAssertFalse(
            app.otherElements["dashboard-page"].exists,
            "Navigated to the dashboard despite failing validation — the submit gate did not hold"
        )
    }

    // THE COMPOSITION PROOF. A valid submit runs, in one tap:
    //   form.submit() → validators pass → onSubmit → auth.beginSignIn()
    //   → store.isAuthed.set(true) → navigate('/dashboard')
    //   → the route's beforeEnter guard reads the store flag and admits us
    //   → the dashboard's `computed` balance derives from store.txns
    // Any broken link in that chain leaves us on the login screen or renders
    // a wrong balance.
    func test_signInNavigatesToDashboardWithComputedBalance() throws {
        let app = launchOnLoginScreen()

        let field = app.textFields["login-username"]
        XCTAssertTrue(field.waitForExistence(timeout: 30), "Username field did not render")
        field.tap()
        field.typeText("alice")
        app.buttons["login-submit"].tap()

        XCTAssertTrue(
            app.otherElements["dashboard-page"].waitForExistence(timeout: 15),
            "Did not reach the dashboard — useAuth.beginSignIn / the store flag / the "
                + "route guard / navigate() broke somewhere in the chain"
        )
        // 4200 + (-1500). Proves the computed re-derived over the STORE's
        // seeded ledger on-device, not a constant.
        XCTAssertEqual(
            app.staticTexts["dash-balance"].label,
            "2700",
            "Computed balance is wrong — the reduce over store.txns did not run on-device"
        )

        signOutIfSignedIn(app)
    }

    // Keyed-<For> mutation through a store, with the useDatabase side-channel
    // firing on the same path (`db.delete('tx', String(id))`). The balance is
    // the observable: removing Rent (−1500) must leave Salary alone → 4200.
    func test_removingATransactionUpdatesTheComputedBalance() throws {
        let app = launchOnLoginScreen()

        let field = app.textFields["login-username"]
        XCTAssertTrue(field.waitForExistence(timeout: 30), "Username field did not render")
        field.tap()
        field.typeText("alice")
        app.buttons["login-submit"].tap()
        XCTAssertTrue(
            app.otherElements["dashboard-page"].waitForExistence(timeout: 15),
            "Did not reach the dashboard"
        )

        let removeButtons = app.buttons.matching(identifier: "tx-remove")
        XCTAssertEqual(removeButtons.count, 2, "Expected the two seeded ledger rows")

        // Row order follows the store array: [Salary, Rent]. Remove the
        // SECOND (Rent, −1500) so the expected balance is unambiguous.
        removeButtons.element(boundBy: 1).tap()

        let balance = app.staticTexts["dash-balance"]
        let updated = NSPredicate(format: "label == %@", "4200")
        expectation(for: updated, evaluatedWith: balance, handler: nil)
        waitForExpectations(timeout: 10) { error in
            XCTAssertNil(
                error,
                "Balance did not update to 4200 after removing Rent — the keyed <For> "
                    + "store mutation did not re-derive the computed on-device "
                    + "(balance was \"\(balance.label)\")"
            )
        }

        signOutIfSignedIn(app)
    }

    // Auth row — SESSION REHYDRATION, the row's remaining reachable gap, and
    // its inverse. `PyreonAuth` is pure reactive state with no platform edge;
    // durability comes from composing it with `PyreonSecureStorage`. Nothing
    // gated exercised that pairing, and writing it found a real emit bug
    // (`secrets.read()` is `String?` on both runtimes, but inference had no
    // model for service METHOD returns, so `if (token)` emitted a bare
    // optional as a condition and compiled on NEITHER target).
    //
    // `app.terminate()` is real process death, so the second launch shares
    // nothing but the Keychain: reaching the dashboard WITHOUT typing can
    // only mean the launch read the secret store, restored the auth
    // container, flipped the store flag the route guard reads, and navigated.
    //
    // The second half is what makes the first half safe to ship: sign-out
    // must clear the PERSISTED token, not merely the in-memory state — a
    // rehydrating app that keeps the token after logout silently signs the
    // user back in on the next launch.
    func test_sessionRehydratesAcrossRelaunchAndSignOutClearsIt() throws {
        let app = launchOnLoginScreen()

        let field = app.textFields["login-username"]
        XCTAssertTrue(field.waitForExistence(timeout: 15), "Username field did not render")
        field.tap()
        field.typeText("alice")
        app.buttons["login-submit"].tap()
        XCTAssertTrue(
            app.otherElements["dashboard-page"].waitForExistence(timeout: 15),
            "Sign-in did not reach the dashboard"
        )

        app.terminate()
        app.launch()

        XCTAssertTrue(
            app.otherElements["dashboard-page"].waitForExistence(timeout: 20),
            "Session did NOT rehydrate after a cold relaunch — the launch read of "
                + "PyreonSecureStorage, the auth-container restore, the store flag, or "
                + "the route guard broke somewhere in the chain"
        )

        app.buttons["dash-logout"].tap()
        XCTAssertTrue(
            app.otherElements["login-page"].waitForExistence(timeout: 15),
            "Sign-out did not return to the login screen"
        )

        app.terminate()
        app.launch()
        XCTAssertTrue(
            app.otherElements["login-page"].waitForExistence(timeout: 20),
            "Login screen did not render after signing out and relaunching"
        )
        XCTAssertFalse(
            app.otherElements["dashboard-page"].waitForExistence(timeout: 3),
            "A signed-OUT session rehydrated — secrets.remove did not clear the "
                + "persisted token, so logout leaks the session across launches"
        )
    }
}

