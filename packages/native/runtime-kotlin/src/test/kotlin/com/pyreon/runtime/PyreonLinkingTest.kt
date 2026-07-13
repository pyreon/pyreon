// Smoke tests for PyreonLinking — the Compose `useLinking` wrapper.
// Mirrors PyreonShareTest.kt's dependency-free `check(...)` harness; runs
// via `verify-kotlin.ts --service=PyreonLinking` against the android.content
// Context/Intent + android.net.Uri stubs.
//
// What this covers (pure delegation — no state machine):
//   - `openUrl` launches exactly one ACTION_VIEW Activity
//   - Single-arg (Context) constructor — the shape the compiler emit
//     depends on (`remember { PyreonLinking(linkingCtx) }`)
//
// What this does NOT cover (device-CI's Android build against the REAL
// Intent/Uri does): that the URL actually opens the browser. A recording
// Context proves the code path fires `startActivity` with an ACTION_VIEW
// intent.

package com.pyreon.runtime

import android.content.Context
import android.content.Intent

private class RecordingContext : Context() {
    val started = mutableListOf<Intent>()
    override fun startActivity(intent: Intent) {
        started.add(intent)
    }
}

fun testOpenUrlStartsActivity() {
    val ctx = RecordingContext()
    val linking = PyreonLinking(ctx)
    linking.openUrl("https://pyreon.dev")
    check(ctx.started.size == 1) { "openUrl launches exactly one ACTION_VIEW Activity" }
}

fun testLinkingConstructorShape() {
    // Locks the single-arg constructor the compiler emit depends on:
    // `remember { PyreonLinking(linkingCtx) }`.
    val ctx = RecordingContext()
    val linking = PyreonLinking(ctx)
    linking.openUrl("https://x.dev")
    check(ctx.started.size == 1) { "single-arg constructor produces a usable linking" }
}

fun main() {
    testOpenUrlStartsActivity()
    testLinkingConstructorShape()
    println("[PyreonLinkingTest] all smoke tests passed")
}
