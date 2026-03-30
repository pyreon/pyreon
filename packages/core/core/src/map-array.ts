/**
 * mapArray — keyed reactive list mapping.
 *
 * Creates each mapped item exactly once per key, then reuses it across
 * updates. When the source array is reordered or partially changed, only
 * new keys invoke `map()`; existing entries return the cached result.
 *
 * This makes structural list operations (swap, sort, filter) O(k) in
 * allocations where k is the number of new/removed keys, not O(n).
 *
 * The returned accessor reads `source()` reactively, so it can be passed
 * directly to the keyed-list reconciler.
 */
export function mapArray<T, U>(
  source: () => T[],
  getKey: (item: T) => string | number,
  map: (item: T) => U,
): () => U[] {
  const cache = new Map<string | number, U>();

  return () => {
    const items = source();
    const result: U[] = [];
    const newKeys = new Set<string | number>();

    for (const item of items) {
      const key = getKey(item);
      newKeys.add(key);
      if (!cache.has(key)) {
        cache.set(key, map(item));
      }
      result.push(cache.get(key) as U);
    }

    // Evict entries whose keys are no longer present
    for (const key of cache.keys()) {
      if (!newKeys.has(key)) cache.delete(key);
    }

    return result;
  };
}
