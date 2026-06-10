---
title: "@pyreon/sized-map"
---

# @pyreon/sized-map

A bounded-`Map<K, V>` primitive that evicts the oldest entry when a size cap is exceeded. Single implementation, two configurations — FIFO or LRU-on-read.

## Install

```sh
bun add @pyreon/sized-map
```

## Why

Bounded maps are the standard fix for "Class C — unbounded caches" leaks (see [Memory Leak Classes](https://github.com/pyreon/pyreon/blob/main/.claude/rules/anti-patterns.md)). Before this package, 9 Pyreon files each carried their own ~10-line FIFO eviction snippet — same `map.keys().next().value` + `map.delete(oldest)` shape, but each grown with its own subtle bugs over time. `@pyreon/sized-map` collapses the 9 implementations to one. The eviction code lives in exactly one place.

Used internally by:

- `@pyreon/runtime-dom` — `_tplCache` (FIFO; template cloneNode cache)
- `@pyreon/styler` — class-string splitter, `elClassCache`
- `@pyreon/router` — loader cache
- `@pyreon/lint` — `AstCache` (LRU-on-read)
- `@pyreon/zero` — ISR `createMemoryStore` (LRU-on-read)
- `@pyreon/rocketstyle` — theme memo (LRU-on-read)
- `@pyreon/elements` — element-bundle intern

The package is published independently and safe to use directly.

## Two modes

| Mode | `lru` option | `.get()` behaviour | Eviction drops | Fits |
|---|---|---|---|---|
| **FIFO** | `false` (default) | does NOT touch ordering | first-inserted entry | hot paths where re-insert-on-read would dominate (template cache, route cache) |
| **LRU-on-read** | `true` | moves entry to the tail (most-recently-used) | least-recently-used entry | standard cache semantics (AST cache, theme memo, ISR store) |

`.set()` ALWAYS treats a key collision as a recency hit in both modes — the old entry is removed and the new entry is appended at the tail. Callers depend on this to keep "just-written" entries from being evicted on the very next call.

## Quick start

```ts
import { SizedMap } from '@pyreon/sized-map'

// FIFO — hot path
const tplCache = new SizedMap<string, HTMLTemplateElement>({ maxEntries: 1024 })

tplCache.set('div.foo', tpl)
tplCache.get('div.foo') // tpl — does not reorder

// LRU-on-read — frequently-read entries survive cap pressure
const themeMemo = new SizedMap<string, RsMemoEntry>({
  maxEntries: 128,
  lru: true,
})

themeMemo.set('primary|md', entry)
themeMemo.get('primary|md') // entry — bumped to MRU; survives the next eviction
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
  readonly size: number
  keys(): IterableIterator<K>
  values(): IterableIterator<V>
  entries(): IterableIterator<[K, V]>
  [Symbol.iterator](): IterableIterator<[K, V]>
}
```

### Iteration order

Both modes iterate in **insertion order** (oldest first → newest last). `Map`'s native iteration order is preserved across `.set()`/`.delete()`. For LRU-on-read, `.get()` re-orders the entry to the tail, which IS visible to subsequent iteration.

## Choosing FIFO vs LRU-on-read

**Default to FIFO unless you have evidence that re-ordering on read is worth the write.** Each `.get()` in LRU mode performs an internal `delete + set` to move the entry — measurable cost in tight loops. Use LRU only when read frequency genuinely correlates with future access (e.g. AST cache where 80% of files are read repeatedly during a session).

For high-churn caches where most reads are followed by a write anyway (template cache, route cache), FIFO is strictly cheaper and behaviourally equivalent.

## When NOT to reach for `@pyreon/sized-map`

- **Tiny caps (≤16)** — a plain `Map` + manual eviction may be smaller code than the import. Use this package when the cap is ≥32 entries OR the cache is shared across multiple call sites.
- **TTL-based eviction** — `SizedMap` is size-bounded, not time-bounded. For TTL-based caches (revalidation, ISR), pair this with a per-entry timestamp or use `@pyreon/zero`'s `createISRHandler` cache.
- **WeakMap semantics** — when entries should be eligible for GC when the key has no other references, use `WeakMap` (no eviction needed, no cap).

## See also

- [Memory Leak Classes catalog](https://github.com/pyreon/pyreon/blob/main/.claude/rules/anti-patterns.md) — the bug class this package exists to prevent.
- [`@pyreon/lint` `AstCache`](https://github.com/pyreon/pyreon/blob/main/packages/tools/lint/src/cache.ts) — reference LRU consumer.
- [`@pyreon/runtime-dom` `_tplCache`](https://github.com/pyreon/pyreon/blob/main/packages/core/runtime-dom/src/template.ts) — reference FIFO consumer.
