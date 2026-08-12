// PyreonToast — the Compose side of `@pyreon/toast`, twin of PyreonToast.swift.
//
// A process-global, observable QUEUE of active toast notifications. The web
// package is imperative (`toast("Saved!")` from anywhere, no provider) + a
// `<Toaster />` renders the stack; this mirrors it natively:
//
//     PyreonToast.add("Saved!")            // enqueue (auto-dismisses)
//     PyreonToast.add("Failed", "error")
//     PyreonToast.toasts.value             // the live stack a Toaster reads
//     PyreonToast.dismiss(id)              // remove one
//     PyreonToast.clear()                  // remove all
//
// The QUEUE STATE (add / dismiss / remove / clear) is pure and synchronously
// unit-testable; the async auto-dismiss is a coroutine that calls the same
// `remove(id)`. `toasts` is a Compose `MutableState` so a `<Toaster />`
// recomposes when the stack changes.
//
// Object (not class): the web store is module-global — one shared queue
// `toast()` enqueues into and the single `<Toaster />` renders. Newest last, a
// monotonic id counter (NOT a clock — rapid add() in one tick must not
// collide), bounded stack (drop the oldest past maxToasts, the web MAX_TOASTS).

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** One active toast; `id` keys a Compose `LazyColumn`/`Column` over the stack. */
public data class PyreonToastItem(val id: String, val message: String, val type: String)

public object PyreonToast {
    /** The live stack, oldest first. A `<Toaster />` reads `.value` to recompose. */
    public val toasts: MutableState<List<PyreonToastItem>> = mutableStateOf(emptyList())

    /** Default auto-dismiss, millis. 0 = persistent. Mirrors web DEFAULT_DURATION. */
    public var defaultDurationMillis: Long = 4000

    /** Bound the stack (web MAX_TOASTS) so a runaway producer can't grow it. */
    public var maxToasts: Int = 50

    private var counter = 0
    // The scope the auto-dismiss coroutine runs on — swappable in tests.
    internal var scope: CoroutineScope = CoroutineScope(Dispatchers.Main)

    /**
     * Enqueue a toast; returns its id. Schedules auto-dismiss after `duration`
     * (default `defaultDurationMillis`; 0 keeps it until dismissed). The id is a
     * monotonic counter, so two adds in the same tick get distinct ids.
     */
    public fun add(message: String, type: String = "info", durationMillis: Long? = null): String {
        counter += 1
        val id = "toast-$counter"
        var next = toasts.value + PyreonToastItem(id, message, type)
        if (next.size > maxToasts) next = next.takeLast(maxToasts)
        toasts.value = next
        val ttl = durationMillis ?: defaultDurationMillis
        if (ttl > 0) {
            scope.launch {
                delay(ttl)
                remove(id)
            }
        }
        return id
    }

    /** Remove one toast by id (no-op if already gone). */
    public fun dismiss(id: String) {
        remove(id)
    }

    /** The hard removal both `dismiss` and the auto-dismiss coroutine call. */
    public fun remove(id: String) {
        toasts.value = toasts.value.filterNot { it.id == id }
    }

    /** Remove every toast. */
    public fun clear() {
        toasts.value = emptyList()
    }
}
