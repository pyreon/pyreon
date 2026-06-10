// TasksAppInstrumentedTest — launch + navigation + typed-params smoke
// for the Android tasks showcase. Mirror of:
//   - iOS:     `native-tasks-ios/iosUITests/PyreonTasksUITests.swift`
//   - Counter: `native-counter-android/.../CounterInstrumentedTest.kt` (#1454)
//   - Router:  `native-router-demo-android/.../RouterDemoInstrumentedTest.kt` (#1455)
//
// Proves at real-Emulator scope, against the REWRITTEN TasksApp source
// (the original scaffold over-reached the Tier-1 vocabulary — see the
// header of `../native-tasks/src/TasksApp.tsx`):
//
//   - App launches → home page renders
//   - "Open tasks" navigates to /tasks (list with 2 seeded tasks)
//   - Typing a title + tapping Add appends a third task (signal-driven
//     list mutation re-renders the Compose tree)
//   - "Open task 1" navigates to /tasks/:id — the TYPED-PARAMS route:
//     the dispatcher constructs `TaskDetailPageParam(id = ...)` from
//     the matched path segment (the typed-params compiler arc, gated
//     here at device level)
//   - "Back to tasks" returns to /tasks
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
    fun appLaunchesOnHomePage() {
        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()
    }

    @Test
    fun navigateAddTaskAndOpenTypedParamsDetail() {
        // Phase 1: home → tasks
        composeRule
            .onNodeWithTag("home-open-tasks")
            .performClick()

        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 2: add a task — proves signal-driven list mutation
        // (.set spread-append) re-renders the keyed list.
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
        // TaskDetailPageParam(id = "1") in the dispatcher.
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
    }
}
