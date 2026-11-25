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
// The decisions behind PyreonWebView's DownloadListener. Same naming rule and
// the same `PyreonWebViewDownload` shape as the iOS host (PyreonWebView.swift).

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
    /** `http(s)`: the system `DownloadManager` fetches it (cookies and user agent passed on). */
    SYSTEM,
    /** `blob:` / `data:`: only the page can read it, so the page reads it and hands the bytes over. */
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

/** The largest `blob:` / `data:` download the page hands over the bridge (it crosses as base64 text). */
const val PYREON_WEBVIEW_PAGE_DOWNLOAD_MAX_BYTES: Long = 50L * 1024 * 1024

/**
 * The name a download is saved under: the first candidate that is still a name
 * after cleaning, else "download". Cleaning keeps ONE path component — `/`,
 * `\`, `:` and control characters become `_`, leading dots and surrounding
 * spaces go, a name of only `_` is no name — and caps it at 200 characters,
 * keeping a short extension. Same rule as the Swift host.
 */
fun pyreonWebViewDownloadFilename(vararg candidates: String?): String {
    for (candidate in candidates) {
        if (candidate == null) continue
        val cleaned = pyreonCleanFilename(candidate)
        if (cleaned.isNotEmpty()) return cleaned
    }
    return "download"
}

private fun pyreonCleanFilename(raw: String): String {
    val sb = StringBuilder(raw.length)
    var i = 0
    while (i < raw.length) {
        val cp = raw.codePointAt(i)
        if (cp < 0x20 || cp == 0x7F || cp == '/'.code || cp == '\\'.code || cp == ':'.code) sb.append('_') else sb.appendCodePoint(cp)
        i += Character.charCount(cp)
    }
    var name = sb.toString().trim(' ')
    name = name.trimStart('.').trim(' ')
    if (name.all { it == '_' }) return ""
    if (name.codePointCount(0, name.length) > 200) {
        val dot = name.lastIndexOf('.')
        val ext = if (dot > 0) name.substring(dot + 1) else ""
        val keep = if (ext.isEmpty() || ext.length > 16) "" else ".$ext"
        val budget = 200 - keep.length
        name = name.substring(0, name.offsetByCodePoints(0, budget)) + keep
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
 * The JSON value `evaluateJavascript` hands back, read as a string: the
 * decoded text of a JSON string literal, null for anything else (`null`, a
 * number, an object, malformed input).
 */
fun pyreonJsonStringResult(json: String?): String? {
    if (json == null || json.length < 2 || json[0] != '"' || json[json.length - 1] != '"') return null
    val sb = StringBuilder(json.length)
    var i = 1
    val end = json.length - 1
    while (i < end) {
        val c = json[i]
        if (c != '\\') {
            sb.append(c)
            i++
            continue
        }
        if (i + 1 >= end) return null
        when (val e = json[i + 1]) {
            '"', '\\', '/' -> sb.append(e)
            'b' -> sb.append('\b')
            'f' -> sb.append('\u000C')
            'n' -> sb.append('\n')
            'r' -> sb.append('\r')
            't' -> sb.append('\t')
            'u' -> {
                if (i + 6 > end) return null
                sb.append(json.substring(i + 2, i + 6).toIntOrNull(16)?.toChar() ?: return null)
                i += 4
            }
            else -> return null
        }
        i += 2
    }
    return sb.toString()
}

/**
 * Installed in the main frame with the reverse-bridge shim: remembers the
 * `download` attribute of the last links clicked (WebView's DownloadListener
 * does not pass it on), for a click that bubbles AND for `a.click()` on a link
 * the page never attached. Observes only; at most 16 links are remembered.
 */
const val PYREON_WEBVIEW_DOWNLOAD_NAMES_SHIM: String =
    "(function(){if(window.__pyreonDownloadNames)return;" +
        "var m=window.__pyreonDownloadNames=Object.create(null),k=[];" +
        "function r(a){try{if(a&&a.hasAttribute&&a.hasAttribute('download')){var h=a.href;" +
        "if(!(h in m))k.push(h);m[h]=a.getAttribute('download')||'';if(k.length>16)delete m[k.shift()];}}catch(e){}}" +
        "document.addEventListener('click',function(e){var t=e.target;while(t&&t.nodeName!=='A')t=t.parentNode;r(t);},true);" +
        "var c=HTMLAnchorElement.prototype.click;" +
        "HTMLAnchorElement.prototype.click=function(){r(this);return c.apply(this,arguments);};})();"

/** Script returning the `download` name the page gave [url]'s link, or null. */
fun pyreonWebViewDownloadNameScript(url: String): String =
    "(function(){var m=window.__pyreonDownloadNames,u=${pyreonJsString(url)};return m&&(u in m)?m[u]:null;})()"

/**
 * Script that reads a `blob:` / `data:` URL IN THE PAGE (only the page can) and
 * hands it back through `__pyreonNative.download(token, id, base64, mimeType,
 * error)`: the bytes as base64 with the blob's type, or null bytes and the
 * reason. A blob the page already revoked fails here, as it would in a browser.
 */
fun pyreonWebViewDownloadFetchScript(url: String, token: String, id: String): String =
    "(function(){var n=window.__pyreonNative,t=${pyreonJsString(token)},i=${pyreonJsString(id)};" +
        "function f(e){n.download(t,i,null,'',String(e&&e.message||e));}" +
        "try{fetch(${pyreonJsString(url)}).then(function(r){return r.blob();}).then(function(b){" +
        "if(b.size>$PYREON_WEBVIEW_PAGE_DOWNLOAD_MAX_BYTES){f('larger than $PYREON_WEBVIEW_PAGE_DOWNLOAD_MAX_BYTES bytes');return;}" +
        "var rd=new FileReader();rd.onload=function(){var s=String(rd.result);" +
        "n.download(t,i,s.slice(s.indexOf(',')+1),b.type||'',null);};" +
        "rd.onerror=function(){f('unreadable');};rd.readAsDataURL(b);}).catch(f);}catch(e){f(e);}})();"
