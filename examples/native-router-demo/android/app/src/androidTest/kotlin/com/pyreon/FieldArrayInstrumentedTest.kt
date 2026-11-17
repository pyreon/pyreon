// FieldArrayInstrumentedTest — `useFieldArray` rows driven through `<Field>`
// inputs on Android (FRM-1). The iOS twin is `FieldArrayUITests.swift`; the page
// is `src/FieldArrayPage.tsx`.
//
// Typing into a row must reach the array (`Values` reads it back); removing the
// first row must leave the survivors bound to their own items; and a write
// typed AFTER the removal must land in the row it was typed into — the write
// goes by the row's key, so an index shifted by the removal cannot misroute it.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextInputSelection
import androidx.compose.ui.text.TextRange
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FieldArrayInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun openPage() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://field-array"))
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithTag("field-array-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun values(): String =
        composeRule.onNodeWithTag("fa-values").fetchSemanticsNode().config[SemanticsProperties.Text].joinToString("")

    private fun waitForText(text: String) {
        try {
            composeRule.waitUntil(timeoutMillis = 10_000) {
                composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
            }
        } catch (e: androidx.compose.ui.test.ComposeTimeoutException) {
            throw AssertionError("expected '$text'; the page reads '${values()}'", e)
        }
    }

    /** Type at the END of row [key]'s text, as a user who tapped after it would (injected text goes to the cursor, which a
     * String-valued TextField starts at 0). */
    private fun append(key: Int, text: String) {
        val node = composeRule.onNodeWithTag("fa-row-$key")
        node.performTextInputSelection(TextRange(input(key).length))
        node.performTextInput(text)
    }

    private fun input(key: Int): String =
        composeRule.onNodeWithTag("fa-row-$key").fetchSemanticsNode()
            .config[SemanticsProperties.EditableText].text

    @Test
    fun rowsAreInputsBoundToTheirItemsAcrossARemoval() {
        composeRule.onNodeWithTag("fa-values").assertTextEquals("Values: alpha,beta")

        append(1, "X")
        waitForText("Values: alpha,betaX")

        composeRule.onNodeWithTag("fa-add").performClick()
        waitForText("Rows: 3")
        append(2, "gamma")
        waitForText("Values: alpha,betaX,gamma")

        composeRule.onNodeWithTag("fa-remove-first").performClick()
        waitForText("Values: betaX,gamma")
        check(composeRule.onAllNodesWithTag("fa-row-0").fetchSemanticsNodes().isEmpty()) {
            "the removed row's input is still composed"
        }
        assertEquals("row 1's input lost its text", "betaX", input(1))
        assertEquals("row 2's input lost its text", "gamma", input(2))

        // A write after the removal lands in the row it was typed into, though
        // that row's index moved from 2 to 1.
        append(2, "!")
        waitForText("Values: betaX,gamma!")
    }
}
