// PyreonClipboard — the Compose side of Pyreon's clipboard service
// (Phase 4). Mirrors the Swift `PyreonClipboard` one-for-one + the
// core `@pyreon/hooks` `useClipboard` shape.
//
// Surface:
//
//     clipboard.copy("Hello")  // write to system clipboard
//     clipboard.copied         // reactive Boolean — true for ~2s
//                              // after each copy
//
// `copied` is a Compose `MutableState<Boolean>` (delegated `by`-style
// for ergonomic reads). A composable reading `clipboard.copied`
// recomposes when the flag flips.
//
// `Context` is captured at CONSTRUCTION time (not per-call) so the
// public `copy` method matches the Swift `copy(_:)` signature
// one-for-one. PMTC emits `remember { PyreonClipboard(LocalContext.current) }`
// from the canonical `const cb = useClipboard()` shape — the same
// LocalContext.current-passed-into-remember pattern Compose users
// hand-write for context-dependent stateful holders.
//
// The 2s reset uses kotlinx.coroutines `Job` cancellation — same
// shape as the Swift version's Task cancellation.

package com.pyreon.runtime

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Reactive clipboard wrapper — the Compose half of `useClipboard`.
 *
 * Lives as a `remember { PyreonClipboard() }` inside a composable
 * (per the PMTC emit pattern); `copied` is observable, `copy(ctx, text)`
 * writes through to the system ClipboardManager.
 */
class PyreonClipboard(private val context: Context) {
    private var _copied by mutableStateOf(false)
    val copied: Boolean get() = _copied

    private var resetJob: Job? = null
    // The reset coroutine runs on the IO dispatcher because we only
    // need a single-shot delay + a state flip; no UI work happens here.
    private val scope = CoroutineScope(Dispatchers.IO)

    fun copy(text: String) {
        val mgr = ContextCompat.getSystemService(context, ClipboardManager::class.java)
        mgr?.setPrimaryClip(ClipData.newPlainText("pyreon", text))
        _copied = true
        resetJob?.cancel()
        resetJob = scope.launch {
            delay(2000)
            _copied = false
        }
    }

    fun reset() {
        resetJob?.cancel()
        _copied = false
    }
}
