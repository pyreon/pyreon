/**
 * Detect a plain object (literal `{}` or `Object.create(null)`). Arrays, class
 * instances, Maps, Sets, Dates, Promises and DOM elements are NOT plain
 * objects. `deepMerge` uses it to decide whether to recurse or replace;
 * `hydrateStores` uses it to accept only what an inline
 * `<script>window.__PYREON_STORE_STATE__={…}</script>` evaluates to.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}
