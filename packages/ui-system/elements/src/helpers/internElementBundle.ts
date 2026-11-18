import { SizedMap } from '@pyreon/sized-map'

/**
 * Module-scope intern cache for `$element` bundles passed to Wrapper's styled
 * component. Same primitive prop tuple → same object identity, so the styler's
 * `elClassCache` (added 2026-Q2 alongside this) hits and skips the resolve
 * pipeline. Analogous to `@pyreon/rocketstyle`'s dimension-prop memo
 * but at the layer below — covers non-rocketstyle Element / Wrapper / Text usage
 * AND the residual styled wrappers under any rocketstyle component.
 *
 * Cache key is a JSON-stringified shallow snapshot of the bundle. LRU-bound at
 * 256 entries (LRU-on-read so frequently-cloned bundles survive cap pressure
 * from rare ones). Bail (return the input as-is, no cache) when any value is a
 * function (signal accessor) or a non-string object (CSS callback / CSSResult /
 * nested object) — those cannot be safely round-tripped through JSON without
 * losing identity guarantees.
 */
const _bundleCache = new SizedMap<string, Record<string, unknown>>({
  maxEntries: 256,
  lru: true,
})

export const internElementBundle = <T extends Record<string, unknown>>(bundle: T): T => {
  for (const k in bundle) {
    const v = bundle[k]
    if (typeof v === 'function') return bundle
    if (v != null && typeof v === 'object') return bundle
  }
  const key = JSON.stringify(bundle)
  const existing = _bundleCache.get(key)
  if (existing) return existing as T
  _bundleCache.set(key, bundle)
  return bundle
}
