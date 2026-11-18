// Smoke tests for PyreonCrashReporter — capture + persist + rehydrate over
// an injected backend. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonCrashReporter`. A COLD INSTANCE over the
// same backend models a relaunch — the documented in-process ceiling (the
// Android auth-rehydration precedent); the real process-death half is the
// device test's claim.

package com.pyreon.runtime

fun testCrashReporterPersistThenColdInstanceRehydrates() {
    val backend = InMemoryBackend()
    // "Launch 1": the path the uncaught handler takes.
    val first = PyreonCrashReporter(backend)
    first.breadcrumb("opened settings")
    first.persist(message = "TestCrash: boom", stack = "frame0\nframe1")
    // "Launch 2": a cold instance over the same backend.
    val second = PyreonCrashReporter(backend)
    check(!second.hadCrash.value) { "no crash state before start()" }
    second.start()
    check(second.hadCrash.value) { "start() rehydrates hadCrash" }
    check(second.lastCrash.value.contains("TestCrash: boom")) { "report content present" }
    check(second.lastCrash.value.contains("opened settings")) { "breadcrumbs attached" }
    // clear() removes the persisted report: a third instance sees nothing.
    second.clear()
    val third = PyreonCrashReporter(backend)
    third.start()
    check(!third.hadCrash.value) { "clear() removed the persisted report" }
    check(third.lastCrash.value == "") { "lastCrash empty after clear" }
}

fun testCrashReporterHandlerInstalledAndChains() {
    // The never-wired-class lesson: assert the handler is ACTUALLY installed,
    // not that the container merely exists — and that it CHAINS (a reporter
    // that swallows the crash changes app behavior).
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    var chained = false
    Thread.setDefaultUncaughtExceptionHandler { _, _ -> chained = true }
    try {
        val backend = InMemoryBackend()
        val r = PyreonCrashReporter(backend)
        r.start()
        val installed = Thread.getDefaultUncaughtExceptionHandler()
        check(installed != null) { "a default handler is installed" }
        // Fire it directly (a REAL uncaught throw would kill this process).
        installed!!.uncaughtException(Thread.currentThread(), RuntimeException("boom"))
        check(chained) { "the previous default handler was chained" }
        val raw = backend.read("pyreon.crash.last")
        check(raw != null && raw.contains("RuntimeException")) { "crash persisted before chaining" }
    } finally {
        Thread.setDefaultUncaughtExceptionHandler(previous)
    }
}

fun testCrashReporterTransportSeamForwards() {
    val backend = InMemoryBackend()
    PyreonCrashReporter(backend).persist(message = "T: x", stack = "s")
    val sent = mutableListOf<String>()
    PyreonCrashTransportRegistry.send = { sent.add(it) }
    try {
        val r = PyreonCrashReporter(backend)
        r.start()
        check(sent.size == 1 && sent[0].contains("T: x")) { "rehydrate forwards to transport" }
        r.recordError("manual: caught")
        check(sent.size == 2) { "recordError forwards to transport" }
    } finally {
        PyreonCrashTransportRegistry.send = null
    }
}

fun testCrashReporterBreadcrumbRingCapped() {
    val backend = InMemoryBackend()
    val r = PyreonCrashReporter(backend)
    for (i in 0 until 100) r.breadcrumb("b$i")
    r.persist(message = "m", stack = "s")
    val raw = backend.read("pyreon.crash.last")!!
    check(!raw.contains("\"b0\"") && !raw.contains("\"b67\"")) { "oldest crumbs evicted" }
    check(raw.contains("\"b68\"") && raw.contains("\"b99\"")) { "the newest 32 crumbs kept" }
}

// The build identity symbolication keys on. A report without it cannot be
// matched to the R8 mapping of the build that crashed, which is the whole
// gap this closes — so assert each field lands in the persisted JSON.
fun testCrashReportCarriesBuildIdentity() {
    val backend = InMemoryBackend()
    val r = PyreonCrashReporter(
        backend,
        PyreonCrashBuildInfo(appId = "com.example.app", version = "1.4.0", buildNumber = "42"),
    )
    r.persist(message = "m", stack = "s")
    val raw = backend.read("pyreon.crash.last")!!
    check(raw.startsWith("{") && raw.endsWith("}")) { "report is a JSON object: $raw" }
    check(raw.contains("\"platform\":\"android\"")) { "platform recorded: $raw" }
    check(raw.contains("\"appId\":\"com.example.app\"")) { "appId recorded: $raw" }
    check(raw.contains("\"version\":\"1.4.0\"")) { "version recorded: $raw" }
    check(raw.contains("\"buildNumber\":\"42\"")) { "buildNumber recorded: $raw" }
    check(raw.contains("\"mappingId\":\"\"")) { "no R8 frames -> empty mappingId: $raw" }
}

// R8 names its mapping in every frame it rewrote (`SourceFile` =
// `r8-map-id-<pg_map_id>`). The reporter lifts that id into
// `build.mappingId`, so the report names the exact mapping.txt.
fun testCrashReportLiftsTheR8MappingIdFromTheStack() {
    val backend = InMemoryBackend()
    val r = PyreonCrashReporter(backend)
    val stack = "java.lang.IllegalStateException: boom\n" +
        "\tat a.a.a(r8-map-id-dbf0e67407a7eeb2:1)\n\tat demo.Main.main(r8-map-id-dbf0e67407a7eeb2:1)"
    r.persist(message = "IllegalStateException: boom", stack = stack)
    val raw = backend.read("pyreon.crash.last")!!
    check(raw.contains("\"mappingId\":\"dbf0e67407a7eeb2\"")) { "mappingId lifted from the stack: $raw" }
    // The stack's tab + newline survive as JSON escapes, not raw bytes.
    check(raw.contains("boom\\n\\tat a.a.a(")) { "stack escaped as JSON: $raw" }
}

fun main() {
    // Every start() installs a REAL default uncaught handler that persists and
    // chains to the previous one (none here). Left installed, it swallows the
    // IllegalStateException of any later failing check(...): the process exits
    // 1 with no message at all. Restore the original before reporting.
    val original = Thread.getDefaultUncaughtExceptionHandler()
    try {
        testCrashReporterPersistThenColdInstanceRehydrates()
        testCrashReporterHandlerInstalledAndChains()
        testCrashReporterTransportSeamForwards()
        testCrashReporterBreadcrumbRingCapped()
        testCrashReportCarriesBuildIdentity()
        testCrashReportLiftsTheR8MappingIdFromTheStack()
    } finally {
        Thread.setDefaultUncaughtExceptionHandler(original)
    }
    println("[PyreonCrashReporterTest] all smoke tests passed")
}
