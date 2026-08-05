// The Android half of the REAL-APP device gate — mirror of
// `native-finance-ios/iosUITests/PyreonFinanceUITests.swift`.
//
// Every other Android instrumented test in this repo drives a DEMO: todomvc is
// one list, counter one screen of individually-asserted hooks, tasks a fetch +
// form. This one drives a realistic multi-screen app compiled from the SAME
// `examples/native-finance/src/FinanceApp.tsx` the iOS host compiles, and
// asserts the composed flow:
//
//   useForm validation  ->  the useAuth<User> state transition
//   ->  a store-backed route guard  ->  a computed balance over store state
//
// That composition is what makes this the "one source -> both platforms" proof
// for a real app rather than a demo. `useAuth` in particular reached R4 on iOS
// only until now.
//
// Seed ledger (from the cross-screen store): Salary +4200, Rent -1500 -> 2700.

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Before
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.runtime.PyreonSecureStorage
import androidx.compose.ui.test.onAllNodesWithTag

@RunWith(AndroidJUnit4::class)
class FinanceInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    /// Guarantee every test starts on the LOGIN screen.
    ///
    /// Session rehydration writes a real Keystore-backed entry, and the
    /// encrypted store outlives both the activity and the test method — so a
    /// test that assumes a signed-out launch cannot trust JUnit ordering.
    /// Rather than adding a test-only reset hatch to the shipped app, this
    /// self-heals through the UI: a launch that rehydrated onto the dashboard
    /// is signed out (which clears the token) before the test body runs.
    @Before
    fun startSignedOut() {
        composeRule.waitForIdle()
        if (composeRule.onAllNodesWithTag("dashboard-page").fetchSemanticsNodes().isNotEmpty()) {
            composeRule.onNodeWithTag("dash-logout").performClick()
            composeRule.waitForIdle()
        }
        composeRule.onNodeWithTag("login-page").assertIsDisplayed()
    }

    // The useAuth READ. The emit renders `Text(text = "${auth.status.value}")`
    // over the PyreonAuth container's Compose MutableState, so the rendered
    // string is live container state — not a literal in the shared source.
    @Test
    fun launchesOnLoginWithSignedOutAuthState() {
        composeRule.onNodeWithTag("login-page").assertIsDisplayed()
        composeRule.onNodeWithText("signedOut").assertIsDisplayed()
    }

    // The SELF-REFERENCING onSubmit — `onSubmit: () => form.setFieldValue(…)`,
    // the "clear the field after submit" idiom. This shape did not COMPILE on
    // Android at all: the Kotlin emit passed onSubmit as a constructor
    // argument inside `remember { PyreonForm(onSubmit = { … form … }) }`, so
    // the body was a self-reference in the form's own initializer
    // ("unresolved reference 'form'"). Swift assigned it post-init from
    // `.onAppear` and was unaffected — a one-source-three-targets break whose
    // failure mode was a hard compile error, invisible to any runtime test.
    //
    // The assertion is deliberately made against the DASHBOARD's add-transaction
    // form, not the login form. The login handler navigates away, so any
    // assertion after a sign-in round trip cannot distinguish "the handler
    // cleared the field" from "the login page remounted with fresh initial
    // values" — it would pass either way. The add form clears IN PLACE, so an
    // empty field is only reachable through the self-reference.
    //
    // It asserts EditableText specifically rather than `assertTextEquals("")`:
    // an EMPTY Compose TextField publishes its PLACEHOLDER in the `Text`
    // semantics property, so the text-equality form sees ["Description", ""]
    // and fails on a field that is, in fact, correctly empty.
    @Test
    fun selfReferencingSubmitClearsTheFormInPlace() {
        composeRule.onNodeWithTag("login-username").performTextInput("ada")
        composeRule.onNodeWithTag("login-submit").performClick()
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("dashboard-page").fetchSemanticsNodes().isNotEmpty()
        }

        composeRule.onNodeWithTag("new-tx-desc").performTextInput("Coffee")
        composeRule.onNodeWithTag("new-tx-amount").performTextInput("-5")
        composeRule.onNodeWithTag("new-tx-add").performClick()
        composeRule.waitForIdle()

        // The handler ran: the row landed and the balance moved 2700 -> 2695.
        composeRule.onNodeWithTag("dash-balance").assertTextEquals("2695")
        // ...and we never left the screen, so the clear below is the handler's.
        composeRule.onNodeWithTag("dashboard-page").assertIsDisplayed()

        composeRule.onNodeWithTag("new-tx-desc").assertEditableTextIsEmpty()
        composeRule.onNodeWithTag("new-tx-amount").assertEditableTextIsEmpty()

        // Undo the append. The ledger lives in a MODULE-LEVEL `defineStore`, and
        // `createAndroidComposeRule` recreates the ACTIVITY, not the PROCESS —
        // so a row added here is still there when the next test in this class
        // runs, and `signInNavigatesToDashboardWithComputedBalance` asserts the
        // SEEDED 2700. The iOS suite does not have this hazard: every XCUITest
        // calls `app.launch()`, which is a fresh process. So an Android test
        // that mutates shared state must restore it, or it breaks a sibling
        // rather than itself — which is exactly how this surfaced.
        composeRule.onAllNodesWithTag("tx-remove")[2].performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("dash-balance").assertTextEquals("2700")
    }

    private fun SemanticsNodeInteraction.assertEditableTextIsEmpty() = assert(
        SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString("")),
    )

    // The useForm validation GATE — the negative half. A short username must
    // keep us on the login screen, proving the guard actually blocks rather
    // than that the happy path merely works.
    @Test
    fun shortUsernameIsRejectedAndDoesNotNavigate() {
        composeRule.onNodeWithTag("login-username").performTextInput("ab")
        composeRule.onNodeWithTag("login-submit").performClick()
        composeRule.waitForIdle()

        composeRule.onNodeWithTag("login-error").assertIsDisplayed()
        composeRule.onNodeWithTag("login-page").assertIsDisplayed()
    }

    // THE COMPOSITION PROOF. One tap runs: form.submit() -> validators pass ->
    // onSubmit -> auth.beginSignIn() -> store.isAuthed.set(true) ->
    // navigate('/dashboard') -> the route's beforeEnter guard reads the store
    // flag and admits us -> the dashboard's `computed` balance derives from
    // store.txns. Any broken link leaves us on the login screen or renders a
    // wrong balance.
    @Test
    fun signInNavigatesToDashboardWithComputedBalance() {
        composeRule.onNodeWithTag("login-username").performTextInput("alice")
        composeRule.onNodeWithTag("login-submit").performClick()
        composeRule.waitForIdle()

        composeRule.onNodeWithTag("dashboard-page").assertIsDisplayed()
        // 4200 + (-1500) — proves the computed re-derived over the STORE's
        // seeded ledger on-device rather than rendering a constant.
        //
        // Asserted on the balance NODE by value, not as `onNodeWithText("2700")
        // .assertIsDisplayed()`. That form conflated two claims — "the computed
        // re-derived" and "the node is inside the viewport" — and only the first
        // is what this test is about. The dashboard's `<Scroll>` lowers to a
        // LazyColumn that takes the remaining height, so adding anything below
        // it can move what is on screen and fail this on geometry grounds while
        // the balance is perfectly correct.
        composeRule.onNodeWithTag("dash-balance").assertTextEquals("2700")
    }

    // Auth row — SESSION REHYDRATION and its inverse. `PyreonAuth` is pure
    // reactive state with no platform edge; durability comes from composing
    // it with `PyreonSecureStorage`. Two independent claims, because neither
    // alone is the capability:
    //
    //   (1) DURABILITY — a COLD PyreonSecureStorage over the app's own
    //       context decrypts what the sign-in wrote. A fresh instance carries
    //       no in-memory state, so the value demonstrably came off the
    //       device's Keystore-encrypted store.
    //   (2) THE CHAIN — recreating the activity rebuilds the composition, so
    //       the launch effect re-reads the store through a NEW
    //       PyreonSecureStorage and must restore the auth container, the
    //       store flag the route guard reads, and the route itself. Landing
    //       on the dashboard without typing is the whole chain.
    //
    // Honest limit (the documented in-process ceiling, same as the storage
    // row): `recreate()` is an activity relaunch, not process death — the
    // cold-instance read in (1) is what carries the cross-process claim. The
    // iOS twin DOES kill the process (`app.terminate()`).
    //
    // The sign-out half is what makes rehydration safe to ship: clearing the
    // in-memory state while leaving the token behind silently signs the user
    // back in on the next launch.
    @Test
    fun sessionRehydratesAcrossActivityRelaunchAndSignOutClearsIt() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext

        composeRule.onNodeWithTag("login-username").performTextInput("alice")
        composeRule.onNodeWithTag("login-submit").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("dashboard-page").assertIsDisplayed()

        check(PyreonSecureStorage(ctx).read("finance-session") == "alice") {
            "cold PyreonSecureStorage did not read the sign-in's write — the session " +
                "never reached the Keystore-encrypted store"
        }

        composeRule.activityRule.scenario.recreate()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("dashboard-page").assertIsDisplayed()

        composeRule.onNodeWithTag("dash-logout").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("login-page").assertIsDisplayed()
        check(PyreonSecureStorage(ctx).read("finance-session") == null) {
            "the persisted token survived sign-out — logout leaks the session across launches"
        }

        composeRule.activityRule.scenario.recreate()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("login-page").assertIsDisplayed()
    }
}

