// ProcessDeathInstrumentedTest — the two halves of the storage row's REAL
// process-death proof on Android. Driven ONLY by
// `../../scripts/process-death-android.sh`, never by a plain
// `connectedCheck` (each method skips unless the script names its phase).
//
// Why two instrumentation runs instead of one test: an instrumented test
// runs INSIDE the app's process, so it cannot outlive a kill of that process.
// Every other storage test in this repo therefore stops at
// `scenario.recreate()`, which rebuilds the activity and keeps the process,
// and with it every in-memory map, saved-state Bundle and singleton. The
// script runs the WRITE phase, then `am force-stop`s the package and checks
// the process is gone, then runs the VERIFY phase in a NEW process. The
// verify phase writes nothing: every value it asserts can only have come off
// the device's storage.
//
// One app, all three stores the row names:
//   - kv       `useStorage('router-demo:kv', …)`   (offline page)
//   - secure   `useSecureStorage()`                 (home page)
//   - database `useDatabase()`                      (offline page)

package com.pyreon

import android.os.Process
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProcessDeathInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private fun phase(): String? =
        InstrumentationRegistry.getArguments().getString("pyreonProcessDeath")

    /** Outside the app's data dir, so it is not a store under test. */
    private fun pidFile(): File =
        File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "process-death.pid")

    private fun openOffline() {
        composeRule.onNodeWithText("View offline").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("offline-page").assertIsDisplayed()
    }

    @Test
    fun writePhase() {
        assumeTrue("run by scripts/process-death-android.sh only", phase() == "write")

        // The script cleared the app's data, so every store starts empty. Assert
        // it: a verify pass over values a previous run left behind proves nothing.
        composeRule.onNodeWithTag("secure-value").assertTextEquals("Secret: none")
        composeRule.onNodeWithTag("secure-save").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("secure-value").assertTextEquals("Secret: s3cret")

        openOffline()
        composeRule.onNodeWithTag("kv-value").assertTextEquals("KV: unset")
        composeRule.onNodeWithTag("note-count").assertTextEquals("Notes: 0")
        composeRule.onNodeWithTag("kv-save").performClick()
        composeRule.onNodeWithTag("write-note").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("kv-value").assertTextEquals("KV: kv-saved")
        composeRule.onNodeWithTag("note-count").assertTextEquals("Notes: 1")
        composeRule.onNodeWithTag("note-state").assertTextEquals("State: written")

        pidFile().writeText(Process.myPid().toString())
    }

    @Test
    fun verifyPhase() {
        assumeTrue("run by scripts/process-death-android.sh only", phase() == "verify")

        val written = pidFile().readText().trim().toInt()
        check(written != Process.myPid()) {
            "verify ran in the SAME process as the write (pid $written) — the " +
                "process never died, so nothing below is a process-death proof"
        }

        // Secure storage: the home page's mount effect reads the Keystore store.
        composeRule.onNodeWithTag("secure-value").assertTextEquals("Secret: s3cret")

        openOffline()
        // kv: the persisted signal's initial value is read from disk.
        composeRule.onNodeWithTag("kv-value").assertTextEquals("KV: kv-saved")
        // database: count and the `if (db.get(…))` presence branch, both from
        // the mount effect.
        composeRule.onNodeWithTag("note-count").assertTextEquals("Notes: 1")
        composeRule.onNodeWithTag("note-state").assertTextEquals("State: restored")
    }
}
