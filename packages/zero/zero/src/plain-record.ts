/**
 * Whether `value` is what an inline `<script>window.X={…}</script>` evaluates
 * to: an object literal (prototype `Object.prototype`) or a null-prototype
 * record. Zero's client reads its server hand-over globals through this.
 *
 * Truthiness and `typeof === 'object'` are not enough: in a browser, markup
 * with `id="X"` makes the global `X` resolve to that element whenever no
 * script assigned it (named access on Window), and an element is an object.
 * `@pyreon/router`'s `hydrateLoaderData` and `@pyreon/store`'s `hydrateStores`
 * apply the same rule to what they are given.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
