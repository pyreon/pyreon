// SpringInstrumentedTest — `<Transition easing="spring">` TIMING on Android
// (ANI-2), read on the compose test rule's virtual clock. The iOS twin is
// `SpringUITests.swift`; the page is `src/SpringPage.tsx`.
//
// A spring's `duration` is its response and it runs until it settles, so:
// - 1000 ms into the exit both boxes are still leaving (the default 300 ms
//   animation would have removed them);
// - 3000 ms in, the bouncy box (bounce 0.8, which settles after about 7 s) is
//   STILL leaving, where a 2000 ms tween — what `duration={2000}` means for
//   any non-spring easing — would have ended a second earlier;
// - well past the settle time, both are gone.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SpringInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun aSpringRunsUntilItSettlesNotForItsDuration() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://spring"))
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithTag("spring-page").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("spring-box").assertExists()
        composeRule.onNodeWithTag("bouncy-box").assertExists()

        composeRule.mainClock.autoAdvance = false
        composeRule.onNodeWithTag("spring-toggle").performClick()
        composeRule.mainClock.advanceTimeBy(1000)
        composeRule.onNodeWithTag("spring-box").assertExists()
        composeRule.onNodeWithTag("bouncy-box").assertExists()

        composeRule.mainClock.advanceTimeBy(2000)
        composeRule.onNodeWithTag("bouncy-box").assertExists()

        composeRule.mainClock.advanceTimeBy(12_000)
        composeRule.mainClock.autoAdvance = true
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("spring-box").assertDoesNotExist()
        composeRule.onNodeWithTag("bouncy-box").assertDoesNotExist()
    }
}
