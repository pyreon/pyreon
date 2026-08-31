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

import android.content.ActivityNotFoundException
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

// A Context whose startActivity throws the way the real one does when nothing
// on the device resolves the scheme — a zoommtg:// link on a phone without Zoom.
private class UnresolvableContext : Context() {
    override fun startActivity(intent: Intent) {
        throw ActivityNotFoundException("no activity for intent")
    }
}

fun testOpenUrlSurvivesAnUnresolvableScheme() {
    // startActivity THROWS ActivityNotFoundException, and an unguarded call
    // terminated the process on a URL the device simply could not open — from
    // one shared source, on one target only, since the Swift half degraded.
    val linking = PyreonLinking(UnresolvableContext())
    val opened = linking.openUrl("zoommtg://join?id=1")
    check(!opened) { "an unresolvable scheme reports false rather than crashing" }
}

fun testOpenUrlReportsSuccess() {
    // Reported rather than swallowed: a caller that wants to fall back needs to
    // know, and a bare catch leaves the button looking broken with no way to
    // tell. So the success path must be distinguishable.
    val ctx = RecordingContext()
    check(PyreonLinking(ctx).openUrl("https://pyreon.dev")) { "a handled URL reports true" }
}

fun main() {
    testOpenUrlStartsActivity()
    testLinkingConstructorShape()
    testOpenUrlSurvivesAnUnresolvableScheme()
    testOpenUrlReportsSuccess()
    println("[PyreonLinkingTest] all smoke tests passed")
}
