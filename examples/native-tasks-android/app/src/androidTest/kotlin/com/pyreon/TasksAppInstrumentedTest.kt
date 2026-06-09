// TasksAppInstrumentedTest — launch + auth-gate + navigation smoke
// for the Android tasks showcase. Mirror of:
//   - iOS:     `native-tasks-ios/iosUITests/PyreonTasksUITests.swift` (#1457)
//   - Counter: `native-counter-android/.../CounterInstrumentedTest.kt` (#1454)
//   - Router:  `native-router-demo-android/.../RouterDemoInstrumentedTest.kt` (#1455)
//
// Proves the Gap 2 (#1440) per-route `beforeEnter` auth-gate end-to-
// end on Android at real-Emulator scope:
//
//   - App launches → login page renders (catch-all root → /login)
//   - Typing username + tapping Continue logs in + navigates to /tasks
//   - /tasks renders the task list (auth-gated; would have blocked)
//   - Tapping "New Task" navigates to /tasks/new
//   - Tapping Cancel returns to /tasks
//   - Tapping "Logout" navigates back to /login (auth state cleared)
//
// data-testid attrs in the SHARED `../native-tasks/src/TasksApp.tsx`
// (from #1449) compile to `Modifier.testTag(...)` on the Compose
// node; this test queries via `onNodeWithTag(...)`.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule via the Android Emulator runner action.

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
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
    fun authGateLoginAndNavigateThroughScreens() {
        // Phase 1: type username + submit
        composeRule
            .onNodeWithTag("login-username")
            .performTextInput("alice")

        composeRule
            .onNodeWithTag("login-submit")
            .performClick()

        // Phase 2: assert tasks page rendered (auth-gate passed)
        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 3: navigate to new-task page
        composeRule
            .onNodeWithTag("tasks-new")
            .performClick()

        composeRule
            .onNodeWithTag("new-task-page")
            .assertIsDisplayed()

        // Phase 4: cancel back to tasks
        composeRule
            .onNodeWithTag("new-task-cancel")
            .performClick()

        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 5: logout → auth re-engages, return to login
        composeRule
            .onNodeWithTag("tasks-logout")
            .performClick()

        composeRule
            .onNodeWithTag("login-page")
            .assertIsDisplayed()
    }
}
