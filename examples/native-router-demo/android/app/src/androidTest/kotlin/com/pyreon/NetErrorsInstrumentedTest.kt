// NetErrorsInstrumentedTest — a request deadline and an unreachable host each
// end in the error state on Android (NET-4). The iOS twin is
// `NetErrorsUITests.swift`; the page is `src/NetErrorsPage.tsx`, the slow
// fixture `/slow` in `scripts/ws-echo-server.ts` (via `adb reverse tcp:8790`).
//
// `/slow` answers after 5 s and the call asks for 500 ms, so the error must
// show well before the answer could: the test waits at most 4 s. A request
// with no deadline would show "answered" at 5 s instead.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NetErrorsInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun openPage() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://net-errors"))
        }
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("net-errors-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun shows(text: String): Boolean = composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun aRequestPastItsTimeoutEndsInTheErrorState() {
        // The fixture must be reachable, or a refused connection would end in the error state for the wrong reason.
        org.junit.Assert.assertTrue(
            "the fixture is not reachable from the device (adb reverse tcp:8790 tcp:8790)",
            (java.net.URL("http://localhost:8790/dot.png").openConnection() as java.net.HttpURLConnection).responseCode == 200,
        )
        // 4 s: past the 500 ms deadline, before the fixture's 5 s answer.
        composeRule.waitUntil(timeoutMillis = 4_000) { shows("Timeout: error") || shows("Timeout: answered") }
        org.junit.Assert.assertTrue("the request outlived its 500 ms timeout", shows("Timeout: error"))
    }

    @Test
    fun anUnreachableHostEndsInTheErrorState() {
        composeRule.waitUntil(timeoutMillis = 20_000) { !shows("Unreachable: pending") }
        org.junit.Assert.assertTrue("a request to an unresolvable host did not reject", shows("Unreachable: error"))
    }
}
