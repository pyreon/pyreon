// TasksAppInstrumentedTest — launch + auth-gate + store mutation +
// typed-params smoke for the Android tasks showcase. Mirror of:
//   - iOS:     `native-tasks-ios/iosUITests/PyreonTasksUITests.swift`
//   - Counter: `native-counter-android/.../CounterInstrumentedTest.kt` (#1454)
//   - Router:  `native-router-demo-android/.../RouterDemoInstrumentedTest.kt` (#1455)
//
// Proves at real-Emulator scope, against the STORE-BACKED TasksApp
// source (Gap 4 closure — see the header of
// `../native-tasks/src/TasksApp.tsx`):
//
//   - App launches → login page renders
//   - Typing a username + Continue flips the store's auth flag and
//     navigates to /tasks — the per-route `beforeEnter` guard reads
//     the SAME `mutableStateOf`-backed store object and admits the route
//   - Typing a title + Add appends to the STORE's task list (cross-
//     screen state — the exact thing `rememberPyreonStorage` could NOT
//     provide, being per-composable) and the keyed list re-renders
//   - "Open task 1" navigates to /tasks/:id — typed-params route:
//     the dispatcher constructs `TaskDetailPageParam(id = ...)` from
//     the matched segment (also auth-gated)
//   - "Back to tasks" returns, "Logout" flips the flag back and lands
//     on /login — the gate re-engages
//
// data-testid attrs in the SHARED `../native-tasks/src/TasksApp.tsx`
// compile to `Modifier.testTag(...)` on the Compose node; this test
// queries via `onNodeWithTag(...)`.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule via the Android Emulator runner action.

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TasksAppInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appLaunchesOnLoginPage() {
        composeRule
            .onNodeWithTag("login-page")
            .assertIsDisplayed()
    }

    @Test
    fun authGateStoreMutationAndTypedParamsDetail() {
        // Phase 1: login — flips the store's auth flag; the beforeEnter
        // guard on /tasks reads it and admits the navigation.
        composeRule
            .onNodeWithTag("login-username")
            .performTextInput("ab")

        // Phase 1a: the ERROR path — "ab" fails the min-3 validator:
        // the error renders, navigation is blocked (device-scope proof
        // of the form-binding arc).
        composeRule
            .onNodeWithTag("login-submit")
            .performClick()

        composeRule
            .onNodeWithTag("login-error")
            .assertIsDisplayed()

        composeRule
            .onNodeWithTag("login-page")
            .assertIsDisplayed()

        // Phase 1b: more characters fix the field (setValue
        // re-validates after an error) and submit passes the gate.
        composeRule
            .onNodeWithTag("login-username")
            .performTextInput("cde")

        composeRule
            .onNodeWithTag("login-submit")
            .performClick()

        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 2: add a task — proves the STORE list mutation
        // (.set spread-append on the mutableStateOf-backed object)
        // re-renders the keyed list.
        composeRule
            .onNodeWithTag("new-task-title")
            .performTextInput("Verify on the emulator")

        composeRule
            .onNodeWithTag("new-task-add")
            .performClick()

        composeRule
            .onNodeWithText("Verify on the emulator")
            .assertIsDisplayed()

        // Phase 3: typed-params route — /tasks/1 constructs
        // TaskDetailPageParam(id = "1") in the dispatcher (auth-gated).
        composeRule
            .onNodeWithTag("tasks-open-first")
            .performClick()

        composeRule
            .onNodeWithTag("task-detail-page")
            .assertIsDisplayed()

        composeRule
            .onNodeWithText("Viewing task 1")
            .assertIsDisplayed()

        // Phase 4: back to the list.
        composeRule
            .onNodeWithTag("detail-back")
            .performClick()

        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 5: networked fetch (the fetch-arc device proof) — the
        // quotes screen runs useFetch<Quote[]> through the emitted
        // LaunchedEffect + kotlinx-serialization harness against the
        // CI fixture server (http://127.0.0.1:8787, reverse-forwarded
        // into the emulator via `adb reverse`; cleartext allowed for
        // loopback only by the network security config). Asserted BY
        // CONTENT so a 200-with-wrong-body can't pass. waitUntil
        // because the request crosses a real network hop — Compose's
        // idle-sync does NOT cover URLSession-style background work.
        composeRule
            .onNodeWithTag("tasks-quotes")
            .performClick()

        composeRule
            .onNodeWithTag("quotes-page")
            .assertIsDisplayed()

        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule
                .onAllNodesWithText("Make it work, make it right, make it fast.")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        composeRule
            .onNodeWithTag("quotes-back")
            .performClick()

        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 6: logout — flips the store flag back; lands on /login.
        composeRule
            .onNodeWithTag("tasks-logout")
            .performClick()

        composeRule
            .onNodeWithTag("login-page")
            .assertIsDisplayed()
    }
}
