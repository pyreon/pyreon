// BiometricPromptInstrumentedTest — useBiometrics through a REAL BiometricPrompt
// on an emulator with an enrolled fingerprint (#4569). Driven only by
// `../../scripts/biometric-device-test.sh`, which enrols a fingerprint, runs
// each phase while it touches the emulator's virtual sensor from the host, and
// removes the enrolment afterwards. Each method skips unless the script names
// its phase, so a plain `connectedCheck` (an unenrolled emulator) never runs it.
//
// Together with `CounterInstrumentedTest.biometricAsyncGateRunsOnDevice` (no
// enrolment → "denied" with no prompt), the outcome now depends on what the
// device does, so each test can fail: the v1 runtime returned false whatever
// happened, and its "denied" assertion passed regardless.
//   accept — the host touches the ENROLLED finger: the prompt resolves true,
//            "Lock: unlocked".
//   reject — the host touches an UNENROLLED finger (a failed attempt keeps the
//            prompt up), then the test presses Back: the prompt ends in an
//            error, "Lock: denied". An implementation that treated any touch
//            as success would read "unlocked".

package com.pyreon

import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BiometricPromptInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private fun phase(): String? = InstrumentationRegistry.getArguments().getString("pyreonBiometric")

    private fun waitForText(text: String, timeoutMs: Long) {
        composeRule.waitUntil(timeoutMillis = timeoutMs) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun unlock() {
        composeRule.onNodeWithText("Lock: idle").performScrollTo()
        composeRule.onNodeWithText("Unlock").performScrollTo().performClick()
        // "checking" holds while the prompt is up: the call reached the gate
        // and is waiting on the user rather than resolving at once.
        waitForText("Lock: checking", 5_000)
        Thread.sleep(1_500)
        check(composeRule.onAllNodesWithText("Lock: checking").fetchSemanticsNodes().isNotEmpty()) {
            "authenticate() resolved without waiting for the prompt"
        }
    }

    @Test
    fun enrolledFingerprintUnlocks() {
        assumeTrue("run by scripts/biometric-device-test.sh only", phase() == "accept")
        unlock()
        // The host touches finger 1 (enrolled) every couple of seconds.
        waitForText("Lock: unlocked", 30_000)
    }

    @Test
    fun unenrolledFingerprintThenCancelDenies() {
        assumeTrue("run by scripts/biometric-device-test.sh only", phase() == "reject")
        unlock()
        // The host touches finger 2 (not enrolled) during this window; a failed
        // attempt must NOT settle the call.
        Thread.sleep(6_000)
        check(composeRule.onAllNodesWithText("Lock: checking").fetchSemanticsNodes().isNotEmpty()) {
            "an unenrolled fingerprint settled the prompt"
        }
        // Back dismisses the system prompt (it is not in this app's window, so
        // the key goes through the shell rather than the compose rule).
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("input keyevent 4").close()
        waitForText("Lock: denied", 10_000)
    }
}
