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
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
        composeRule.onNodeWithText("2700").assertIsDisplayed()
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

