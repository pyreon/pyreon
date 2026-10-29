// Executable checks for PyreonWebChromePolicy — the decisions behind
// PyreonWebView's WebChromeClient (#3982). Plain JVM, no Android SDK: the
// WebChromeClient itself is SDK plumbing the device gate covers, and what it
// DECIDES is all here.

package com.pyreon.runtime

private fun expect(cond: Boolean, what: String) {
    if (!cond) {
        System.err.println("FAIL: $what")
        kotlin.system.exitProcess(1)
    }
}

private val mimeMap = mapOf("pdf" to "application/pdf", "png" to "image/png", "jpg" to "image/jpeg")
private fun plan(accept: List<String>, multiple: Boolean = false, capture: Boolean = false) =
    pyreonFileChooserPlan(accept, multiple, capture) { mimeMap[it] }

private fun fileChooserPlans() {
    // `<input type=file>` with no accept arrives as [""] — the picker must
    // still open, on anything.
    expect(plan(listOf("")).mimeTypes == listOf("*/*"), "no accept → any type")
    expect(plan(emptyList()).mimeTypes == listOf("*/*"), "empty accept → any type")
    // Comma-joined tokens, case, whitespace, extensions, duplicates.
    expect(
        plan(listOf("image/*, .PDF", "image/*")).mimeTypes == listOf("image/*", "application/pdf"),
        "tokens split, extensions mapped, de-duplicated in order",
    )
    // An extension the platform cannot map is dropped, not passed through.
    expect(plan(listOf(".weird")).mimeTypes == listOf("*/*"), "unmappable extension → any type")
    expect(plan(listOf("x"), multiple = true).multiple, "multiple carries through")

    // Capture only when the camera can satisfy EVERY accepted type.
    expect(plan(listOf("image/*"), capture = true).capture == PyreonCaptureKind.IMAGE, "image capture")
    expect(plan(listOf(".png", ".jpg"), capture = true).capture == PyreonCaptureKind.IMAGE, "image extensions capture")
    expect(plan(listOf("video/mp4"), capture = true).capture == PyreonCaptureKind.VIDEO, "video capture")
    expect(plan(listOf("image/*", ".pdf"), capture = true).capture == null, "mixed types → picker")
    expect(plan(listOf(""), capture = true).capture == null, "capture with no accept → picker")
    expect(plan(listOf("image/*")).capture == null, "no capture attribute → picker")
}

private fun mediaPermissions() {
    expect(pyreonPermissionForResource(PYREON_RESOURCE_VIDEO_CAPTURE) == PYREON_PERMISSION_CAMERA, "camera")
    expect(pyreonPermissionForResource(PYREON_RESOURCE_AUDIO_CAPTURE) == PYREON_PERMISSION_RECORD_AUDIO, "mic")
    expect(pyreonPermissionForResource("android.webkit.resource.PROTECTED_MEDIA_ID") == null, "unmapped stays unmapped")
    val requested = listOf(PYREON_RESOURCE_VIDEO_CAPTURE, PYREON_RESOURCE_AUDIO_CAPTURE, "android.webkit.resource.MIDI_SYSEX")
    // Only what the user actually granted is granted to the page; an unmapped
    // resource is never granted.
    expect(
        pyreonGrantableResources(requested, setOf(PYREON_PERMISSION_CAMERA)) == listOf(PYREON_RESOURCE_VIDEO_CAPTURE),
        "grant only the permitted subset",
    )
    expect(pyreonGrantableResources(requested, emptySet()).isEmpty(), "nothing granted → nothing")
    expect(pyreonDescribeResources(requested) == "your camera and microphone", "describe both")
    expect(pyreonDescribeResources(listOf(PYREON_RESOURCE_AUDIO_CAPTURE)) == "your microphone", "describe mic")
}

private fun externalUrls() {
    for (ok in listOf("https://example.com/terms", "http://x.test", "mailto:a@b.c", "tel:+1555", "sms:+1555", "HTTPS://X.TEST")) {
        expect(pyreonMayOpenExternally(ok), "$ok is handed to the system")
    }
    for (no in listOf("javascript:alert(1)", "file:///sdcard/x", "intent://x#Intent;end", "content://x/y", "about:blank", "myapp://pay", ":nope", "", null)) {
        expect(!pyreonMayOpenExternally(no), "$no is refused")
    }
}

private fun originHosts() {
    expect(pyreonOriginHost("https://a.example:8443/path?q#f") == "a.example", "host without port/path")
    expect(pyreonOriginHost("https://user:pw@b.example") == "b.example", "userinfo stripped")
    expect(pyreonOriginHost("http://[::1]:80/") == "[::1]", "ipv6 literal kept")
    expect(pyreonOriginHost("file://") == null, "file origin has no host")
    expect(pyreonOriginHost("file:///android_asset/x.html") == null, "file url has no host")
    expect(pyreonOriginHost(null) == null, "null")
    expect(pyreonOriginHost("not a url") == null, "no scheme")
}

private fun onceSlot() {
    val answers = mutableListOf<String?>()
    val slot = PyreonOnceSlot<String>()
    expect(!slot.isPending, "starts empty")
    slot.hold { answers.add("a:$it") }
    // A second request before the first is answered cancels the first —
    // otherwise WebView waits on it forever and the input stays dead.
    slot.hold { answers.add("b:$it") }
    expect(answers == listOf("a:null"), "previous answered null exactly once")
    slot.deliver("file")
    slot.deliver("again")
    expect(answers == listOf("a:null", "b:file"), "delivered once, second deliver is a no-op")
    slot.hold { answers.add("c:$it") }
    slot.cancel()
    slot.cancel()
    expect(answers == listOf("a:null", "b:file", "c:null"), "cancel answers once")
}

private fun permissionQueue() {
    val launches = mutableListOf<List<String>>()
    val results = mutableListOf<Pair<String, Set<String>>>()
    val q = PyreonPermissionQueue { launches.add(it) }
    q.request(listOf("loc")) { results.add("geo" to it) }
    q.request(listOf("cam", "mic")) { results.add("media" to it) }
    // Serial: the second launch waits for the first verdict.
    expect(launches == listOf(listOf("loc")), "one launch in flight")
    q.deliver(mapOf("loc" to true))
    expect(results == listOf("geo" to setOf("loc")), "first answered")
    expect(launches.size == 2 && launches[1] == listOf("cam", "mic"), "second launched after")
    // A verdict for a permission it did not ask for is ignored.
    q.deliver(mapOf("cam" to true, "mic" to false, "loc" to true))
    expect(results[1] == ("media" to setOf("cam")), "only the asked-for, granted subset")
    q.deliver(mapOf("x" to true))
    expect(results.size == 2, "a stray verdict with nothing in flight is ignored")
    // Empty requests never touch the system.
    q.request(emptyList()) { results.add("empty" to it) }
    expect(launches.size == 2 && results.last() == ("empty" to emptySet<String>()), "empty answered locally")
    // Teardown answers everything outstanding with nothing granted.
    q.request(listOf("a")) { results.add("t1" to it) }
    q.request(listOf("b")) { results.add("t2" to it) }
    q.cancelAll()
    expect(results.takeLast(2) == listOf("t1" to emptySet<String>(), "t2" to emptySet<String>()), "cancelAll answers all")
    q.deliver(mapOf("a" to true))
    expect(results.size == 5, "no double answer after cancelAll")
}

public fun main() {
    fileChooserPlans()
    mediaPermissions()
    externalUrls()
    originHosts()
    onceSlot()
    permissionQueue()
    println("PyreonWebChromePolicyTest: ok")
}
