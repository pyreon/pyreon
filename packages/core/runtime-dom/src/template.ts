import type { NativeItem, VNodeChild } from '@pyreon/core'
import { renderEffect } from '@pyreon/reactivity'
import { mountChild } from './mount'
import { _bindEvent } from './props'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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
  if (__DEV__) _countSink.__pyreon_count__?.('runtime.bindText')
  // Fast path: source has .direct() (signal or computed)
  if (source.direct) {
    const textUpdate = () => {
      const v = source._v
      const next = v == null || v === false ? '' : String(v as string | number)
      if (next !== node.data) node.data = next
    }
    textUpdate()
    return source.direct(textUpdate)
  }
  // Fallback: source is a plain callable (e.g. store getter, createMachine) — use renderEffect
  const fn = source as unknown as () => unknown
  return renderEffect(() => {
    const v = fn()
    const next = v == null || v === false ? '' : String(v as string | number)
    if (next !== node.data) node.data = next
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
  if (__DEV__) _countSink.__pyreon_count__?.('runtime.bindDirect')
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
//
// LRU bound (audit bug #5): typical apps emit a small bounded set of unique
// HTML strings (one per JSX element tree the compiler hoists), so the cache
// stays in the dozens-to-hundreds in practice. But an app that constructs
// JSX from user input (or compiles many large dynamic templates) could grow
// this unbounded — every unique string holds a parsed <template> alive.
//
// Map preserves insertion order; on overflow we evict the OLDEST entry (the
// least-recently-inserted). Common HTML strings hit the cache before
// eviction; pathological inputs cycle through the cap without leaking.
//
// 1024 chosen as a balance: ~1024 unique templates × ~1KB parsed = ~1MB
// worst case — well within memory budget for any realistic app, and
// generous enough that no real codebase will hit the cap. Apps that
// genuinely need a different cap can swap their own _tpl wrapper.
const TPL_CACHE_MAX = 1024
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
  if (__DEV__) _countSink.__pyreon_count__?.('runtime.tpl')
  let tpl = _tplCache.get(html)
  if (!tpl) {
    tpl = document.createElement('template')
    tpl.innerHTML = html
    // LRU eviction — drop the oldest entry once we hit the cap. Map
    // iteration is insertion-order so the first key is always the
    // oldest. delete() is O(1).
    if (_tplCache.size >= TPL_CACHE_MAX) {
      const oldest = _tplCache.keys().next().value
      if (oldest !== undefined) _tplCache.delete(oldest)
    }
    _tplCache.set(html, tpl)
  } else {
    // LRU touch — re-insert moves to most-recent position so frequently
    // used templates survive eviction.
    _tplCache.delete(html)
    _tplCache.set(html, tpl)
  }
  const el = tpl.content.firstElementChild?.cloneNode(true) as HTMLElement
  const cleanup = bind(el)
  return { __isNative: true, el, cleanup }
}

/**
 * Compiler-emitted collapsed rocketstyle call site.
 *
 * The runtime half of the P0 compile-time rocketstyle wrapper-collapse.
 * For a literal-prop call site like `<Button state="primary" size="md">Save</Button>`,
 * the build resolves the FULL rocketstyle/styler pipeline once (SSR
 * render of the real component) and the compiler emits ONE `_rsCollapse`
 * call instead of the 5-layer wrapper mount (rocketstyle → attrs HOC →
 * Element → Wrapper → styled). Measured 44× wall-clock, mountChild 9→1
 * (see examples/experiments/e2-static-rocketstyle/RESULTS.md).
 *
 * Dual-emit (RFC decision 1): both the light- and dark-resolved class
 * strings are baked in; `isDark` is the app's live mode accessor (the
 * compiler threads it from the configured provider, e.g. `useMode` from
 * `@pyreon/ui-core`). A whole-theme/mode swap re-runs only this binding —
 * no remount — preserving Pyreon's reactive mode-switch contract. The
 * resolved CSS rules are injected once at module-eval via the styler's
 * idempotent `injectRules()` (emitted alongside this call), so the
 * collapsed site is self-sufficient: no prior runtime mount of the real
 * component is needed to populate the sheet.
 *
 * `bind` is the standard `_tpl` child/event binder for the (static)
 * children — identical to what the compiler emits for the non-collapsed
 * template path, so children reactivity / event delegation is unchanged.
 *
 * @param html  static element HTML WITHOUT the class attr (class is applied reactively)
 * @param lightClass  resolved styler class string for light mode
 * @param darkClass   resolved styler class string for dark mode
 * @param isDark  app mode accessor — `() => boolean` (true ⇒ dark)
 * @param bind  standard _tpl binder for children/events (or null)
 */
export function _rsCollapse(
  html: string,
  lightClass: string,
  darkClass: string,
  isDark: () => boolean,
  bind?: ((el: HTMLElement) => (() => void) | null) | null,
): NativeItem {
  return _tpl(html, (el) => {
    // Reactive class: _bindDirect's plain-callable fallback wraps this in
    // a renderEffect, so reading the mode accessor subscribes to the live
    // mode signal — a mode swap re-runs ONLY this className assignment.
    const disposeClass = _bindDirect(isDark as unknown as { _v?: unknown }, (v) => {
      el.className = v ? darkClass : lightClass
    })
    const disposeChildren = bind ? bind(el) : null
    if (!disposeChildren) return disposeClass
    return () => {
      disposeClass()
      disposeChildren()
    }
  })
}

/**
 * `_rsCollapse` PLUS residual-handler re-attach — PR 2 of the
 * partial-collapse build (open-work #1). The compiler's
 * `detectPartialCollapsibleShape` (PR 1) peels `on*` handlers off a
 * literal-prop rocketstyle site (handlers are orthogonal to the
 * SSR-resolved styler class — an event binding never changes rendered
 * CSS — so the resolved `templateHtml`/`lightClass`/`darkClass` are
 * byte-identical to a full-collapse site's). This is exactly
 * `_rsCollapse` (one `_tpl` cloneNode, dual-emit reactive class via
 * `_bindDirect`, NO remount on mode swap) with each peeled handler
 * re-attached through the CANONICAL `_bindEvent` → `applyEventProp`
 * path (delegation + batching + name normalization), so the collapsed
 * node behaves byte-identically to the 5-layer mount it replaced.
 *
 * @param handlers  `{ onClick: fn, onPointerEnter: fn, … }` — the peeled
 *   residual handlers; compiler PR 3 emits this object literal from the
 *   sliced source spans `detectPartialCollapsibleShape` returned.
 */
export function _rsCollapseH(
  html: string,
  lightClass: string,
  darkClass: string,
  isDark: () => boolean,
  handlers: Record<string, unknown>,
  bind?: ((el: HTMLElement) => (() => void) | null) | null,
): NativeItem {
  return _tpl(html, (el) => {
    const disposeClass = _bindDirect(isDark as unknown as { _v?: unknown }, (v) => {
      el.className = v ? darkClass : lightClass
    })
    const handlerDisposers: (() => void)[] = []
    for (const key in handlers) {
      const d = _bindEvent(el, key, handlers[key])
      if (d) handlerDisposers.push(d)
    }
    const disposeChildren = bind ? bind(el) : null
    return () => {
      disposeClass()
      for (const d of handlerDisposers) d()
      if (disposeChildren) disposeChildren()
    }
  })
}

/**
 * Test-only: clear the template cache. Used by tests that assert on
 * cache size; never called by runtime code. Not exported from the
 * package's public index.
 */
export function _clearTplCache(): void {
  _tplCache.clear()
}

/**
 * Test-only: read current cache size. Used by tests that assert
 * eviction. Not exported from the package's public index.
 */
export function _tplCacheSize(): number {
  return _tplCache.size
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
