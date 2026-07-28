// The Android half of PyreonDatabase — one factory that resolves app-private
// storage from a Context.
//
// It lives in its OWN file for a concrete gate reason, not for tidiness:
// `scripts/run-kotlin-tests.ts` classifies any module importing `android.*`
// as SKIP-EXTERNAL (it cannot link the Android SDK), so folding this factory
// into PyreonDatabase.kt would have dropped that module out of the runnable
// set and silently stopped executing its persistence test — a gate quietly
// losing coverage while still reporting green. The persistence core is plain
// JVM (`java.io.File`), so it stays dep-free and stays genuinely RUN; only
// this one Context lookup is Android-bound.
//
// `PyreonDatabase(context)` reads as a constructor at every call site (Kotlin
// resolves a same-named function identically), which is what the compiler
// emit writes:
//
//     val dbCtx = LocalContext.current
//     val db = remember { PyreonDatabase(dbCtx) }

package com.pyreon.runtime

import android.content.Context
import java.io.File

/** Persistent database rooted at the app's private `filesDir` — app-scoped,
 * included in Android backup, and needs no permission. This is what
 * `useDatabase()` lowers to, so a scaffolded app persists without the author
 * wiring a backend. */
@Suppress("FunctionName")
public fun PyreonDatabase(
    context: Context,
    onError: ((String, Throwable) -> Unit)? = null,
): PyreonDatabase = PyreonDatabase(FileDatabaseBackend(File(context.filesDir, "PyreonDatabase"), onError))
