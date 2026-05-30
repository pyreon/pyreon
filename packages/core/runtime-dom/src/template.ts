import type { NativeItem, VNodeChild } from '@pyreon/core'
import { renderEffect } from '@pyreon/reactivity'
import { mountChild } from './mount'
import { _bindEvent } from './props'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.bindText')
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.bindDirect')
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.tpl')
  let tpl = _tplCache.get(html)
  if (!tpl) {
    tpl = document.createElement('template')
    tpl.innerHTML = html
    // FIFO eviction — drop the oldest entry once we hit the cap. Map
    // iteration is insertion-order so the first key is always the
    // oldest. delete() is O(1).
    if (_tplCache.size >= TPL_CACHE_MAX) {
      const oldest = _tplCache.keys().next().value
      if (oldest !== undefined) _tplCache.delete(oldest)
    }
    _tplCache.set(html, tpl)
  }
  // Cache-HIT is now a no-op (no LRU touch). The cache-HIT path was previously
  // `delete + set` to re-insert at the most-recent position — 2 Map ops per
  // call, dominating the hot path for templates instantiated thousands of times
  // (a js-framework-benchmark `create 10,000 rows` paid 20,000 Map ops just for
  // LRU bookkeeping). Switching to FIFO means a frequently-used template
  // inserted early gets evicted before a rarely-used template inserted later —
  // but ONLY when the cache is full (cap 1024). No realistic app approaches
  // 1024 distinct compiled templates; if one does, the worst case is occasional
  // re-parse on eviction (a few ms one-time), which is far cheaper than 2 Map
  // ops on every single template instantiation.
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
 * Compiler-emitted PARTIALLY-collapsed rocketstyle call site — PR 2 of
 * the partial-collapse build (`.claude/plans/open-work-2026-q3.md` → #1).
 *
 * Identical to {@link _rsCollapse} (one `_tpl` cloneNode, dual-emit
 * reactive class, no remount on mode swap) PLUS it re-attaches the
 * residual event handlers `detectPartialCollapsibleShape` (compiler
 * PR 1) peeled off the `on*`-handler-only subset (the 7.8% the bail
 * census measured). Handlers are orthogonal to the SSR-resolved styler
 * class, so `html` / `lightClass` / `darkClass` are byte-identical to a
 * full-collapse site's — the ONLY delta vs `_rsCollapse` is the handler
 * re-attach, routed through the CANONICAL `_bindEvent` → `applyEventProp`
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
    // `Object.keys` (not `for...in`) so an attacker who pollutes
    // `Object.prototype` can't inject a fake handler via inherited
    // enumerable properties. Defense-in-depth — the compiler emits a
    // clean object literal so this matters defensively, not in
    // practice, but the cost is zero.
    for (const key of Object.keys(handlers)) {
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
 * Compiler-emitted DYNAMIC-prop collapsed rocketstyle call site — PR 1
 * of the dynamic-prop partial-collapse build (next bite after the
 * `on*`-handler partial-collapse `_rsCollapseH`, `.claude/plans/open-work-2026-q3.md`
 * → #1 dynamic-prop bucket = 15.3% of all real-corpus sites).
 *
 * Generalises {@link _rsCollapse}'s 2-class (light/dark) dispatch to an
 * N-class dispatch for sites where one dimension prop is an enumerable
 * dynamic expression (e.g. `<Button state={cond ? 'primary' : 'secondary'}>`).
 * The compiler resolves EVERY value of that prop through the existing
 * SSR-render resolver (so each value gets its own light + dark class
 * baked in, byte-identical to a `_rsCollapse` site for that value), and
 * the runtime picks the right `(value × mode)` class via the user's
 * expression.
 *
 * Class layout in `classes` is **stride-2, value-major**: index
 * `2 * valueIndex + (isDark ? 1 : 0)`. For the canonical ternary case:
 *
 * ```
 * <Button state={cond ? 'primary' : 'secondary'}>Save</Button>
 *   →
 * __rsCollapseDyn(
 *   "<button>Save</button>",
 *   ["btn-primary-light", "btn-primary-dark", "btn-secondary-light", "btn-secondary-dark"],
 *   () => cond ? 0 : 1,
 *   () => __pyrMode() === "dark"
 * )
 * ```
 *
 * Both the value expression AND the mode accessor are reactive: a change
 * to either re-runs ONLY this className assignment, no remount (same
 * contract as `_rsCollapse`'s mode flip). Both dispatches share a single
 * `_bindDirect` so reading both inside one effect subscribes once per
 * source — Pyreon's effect dedupe handles the rest.
 *
 * The structural HTML template is shared across every value (asserted
 * by the resolver — divergent markup between values bails the collapse).
 * Mirrors `_rsCollapse`'s mode-divergence-bails invariant.
 *
 * `bind` follows the same contract as `_rsCollapse` — standard `_tpl`
 * child/event binder, runs after class binding, disposers chained.
 *
 * @param html  static element HTML WITHOUT the root `class=` attr
 * @param classes  flat array of `2 × valueCount` class strings,
 *   indexed `[v0_light, v0_dark, v1_light, v1_dark, ...]`. The runtime
 *   does no validation — the compiler is the source of truth (an
 *   out-of-range `valueIndex()` would coerce to `undefined` className,
 *   which is correct-for-zero-style — never crashes)
 * @param valueIndex  user expression returning 0..valueCount-1 — reactive
 * @param isDark  app mode accessor — reactive
 * @param bind  standard _tpl binder for children/events (or null)
 */
export function _rsCollapseDyn(
  html: string,
  classes: readonly string[],
  valueIndex: () => number,
  isDark: () => boolean,
  bind?: ((el: HTMLElement) => (() => void) | null) | null,
): NativeItem {
  return _tpl(html, (el) => {
    // One `renderEffect` drives the className from both accessors;
    // reading `valueIndex()` AND `isDark()` inside the callback
    // subscribes to BOTH live signals via Pyreon's tracking — a change
    // to EITHER re-runs only this className assignment, no remount.
    //
    // Direct `renderEffect` (vs the `_bindDirect` indirection used by
    // `_rsCollapse`): the `_bindDirect` fallback path calls the source
    // function ONCE per re-run and passes the result to the callback.
    // We were ignoring that result and calling `valueIndex()` again
    // inside — i.e., a double call per re-run. Side-effecting cond
    // expressions (`{(modifyState(), cond) ? 'a' : 'b'}`) would fire
    // their side-effects twice. Direct `renderEffect` calls
    // `valueIndex()` exactly once per re-run, matching the original
    // source's call-count contract.
    const disposeClass = renderEffect(() => {
      const idx = (valueIndex() << 1) | (isDark() ? 1 : 0)
      el.className = classes[idx] ?? ''
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
 * Compiler-emitted DYNAMIC-prop + HANDLER collapsed rocketstyle call
 * site — closes the largest remaining real-corpus dynamic-collapse
 * gap (`.claude/plans/open-work-2026-q3.md` → #1 dynamic-prop bucket
 * = 15.4% of all real-corpus sites; the strict no-handler subset was
 * only 0.2% measured; this helper unlocks the handler-combined slice
 * that was bailed by `tryDynamicCollapse` in PR #767 by design).
 *
 * Combines {@link _rsCollapseDyn}'s value-major class dispatch with
 * {@link _rsCollapseH}'s handler re-attachment. Handlers are orthogonal
 * to both the SSR-resolved styler class AND the value dispatcher (a
 * `state={cond ? 'a' : 'b'} onClick={h}` site's onClick is identical
 * for both `state="a"` and `state="b"` resolutions — the styler class
 * varies, the handler does not). So this helper is structurally the
 * union of the two, no new behavior:
 *
 * ```
 * <Button state={cond ? 'primary' : 'secondary'} onClick={go}>Save</Button>
 *   →
 * __rsCollapseDynH(
 *   "<button>Save</button>",
 *   ["pri-L", "pri-D", "sec-L", "sec-D"],
 *   () => cond ? 0 : 1,
 *   () => __pyrMode() === "dark",
 *   { onClick: go }
 * )
 * ```
 *
 * Class layout matches `_rsCollapseDyn` (stride-2 value-major):
 * `index = 2 * valueIndex + (isDark ? 1 : 0)`. Handler attachment
 * matches `_rsCollapseH` — routed through the canonical `_bindEvent`
 * → `applyEventProp` path (delegation + batching + name
 * normalization). All three reactives (valueIndex, isDark, handlers
 * — though handler identity is captured at the call site) compose
 * cleanly: a value flip OR a mode flip patches className IN PLACE
 * on the SAME node, handlers stay attached across both.
 *
 * Layer-pure: no styler / ui-core imports (the styler injection is
 * the emitted code's job via `__rsSheet.injectRules`).
 *
 * @param html        static element HTML WITHOUT the root `class=` attr
 * @param classes     flat array of `2 × valueCount` class strings, indexed
 *                    `[v0_L, v0_D, v1_L, v1_D, …]`
 * @param valueIndex  user expression returning 0..valueCount-1 — reactive
 * @param isDark      app mode accessor — reactive
 * @param handlers    `{ onClick: fn, onPointerEnter: fn, … }` — the
 *                    residual handlers peeled off the call site by the
 *                    compiler's emit (sliced source spans re-emitted
 *                    verbatim, paren-wrapped to keep arrow / sequence
 *                    expressions a single value)
 * @param bind        standard _tpl binder for children/events (or null)
 */
export function _rsCollapseDynH(
  html: string,
  classes: readonly string[],
  valueIndex: () => number,
  isDark: () => boolean,
  handlers: Record<string, unknown>,
  bind?: ((el: HTMLElement) => (() => void) | null) | null,
): NativeItem {
  return _tpl(html, (el) => {
    // Reactive class — identical shape to `_rsCollapseDyn`: one
    // `renderEffect` reads both accessors, subscribing to both signals;
    // a change to EITHER re-runs only this className assignment, no
    // remount. Direct `renderEffect` (not via `_bindDirect`) so
    // `valueIndex()` runs exactly once per re-run — see the
    // corresponding comment in `_rsCollapseDyn`.
    const disposeClass = renderEffect(() => {
      const idx = (valueIndex() << 1) | (isDark() ? 1 : 0)
      el.className = classes[idx] ?? ''
    })
    // Handler attachment — identical to `_rsCollapseH`: routes through
    // the canonical `_bindEvent` path so delegation / batching / name
    // normalization behave byte-identically to the 5-layer mount.
    // `Object.keys` (not `for...in`) so an attacker who pollutes
    // `Object.prototype` can't inject a fake handler via inherited
    // enumerable properties — only OWN keys count. The compiler emits
    // a clean object literal so this matters defensively, not in
    // practice, but the cost is zero.
    const handlerDisposers: (() => void)[] = []
    for (const key of Object.keys(handlers)) {
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
