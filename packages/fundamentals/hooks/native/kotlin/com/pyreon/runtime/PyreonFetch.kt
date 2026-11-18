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
import kotlinx.serialization.json.Json

/**
 * The JSON reader every emitted `useFetch` decode uses.
 *
 * Named `PyreonFetchJson`, not `PyreonJson`: that name is already the
 * WebView bridge's encoder (`PyreonJson.encode(signal)`), a different
 * concern with a different policy.
 *
 * `ignoreUnknownKeys = true` is the whole point, and it is a CROSS-PLATFORM
 * PARITY fix, not a preference. kotlinx.serialization's default `Json` THROWS
 * on a key the target type does not declare; Swift's `JSONDecoder` silently
 * ignores it. So the same shared `useFetch<T>(url)` against the same server
 * decoded fine on iOS and threw on Android the moment the response carried one
 * extra field — which is to say, against essentially every real API, since a
 * server returning exactly the fields one client declares is the exception.
 *
 * Measured on a real emulator (2026-08-04): a 200 response
 * `{"id":…,"method":…,"body":…,"contentType":…}` decoded into a three-field
 * type raised `JsonDecodingException: Encountered an unknown key
 * 'contentType'`, while the identical iOS run passed. It stayed invisible
 * because the only device-proven fetch fixture is a hand-written `quotes.json`
 * whose shape matches its type exactly.
 *
 * Deliberately NOT `isLenient` (that would accept malformed JSON, which is a
 * real error worth surfacing) and NOT `explicitNulls = false` — this closes
 * exactly the one divergence from Swift and nothing more.
 */
public val PyreonFetchJson: Json = Json { ignoreUnknownKeys = true }

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

    /** The request the emitted `LaunchedEffect` registered through [run]; [refetch] re-runs it. Without it a
     *  compiled `refetch()` was a silent no-op: the harness fetched inline and nothing kept the request. */
    private var asyncFetcher: (suspend () -> T)? = null

    /** Starts a coroutine on the composable's scope (registered with the request). */
    private var launcher: ((suspend () -> Unit) -> Unit)? = null

    /** Bumped by every async fetch: a response settles state only while its own generation is the latest. */
    private var generation = 0

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
     * Register the request and fetch it. The emitted `LaunchedEffect` calls this with the request it builds and a
     * [launch] that starts a coroutine on the composable's scope; the container keeps both so [refetch] can re-run
     * the request later.
     */
    public suspend fun run(launch: (suspend () -> Unit) -> Unit, fetcher: suspend () -> T) {
        asyncFetcher = fetcher
        launcher = launch
        fetch(fetcher)
    }

    /**
     * Re-run the registered request: the async one from [run], else the last synchronous [load] fetcher. A no-op
     * before either.
     */
    public fun refetch() {
        val request = asyncFetcher
        val launch = launcher
        if (request != null && launch != null) {
            launch { fetch(request) }
            return
        }
        reload()
    }

    private suspend fun fetch(request: suspend () -> T) {
        generation += 1
        val mine = generation
        begin()
        val value = try {
            request()
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            // The composable left: not a failure to show.
            if (mine == generation) isPending.value = false
            throw e
        } catch (t: Throwable) {
            if (mine == generation) reject(t)
            return
        }
        // Superseded: a newer fetch owns the state.
        if (mine == generation) resolve(value)
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
