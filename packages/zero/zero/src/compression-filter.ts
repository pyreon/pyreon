// ─── compression-filter.ts ─────────────────────────────────────────────────
//
// Internal: the content-type filter `compressionMiddleware` applies. Split
// out of the public entry `compression.ts`, which imports from here, so these
// helpers are not public API; their unit tests reach them through
// `@pyreon/zero/internal-server`.

const COMPRESSIBLE_TYPES = [
  'text/',
  'application/json',
  'application/javascript',
  'application/xml',
  'application/xhtml+xml',
  'image/svg+xml',
]

/**
 * Check if a content type is compressible.
 *
 * @internal exported for testing
 */
export function isCompressible(contentType: string): boolean {
  return COMPRESSIBLE_TYPES.some((t) => contentType.includes(t))
}
