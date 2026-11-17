// AdaptiveInstrumentedTest — ADP-3 on Android, both halves on ONE device: a
// two-element responsive array (`style={{ padding: [8, 24] }}`) and the
// size-class Stack↔Inline swap, measured at phone width, then again after
// `wm size` puts the display past 600 dp (LocalConfiguration recomposes the
// same page). The iOS twin is `AdaptiveUITests.swift`; the page is
// `src/AdaptivePage.tsx`. The display is restored in a finally, so a failed
// assertion never leaves the emulator resized.

package com.pyreon

import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AdaptiveInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun openPage() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://adaptive"))
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithTag("adaptive-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun shell(cmd: String): String =
        ParcelFileDescriptor.AutoCloseInputStream(
            InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(cmd),
        ).use { String(it.readBytes()) }

    private fun near(actual: Dp, expected: Dp, tolerance: Dp = 1.dp) =
        actual > expected - tolerance && actual < expected + tolerance

    /**
     * The padded child's left edge relative to a sibling on the page's content
     * edge. Not relative to the box: the emit puts `testTag` AFTER `padding` in
     * the modifier chain, so the box's semantics bounds are already inside the
     * padding and would read 0 whatever the padding is.
     */
    private fun padInset(): Dp {
        val edge = composeRule.onNodeWithTag("adp-class").getUnclippedBoundsInRoot()
        val child = composeRule.onNodeWithTag("adp-pad-child").getUnclippedBoundsInRoot()
        return child.left - edge.left
    }

    @Test
    fun responsiveArrayAndSwapFollowTheSizeClassFlip() {
        composeRule.onNodeWithTag("adp-class").assertTextEquals("Class: compact")
        val inset = padInset()
        check(near(inset, 8.dp)) {
            "compact responsive padding is $inset, expected the compact entry 8dp (24 = regular, 0 = dropped)"
        }
        check(composeRule.onAllNodesWithTag("adp-swap-stack").fetchSemanticsNodes().isNotEmpty()) {
            "the compact branch (Stack) did not render"
        }
        val a = composeRule.onNodeWithTag("adp-swap-a").getUnclippedBoundsInRoot()
        val b = composeRule.onNodeWithTag("adp-swap-b").getUnclippedBoundsInRoot()
        check(b.top >= a.bottom && near(b.left, a.left)) { "compact: B is not below A in A's column (A $a, B $b)" }

        try {
            shell("wm size 1600x2560")
            composeRule.waitUntil(timeoutMillis = 10_000) {
                composeRule.onAllNodesWithText("Class: regular").fetchSemanticsNodes().isNotEmpty()
            }
            composeRule.waitForIdle()
            val rInset = padInset()
            check(near(rInset, 24.dp)) { "regular responsive padding is $rInset, expected the regular entry 24dp" }
            check(composeRule.onAllNodesWithTag("adp-swap-inline").fetchSemanticsNodes().isNotEmpty()) {
                "the regular branch (Inline) did not render past 600dp"
            }
            check(composeRule.onAllNodesWithTag("adp-swap-stack").fetchSemanticsNodes().isEmpty()) {
                "the compact branch (Stack) is still composed past 600dp"
            }
            val ra = composeRule.onNodeWithTag("adp-swap-a").getUnclippedBoundsInRoot()
            val rb = composeRule.onNodeWithTag("adp-swap-b").getUnclippedBoundsInRoot()
            check(rb.left >= ra.right && near(rb.top, ra.top)) { "regular: B is not beside A on A's row (A $ra, B $rb)" }
        } finally {
            shell("wm size reset")
        }
    }
}
