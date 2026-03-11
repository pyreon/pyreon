import type { NativeItem } from "@pyreon/core"

/**
 * Creates a row/item factory backed by HTML template cloning.
 *
 * - The HTML string is parsed exactly once via <template>.innerHTML.
 * - Each call to the returned factory clones the root element via
 *   cloneNode(true) — ~5-10x faster than createElement + setAttribute.
 * - `bind` receives the cloned element and the item; it should wire up
 *   reactive effects and return a cleanup function.
 * - Returns a NativeItem directly (no VNode wrapper) — saves 2 allocations
 *   per row vs the old VNode + props-object + children-array approach.
 *
 * @example
 * const rowTemplate = createTemplate<Row>(
 *   "<tr><td></td><td></td></tr>",
 *   (el, row) => {
 *     const td1 = el.firstChild as HTMLElement
 *     const td2 = td1.nextSibling as HTMLElement
 *     td1.textContent = String(row.id)
 *     const text = td2.firstChild as Text
 *     text.data = row.label()
 *     const unsub = row.label.subscribe(() => { text.data = row.label() })
 *     return unsub
 *   }
 * )
 */
export function createTemplate<T>(
  html: string,
  bind: (el: HTMLElement, item: T) => (() => void) | null,
): (item: T) => NativeItem {
  const tmpl = document.createElement("template")
  tmpl.innerHTML = html
  const proto = tmpl.content.firstElementChild as HTMLElement

  return (item: T): NativeItem => {
    const el = proto.cloneNode(true) as HTMLElement
    const cleanup = bind(el, item)
    return { __isNative: true, el, cleanup }
  }
}

// ─── Compiler-facing template API ─────────────────────────────────────────────

// Cache parsed <template> elements by HTML string — parse once, clone many.
const _tplCache = new Map<string, HTMLTemplateElement>()

/**
 * Compiler-emitted template instantiation.
 *
 * Parses `html` into a <template> element once (cached), then cloneNode(true)
 * for each call. The `bind` function wires up dynamic attributes, text content,
 * and event listeners on the cloned element tree. Returns a NativeItem that
 * mountChild can insert directly — no VNode allocation.
 *
 * This is the runtime half of the compiler's template optimisation. The compiler
 * detects static JSX element trees and emits `_tpl(html, bindFn)` instead of
 * nested `h()` calls. Benefits:
 * - cloneNode(true) is ~5-10x faster than sequential createElement + setAttribute
 * - Zero VNode / props-object / children-array allocations per instance
 * - Static attributes are baked into the HTML string (no runtime prop application)
 *
 * @example
 * // Compiler output for: <div class="box"><span>{text()}</span></div>
 * _tpl('<div class="box"><span></span></div>', (__root) => {
 *   const __e0 = __root.children[0];
 *   const __d0 = _re(() => { __e0.textContent = text(); });
 *   return () => { __d0(); };
 * })
 */
export function _tpl(html: string, bind: (el: HTMLElement) => (() => void) | null): NativeItem {
  let tpl = _tplCache.get(html)
  if (!tpl) {
    tpl = document.createElement("template")
    tpl.innerHTML = html
    _tplCache.set(html, tpl)
  }
  const el = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement
  const cleanup = bind(el)
  return { __isNative: true, el, cleanup }
}
