// ─── cache-glob.ts ─────────────────────────────────────────────────────────
//
// Internal: the glob matcher `cacheMiddleware` uses for its `rules` patterns.
// Split out of the public entry `cache.ts`, which imports from here, so these
// helpers are not public API; their unit tests reach them through
// `@pyreon/zero/internal-server`.

/** @internal Exported for testing */
export function matchGlob(pattern: string, path: string): boolean {
  // Escape regex special chars, then convert glob wildcards
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${regex}$`).test(path)
}
