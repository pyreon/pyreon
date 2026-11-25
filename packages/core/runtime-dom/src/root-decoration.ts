import type { NativeItem } from '@pyreon/core'

/**
 * DECLARED ROOT DECORATION (#4382). A component that adds `class` / `style` to
 * a compiled child element (kinetic's per-item hidden state) does it on the
 * client at mount, and on the server to the root tag of the child's raw HTML
 * (`withRootAttrs`). The server element's root then carries attributes the
 * template's static skeleton does not, and the static-skeleton gate refused
 * it: the item was re-created at hydration instead of adopted.
 *
 * The decorating component declares the decoration on the item it receives,
 * and for that item ONLY the gate leaves the ROOT's `class` and `style` out of
 * the comparison: the declaring component owns them and re-applies them at
 * mount. Every other attribute and every descendant is still compared. Carried
 * on the item (leak class C: never a registry), read once by its adoption.
 *
 * The brand is a registry symbol, so this module (reached only through
 * `@pyreon/runtime-dom/internal`) and `./template` (which reads it) agree on
 * it without sharing a module: a shared module would make the bundler split a
 * chunk between the two entries, which costs every app bytes for a one-line
 * helper. `declared-root-decoration.test.tsx` locks the two together.
 */
export const ROOT_DECORATED: unique symbol = Symbol.for('pyreon.rootDecorated') as never
export type DecoratedItem = NativeItem & { [ROOT_DECORATED]?: true }

export function _declareRootDecoration(item: NativeItem): void {
  ;(item as DecoratedItem)[ROOT_DECORATED] = true
}
