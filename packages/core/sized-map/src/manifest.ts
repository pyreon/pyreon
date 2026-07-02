import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/sized-map',
  title: 'Sized Map',
  tagline:
    'Bounded Map<K, V> — evicts the oldest entry at a maxEntries cap; FIFO (default) or LRU-on-read mode',
  description:
    "A bounded `Map<K, V>` primitive that evicts the oldest entry when a size cap is exceeded. Two modes per instance: FIFO (default) — `.get()` never touches ordering, cheapest semantics for hot paths; LRU-on-read (`lru: true`) — `.get()` re-inserts the entry at the tail so frequently-read entries survive cap pressure. In BOTH modes `.set()` treats a key collision as a recency hit (delete + re-append at the tail). It is the one shared eviction implementation behind Pyreon's internal sized caches — it replaced 9 hand-rolled inline eviction snippets (Memory Leak Class C).",
  category: 'universal',
  features: [
    'FIFO mode (default) — .get() does NOT touch ordering; eviction drops the first-inserted entry',
    'LRU-on-read mode (lru: true) — .get() re-inserts at the tail; eviction drops the least-recently-used entry',
    '.set() on an existing key always refreshes recency (delete + re-append) in both modes',
    'Map-shaped surface: get / set / delete / has / clear / size / keys / values / entries / [Symbol.iterator]',
    "Zero dependencies — used internally by runtime-dom's _tplCache, router's component/loader caches, zero's ISR memory store, rocketstyle's theme memo, lint's AstCache",
  ],
  api: [
    {
      name: 'SizedMap',
      kind: 'class',
      signature: 'new SizedMap<K, V>(opts: SizedMapOptions)',
      summary:
        'Bounded `Map<K, V>` that evicts the oldest entry when `maxEntries` is exceeded, relying on the native Map insertion-order guarantee (the first key is always the oldest). Default mode is FIFO: `.get()` is a pure read. Pass `lru: true` for LRU-on-read: `.get()` re-inserts the touched entry at the tail (a delete + set pair) so eviction drops the least-recently-USED entry. `.set()` on an existing key removes the old entry and appends the new one at the tail in BOTH modes — a just-written entry is never the next eviction victim. The constructor floors `maxEntries` at 1.',
      example: `import { SizedMap } from '@pyreon/sized-map'

// FIFO (default) — hot path: get() never touches ordering
const tplCache = new SizedMap<string, HTMLTemplateElement>({ maxEntries: 1024 })
tplCache.set('key', tpl)
tplCache.get('key')      // pure read — no recency bump

// LRU-on-read — frequently-read entries survive small caps
const memo = new SizedMap<string, Entry>({ maxEntries: 128, lru: true })
memo.get('hot')          // re-inserted at the tail — evicted last

// Map-shaped surface
memo.has('hot')          // true
memo.size                // number (getter, not a method)
for (const [k, v] of memo) { /* insertion/recency order */ }`,
      mistakes: [
        'Expecting `.get()` to bump recency by default — the default mode is FIFO (a pure read); pass `lru: true` at construction for LRU-on-read semantics',
        'Passing `maxEntries: 0` to disable storage — the constructor floors the cap at 1 (`Math.max(1, maxEntries)`); there is no "always evict" configuration',
        'Storing `undefined` as a value — `.get()` treats a stored `undefined` as a miss (early return before the LRU touch), so `has(key)` can be `true` while `get(key)` never bumps recency; store a sentinel instead',
        'Expecting eviction when `.set()` hits an EXISTING key at cap — a key collision refreshes the entry in place (delete + re-append) without evicting anything; only a NEW key at cap evicts the oldest',
        'Treating it as a `Map` subclass — it wraps a private Map, so it is not `instanceof Map` and has no `forEach`; iterate via `entries()` / `[Symbol.iterator]`',
      ],
      seeAlso: ['SizedMapOptions'],
    },
    {
      name: 'SizedMapOptions',
      kind: 'type',
      signature: 'interface SizedMapOptions { maxEntries: number; lru?: boolean }',
      summary:
        'Constructor options. `maxEntries` is the size cap before the oldest entry is evicted (floored at 1). `lru` (default `false`) selects LRU-on-read mode — `.get()` moves the entry to the tail; when `false` the map is pure FIFO and `.get()` does not touch ordering.',
      example: `const opts: SizedMapOptions = { maxEntries: 256, lru: true }
const cache = new SizedMap<string, string>(opts)`,
      seeAlso: ['SizedMap'],
    },
  ],
  gotchas: [
    {
      label: 'Mode choice',
      note: 'FIFO fits hot paths where a per-read recency bump (a `delete` + `set` pair) would dominate the real work (runtime-dom `_tplCache`, router loader/component caches). LRU-on-read fits caches where frequently-read entries must survive small caps (rocketstyle `_rsMemo`, `@pyreon/lint` AstCache, `@pyreon/zero` ISR `createMemoryStore`).',
    },
    {
      label: 'Not a Map subclass',
      note: 'SizedMap wraps a private `Map` rather than extending it — `instanceof Map` is `false` and there is no `forEach`. The surface is `get` / `set` / `delete` / `has` / `clear` / `size` (getter) / `keys` / `values` / `entries` / `[Symbol.iterator]`.',
    },
  ],
})
