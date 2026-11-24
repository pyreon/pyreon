// PyreonWebViewRendererGoneTest — a hosted page's renderer process going away
// must not take the app down with it.
//
// Android runs every WebView's page in ONE separate renderer process per app.
// When that process dies (the system kills it to reclaim memory, or a page
// crashes it), WebView calls `WebViewClient.onRenderProcessGone` on EVERY
// WebView, and if any one of them answers false (the default) WebView KILLS THE
// APP PROCESS. Every WebView the runtime creates therefore extends
// `PyreonWebViewClientBase`, and the host replaces its dead view.
//
// This is a SUSPECTED, unconfirmed cause of the intermittent "Test
// instrumentation process crashed" in
// PyreonWebViewOriginScopeTest#bundledSrcCannotLeaveTheAssetDirectory: the two
// failing runs left no logcat. The emulator steps now record logcat, and a
// renderer loss logs a `[Pyreon] <WebView>: the renderer process` line that the
// workflow counts on green runs too; see the multiplatform guide, gotcha 11.
//
// `chrome://kill` ends the renderer the way the system does
// (`didCrash == false`); `chrome://crash` crashes it (`didCrash == true`).
// Android CTS uses both for the same callback.

package com.pyreon

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.pyreon.runtime.PyreonWebView
import com.pyreon.runtime.PyreonWebViewRendering
import java.util.concurrent.CopyOnWriteArrayList
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PyreonWebViewRendererGoneTest {
    @get:Rule
    val rule = createComposeRule()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val messages = CopyOnWriteArrayList<String>()
    private var root: View? = null

    @Before
    fun softwareWebViews() {
        // The CI emulator renders hardware WebViews blank (see PyreonWebViewRendering).
        PyreonWebViewRendering.softwareLayer = true
    }

    @After
    fun restore() {
        PyreonWebViewRendering.softwareLayer = false
    }

    private fun collect(v: View, out: MutableList<WebView>) {
        if (v is WebView) out.add(v)
        if (v is ViewGroup) for (i in 0 until v.childCount) collect(v.getChildAt(i), out)
    }

    private fun webViews(): List<WebView> {
        val out = ArrayList<WebView>()
        instrumentation.runOnMainSync { root?.let { collect(it, out) } }
        return out
    }

    private fun url(webView: WebView): String? {
        var u: String? = null
        instrumentation.runOnMainSync { u = webView.url }
        return u
    }

    private fun hostBridgePage() {
        rule.setContent {
            root = LocalView.current
            PyreonWebView(
                src = "bridge.html",
                data = "\"asset-ok\"",
                onMessage = { messages.add(it) },
                modifier = Modifier.fillMaxWidth().height(120.dp),
            )
        }
        rule.waitUntil(30_000) { messages.contains("asset-ok") }
    }

    /** End the renderer with [debugUrl]; return the NEW host view once it exists. */
    private fun loseRenderer(debugUrl: String): WebView {
        val before = webViews().single()
        messages.clear()
        instrumentation.runOnMainSync { before.loadUrl(debugUrl) }
        // An unhandled loss ends this process here, before the next line.
        rule.waitUntil(30_000) { webViews().let { it.size == 1 && it[0] !== before } }
        return webViews().single()
    }

    @Test
    fun aKilledRendererGetsANewWebViewInsteadOfKillingTheApp() {
        hostBridgePage()
        loseRenderer("chrome://kill")
        rule.waitUntil(30_000) { messages.contains("asset-ok") }
    }

    /**
     * Crashes in a row: the first two reload (the second after a 1 s backoff),
     * the third leaves a new view that loads nothing, and the app lives on.
     */
    @Test
    fun aRendererThatKeepsCrashingIsReloadedTwiceThenTheViewStaysEmpty() {
        hostBridgePage()
        loseRenderer("chrome://crash")
        rule.waitUntil(30_000) { messages.contains("asset-ok") }
        loseRenderer("chrome://crash")
        rule.waitUntil(30_000) { messages.contains("asset-ok") }
        val last = loseRenderer("chrome://crash")
        // Longer than any backoff that could still be pending.
        Thread.sleep(5_000)
        assertEquals("a view past the crash cap must not load the page", emptyList<String>(), messages.toList())
        assertNull("a view past the crash cap must stay empty", url(last))
    }

    /**
     * `window.open` builds a throwaway WebView to learn the URL; with
     * `about:blank` it never learns one. That view shares the renderer, so it
     * must handle the renderer's death too, or it alone kills the app.
     */
    @Test
    fun aWindowOpenSinkDoesNotKillTheAppWhenTheRendererDies() {
        rule.setContent {
            root = LocalView.current
            PyreonWebView(
                html = "<!doctype html><html><body style=\"margin:0\">" +
                    "<button style=\"width:100vw;height:100vh\" onclick=\"window.open('about:blank');window.pyreonPostMessage('opened')\">open</button>" +
                    "<script>setTimeout(function(){window.pyreonPostMessage('ready')},0)</script></body></html>",
                onMessage = { messages.add(it) },
                modifier = Modifier.fillMaxWidth().height(200.dp),
            )
        }
        rule.waitUntil(30_000) { messages.contains("ready") }
        val webView = webViews().single()
        val loc = IntArray(2)
        var size = IntArray(2)
        instrumentation.runOnMainSync {
            webView.getLocationOnScreen(loc)
            size = intArrayOf(webView.width, webView.height)
        }
        // A real tap: window.open needs a user gesture to reach onCreateWindow.
        assertTrue(UiDevice.getInstance(instrumentation).click(loc[0] + size[0] / 2, loc[1] + size[1] / 2))
        rule.waitUntil(15_000) { messages.contains("opened") }
        // The sink is alive: its page has named no URL, and it has no timeout.
        loseRenderer("chrome://kill")
        rule.waitUntil(30_000) { messages.contains("ready") }
    }
}
