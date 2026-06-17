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
    modifier: Modifier = Modifier,
) {
    // Per-view bridge state survives recomposition; the WebViewClient
    // (set once in `factory`) closes over it to push on page-load.
    val state = remember { PyreonWebViewState() }
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                @Suppress("SetJavaScriptEnabled")
                settings.javaScriptEnabled = true
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        state.loaded = true
                        pushPyreonData(view, state.latestData)
                    }
                }
            }
        },
        update = { webView ->
            state.latestData = data
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
}

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
