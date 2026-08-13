package com.pyreon.runtime

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

/**
 * The Android edge for `useCrashReporter` — own file for the usual gate
 * reason (`PyreonCrashReporter.kt` stays `android.*`-free so it remains
 * verifiable under the Compose-only kotlinc stubs and runnable in plain JVM
 * over an injected backend).
 *
 * ## Why this exists
 *
 * `PyreonCrashReporter` persists through an injected [PyreonStorageBackend];
 * its default is the process-scope [InMemoryBackend], which does NOT survive
 * a relaunch — and a crash reporter whose report vanishes on the crash it is
 * meant to report is the never-wired class all over again (the container
 * exists, but the ONE thing it promises — a report readable on the NEXT
 * launch — never happens). So the composable factory self-installs a
 * FILE-backed backend under the app's private files dir, and calls `start()`
 * so the uncaught handler is installed and the previous launch's report is
 * rehydrated with no app wiring: a default that requires a step nobody takes
 * is not a default (the `rememberPyreonGeolocation` / `rememberPyreonStorage`
 * doctrine).
 *
 * `start()` is idempotent, so `remember { … }.also { it.start() }` installs
 * exactly once across recompositions.
 */
@Composable
public fun rememberPyreonCrashReporter(): PyreonCrashReporter {
    val context: Context = LocalContext.current
    return remember {
        val dir = context.filesDir.resolve("pyreon-crash")
        PyreonCrashReporter(FileStorageBackend(dir)).also { it.start() }
    }
}
