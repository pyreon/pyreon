import type { LineIndex } from "./utils/source"

/**
 * Simple in-memory cache for parsed ASTs keyed by file content hash.
 *
 * Uses FNV-1a hash of source text as cache key for fast lookups
 * during repeat runs (e.g., watch mode).
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
  private cache = new Map<string, { program: any; lineIndex: LineIndex }>()

  get(sourceText: string): { program: any; lineIndex: LineIndex } | undefined {
    const key = fnv1aHash(sourceText)
    return this.cache.get(key)
  }

  set(sourceText: string, value: { program: any; lineIndex: LineIndex }): void {
    const key = fnv1aHash(sourceText)
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
