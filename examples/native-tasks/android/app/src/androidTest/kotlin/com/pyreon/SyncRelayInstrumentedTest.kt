// SyncRelayInstrumentedTest — `connectPyreonSync` over the native WebSocket
// channel against a local relay (OFF-1). The relay is scripts/sync-relay.ts on
// the host's port 8792, reached through `adb reverse tcp:8792`; it is a peer
// itself, so this test writes on the relay and reads the device, and the other
// way round. The iOS twin is SyncRelayUITests.swift; the screen is
// src/SyncScreen.tsx.

package com.pyreon

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.net.URL
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SyncRelayInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private fun relay(path: String): String = URL("http://localhost:8792$path").readText()

    private fun title(): String =
        composeRule.onNodeWithTag("sync-title").fetchSemanticsNode().config[SemanticsProperties.Text].joinToString("")

    private fun waitForTitle(want: String) {
        try {
            composeRule.waitUntil(timeoutMillis = 15_000) {
                composeRule.onAllNodes(hasTestTag("sync-title") and hasText(want)).fetchSemanticsNodes().isNotEmpty()
            }
        } catch (e: Throwable) {
            throw AssertionError("expected '$want'; sync-title reads '${title()}'", e)
        }
    }

    private fun waitFor(what: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 15_000
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return
            Thread.sleep(200)
        }
        throw AssertionError("timed out waiting for $what")
    }

    @Test
    fun aSyncedValueConvergesOverAWebSocketRelay() {
        assertEquals("the relay did not reset", "reset", relay("/sync/reset"))
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("login-username").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("login-username").performTextInput("abcde")
        composeRule.onNodeWithTag("login-submit").performClick()
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("tasks-page").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("tasks-sync").performScrollTo().performClick()
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("sync-page").fetchSemanticsNodes().isNotEmpty()
        }
        waitForTitle("Title: none")
        waitFor("the device to connect to the relay") { relay("/sync/clients") == "1" }

        // A remote op (written on the relay peer) updates the synced value.
        assertEquals("ok", relay("/sync/set?key=relayTitle&value=from-relay"))
        waitForTitle("Title: from-relay")

        // A local write reaches the peer.
        composeRule.onNodeWithTag("sync-write").performClick()
        waitForTitle("Title: from-device")
        waitFor("the device's write to reach the relay") { relay("/sync/get?key=relayTitle") == "from-device" }

        // After disconnect, a relay write no longer arrives.
        composeRule.onNodeWithTag("sync-disconnect").performClick()
        waitFor("the device to leave the relay") { relay("/sync/clients") == "0" }
        assertEquals("ok", relay("/sync/set?key=relayTitle&value=after-disconnect"))
        Thread.sleep(1500)
        composeRule.waitForIdle()
        assertEquals("a write after disconnect still arrived", "Title: from-device", title())
    }
}
