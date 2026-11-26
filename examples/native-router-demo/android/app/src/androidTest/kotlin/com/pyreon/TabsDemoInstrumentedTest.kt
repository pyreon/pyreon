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
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertTrue
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

    // ── The web tab (#4827, #4829) ───────────────────────────────────────────────────────────

    private fun textOf(tag: String): String =
        composeRule.onAllNodes(androidx.compose.ui.test.hasTestTag(tag)).fetchSemanticsNodes().firstOrNull()
            ?.config?.getOrNull(SemanticsProperties.Text)
            ?.joinToString("") { it.text } ?: "<absent>"

    private fun waitForText(tag: String, what: String, ok: (String) -> Boolean) {
        try {
            composeRule.waitUntil(timeoutMillis = 30_000) { ok(textOf(tag)) }
        } catch (e: Throwable) {
            throw AssertionError("$what — $tag is '${textOf(tag)}'", e)
        }
    }

    /** Open the web tab and follow the page's link, so the page has one entry of history. */
    private fun openWebTabWithHistory(): UiDevice {
        composeRule.onNodeWithTag("tabs-tab-web").performClick()
        waitForTag("tabs-web-home")
        waitForText("tabs-web-state", "page one never loaded") { it == "at:#one" }
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val link = device.wait(Until.findObject(By.text("Go to two")), 20_000)
        assertTrue("the page's link was not found inside the WebView", link != null)
        link!!.click()
        waitForText("tabs-web-state", "the link was not followed") { it == "at:#two" }
        return device
    }

    @Test
    fun backWalksThePageHistoryThenLeavesTheTab() {
        waitForTag("tabs-feed-home")
        openWebTabWithHistory()
        // onLoad: one document; the in-page #two navigation is not a load.
        assertTrue("onLoad ran ${textOf("tabs-web-loads")}, expected once", textOf("tabs-web-loads") == "loads:1")

        // Back goes back IN the page while it has history…
        systemBack()
        waitForText("tabs-web-state", "Back did not go back in the page") { it == "at:#one" }
        composeRule.onNodeWithTag("tabs-web-home").assertIsDisplayed()

        // …and at its first page leaves the tab as before (to the first tab).
        systemBack()
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-feed-title").assertIsDisplayed()
    }

    @Test
    fun aHiddenTabsWebViewDoesNotTakeBackFromTheVisibleTab() {
        waitForTag("tabs-feed-home")
        openWebTabWithHistory()

        // The web tab stays composed (hidden) with history; Back on Feed's pushed
        // post must pop Feed's stack, not move the hidden page back.
        composeRule.onNodeWithTag("tabs-tab-feed").performClick()
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-feed-open").performClick()
        waitForTag("tabs-feed-post")
        systemBack()
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-feed-post").assertDoesNotExist()

        composeRule.onNodeWithTag("tabs-tab-web").performClick()
        waitForTag("tabs-web-home")
        assertTrue("the hidden page moved: ${textOf("tabs-web-state")}", textOf("tabs-web-state") == "at:#two")
    }

    @Test
    fun aPageTheAppReplacedIsNotInTheBackHistory() {
        waitForTag("tabs-feed-home")
        openWebTabWithHistory()
        composeRule.onNodeWithTag("tabs-web-swap").performClick()
        waitForText("tabs-web-state", "the swapped page never loaded") { it == "at:page-two" }

        // Page two is a new history: Back leaves the tab instead of returning to page one.
        systemBack()
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-tab-web").performClick()
        waitForTag("tabs-web-home")
        assertTrue("Back returned to the replaced page: ${textOf("tabs-web-state")}", textOf("tabs-web-state") == "at:page-two")
    }

    @Test
    fun anUnreachablePageReportsALoadErrorAndReloadKeyRetries() {
        waitForTag("tabs-feed-home")
        composeRule.onNodeWithTag("tabs-tab-web").performClick()
        waitForTag("tabs-web-home")
        waitForText("tabs-web-errors", "no onError for an unreachable page") { it == "errors:1 load" }
        composeRule.onNodeWithTag("tabs-web-retry").performClick()
        waitForText("tabs-web-errors", "a new reloadKey did not load the page again") { it == "errors:2 load" }
    }
}
