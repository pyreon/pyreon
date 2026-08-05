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
 * @param caller - Optional explicit caller for the slow path. Compiler emits
 *   this for MemberExpression callees like `row.label()` so the slow path
 *   preserves `this` if `source` turns out to be a method. Fast path ignores it.
 */
export function _bindText(
  source: { _v?: unknown; direct?: (fn: () => void) => () => void },
  node: Text,
  caller?: () => unknown,
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
  // Fallback: bare callable. Use the compiler-provided caller when present (it
  // preserves `this` for member-expression sources). The renderEffect keeps
  // tracking `fn`'s reads across the upgrade — after the first VNode-shaped value
  // every re-run routes through the swap core, whose child mounts are untracked.
  const fn = caller ?? (source as unknown as () => unknown)
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
 * @param caller - Optional explicit caller for the slow path. Compiler emits
 *   this for MemberExpression callees like `row.label()` so the slow path
 *   preserves `this` if `source` turns out to be a method. Fast path ignores it.
 */
export function _bindDirect(
  source: { _v?: unknown; direct?: (fn: () => void) => () => void },
  updater: (value: unknown) => void,
  caller?: () => unknown,
): () => void {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.bindDirect')
  // Fast path: source has .direct() (signal or computed)
  if (source.direct) {
    updater(source._v)
    return source.direct(() => updater(source._v))
  }
  // Fallback: bare callable. Use caller if compiler provided one (preserves
  // `this` for member-expression sources); otherwise call source directly.
  const fn = caller ?? (source as unknown as () => unknown)
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

// ─── Compiled-template hydration adoption ────────────────────────────────────
// One-shot handoff: the <For> hydration-adoption path sets the SSR row root
// immediately before invoking renderItem; the _tpl call inside consumes it and
// — when the SSR DOM verifiably matches the template's structure — runs its
// bind against the EXISTING nodes instead of cloning. This is what makes
// compiled apps ADOPT server DOM (previously every compiled row was rebuilt
// and swapped in). Verification is all-or-nothing BEFORE any mutation, so a
// bail leaves the SSR row untouched for the interpretive fallback.
let _tplAdoptTarget: Element | null = null
let _tplAdoptConsumed = false

/** Set/clear the one-shot adoption target (For hydration adoption only). */
export function _setTplAdoptTarget(el: Element | null): void {
  _tplAdoptTarget = el
  _tplAdoptConsumed = false
}

/** Did the last _tpl call adopt the target (vs clone)? */
export function _tplAdoptDidConsume(): boolean {
  return _tplAdoptConsumed
}

/** Per-template parsed signature (tag + text-count per element, tree order),
 * cached on first adoption attempt — replay compares with zero string allocs. */
interface TplSig {
  tags: string[]
  counts: number[]
}
const _tplSignature = new WeakMap<HTMLTemplateElement, TplSig | null>()

function templateSignature(tpl: HTMLTemplateElement, html: string): TplSig | null {
  let sig = _tplSignature.get(tpl)
  if (sig !== undefined) return sig
  // Templates with comment placeholders (`<!>` dynamic slots / mountSlot
  // machinery) have clone-time structure the SSR DOM does not — never adopt.
  if (html.includes('<!')) {
    _tplSignature.set(tpl, null)
    return null
  }
  const root = tpl.content.firstElementChild
  if (!root || root.nextElementSibling) {
    _tplSignature.set(tpl, null)
    return null
  }
  const tags: string[] = []
  const counts: number[] = []
  const walk = (el: Element) => {
    // tag + textChildCount — the count gates BIND-SLOT alignment: a template
    // text slot (dynamic or static) must have a counterpart text node in the
    // SSR DOM, else a compiled `.firstChild` text ref would land on
    // null/wrong-node (e.g. an UNMARKED empty dynamic slot in compiled-SSR
    // output). Element-only walks keep it marker-comment-immune.
    let texts = 0
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) texts++
    }
    tags.push(el.tagName)
    counts.push(texts)
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) walk(c)
  }
  walk(root)
  sig = { tags, counts }
  _tplSignature.set(tpl, sig)
  return sig
}

/**
 * Walk the SSR target in the SAME element order as templateSignature,
 * comparing TAG:textCount per element against the template's signature parts.
 * Where the template expects ZERO texts but the SSR element has bare text
 * children (the compiled `_setChild`-managed static slot: the bind rewrites
 * the element's content wholesale, so pre-existing SSR text must simply go —
 * exactly what a clone-and-swap would produce), those texts are collected for
 * pre-bind REMOVAL instead of bailing. Any NONZERO-count mismatch still bails
 * (`.firstChild` text refs would misalign). Returns the removal list, or null
 * on mismatch.
 */
interface AdoptMatch {
  removals: Text[] | null
  triplets: { open: Comment; text: Text | null; close: Comment }[] | null
}

/**
 * Positional replay plan, built from the FIRST fully-verified row: element
 * child-hop paths to each `$` triplet's parent + its child index, and to each
 * kept/removed bare-text position. Rows of a non-`<!` compiled template are
 * structurally IDENTICAL by construction (same template, no conditional
 * slots), so subsequent rows verify at the recorded SPOTS (is the `$` comment
 * where the plan says?) instead of re-walking every node — any spot mismatch
 * bails that row to the full verify.
 */
interface AdoptPlan {
  sig: TplSig
  /** [domPath to parent element..., childIndex] per triplet. */
  tripletSpots: number[][]
  /** domPaths of elements whose EXTRA bare texts get removed (template 0, >1 texts). */
  removalSpots: number[][]
}
const _tplAdoptPlan = new WeakMap<HTMLTemplateElement, AdoptPlan | null>()

function elByPath(root: Element, path: number[], upto: number): Element | null {
  let el: Element | null = root
  for (let i = 0; i < upto && el; i++) {
    let c: Element | null = el.firstElementChild
    for (let k = 0; k < (path[i] as number) && c; k++) c = c.nextElementSibling
    el = c
  }
  return el
}

/** Record element paths (element-index hops) alongside a full verify. */
function buildAdoptPlan(root: Element, sig: TplSig, match: AdoptMatch): AdoptPlan {
  const tripletSpots: number[][] = []
  const removalSpots: number[][] = []
  const pathOf = (el: Element): number[] => {
    const path: number[] = []
    let cur: Element = el
    while (cur !== root) {
      const parent = cur.parentElement as Element
      let idx = 0
      for (let c = parent.firstElementChild; c && c !== cur; c = c.nextElementSibling) idx++
      path.unshift(idx)
      cur = parent
    }
    return path
  }
  if (match.triplets) {
    for (const t of match.triplets) {
      const parent = t.open.parentElement as Element
      let ci = 0
      for (let n = parent.firstChild; n && n !== t.open; n = n.nextSibling) ci++
      tripletSpots.push([...pathOf(parent), -1, ci])
    }
  }
  if (match.removals) {
    for (const r of match.removals) removalSpots.push(pathOf(r.parentElement as Element))
  }
  return { sig, tripletSpots, removalSpots }
}

/**
 * Spot-verify + normalize a subsequent row against the recorded plan.
 * Returns false on any spot mismatch (caller re-runs the full verify).
 */
function replayAdoptPlan(root: Element, plan: AdoptPlan): boolean {
  for (const spot of plan.tripletSpots) {
    const sep = spot.indexOf(-1)
    const parent = elByPath(root, spot, sep)
    if (!parent) return false
    const ci = spot[sep + 1] as number
    let n: ChildNode | null = parent.firstChild
    for (let k = 0; k < ci && n; k++) n = n.nextSibling
    if (!n || n.nodeType !== 8 || (n as Comment).data !== '$') return false
    const a = n.nextSibling
    if (a && a.nodeType === 3) {
      const b = a.nextSibling
      if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') return false
      ;(n as Comment).remove()
      ;(b as Comment).remove()
    } else if (a && a.nodeType === 8 && (a as Comment).data === '/$') {
      parent.insertBefore(document.createTextNode(''), a)
      ;(n as Comment).remove()
      ;(a as Comment).remove()
    } else return false
  }
  for (const spot of plan.removalSpots) {
    const parent = elByPath(root, spot, spot.length)
    if (!parent) return false
    let n: ChildNode | null = parent.firstChild
    while (n) {
      const nx: ChildNode | null = n.nextSibling
      if (n.nodeType === 3 && !(nx === null && parent.firstChild === n)) {
        // remove extras; sole-text keeps are template-0 single-text cases which
        // never land in removalSpots (removals recorded only for >1 bare texts)
        ;(n as Text).remove()
      }
      n = nx
    }
  }
  return true
}

function matchDomAgainstTemplate(root: Element, expected: TplSig): AdoptMatch | null {
  let removals: Text[] | null = null
  let triplets: { open: Comment; text: Text | null; close: Comment }[] | null = null
  const tags = expected.tags
  const wantCounts = expected.counts
  const total = tags.length
  let idx = 0
  const walk = (el: Element): boolean => {
    const at = idx++
    if (at >= total || tags[at] !== el.tagName) return false
    let texts = 0
    let bare: Text[] | null = null
    // Single pass over children: count texts, validate + collect `$` triplets
    // inline (adjacency rules from collectDollarTriplets), gather bare texts.
    let n: ChildNode | null = el.firstChild
    while (n) {
      if (n.nodeType === 8) {
        const d = (n as Comment).data
        if (d === '$') {
          texts++
          const prev = n.previousSibling
          if (prev && prev.nodeType === 3) return false // adjacent-text seam
          const a = n.nextSibling
          if (!a) return false
          if (a.nodeType === 8 && (a as Comment).data === '/$') {
            const after = a.nextSibling
            if (after && after.nodeType === 3) return false
            ;(triplets ??= []).push({ open: n as Comment, text: null, close: a as Comment })
            n = a.nextSibling
            continue
          }
          if (a.nodeType !== 3) return false
          const b = a.nextSibling
          if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') return false
          const after = b.nextSibling
          if (after && after.nodeType === 3) return false
          ;(triplets ??= []).push({ open: n as Comment, text: a as Text, close: b as Comment })
          n = b.nextSibling
          continue
        }
        if (d === '/$') return false // orphan close
        // Foreign marker (k:, pyreon-for, async) inside a row — bail.
        return false
      }
      if (n.nodeType === 3) {
        texts++
        ;(bare ??= []).push(n as Text)
      }
      n = n.nextSibling
    }
    const wantTexts = wantCounts[at] as number
    if (texts !== wantTexts) {
      // Template expects NO texts here → the bind manages this element's
      // content (`_setChild`). A SOLE bare text is KEPT — `_setChild`'s
      // sole-text fast path writes `.data` in place, reusing the SSR node
      // (and the value matches by construction, making the write ~free).
      // Multiple bare texts are removed pre-bind (parser-merge shapes the
      // sole-text path can't reuse). Any other mismatch is a structural
      // divergence: bail.
      if (wantTexts === 0 && bare) {
        if (bare.length > 1) (removals ??= []).push(...bare)
      } else return false
    }
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!walk(c)) return false
    }
    return true
  }
  if (!walk(root)) return null
  if (idx !== total) return null
  return { removals, triplets }
}

/** All checks passed — strip markers, ensuring one text node per slot. */
function normalizeDollarTriplets(
  triplets: { open: Comment; text: Text | null; close: Comment }[],
): void {
  for (const t of triplets) {
    if (!t.text) t.open.parentNode?.insertBefore(document.createTextNode(''), t.close)
    t.open.remove()
    t.close.remove()
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
  if (_tplAdoptTarget) {
    const target = _tplAdoptTarget
    _tplAdoptTarget = null // one-shot, cleared on ANY outcome
    const troot = tpl.content.firstElementChild
    if (troot && target.tagName === troot.tagName) {
      // Positional fast path: rows after the first spot-verify + normalize at
      // the recorded positions (structurally-identical rows by construction).
      const plan = _tplAdoptPlan.get(tpl)
      if (plan && replayAdoptPlan(target, plan)) {
        const cleanup = bind(target as HTMLElement)
        _tplAdoptConsumed = true
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('runtime.tpl.adopt')
        return { __isNative: true, el: target as HTMLElement, cleanup }
      }
      const sig = templateSignature(tpl, html)
      const match = sig !== null ? matchDomAgainstTemplate(target, sig) : null
      if (match !== null) {
        if (plan === undefined) _tplAdoptPlan.set(tpl, buildAdoptPlan(target, sig!, match))
        if (match.removals) for (const t of match.removals) t.remove()
        if (match.triplets) normalizeDollarTriplets(match.triplets)
        const cleanup = bind(target as HTMLElement)
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

export function _mountSlot(
  children: VNodeChild | VNodeChild[],
  parent: Node,
  placeholder: Node,
): () => void {
  if (children == null || children === false || children === true) {
    parent.removeChild(placeholder)
    return SLOT_NOOP
  }
  const cleanup = mountChild(children, parent, placeholder)
  parent.removeChild(placeholder)
  return cleanup
}
