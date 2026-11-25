// ─── Module-level state of the zero-content Vite plugin ───────────────────
//
// Lives outside `plugin.ts` (the `@pyreon/zero-content/plugin` entry) so the
// test-reset helpers are not part of that public entry. They are exposed only
// through `@pyreon/zero-content/internal-server`.

/** One compiled markdown module, cached across plugin instances (see plugin.ts). */
export interface CompiledCacheEntry {
  code: string
  componentRefs: string[]
  hoistedEsm: string[]
  frontmatter: Record<string, unknown>
  headings: Array<{ level: number; text: string; slug: string }>
  slug: string
  /** Original source — used to populate the search-index body that the
   * cached-path skip would otherwise miss. */
  source: string
}

/**
 * Cross-build markdown compile cache. Bounded: `setCompileCacheEntry` evicts
 * the oldest insertion at `COMPILE_CACHE_LIMIT`; a `content.config` change
 * clears it.
 */
export const COMPILE_CACHE = new Map<string, CompiledCacheEntry>()
const COMPILE_CACHE_LIMIT = 4096

export function setCompileCacheEntry(key: string, entry: CompiledCacheEntry): void {
  if (COMPILE_CACHE.size >= COMPILE_CACHE_LIMIT) {
    // Trim the oldest insertion (Map preserves insertion order).
    const firstKey = COMPILE_CACHE.keys().next().value
    if (firstKey !== undefined) COMPILE_CACHE.delete(firstKey)
  }
  COMPILE_CACHE.set(key, entry)
}

/**
 * Test-only — wipe the cross-build cache so suites don't leak state.
 *
 * @internal
 */
export function _resetCompileCacheForTesting(): void {
  COMPILE_CACHE.clear()
}

let resolvedRoot: string | null = null

/** The Vite root recorded by `configResolved`, or `null` before it runs. */
export function resolvedRootForPaths(): string | null {
  return resolvedRoot
}

/**
 * Record the resolved Vite root so `reportPath` can produce
 * repo-relative paths in plugin error messages. Called from
 * `configResolved`; tests reach it as `_setResolvedRootForPaths` from
 * `@pyreon/zero-content/internal-server`.
 *
 * @internal
 */
export function setResolvedRootForPaths(root: string | null): void {
  resolvedRoot = root
}

