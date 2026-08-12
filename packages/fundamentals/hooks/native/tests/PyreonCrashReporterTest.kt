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
    check(!raw.contains("\"b0\\n") && !raw.contains("b0\\nb1")) { "oldest crumbs evicted" }
    check(raw.contains("b99")) { "newest crumb kept" }
}

fun main() {
    testCrashReporterPersistThenColdInstanceRehydrates()
    testCrashReporterHandlerInstalledAndChains()
    testCrashReporterTransportSeamForwards()
    testCrashReporterBreadcrumbRingCapped()
    println("[PyreonCrashReporterTest] all smoke tests passed")
}
