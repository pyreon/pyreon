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

@RunWith(AndroidJUnit4::class)
class FinanceInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

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
}
