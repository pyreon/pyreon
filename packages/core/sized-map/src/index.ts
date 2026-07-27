export interface SizedMapOptions {
  /** Max entries before oldest is evicted. */
  maxEntries: number
  /**
   * When true, `.get()` moves the entry to the tail (LRU-on-read semantics).
   * When false, `.get()` does NOT touch the entry (pure FIFO).
   * Default: false.
   */
  lru?: boolean
}

/**
 * Bounded `Map<K, V>` that evicts the oldest entry when the size cap is
 * exceeded. JavaScript's native `Map` preserves insertion order, so the
 * first key returned by `.keys()` is always the oldest.
 *
 * Two modes, selected per-instance:
 * - **FIFO** (`lru: false`, default) — `.get()` does NOT touch ordering.
 *   Cheapest semantics; fits hot paths where the per-call cost of a
 *   recency-bump (a `delete` + `set` pair) dominates the real work.
 * - **LRU-on-read** (`lru: true`) — `.get()` re-inserts the entry at the
 *   tail; the least-recently-USED entry is evicted on overflow.
 *
 * In BOTH modes, `.set()` treats a key collision as a recency hit (the
 * old entry is removed and the new one appended at the tail). This is
 * what keeps a just-written entry from being evicted on the next call.
 */
export class SizedMap<K, V> {
  private readonly _map = new Map<K, V>()
  private readonly _maxEntries: number
  private readonly _lru: boolean

  constructor(opts: SizedMapOptions) {
    this._maxEntries = Math.max(1, opts.maxEntries)
    this._lru = opts.lru === true
  }

  get(key: K): V | undefined {
    const value = this._map.get(key)
    if (value === undefined) return undefined
    if (this._lru) {
      // Touch — move to tail by re-inserting (Map preserves insertion order).
      this._map.delete(key)
      this._map.set(key, value)
    }
    return value
  }

  set(key: K, value: V): void {
    // If already present, refresh position (treat as a recency hit). This is
    // unconditional — both FIFO and LRU callers depend on a just-written
    // entry sitting at the tail, not getting evicted on the next set.
    if (this._map.has(key)) {
      this._map.delete(key)
    } else if (this._map.size >= this._maxEntries) {
      // Evict oldest — Map iterates in insertion order, so the FIRST key
      // is the least-recently-inserted (or, under LRU, the least-recently
      // USED — `.get` already moved touched entries to the tail).
      //
      // This branch runs only when `size >= maxEntries`, and the constructor
      // floors `maxEntries` at 1 (`Math.max(1, …)`), so the map is guaranteed
      // non-empty here — the oldest key is always defined. The assertion
      // documents that invariant and avoids an uncoverable `=== undefined`
      // branch (deleting `undefined` would be a harmless Map no-op regardless).
      const oldest = this._map.keys().next().value as K
      this._map.delete(oldest)
    }
    this._map.set(key, value)
  }

  delete(key: K): boolean {
    return this._map.delete(key)
  }

  has(key: K): boolean {
    return this._map.has(key)
  }

  clear(): void {
    this._map.clear()
  }

  get size(): number {
    return this._map.size
  }

  keys(): IterableIterator<K> {
    return this._map.keys()
  }

  values(): IterableIterator<V> {
    return this._map.values()
  }

  entries(): IterableIterator<[K, V]> {
    return this._map.entries()
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this._map[Symbol.iterator]()
  }
}
