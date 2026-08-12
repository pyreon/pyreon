// PyreonMachine — Compose side of @pyreon/machine's reactive state-machine
// surface. Mirrors the Swift `PyreonMachine` one-for-one (same fields,
// same methods, same call semantics) so iOS + Android stay in lockstep.
//
// Web shape:
//     val m = createMachine({ initial: 'idle', states: {...} })
//     m()                  // read current state
//     m.send("FETCH")      // dispatch transition
//     m.matches("loading") // boolean state check
//     m.can("FETCH")       // boolean event-availability check
//     m.nextEvents()       // List<String> of valid events from current
//
// Kotlin's `operator fun invoke()` provides the `m()` ↔ signal-read
// parity — same pattern as Swift's `callAsFunction()`. PMTC emits the
// container construction; the runtime owns the dispatch logic.
//
// Scope: string-keyed states + events (matches the literal-config shape
// PMTC parses from `{ initial: 'idle' as const, states: {...} }`). Typed
// enums + guards + entry/exit callbacks are deferred follow-ups.

package com.pyreon.runtime

import androidx.compose.runtime.mutableStateOf

class PyreonMachine(initial: String, val transitions: Map<String, Map<String, String>>) {
    private val _state = mutableStateOf(initial)

    /** Current state value. Mutates only via `send(...)`. */
    val state: String get() = _state.value

    /**
     * Dispatch an event. If the current state defines a transition for
     * the event, mutate state to the next; otherwise no-op (matches web
     * `@pyreon/machine` semantics).
     */
    fun send(event: String) {
        transitions[_state.value]?.get(event)?.let { _state.value = it }
    }

    /** `m.matches("loading")` — boolean state check. */
    fun matches(s: String): Boolean = _state.value == s

    /** `m.can("FETCH")` — does the current state define a transition? */
    fun can(event: String): Boolean =
        transitions[_state.value]?.containsKey(event) == true

    /** `m.nextEvents()` — valid events from the current state. */
    fun nextEvents(): List<String> =
        transitions[_state.value]?.keys?.toList() ?: emptyList()

    /**
     * `m()` — read current state. Kotlin's `operator fun invoke()`
     * gives the same call-as-read shape Swift's `callAsFunction()`
     * gives, so PMTC emit doesn't need compiler-side member-access
     * rewriting.
     */
    operator fun invoke(): String = _state.value
}
