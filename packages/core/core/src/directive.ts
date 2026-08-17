/**
 * Directives — element behaviours that compose.
 *
 * A directive is a plain function `(el) => cleanup | void`. `use()` folds any
 * number of them into a single ref callback, so attaching N behaviours to an
 * element costs one attribute instead of a ref declaration, N hook calls and a
 * ref attach.
 *
 * Nothing here is special-cased by the compiler or the renderer — `use()`
 * returns an ordinary `RefCallback`, which the runtime already invokes with the
 * element on mount and with `null` on unmount.
 */

import type { RefCallback } from './ref'

/**
 * An element behaviour. Receives the element on attach; may return a cleanup
 * function which runs when the element is removed (or before a re-attach).
 *
 * @example
 * const autoFocus: Directive = (el) => { el.focus() }
 *
 * const clickOutside = (cb: () => void): Directive => (el) => {
 *   const h = (e: Event) => { if (!el.contains(e.target as Node)) cb() }
 *   document.addEventListener('mousedown', h)
 *   return () => document.removeEventListener('mousedown', h)
 * }
 */
export type Directive<T extends Element = HTMLElement> = (
  el: T,
) => (() => void) | void

/**
 * Entries accepted by {@link use}. Falsy entries are skipped, so a directive
 * can be applied conditionally inline — `use(base, isOpen && trapFocus())`.
 */
export type DirectiveEntry<T extends Element = HTMLElement> =
  | Directive<T>
  | false
  | null
  | undefined

/**
 * Compose directives into one ref callback.
 *
 * Cleanups run in reverse attach order (LIFO), matching ordinary teardown
 * expectations when one directive's setup depends on an earlier one's.
 *
 * Behaviour bundles are plain arrays, so composition is a spread:
 * `use(...dialogBehaviours, autoFocus)`.
 *
 * @example
 * <div ref={use(autoFocus, clickOutside(close), hotkey({ Escape: close }))} />
 */
export function use<T extends Element = HTMLElement>(
  ...directives: DirectiveEntry<T>[]
): RefCallback<T> {
  let cleanups: (() => void)[] | null = null

  const detach = (): void => {
    if (cleanups === null) return
    // LIFO — a later directive may depend on state an earlier one installed.
    for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]!()
    cleanups = null
  }

  return (el: T | null): void => {
    // Idempotent by construction: a second attach without an intervening
    // detach (KeepAlive re-mount, a re-applied spread) tears the previous
    // registration down first rather than stacking listeners on it.
    detach()
    if (el === null) return

    const collected: (() => void)[] = []
    // Assign BEFORE running, so a directive that throws part-way still leaves
    // the already-registered cleanups reachable from the unmount call.
    cleanups = collected
    for (const d of directives) {
      if (!d) continue
      const c = d(el)
      if (typeof c === 'function') collected.push(c)
    }
  }
}
