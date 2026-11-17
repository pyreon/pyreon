// ComposeRuleThreadingTest — the device tests' own harness contract.
//
// A handler the compiler emits for `await fetch(...)` is
//
//     pyreonAsyncScope.launch {            // rememberCoroutineScope()
//         val reply = withContext(Dispatchers.IO) { PyreonHttp.call(request) }
//         status = "sent"                  // back on the main thread
//     }
//
// In an app the scope's dispatcher is `AndroidUiDispatcher.Main`, so the line
// after `withContext` runs on the main thread. Under a Compose test rule the
// scope's dispatcher is the rule's TEST dispatcher instead. The deprecated
// `androidx.compose.ui.test.junit4.createAndroidComposeRule` uses an
// `UnconfinedTestDispatcher`, which resumes a continuation on whichever thread
// completed the suspension — unless the main thread happens to be inside a test
// frame at that instant, in which case the resumption is deferred to it
// (`FrameDeferringContinuationInterceptor`). So it is a race: usually the main
// thread, sometimes the IO worker. On the worker, the handler's state writes,
// the snapshot apply and the recomposer frame that follow all run there, against
// the main thread's own frames. Seen in CI as `CalledFromWrongThreadException:
// Only the original thread that created a view hierarchy can touch its views.
// Expected: main Calling: DefaultDispatcher-worker-2` (run 43171644513) and as a
// slot table that threw `ArrayIndexOutOfBoundsException` on dispose and took
// the process down (run 43716528580).
//
// The `v2` rule uses a `StandardTestDispatcher`: a resumption is queued and run
// by the test clock on the main thread, every time. Every instrumented test in
// `examples/*-android` uses it (`android-device-test-harness.test.ts` in
// create-multiplatform holds them to it). This test takes the race out — the
// hop finishes while the main thread is idle, the losing case for the old rule
// — and fails if the rule ever resumes a handler off the main thread.

package com.pyreon

import android.os.Looper
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ComposeRuleThreadingTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun aHandlerResumesOnTheMainThreadAfterABackgroundHop() {
        val main = Looper.getMainLooper().thread.name
        // One thread, so a task submitted after the hop runs after the hop's whole
        // task has finished — the resumption (or its queuing) included.
        val background = Executors.newSingleThreadExecutor { r -> Thread(r, "background-hop") }
        val hop = background.asCoroutineDispatcher()
        val release = CountDownLatch(1)
        var resumedOn = "<the handler never resumed>"
        try {
            rule.setContent {
                val scope = rememberCoroutineScope()
                var status by remember { mutableStateOf("idle") }
                Button(
                    onClick = {
                        scope.launch {
                            withContext(hop) { release.await() }
                            resumedOn = Thread.currentThread().name
                            status = "resumed"
                        }
                    },
                    modifier = Modifier.testTag("hop"),
                ) { Text(status) }
            }
            rule.onNodeWithTag("hop").performClick()
            // From here the test thread stays out of Compose until the hop is over,
            // so the main thread runs no test frame the resumption could be deferred to.
            release.countDown()
            background.submit {}.get(10, TimeUnit.SECONDS)
            rule.waitUntil(10_000) { rule.onAllNodesWithText("resumed").fetchSemanticsNodes().isNotEmpty() }
            assertEquals(
                "the line after withContext(background) ran on '$resumedOn'; an app runs it on the main thread, " +
                    "and a test rule that does not lets composition race the main thread",
                main,
                resumedOn,
            )
        } finally {
            background.shutdownNow()
        }
    }
}
