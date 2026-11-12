// Device test for the Today showcase on a real Android emulator.
//
// The app is ../native-showcase/src/TodayApp.tsx compiled to Jetpack Compose.
// Every tag below is a `data-testid` in that source, which PMTC emits as
// `Modifier.testTag(...)`; the iOS build exposes the same strings as
// accessibility identifiers and the web build as `data-testid`.
//
// addToggleRemove is the story the homepage loop shows: three todos, add one,
// check it off, remove it, and the list is back where it started.

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextEquals
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
class TodayAppInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun addToggleRemove() {
        composeRule.onNodeWithTag("today-app").assertIsDisplayed()
        composeRule.onNodeWithTag("today-count").assertTextEquals("2 left")
        composeRule.onNodeWithText("Water the basil").assertIsDisplayed()
        composeRule.onNodeWithText("Book the dentist").assertIsDisplayed()
        composeRule.onNodeWithText("Call Grandma back").assertIsDisplayed()
        composeRule.onNodeWithTag("todo-2-done").assertIsOn()

        composeRule.onNodeWithTag("today-input").performTextInput("Pick up oat milk")
        composeRule.onNodeWithTag("today-add").performClick()
        composeRule.onNodeWithText("Pick up oat milk").assertIsDisplayed()
        composeRule.onNodeWithTag("today-count").assertTextEquals("3 left")

        composeRule.onNodeWithTag("todo-4-done").assertIsOff().performClick()
        composeRule.onNodeWithTag("todo-4-done").assertIsOn()
        composeRule.onNodeWithTag("today-count").assertTextEquals("2 left")

        composeRule.onNodeWithTag("todo-4-remove").performClick()
        composeRule.onNodeWithText("Pick up oat milk").assertDoesNotExist()
        composeRule.onNodeWithTag("today-count").assertTextEquals("2 left")
    }

    @Test
    fun removingEverythingShowsTheEmptyState() {
        for (id in 1..3) {
            composeRule.onNodeWithTag("todo-$id-remove").performClick()
        }
        composeRule.onNodeWithText("All clear. Enjoy the afternoon.").assertIsDisplayed()
        composeRule.onNodeWithTag("today-count").assertTextEquals("0 left")
    }
}
