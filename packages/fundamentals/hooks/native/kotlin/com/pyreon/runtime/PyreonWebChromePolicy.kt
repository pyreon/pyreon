// PyreonWebChromePolicy — the DECISIONS behind PyreonWebView's WebChromeClient
// (#3982), kept free of `android.*` imports on purpose.
//
// `PyreonWebView.kt` needs the real Android SDK (WebView, ActivityResult,
// AlertDialog), so nothing but a device build verifies it. The parts that are
// policy rather than plumbing — which MIME types a file input asks for, whether
// it wants the camera, which runtime permission a `getUserMedia` resource
// needs, which URLs a page may hand to the system, and the "answer every
// callback exactly once" bookkeeping WebView is unforgiving about — live here,
// where the stub-only `kotlinc` gate compiles them and the plain-JVM test
// suite RUNS them (`PyreonWebChromePolicyTest.kt`). Same split as
// PyreonGeolocation / PyreonGeolocationAndroid.

package com.pyreon.runtime

/** What a `capture` file input asks the camera for. */
enum class PyreonCaptureKind { IMAGE, VIDEO }

/** How to answer one `onShowFileChooser`. */
data class PyreonFileChooserPlan(
    /** MIME types for the document picker — never empty (the any-type wildcard when the page accepts anything). */
    val mimeTypes: List<String>,
    val multiple: Boolean,
    /** Non-null when the page asked for the camera (`capture`) AND every accepted type is that media. */
    val capture: PyreonCaptureKind?,
)

/**
 * Normalise a page's `accept` list into picker MIME types and decide capture.
 *
 * `acceptTypes` is `FileChooserParams.getAcceptTypes()`: individual tokens, but
 * a token may still carry a comma-joined list, an extension (`.pdf`) or be
 * empty — `<input type=file>` with no `accept` arrives as `[""]`. Extensions go
 * through [mimeForExtension] (`MimeTypeMap` on device) and are dropped when it
 * has no answer; the picker cannot filter by extension. Capture is honoured only
 * when every type is image (or every type is video) — the camera cannot produce
 * "an image or a PDF", and for anything else the page gets the picker, as
 * Chrome on Android does.
 */
fun pyreonFileChooserPlan(
    acceptTypes: List<String>,
    multiple: Boolean,
    captureEnabled: Boolean,
    mimeForExtension: (String) -> String?,
): PyreonFileChooserPlan {
    val mimes = LinkedHashSet<String>()
    for (raw in acceptTypes) {
        for (token in raw.split(',')) {
            val t = token.trim().lowercase()
            when {
                t.isEmpty() -> {}
                t.startsWith(".") -> mimeForExtension(t.substring(1))?.lowercase()?.let { mimes.add(it) }
                t.contains('/') -> mimes.add(t)
            }
        }
    }
    val list = if (mimes.isEmpty()) listOf("*/*") else mimes.toList()
    val capture = when {
        !captureEnabled -> null
        list.all { it.startsWith("image/") } -> PyreonCaptureKind.IMAGE
        list.all { it.startsWith("video/") } -> PyreonCaptureKind.VIDEO
        else -> null
    }
    return PyreonFileChooserPlan(list, multiple, capture)
}

/** `PermissionRequest.RESOURCE_VIDEO_CAPTURE` (a string constant on the SDK). */
const val PYREON_RESOURCE_VIDEO_CAPTURE = "android.webkit.resource.VIDEO_CAPTURE"

/** `PermissionRequest.RESOURCE_AUDIO_CAPTURE`. */
const val PYREON_RESOURCE_AUDIO_CAPTURE = "android.webkit.resource.AUDIO_CAPTURE"

const val PYREON_PERMISSION_CAMERA = "android.permission.CAMERA"
const val PYREON_PERMISSION_RECORD_AUDIO = "android.permission.RECORD_AUDIO"
const val PYREON_PERMISSION_FINE_LOCATION = "android.permission.ACCESS_FINE_LOCATION"
const val PYREON_PERMISSION_COARSE_LOCATION = "android.permission.ACCESS_COARSE_LOCATION"

/** The location permissions, either of which lets a page have a position. */
val PYREON_LOCATION_PERMISSIONS: List<String> =
    listOf(PYREON_PERMISSION_FINE_LOCATION, PYREON_PERMISSION_COARSE_LOCATION)

/**
 * The runtime permission each `getUserMedia` resource needs. Resources with no
 * mapping (protected media id, MIDI sysex) are absent, and are therefore never
 * granted — granting a capability nobody asked the user about would be worse
 * than the page's request failing.
 */
fun pyreonPermissionForResource(resource: String): String? = when (resource) {
    PYREON_RESOURCE_VIDEO_CAPTURE -> PYREON_PERMISSION_CAMERA
    PYREON_RESOURCE_AUDIO_CAPTURE -> PYREON_PERMISSION_RECORD_AUDIO
    else -> null
}

/** The subset of [requested] resources whose permission is in [granted]. */
fun pyreonGrantableResources(requested: List<String>, granted: Set<String>): List<String> =
    requested.filter { r -> pyreonPermissionForResource(r)?.let { it in granted } == true }

/** A short human phrase for the resources a page asked for, for the consent dialog. */
fun pyreonDescribeResources(resources: List<String>): String {
    val camera = PYREON_RESOURCE_VIDEO_CAPTURE in resources
    val mic = PYREON_RESOURCE_AUDIO_CAPTURE in resources
    return when {
        camera && mic -> "your camera and microphone"
        camera -> "your camera"
        mic -> "your microphone"
        else -> "a device capability"
    }
}

/**
 * Schemes a page may hand to the SYSTEM through `window.open` /
 * `target="_blank"`. Identical to the iOS host's list. Everything else is
 * refused: `javascript:` and `file:` have no business leaving the view,
 * `intent:` can address any exported component of any installed app, and a
 * custom scheme would let a hosted page launch arbitrary apps.
 */
val PYREON_EXTERNAL_SCHEMES: Set<String> = setOf("http", "https", "mailto", "tel", "sms")

/** Whether [url] may be opened outside the view (see [PYREON_EXTERNAL_SCHEMES]). */
fun pyreonMayOpenExternally(url: String?): Boolean {
    if (url == null) return false
    val colon = url.indexOf(':')
    if (colon <= 0) return false
    return url.substring(0, colon).lowercase() in PYREON_EXTERNAL_SCHEMES
}

/**
 * The host of an origin / URL for a dialog title (`https://a.example:8443/x` →
 * `a.example`), or null for an origin with no host (`file://`, inline html) —
 * the same title rule the iOS host and Safari use.
 */
fun pyreonOriginHost(origin: String?): String? {
    if (origin == null) return null
    val afterScheme = origin.indexOf("://").let { if (it < 0) return null else origin.substring(it + 3) }
    val authority = afterScheme.substringBefore('/').substringBefore('?').substringBefore('#')
    val host = authority.substringAfterLast('@').let { a ->
        if (a.startsWith("[")) a.substringBefore(']') + "]" else a.substringBefore(':')
    }
    return host.ifEmpty { null }
}

// ── Origin scope — mirror of the iOS host (see "Origin scope" in
//    PyreonWebView.kt). `data` and the reverse bridge belong to the page the
//    APP loaded, as on the web, where the host reaches only same-origin frames.

/**
 * An origin as `scheme://host[:port]`, lower-cased, default ports dropped.
 * `file:` is one origin (`file://`, the bundled app content). Anything else
 * without an `http(s)` host (`about:`, `data:`, `blob:`, `javascript:`, a
 * custom scheme, an unparsable string) is OPAQUE: null, never allowed.
 */
fun pyreonWebViewOrigin(url: String?): String? {
    if (url.isNullOrEmpty()) return null
    val uri = try { java.net.URI(url) } catch (_: Exception) { return null }
    val scheme = uri.scheme?.lowercase() ?: return null
    if (scheme == "file") return "file://"
    if (scheme != "http" && scheme != "https") return null
    val host = uri.host?.lowercase()?.ifEmpty { null } ?: return null
    val defaultPort = if (scheme == "https") 443 else 80
    val port = uri.port
    return if (port > 0 && port != defaultPort) "$scheme://$host:$port" else "$scheme://$host"
}

/** What to do with a main-frame navigation. */
enum class PyreonWebViewNavigation { ALLOW, CANCEL, OPEN_EXTERNALLY }

/**
 * The navigation policy. A sub-frame navigates freely (it never gets the bridge
 * or the data). The main frame may go anywhere while the load the HOST started
 * is pending (its server redirects), and afterwards only within the origin that
 * load committed to. A user-activated main-frame link off it is handed to the
 * system (as `window.open` is); anything else is cancelled.
 */
fun pyreonWebViewNavigationDecision(
    isMainFrame: Boolean,
    initialLoadPending: Boolean,
    url: String?,
    allowedOrigin: String?,
    userActivated: Boolean,
): PyreonWebViewNavigation {
    if (!isMainFrame || initialLoadPending) return PyreonWebViewNavigation.ALLOW
    if (allowedOrigin != null && pyreonWebViewOrigin(url) == allowedOrigin) return PyreonWebViewNavigation.ALLOW
    if (userActivated && pyreonMayOpenExternally(url)) return PyreonWebViewNavigation.OPEN_EXTERNALLY
    return PyreonWebViewNavigation.CANCEL
}

/** Whether a document at [url] (the MAIN frame's) may get the data and the bridge. */
fun pyreonWebViewMayDeliver(url: String?, allowedOrigin: String?): Boolean {
    if (allowedOrigin == null) return false
    return pyreonWebViewOrigin(url) == allowedOrigin
}

/**
 * The bridge token check: `addJavascriptInterface` exposes the bridge object to
 * EVERY frame, so the main-frame-only shim carries a per-view secret that a
 * cross-origin sub-frame cannot read. Constant-time so a guessing frame learns
 * nothing from timing.
 */
fun pyreonWebViewTokenMatches(expected: String, given: String?): Boolean {
    if (given == null || given.length != expected.length) return false
    var diff = 0
    for (i in expected.indices) diff = diff or (expected[i].code xor given[i].code)
    return diff == 0
}

/**
 * A `src` that names a BUNDLED asset: a relative path with no `..` / `.` /
 * empty segment, no scheme and no backslash (also after percent-decoding).
 * null when it would escape `file:///android_asset/`.
 *
 * The check runs on the string, but the WebView loads a URL, and the URL
 * parser DELETES tab / CR / LF anywhere and TRIMS C0 controls and spaces at the
 * end: `.\t./x` reaches it as `../x` (#52, reproduced on an API 33 emulator).
 * So a name with a C0 control or DEL anywhere, or a space at either end, is
 * refused too: the string checked is then the path the parser sees.
 */
fun pyreonWebViewAssetPath(src: String): String? {
    if (src.isEmpty() || src.startsWith("/") || src.contains('\\') || src.contains(':')) return null
    if (pyreonWebViewParserRewrites(src)) return null
    val decoded = try { java.net.URLDecoder.decode(src.replace("+", "%2B"), "UTF-8") } catch (_: Exception) { return null }
    if (decoded.contains('\\') || decoded.contains(':') || pyreonWebViewParserRewrites(decoded)) return null
    if (decoded.split('/').any { it == ".." || it == "." || it.isEmpty() }) return null
    return src
}

/** Whether the URL parser would delete or trim part of [s] (see [pyreonWebViewAssetPath]). */
private fun pyreonWebViewParserRewrites(s: String): Boolean =
    s.any { it < ' ' || it == '\u007f' } || s.first() == ' ' || s.last() == ' '

/** Renderer crashes in one window after which a host stops reloading and stays empty. */
internal const val PYREON_WEBVIEW_MAX_RENDERER_CRASH_RELOADS = 2

/** Two renderer losses less than this apart are "in a row"; a longer gap starts a new count. */
internal const val PYREON_WEBVIEW_RENDERER_LOSS_WINDOW_MS = 60_000L

/** Reload delay after the second loss in a row; it doubles per loss, up to the maximum. */
internal const val PYREON_WEBVIEW_RENDERER_BACKOFF_BASE_MS = 1_000L
internal const val PYREON_WEBVIEW_RENDERER_BACKOFF_MAX_MS = 30_000L

/** One host's renderer losses in the current window (see [pyreonWebViewRendererGone]). */
internal class PyreonRendererLossHistory {
    /** The `html` / `src` the count belongs to; another one is a new page with a fresh count. */
    var key: String? = null
    /** Bumped per loss: a delayed reload whose generation is no longer current must not run. */
    var generation: Int = 0
    var lastAtMs: Long? = null
    var crashes: Int = 0
    var losses: Int = 0
}

/**
 * What a host does after its renderer process is gone: the reload delay in
 * milliseconds, or null to stay empty. The dead view is dropped either way:
 * Android WebView kills the WHOLE app process when ANY WebView returns false
 * from `onRenderProcessGone`, and a handled view can never be used again.
 *
 * - Losses less than [PYREON_WEBVIEW_RENDERER_LOSS_WINDOW_MS] apart count as
 *   in a row; a longer gap (the page stayed up) starts a new count. A count
 *   does NOT restart on a finished load: a page that crashes its renderer
 *   right after loading would otherwise reload forever.
 * - A crash (`didCrash`) beyond [PYREON_WEBVIEW_MAX_RENDERER_CRASH_RELOADS]
 *   in a row: stay empty. Every WebView of the app shares one renderer and
 *   each is told it crashed, so this host's page is not necessarily the cause.
 * - A system kill (it reclaimed memory) always reloads.
 * - Either way the first loss reloads at once and each further one in a row
 *   waits twice as long (from [PYREON_WEBVIEW_RENDERER_BACKOFF_BASE_MS] to
 *   [PYREON_WEBVIEW_RENDERER_BACKOFF_MAX_MS]), so sustained memory pressure
 *   cannot churn renderer starts.
 * - A different [key] (the host was given another `html` / `src`) is a new
 *   page: its count starts fresh, even after the cap emptied the old one. A
 *   null [key] (no page known) never counts as a new page.
 * - Each loss bumps `history.generation`; a reload scheduled by an earlier
 *   loss must check [pyreonWebViewReloadStillDue] and not run, so a newer loss
 *   (with its longer delay, or its "stay empty") always wins.
 */
internal fun pyreonWebViewRendererGone(history: PyreonRendererLossHistory, key: String?, didCrash: Boolean, nowMs: Long): Long? {
    history.generation++
    val last = history.lastAtMs
    if ((key != null && key != history.key) || last == null || nowMs - last >= PYREON_WEBVIEW_RENDERER_LOSS_WINDOW_MS) {
        if (key != null) history.key = key
        history.crashes = 0
        history.losses = 0
    }
    history.lastAtMs = nowMs
    history.losses++
    if (didCrash) {
        history.crashes++
        if (history.crashes > PYREON_WEBVIEW_MAX_RENDERER_CRASH_RELOADS) return null
    }
    if (history.losses <= 1) return 0L
    val doublings = (history.losses - 2).coerceAtMost(15)
    return (PYREON_WEBVIEW_RENDERER_BACKOFF_BASE_MS shl doublings).coerceAtMost(PYREON_WEBVIEW_RENDERER_BACKOFF_MAX_MS)
}

/** Whether a reload scheduled at loss [generation] may still run (no newer loss since). */
internal fun pyreonWebViewReloadStillDue(history: PyreonRendererLossHistory, generation: Int): Boolean =
    history.generation == generation

// MARK: Load outcome — `onLoad` / `onError` (#4827). Mirror of the iOS host.

/**
 * What `<WebView onError>` receives. [kind] is the cross-platform part:
 * `"load"` (the main-frame document could not be loaded: offline, DNS, refused,
 * TLS), `"http"` (the server answered with a status of 400 or more; [code] is
 * the status) or `"crash"` (the renderer kept dying and the host stopped
 * reloading). [code] is otherwise the platform's own (`WebViewClient.ERROR_*`
 * here, an `NSURLError` code on iOS).
 */
data class PyreonWebViewError(val kind: String, val code: Int, val description: String, val url: String)

/** The name app code uses (`(e: WebViewError) => …` in a named handler lowers to this type). */
typealias WebViewError = PyreonWebViewError

internal const val PYREON_WEBVIEW_ERROR_LOAD = "load"
internal const val PYREON_WEBVIEW_ERROR_HTTP = "http"
internal const val PYREON_WEBVIEW_ERROR_CRASH = "crash"

/**
 * Whether a resource error is the app's business: the MAIN frame only (a failed
 * image or XHR is the page's), and never a cancellation. A navigation the host
 * cancels (`shouldOverrideUrlLoading` → true, a link handed to the system) or a
 * load superseded by another one reports `net::ERR_ABORTED`.
 */
fun pyreonWebViewReportsLoadError(isMainFrame: Boolean, description: String?): Boolean =
    isMainFrame && description != "net::ERR_ABORTED"

/** Whether a main-frame response status is a failed load. */
fun pyreonWebViewIsHttpError(status: Int): Boolean = status >= 400

/**
 * Whether a finished main-frame page is a LOAD for `onLoad`. Android finishes
 * a failed page too (showing its error page), so the host remembers the URL
 * the last error was for; the order of `onPageStarted` and `onReceivedError`
 * is not guaranteed, so a URL is kept rather than a flag reset on start.
 * A same-document navigation (a hash or `pushState` route) also finishes
 * without starting a page ([documentStarted] false): not a load, as on iOS,
 * where `didFinish` comes only for a new document.
 */
fun pyreonWebViewFinishedIsLoad(finishedUrl: String?, failedUrl: String?, documentStarted: Boolean): Boolean =
    documentStarted && (failedUrl == null || finishedUrl != failedUrl)

/**
 * Whether system Back goes back in the page's history: only when the host
 * opted in (`backNavigation`, on by default for a `grow` view) and the page
 * has somewhere to go back to, so at the first page Back still leaves the
 * screen (the router pops, or the activity finishes).
 */
fun pyreonWebViewHandlesBack(backNavigation: Boolean, canGoBack: Boolean): Boolean = backNavigation && canGoBack

/** The load key: a change of html, src or reloadKey loads the page again. */
fun pyreonWebViewLoadKey(html: String?, src: String?, reloadKey: String?): String =
    (html ?: "") + "\u0001" + (src ?: "") + "\u0001" + (reloadKey ?: "")

/** A `src` that names a remote page: `http(s)` with a host. */
fun pyreonWebViewIsRemoteSrc(src: String): Boolean {
    val uri = try { java.net.URI(src) } catch (_: Exception) { return false }
    val scheme = uri.scheme?.lowercase() ?: return false
    return (scheme == "http" || scheme == "https") && !uri.host.isNullOrEmpty()
}

/**
 * A callback WebView requires to be answered EXACTLY once. `onShowFileChooser`
 * is the sharp case: a `ValueCallback` that is never answered leaves the page's
 * file input dead until the view is recreated, so a new request must first
 * cancel a still-pending one, and teardown must cancel whatever is left.
 */
class PyreonOnceSlot<T> {
    private var pending: ((T?) -> Unit)? = null

    val isPending: Boolean get() = pending != null

    /** Hold [answer]; a still-pending previous answer is cancelled (null) first. */
    fun hold(answer: (T?) -> Unit) {
        val previous = pending
        pending = answer
        previous?.invoke(null)
    }

    /** Answer the pending callback with [value]; a no-op when nothing is pending. */
    fun deliver(value: T?) {
        val p = pending ?: return
        pending = null
        p(value)
    }

    fun cancel() = deliver(null)
}

/**
 * Serialises runtime-permission requests. The Activity Result API allows one
 * `RequestMultiplePermissions` launch at a time per launcher, and a page can
 * ask for location and camera back to back, so requests queue and each one is
 * answered with the system's verdict for exactly the permissions it asked for.
 * [launch] starts the system request; the host calls [deliver] with its result.
 */
class PyreonPermissionQueue(private val launch: (List<String>) -> Unit) {
    private class Pending(val permissions: List<String>, val onResult: (Set<String>) -> Unit)

    private val queue = ArrayDeque<Pending>()
    private var inFlight: Pending? = null

    /** Ask for [permissions]; [onResult] receives the subset that was granted. */
    fun request(permissions: List<String>, onResult: (Set<String>) -> Unit) {
        if (permissions.isEmpty()) {
            onResult(emptySet())
            return
        }
        queue.addLast(Pending(permissions, onResult))
        pump()
    }

    /** The system's answer for the in-flight request (permission → granted). */
    fun deliver(result: Map<String, Boolean>) {
        val p = inFlight ?: return
        inFlight = null
        p.onResult(p.permissions.filter { result[it] == true }.toSet())
        pump()
    }

    /** Teardown: every waiting request is answered "nothing granted". */
    fun cancelAll() {
        val all = listOfNotNull(inFlight) + queue
        inFlight = null
        queue.clear()
        for (p in all) p.onResult(emptySet())
    }

    private fun pump() {
        if (inFlight != null) return
        val next = queue.removeFirstOrNull() ?: return
        inFlight = next
        launch(next.permissions)
    }
}

// ---- Downloads (#4828) ----------------------------------------------------------
//
// The decisions behind PyreonWebView's DownloadListener. Same naming rule, the
// same download rule and the same `PyreonWebViewDownload` shape as the iOS host
// (PyreonWebView.swift).

/** A download the hosted page started — mirror of the Swift `PyreonWebViewDownload`. */
data class PyreonWebViewDownload(
    /** The URL being downloaded: `http(s)`, or a `blob:` / `data:` URL the page created. */
    val url: String,
    /** A file name safe to write (see [pyreonWebViewDownloadFilename]). */
    val filename: String,
    /** The MIME type, or "" when it is not known. */
    val mimeType: String,
)

/** How a download's bytes are obtained. */
enum class PyreonDownloadRoute {
    /** `http(s)`: the system `DownloadManager` fetches it. */
    SYSTEM,
    /** `blob:` / `data:`: only the page can read it, so the page streams it over in chunks. */
    PAGE,
    /** Anything else (`file:`, `javascript:`, a custom scheme): not downloaded. */
    UNSUPPORTED,
}

fun pyreonWebViewDownloadRoute(url: String?): PyreonDownloadRoute =
    when (url?.substringBefore(':', "")?.lowercase()) {
        "http", "https" -> PyreonDownloadRoute.SYSTEM
        "blob", "data" -> PyreonDownloadRoute.PAGE
        else -> PyreonDownloadRoute.UNSUPPORTED
    }

/**
 * The largest `blob:` / `data:` download the page streams over. It crosses in
 * [PYREON_WEBVIEW_PAGE_DOWNLOAD_CHUNK_BYTES] pieces written straight to a cache
 * file, so memory stays at about one chunk whatever the size; the cap bounds
 * the DISK the cache copy takes until the user has saved it.
 */
const val PYREON_WEBVIEW_PAGE_DOWNLOAD_MAX_BYTES: Long = 256L * 1024 * 1024

/** One piece of a page download (~1.4 MB of base64 text across the bridge). */
const val PYREON_WEBVIEW_PAGE_DOWNLOAD_CHUNK_BYTES: Int = 1024 * 1024

/** The space characters trimmed from a name's ends (identical list in Swift). */
val PYREON_WEBVIEW_NAME_TRIM: Set<Int> = setOf(
    0x20, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
    0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000, 0xFEFF,
)

/** The most UTF-8 bytes a saved name may take. */
const val PYREON_WEBVIEW_NAME_MAX_BYTES = 255

/**
 * The name a download is saved under: the first candidate that is still a name
 * after cleaning, else "download". Cleaning keeps ONE safe path component, by
 * the same rule as the Swift host:
 *
 * - `/`, `\`, `:`, C0 and C1 controls and DEL become `_`;
 * - bidi marks, embeddings, overrides and isolates (U+200E/F, U+202A–202E,
 *   U+2066–2069) are removed, so `photo‮gpj.apk` cannot pose as a JPEG;
 * - the [PYREON_WEBVIEW_NAME_TRIM] spaces go from both ends, then leading dots;
 * - a name of only `_` is no name;
 * - at most [PYREON_WEBVIEW_NAME_MAX_BYTES] UTF-8 BYTES, keeping a short
 *   extension and cutting the rest on a grapheme boundary.
 */
fun pyreonWebViewDownloadFilename(vararg candidates: String?): String {
    for (candidate in candidates) {
        if (candidate == null) continue
        val cleaned = pyreonCleanFilename(candidate)
        if (cleaned.isNotEmpty()) return cleaned
    }
    return "download"
}

private fun pyreonIsBidiControl(cp: Int): Boolean =
    cp == 0x200E || cp == 0x200F || cp in 0x202A..0x202E || cp in 0x2066..0x2069

private fun pyreonTrimName(s: String): String {
    var start = 0
    var end = s.length
    while (start < end && s.codePointAt(start) in PYREON_WEBVIEW_NAME_TRIM) start += Character.charCount(s.codePointAt(start))
    while (end > start && s.codePointBefore(end) in PYREON_WEBVIEW_NAME_TRIM) end -= Character.charCount(s.codePointBefore(end))
    return s.substring(start, end)
}

private fun utf8Size(s: String): Int = s.toByteArray(Charsets.UTF_8).size

private fun pyreonCleanFilename(raw: String): String {
    val sb = StringBuilder(raw.length)
    var i = 0
    while (i < raw.length) {
        val cp = raw.codePointAt(i)
        i += Character.charCount(cp)
        if (pyreonIsBidiControl(cp)) continue
        if (cp < 0x20 || cp == 0x7F || cp in 0x80..0x9F || cp == '/'.code || cp == '\\'.code || cp == ':'.code) {
            sb.append('_')
        } else {
            sb.appendCodePoint(cp)
        }
    }
    var name = pyreonTrimName(sb.toString())
    name = pyreonTrimName(name.trimStart('.'))
    if (name.all { it == '_' }) return ""
    if (utf8Size(name) > PYREON_WEBVIEW_NAME_MAX_BYTES) {
        val dot = name.lastIndexOf('.')
        val ext = if (dot > 0 && dot < name.length - 1 && utf8Size(name.substring(dot)) <= 32) name.substring(dot) else ""
        val stem = name.substring(0, name.length - ext.length)
        val budget = PYREON_WEBVIEW_NAME_MAX_BYTES - utf8Size(ext)
        val graphemes = java.text.BreakIterator.getCharacterInstance()
        graphemes.setText(stem)
        var cut = 0
        var bytes = 0
        var start = graphemes.first()
        var next = graphemes.next()
        while (next != java.text.BreakIterator.DONE) {
            val size = utf8Size(stem.substring(start, next))
            if (bytes + size > budget) break
            bytes += size
            cut = next
            start = next
            next = graphemes.next()
        }
        name = stem.substring(0, cut) + ext
    }
    return name
}

/** The last path segment of an `http(s)` / `file` URL; null for `blob:` / `data:` (no name there). */
fun pyreonWebViewDownloadURLName(url: String?): String? {
    if (url == null) return null
    val scheme = url.substringBefore(':', "").lowercase()
    if (scheme != "http" && scheme != "https" && scheme != "file") return null
    val afterAuthority = url.substringAfter("://", "").let { rest -> rest.indexOf('/').let { if (it < 0) "" else rest.substring(it) } }
    val path = afterAuthority.substringBefore('?').substringBefore('#')
    val last = path.substringAfterLast('/')
    if (last.isEmpty()) return null
    return pyreonPercentDecode(last, Charsets.UTF_8) ?: last
}

/**
 * The file name a `Content-Disposition` header carries: `filename*` (RFC 6266 /
 * 5987, percent-encoded in the named charset) wins over `filename` (quoted with
 * backslash escapes, or a bare token). Null when it names none.
 */
fun pyreonContentDispositionFilename(header: String?): String? {
    if (header.isNullOrBlank()) return null
    val extended = Regex("""(?i)(?:^|;)\s*filename\*\s*=\s*([^';\s]*)'[^']*'([^;\s]+)""").find(header)
    if (extended != null) {
        val charset = try {
            java.nio.charset.Charset.forName(extended.groupValues[1].ifEmpty { "UTF-8" })
        } catch (e: Exception) {
            null
        }
        val decoded = charset?.let { pyreonPercentDecode(extended.groupValues[2], it) }
        if (!decoded.isNullOrEmpty()) return decoded
    }
    val plain = Regex("""(?i)(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]+))""").find(header) ?: return null
    val quoted = plain.groups[1]?.value
    val value = quoted?.replace(Regex("""\\(.)"""), "$1") ?: plain.groupValues[2].trim()
    return value.ifEmpty { null }
}

/** `%XX` decoding to bytes in [charset] (no `+` → space: that is form encoding). Null when malformed. */
private fun pyreonPercentDecode(s: String, charset: java.nio.charset.Charset): String? {
    if (!s.contains('%')) return s
    val out = java.io.ByteArrayOutputStream()
    var i = 0
    while (i < s.length) {
        val c = s[i]
        if (c == '%') {
            if (i + 2 >= s.length) return null
            val byte = s.substring(i + 1, i + 3).toIntOrNull(16) ?: return null
            out.write(byte)
            i += 3
        } else {
            out.write(c.toString().toByteArray(Charsets.UTF_8))
            i++
        }
    }
    return String(out.toByteArray(), charset)
}

/**
 * Whether `DownloadManager` may write to the PUBLIC Downloads folder: always
 * from Android 10 (API 29), before that only with `WRITE_EXTERNAL_STORAGE`.
 * Otherwise the file goes to the app's own external Downloads directory, which
 * the system download list and notification still open.
 */
fun pyreonDownloadToPublicDir(sdkInt: Int, hasWriteExternalStorage: Boolean): Boolean =
    sdkInt >= 29 || hasWriteExternalStorage

/**
 * Whether the page's cookies go with a request for [url]: only to the exact
 * origin the host's page is on (an `http(s)` one). `DownloadManager` repeats a
 * request's headers on every redirect, so the host resolves redirects itself
 * first and asks this for each hop and for the final URL.
 */
fun pyreonDownloadCookieAllowed(url: String?, allowedOrigin: String?): Boolean {
    if (allowedOrigin == null || !allowedOrigin.startsWith("http")) return false
    return pyreonWebViewOrigin(url) == allowedOrigin
}

// ---- The download rule -----------------------------------------------------------
//
// Same rule as the iOS host: a download needs the MAIN frame on the allowed
// origin, a fresh UNUSED user gesture there, and no other download in flight.
// Android's DownloadListener says neither which frame started a download nor
// whether a user did, so the main-frame shim reports each link a user activated
// ([PyreonDownloadIntent], through the token-checked bridge a sub-frame cannot
// use) and the listener matches the download against them.

/** How long a user gesture in the main frame allows a download. */
const val PYREON_WEBVIEW_ACTIVATION_WINDOW_MS: Long = 5_000
/** A download still "in flight" after this long no longer blocks the next one. */
const val PYREON_WEBVIEW_DOWNLOAD_BUSY_STALE_MS: Long = 120_000
/** The most link activations remembered per host. */
const val PYREON_WEBVIEW_MAX_DOWNLOAD_INTENTS = 8

/** Why a download was allowed or refused — mirror of the Swift verdict. */
enum class PyreonWebViewDownloadVerdict { ALLOW, NOT_MAIN_FRAME, NO_ACTIVATION, BUSY }

fun pyreonWebViewDownloadVerdict(
    fromMainFrame: Boolean,
    onAllowedOrigin: Boolean,
    activationAgeMs: Long?,
    busy: Boolean,
): PyreonWebViewDownloadVerdict {
    if (!fromMainFrame || !onAllowedOrigin) return PyreonWebViewDownloadVerdict.NOT_MAIN_FRAME
    if (activationAgeMs == null || activationAgeMs < 0 || activationAgeMs > PYREON_WEBVIEW_ACTIVATION_WINDOW_MS) {
        return PyreonWebViewDownloadVerdict.NO_ACTIVATION
    }
    return if (busy) PyreonWebViewDownloadVerdict.BUSY else PyreonWebViewDownloadVerdict.ALLOW
}

/** Whether a download that started at [sinceMs] still blocks a new one. */
fun pyreonWebViewDownloadBusy(sinceMs: Long?, nowMs: Long): Boolean =
    sinceMs != null && nowMs - sinceMs < PYREON_WEBVIEW_DOWNLOAD_BUSY_STALE_MS

/** A link the user activated in the main frame: its href, its `download` name (null without the attribute), when. */
data class PyreonDownloadIntent(val href: String, val name: String?, val atMs: Long)

/** Remember [intent], keeping the newest [PYREON_WEBVIEW_MAX_DOWNLOAD_INTENTS]. */
fun pyreonWebViewRecordIntent(intents: MutableList<PyreonDownloadIntent>, intent: PyreonDownloadIntent) {
    intents.add(intent)
    while (intents.size > PYREON_WEBVIEW_MAX_DOWNLOAD_INTENTS) intents.removeAt(0)
}

/**
 * The activation a download of [url] consumes, removed from [intents] (each
 * allows ONE download), or null. Expired ones are dropped. A `blob:` / `data:`
 * download must match the activated link EXACTLY: such a URL is minted by the
 * frame that downloads it, so a sub-frame's can never equal a main-frame link.
 * An `http(s)` one prefers the exact link and otherwise takes the newest
 * activation, because a server may redirect the link to the file.
 */
fun pyreonWebViewTakeIntent(
    intents: MutableList<PyreonDownloadIntent>,
    url: String,
    route: PyreonDownloadRoute,
    nowMs: Long,
): PyreonDownloadIntent? {
    intents.removeAll { nowMs - it.atMs > PYREON_WEBVIEW_ACTIVATION_WINDOW_MS || nowMs < it.atMs }
    val exact = intents.lastOrNull { it.href == url }
    val taken = exact ?: if (route == PyreonDownloadRoute.SYSTEM) intents.lastOrNull() else null
    if (taken != null) intents.remove(taken)
    return taken
}

/** A JS string literal for [s] (double-quoted; safe inside evaluated script). */
fun pyreonJsString(s: String): String {
    val sb = StringBuilder(s.length + 2).append('"')
    for (c in s) {
        when {
            c == '"' -> sb.append("\\\"")
            c == '\\' -> sb.append("\\\\")
            c == '\n' -> sb.append("\\n")
            c == '\r' -> sb.append("\\r")
            c == '\t' -> sb.append("\\t")
            c.code < 0x20 || c == ' ' || c == ' ' || c == '<' ->
                sb.append("\\u").append(String.format("%04x", c.code))
            else -> sb.append(c)
        }
    }
    return sb.append('"').toString()
}

/**
 * The main-frame download shim, evaluated with the bridge shim (closing over
 * the same per-view token). For every link the USER activates — a trusted
 * click on it, or `a.click()` while the page has transient user activation
 * (`navigator.userActivation.isActive`; covers a link the page never attached)
 * — it reports `downloadIntent(token, href, downloadName)`. For a `blob:` link
 * with a `download` attribute it also starts reading the blob AT ONCE, in the
 * same task as the click: the common export snippet revokes the URL right after
 * `a.click()`, long before the host's listener runs. The read is kept (at most
 * 4, for 60 s) for [pyreonWebViewDownloadFetchScript].
 */
fun pyreonWebViewDownloadShim(token: String): String =
    "(function(){if(window.__pyreonDownloadShim)return;" +
        "Object.defineProperty(window,'__pyreonDownloadShim',{value:1});" +
        "var n=window.__pyreonNative,t=${pyreonJsString(token)},B=new Map();" +
        "Object.defineProperty(window,'__pyreonDownloadBlobs',{value:B});" +
        "function act(e){var u=navigator.userActivation;return !!((e&&e.isTrusted)||(u&&u.isActive));}" +
        "function r(a,e){try{if(!a||!a.href||!act(e))return;var h=String(a.href)," +
        "d=a.hasAttribute('download')?a.getAttribute('download'):null;" +
        "if(d!==null&&h.slice(0,5)==='blob:'&&!B.has(h)){var p=fetch(h).then(function(x){return x.blob();});" +
        "p.catch(function(){});B.set(h,p);setTimeout(function(){B.delete(h);},60000);" +
        "if(B.size>4)B.delete(B.keys().next().value);}" +
        "n.downloadIntent(t,h,d);}catch(x){}}" +
        "document.addEventListener('click',function(e){var a=e.target;while(a&&a.nodeName!=='A')a=a.parentNode;if(a)r(a,e);},true);" +
        "var c=HTMLAnchorElement.prototype.click;" +
        "HTMLAnchorElement.prototype.click=function(){r(this,null);return c.apply(this,arguments);};})();"

/**
 * Script that streams a `blob:` / `data:` download from the page: the read the
 * shim started at click time (or a new one), then
 * `downloadChunk(token, id, base64)` per [PYREON_WEBVIEW_PAGE_DOWNLOAD_CHUNK_BYTES]
 * (false stops it) and `downloadDone(token, id, type, error)`. A read that
 * fails — a blob revoked before even the shim saw it, a larger file than
 * [PYREON_WEBVIEW_PAGE_DOWNLOAD_MAX_BYTES] — ends with an error, and the
 * download is not reported.
 */
fun pyreonWebViewDownloadFetchScript(url: String, token: String, id: String): String =
    "(function(){var n=window.__pyreonNative,t=${pyreonJsString(token)},i=${pyreonJsString(id)}," +
        "u=${pyreonJsString(url)},C=$PYREON_WEBVIEW_PAGE_DOWNLOAD_CHUNK_BYTES,M=$PYREON_WEBVIEW_PAGE_DOWNLOAD_MAX_BYTES;" +
        "function f(e){n.downloadDone(t,i,'',String(e&&e.message||e));}" +
        "try{var B=window.__pyreonDownloadBlobs,p=B&&B.get(u);if(p)B.delete(u);" +
        "(p||fetch(u).then(function(r){return r.blob();})).then(function(b){" +
        "if(b.size>M){f('larger than '+M+' bytes');return;}var o=0;" +
        "function next(){if(o>=b.size){n.downloadDone(t,i,b.type||'',null);return;}" +
        "var rd=new FileReader();rd.onload=function(){var s=String(rd.result);" +
        "if(!n.downloadChunk(t,i,s.slice(s.indexOf(',')+1))){f('the host stopped the transfer');return;}o+=C;next();};" +
        "rd.onerror=function(){f('unreadable');};rd.readAsDataURL(b.slice(o,o+C));}" +
        "next();}).catch(f);}catch(e){f(e);}})();"
