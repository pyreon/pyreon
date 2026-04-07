import type { NativeItem, VNodeChild } from '@pyreon/core'
import { renderEffect } from '@pyreon/reactivity'
import { mountChild } from './mount'

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
  const tmpl = document.createElement('template')
  tmpl.innerHTML = html
  const proto = tmpl.content.firstElementChild as HTMLElement

  return (item: T): NativeItem => {
    const el = proto.cloneNode(true) as HTMLElement
    const cleanup = bind(el, item)
    return { __isNative: true, el, cleanup }
  }
}

// ─── Direct text binding (bypasses effect system) ────────────────────────────

/**
 * Compiler-emitted direct text binding for single-signal text nodes.
 *
 * When the compiler detects `{signal()}` as the only reactive expression
 * in a text binding, it emits `_bindText(signal, textNode)` instead of
 * `_bind(() => { textNode.data = signal() })`.
 *
 * This bypasses the effect system entirely:
 * - No deps array allocation
 * - No withTracking / setDepsCollector overhead
 * - No `run` closure
 * - Signal.subscribe is used directly (O(1) subscribe + unsubscribe)
 *
 * @param source - A signal (anything with `._v` and `.direct`)
 * @param node - The Text node to update
 */
export function _bindText(
  source: { _v?: unknown; direct?: (fn: () => void) => () => void },
  node: Text,
): () => void {
  // Fast path: source has .direct() (signal or computed)
  if (source.direct) {
    const textUpdate = () => {
      const v = source._v
      node.data = v == null || v === false ? '' : String(v as string | number)
    }
    textUpdate()
    return source.direct(textUpdate)
  }
  // Fallback: source is a plain callable (e.g. store getter, createMachine) — use renderEffect
  const fn = source as unknown as () => unknown
  return renderEffect(() => {
    const v = fn()
    node.data = v == null || v === false ? '' : String(v as string | number)
  })
}

// ─── Direct signal binding (bypasses effect system) ──────────────────────────

/**
 * Compiler-emitted direct binding for single-signal reactive expressions.
 *
 * Like _bindText but for arbitrary DOM updates (attributes, className, style).
 * When the compiler detects that a reactive expression depends on exactly one
 * signal call, it emits `_bindDirect(signal, updater)` instead of
 * `_bind(() => { updater() })`.
 *
 * Uses signal.direct() for zero-overhead registration:
 * - Flat array instead of Set (no hashing)
 * - Index-based disposal (no Set.delete)
 * - No deps array, no withTracking, no run closure
 *
 * @param source - A signal (anything with `._v` and `.direct`)
 * @param updater - Function that reads `source._v` and applies the DOM update
 */
export function _bindDirect(
  source: { _v?: unknown; direct?: (fn: () => void) => () => void },
  updater: (value: unknown) => void,
): () => void {
  // Fast path: source has .direct() (signal or computed)
  if (source.direct) {
    updater(source._v)
    return source.direct(() => updater(source._v))
  }
  // Fallback: plain callable — use renderEffect
  const fn = source as unknown as () => unknown
  return renderEffect(() => updater(fn()))
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
    tpl = document.createElement('template')
    tpl.innerHTML = html
    _tplCache.set(html, tpl)
  }
  const el = tpl.content.firstElementChild?.cloneNode(true) as HTMLElement
  const cleanup = bind(el)
  return { __isNative: true, el, cleanup }
}

/**
 * Mount a children slot inside a template.
 *
 * Compiler emits this instead of `createTextNode()` when it detects a
 * children expression (`props.children`, `own.children`). Unlike text nodes,
 * children can be VNodes, arrays, or reactive accessors — all handled by
 * `mountChild()`.
 *
 * @param children - The children value (VNode, string, array, or accessor)
 * @param parent - The parent element in the cloned template
 * @param placeholder - The comment placeholder node to replace
 * @returns Cleanup function
 */
export function _mountSlot(
  children: VNodeChild | VNodeChild[],
  parent: Node,
  placeholder: Node,
): (() => void) | null {
  if (children == null || children === false || children === true) {
    parent.removeChild(placeholder)
    return null
  }
  const cleanup = mountChild(children, parent, placeholder)
  parent.removeChild(placeholder)
  return cleanup
}
