/**
 * Detect a plain object (literal `{}` or `Object.create(null)`). Arrays, class
 * instances, Maps, Sets, Dates, Promises and DOM elements are NOT plain
 * objects. `deepMerge` uses it to decide whether to recurse or replace.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/**
 * Whether `value` is what an inline `<script>window.__PYREON_STORE_STATE__={…}</script>`
 * evaluates to: an object literal (prototype `Object.prototype`). Stricter
 * than {@link isPlainObject}, for a value read from a page global.
 *
 * In a browser, markup with `id="X"` (or `<iframe name="X">`, `<form name>`,
 * `<embed name>`, `<object name>`, `<img name>`) makes the global `X` resolve
 * to that element or frame whenever no script assigned it (named access on
 * Window). A null-prototype object is refused: a CROSS-ORIGIN frame's
 * WindowProxy reports prototype `null`, and reading any key of it throws
 * SecurityError.
 */
export function isObjectLiteral(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  try {
    return Object.getPrototypeOf(value) === Object.prototype
  } catch {
    // A Proxy's `getPrototypeOf` trap can throw; whatever it is, it is not
    // a literal.
    return false
  }
}
