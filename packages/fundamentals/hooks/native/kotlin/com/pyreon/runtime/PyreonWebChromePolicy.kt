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
