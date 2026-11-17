// RecordFieldInstrumentedTest — a database field read through its record
// (`saved.fields.body`) on Android. The iOS twin is `RecordFieldUITests.swift`;
// the page is OfflinePage in `src/RouterApp.tsx`.
//
// Natively a record's field bag is a map, and this dot path was emitted
// verbatim (`saved.fields.body`) and failed the build with no warning. It now
// lowers to a subscript, so the value written is the value shown.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RecordFieldInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun aFieldReadThroughTheRecordShowsTheWrittenValue() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://offline"))
        }
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("offline-page").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("clear-note").performClick()
        composeRule.onNodeWithTag("note-body").assertTextEquals("Body: none")
        composeRule.onNodeWithTag("write-note").performClick()
        composeRule.onNodeWithTag("note-body").assertTextEquals("Body: written-offline")
        composeRule.onNodeWithTag("clear-note").performClick()
    }
}
