package com.pyreon.runtime

/**
 * PyreonSizedMap — the native runtime `@pyreon/sized-map` lowers to.
 *
 * A bounded map that evicts the OLDEST entry once the cap is exceeded, in two
 * modes selected per instance:
 *
 *  - FIFO (default) — [get] does NOT touch ordering. Cheapest semantics.
 *  - LRU-on-read ([lru] = true) — [get] moves the entry to the tail, so the
 *    least-recently-USED entry is the one evicted.
 *
 * In BOTH modes [set] treats a key collision as a recency hit: the old entry is
 * removed and the new one appended at the tail. That is what stops a
 * just-written entry from being evicted on the very next call, and it is easy
 * to miss by reading only the LRU branch.
 *
 * Unlike the Swift sibling, Kotlin's [LinkedHashMap] DOES preserve insertion
 * order, so this mirrors the web implementation almost line for line. It is
 * deliberately NOT built on `LinkedHashMap(capacity, loadFactor, accessOrder =
 * true)` + `removeEldestEntry`, even though that would be shorter: that
 * constructor makes every read reorder, which is the LRU mode only, and the
 * FIFO mode is the DEFAULT here. Expressing both from one explicit code path
 * keeps the two platforms provably identical rather than "close enough".
 */
class PyreonSizedMap<K, V>(maxEntries: Int, private val lru: Boolean = false) {
    /** Floored at 1, mirroring the web's `Math.max(1, …)`. A cap of 0 would
     *  make [set] evict the entry it just wrote. */
    private val maxEntries: Int = maxOf(1, maxEntries)
    private val storage = LinkedHashMap<K, V>()

    val size: Int get() = storage.size

    /** Reads the value. Under [lru] this MUTATES the ordering — the entry
     *  moves to the tail — which is why it is a function, not a getter. */
    fun get(key: K): V? {
        val value = storage[key] ?: return null
        if (lru) {
            // Touch — re-insert at the tail. LinkedHashMap keeps insertion
            // order, so remove-then-put is the move.
            storage.remove(key)
            storage[key] = value
        }
        return value
    }

    fun set(key: K, value: V) {
        if (storage.containsKey(key)) {
            // Present already: refresh position rather than evict. Both modes
            // depend on this, not just LRU.
            storage.remove(key)
        } else if (storage.size >= maxEntries) {
            // Evict the oldest. Non-empty here: the count reached the cap and
            // the cap is at least 1.
            val oldest = storage.keys.first()
            storage.remove(oldest)
        }
        storage[key] = value
    }

    fun delete(key: K): Boolean = storage.remove(key) != null

    fun has(key: K): Boolean = storage.containsKey(key)

    fun clear() = storage.clear()

    /** Keys in eviction order, oldest first — the same order the web's
     *  `.keys()` yields, which is what makes an assertion port across. */
    fun keys(): List<K> = storage.keys.toList()

    fun values(): List<V> = storage.values.toList()

    fun entries(): List<Pair<K, V>> = storage.entries.map { it.key to it.value }
}
