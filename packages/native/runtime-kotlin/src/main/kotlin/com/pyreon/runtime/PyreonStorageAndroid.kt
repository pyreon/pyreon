// The Android half of PyreonStorage — resolving app-private storage from a
// Context, and installing it as the default so `useStorage()` persists with
// no app wiring at all.
//
// That last clause is the whole point. The previous design put the burden on
// the app ("real apps replace this with DataStoreBackend(context)"), the class
// it named was never written, and no example ever assigned the registry — so
// the documented escape hatch was the ONLY path to persistence and nobody was
// on it. A default that requires a step nobody takes is not a default.
//
// Separate file for a gate reason, not tidiness: run-kotlin-tests.ts only RUNS
// modules importing no `android.*`/`androidx.*`/`kotlinx.*`, so the persistence
// logic stays dep-free in PyreonStorageFile.kt (and is genuinely executed)
// while this Context lookup — which can only ever typecheck — sits alone.

package com.pyreon.runtime

import android.content.Context
import java.io.File

/** Persistent key/value storage rooted at the app's private `filesDir` —
 * app-scoped, included in Android backup, needs no permission. */
public fun pyreonFileStorage(
    context: Context,
    onError: ((String, Throwable) -> Unit)? = null,
): FileStorageBackend = FileStorageBackend(File(context.filesDir, "PyreonStorage"), onError)

/**
 * Install file-backed storage as the process default, unless the app already
 * chose a backend.
 *
 * Called once from `rememberPyreonStorage`, so a Compose app gets persistence
 * for free. The "unless" is [installDefaultStorageBackend]'s guard, which
 * lives in the dependency-free backend file so it can be RUN in a test — the
 * policy that must not regress is "never clobber the app's own backend", and
 * that is not something a typecheck can check.
 */
public fun installDefaultPyreonStorage(context: Context) {
    installDefaultStorageBackend { pyreonFileStorage(context) }
}
