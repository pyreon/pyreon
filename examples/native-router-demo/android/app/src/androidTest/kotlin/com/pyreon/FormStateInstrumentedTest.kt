// FormStateInstrumentedTest — `useWatch`, `useFormState` and `form.resetField`
// on Android (FRM-3). The iOS twin is `FormStateUITests.swift`; the page is
// `src/FormStatePage.tsx`.

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
class FormStateInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun openPage() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://form-state"))
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithTag("form-state-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun text(tag: String): String =
        composeRule.onNodeWithTag(tag).fetchSemanticsNode().config[SemanticsProperties.Text].joinToString("")

    private fun expect(tag: String, want: String) {
        try {
            composeRule.waitUntil(timeoutMillis = 10_000) {
                composeRule.onAllNodesWithText(want).fetchSemanticsNodes().isNotEmpty()
            }
        } catch (e: androidx.compose.ui.test.ComposeTimeoutException) {
            throw AssertionError("expected '$want'; $tag reads '${text(tag)}'", e)
        }
    }

    private fun type(more: String) {
        val field = composeRule.onNodeWithTag("fs-email")
        val now = field.fetchSemanticsNode().config[SemanticsProperties.EditableText].text
        field.performTextInputSelection(TextRange(now.length))
        field.performTextInput(more)
    }

    @Test
    fun watchFormStateAndResetFieldFollowTheForm() {
        composeRule.onNodeWithTag("fs-watch").assertTextEquals("Watch: ")
        composeRule.onNodeWithTag("fs-can").assertTextEquals("Can submit: no")

        // useWatch follows the input; useFormState turns yes once dirty and valid.
        type("ab")
        expect("fs-watch", "Watch: ab")
        expect("fs-can", "Can submit: yes")

        // A failed submit sets the error, which makes the form invalid.
        composeRule.onNodeWithTag("fs-submit").performClick()
        expect("fs-error", "Error: too short")
        expect("fs-can", "Can submit: no")

        // Fixing the value re-validates the field that carries an error.
        type("c")
        expect("fs-watch", "Watch: abc")
        expect("fs-error", "Error: ")
        expect("fs-can", "Can submit: yes")

        // resetField restores the initial value: clean again, no error.
        type("x")
        composeRule.onNodeWithTag("fs-submit").performClick()
        composeRule.onNodeWithTag("fs-reset").performClick()
        expect("fs-watch", "Watch: ")
        expect("fs-can", "Can submit: no")
        assertEquals("Error: ", text("fs-error"))
        assertEquals("", composeRule.onNodeWithTag("fs-email").fetchSemanticsNode().config[SemanticsProperties.EditableText].text)
    }
}
