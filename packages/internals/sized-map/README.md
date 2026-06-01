# @pyreon/sized-map

> **Private — internal to the Pyreon monorepo. Not published to npm.**

A bounded-`Map<K, V>` primitive that evicts the oldest entry when a size cap is exceeded. One implementation, two configurations:

- **FIFO** (default, `lru: false`) — `.get()` does NOT touch ordering; eviction always drops the first-inserted entry. Cheapest semantics, fits hot paths where re-insert-on-read would dominate (`runtime-dom`'s `_tplCache`).
- **LRU-on-read** (`lru: true`) — `.get()` re-inserts the entry at the tail (making it most-recently-used); eviction drops the least-recently-used entry. Standard cache semantics; fits cases where frequently-read entries should survive small caps (`@pyreon/lint`'s `AstCache`, `@pyreon/zero`'s ISR `createMemoryStore`, rocketstyle theme memo, element-bundle intern).

`.set()` ALWAYS treats a key collision as a recency hit — the old entry is removed and the new entry is appended at the tail. This applies in both modes; it's what callers depend on to keep "just-written" entries from being evicted on the very next call.

## Why

Before this package, 9 Pyreon files each carried their own ~10-line FIFO eviction snippet — same `map.keys().next().value` + `map.delete(oldest)` shape, slightly different (each had its own bugs at one point). The catalog of leaked-by-omission inline caches is documented in `.claude/rules/anti-patterns.md` under "Memory Leak Classes" (Class C).

This package collapses the 9 implementations to one. Each consumer passes an `SizedMapOptions` config; the eviction code lives in exactly one place.

## Quick start

```ts
import { SizedMap } from '@pyreon/sized-map'

// FIFO — hot path (template cache, class-string splitter, route loader cache)
const tplCache = new SizedMap<string, HTMLTemplateElement>({ maxEntries: 1024 })

// LRU-on-read — frequently-read entries survive cap pressure
const themeMemo = new SizedMap<string, RsMemoEntry>({ maxEntries: 128, lru: true })
```

## API

```ts
interface SizedMapOptions {
  /** Max entries before oldest is evicted. */
  maxEntries: number
  /**
   * When true, `.get()` moves the entry to the tail (LRU).
   * When false, `.get()` does NOT touch the entry (pure FIFO).
   * Default: false.
   */
  lru?: boolean
}

class SizedMap<K, V> {
  constructor(opts: SizedMapOptions)
  get(key: K): V | undefined
  set(key: K, value: V): void
  delete(key: K): boolean
  has(key: K): boolean
  clear(): void
  get size(): number
  keys(): IterableIterator<K>
  values(): IterableIterator<V>
  entries(): IterableIterator<[K, V]>
  [Symbol.iterator](): IterableIterator<[K, V]>
}
```
