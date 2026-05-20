import type { LineIndex } from './utils/source'

/**
 * Default LRU cap. Each entry holds a parsed oxc AST (multi-MB for a
 * medium TSX file) — a long-lived LSP / `pyreon-lint --watch` process
 * editing across many files would otherwise grow the cache unboundedly.
 * 256 covers ~typical hot-set with negligible memory + preserves the
 * "repeat run within the same content" hit semantics. Apps that lint
 * thousands of distinct files in tight succession can bump the cap via
 * `new AstCache(2048)`.
 */
const DEFAULT_MAX_ENTRIES = 256

/**
 * LRU-bounded in-memory cache for parsed ASTs keyed by file content hash.
 *
 * Uses FNV-1a hash of source text as cache key for fast lookups
 * during repeat runs (e.g., watch mode). Each entry holds a multi-MB
 * parsed AST; the LRU bound (default {@link DEFAULT_MAX_ENTRIES})
 * prevents long-lived processes (LSP session, `pyreon-lint --watch`)
 * from accumulating the AST of every content snapshot ever seen.
 *
 * LRU semantics: on every `get` or `set` for a key, that entry becomes
 * the most-recently-used. When `set` would exceed `maxEntries`, the
 * least-recently-used entry is evicted (`Map` preserves insertion order,
 * so re-inserting on hit moves the entry to the tail).
 *
 * @example
 * ```ts
 * import { AstCache } from "@pyreon/lint"
 *
 * const cache = new AstCache()
 * const cached = cache.get(sourceText)
 * if (!cached) {
 *   const parsed = parse(sourceText)
 *   cache.set(sourceText, parsed)
 * }
 * ```
 */
export class AstCache {
  private cache = new Map<string, { program: unknown; lineIndex: LineIndex }>()
  private readonly maxEntries: number

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = Math.max(1, maxEntries)
  }

  get(sourceText: string): { program: unknown; lineIndex: LineIndex } | undefined {
    const key = fnv1aHash(sourceText)
    const value = this.cache.get(key)
    if (value === undefined) return undefined
    // Touch — move to tail by re-inserting (Map preserves insertion order).
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(sourceText: string, value: { program: unknown; lineIndex: LineIndex }): void {
    const key = fnv1aHash(sourceText)
    // If already present, refresh position (treat as a recency hit).
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest — Map preserves insertion order, so the FIRST key
      // returned by .keys() is the least-recently-used.
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, value)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

/** FNV-1a hash — fast, non-cryptographic, low collision rate. */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) | 0 // FNV prime, keep 32-bit
  }
  return (hash >>> 0).toString(36)
}
