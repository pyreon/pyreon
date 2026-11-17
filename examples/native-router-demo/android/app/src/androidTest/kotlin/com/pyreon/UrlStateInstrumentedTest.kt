// UrlStateInstrumentedTest — `useUrlState` round trips through the router's
// search params on Android (NAV-2). The iOS twin is `UrlStateUITests.swift`;
// the page is `src/QueryPage.tsx`.
//
// IN: a deep link carrying a query sets every value, each parsed back into its
// type. OUT: each write serializes into the committed URL; leaving the page and
// pressing Back re-commits that URL, so the values shown afterwards were parsed
// from the serialized text, not read from the value just written.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class UrlStateInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun waitForHome() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun open(link: String) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://$link"))
        }
        waitForTag("query-page")
    }

    private fun waitForTag(tag: String) {
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun assertValues(term: String, page: String, archived: String, tags: String) {
        composeRule.onNodeWithTag("query-term").assertTextEquals("Term: $term")
        composeRule.onNodeWithTag("query-page-number").assertTextEquals("Page: $page")
        composeRule.onNodeWithTag("query-archived").assertTextEquals("Archived: $archived")
        composeRule.onNodeWithTag("query-tags").assertTextEquals("Tags: $tags")
    }

    @Test
    fun aDeepLinksQuerySetsEveryTypedValue() {
        open("query?q=hello%20world&page=7&archived=true&tags=a,b")
        assertValues(term = "hello world", page = "7", archived = "yes", tags = "a|b")
    }

    @Test
    fun writesSerializeIntoTheUrlAndParseBack() {
        open("query")
        assertValues(term = "", page = "1", archived = "no", tags = "news")
        for (label in listOf("Set term", "Next page", "Next page", "Toggle archived", "Add tag")) {
            composeRule.onNodeWithText(label).performClick()
            composeRule.waitForIdle()
        }
        assertValues(term = "cats & dogs", page = "3", archived = "yes", tags = "news|sport")

        // Leave and come back: Back re-commits the serialized URL, which the router parses again.
        composeRule.onNodeWithText("Leave query").performClick()
        waitForTag("about-page")
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            composeRule.activity.onBackPressedDispatcher.onBackPressed()
        }
        waitForTag("query-page")
        assertValues(term = "cats & dogs", page = "3", archived = "yes", tags = "news|sport")
    }
}
