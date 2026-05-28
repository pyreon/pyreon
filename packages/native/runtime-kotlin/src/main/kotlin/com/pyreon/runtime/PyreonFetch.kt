// PyreonFetch — the Compose side of Pyreon's cross-platform data-fetching
// story (Phase 4.1). Mirrors the web `useFetch` result contract:
//
//     { data, error, isPending, refetch }
//
// and the Swift `PyreonFetch` one-for-one so iOS + Android stay in lockstep.
//
// ## What this delivers
//
// A reactive container holding the three fields a data hook exposes —
// `data` (the result, `null` until loaded), `error` (the failure, `null`
// on success), `isPending` (true while a fetch is in flight) — each a
// Compose `MutableState` so observers recompose as they change, exactly
// like PyreonRouter's `params`. Plus `refetch()` to re-run the last fetch.
//
// ## Scope — state container, NOT the async orchestrator
//
// `PyreonFetch` owns the STATE MACHINE only: `load(fetcher)` flips
// `isPending` true, invokes the fetcher, and lands the result in `data`
// or the failure in `error`. The fetcher is INJECTED.
//
// Crucially this is COROUTINE-FREE: the runtime package intentionally
// avoids a kotlinx-coroutines dependency (same "no external deps so it
// typechecks without the full Android stack" stance PyreonRouter
// documents). The async network call lives in the compiler-emitted
// harness — a Compose `LaunchedEffect(currentPath) { fetch.load { … } }`
// that performs the suspendable HTTP off the main thread and feeds the
// resolved value into `load`. The container itself stays synchronous and
// dependency-light, so it unit-tests with a stub fetcher and no coroutine
// runtime.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const x = useFetch<T>('/url')` and emits a
// `remember { PyreonFetch<T>() }` plus a `LaunchedEffect` that awaits the
// ktor/HttpURLConnection call and calls `x.load { … }`; `x.data` /
// `x.isPending` reads in the component become `x.data.value` /
// `x.isPending.value` reads on this container (same `.value` convention
// as PyreonRouter's reactive fields).

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * Reactive async-data container — the Compose half of `useFetch`.
 * Generic over the result type [T].
 *
 * Mirrors the Swift `PyreonFetch`; exposes its fields as Compose
 * `MutableState` (read `.value`) following the PyreonRouter convention.
 */
public class PyreonFetch<T> {
    /** The result, or `null` before the first successful fetch. */
    public val data: MutableState<T?> = mutableStateOf(null)

    /** The most recent failure, or `null` on success / before first fetch. */
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    /** True while a fetch is in flight. */
    public val isPending: MutableState<Boolean> = mutableStateOf(false)

    /** Last fetcher passed to [load], retained so [refetch] can re-run it. */
    private var lastFetcher: (() -> T)? = null

    /**
     * Run [fetcher], transitioning `isPending` → (`data` | `error`).
     * Retains the fetcher so [refetch] re-runs the same request.
     *
     * Synchronous by design — the emitted `LaunchedEffect` harness does
     * the suspendable network call and passes a closure returning the
     * already-resolved value (or throwing). The container only owns the
     * state machine.
     */
    public fun load(fetcher: () -> T) {
        lastFetcher = fetcher
        reload()
    }

    /**
     * Re-run the last [load] fetcher. No-op if [load] was never called
     * (the async-harness path re-runs by re-triggering its `LaunchedEffect`,
     * not through here).
     */
    public fun refetch() {
        reload()
    }

    // Async-harness transitions — the compiler-emitted `LaunchedEffect`
    // that does the suspendable network call drives the state machine
    // through these three explicit steps, because a single synchronous
    // `load(fetcher)` can't model "await, THEN resolve OR reject":
    //
    //     LaunchedEffect(Unit) {
    //         x.begin()
    //         try   { x.resolve(fetchAndDecode()) }
    //         catch (e: Throwable) { x.reject(e) }
    //     }

    /** Enter the in-flight state: `isPending` true, prior `error` cleared. */
    public fun begin() {
        isPending.value = true
        error.value = null
    }

    /** Complete with a value: set `data`, clear `error`, end pending. */
    public fun resolve(value: T) {
        data.value = value
        error.value = null
        isPending.value = false
    }

    /**
     * Complete with a failure: set `error`, end pending. Leaves any prior
     * `data` in place (stale-while-error), matching the web contract.
     */
    public fun reject(failure: Throwable) {
        error.value = failure
        isPending.value = false
    }

    private fun reload() {
        val fetcher = lastFetcher ?: return
        begin()
        try {
            resolve(fetcher())
        } catch (e: Throwable) {
            reject(e)
        }
    }
}
