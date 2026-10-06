// PyreonWebViewDomStorageTest — issue #3839: Android's WebView ships with
// `WebSettings.domStorageEnabled = false`, so `localStorage` threw a TypeError
// in any hosted page. `PyreonWebView` now enables it by default and exposes
// `domStorage = false` as the opt-out.
//
// The page is loaded through `loadDataWithBaseURL("https://example.test/", …)`
// (a synthetic HTTPS origin, no network) so localStorage has a real origin;
// the host's own `html =` path uses the file:///android_asset/ base.
//
// NOT run locally when written (no Android SDK on the authoring machine): this
// executes on the `native-device` Android Emulator job.

package com.pyreon

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.runtime.PyreonWebView
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PyreonWebViewDomStorageTest {
    @get:Rule
    val rule = createComposeRule()

    private fun findWebView(v: View): WebView? {
        if (v is WebView) return v
        if (v is ViewGroup) for (i in 0 until v.childCount) findWebView(v.getChildAt(i))?.let { return it }
        return null
    }

    private fun localStorageProbe(domStorage: Boolean): String {
        var root: View? = null
        rule.setContent {
            root = LocalView.current
            PyreonWebView(html = "<html><body>storage</body></html>", domStorage = domStorage)
        }
        rule.waitUntil(10_000) { root?.let { findWebView(it) } != null }
        val webView = findWebView(root!!)!!
        val loaded = CountDownLatch(1)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView.loadDataWithBaseURL(
                "https://example.test/", "<html><body>storage</body></html>",
                "text/html", "UTF-8", null,
            )
        }
        rule.waitUntil(10_000) {
            var ready = false
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                webView.evaluateJavascript("document.readyState + location.origin") {
                    ready = it.contains("completehttps://example.test")
                    if (ready) loaded.countDown()
                }
            }
            loaded.await(300, TimeUnit.MILLISECONDS)
        }
        var result = ""
        val done = CountDownLatch(1)
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            webView.evaluateJavascript(
                "(() => { try { localStorage.setItem('k','v'); const r = localStorage.getItem('k'); localStorage.removeItem('k'); return 'ok:' + r; } catch (e) { return 'error:' + e.name; } })()",
            ) { result = it; done.countDown() }
        }
        done.await(10, TimeUnit.SECONDS)
        return result.trim('"')
    }

    @Test
    fun localStorageWorksByDefault() {
        assertEquals("ok:v", localStorageProbe(domStorage = true))
    }

    @Test
    fun domStorageFalseOptsOut() {
        val r = localStorageProbe(domStorage = false)
        assertTrue("expected localStorage to throw with domStorage=false, got $r", r.startsWith("error:"))
    }
}
