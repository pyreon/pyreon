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
// The query OWNS its request: the compiler-emitted LaunchedEffect harness
// hands the request it built to run(), which keeps it and fetches when the
// cache is stale. Keeping it is what makes refetch() work — it re-runs that
// same request, ignoring staleness, long after the harness returned. Every
// fetch takes a generation number, so a slow response that a newer fetch (or
// a key change) superseded never overwrites the newer state.
//
// kotlinx-free: the harness also hands over a LAUNCHER (it wraps the
// composable's rememberCoroutineScope), so refetch() can start a coroutine
// that is cancelled when the composable leaves, without this file importing
// kotlinx.coroutines — the tests drive it with the stdlib alone. Deferred
// (disclosed): prefetch, retries, persistence.
//
// The cache is also the query CLIENT (the web's queryClient): a query that
// registered a request is LIVE, invalidateQueries(root) marks every entry
// under root stale and refetches every live query under it, setQueryData is
// the optimistic write, and settleMutation applies both on a mutation's
// outcome. A query leaves the live registry when Compose forgets it (it is a
// RememberObserver, and the emit remembers it directly), removed by identity.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.RememberObserver
import androidx.compose.runtime.mutableStateOf

/**
 * Process-global query cache, shared across every PyreonQuery instance so
 * two screens reading `["todos"]` hit the same entry. Values are stored as
 * `Any` (the queryKey implies the type; a mismatched cast is a miss).
 *
 * BOUNDED: past [maxEntries] the least recently used entry is evicted. A
 * runtime key (a route param, a prop) adds one entry per distinct value, so
 * an unbounded cache grows for the life of the process. Evicting is always
 * safe: a live PyreonQuery keeps its own `data`, so an evicted key costs only
 * a refetch on its next stale check.
 */
public object PyreonQueryCache {
    /** [invalidated]: set by [invalidateQueries] — still served (no blank), but
     *  stale whatever its age, so the next check refetches. */
    private class Entry(val value: Any, val atMillis: Long, var invalidated: Boolean = false)

    /** Live queries (they registered a request) → their current key. By
     *  identity; a query removes itself when Compose forgets it. */
    private val live = java.util.IdentityHashMap<PyreonQuery<*>, String>()

    private val lock = Any()
    private var limit = 100

    /** The most entries kept before the least recently used is evicted.
     *  Settable per app (`PyreonQueryCache.maxEntries = 500`); lowering it
     *  evicts down to the new bound on the next write. */
    public var maxEntries: Int
        get() = synchronized(lock) { limit }
        set(value) = synchronized(lock) { limit = maxOf(1, value) }

    // Access-ordered: get() and put() move a key to the most-recent end, and
    // removeEldestEntry drops from the other end.
    private val store = object : LinkedHashMap<String, Entry>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Entry>): Boolean = size > limit
    }

    /** Number of cached entries (for tests and diagnostics). */
    public val count: Int get() = synchronized(lock) { store.size }

    /** Nanosecond-free clock via System.currentTimeMillis for testability. */
    internal fun now(): Long = System.currentTimeMillis()

    /** The cached value and its age; an invalidated entry is infinitely old. */
    @Suppress("UNCHECKED_CAST")
    internal fun <T> lookup(key: String): Pair<T, Long>? = synchronized(lock) {
        val e = store[key] ?: return null
        val typed = e.value as? T ?: return null
        typed to (if (e.invalidated) Long.MAX_VALUE else now() - e.atMillis)
    }

    internal fun write(key: String, value: Any): Unit = synchronized(lock) {
        store[key] = Entry(value, now())
        // removeEldestEntry drops one entry per put; after maxEntries is
        // LOWERED there can be more than one to shed.
        while (store.size > limit) {
            val eldest = store.keys.iterator()
            eldest.next()
            eldest.remove()
        }
    }

    /** Drop a key (invalidation). */
    public fun invalidate(key: String): Unit = synchronized(lock) {
        store.remove(key)
    }

    /** Test seam — clear everything between cases. */
    public fun clearAll(): Unit = synchronized(lock) {
        store.clear()
        live.clear()
    }

    // --- The query client: live queries, invalidation, optimistic writes ---

    /** Number of live (registered) queries — for tests and diagnostics. */
    public val liveCount: Int get() = synchronized(lock) { live.size }

    internal fun register(query: PyreonQuery<*>, key: String): Unit = synchronized(lock) { live[query] = key }

    /** A registered query changed its key; an unregistered one stays out. */
    internal fun rekey(query: PyreonQuery<*>, key: String): Unit = synchronized(lock) {
        if (live.containsKey(query)) live[query] = key
    }

    internal fun unregister(query: PyreonQuery<*>): Unit = synchronized(lock) { live.remove(query) }

    // The root itself, or the root followed by `:` (a scoped key), `/` (a path
    // below a URL root: `GET:https://h/books` covers `…/books/1`) or `?` (its
    // query strings). Segment-safe: `/books` never covers `/bookshelf`.
    internal fun under(root: String, key: String): Boolean =
        key.startsWith(root) && (key.length == root.length || key[root.length].let { it == ':' || it == '/' || it == '?' })

    /**
     * `queryClient.invalidateQueries({ queryKey: [root] })`: every cached entry
     * under [root] (the key `root`, or one starting with `root:`) is marked
     * stale — still served, refetched on its next check — and every LIVE query
     * under it refetches now, on its composable's scope. Call on the main thread.
     */
    public fun invalidateQueries(root: String) {
        val queries = synchronized(lock) {
            for ((key, entry) in store) if (under(root, key)) entry.invalidated = true
            live.entries.filter { under(root, it.value) }.map { it.key }
        }
        for (query in queries) query.refetch()
    }

    /**
     * `queryClient.setQueryData(key, updater)` for an optimistic write: the
     * cached value under exactly [key] (or, when the cache evicted it, a live
     * query's data) is passed to [update], and the result is written to the
     * cache and shown by every live query on that key. A fetch those queries
     * have in flight is dropped (`cancelQueries`). Returns the rollback, or null
     * when there was no value of type [T] to update — the web writes the
     * PARTIAL patch then, which no typed record can hold. Call on the main thread.
     */
    public inline fun <reified T> setQueryData(key: String, noinline update: (T) -> T): PyreonQueryRollback? =
        setQueryDataOf(key, { it is T }, update)

    @PublishedApi
    @Suppress("UNCHECKED_CAST")
    internal fun <T> setQueryDataOf(key: String, isT: (Any?) -> Boolean, update: (T) -> T): PyreonQueryRollback? {
        val (previous, holders) = synchronized(lock) {
            store[key] to live.entries.filter { it.value == key }.map { it.key as PyreonQuery<T> }
        }
        val cached = previous?.value?.takeIf(isT) as T?
        val base: T = cached ?: holders.map { it.data.value }.firstOrNull { it != null && isT(it) } ?: return null
        val next = update(base)
        write(key, next as Any)
        val restores = holders.filter { it.data.value == null || isT(it.data.value) }.map { query ->
            val before = query.data.value
            query.cancelFetch()
            query.data.value = next
            val undo: () -> Unit = { query.data.value = before }
            undo
        }
        return PyreonQueryRollback {
            synchronized(lock) {
                if (previous != null) store[key] = previous else store.remove(key)
            }
            for (restore in restores) restore()
        }
    }

    /**
     * A mutation's request, settled the way the web's `onSuccess` / `onError`
     * settle the queries: success invalidates every query under [invalidating];
     * a failure rolls the optimistic write back and invalidates nothing. A
     * CANCELLED request (its composable left mid-flight) rolls back AND
     * invalidates — whether the server applied the write is unknown, so the
     * queries ask it.
     */
    public suspend fun <T> settleMutation(
        invalidating: String,
        rollback: PyreonQueryRollback? = null,
        operation: suspend () -> T,
    ): T {
        val value = try {
            operation()
        } catch (t: Throwable) {
            rollback?.rollback()
            if (t is kotlin.coroutines.cancellation.CancellationException) invalidateQueries(invalidating)
            throw t
        }
        invalidateQueries(invalidating)
        return value
    }
}

/** Undo of one optimistic [PyreonQueryCache.setQueryData]: restores the cached
 *  value and every live query's data as they were. Runs at most once. */
public class PyreonQueryRollback internal constructor(restore: () -> Unit) {
    private var restore: (() -> Unit)? = restore

    public fun rollback() {
        val run = restore
        restore = null
        run?.invoke()
    }
}

public class PyreonQuery<T>(
    queryKey: String,
    /** How long a cached value is served WITHOUT a refetch (millis; default 0
     *  = always revalidate, but serve the stale value instantly). */
    public val staleMillis: Long = 0,
) : RememberObserver {
    /** The cache key. A RUNTIME-keyed query (built from a prop/signal) is
     *  constructed keyless and re-pointed via [setKey] from the compiler's
     *  `LaunchedEffect(key)` harness. */
    public var queryKey: String = queryKey
        private set

    public val data: MutableState<T?> = mutableStateOf(null)
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    /** True when there is NO data yet AND a fetch is in flight. A background
     *  refresh does NOT flip this — the UI keeps its content. */
    public val isPending: MutableState<Boolean> = mutableStateOf(false)

    /** True whenever a fetch is in flight, foreground or background. */
    public val isFetching: MutableState<Boolean> = mutableStateOf(false)

    /** The request the harness registered through [run]; [refetch] re-runs it. */
    private var fetcher: (suspend () -> T)? = null

    /** Starts a coroutine on the composable's scope (registered with the request). */
    private var launcher: ((suspend () -> Unit) -> Unit)? = null

    /** Bumped by every fetch and every key change: a response settles state
     *  only while its own generation is still the latest. */
    private var generation = 0

    init {
        // Hydrate synchronously from the shared cache so a second screen
        // reading the same key paints immediately.
        PyreonQueryCache.lookup<T>(queryKey)?.let { data.value = it.first }
    }

    /** Re-point this query at a RUNTIME-computed cache key (a queryKey built
     *  from a prop/route-param/signal). The compiler-emitted
     *  `LaunchedEffect(key)` calls this before the staleness check, so a key
     *  change re-keys the cache lookup + write. Idempotent when unchanged; on a
     *  change, re-hydrates `data` from the shared cache for the NEW key (a hit
     *  paints without a refetch; a miss clears the stale value). Constructed
     *  keyless to mirror the SwiftUI `@State`-default constraint. */
    public fun setKey(key: String) {
        if (key == queryKey) return
        // A fetch still in flight belongs to the OLD key: drop its result (it
        // must not be cached under the new key) and its in-flight flags.
        generation += 1
        isFetching.value = false
        isPending.value = false
        queryKey = key
        data.value = PyreonQueryCache.lookup<T>(key)?.first
        PyreonQueryCache.rekey(this, key)
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

    /**
     * Register the request and fetch it when the cache is stale (a fresh hit
     * keeps the hydrated value and skips the network). The emitted
     * LaunchedEffect calls this with the request it builds and a [launch]
     * that starts a coroutine on the composable's scope; the query keeps both
     * so [refetch] can re-run the request later.
     */
    public suspend fun run(launch: (suspend () -> Unit) -> Unit, fetcher: suspend () -> T) {
        this.fetcher = fetcher
        this.launcher = launch
        // Holding a request makes it LIVE: an invalidation of its key refetches it.
        PyreonQueryCache.register(this, queryKey)
        if (!isStale) return
        fetch(fetcher)
    }

    /**
     * Force a fetch of the registered request, ignoring staleness (the user
     * pulled to refresh). isFetching is true until it settles; on success data
     * is replaced, on failure error is set and data kept. A no-op before the
     * harness registered a request.
     */
    public fun refetch() {
        val request = fetcher ?: return
        val launch = launcher ?: return
        launch { fetch(request) }
    }

    /** `cancelQueries`: a fetch in flight settles nothing (its response would
     *  overwrite an optimistic value), and the in-flight flags clear. */
    internal fun cancelFetch() {
        generation += 1
        isFetching.value = false
        isPending.value = false
    }

    /** Leave the live registry and drop the request (and the launcher, which
     *  holds the composable's scope). Compose calls this when the composable
     *  that remembered the query leaves; idempotent. */
    public fun dispose() {
        PyreonQueryCache.unregister(this)
        fetcher = null
        launcher = null
    }

    override fun onRemembered() {}

    override fun onForgotten(): Unit = dispose()

    override fun onAbandoned(): Unit = dispose()

    private suspend fun fetch(request: suspend () -> T) {
        generation += 1
        val mine = generation
        begin()
        val value = try {
            request()
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            // The composable left (or its key changed): not a failure to show.
            if (mine == generation) {
                isFetching.value = false
                isPending.value = false
            }
            throw e
        } catch (t: Throwable) {
            if (mine == generation) reject(t)
            return
        }
        // Superseded: a newer fetch owns the state.
        if (mine == generation) resolve(value)
    }
}
