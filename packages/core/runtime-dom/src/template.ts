import type { NativeItem, VNodeChild } from '@pyreon/core'
import { _rdNodeId, getContextOwner, renderEffect } from '@pyreon/reactivity'
import { SizedMap } from '@pyreon/sized-map'
import { _tagTextBinding } from './binding-registry'
import { createPolyTextCore, mountChild, SVG_TAGS, type PolyTextCore } from './mount'
import { _bindEvent } from './props'

// Dev-mode gates in this file use the bare bundler-agnostic
// `process.env.NODE_ENV !== 'production'` form — see the
// `pyreon/no-process-dev-gate` lint rule for the rationale.
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

// ─── Text-coercion handling ───────────────────────────────────────────────────
//
// Both `_bindText` paths String()-coerce the bound value into `Text.data`. Two
// failure shapes shipped real bugs through that coercion:
//
//  • A VNode / NativeItem (or an array containing one) rendered the literal
//    "[object Object]". FIXED here: on the first VNode-shaped value the binding
//    permanently UPGRADES to a subtree mount, which also removes a guaranteed
//    SSR<->client mismatch (SSR always rendered the subtree correctly). The dev
//    warning below remains only for a bound text node with NO parent.
//  • A raw FUNCTION renders its SOURCE text (an accessor neutralized by an
//    `as never` cast). Still warn-only — a function RESULT stays on String().
//
// The check targets the RESULT value only; `_bindText`'s SOURCE is legitimately
// a callable. Warns ONCE per text node via an expando on the node itself (no
// module-level registry, no prod allocation).
//
// Coverage note: only the `_bindText` sinks are hookable at runtime — the
// compiler's `_bind(() => { __t0.data = expr })` emit and `_bindDirect` updaters
// are raw DOM writes in user bundles. For TEXT that is fine by construction:
// `_bindDirect` reaches `.data` only through the signal-method-call promotion
// (a pure-method safelist over primitives), so a raw VNode never lands there.

/** Structural VNode check — VNode has no symbol brand (see core/types.ts),
 *  so `{ type, props, children }` is the discriminator; `__isNative` covers
 *  NativeItems from `_tpl()`/`createTemplate()`. */
function _looksLikeVNode(v: unknown): boolean {
  return (
    v !== null &&
    typeof v === 'object' &&
    (((v as { __isNative?: boolean }).__isNative === true) ||
      ('type' in v && 'props' in v && 'children' in v))
  )
}

/** The ONE mountable-in-a-text-position discriminator, shared by the static
 *  setters (`_setChild`/`_setChildAt`), the reactive `_bindText` VNode
 *  upgrade, and the dev coercion warning: a VNode/NativeItem, or an array
 *  containing at least one. Plain objects and plain-primitive arrays keep
 *  the historical String() coercion (consistent across all four sites). */
function _isMountableTextValue(v: unknown): boolean {
  return _looksLikeVNode(v) || (Array.isArray(v) && v.some(_looksLikeVNode))
}

/**
 * Compiler-emitted STATIC child setter for a bare `{x}` child whose type the
 * compiler could not statically resolve (a function param, a custom prop, a
 * function-return const). Primitives take the historical `textContent` fast
 * path; a VNode or a VNode-array is MOUNTED — so `<div>{items}</div>` where
 * `items` is a `VNode[]` from any source renders the elements instead of the
 * "[object Object]" text coercion. Same VNode/array detection as the dev
 * coercion warning; everything else stringifies exactly as `textContent = x`
 * did (no behavior change for non-VNode values). The reactive counterpart is
 * `bindPolymorphicText` (a reactive child can also swap text↔VNode).
 */
export function _setChild(node: Element, value: unknown): void {
  if (_isMountableTextValue(value)) {
    mountChild(value as VNodeChild, node, null)
  } else {
    // Sole-text fast path: when the element already holds exactly one text
    // node (the hydration-ADOPTION case — the SSR text is still in place —
    // and any repeat-set case), write `.data` in place instead of
    // `textContent =` (which removes + recreates the node). Chromium
    // short-circuits same-value data writes, so an adopted row whose SSR text
    // already matches pays nearly nothing. Fresh mounts have no children and
    // take the textContent branch unchanged.
    const fc = node.firstChild
    if (fc !== null && fc.nodeType === 3 && fc.nextSibling === null) {
      ;(fc as Text).data = value as string
    } else {
      node.textContent = value as string
    }
  }
}

/**
 * Mixed-content sibling of `_setChild` — sets a static `{x}` child that shares
 * its parent with other nodes, at the compiler-emitted `<!>` placeholder
 * position. A VNode/VNode[] value MOUNTS before the placeholder (then the
 * placeholder is removed); everything else replaces the placeholder with a
 * text node — the historical `document.createTextNode(x) + replaceChild` shape.
 */
export function _setChildAt(parent: Node, placeholder: ChildNode, value: unknown): void {
  if (_isMountableTextValue(value)) {
    mountChild(value as VNodeChild, parent, placeholder)
    placeholder.remove()
  } else {
    parent.replaceChild(document.createTextNode(value as string), placeholder)
  }
}

function _warnTextCoercion(v: unknown, node: Text): void {
  // Belt-and-braces: every call site is already inside the bare dev gate
  // (which is what makes this helper tree-shakeable); this early return is
  // the in-function guard `pyreon/dev-guard-warnings` recognises.
  if (process.env.NODE_ENV === 'production') return
  if (v == null || (typeof v !== 'object' && typeof v !== 'function')) return
  const flagged = node as Text & { __pyreonWarnedCoercion?: boolean }
  if (flagged.__pyreonWarnedCoercion) return
  if (typeof v === 'function') {
    flagged.__pyreonWarnedCoercion = true
    console.warn(
      '[Pyreon] A function was coerced to its source string in a text position. ' +
        "If you cast an accessor with 'as never', remove the cast — the compiler treats " +
        'the cast expression as static. Accessor-typed JSX attributes accept the function form directly.',
    )
    return
  }
  if (_isMountableTextValue(v)) {
    flagged.__pyreonWarnedCoercion = true
    console.warn(
      '[Pyreon] A VNode was coerced to "[object Object]" in a text binding: the bound ' +
        'text node has no parent, so the subtree could not be mounted in its place ' +
        '(attached bindings upgrade to a subtree mount automatically). Attach the text ' +
        'node before binding, or mount the VNode via mountChild directly.',
    )
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
 * VNode upgrade (PZ-02 fix): the binding is text-FIRST, not text-ONLY. A
 * signal whose value is a VNode / NativeItem / VNode[] permanently upgrades
 * to a subtree mount at the text node's position (the swap core shared with
 * `bindPolymorphicText`) — matching what SSR already renders for the same
 * shape. The string hot path stays byte-identical until a VNode is actually
 * seen: the no-change bail (`next !== node.data`) is untouched, and the
 * detection is ONE `typeof v === 'object'` short-circuit on the
 * value-actually-changed branch only.
 *
 * @param source - A signal (anything with `._v` and `.direct`)
 * @param node - The Text node to update
 * @param caller - Optional slow-path receiver/caller. Compiler emits this for
 *   MemberExpression callees like `row.label()` so the slow path preserves
 *   `this` if `source` turns out to be a method. Fast path ignores it — see
 *   {@link resolveSlowCaller} for the two accepted shapes.
 */
/**
 * Resolve the slow-path invoker for a compiler-emitted member-chain binding.
 *
 * Runs ONLY when `source` turned out NOT to be a signal/computed (no `.direct`)
 * — i.e. a plain zero-arg method like `{d.toLocaleDateString()}`, where calling
 * the already-detached `source` would lose `this`. The `.direct` fast paths in
 * `_bindText` / `_bindDirect` return before reaching this.
 *
 * Two shapes reach here, in SEPARATE positional slots:
 *   - `receiver` (slot 4, depth-1 member chains): the object the member was
 *     read from. Costs NO allocation at the call site — the emitter passes an
 *     identifier already in scope (`row`), rather than minting a
 *     `() => row.label()` thunk per row that the fast path then discards.
 *   - `caller` (slot 3, deeper chains + any older compiler's output): a thunk,
 *     invoked as-is.
 *
 * The slots are separate BECAUSE A RECEIVER CAN ITSELF BE CALLABLE, so
 * `typeof x === 'function'` cannot tell the two apart. `{Date.now()}` is the
 * everyday proof: `Date` is a function, so a single shared slot would read the
 * receiver as a thunk and evaluate `Date()` — rendering a date string where the
 * source asked for a timestamp. Keeping them apart also means an older
 * compiler's slot-3 thunk still works unchanged.
 *
 * The closure built for the receiver case is allocated once per BINDING on the
 * slow path only — never on the fast path, and never per fire.
 */
function resolveSlowCaller(
  source: unknown,
  caller: (() => unknown) | undefined,
  receiver: object | undefined,
): () => unknown {
  if (receiver !== undefined) return () => (source as (this: unknown) => unknown).call(receiver)
  if (caller !== undefined) return caller
  return source as () => unknown
}

export function _bindText(
  source: { _v?: unknown; direct?: (fn: () => void) => () => void },
  node: Text,
  caller?: () => unknown,
  receiver?: object,
): () => void {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.bindText')
  // Captured for the upgrade path: components mounted by a LATER upgrade run
  // inside a signal dispatch with no ambient owner, so they must resolve context
  // through the owner active at SETUP — same discipline as renderEffect's
  // snapshot capture.
  const ownerAtSetup = getContextOwner()
  // Fast path: source has .direct() (signal or computed)
  if (source.direct) {
    // Lifecycle slot: null until subscribed, the textUpdate unsubscriber before
    // an upgrade, the combined cleanup after one. The returned disposer reads it
    // late so ONE stable function survives the subscriber swap.
    let disposer: (() => void) | null = null
    const textUpdate = () => {
      const v = source._v
      const next = v == null || v === false ? '' : String(v as string | number)
      if (next !== node.data) {
        // Value actually changed — the ONLY place the upgrade check runs, never
        // on the no-change hot path. Strings and numbers short-circuit on typeof.
        if (typeof v === 'object' && v !== null && _isMountableTextValue(v)) {
          const parent = node.parentNode
          if (parent !== null) {
            // Permanently upgrade this binding to a subtree mount. Swapping the
            // subscription mid-dispatch is safe: `_d1` is a single slot the
            // dispatch already dereferenced, and the `_d` Set path is enqueued
            // by reference.
            if (disposer !== null) disposer()
            const core = createPolyTextCore(node, parent, ownerAtSetup)
            core.apply(v as VNodeChild)
            const unsub = source.direct!(() => core.apply(source._v as VNodeChild))
            disposer = () => {
              unsub()
              core.dispose()
            }
            return
          }
          // No parent → nowhere to mount (detached manual binding). Fall
          // through to the historical String() coercion + dev warning.
        }
        if (process.env.NODE_ENV !== 'production') _warnTextCoercion(v, node)
        node.data = next
      }
    }
    textUpdate()
    // Dev-only: correlate this text node with the signal/computed it displays so
    // devtools can answer "which signal drives this value?". Both node and source
    // are in scope here — an exact tag, not a heuristic. Tree-shaken in prod.
    if (process.env.NODE_ENV !== 'production') {
      const sourceId = _rdNodeId(source)
      if (sourceId !== undefined) _tagTextBinding(node, sourceId)
    }
    // Upgraded during the initial call → the core updater is already
    // subscribed; otherwise wire the text updater now.
    if (disposer === null) disposer = source.direct(textUpdate)
    return () => disposer!()
  }
  // Fallback: bare callable. Use the compiler-provided receiver/caller when
  // present (it preserves `this` for member-expression sources). The
  // renderEffect keeps tracking `fn`'s reads across the upgrade — after the
  // first VNode-shaped value every re-run routes through the swap core, whose
  // child mounts are untracked.
  const fn = resolveSlowCaller(source, caller, receiver)
  let core: PolyTextCore | null = null
  const disposeEffect = renderEffect(() => {
    const v = fn()
    if (core !== null) {
      core.apply(v as VNodeChild)
      return
    }
    const next = v == null || v === false ? '' : String(v as string | number)
    if (next !== node.data) {
      if (typeof v === 'object' && v !== null && _isMountableTextValue(v)) {
        const parent = node.parentNode
        if (parent !== null) {
          core = createPolyTextCore(node, parent, ownerAtSetup)
          core.apply(v as VNodeChild)
          return
        }
      }
      if (process.env.NODE_ENV !== 'production') _warnTextCoercion(v, node)
      node.data = next
    }
  })
  return () => {
    disposeEffect()
    if (core !== null) core.dispose()
  }
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
 * @param caller - Optional slow-path thunk (deeper member chains, and any
 *   older compiler's output). Fast path ignores it.
 * @param receiver - Optional slow-path receiver for a depth-1 member chain,
 *   kept in a SEPARATE slot from `caller` because a receiver can itself be
 *   callable (`Date`). Fast path ignores it — see {@link resolveSlowCaller}.
 */
export function _bindDirect(
  source: { _v?: unknown; direct?: (fn: () => void) => () => void },
  updater: (value: unknown) => void,
  caller?: () => unknown,
  receiver?: object,
): () => void {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.bindDirect')
  // Fast path: source has .direct() (signal or computed)
  if (source.direct) {
    updater(source._v)
    return source.direct(() => updater(source._v))
  }
  // Fallback: bare callable. Use the compiler-provided receiver/caller if there
  // is one (preserves `this` for member-expression sources); otherwise call
  // source directly.
  const fn = resolveSlowCaller(source, caller, receiver)
  return renderEffect(() => updater(fn()))
}

// ─── Compiler-facing template API ─────────────────────────────────────────────

// Cache parsed <template> elements by HTML string — parse once, clone many.
//
// SizedMap in FIFO mode: get() does NOT touch ordering, so a cache HIT is a
// single Map lookup with no recency bookkeeping (see `_tpl` below for why
// touch-on-read was rejected). Bounded at 1024 because an app that builds JSX
// from user input could otherwise grow this unboundedly, with every unique
// string holding a parsed <template> alive. 1024 x ~1KB parsed is ~1MB worst
// case and no real codebase approaches the cap.
const _tplCache = new SizedMap<string, HTMLTemplateElement>({ maxEntries: 1024 })

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
 * // (sole-dynamic-text child: the template bakes a ' ' placeholder text
 * //  node — no createTextNode/appendChild per instantiation)
 * _tpl('<div class="box"><span> </span></div>', (__root) => {
 *   const __e0 = __root.firstElementChild;
 *   const __t1 = __e0.firstChild;
 *   const __d0 = _bindText(text, __t1);
 *   return () => { __d0() };
 * })
 */
// SVG tags that are ALSO valid HTML — a template rooted at one of these is
// almost always the HTML element, so do NOT SVG-wrap it. Every other entry in
// SVG_TAGS is namespace-unambiguous. (MathML is the same shape of bug but has no
// real template-rooted instances, and happy-dom can't parse MathML foreign
// content to verify a fix, so it is deliberately out of scope.)
const SVG_ROOT_EXCLUDE = new Set(['svg', 'title'])

/**
 * Whether a template STRING is rooted at a bare SVG element — `<g>`, `<path>`,
 * `<rect>`, `<linearGradient>`, … NOT enclosed in an `<svg>`.
 *
 * `document.createElement('template').innerHTML = html` runs the HTML parser,
 * which only enters SVG foreign-content mode when it hits a literal `<svg>`. A
 * string rooted at `<g>` is parsed in the HTML namespace, so the cloned nodes
 * are inert `HTMLUnknownElement`s that render nothing — the `@pyreon/flow`
 * edge / minimap-dot bug (edges lower to `_tpl("<g><path…")`). Wrapping in
 * `<svg>` for parsing (then lifting the children back out) gives correctly
 * namespaced `SVGElement`s.
 */
function isSvgRooted(html: string): boolean {
  const m = /^\s*<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html)
  if (m === null) return false
  const tag = m[1] as string
  return !SVG_ROOT_EXCLUDE.has(tag) && SVG_TAGS.has(tag)
}

// ─── Compiled-template hydration adoption (SEAM) ────────────────────────────
// One-shot handoff: the <For> hydration-adoption path sets the SSR row root
// before invoking renderItem; the _tpl call inside consumes it and — when the
// registered VERIFIER approves — runs its bind against the EXISTING nodes.
// The verify/plan machinery lives in hydration-plan.ts and is registered at
// hydrateRoot CALL time (a module-load registration would be a top-level side
// effect pinning it into CSR bundles), so compiled CSR apps tree-shake ALL of
// it — _tpl carries only this slot and a nullable hook check.
let _tplAdoptTarget: Element | null = null
let _tplAdoptConsumed = false
let _tplAdoptAllowPlan = false

/**
 * Set/clear the one-shot adoption target.
 *
 * `allowPlanReplay` opts into the verifier's cached-plan FAST PATH, which
 * spot-checks a recorded plan instead of re-walking the skeleton. That is only
 * sound when the caller guarantees successive targets are structurally
 * IDENTICAL — true for `<For>` rows (one `renderItem`, rows 2..N by
 * construction), false for anything else. It defaults OFF: the plan cache is
 * keyed by the TEMPLATE, and `_tplCache` is keyed by the HTML string and is
 * process-global, so two unrelated components that compile to the same
 * template share a plan. With replay unconditional, the second one skipped the
 * static-skeleton gate entirely and could adopt a byte-DIFFERENT server node —
 * reproduced as a local `<div class="other">` coming back as the server's
 * `<div class="root">`.
 */
export function _setTplAdoptTarget(el: Element | null, allowPlanReplay = false): void {
  _tplAdoptTarget = el
  _tplAdoptConsumed = false
  _tplAdoptAllowPlan = allowPlanReplay
}

/** Did the last _tpl call adopt the target (vs clone)? */
export function _tplAdoptDidConsume(): boolean {
  return _tplAdoptConsumed
}

/** Verifier hook — registered by hydrateRoot; true = target verified +
 * normalized, the compiled bind may run against it. */
export type TplAdoptVerifier = (
  tpl: HTMLTemplateElement,
  html: string,
  target: Element,
  allowPlanReplay?: boolean,
) => boolean
let _tplAdoptVerifier: TplAdoptVerifier | null = null
export function _setTplAdoptVerifier(v: TplAdoptVerifier): void {
  _tplAdoptVerifier = v
}

// ─── MOUNT HOLES ─────────────────────────────────────────────────────────────
// A template element whose children are ALL absorbed COMPONENT children
// (`templatizeComponentChildren`) is emitted EMPTY and filled by trailing
// `_mountChild(vnode, el, null)` calls in source order. Its SSR counterpart
// holds the components' real output, which the adopt verifier would otherwise
// read as "extra elements" and reject — the whole reason the option is off.
//
// The compiler DECLARES such an element by baking `data-pyreon-hole` onto it,
// so the relaxation is explicit and CLOSED: only a declared hole skips its DOM
// range, and every other empty-in-the-template element keeps today's exact
// behaviour. That matters because `_setChild` and a spread `innerHTML` also
// target an empty template element and do NOT hydrate — a blanket "any empty
// element may have extra children" rule would duplicate or discard their
// content.
//
// The attribute never reaches user DOM: it is stripped from the cached
// template's content ONCE, at parse time, before any clone or signature walk.
// The stripped elements are remembered by IDENTITY (not by index — the
// positional variant is the repo's most-repeated bug class), so the runtime
// can never attribute a hole to the wrong element.
const HOLE_ATTR = 'data-pyreon-hole'
// Module-level registry, so the three questions, answered:
//  (1) EVICTION — weak keys, held only by `_tplCache`'s template content, which
//      is itself a SizedMap capped at 1024 with FIFO eviction.
//  (2) CLEANUP CONTRACT — none needed; nothing here is a strong reference.
//  (3) EXERCISED — every hole-adoption spec goes through add + lookup.
// The catalogued hazard for a weak collection is its BACKING TABLE, which never
// shrinks after growth: here it takes one entry per distinct TEMPLATE ELEMENT
// that declares a hole, bounded by the app's template count, not by workload —
// unlike the per-ROW registry that grew a 32768-slot table on a 10k list.
const _tplHoleEls = new WeakSet<Element>()

/** Is this template-content element a compiler-declared mount hole? */
export function _isTplHoleEl(el: Element): boolean {
  return _tplHoleEls.has(el)
}

/** Strip + record the hole markers on a freshly parsed template. */
function stripHoleMarkers(content: DocumentFragment): void {
  const marked = content.querySelectorAll(`[${HOLE_ATTR}]`)
  for (let i = 0; i < marked.length; i++) {
    const el = marked[i] as Element
    el.removeAttribute(HOLE_ATTR)
    _tplHoleEls.add(el)
  }
}

/**
 * Per-hole DOM cursors for the adopting bind currently running, keyed by the
 * TARGET (server) element. Populated by the verifier — which is the only thing
 * that knows a hole verified — and consumed by `_mountChild`.
 *
 * Module-level frame state: SAVED and RESTORED around each adopting bind, never
 * reset to a constant. Holes nest by construction (a hole's component hydrates
 * into its own template, whose bind has its own holes), and a nested `_tpl`
 * that cleared this to `null` on exit would silently strand the outer frame's
 * remaining holes on the plain mount path — appending a second copy beside the
 * server's.
 */
let _tplHoleCursors: Map<Element, ChildNode | null> | null = null

/** Verifier → `_tpl` handoff for the match it just approved (one-shot). */
let _tplPendingHoles: Map<Element, ChildNode | null> | null = null
export function _setTplHoleCursors(m: Map<Element, ChildNode | null> | null): void {
  _tplPendingHoles = m
}

/**
 * Hydrator seam — registered by `hydrateRoot` (never at module load, so CSR
 * bundles tree-shake all of hydrate.ts). Consumes `cursor` and returns
 * `[cleanup, nextCursor]`, exactly `hydrateChild`'s contract.
 */
export type TplHoleHydrator = (
  child: VNodeChild | VNodeChild[],
  parent: Node,
  cursor: ChildNode | null,
) => [() => void, ChildNode | null]
let _tplHoleHydrator: TplHoleHydrator | null = null
export function _setTplHoleHydrator(h: TplHoleHydrator): void {
  _tplHoleHydrator = h
}

/**
 * Compiler-emitted append of an absorbed COMPONENT child.
 *
 * Plain mount everywhere except inside an ADOPTING bind whose verifier
 * declared `parent` a mount hole — there the child HYDRATES the server nodes
 * from the hole's cursor instead of mounting a second copy beside them.
 * Requirement (2) of the mount-hole limit: relaxing the verifier alone
 * duplicates the page.
 */
export function _mountChild(
  child: VNodeChild | VNodeChild[],
  parent: Node,
  anchor: Node | null = null,
): () => void {
  if (_tplHoleCursors !== null && anchor === null && _tplHoleHydrator !== null) {
    const holes = _tplHoleCursors
    const el = parent as Element
    if (holes.has(el)) {
      const [cleanup, next] = _tplHoleHydrator(child, parent, holes.get(el) as ChildNode | null)
      holes.set(el, next)
      return cleanup
    }
  }
  return mountChild(child, parent, anchor)
}

/**
 * Drop whatever the server sent that this render did not claim.
 *
 * A hole whose bind consumed every node leaves the cursor at `null` and this
 * removes nothing. A hole the bind never touched still holds its start cursor,
 * so the whole range goes — which is not a repair but the CORRECT result: the
 * template element is empty, so an element with no children is precisely what
 * the clone-and-swap path would have produced. That is what keeps a
 * mis-declared hole costing an adoption rather than correctness.
 */
function sweepHoles(holes: Map<Element, ChildNode | null>): void {
  for (const cursor of holes.values()) {
    let n: ChildNode | null = cursor
    while (n !== null) {
      const nx: ChildNode | null = n.nextSibling
      n.remove()
      n = nx
    }
  }
}

export function _tpl(html: string, bind: (el: HTMLElement) => (() => void) | null): NativeItem {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.tpl')
  let tpl = _tplCache.get(html)
  if (!tpl) {
    tpl = document.createElement('template')
    if (isSvgRooted(html)) {
      // Parse inside an `<svg>` wrapper so root + descendants land in the SVG
      // namespace, then MOVE the parsed children into the cache template's
      // content — moving preserves `namespaceURI`, and the cloned root inherits it.
      const wrapper = document.createElement('template')
      wrapper.innerHTML = `<svg>${html}</svg>`
      const svg = wrapper.content.firstElementChild
      if (svg) {
        while (svg.firstChild) tpl.content.appendChild(svg.firstChild)
      } else {
        tpl.innerHTML = html
      }
    } else {
      tpl.innerHTML = html
    }
    // Strip the compiler's mount-hole declarations BEFORE the template is
    // reachable by any clone or signature walk, so the attribute is invisible
    // to user DOM. Guarded by a string test: a build without
    // `templatizeComponentChildren` never contains one and pays a single
    // `includes` per newly parsed template.
    if (html.includes(HOLE_ATTR)) stripHoleMarkers(tpl.content)
    // SizedMap.set() handles FIFO eviction internally — drops the
    // oldest entry once we hit the cap.
    _tplCache.set(html, tpl)
  }
  // Cache-HIT is a no-op — no LRU touch. The previous `delete + set` re-insert
  // cost 2 Map ops per call and dominated the hot path (a 10,000-row create paid
  // 20,000 Map ops on LRU bookkeeping alone). FIFO can evict a frequently-used
  // early template before a rarely-used later one, but only once the cache is
  // full; no realistic app approaches 1024 distinct templates, and the worst
  // case is a one-time re-parse.
  // Hydration adoption: bind against the verified SSR row instead of cloning.
  // The verifier is registered by hydrateRoot — null in CSR-only bundles.
  if (_tplAdoptTarget !== null) {
    const target = _tplAdoptTarget
    const allowPlan = _tplAdoptAllowPlan
    _tplAdoptTarget = null // one-shot, cleared on ANY outcome
    _tplAdoptAllowPlan = false
    _tplPendingHoles = null
    if (_tplAdoptVerifier !== null && _tplAdoptVerifier(tpl, html, target, allowPlan)) {
      const holes = _tplPendingHoles
      _tplPendingHoles = null
      // Belt-and-braces: a verified hole is only safe if something will
      // HYDRATE it. Both hooks are registered together, so this cannot fire —
      // and if it ever does, declining the adoption is the cheap failure.
      if (holes === null || _tplHoleHydrator !== null) {
        // Frame state: SAVE the enclosing bind's holes, install ours, RESTORE
        // on every exit — never reset to a constant. Holes NEST (a hole's
        // component hydrates into its own template, whose bind has its own
        // holes), and an exit that cleared this would strand the outer frame's
        // remaining holes on the plain mount path.
        const prevHoles = _tplHoleCursors
        _tplHoleCursors = holes
        let cleanup: (() => void) | null
        try {
          cleanup = bind(target as HTMLElement)
          if (holes !== null) sweepHoles(holes)
        } finally {
          _tplHoleCursors = prevHoles
        }
        _tplAdoptConsumed = true
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('runtime.tpl.adopt')
        return { __isNative: true, el: target as HTMLElement, cleanup }
      }
    }
  }
  // (adoption falls through to a normal clone on any verification bail)
  const el = tpl.content.firstElementChild?.cloneNode(true) as HTMLElement
  const cleanup = bind(el)
  // A CLONE is not a consumption. Stated on this exit too so `_tplAdoptDidConsume()`
  // describes THIS call rather than whichever nested `_tpl` ran last inside
  // `bind` — the reading the `<For>` row loop makes. Skipped entirely when no
  // verifier is registered, so a CSR-only bundle's hot path is unchanged.
  if (_tplAdoptVerifier !== null) _tplAdoptConsumed = false
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
  // Single-class fast path: under cssVariables theming the resolver's light/dark
  // renders produce IDENTICAL classes (mode lives in the CSS cascade, not the
  // className), so skip the mode binding entirely.
  if (lightClass === darkClass) {
    return _tpl(html, (el) => {
      el.className = lightClass
      return bind ? bind(el) : null
    })
  }
  return _tpl(html, (el) => {
    // Reactive class: `_bindDirect`'s plain-callable fallback wraps this in a
    // renderEffect, so a mode swap re-runs ONLY this className assignment.
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
 * the partial-collapse build (`CLAUDE.md` ("Compile-time rocketstyle collapse") collapse-tail).
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
    // Inline-first-disposer slot (mirrors the signal `_d1`->`_d` idiom): the
    // dominant collapsed shape is a single handler, so hold the first disposer
    // inline and promote to an array only on a 2nd. `Object.keys` (not `for...in`)
    // so prototype pollution can't inject a fake handler.
    let d0: (() => void) | null = null
    let dRest: (() => void)[] | null = null
    for (const key of Object.keys(handlers)) {
      const d = _bindEvent(el, key, handlers[key])
      if (!d) continue
      if (d0 === null) d0 = d
      else (dRest ??= []).push(d)
    }
    const disposeChildren = bind ? bind(el) : null
    return () => {
      disposeClass()
      if (d0) d0()
      if (dRest) for (const d of dRest) d()
      if (disposeChildren) disposeChildren()
    }
  })
}

/**
 * Compiler-emitted DYNAMIC-prop collapsed rocketstyle call site — PR 1
 * of the dynamic-prop partial-collapse build (next bite after the
 * `on*`-handler partial-collapse `_rsCollapseH`, `CLAUDE.md` ("Compile-time rocketstyle collapse")
 *  dynamic-prop bucket = 15.3% of all real-corpus sites).
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
    // One `renderEffect` drives the className from both accessors, subscribing to
    // both signals — a change to EITHER re-runs only this assignment, no remount.
    // Direct `renderEffect` rather than `_bindDirect` so `valueIndex()` runs
    // exactly ONCE per re-run: the `_bindDirect` fallback calls the source and
    // passes the result, and calling `valueIndex()` again inside would fire a
    // side-effecting cond expression twice.
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
 * gap (`CLAUDE.md` ("Compile-time rocketstyle collapse")  dynamic-prop bucket
 * = 15.4% of all real-corpus sites; the strict no-handler subset was
 * only 0.2% measured; this helper unlocks the handler-combined slice
 * that `tryDynamicCollapse` bails by design).
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
    // Reactive class — identical shape to `_rsCollapseDyn`: one `renderEffect`
    // reads both accessors, so a change to EITHER re-runs only this className
    // assignment, no remount.
    const disposeClass = renderEffect(() => {
      const idx = (valueIndex() << 1) | (isDark() ? 1 : 0)
      el.className = classes[idx] ?? ''
    })
    // Handler attachment — identical to `_rsCollapseH`: routes through the
    // canonical `_bindEvent` so delegation / batching / name normalization behave
    // byte-identically to the 5-layer mount. `Object.keys` (not `for...in`) so
    // prototype pollution can't inject a fake handler.
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
/** Shared no-op disposer for slots with no teardown work. MUST be a function:
 *  the compiler emits a slot's cleanup call UNCONDITIONALLY (`() => { __d0();
 *  __d1(); … }`), so returning `null`/`undefined` here makes that call throw
 *  `TypeError: <slot> is not a function` when the reactive boundary re-runs or
 *  unmounts. A falsy/boolean conditional slot (`{showLock && <button>}` → false)
 *  is exactly that case. */
const SLOT_NOOP = (): void => {}

/** Hydration hook — registered by hydrateRoot (never at module load, so CSR
 * bundles tree-shake it exactly like the `_tpl` adopt verifier). */
export type SlotHydrator = (
  children: VNodeChild | VNodeChild[],
  parent: Node,
  open: Comment,
) => () => void
let _slotHydrator: SlotHydrator | null = null
export function _setSlotHydrator(h: SlotHydrator): void {
  _slotHydrator = h
}

export function _mountSlot(
  children: VNodeChild | VNodeChild[],
  parent: Node,
  placeholder: Node,
): () => void {
  // ADOPTED CONTAINER. When `_tpl` bound against the SSR node instead of a
  // clone, this placeholder is not the template's inert `<!>` comment but the
  // live `<!--$-->` marker opening the range that already holds this slot's
  // server-rendered content. Mounting here would build a second copy and strand
  // the first. Hand it to hydration, which walks the value against those nodes.
  // A clone's placeholder has empty comment data, so the two can never be
  // confused.
  if (
    _slotHydrator !== null &&
    placeholder.nodeType === 8 &&
    (placeholder as Comment).data === '$'
  ) {
    return _slotHydrator(children, parent, placeholder as Comment)
  }
  if (children == null || children === false || children === true) {
    parent.removeChild(placeholder)
    return SLOT_NOOP
  }
  const cleanup = mountChild(children, parent, placeholder)
  parent.removeChild(placeholder)
  return cleanup
}
