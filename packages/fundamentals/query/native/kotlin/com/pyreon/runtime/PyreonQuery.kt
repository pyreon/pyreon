// PyreonQuery — the Compose side of Pyreon's cross-platform CACHED
// data-fetching story (`useQuery`), the Kotlin twin of PyreonQuery.swift.
// The delta over PyreonFetch is a KEYED CACHE with stale-while-revalidate:
// the same `queryKey` shared across screens serves instantly and refetches
// in the background.
//
// `@pyreon/query` wraps `@tanstack/query-core` (an npm library PMTC cannot
// compile), so — exactly as PyreonFetch reimplements the fetch state
// machine — this reimplements the QUERY state machine natively.
//
// Result contract (mirrors the web `useQuery`, read `.value`):
//   query.data.value       result, null until the first success
//   query.error.value      last failure, null on success
//   query.isPending.value  true when there is NO data yet AND a fetch runs
//   query.isFetching.value true whenever a fetch is in flight (incl. bg)
//   query.refetch()        force a fetch, ignoring staleness
//
// The isPending/isFetching split is the whole point of a cache: a
// background refresh of already-shown data must NOT blank the UI.
//
// COROUTINE-FREE like PyreonFetch — the async network call lives in the
// compiler-emitted LaunchedEffect harness that calls load(); the container
// stays synchronous, dependency-light, and unit-testable with a stub
// fetcher. Deferred (disclosed): mutations, infinite queries, prefetch,
// cross-instance invalidation, retries, persistence.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/**
 * Process-global query cache, shared across every PyreonQuery instance so
 * two screens reading `["todos"]` hit the same entry. Values are stored as
 * `Any` (the queryKey implies the type; a mismatched cast is a miss).
 * Bounded eviction is a follow-up.
 */
public object PyreonQueryCache {
    private class Entry(val value: Any, val atMillis: Long)

    private val store = HashMap<String, Entry>()
    private val lock = Any()

    /** Nanosecond-free clock via System.currentTimeMillis for testability. */
    internal fun now(): Long = System.currentTimeMillis()

    @Suppress("UNCHECKED_CAST")
    internal fun <T> lookup(key: String): Pair<T, Long>? = synchronized(lock) {
        val e = store[key] ?: return null
        val typed = e.value as? T ?: return null
        typed to (now() - e.atMillis)
    }

    internal fun write(key: String, value: Any): Unit = synchronized(lock) {
        store[key] = Entry(value, now())
    }

    /** Drop a key (invalidation). */
    public fun invalidate(key: String): Unit = synchronized(lock) {
        store.remove(key)
    }

    /** Test seam — clear everything between cases. */
    public fun clearAll(): Unit = synchronized(lock) {
        store.clear()
    }
}

public class PyreonQuery<T>(
    public val queryKey: String,
    /** How long a cached value is served WITHOUT a refetch (millis; default 0
     *  = always revalidate, but serve the stale value instantly). */
    public val staleMillis: Long = 0,
) {
    public val data: MutableState<T?> = mutableStateOf(null)
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    /** True when there is NO data yet AND a fetch is in flight. A background
     *  refresh does NOT flip this — the UI keeps its content. */
    public val isPending: MutableState<Boolean> = mutableStateOf(false)

    /** True whenever a fetch is in flight, foreground or background. */
    public val isFetching: MutableState<Boolean> = mutableStateOf(false)

    private var lastFetcher: (() -> T)? = null

    init {
        // Hydrate synchronously from the shared cache so a second screen
        // reading the same key paints immediately.
        PyreonQueryCache.lookup<T>(queryKey)?.let { data.value = it.first }
    }

    /** No cached value, or the cached value is older than staleMillis. The
     *  emit's LaunchedEffect guards on this so a fresh hit skips the network. */
    public val isStale: Boolean
        get() {
            val hit = PyreonQueryCache.lookup<T>(queryKey) ?: return true
            return hit.second >= staleMillis
        }

    /** Enter the in-flight state. isPending only when there is no data. */
    public fun begin() {
        isFetching.value = true
        if (data.value == null) isPending.value = true
        error.value = null
    }

    /** Complete with a value: set data, write through to the cache. */
    public fun resolve(value: T) {
        data.value = value
        error.value = null
        isPending.value = false
        isFetching.value = false
        PyreonQueryCache.write(queryKey, value as Any)
    }

    /** Complete with a failure: leaves prior/cached data in place. */
    public fun reject(failure: Throwable) {
        error.value = failure
        isPending.value = false
        isFetching.value = false
    }

    /** Run a synchronous fetcher; skips when the cache is fresh. */
    public fun load(fetcher: () -> T) {
        lastFetcher = fetcher
        if (!isStale) return
        reload()
    }

    /** Force a fetch, ignoring staleness. */
    public fun refetch(): Unit = reload()

    private fun reload() {
        val fetcher = lastFetcher ?: return
        begin()
        try {
            resolve(fetcher())
        } catch (t: Throwable) {
            reject(t)
        }
    }
}
