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

    // The useAuth READ. `<Text data-testid="auth-status">{auth.status}</Text>`
    // emits `Text("\(auth.status)")` over the PyreonAuth container's enum, so
    // the rendered string is the live container state — not a literal in the
    // shared source.
    func test_launchesOnLoginWithSignedOutAuthState() throws {
        let app = XCUIApplication()
        app.launch()

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
        let app = XCUIApplication()
        app.launch()

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
        let app = XCUIApplication()
        app.launch()

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
    }

    // Keyed-<For> mutation through a store, with the useDatabase side-channel
    // firing on the same path (`db.delete('tx', String(id))`). The balance is
    // the observable: removing Rent (−1500) must leave Salary alone → 4200.
    func test_removingATransactionUpdatesTheComputedBalance() throws {
        let app = XCUIApplication()
        app.launch()

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
    }
}
