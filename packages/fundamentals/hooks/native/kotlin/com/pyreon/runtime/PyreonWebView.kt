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
//   A POST never reaches `shouldOverrideUrlLoading`, so the same decision is
//   applied to every http(s) main-frame request in `shouldInterceptRequest` (an
//   off-origin one gets an empty 204 and the page stays).
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
// ## Downloads (`onDownload` / `saveDownloads`)
//
// An Android WebView with no `DownloadListener` drops every download: an
// `<a download>` link, a `Content-Disposition: attachment` response and a type
// it cannot display all do nothing. The host's listener (decisions in
// PyreonWebChromePolicy.kt, run by the JVM test) applies the SAME rule as the
// iOS host (`pyreonWebViewDownloadVerdict`):
//
// - Only the MAIN frame on the allowed origin, after a USER gesture there, one
//   download per gesture, one download at a time. The listener is told neither
//   the frame nor the gesture, so the main-frame shim
//   (`pyreonWebViewDownloadShim`, closing over the bridge token a sub-frame
//   cannot read) reports each link the user activates, and the listener must
//   match one (`pyreonWebViewTakeIntent`): exactly for `blob:` / `data:` (an ad
//   iframe's blob URL can never equal a main-frame link), the newest within 5 s
//   for `http(s)` (redirects). Anything else is refused with a
//   `[Pyreon] <WebView>` log and `onDownload` is not called.
// - The name: the link's `download` attribute (from the shim — the listener
//   does not get it), then `Content-Disposition`, then the URL, cleaned to one
//   safe component of at most 255 UTF-8 bytes.
// - `saveDownloads = false`: reported to `onDownload` and left to the app.
// - Otherwise saved, and reported only once that can happen: an `http(s)` URL
//   when `DownloadManager` has queued it (public Downloads from API 29, the
//   app's own Downloads directory before that without WRITE_EXTERNAL_STORAGE;
//   a notification either way). The page's cookies go only to its own exact
//   origin: the host follows redirects itself first, because `DownloadManager`
//   repeats a request's headers on every redirect. A `blob:` / `data:` URL
//   exists only inside the page: the shim starts reading a `blob:` link AT THE
//   CLICK (the common snippet revokes it right after `a.click()`), the page
//   streams it over the bridge in 1 MB chunks into a cache file (memory stays
//   at one chunk; 256 MB cap), and the system "save as" picker
//   (`ACTION_CREATE_DOCUMENT`) lets the user choose where it goes. A read that
//   fails is not reported.
//   Nothing is written where the user can see it without the user choosing it
//   (the picker) or the system showing it (the DownloadManager notification).
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

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
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
 * `sessionStorage` work in the hosted page; `false` opts out. [onDownload] is
 * called for each download the page starts, which the host then saves for the
 * user unless [saveDownloads] is `false` (read once at creation; see
 * "Downloads" in the file header).
 */
@Composable
fun PyreonWebView(
    html: String? = null,
    src: String? = null,
    data: String? = null,
    onMessage: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
    domStorage: Boolean = true,
    onDownload: ((PyreonWebViewDownload) -> Unit)? = null,
    saveDownloads: Boolean = true,
) {
    // Per-view bridge state survives recomposition; the WebViewClient +
    // JS bridge (set once in `factory`) close over it, reading the latest
    // `data` / `onMessage` that `update` writes.
    val state = remember { PyreonWebViewState() }
    // File chooser / permission launchers must be registered at composition.
    val chrome = rememberPyreonWebChrome()
    // A delayed reload after a renderer loss must not outlive the host.
    DisposableEffect(state) { onDispose { pyreonWebViewMainHandler.removeCallbacksAndMessages(state) } }
    // A new WebView after the renderer process is gone (see `rendererGone`).
    key(state.generation.intValue) {
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
            onRelease = { view ->
                PyreonWebViewGroups.leave(state)
                // After a renderer loss the replacement may already be in `state`.
                if (state.webView?.get() === view) state.webView = null
                // A pending file chooser / permission / dialog / save must still be answered.
                chrome.release()
                // Page downloads still streaming are discarded with the view.
                state.releaseDownloads()
            },
            factory = { context ->
                pyreonNewWebView(context, pyreonHostClient(state, chrome)).apply {
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
                    addJavascriptInterface(PyreonJsBridge(state, chrome), "__pyreonNative")
                    setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                        pyreonWebViewDownloadStart(this, state, chrome, saveDownloads, url, userAgent, contentDisposition, mimeType)
                    }
                }
            },
            update = { webView ->
                // Read so a delayed reload after a renderer loss re-runs this block.
                state.reloadTick.intValue
                // Applies to documents loaded after the change (a setting, not a reload).
                webView.settings.domStorageEnabled = domStorage
                state.latestData = data
                state.onMessage = onMessage
                state.onDownload = onDownload
                val key = (html ?: "") + "" + (src ?: "")
                if (state.loadedKey != key) {
                    // html/src changed → (re)load; onPageFinished pushes data. The
                    // new load decides the origin; until it starts nothing is allowed.
                    state.loadedKey = key
                    state.pageKey = key
                    state.loaded = false
                    state.allowedOrigin = null
                    // Pending BEFORE the load starts: its first request can reach
                    // shouldInterceptRequest (another thread) before load returns.
                    state.initialLoadPending = true
                    if (!loadPyreonWebView(webView, html, src)) state.initialLoadPending = false
                } else if (state.loaded && pyreonWebViewMayDeliver(webView.url, state.allowedOrigin)) {
                    // data-only change → push without reloading.
                    pushPyreonData(webView, data)
                }
            },
        )
    }
}

/** The host's WebViewClient: origin scope (see the file header) and renderer loss. */
private fun pyreonHostClient(state: PyreonWebViewState, chrome: PyreonWebChrome): PyreonWebViewClientBase =
    object : PyreonWebViewClientBase() {
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

        // `shouldOverrideUrlLoading` is never called for a POST, so a
        // form posted to another origin would load in place (seen on an
        // API 33 emulator). Every main-frame REQUEST passes here, however
        // it was started, so the same origin policy is applied to it:
        // an off-origin one gets an empty 204, which a navigation treats
        // as "nothing to show" and stays on the current page. Only
        // http(s) requests: a POST is a network request, and a `data:`
        // document (`loadDataWithBaseURL`) also passes through here.
        // Runs on a background thread, hence the @Volatile state.
        override fun shouldInterceptRequest(
            view: WebView,
            request: android.webkit.WebResourceRequest,
        ): android.webkit.WebResourceResponse? {
            val scheme = request.url?.scheme?.lowercase()
            if (scheme != "http" && scheme != "https") return null
            val decision = pyreonWebViewNavigationDecision(
                isMainFrame = request.isForMainFrame,
                initialLoadPending = state.initialLoadPending,
                url = request.url?.toString(),
                allowedOrigin = state.allowedOrigin,
                userActivated = false,
            )
            if (decision == PyreonWebViewNavigation.ALLOW) return null
            return android.webkit.WebResourceResponse("text/plain", "utf-8", 204, "No Content", emptyMap(), null)
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
                view.evaluateJavascript(pyreonWebViewDownloadShim(state.bridgeToken), null)
            }
        }

        override fun onPageFinished(view: WebView, url: String?) {
            state.loaded = true
            if (!pyreonWebViewMayDeliver(view.url, state.allowedOrigin)) return
            view.evaluateJavascript(state.bridgeShim(), null)
            view.evaluateJavascript(pyreonWebViewDownloadShim(state.bridgeToken), null)
            pushPyreonData(view, state.latestData)
        }

        // Unhandled, a renderer that crashed or that the system killed to
        // reclaim memory takes the WHOLE app process down with it (the base
        // class answers true). Handled, this view can never be used again:
        // drop it and compose a new one, which loads the page again unless the
        // renderer keeps crashing (pyreonWebViewRendererGone).
        override fun rendererGone(view: WebView, detail: RenderProcessGoneDetail) {
            // Not `loadedKey`: a reload nulls that for the frame before `update`
            // runs, and a loss in that frame must not count as a new page.
            val key = state.pageKey
            // A reload an earlier loss scheduled is superseded by this one.
            pyreonWebViewMainHandler.removeCallbacksAndMessages(state)
            val delay = pyreonWebViewRendererGone(state.lossHistory, key, detail.didCrash(), SystemClock.uptimeMillis())
            val generation = state.lossHistory.generation
            android.util.Log.w(
                "PyreonWebView",
                "[Pyreon] <WebView>: the renderer process " +
                    (if (detail.didCrash()) "crashed" else "was killed by the system (priority at exit ${detail.rendererPriorityAtExit()})") +
                    when (delay) {
                        null -> "; it crashed ${state.lossHistory.crashes} times in a row while this view was open, so this view stays empty until its html / src changes. Every WebView in the app shares the renderer, so the page that crashed it may be another one; the renderer's own crash is in logcat."
                        0L -> "; recreating the WebView and loading the page again."
                        else -> "; recreating the WebView and loading the page again in $delay ms (losses in a row back off)."
                    },
            )
            if (state.webView?.get() === view) state.webView = null
            state.loaded = false
            state.allowedOrigin = null
            state.initialLoadPending = false
            // null → the new view's `update` loads now; unchanged → it does not.
            if (delay == 0L) state.loadedKey = null
            if (delay != null && delay > 0L) {
                pyreonWebViewMainHandler.postAtTime(
                    {
                        // Unless the host has loaded something else, or lost the renderer again, meanwhile.
                        if (state.loadedKey == key && pyreonWebViewReloadStillDue(state.lossHistory, generation)) {
                            state.loadedKey = null
                            state.reloadTick.intValue++
                        }
                    },
                    state,
                    SystemClock.uptimeMillis() + delay,
                )
            }
            (view.parent as? android.view.ViewGroup)?.removeView(view)
            view.destroy()
            state.generation.intValue++
        }
    }

/**
 * The base of EVERY WebViewClient the runtime creates. All WebViews of an app
 * share one renderer process, and when it dies each of them is told; if ANY
 * one answers false (the WebViewClient default), WebView kills the whole app
 * process. So the answer is fixed here, and a subclass only cleans up: it
 * must remove and destroy [view] and never touch it again.
 */
internal abstract class PyreonWebViewClientBase : WebViewClient() {
    final override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        rendererGone(view, detail)
        return true
    }

    protected abstract fun rendererGone(view: WebView, detail: RenderProcessGoneDetail)
}

/**
 * The ONLY place the runtime constructs a WebView, so none exists without a
 * [PyreonWebViewClientBase] (held by `webview-renderer-gone.test.ts`).
 */
internal fun pyreonNewWebView(context: Context, client: PyreonWebViewClientBase): WebView =
    WebView(context).apply { webViewClient = client }

internal val pyreonWebViewMainHandler: Handler by lazy { Handler(Looper.getMainLooper()) }

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
    /** The html/src this host shows or is about to reload; never cleared (see `rendererGone`). */
    var pageKey: String? = null
    var onMessage: ((String) -> Unit)? = null
    var onDownload: ((PyreonWebViewDownload) -> Unit)? = null
    /** `blob:` / `data:` downloads streaming in from the page, by id. Written on
     *  the JavaBridge thread, hence concurrent. At most one exists at a time (the
     *  download rule); each is removed when the page finishes or fails, and
     *  [releaseDownloads] discards what is left with the host. */
    val pageDownloads = java.util.concurrent.ConcurrentHashMap<String, PyreonPageDownload>()
    private val nextDownloadId = java.util.concurrent.atomic.AtomicInteger()
    fun newDownloadId(): String = nextDownloadId.incrementAndGet().toString()
    /** Links the user activated in the main frame (bounded; main thread only). */
    val downloadIntents = ArrayList<PyreonDownloadIntent>()
    /** Set while an allowed download is in flight or waiting for the user (main thread). */
    var downloadBusySinceMs: Long? = null

    fun releaseDownloads() {
        for (download in pageDownloads.values) download.discard()
        pageDownloads.clear()
        downloadIntents.clear()
        downloadBusySinceMs = null
    }
    /** The hosted WebView — a sibling relay evaluates into it. */
    var webView: WeakReference<WebView>? = null
    /** The host group this page joined (null = none). */
    var group: String? = null
    /** The origin the host's own load landed on — the only one that gets the
     *  data push and the bridge (see "Origin scope" in the file header). */
    @Volatile
    var allowedOrigin: String? = null
    /** True from the host starting a load until that load's page starts. */
    @Volatile
    var initialLoadPending: Boolean = false
    /** Bumped when the renderer process is gone: the host composes a new WebView. */
    val generation = mutableIntStateOf(0)
    /** Bumped when a delayed reload after a renderer loss is due. */
    val reloadTick = mutableIntStateOf(0)
    /** Renderer losses in a row (see [pyreonWebViewRendererGone]). */
    val lossHistory = PyreonRendererLossHistory()
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
private class PyreonJsBridge(private val state: PyreonWebViewState, private val chrome: PyreonWebChrome) {
    private val mainHandler = Handler(Looper.getMainLooper())

    /** The shim: the user activated a link in the main frame (see [pyreonWebViewTakeIntent]). */
    @JavascriptInterface
    fun downloadIntent(token: String?, href: String?, name: String?) {
        if (!pyreonWebViewTokenMatches(state.bridgeToken, token) || href == null) return
        val at = SystemClock.uptimeMillis()
        mainHandler.post {
            if (state.mainFrameAllowed()) pyreonWebViewRecordIntent(state.downloadIntents, PyreonDownloadIntent(href, name, at))
        }
    }

    /**
     * One base64 chunk of a page download ([pyreonWebViewDownloadFetchScript]),
     * written straight to its cache file here on the JavaBridge thread. False
     * stops the page's transfer.
     */
    @JavascriptInterface
    fun downloadChunk(token: String?, id: String?, base64: String?): Boolean {
        if (!pyreonWebViewTokenMatches(state.bridgeToken, token) || id == null || base64 == null) return false
        val download = state.pageDownloads[id] ?: return false
        val bytes = try {
            android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            download.fail("not base64")
            return false
        }
        return download.append(bytes)
    }

    /** The page finished a download's transfer (error null) or gave up (error set). */
    @JavascriptInterface
    fun downloadDone(token: String?, id: String?, mimeType: String?, error: String?) {
        if (!pyreonWebViewTokenMatches(state.bridgeToken, token) || id == null) return
        mainHandler.post {
            val download = state.pageDownloads.remove(id) ?: return@post
            val complete = download.finish()
            // Re-checked: the main frame may have left the origin meanwhile.
            if (!complete || error != null || !state.mainFrameAllowed()) {
                download.discard()
                state.downloadBusySinceMs = null
                android.util.Log.w(
                    "PyreonWebView",
                    "[Pyreon] <WebView>: the page could not hand over the download \"${download.info.filename}\" (${error ?: download.failure ?: "the page left its origin"}), so it was not saved or reported.",
                )
                return@post
            }
            val info = if (download.info.mimeType.isEmpty() && !mimeType.isNullOrEmpty()) download.info.copy(mimeType = mimeType) else download.info
            state.onDownload?.invoke(info)
            chrome.saveDownloadFile(info, download.file) { state.downloadBusySinceMs = null }
        }
    }

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

/**
 * A `blob:` / `data:` download streaming in from the page: chunks go straight
 * to [file] (a cache file), so memory stays at one chunk. Thread-safe: chunks
 * arrive on the JavaBridge thread, the end on the main thread.
 */
internal class PyreonPageDownload(val info: PyreonWebViewDownload, val file: java.io.File) {
    private val out = java.io.FileOutputStream(file)
    private var bytes = 0L
    /** Why the transfer failed, once it has. */
    @Volatile
    var failure: String? = null
        private set

    @Synchronized
    fun fail(reason: String) {
        if (failure == null) failure = reason
    }

    @Synchronized
    fun append(chunk: ByteArray): Boolean {
        if (failure != null) return false
        if (bytes + chunk.size > PYREON_WEBVIEW_PAGE_DOWNLOAD_MAX_BYTES) {
            failure = "larger than $PYREON_WEBVIEW_PAGE_DOWNLOAD_MAX_BYTES bytes"
            return false
        }
        return try {
            out.write(chunk)
            bytes += chunk.size
            true
        } catch (e: java.io.IOException) {
            failure = "the cache file cannot be written: ${e.message}"
            false
        }
    }

    /** Close the file; true when every chunk was written. */
    @Synchronized
    fun finish(): Boolean {
        try {
            out.close()
        } catch (e: java.io.IOException) {
            fail("the cache file cannot be closed: ${e.message}")
        }
        return failure == null
    }

    @Synchronized
    fun discard() {
        try {
            out.close()
        } catch (_: java.io.IOException) {
        }
        file.delete()
    }
}

/**
 * The host's `DownloadListener` (see "Downloads" in the file header): apply the
 * download rule, name the file, then report it, or save it and report it once
 * saving can happen.
 */
private fun pyreonWebViewDownloadStart(
    view: WebView,
    state: PyreonWebViewState,
    chrome: PyreonWebChrome,
    save: Boolean,
    url: String,
    userAgent: String?,
    contentDisposition: String?,
    mimeType: String?,
) {
    val route = pyreonWebViewDownloadRoute(url)
    if (route == PyreonDownloadRoute.UNSUPPORTED) {
        android.util.Log.w("PyreonWebView", "[Pyreon] <WebView>: ignored a download of \"$url\" (only http(s), blob: and data: URLs are downloaded).")
        return
    }
    val now = SystemClock.uptimeMillis()
    // The user's activation of this link in the main frame; each allows one download.
    val intent = pyreonWebViewTakeIntent(state.downloadIntents, url, route, now)
    val onOrigin = state.mainFrameAllowed()
    val verdict = pyreonWebViewDownloadVerdict(
        fromMainFrame = onOrigin,
        onAllowedOrigin = onOrigin,
        activationAgeMs = intent?.let { now - it.atMs },
        busy = pyreonWebViewDownloadBusy(state.downloadBusySinceMs, now),
    )
    if (verdict != PyreonWebViewDownloadVerdict.ALLOW) {
        val why = when (verdict) {
            PyreonWebViewDownloadVerdict.NOT_MAIN_FRAME -> "the main frame is not on the page the app loaded"
            PyreonWebViewDownloadVerdict.NO_ACTIVATION -> "no tap in the page's main frame on this link came before it (each tap allows a single download, and a sub-frame's downloads are never allowed)"
            PyreonWebViewDownloadVerdict.BUSY -> "another download is still in progress or waiting for the user"
            PyreonWebViewDownloadVerdict.ALLOW -> ""
        }
        android.util.Log.w("PyreonWebView", "[Pyreon] <WebView>: refused a download of \"$url\": $why.")
        return
    }
    val download = PyreonWebViewDownload(
        url = url,
        filename = pyreonWebViewDownloadFilename(
            intent?.name,
            pyreonContentDispositionFilename(contentDisposition),
            pyreonWebViewDownloadURLName(url),
        ),
        mimeType = mimeType.orEmpty(),
    )
    if (!save) {
        state.onDownload?.invoke(download)
        return
    }
    state.downloadBusySinceMs = now
    when (route) {
        PyreonDownloadRoute.SYSTEM -> chrome.systemDownload(download, userAgent, state.allowedOrigin) { queued ->
            state.downloadBusySinceMs = null
            if (queued) state.onDownload?.invoke(download)
        }
        PyreonDownloadRoute.PAGE -> {
            val pending = try {
                val dir = java.io.File(view.context.cacheDir, "pyreon-downloads").apply { mkdirs() }
                PyreonPageDownload(download, java.io.File.createTempFile("download-", ".part", dir))
            } catch (e: java.io.IOException) {
                state.downloadBusySinceMs = null
                android.util.Log.w("PyreonWebView", "[Pyreon] <WebView>: cannot stage the download \"${download.filename}\": ${e.message}")
                return
            }
            val id = state.newDownloadId()
            state.pageDownloads[id] = pending
            // The token goes only into the main frame of the allowed origin (checked above).
            view.evaluateJavascript(pyreonWebViewDownloadFetchScript(url, state.bridgeToken, id), null)
        }
        PyreonDownloadRoute.UNSUPPORTED -> {}
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
