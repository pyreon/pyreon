// PyreonWebViewOriginScopeTest — the native <WebView> origin scope (#4215) on a
// REAL emulator: host `data` and the reverse bridge belong to the MAIN frame of
// the origin the app loaded; that origin is pinned after the first load; file
// access is off; a bundled `src` cannot climb out of `file:///android_asset/`.
//
// It composes the real `PyreonWebView` (the hooks runtime compiled into this
// app) directly, like PyreonWebViewDomStorageTest. Remote pages come from the
// CI stream server (examples/native-tasks/scripts/webview-scope-pages.ts),
// reverse-forwarded with `adb reverse tcp:8791`, on two origins:
// http://127.0.0.1:8791 is the one the host loads, http://localhost:8791 is
// "another origin" (both are loopback, allowed by network_security_config).
// Every outcome is a string the page posts over the bridge; the test reads
// what `onMessage` received, so a leak is any extra message. The iOS twin is
// PyreonWebViewScopeUITests.swift.

package com.pyreon

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.pyreon.runtime.PyreonWebView
import com.pyreon.runtime.PyreonWebViewRendering
import java.io.File
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PyreonWebViewOriginScopeTest {
    @get:Rule
    val rule = createComposeRule()

    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    /** Per test, so the server's hit counter never mixes runs. */
    private val run = UUID.randomUUID().toString()
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

    private fun label(): String = messages.joinToString("|")

    private fun waitFor(what: String, timeoutMs: Long = 30_000, done: () -> Boolean) {
        try {
            rule.waitUntil(timeoutMs) { done() }
        } catch (e: Throwable) {
            fail("$what (messages: ${label()}; main frame: ${webViews().joinToString { url(it) ?: "null" }})")
        }
    }

    private fun mainThread(block: () -> Unit) = instrumentation.runOnMainSync(block)

    private fun url(webView: WebView): String? {
        var u: String? = null
        mainThread { u = webView.url }
        return u
    }

    /** Evaluate [js] in the main frame and return its JSON-decoded string result. */
    private fun eval(webView: WebView, js: String): String {
        var result = ""
        val done = CountDownLatch(1)
        mainThread { webView.evaluateJavascript(js) { result = it ?: ""; done.countDown() } }
        assertTrue("evaluateJavascript never answered", done.await(10, TimeUnit.SECONDS))
        return if (result.startsWith("\"")) JSONObject("{\"v\":$result}").getString("v") else result
    }

    private fun host(html: String? = null, src: String? = null) {
        rule.setContent {
            root = LocalView.current
            PyreonWebView(
                html = html,
                src = src,
                data = DATA,
                onMessage = { messages.add(it) },
                modifier = Modifier.fillMaxWidth().height(280.dp),
            )
        }
        waitFor("the host never created its WebView", 10_000) { webViews().isNotEmpty() }
    }

    // ── (a) + (b) ───────────────────────────────────────────────────────────

    /**
     * A remote main page gets the data and its message arrives; the
     * cross-origin iframe inside it HOLDS the `__pyreonNative` interface
     * (`native=android`) and calls it with an empty and a null token, yet none
     * of its messages arrive, and it has no shim and no data.
     */
    @Test
    fun remotePage_crossOriginFrameGetsNothing() {
        host(src = "$SAME/webview/main?scenario=frames&run=$run")
        waitFor("frames scenario never finished") { label().contains("main:done") }
        assertEquals("main:data=host-data|$FRAME_REPORT|main:done", label())
    }

    /** The same with inline `html` (the `file:///android_asset/` base origin). */
    @Test
    fun inlineHtml_crossOriginFrameGetsNothing() {
        host(html = "<!doctype html><html><body>inline<script src=\"$SAME/webview/scope.js?scenario=frames&run=$run\"></script></body></html>")
        waitFor("frames scenario never finished") { label().contains("main:done") }
        assertEquals("main:data=host-data|$FRAME_REPORT|main:done", label())
        assertEquals("inline html reports the file:// base, not about:blank", "file:///android_asset/", url(webViews().single()))
    }

    /** The pin is the origin the host's load LANDS on, after a server redirect. */
    @Test
    fun serverRedirectPinsTheLandedOrigin() {
        host(src = "$SAME/webview/redirect?scenario=plain&run=$run")
        waitFor("redirected page got no data / bridge") { label() == "main:data=host-data" }
        assertTrue(url(webViews().single())!!.startsWith("$CROSS/webview/landed"))
    }

    // ── (c) ─────────────────────────────────────────────────────────────────

    /**
     * After the first load the main frame stays on its origin: a script
     * navigation, a form POST, and a same-origin GET / POST that the server
     * redirects to the other origin all fail to load it (the server never
     * serves the off-origin page and this page is still there), and a TAPPED
     * link off the origin is handed to the system as an ACTION_VIEW intent.
     *
     * The POST is the case `shouldOverrideUrlLoading` never sees: before the
     * host also checked main-frame requests, it loaded the other origin in
     * place on an API 33 emulator (the off-origin page got no bridge and no
     * data, but the pin did not hold).
     */
    @Test
    fun offOriginNavigationIsBlockedOrHandedToTheSystem() {
        host(src = "$SAME/webview/main?scenario=nav&run=$run")
        waitFor("nav scenario never reported") { label().contains("nav:") }
        assertEquals("main:data=host-data|nav:still-here origin=$SAME hits=0", label())

        // A real tap (a user gesture) on the link. The intent is caught before
        // any browser starts.
        val opened = CopyOnWriteArrayList<String>()
        val monitor = object : Instrumentation.ActivityMonitor() {
            override fun onStartActivity(intent: Intent): Instrumentation.ActivityResult? {
                if (intent.action != Intent.ACTION_VIEW) return null
                opened.add(intent.dataString ?: "")
                return Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null)
            }
        }
        instrumentation.addMonitor(monitor)
        try {
            val webView = webViews().single()
            val rect = JSONObject(eval(webView, "(function(){var r=document.querySelector('a').getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()"))
            val density = webView.resources.displayMetrics.density
            val loc = IntArray(2)
            mainThread { webView.getLocationOnScreen(loc) }
            val x = loc[0] + (rect.getDouble("x") * density).toInt()
            val y = loc[1] + (rect.getDouble("y") * density).toInt()
            assertTrue(UiDevice.getInstance(instrumentation).click(x, y))
            waitFor("a tapped off-origin link was not handed to the system", 15_000) { opened.isNotEmpty() }
            assertEquals(listOf("https://example.com/pyreon-webview-scope"), opened.toList())
        } finally {
            instrumentation.removeMonitor(monitor)
        }
        Thread.sleep(1_000)
        assertEquals("the page stayed on its origin", "$SAME/webview/main?scenario=nav&run=$run", url(webViews().single()))
        assertEquals("main:data=host-data|nav:still-here origin=$SAME hits=0", label())
    }

    // ── (d) ─────────────────────────────────────────────────────────────────

    /**
     * File access is off: the four settings are false on the real view, and a
     * `file://` load of the app's own private file shows an error page, not
     * the file. CONTROL: a load of a copy with `allowFileAccess` turned back on
     * shows the file, so the probe can see a leak.
     */
    @Test
    fun fileAccessIsOff() {
        val files = instrumentation.targetContext.filesDir
        // Two copies: the control loads a DIFFERENT URL, so its wait cannot be
        // satisfied by the first load's already-finished error page.
        val secret = File(files, "pyreon-webview-secret.txt").apply { writeText("pyreon-file-secret") }
        val control = File(files, "pyreon-webview-secret-control.txt").apply { writeText("pyreon-file-secret") }
        try {
            host(html = "<!doctype html><html><body>inline</body></html>")
            val webView = webViews().single()
            waitFor("inline page never loaded", 15_000) { eval(webView, "document.body ? document.body.innerText : ''") == "inline" }
            var flags = ""
            @Suppress("DEPRECATION")
            mainThread {
                val s = webView.settings
                flags = listOf(s.allowFileAccess, s.allowContentAccess, s.allowFileAccessFromFileURLs, s.allowUniversalAccessFromFileURLs).joinToString(",")
            }
            assertEquals("allowFileAccess, allowContentAccess, allowFileAccessFromFileURLs, allowUniversalAccessFromFileURLs", "false,false,false,false", flags)

            // Done when the page shows the file or the error page naming THIS
            // file: `getUrl()` reports a load as soon as it starts, and the
            // previous document is still "complete" until it is replaced.
            fun bodyAfterLoading(file: File): String {
                mainThread { webView.loadUrl("file://${file.absolutePath}") }
                var body = ""
                waitFor("file load never finished", 15_000) {
                    body = eval(webView, "document.body ? document.body.innerText : ''")
                    body.contains("pyreon-file-secret") || body.contains(file.name)
                }
                return body
            }
            assertFalse("a file:// load read the app's private file", bodyAfterLoading(secret).contains("pyreon-file-secret"))

            mainThread { webView.settings.allowFileAccess = true }
            val controlBody = bodyAfterLoading(control)
            assertTrue("CONTROL: with file access on the probe reads the file (body: $controlBody)", controlBody.contains("pyreon-file-secret"))
        } finally {
            secret.delete()
            control.delete()
        }
    }

    /**
     * A bundled `src` that leaves `file:///android_asset/` first loads
     * nothing. Every spelling names the SAME file (`bridge.html`, which echoes
     * the data), so only the host's check tells them apart: the control loads
     * and echoes, and each escape stays empty. Rows 5–8 are the #52 spellings:
     * Chromium's URL parser deletes tab / CR / LF, so `.\t.` arrives as `..`.
     */
    @Test
    fun bundledSrcCannotLeaveTheAssetDirectory() {
        val results = Array(ASSET_SOURCES.size) { mutableStateOf("none") }
        rule.setContent {
            root = LocalView.current
            Column {
                ASSET_SOURCES.forEachIndexed { i, src ->
                    PyreonWebView(
                        src = src,
                        data = "\"asset-ok\"",
                        onMessage = { results[i].value = it },
                        modifier = Modifier.fillMaxWidth().height(24.dp),
                    )
                }
            }
        }
        waitFor("the control bundled page never echoed") { results[0].value == "asset-ok" }
        // The control proves pages on this screen load and talk; give every
        // other one the same time again before reading them.
        Thread.sleep(3_000)
        val views = webViews()
        assertEquals(ASSET_SOURCES.size, views.size)
        val loaded = ASSET_SOURCES.indices.drop(1).filter { results[it].value != "none" || url(views[it]) != null }
            .map { "#$it ${JSONObject.quote(ASSET_SOURCES[it])} -> ${url(views[it])} (${results[it].value})" }
        assertTrue("bundled src escaped the asset directory:\n${loaded.joinToString("\n")}", loaded.isEmpty())
    }

    private companion object {
        const val SAME = "http://127.0.0.1:8791"
        const val CROSS = "http://localhost:8791"
        const val DATA = """{"secret":"host-data"}"""
        const val FRAME_REPORT = "frame:native=android,shim=undefined,data=undefined,parent=blocked"
        val ASSET_SOURCES = listOf(
            "bridge.html",
            "./bridge.html",
            "x/../bridge.html",
            "../android_asset/bridge.html",
            "%2e%2e/android_asset/bridge.html",
            ".\t./android_asset/bridge.html",
            ".\r./android_asset/bridge.html",
            ".\n./android_asset/bridge.html",
            "\t../android_asset/bridge.html",
        )
    }
}
