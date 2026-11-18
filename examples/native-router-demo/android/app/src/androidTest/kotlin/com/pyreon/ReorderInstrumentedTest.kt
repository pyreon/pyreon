// ReorderInstrumentedTest — keyed list REORDER on Android (LST-1). The iOS
// twin is `ReorderUITests.swift`; the page is `src/ReorderPage.tsx`.
//
// `<For each by>` lowers to `LazyColumn { items(list, key = { it.id }) }`. The
// key is what makes a row's composition (and its `remember`ed state) follow
// the row when the list is reordered. Without it Compose keys by position, the
// labels still show the new order, and every row's local state stays in the
// slot it was in. Each row on the page holds a local `marked` flag, so the
// tests mark a row, reorder, and assert the mark moved with that row.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertTextEquals
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
class ReorderInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private val labels = listOf("Alpha", "Bravo", "Charlie", "Delta")

    @Before
    fun openReorderPage() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://reorder"))
        }
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("reorder-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    /** The label each row renders right now: `X` or `X marked`. */
    private fun rowLabel(name: String): String =
        if (composeRule.onAllNodesWithText("$name marked").fetchSemanticsNodes().isNotEmpty()) "$name marked" else name

    /** Asserts the rows are DRAWN top to bottom in `order`, not just listed in the model. */
    private fun assertRendered(order: List<String>) {
        composeRule.onNodeWithTag("reorder-order").assertTextEquals("Order: ${order.joinToString(",")}")
        val tops = order.map { name ->
            composeRule.onNodeWithText(rowLabel(name)).getUnclippedBoundsInRoot().top.value
        }
        assertEquals("rows are not drawn in the order $order (tops $tops)", tops.sorted(), tops)
    }

    /** Asserts exactly `names` carry a mark — the marks moved with their rows. */
    private fun assertMarked(vararg names: String, after: String) {
        for (name in labels) {
            val marked = composeRule.onAllNodesWithText("$name marked").fetchSemanticsNodes().isNotEmpty()
            assertEquals(
                "after $after, '$name' ${if (marked) "carries" else "lost"} a mark — row state did not follow its key",
                name in names,
                marked,
            )
        }
    }

    @Test
    fun keyedReorderKeepsEachRowsStateWithItsRow() {
        assertRendered(listOf("Alpha", "Bravo", "Charlie", "Delta"))
        composeRule.onNodeWithText("Mark Bravo").performClick()
        composeRule.waitForIdle()
        assertMarked("Bravo", after = "marking Bravo")

        // Move: Bravo goes from slot 1 to slot 0; position keying would leave the mark on Charlie.
        composeRule.onNodeWithText("Move first").performClick()
        composeRule.waitForIdle()
        assertRendered(listOf("Bravo", "Charlie", "Delta", "Alpha"))
        assertMarked("Bravo", after = "move first")

        // Sort: Bravo goes to slot 2.
        composeRule.onNodeWithText("Sort desc").performClick()
        composeRule.waitForIdle()
        assertRendered(listOf("Delta", "Charlie", "Bravo", "Alpha"))
        assertMarked("Bravo", after = "sort desc")

        // Swap: Delta (slot 0) and Alpha (slot 3) trade places.
        composeRule.onNodeWithText("Mark Delta").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Swap ends").performClick()
        composeRule.waitForIdle()
        assertRendered(listOf("Alpha", "Charlie", "Bravo", "Delta"))
        assertMarked("Bravo", "Delta", after = "swap ends")
    }

    @Test
    fun tenThousandRowReverseSettles() {
        composeRule.onNodeWithText("Item 0").assertExists()
        assertTrue(
            "Item 9999 is composed before the reverse — the list is not lazy",
            composeRule.onAllNodesWithText("Item 9999").fetchSemanticsNodes().isEmpty(),
        )
        val started = System.nanoTime()
        composeRule.onNodeWithText("Reverse big").performClick()
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodesWithText("Item 9999").fetchSemanticsNodes().isNotEmpty()
        }
        val ms = (System.nanoTime() - started) / 1_000_000
        android.util.Log.i("ReorderInstrumentedTest", "10k reverse settled in $ms ms")
        assertTrue(
            "Item 0 is still composed after reversing 10,000 rows — the old head did not leave the top",
            composeRule.onAllNodesWithText("Item 0").fetchSemanticsNodes().isEmpty(),
        )
        composeRule.onNodeWithText("Item 9998").assertExists()
    }
}
