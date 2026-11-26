/**
 * Whether `value` is what an inline `<script>window.X={…}</script>` evaluates
 * to: an object literal (prototype `Object.prototype`). Zero's client reads
 * its server hand-over globals through this.
 *
 * Truthiness and `typeof === 'object'` are not enough: in a browser, markup
 * with `id="X"` (or `<iframe name="X">`, `<form name>`, `<embed name>`,
 * `<object name>`, `<img name>`) makes the global `X` resolve to that element
 * or frame whenever no script assigned it (named access on Window). A
 * null-prototype object is refused too: a CROSS-ORIGIN frame's WindowProxy
 * reports prototype `null`, and reading any key of it throws SecurityError.
 * `@pyreon/router`'s `hydrateLoaderData` and `@pyreon/store`'s `hydrateStores`
 * apply the same rule to what they are given.
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
