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
            .performTextInput("alice")

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

        // Phase 5: logout — flips the store flag back; lands on /login.
        composeRule
            .onNodeWithTag("tasks-logout")
            .performClick()

        composeRule
            .onNodeWithTag("login-page")
            .assertIsDisplayed()
    }
}
