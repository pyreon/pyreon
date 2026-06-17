// PyreonWebView — the Android host for the multiplatform `<WebView>`
// primitive (mirror of PyreonWebView.swift). PMTC emits
// `PyreonWebView(html = …)` / `PyreonWebView(src = …)` on the Kotlin
// target; this wraps an Android `WebView` in a Composable via
// `AndroidView`, so the heavy web-only-rich viz (charts / flow / tables)
// renders inside a Compose native shell. The web target renders the same
// content directly (an `<iframe>`); see `@pyreon/primitives`' web impl.
//
// ## Policy posture (Play Store / App Store)
//
// Intended for HYBRID apps — a substantial native Compose shell with this
// WebView hosting specific heavy-viz screens, NOT a thin web wrapper. For
// the safest review posture, ship the viz as a LOCAL asset
// (`file:///android_asset/<src>`) rather than a remote URL, so it's app
// content (no remote-code concern). A remote http(s) `src` is supported
// for development / explicitly-online viz.
//
// ## Verification
//
// Not in the runtime package's per-service `kotlinc`-stub verify loop
// (that would need Android-framework + AndroidView stubs); the
// authoritative check is a real `gradle assembleDebug` of a consuming app
// (the build-proof), where the Android SDK + Compose are present.

package com.pyreon.runtime

import android.webkit.WebView
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Host an Android [WebView] in Compose. Supply [html] (inline HTML, e.g.
 * an ECharts page) OR [src] (a local `assets/` file name — preferred,
 * policy-safe — or a remote `http(s)` URL). [html] wins if both are set.
 */
@Composable
fun PyreonWebView(
    html: String? = null,
    src: String? = null,
    modifier: Modifier = Modifier,
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                @Suppress("SetJavaScriptEnabled")
                settings.javaScriptEnabled = true
            }
        },
        update = { webView ->
            when {
                html != null ->
                    webView.loadDataWithBaseURL(
                        "file:///android_asset/",
                        html,
                        "text/html",
                        "UTF-8",
                        null,
                    )
                src != null && (src.startsWith("http://") || src.startsWith("https://")) ->
                    webView.loadUrl(src)
                src != null ->
                    webView.loadUrl("file:///android_asset/$src")
            }
        },
    )
}
