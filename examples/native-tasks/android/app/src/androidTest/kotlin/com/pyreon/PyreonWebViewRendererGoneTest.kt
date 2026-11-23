// PyreonWebViewRendererGoneTest — a hosted page's renderer process going away
// must not take the app down with it.
//
// Android runs every WebView's page in a separate renderer process. When that
// process dies (the system kills it to reclaim memory, or the page crashes it),
// WebView calls `WebViewClient.onRenderProcessGone`; when that is not handled
// (the default returns false) WebView KILLS THE APP PROCESS. The likely cause
// of the intermittent "Test instrumentation process crashed" in
// PyreonWebViewOriginScopeTest#bundledSrcCannotLeaveTheAssetDirectory (nine
// WebViews on a cold renderer, one fresh process per test under the Test
// Orchestrator); the step's logcat artifact names the cause of the next one.
//
// `chrome://kill` is WebView's own way to end the renderer the way the system
// does (`didCrash == false`); CTS uses it for the same callback. After it, the
// test process is still alive, the host shows a NEW WebView, and the page
// loads and talks over the bridge again.

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
import com.pyreon.runtime.PyreonWebView
import com.pyreon.runtime.PyreonWebViewRendering
import java.util.concurrent.CopyOnWriteArrayList
import org.junit.After
import org.junit.Assert.assertNotSame
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PyreonWebViewRendererGoneTest {
    @get:Rule
    val rule = createComposeRule()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
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

    @Test
    fun aKilledRendererGetsANewWebViewInsteadOfKillingTheApp() {
        val messages = CopyOnWriteArrayList<String>()
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
        val first = webViews().single()

        messages.clear()
        instrumentation.runOnMainSync { first.loadUrl("chrome://kill") }

        // Still running (an unhandled renderer loss ends this process before
        // the next line), with a fresh view that loaded the page again.
        rule.waitUntil(30_000) {
            val now = webViews()
            now.size == 1 && now[0] !== first && messages.contains("asset-ok")
        }
        assertNotSame(first, webViews().single())
    }
}
