// PyreonCrashReporter — the native runtime container `useCrashReporter()`
// lowers to. The CAPTURE + PERSIST + REHYDRATE half of crash reporting,
// credential-free by design: the vendor TRANSPORT (Sentry, Crashlytics, a
// custom endpoint) is app-wired through `PyreonCrashTransportRegistry`, so
// the framework proves the part no credential gates — an uncaught error is
// captured, written to disk, and readable on the NEXT launch.
//
//     val crash = PyreonCrashReporter(backend)
//     crash.start()                 // installs the default handler + rehydrates
//     crash.lastCrash.value         // previous launch's report, "" when none
//     crash.recordError("…")        // manual capture (caught errors)
//     crash.breadcrumb("…")         // ring buffer, attached to the next report
//
// The uncaught handler CHAINS to the previous default handler — the process
// still dies and the system crash dialog still shows; a crash reporter that
// swallows the crash changes app behavior, which capture must never do.
//
// **Persistence is backend-injected** (the `PyreonStorageBackend` shape the
// database/storage files use) so this file stays free of `android.*`/`java.io`
// beyond what the kotlinc validate stubs carry, the capture state is fully
// unit-testable against an in-memory backend, and a cold INSTANCE over the
// same backend models a relaunch — the same documented in-process ceiling as
// the Android auth-rehydration proof. `rememberPyreonCrashReporter()` (the
// Android-side file) self-installs a file-backed default: a default that
// requires a step nobody takes is not a default.
//
// HONEST SCOPE (v1): `Thread.setDefaultUncaughtExceptionHandler` captures
// JVM uncaught throwables; NATIVE (NDK) crashes are not captured — the same
// disclosed boundary as the Swift half's signal crashes.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** App-wired transport seam — the push/geolocation registry shape. */
public object PyreonCrashTransportRegistry {
    /** Called with the rehydrated report on start(), and with each recordError. */
    public var send: ((String) -> Unit)? = null
}

public class PyreonCrashReporter(
    private val backend: PyreonStorageBackend = InMemoryBackend(),
) {
    /** Previous launch's crash report (JSON string); "" when none. */
    public val lastCrash: MutableState<String> = mutableStateOf("")

    /**
     * STICKY: true once THIS launch found a persisted report — the
     * device/instrumented assertion surface (the `wasBackgrounded` pattern).
     */
    public val hadCrash: MutableState<Boolean> = mutableStateOf(false)

    private var started = false
    private val breadcrumbs = ArrayDeque<String>()

    /** Whether the uncaught handler is installed. */
    public val isMonitoring: Boolean get() = started

    /**
     * Install the uncaught-throwable handler + rehydrate any persisted
     * report. Idempotent. The handler persists SYNCHRONOUSLY, then CHAINS to
     * the previous default handler so the process still dies normally.
     */
    public fun start() {
        if (started) return
        started = true
        rehydrate()
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            persist(
                message = "${error::class.simpleName}: ${error.message ?: ""}",
                stack = error.stackTraceToString(),
            )
            previous?.uncaughtException(thread, error)
        }
    }

    /** Manual capture — persists AND forwards to the transport when wired. */
    public fun recordError(message: String) {
        persist(message = message, stack = Throwable().stackTraceToString())
        PyreonCrashTransportRegistry.send?.invoke(message)
    }

    /** Ring-buffered context attached to the next report (capped at 32). */
    public fun breadcrumb(message: String) {
        breadcrumbs.addLast(message)
        while (breadcrumbs.size > 32) breadcrumbs.removeFirst()
    }

    /** Acknowledge the rehydrated report: clears state AND the persisted key. */
    public fun clear() {
        lastCrash.value = ""
        hadCrash.value = false
        backend.remove(KEY)
    }

    // internals — pure vs the injected backend (unit-tested)

    internal fun persist(message: String, stack: String) {
        // PyreonJson.encode gives correct JSON string escaping - a hand-built
        // JSON string would re-create the delimiter-escaping class for stack
        // traces containing quotes/newlines.
        val crumbs = breadcrumbs.joinToString("\n")
        backend.write(KEY, PyreonJson.encode(listOf(message, stack, crumbs)))
    }

    private fun rehydrate() {
        val raw = backend.read(KEY) ?: return
        if (raw.isEmpty()) return
        lastCrash.value = raw
        hadCrash.value = true
        PyreonCrashTransportRegistry.send?.invoke(raw)
        // Deliberately NOT cleared on read — the app decides via clear(),
        // so a transport wired one launch late still sees the report.
    }

    private companion object {
        const val KEY: String = "pyreon.crash.last"
    }
}
