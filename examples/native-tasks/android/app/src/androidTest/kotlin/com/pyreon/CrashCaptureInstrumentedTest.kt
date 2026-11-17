// CrashCaptureInstrumentedTest — an UNCAUGHT JVM exception captured on a device
// and reported on the next launch (CRA-3). The iOS twin is
// CrashCaptureUITests.swift; the screen is src/CrashScreen.tsx.
//
// The instrumentation runs INSIDE the app process, so a real crash ends the run
// that causes it. The proof is therefore two `am instrument` runs, driven by
// scripts/crash-device-test.sh against ONE install:
//   1. `pyreonCrashPhase=arm`: open the crash screen (its reporter starts),
//      throw a RuntimeException on the main thread. The process dies; the
//      script requires the run to end in a crash carrying `PyreonCrashProof`.
//   2. `pyreonCrashPhase=verify`: a fresh process opens the screen and must
//      find the persisted report — `Had crash: true`, `Proof: yes`.
// Without the argument (a plain `connectedCheck`) both are skipped, so the
// ordinary suite never crashes itself.

package com.pyreon

import android.os.Handler
import android.os.Looper
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CrashCaptureInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private val phase: String? = InstrumentationRegistry.getArguments().getString("pyreonCrashPhase")

    private fun openCrashScreen() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("login-username").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("login-username").performTextInput("abcde")
        composeRule.onNodeWithTag("login-submit").performClick()
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("tasks-page").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("tasks-crash").performScrollTo().performClick()
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithTag("crash-armed").fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun armThenCrash() {
        assumeTrue("run by scripts/crash-device-test.sh only", phase == "arm")
        openCrashScreen()
        // A report left by an earlier run would satisfy phase 2 without this crash.
        composeRule.onNodeWithTag("crash-clear").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("crash-had").assertTextEquals("Had crash: false")
        Handler(Looper.getMainLooper()).post {
            throw RuntimeException("PyreonCrashProof: thrown by the device test, uncaught")
        }
        // The process dies on the main thread; this never returns normally.
        Thread.sleep(10_000)
        throw AssertionError("the uncaught exception did not end the process")
    }

    @Test
    fun verifyTheNextLaunchReportsIt() {
        assumeTrue("run by scripts/crash-device-test.sh only", phase == "verify")
        openCrashScreen()
        composeRule.onNodeWithTag("crash-had").assertTextEquals("Had crash: true")
        composeRule.onNodeWithTag("crash-proof").assertTextEquals("Proof: yes")
        composeRule.onNodeWithTag("crash-clear").performClick()
    }
}
