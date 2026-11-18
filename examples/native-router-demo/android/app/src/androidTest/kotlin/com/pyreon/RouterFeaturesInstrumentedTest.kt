// RouterFeaturesInstrumentedTest — the router features no page used before
// (NAV-1): a nested layout route, a static redirect to a nested route, the
// wildcard 404, `replace` through useRouter(), and a global afterEach hook.
// The iOS twin is `RouterFeaturesUITests.swift`; the pages are the Mail*
// components in `src/RouterApp.tsx`.
//
// Every page is reached by deep link (PyreonDeepLink → the live router's
// push), the same seam the loader and guard tests use.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RouterFeaturesInstrumentedTest {
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
    }

    private fun waitForTag(tag: String) {
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun present(tag: String): Boolean = composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    private fun navCount(): Int {
        val text = composeRule.onNodeWithTag("mail-nav-count").fetchSemanticsNode()
            .config[SemanticsProperties.Text].joinToString("") { it.text }
        return text.removePrefix("Navigations: ").toInt()
    }

    // A child route renders INSIDE its layout: the shell and the child are both on screen, and switching children
    // keeps the shell. afterEach runs once per committed navigation.
    @Test
    fun nestedLayoutWrapsItsChildAndAfterEachCountsNavigations() {
        open("mail/inbox")
        waitForTag("mail-inbox")
        assertTrue("the inbox rendered without its layout", present("mail-shell"))
        val before = navCount()
        assertTrue("afterEach never ran for the deep-link navigation (count $before)", before >= 1)

        composeRule.onNodeWithText("Open sent").performClick()
        waitForTag("mail-sent")
        assertTrue("the sent child rendered without its layout", present("mail-shell"))
        assertTrue("the inbox child is still rendered after switching to sent", !present("mail-inbox"))
        assertEquals("afterEach did not run exactly once for one navigation", before + 1, navCount())
    }

    // `{ path: '/old-inbox', redirect: '/mail/inbox' }` renders the nested target inside its layout. Before the fix a
    // router with any nested route dropped every redirect, and the path fell through to the 404 page.
    @Test
    fun redirectRendersItsNestedTarget() {
        open("old-inbox")
        composeRule.waitUntil(timeoutMillis = 15_000) { present("mail-inbox") || present("not-found-page") }
        assertTrue("/old-inbox rendered the 404 page — the redirect was dropped", !present("not-found-page"))
        assertTrue("/old-inbox rendered the inbox without its layout", present("mail-shell"))
    }

    @Test
    fun unknownPathRendersTheWildcardPage() {
        open("no/such/page")
        waitForTag("not-found-page")
        composeRule.onNodeWithText("No page at this address").assertExists()
        composeRule.onNodeWithText("Back to Home").performClick()
        waitForTag("home-page")
    }

    // replace swaps the current entry, so Back skips it: home → inbox, replace with sent, back → HOME. A push in
    // its place would leave the inbox under sent, and Back would land on the inbox.
    @Test
    fun replaceSwapsTheEntrySoBackSkipsIt() {
        open("mail/inbox")
        waitForTag("mail-inbox")
        composeRule.onNodeWithText("Replace with sent").performClick()
        waitForTag("mail-sent")
        composeRule.onNodeWithText("Go back").performClick()
        composeRule.waitUntil(timeoutMillis = 15_000) { present("home-page") || present("mail-inbox") }
        assertTrue("Back after replace landed on the inbox — replace pushed instead of swapping", !present("mail-inbox"))
        assertTrue("Back after replace did not return home", present("home-page"))
    }
}
