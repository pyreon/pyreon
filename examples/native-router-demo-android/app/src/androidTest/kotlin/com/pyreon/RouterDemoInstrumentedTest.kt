// RouterDemoInstrumentedTest — launch + multi-route navigation smoke
// for the Android router demo. Mirror of:
//   - iOS:     `native-router-demo-ios/iosUITests/PyreonRouterDemoUITests.swift` (#1452)
//   - TodoMVC: `native-todomvc-android/.../TodoAppInstrumentedTest.kt`
//
// Closes the Android router-demo half of Gap 5 (Espresso parity
// beyond TodoMVC + Counter) from the 2026-06-05 audit. Counter
// Android half landed in #1454; iOS UITest (both counter +
// router-demo) landed in #1452.
//
// Asserts the R1.3 contract end-to-end:
//   - Home page renders post-launch (testTag = "home-page",
//     emitted from `<Stack data-testid="home-page">` in the SHARED
//     RouterApp.tsx)
//   - Click "Go to About" → about page renders (testTag = "about-page")
//   - Click "Back to Home" → home page renders again (round-trip)
//   - Click "View user 42" → user page renders (testTag = "user-page")
//     AND useParams() populates `id="42"` (the dynamic `:id` route
//     segment)
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule via the Android Emulator runner action,
// NOT on every PR. Promote to required once green across multiple
// consecutive nightly runs (Gap 7's 2-week-streak prerequisite).

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RouterDemoInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appLaunchesOnHomeRoute() {
        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()
    }

    @Test
    fun navigatesHomeToAboutAndBack() {
        // Wait for home, then click "Go to About"
        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()

        composeRule
            .onNodeWithText("Go to About")
            .performClick()

        composeRule
            .onNodeWithTag("about-page")
            .assertIsDisplayed()

        // Round-trip back to home
        composeRule
            .onNodeWithText("Back to Home")
            .performClick()

        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()
    }

    @Test
    fun navigatesToUserDetailWithParam() {
        // Tap "View user 42" → assert user-page renders + the
        // `:id` dynamic segment populates useParams() so the
        // `Profile for user ${params.id}` text appears with id=42.
        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()

        composeRule
            .onNodeWithText("View user 42")
            .performClick()

        composeRule
            .onNodeWithTag("user-page")
            .assertIsDisplayed()

        // The interpolated text proves useParams() resolved id="42"
        // from the route segment. PMTC emits the JSX
        // `<Text>Profile for user {params.id}</Text>` as
        // `Text(text = "Profile for user ${params.id}")`.
        composeRule
            .onNodeWithText("Profile for user 42")
            .assertIsDisplayed()
    }
}
