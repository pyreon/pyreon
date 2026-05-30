// Smoke tests for PyreonClipboard — the Compose `useClipboard`
// reactive clipboard wrapper. Mirrors `PyreonPermissionsTest.kt` /
// `PyreonNetworkStatusTest.kt`'s dependency-free `check(...)`
// harness; runs via `verify-kotlin.ts --service=PyreonClipboard`
// against Android Context + kotlinx.coroutines stubs.
//
// What this covers (synchronous state machine):
//   - Fresh `copied == false`
//   - `copy("…")` synchronously flips `copied = true`
//   - `reset()` clears `copied`; idempotent
//   - Two-arg constructor (Context + CoroutineScope) — locks in the
//     post-#1093 shape; previous one-arg form leaked a
//     CoroutineScope on every unmount.
//
// What this does NOT cover (covered by Swift PyreonRuntimeTests
// AND by the Android instrumented test in #1065):
//   - The 2-second auto-reset Job (stub `delay` is a no-op + stub
//     `launch` body never runs — testing the timing here would be
//     non-deterministic).
//   - Real ClipboardManager write (needs an Android emulator).
//
// Note on stubs: the verify-kotlin script's PyreonClipboard branch
// supplies Android Context + ClipData + ClipboardManager +
// ContextCompat + kotlinx.coroutines stubs that compile cleanly but
// do nothing at runtime. `ContextCompat.getSystemService(…)` returns
// null in the stub — that's fine because `setPrimaryClip` is
// null-safe-called and the `_copied` flip happens regardless.

package com.pyreon.runtime

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers

private class StubContext : Context() {
    override fun getApplicationContext(): Context = this
}

fun testClipboardInitialState() {
    val cb = PyreonClipboard(StubContext(), CoroutineScope(Dispatchers.Unconfined))
    check(!cb.copied) { "fresh clipboard has copied=false" }
}

fun testClipboardCopyFlipsCopied() {
    val cb = PyreonClipboard(StubContext(), CoroutineScope(Dispatchers.Unconfined))
    cb.copy("hi")
    check(cb.copied) { "copy(\"hi\") synchronously flips copied=true" }
}

fun testClipboardResetClearsCopied() {
    val cb = PyreonClipboard(StubContext(), CoroutineScope(Dispatchers.Unconfined))
    cb.copy("hi")
    check(cb.copied) { "post-copy copied=true (precondition)" }
    cb.reset()
    check(!cb.copied) { "reset() clears copied" }
    cb.reset()
    check(!cb.copied) { "reset() is idempotent" }
}

fun testClipboardConstructorShape() {
    // Round-1 #1093 regression lock: PyreonClipboard takes BOTH
    // `context: Context` AND `scope: CoroutineScope`. Pre-#1093 it
    // took only Context and built its own scope (the leak that PR
    // closed). If a future change reverts to single-arg, the
    // compiler-emitted three-line shape (cbCtx + cbScope +
    // PyreonClipboard(cbCtx, cbScope)) would fail to compile, but
    // this test catches it at the runtime layer too.
    val cb = PyreonClipboard(StubContext(), CoroutineScope(Dispatchers.Unconfined))
    check(!cb.copied) { "two-arg constructor produces a usable clipboard" }
}

fun main() {
    testClipboardInitialState()
    testClipboardCopyFlipsCopied()
    testClipboardResetClearsCopied()
    testClipboardConstructorShape()
    println("[PyreonClipboardTest] all smoke tests passed")
}
