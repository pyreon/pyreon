// HttpMiddlewareInstrumentedTest — `createHttp` client middleware on Android
// (NET-3). The iOS twin is `HttpMiddlewareUITests.swift`; the page is
// `src/HttpMiddlewarePage.tsx`, the fixture `/flaky` in
// `scripts/ws-echo-server.ts` (reached through `adb reverse tcp:8790`).
//
// The fixture answers 503 once after a reset and 200 afterwards, reporting how
// many requests it saw and the Authorization header of the last one. The test
// resets it, opens the page, and asserts two requests reached the server (the
// retry ran) and the bearer token arrived.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HttpMiddlewareInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun waitForHome() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun retryResendsA503AndBearerSendsTheToken() {
        assertEquals("the fixture did not reset", "reset", java.net.URL("http://localhost:8790/flaky-reset").readText())
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://http-mw"))
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithText("Attempts: 0").fetchSemanticsNodes().isEmpty() ||
                composeRule.onAllNodesWithText("Error: yes").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("http-mw-error").assertTextEquals("Error: no")
        composeRule.onNodeWithTag("http-mw-attempts").assertTextEquals("Attempts: 2")
        composeRule.onNodeWithTag("http-mw-auth").assertTextEquals("Auth: Bearer tok-mw")
    }
}
