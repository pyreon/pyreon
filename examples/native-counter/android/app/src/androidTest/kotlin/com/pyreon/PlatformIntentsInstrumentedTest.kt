// PlatformIntentsInstrumentedTest — the BEHAVIOUR of useShare, useLinking and
// useNotifications on Android, not just "the tap did not crash".
//
// Share and Open leave the app through `startActivity`, so the test installs a
// blocking `Instrumentation.ActivityMonitor` (the mechanism Espresso-Intents is
// built on, without adding that dependency) that records the Intent the app
// sent and stops it from launching. The assertion is the Intent itself: a
// chooser wrapping ACTION_SEND with the shared text, and ACTION_VIEW on the URL.
// A share that sent the wrong action, dropped the text, or never called
// startActivity fails here; the old tap-only check could not see any of that.
//
// Notify posts through NotificationManager, so the test grants
// POST_NOTIFICATIONS, reads the app's own `activeNotifications` and finds the
// posted title and text.

package com.pyreon

import android.app.Activity
import android.app.Instrumentation
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlatformIntentsInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private val instr: Instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val monitors = mutableListOf<Instrumentation.ActivityMonitor>()

    /**
     * Blocks every activity start whose Intent has [action] and records it. Built
     * on the no-argument ActivityMonitor, the only kind whose `onStartActivity`
     * the framework calls (a filter-based monitor is matched but never asked).
     */
    private class Recorder(private val action: String) : Instrumentation.ActivityMonitor() {
        @Volatile var intent: Intent? = null

        override fun onStartActivity(intent: Intent): Instrumentation.ActivityResult? {
            if (intent.action != action) return null
            this.intent = intent
            return Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null)
        }
    }

    private fun record(action: String): Recorder =
        Recorder(action).also {
            instr.addMonitor(it)
            monitors.add(it)
        }

    private fun waitFor(recorder: Recorder): Intent {
        val deadline = System.currentTimeMillis() + 10_000
        while (recorder.intent == null && System.currentTimeMillis() < deadline) Thread.sleep(50)
        return checkNotNull(recorder.intent) { "the app never called startActivity with a matching Intent" }
    }

    private fun shell(cmd: String): String =
        ParcelFileDescriptor.AutoCloseInputStream(instr.uiAutomation.executeShellCommand(cmd)).use {
            String(it.readBytes())
        }

    private fun notificationManager(): NotificationManager =
        instr.targetContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    @After
    fun cleanUp() {
        monitors.forEach { instr.removeMonitor(it) }
        notificationManager().cancelAll()
    }

    @Test
    fun shareSendsAChooserWrappingActionSendWithTheText() {
        val chooser = record(Intent.ACTION_CHOOSER)
        composeRule.onNodeWithText("Share").performScrollTo().performClick()
        val sent = waitFor(chooser)

        @Suppress("DEPRECATION")
        val inner = checkNotNull(sent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)) {
            "the chooser carries no EXTRA_INTENT: $sent"
        }
        check(inner.action == Intent.ACTION_SEND) { "the chooser wraps ${inner.action}, not ACTION_SEND" }
        check(inner.type == "text/plain") { "the shared payload is typed ${inner.type}, not text/plain" }
        check(inner.getStringExtra(Intent.EXTRA_TEXT) == "https://pyreon.dev") {
            "the shared text is ${inner.getStringExtra(Intent.EXTRA_TEXT)}, not the URL the app passed"
        }
    }

    @Test
    fun openSendsActionViewOnTheUrl() {
        val view = record(Intent.ACTION_VIEW)
        composeRule.onNodeWithText("Open").performScrollTo().performClick()
        val sent = waitFor(view)
        check(sent.action == Intent.ACTION_VIEW) { "Open sent ${sent.action}" }
        check(sent.data == Uri.parse("https://pyreon.dev")) { "Open targeted ${sent.data}" }
    }

    @Test
    fun notifyPostsTheNotification() {
        val pkg = instr.targetContext.packageName
        val nm = notificationManager()
        nm.cancelAll()

        shell("pm grant $pkg android.permission.POST_NOTIFICATIONS")
        composeRule.onNodeWithText("Notify").performScrollTo().performClick()
        val deadline = System.currentTimeMillis() + 10_000
        var posted = nm.activeNotifications.toList()
        while (posted.isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(100)
            posted = nm.activeNotifications.toList()
        }
        check(posted.size == 1) { "expected one active notification after Notify, found ${posted.size}" }
        val extras = posted.single().notification.extras
        check(extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() == "Pyreon") {
            "the notification title is ${extras.getCharSequence(Notification.EXTRA_TITLE)}"
        }
        check(extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() == "A local notification") {
            "the notification text is ${extras.getCharSequence(Notification.EXTRA_TEXT)}"
        }

    }
}
