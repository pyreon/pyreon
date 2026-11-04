// Device proof for the tab-bar router (#4060) on Android: `createRouter({ tabs })`
// + `<Tabs router>` from the SHARED RouterApp.tsx, compiled to Compose.
//
// What it asserts on a real emulator:
//   - a push inside a tab renders inside that tab and the bottom bar stays;
//   - switching tabs keeps each tab's stack;
//   - re-tapping the active tab pops it to its root;
//   - the system Back pops the ACTIVE tab first, then returns from another
//     tab's root to the first tab.
//
// A hidden tab stays COMPOSED but semantics-cleared (PyreonTabs keeps visited
// tabs alive), so a hidden page is absent from the semantics tree — hence
// `assertDoesNotExist` on the other tab's page, not a visibility check.

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TabsDemoInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<TabsDemoActivity>()

    private fun systemBack() {
        composeRule.runOnUiThread { composeRule.activity.onBackPressedDispatcher.onBackPressed() }
        composeRule.waitForIdle()
    }

    private fun waitForTag(tag: String) {
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodes(androidx.compose.ui.test.hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun eachTabKeepsItsOwnBackStack() {
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-feed-title").assertIsDisplayed()

        // A push from inside the Feed tab stays inside it — the bar is still there.
        composeRule.onNodeWithTag("tabs-feed-open").performClick()
        waitForTag("tabs-feed-post")
        composeRule.onNodeWithTag("tabs-feed-post-title").assertIsDisplayed()
        composeRule.onNodeWithTag("tabs-tab-me").assertIsDisplayed()

        // Switch to Me, push there.
        composeRule.onNodeWithTag("tabs-tab-me").performClick()
        waitForTag("tabs-me-home")
        composeRule.onNodeWithTag("tabs-me-open").performClick()
        waitForTag("tabs-me-settings")

        // Back to Feed: its stack was kept — still on the post.
        composeRule.onNodeWithTag("tabs-tab-feed").performClick()
        waitForTag("tabs-feed-post")
        composeRule.onNodeWithTag("tabs-feed-post-title").assertIsDisplayed()
        composeRule.onNodeWithTag("tabs-me-settings").assertDoesNotExist()

        // Re-tapping the ACTIVE tab pops it to its root.
        composeRule.onNodeWithTag("tabs-tab-feed").performClick()
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-feed-post").assertDoesNotExist()

        // Me still holds its pushed settings page.
        composeRule.onNodeWithTag("tabs-tab-me").performClick()
        waitForTag("tabs-me-settings")
    }

    @Test
    fun systemBackPopsTheActiveTabThenReturnsToTheFirstTab() {
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-tab-me").performClick()
        waitForTag("tabs-me-home")
        composeRule.onNodeWithTag("tabs-me-open").performClick()
        waitForTag("tabs-me-settings")

        // Back pops the ACTIVE tab's own stack first…
        systemBack()
        waitForTag("tabs-me-home")
        composeRule.onNodeWithTag("tabs-me-settings").assertDoesNotExist()

        // …and from another tab's root returns to the first tab, not out of the app.
        systemBack()
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-feed-title").assertIsDisplayed()
        composeRule.onNodeWithTag("tabs-me-home").assertDoesNotExist()
    }
}
