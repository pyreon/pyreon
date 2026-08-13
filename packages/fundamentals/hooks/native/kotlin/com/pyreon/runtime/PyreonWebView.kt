// PyreonWebView — the Android host for the multiplatform `<WebView>`
// primitive (mirror of PyreonWebView.swift). PMTC emits
// `PyreonWebView(html = …)` / `PyreonWebView(src = …)` (+ optional
// `data = …`) on the Kotlin target; this wraps an Android `WebView` in a
// Composable via `AndroidView`, so the heavy web-only-rich viz (charts /
// flow / tables) renders inside a Compose native shell. The web target
// renders the same content directly (an `<iframe>`); see
// `@pyreon/primitives`' web impl.
//
// ## The live-data bridge (`data`)
//
// `data` is a JSON string (PMTC emits `PyreonJson.encode(signal)` for
// `<WebView data={signal}>`). On page load AND whenever `data` changes,
// the runtime PUSHES it into the running page via `evaluateJavascript`:
//
//     window.__pyreonData = <json>;
//     window.dispatchEvent(new Event("pyreondata"));
//
// The hosted page reads `window.__pyreonData` (and re-reads on the
// `pyreondata` event). This is a PUSH into the ALREADY-LOADED page — a
// `data`-only change does NOT reload the WebView, so the chart updates in
// place (no flicker, animation preserved). The page reloads ONLY when
// `html`/`src` changes.
//
// ## The reverse bridge (`onMessage`)
//
// The hosted page sends events BACK to native (a chart bar tapped, a
// selection made) by calling the unified JS API the runtime injects:
//
//     window.pyreonPostMessage("the-payload-string");
//
// That shim forwards to `window.__pyreonNative.postMessage(...)` (an
// `addJavascriptInterface` bridge); the bridge marshals to the MAIN thread
// (`@JavascriptInterface` callbacks run on a background JavaBridge thread)
// and invokes the native `onMessage` callback — so a webview-hosted chart
// can drive native signals. The payload is a plain string. Same unified
// `window.pyreonPostMessage(...)` API on web + iOS.
//
// ## Policy posture (Play Store / App Store)
//
// Intended for HYBRID apps — a substantial native Compose shell with this
// WebView hosting specific heavy-viz screens, NOT a thin web wrapper. For
// the safest review posture, ship the viz as a LOCAL asset
// (`file:///android_asset/<src>`) rather than a remote URL.
//
// ## Verification
//
// Not in the runtime package's per-service `kotlinc`-stub verify loop
// (that would need Android-framework + AndroidView stubs); the
// authoritative check is a real `gradle assembleDebug` of a consuming app
// (the device-CI build-proof), where the Android SDK + Compose are present.

package com.pyreon.runtime

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Host an Android [WebView] in Compose. Supply [html] (inline HTML) OR
 * [src] (a local `assets/` file name — preferred, policy-safe — or a
 * remote `http(s)` URL); [html] wins if both are set. [data] is an
 * optional JSON string pushed into the page as `window.__pyreonData`
 * (live-updates without reloading; see the file header).
 */
@Composable
fun PyreonWebView(
    html: String? = null,
    src: String? = null,
    data: String? = null,
    onMessage: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    // Per-view bridge state survives recomposition; the WebViewClient +
    // JS bridge (set once in `factory`) close over it, reading the latest
    // `data` / `onMessage` that `update` writes.
    val state = remember { PyreonWebViewState() }
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                @Suppress("SetJavaScriptEnabled")
                settings.javaScriptEnabled = true
                // Reverse bridge — the page's `window.pyreonPostMessage(s)`
                // routes through `window.__pyreonNative.postMessage(s)`
                // (this JS interface) to the native `onMessage` callback.
                addJavascriptInterface(PyreonJsBridge(state), "__pyreonNative")
                webViewClient = object : WebViewClient() {
                    override fun onPageStarted(
                        view: WebView,
                        url: String?,
                        favicon: android.graphics.Bitmap?,
                    ) {
                        // Define the unified reverse-bridge API early so
                        // page scripts can call it.
                        view.evaluateJavascript(PYREON_REVERSE_BRIDGE_SHIM, null)
                    }

                    override fun onPageFinished(view: WebView, url: String?) {
                        state.loaded = true
                        view.evaluateJavascript(PYREON_REVERSE_BRIDGE_SHIM, null)
                        pushPyreonData(view, state.latestData)
                    }
                }
            }
        },
        update = { webView ->
            state.latestData = data
            state.onMessage = onMessage
            val key = (html ?: "") + "" + (src ?: "")
            if (state.loadedKey != key) {
                // html/src changed → (re)load; onPageFinished pushes data.
                state.loadedKey = key
                state.loaded = false
                loadPyreonWebView(webView, html, src)
            } else if (state.loaded) {
                // data-only change → push without reloading.
                pushPyreonData(webView, data)
            }
        },
    )
}

private class PyreonWebViewState {
    var latestData: String? = null
    var loaded: Boolean = false
    var loadedKey: String? = null
    var onMessage: ((String) -> Unit)? = null
}

/**
 * The reverse-bridge JS interface. A page calling
 * `window.pyreonPostMessage(s)` is routed (by the injected shim) to
 * `window.__pyreonNative.postMessage(s)`, landing here.
 * `@JavascriptInterface` methods run on a background (JavaBridge) thread,
 * so the callback is marshalled to the main thread before touching Compose
 * state.
 */
private class PyreonJsBridge(private val state: PyreonWebViewState) {
    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun postMessage(message: String) {
        mainHandler.post { state.onMessage?.invoke(message) }
    }
}

/** Defines the unified `window.pyreonPostMessage(...)` reverse-bridge API
 *  (mirror of the iOS WKUserScript shim). */
private const val PYREON_REVERSE_BRIDGE_SHIM =
    "window.pyreonPostMessage = function(m) { window.__pyreonNative.postMessage(String(m)); };"

/** Push the latest JSON into `window.__pyreonData` + fire `pyreondata`. */
private fun pushPyreonData(webView: WebView, json: String?) {
    if (json.isNullOrEmpty()) return
    webView.evaluateJavascript(
        "window.__pyreonData = $json; window.dispatchEvent(new Event(\"pyreondata\"));",
        null,
    )
}

private fun loadPyreonWebView(webView: WebView, html: String?, src: String?) {
    when {
        html != null ->
            webView.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null)
        src != null && (src.startsWith("http://") || src.startsWith("https://")) ->
            webView.loadUrl(src)
        src != null ->
            webView.loadUrl("file:///android_asset/$src")
    }
}
