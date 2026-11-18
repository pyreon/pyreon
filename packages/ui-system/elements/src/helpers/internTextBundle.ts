/**
 * Stable identity for Text's `$text` bundle (`{ extraStyles: css }`), so the
 * styler's per-definition `$element`/`$text` class cache hits on every mount
 * after the first instead of re-running the whole CSS pipeline (`resolve`,
 * `makeItResponsive`, `normalizeCSS`, the sheet-insert hash) per Text.
 *
 * - No `css` (the dominant case — every rocketstyle Text base): one shared
 *   bundle.
 * - An object or function `css` (`CSSResult`, a style callback): keyed by that
 *   value's identity in a WeakMap — the entry dies with the value, so an
 *   inline callback re-created per render costs a miss, never a leak.
 * - A string `css`: keyed by the string in a 256-entry LRU, same bound as
 *   `internElementBundle`.
 *
 * Bundles are never mutated downstream (styler reads `$text.extraStyles`).
 */
import { SizedMap } from '@pyreon/sized-map'

export type TextBundle = { extraStyles: unknown }

const EMPTY: TextBundle = { extraStyles: undefined }
const _byRef = new WeakMap<object, TextBundle>()
const _byString = new SizedMap<string, TextBundle>({ maxEntries: 256, lru: true })

export const internTextBundle = (css: unknown): TextBundle => {
  if (css === undefined) return EMPTY
  if (typeof css === 'string') {
    let b = _byString.get(css)
    if (!b) {
      b = { extraStyles: css }
      _byString.set(css, b)
    }
    return b
  }
  if ((typeof css === 'object' && css !== null) || typeof css === 'function') {
    let b = _byRef.get(css)
    if (!b) {
      b = { extraStyles: css }
      _byRef.set(css, b)
    }
    return b
  }
  // null / other primitives: rare, not worth a cache.
  return { extraStyles: css }
}
