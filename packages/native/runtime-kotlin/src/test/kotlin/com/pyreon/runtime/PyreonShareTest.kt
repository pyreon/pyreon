// Smoke tests for PyreonShare — the Compose `useShare` wrapper. Mirrors
// PyreonClipboardTest.kt's dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonShare` against the android.content
// Context + Intent stubs.
//
// What this covers (pure delegation — no state machine):
//   - `text` / `url` / `textUrl` each launch exactly one chooser Activity
//   - `canShare()` is true
//   - Single-arg (Context) constructor — the shape the compiler emit
//     depends on (`remember { PyreonShare(shareCtx) }`)
//
// What this does NOT cover (device-CI's Android build against the REAL
// Intent/Context does): that the chooser actually presents the system
// share sheet. The share sheet has no headless assertion; a recording
// Context proves the code path fires `startActivity` with a chooser.

package com.pyreon.runtime

import android.content.Context
import android.content.Intent

// Recording fake — captures each startActivity so the smoke can assert the
// share method fired the chooser.
private class RecordingContext : Context() {
    val started = mutableListOf<Intent>()
    override fun startActivity(intent: Intent) {
        started.add(intent)
    }
}

fun testShareTextStartsChooser() {
    val ctx = RecordingContext()
    val share = PyreonShare(ctx)
    share.text("hello")
    check(ctx.started.size == 1) { "text() launches exactly one chooser Activity" }
}

fun testShareUrlStartsChooser() {
    val ctx = RecordingContext()
    val share = PyreonShare(ctx)
    share.url("https://pyreon.dev")
    check(ctx.started.size == 1) { "url() launches one chooser Activity" }
}

fun testShareTextUrlStartsChooser() {
    val ctx = RecordingContext()
    val share = PyreonShare(ctx)
    share.textUrl("Look:", "https://pyreon.dev")
    check(ctx.started.size == 1) { "textUrl() launches one chooser Activity" }
}

fun testShareCanShare() {
    val share = PyreonShare(RecordingContext())
    check(share.canShare()) { "canShare() is true on Android" }
}

fun testShareConstructorShape() {
    // Locks the single-arg constructor the compiler emit depends on:
    // `remember { PyreonShare(shareCtx) }`.
    val ctx = RecordingContext()
    val share = PyreonShare(ctx)
    share.text("x")
    check(ctx.started.size == 1) { "single-arg constructor produces a usable share" }
}

fun main() {
    testShareTextStartsChooser()
    testShareUrlStartsChooser()
    testShareTextUrlStartsChooser()
    testShareCanShare()
    testShareConstructorShape()
    println("[PyreonShareTest] all smoke tests passed")
}
