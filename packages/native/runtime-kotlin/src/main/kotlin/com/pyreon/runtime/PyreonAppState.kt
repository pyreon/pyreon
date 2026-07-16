// PyreonAppState — the native runtime container `useAppState()` lowers to.
//
// A reactive app-lifecycle phase (Compose `MutableState`, read `.value`):
//
//     state.phase.value   // "active" | "inactive" | "background"
//
// A Composable gating UI on `state.phase.value` re-composes when the phase
// flips.
//
// **The live source is app-injected** (`start(register)` takes a callback that
// wires the platform lifecycle — e.g. `ProcessLifecycleOwner` — and returns an
// unregister thunk). This keeps the file free of `androidx.lifecycle.*` /
// `android.*` so it compiles against the Compose-only kotlinc validate stubs
// (the same asymmetry PyreonNetworkStatus / PyreonStorage document). A
// `ProcessLifecycleOwner`-backed convenience overload is a Phase-2 follow-up.
//
// The lifecycle STATE machine (`phase` + `update`) is pure + unit-testable.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

public class PyreonAppState(phase: String = "active") {
    /** The current lifecycle phase. Read `.value`; drives recomposition. */
    public val phase: MutableState<String> = mutableStateOf(phase)

    /** Set the phase directly (used by the injected source + tests). */
    public fun update(phase: String) {
        this.phase.value = phase
    }

    /**
     * Begin observing lifecycle transitions via an app-supplied source.
     * `register` wires the platform lifecycle to `update(...)` and returns an
     * unregister thunk. Idempotent — a second `start` while running is a no-op.
     */
    public fun start(register: ((String) -> Unit) -> (() -> Unit)) {
        if (started) return
        started = true
        unregister = register { p -> update(p) }
    }

    /** Stop observing. Idempotent — a `stop` before `start` is a no-op. */
    public fun stop() {
        if (!started) return
        started = false
        unregister?.invoke()
        unregister = null
    }

    /** Whether a source is currently attached. */
    public val isMonitoring: Boolean get() = started

    private var started: Boolean = false
    private var unregister: (() -> Unit)? = null
}
