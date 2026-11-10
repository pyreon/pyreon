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
// That shim forwards to `window.__pyreonNative.postMessage(token, ...)` (an
// `addJavascriptInterface` bridge; see "Origin scope"); the bridge marshals to the MAIN thread
// (`@JavascriptInterface` callbacks run on a background JavaBridge thread)
// and invokes the native `onMessage` callback — so a webview-hosted chart
// can drive native signals. The payload is a plain string. Same unified
// `window.pyreonPostMessage(...)` API on web + iOS.
//
// ## DOM storage (`domStorage`)
//
// `WebSettings.domStorageEnabled` is `false` by default on Android, which
// makes `localStorage` throw a `TypeError` (and `sessionStorage` unusable) in
// any hosted document. Hosted pages are web apps (chart/flow engines, user
// content) that routinely use it, and iOS `WKWebView` has it on by default, so
// `PyreonWebView` turns it ON by default (React Native WebView does the same).
// Pass `domStorage = false` to opt out. Storage is per-origin, so enabling it
// never lets one origin read another's data; note a page loaded with
// `html = …` has the `file:///android_asset/` base origin, shared by every
// inline-`html` host in the app (give pages that need isolation a `src`).
//
// ## Browser chrome
//
// A WebChromeClient (PyreonWebChromeAndroid.kt) answers what a hosted page
// needs from the browser around it: `<input type="file">` (the system picker,
// or the camera for `capture`), `navigator.geolocation` and `getUserMedia`
// (per-origin consent, then the runtime permission the app DECLARES),
// `alert` / `confirm` / `prompt`, `window.open` / `target="_blank"` (handed to
// the system) and fullscreen video. Mirror of the iOS host's WKUIDelegate.
//
// ## Sizing
//
// Unsized, the host is full width and EXACTLY 150dp high — the `<iframe>`
// default, identical on iOS and the web. `<WebView grow>` lowers to
// `Modifier.weight(1f)` as a direct child of a Column / Row (the only place that
// extension compiles) and `Modifier.fillMaxSize()` elsewhere; the compiler
// decides, because only it knows the parent. A weighted or filled host arrives
// with a non-zero minimum height, which the default below leaves alone.
//
// ## Origin scope
//
// `data` and the reverse bridge belong to the page the APP loaded, as on the
// web (the host reaches only a same-origin / `srcdoc` frame) and on iOS. The
// decisions are in PyreonWebChromePolicy.kt, where the JVM test runs them:
//
// - The allowed origin is the one the host's own load starts on, after its
//   server redirects (`onPageStarted`): `file://` for inline `html` and
//   bundled `src`, the remote page's `scheme://host[:port]` otherwise.
// - After that the MAIN frame stays on that origin (`shouldOverrideUrlLoading`):
//   a user-tapped link off it is handed to the system (`http(s)` / `mailto` /
//   `tel` / `sms`); any other off-origin main-frame navigation is cancelled.
//   Sub-frames navigate freely but never get the bridge or the data.
// - `addJavascriptInterface` exposes `__pyreonNative` to EVERY frame and there
//   is no per-frame filter without androidx.webkit, so the shim — evaluated in
//   the main frame only, and only on the allowed origin — closes over a
//   per-view random token that every message must carry; a cross-origin
//   sub-frame cannot read it. Each message is also dropped unless the main
//   frame still shows the allowed origin.
// - `data` is pushed, and a host-group relay evaluated, only while the main
//   frame shows the allowed origin.
// - No file access beyond `file:///android_asset/` (`allowFileAccess`,
//   `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs` and
//   `allowContentAccess` all false), and a bundled `src` with a `..` segment,
//   a scheme or a backslash is refused.
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
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import java.lang.ref.WeakReference
import org.json.JSONObject

/**
 * Process-wide rendering override for every [PyreonWebView].
 *
 * `softwareLayer = false` (the default) leaves each WebView on the platform's
 * hardware-accelerated path, which is what a real device should use.
 *
 * `true` puts each WebView created AFTER the assignment on a software layer
 * (`View.LAYER_TYPE_SOFTWARE`). It exists for GPU-less environments,
 * specifically the SwiftShader-rendered Android emulator that CI runs on.
 * There, a screen holding several hardware-drawn WebViews intermittently
 * renders the WHOLE window blank. It is not only the WebViews that go
 * blank: every Compose sibling does too, and PixelCopy and UiAutomation
 * screenshots of the entire window both read pure white while the semantics
 * tree still reports every node as displayed. Measured on an API 33
 * `google_apis` emulator
 * (`-gpu swiftshader_indirect`, the CI configuration): 5 of 10 fresh-boot runs
 * of the tasks gallery failed on hardware WebViews; 0 of 10 failed with this
 * flag set. `-gpu swangle_indirect` did not help (2 of 4 failed).
 *
 * Assign it before the screen that creates the WebViews is composed, e.g.
 * in an instrumented test's `@Before`. It is a plain field, like
 * `PyreonToast.defaultDurationMillis`, not Compose state, so it does not
 * re-layer WebViews that already exist.
 */
object PyreonWebViewRendering {
    @JvmStatic
    var softwareLayer: Boolean = false
}

/**
 * Host an Android [WebView] in Compose. Supply [html] (inline HTML) OR
 * [src] (a local `assets/` file name — preferred, policy-safe — or a
 * remote `http(s)` URL); [html] wins if both are set. [data] is an
 * optional JSON string pushed into the page as `window.__pyreonData`
 * (live-updates without reloading; see the file header). [domStorage]
 * (default `true`) enables `WebSettings.domStorageEnabled` so `localStorage` /
 * `sessionStorage` work in the hosted page; `false` opts out.
 */
@Composable
fun PyreonWebView(
    html: String? = null,
    src: String? = null,
    data: String? = null,
    onMessage: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
    domStorage: Boolean = true,
) {
    // Per-view bridge state survives recomposition; the WebViewClient +
    // JS bridge (set once in `factory`) close over it, reading the latest
    // `data` / `onMessage` that `update` writes.
    val state = remember { PyreonWebViewState() }
    // File chooser / permission launchers must be registered at composition.
    val chrome = rememberPyreonWebChrome()
    AndroidView(
        // An unsized WebView measures to its content, which is ~18dp for a page
        // whose body is `height: 100%` — so a hosted chart or flow gets no room
        // to lay out and a tap at its centre lands on nothing. The web
        // `<iframe>` falls back to the CSS replaced-element default of 150px in
        // the same spot, so that is the default here.
        //
        // It has to be an EXACT height, not a minimum: AndroidView measures the
        // View `EXACTLY` only when min == max, and otherwise lets it wrap. A
        // `defaultMinSize` widened the Compose slot while the WebView inside it
        // stayed 18dp. An explicit height (or `fillMaxHeight`) arrives with a
        // non-zero minimum and passes through untouched.
        modifier = modifier.pyreonWebViewDefaultHeight(),
        onRelease = {
            PyreonWebViewGroups.leave(state)
            state.webView = null
            // A pending file chooser / permission / dialog must still be answered.
            chrome.release()
        },
        factory = { context ->
            WebView(context).apply {
                // AndroidView hands the View WRAP_CONTENT params, and a WebView
                // in that mode sizes its viewport to its CONTENT: the page's
                // `height: 100%` then resolves to 0 (measured clientHeight 0 in
                // a 150dp host), so a hosted flow fit its graph into nothing.
                // MATCH_PARENT makes the viewport the size Compose gave it.
                layoutParams = android.view.ViewGroup.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                )
                state.webView = WeakReference(this)
                if (PyreonWebViewRendering.softwareLayer) {
                    setLayerType(android.view.View.LAYER_TYPE_SOFTWARE, null)
                }
                @Suppress("SetJavaScriptEnabled")
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = domStorage
                // No file:// reach beyond the bundled assets (file:///android_asset
                // is exempt from allowFileAccess), and no file page may read
                // another file or any origin. Explicit, not the API-level default.
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                @Suppress("DEPRECATION")
                settings.allowFileAccessFromFileURLs = false
                @Suppress("DEPRECATION")
                settings.allowUniversalAccessFromFileURLs = false
                // `target="_blank"` / `window.open` reach onCreateWindow (and are
                // handed to the system) instead of replacing this page in place.
                settings.setSupportMultipleWindows(true)
                settings.setGeolocationEnabled(true)
                webChromeClient = PyreonWebChromeClient(chrome)
                // Reverse bridge — the page's `window.pyreonPostMessage(s)`
                // routes through `window.__pyreonNative.postMessage(s)`
                // (this JS interface) to the native `onMessage` callback.
                addJavascriptInterface(PyreonJsBridge(state), "__pyreonNative")
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView,
                        request: android.webkit.WebResourceRequest,
                    ): Boolean {
                        val url = request.url?.toString()
                        return when (
                            pyreonWebViewNavigationDecision(
                                isMainFrame = request.isForMainFrame,
                                initialLoadPending = state.initialLoadPending,
                                url = url,
                                allowedOrigin = state.allowedOrigin,
                                userActivated = request.hasGesture(),
                            )
                        ) {
                            PyreonWebViewNavigation.ALLOW -> false
                            PyreonWebViewNavigation.CANCEL -> true
                            PyreonWebViewNavigation.OPEN_EXTERNALLY -> {
                                if (url != null) chrome.openExternally(url)
                                true
                            }
                        }
                    }

                    override fun onPageStarted(
                        view: WebView,
                        url: String?,
                        favicon: android.graphics.Bitmap?,
                    ) {
                        // The host's own load (after its redirects) pins the origin.
                        if (state.initialLoadPending) {
                            state.initialLoadPending = false
                            state.allowedOrigin = pyreonWebViewOrigin(url)
                        }
                        // Define the unified reverse-bridge API early so page
                        // scripts can call it — only on the allowed origin.
                        if (pyreonWebViewMayDeliver(url, state.allowedOrigin)) {
                            view.evaluateJavascript(state.bridgeShim(), null)
                        }
                    }

                    override fun onPageFinished(view: WebView, url: String?) {
                        state.loaded = true
                        if (!pyreonWebViewMayDeliver(view.url, state.allowedOrigin)) return
                        view.evaluateJavascript(state.bridgeShim(), null)
                        pushPyreonData(view, state.latestData)
                    }
                }
            }
        },
        update = { webView ->
            // Applies to documents loaded after the change (a setting, not a reload).
            webView.settings.domStorageEnabled = domStorage
            state.latestData = data
            state.onMessage = onMessage
            val key = (html ?: "") + "" + (src ?: "")
            if (state.loadedKey != key) {
                // html/src changed → (re)load; onPageFinished pushes data. The
                // new load decides the origin; until it starts nothing is allowed.
                state.loadedKey = key
                state.loaded = false
                state.allowedOrigin = null
                state.initialLoadPending = loadPyreonWebView(webView, html, src)
            } else if (state.loaded && pyreonWebViewMayDeliver(webView.url, state.allowedOrigin)) {
                // data-only change → push without reloading.
                pushPyreonData(webView, data)
            }
        },
    )
}

/** The CSS replaced-element default height the web `<iframe>` falls back to. */
internal const val PYREON_WEBVIEW_DEFAULT_HEIGHT_DP = 150

/** Pin an UNSIZED host to [PYREON_WEBVIEW_DEFAULT_HEIGHT_DP]; leave a sized one alone. */
private fun Modifier.pyreonWebViewDefaultHeight(): Modifier = layout { measurable, constraints ->
    val c = if (constraints.minHeight == 0) {
        val h = PYREON_WEBVIEW_DEFAULT_HEIGHT_DP.dp.roundToPx().coerceAtMost(constraints.maxHeight)
        constraints.copy(minHeight = h, maxHeight = h)
    } else constraints
    val placeable = measurable.measure(c)
    layout(placeable.width, placeable.height) { placeable.place(0, 0) }
}

private class PyreonWebViewState {
    var latestData: String? = null
    var loaded: Boolean = false
    var loadedKey: String? = null
    var onMessage: ((String) -> Unit)? = null
    /** The hosted WebView — a sibling relay evaluates into it. */
    var webView: WeakReference<WebView>? = null
    /** The host group this page joined (null = none). */
    var group: String? = null
    /** The origin the host's own load landed on — the only one that gets the
     *  data push and the bridge (see "Origin scope" in the file header). */
    var allowedOrigin: String? = null
    /** True from the host starting a load until that load's page starts. */
    var initialLoadPending: Boolean = false
    /** Per-view secret the main-frame shim passes with every message: the JS
     *  interface object is visible to every frame, the shim's closure is not. */
    val bridgeToken: String = java.util.UUID.randomUUID().toString()

    /** Whether the hosted main frame currently shows the allowed origin. */
    fun mainFrameAllowed(): Boolean {
        val view = webView?.get() ?: return false
        return pyreonWebViewMayDeliver(view.url, allowedOrigin)
    }

    /** The unified `window.pyreonPostMessage(...)` reverse-bridge API (mirror of
     *  the iOS WKUserScript shim), closing over this view's [bridgeToken]. */
    fun bridgeShim(): String =
        "(function(){var n=window.__pyreonNative,t=${JSONObject.quote(bridgeToken)};" +
            "window.pyreonPostMessage=function(m){n.postMessage(t,String(m));};})();"
}

/**
 * Host-group registry — group name → the hosts currently in it. Every hosted
 * page is its own realm, so two guests can never reach each other; a page that
 * posted `{"__pyreonWebViewGroup":1,"join":"g"}` receives what its group
 * siblings relay, through `window.__pyreonWebViewGroupMessage(s)`. Mirrors
 * the web `<WebView>` host and the iOS runtime byte-for-byte in protocol.
 * Members are removed by IDENTITY on leave and on `onRelease`; an emptied
 * group is dropped. Main-thread only (the JS bridge marshals first).
 */
private object PyreonWebViewGroups {
    private val members = HashMap<String, MutableSet<PyreonWebViewState>>()

    /** Consume a reserved host-group message. Returns false for ordinary traffic. */
    fun handle(message: String, from: PyreonWebViewState): Boolean {
        if (!message.startsWith("{\"__pyreonWebViewGroup\"")) return false
        val obj = try { JSONObject(message) } catch (_: Exception) { return false }
        if (obj.optInt("__pyreonWebViewGroup") != 1) return false
        val join = obj.optString("join")
        when {
            join.isNotEmpty() -> join(from, join)
            obj.optBoolean("leave") -> leave(from)
            obj.has("group") && obj.has("message") && obj.optString("group") == from.group ->
                relay(obj.optString("message"), obj.optString("group"), from)
        }
        return true
    }

    fun join(state: PyreonWebViewState, group: String) {
        if (state.group == group) return
        leave(state)
        members.getOrPut(group) { LinkedHashSet() }.add(state)
        state.group = group
    }

    fun leave(state: PyreonWebViewState) {
        val group = state.group ?: return
        state.group = null
        val set = members[group] ?: return
        set.remove(state)
        if (set.isEmpty()) members.remove(group)
    }

    private fun relay(message: String, group: String, from: PyreonWebViewState) {
        val set = members[group] ?: return
        val js = "if (typeof window.__pyreonWebViewGroupMessage === 'function') window.__pyreonWebViewGroupMessage(${JSONObject.quote(message)});"
        for (member in set) {
            if (member === from) continue
            // A sibling whose main frame left its origin gets nothing relayed.
            if (!member.mainFrameAllowed()) continue
            member.webView?.get()?.evaluateJavascript(js, null)
        }
    }
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
    fun postMessage(token: String?, message: String?) {
        if (message == null) return
        // A frame without the main-frame shim's token (any sub-frame, whatever
        // its origin) gets nothing through.
        if (!pyreonWebViewTokenMatches(state.bridgeToken, token)) return
        mainHandler.post {
            // ...and only while the main frame shows the allowed origin (read on
            // the main thread: WebView.getUrl() is main-thread only).
            if (!state.mainFrameAllowed()) return@post
            // Reserved host-group traffic is consumed and never forwarded.
            if (!PyreonWebViewGroups.handle(message, state)) state.onMessage?.invoke(message)
        }
    }
}

/** Push the latest JSON into `window.__pyreonData` + fire `pyreondata`. */
private fun pushPyreonData(webView: WebView, json: String?) {
    if (json.isNullOrEmpty()) return
    webView.evaluateJavascript(
        "window.__pyreonData = $json; window.dispatchEvent(new Event(\"pyreondata\"));",
        null,
    )
}

private const val PYREON_ASSET_BASE = "file:///android_asset/"

/**
 * `html` → `loadDataWithBaseURL` (the history URL is the base too, so
 * `getUrl()` reports the `file://` origin rather than `about:blank`); a remote
 * `http(s)` `src` → `loadUrl`; any other `src` must be a bundled asset path
 * that cannot escape the asset directory. Returns whether a load started.
 */
private fun loadPyreonWebView(webView: WebView, html: String?, src: String?): Boolean {
    if (html != null) {
        webView.loadDataWithBaseURL(PYREON_ASSET_BASE, html, "text/html", "UTF-8", PYREON_ASSET_BASE)
        return true
    }
    if (src == null) return false
    if (pyreonWebViewIsRemoteSrc(src)) {
        webView.loadUrl(src)
        return true
    }
    val asset = pyreonWebViewAssetPath(src)
    if (asset == null) {
        android.util.Log.w(
            "PyreonWebView",
            "[Pyreon] <WebView src=\"$src\">: not loaded — src must be an http(s) URL or a bundled asset path without '..' segments.",
        )
        return false
    }
    webView.loadUrl(PYREON_ASSET_BASE + asset)
    return true
}
