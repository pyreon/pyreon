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
// one-for-one. PMTC emits
// `remember { PyreonClipboard(LocalContext.current, scope) }`
// — where `scope` is `rememberCoroutineScope()` hoisted into a
// sibling `val` (the standard Compose pattern for context- and
// scope-dependent stateful holders).
//
// ## Round-1 audit fix: scope leak (anti-pattern Class E)
//
// Pre-fix this class created its own `CoroutineScope(Dispatchers.IO)`
// at construction time. That scope had NO parent Job and was NEVER
// cancelled — when the composable owning `remember { PyreonClipboard(...) }`
// left composition, the scope (plus any active 2s reset coroutine)
// leaked. Repeated mount/unmount accumulated scopes; an active reset
// continued running past unmount.
//
// Post-fix the scope is INJECTED at construction. The compiler emits
// `rememberCoroutineScope()` — which returns a scope whose lifecycle
// is BOUND to the composable's: when the composable leaves
// composition, the scope is auto-cancelled (any in-flight
// `delay(2000)` is interrupted, the `_copied = false` write never
// fires after unmount). Standard Compose pattern.

package com.pyreon.runtime

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Reactive clipboard wrapper — the Compose half of `useClipboard`.
 *
 * Lives as a `remember { PyreonClipboard(ctx, scope) }` inside a
 * composable (per the PMTC emit pattern). `copied` is observable;
 * `copy(text)` writes through to the system ClipboardManager and
 * launches a 2s reset on the INJECTED `scope` — which is
 * `rememberCoroutineScope()` at the call site, so the lifecycle is
 * tied to the composable's composition (no leaks on unmount).
 */
class PyreonClipboard(
    private val context: Context,
    private val scope: CoroutineScope,
) {
    private var _copied by mutableStateOf(false)
    val copied: Boolean get() = _copied

    private var resetJob: Job? = null

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
