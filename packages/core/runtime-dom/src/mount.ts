import type {
  ComponentFn,
  ForProps,
  LifecycleHooks,
  NativeItem,
  PortalProps,
  RefProp,
  VNode,
  VNodeChild,
} from '@pyreon/core'
import {
  dispatchToErrorBoundary,
  EMPTY_PROPS,
  ForSymbol,
  Fragment,
  makeReactiveProps,
  mergeProps,
  PortalSymbol,
  propagateError,
  reportError,
  _runHooked,
  _takeHooks,
  SuspenseBoundaryContext,
  useContext,
} from '@pyreon/core'
import {
  _noopDispose,
  _rdDropBinding,
  _rdLabelBinding,
  batch,
  effectScope,
  getContextOwner,
  renderEffect,
  runUntracked,
  runWithContextOwner,
  setContextOwner,
  setCurrentScope,
  _captureRun,
  _frameReads,
  _releaseRun,
  type EffectScope,
  type RunCapture,
} from '@pyreon/reactivity'
import { setupDelegation } from './delegate'
import { _adoptingCompiledBind, reportFirstText } from './hydration-debug'
import { _devInspectable, registerComponent, unregisterComponent } from './devtools'
import { _takePendingForAdoption, detachNode, mountFor, mountKeyedList, mountReactive } from './nodes'
import { applyProps, applySelectValueProp } from './props'
import { suspenseAttachOf } from './suspense-boundary'
import type { RemountableNativeItem } from './template'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

type Cleanup = () => void
const noop: Cleanup = () => {
  /* noop */
}

// When > 0, we're mounting children inside an element — child cleanups can skip
// DOM removal (parent element removal handles it). This avoids allocating a
// removeChild closure for every nested element that has no reactive work.
let _elementDepth = 0

// Stack tracking which component is currently being mounted (depth-first order).
// Used to infer parent/child relationships for DevTools.
// Only allocated in dev — production mounts skip devtools entirely.
let _mountingStack: string[] | undefined
if (process.env.NODE_ENV !== 'production') _mountingStack = []
// Component scope → its devtools id (dev only). A WeakMap, so an entry goes
// with its scope; nothing to evict by hand.
let _devScopeIds: WeakMap<EffectScope, string> | undefined
if (process.env.NODE_ENV !== 'production') _devScopeIds = new WeakMap()

/**
 * Mount a single child into `parent`, inserting before `anchor` (null = append).
 * Returns a cleanup that removes the node(s) and disposes all reactive effects.
 *
 * This function is the hot path — all child types are handled inline to avoid
 * function call overhead in tight render loops (1000+ calls per list render).
 */
/**
 * Mount a STATIC child (a value, never an accessor) as part of a freshly built
 * element — the same depth window `mountElement` gives its own children, so
 * descendants return effect-only cleanups and their DOM leaves with the
 * ancestor as a unit instead of one `removeChild` each.
 *
 * Exists for the compiled template's slots and holes: `_tpl` binds run outside
 * `mountElement`, so `<div class="list">{children}</div>` — the ordinary list
 * container, a static array of 500 component rows — used to hand every row a
 * real remover. On teardown that was 500 individual `removeChild` calls, each
 * a style-invalidating DOM mutation on a live tree, before the container was
 * itself removed: 64% of the dispose-500 board's Pyreon time (43µs of 66µs
 * on-CPU, 116µs wall against 26µs for the same rows mounted through `h()`).
 *
 * Only for values. A FUNCTION child is a reactive boundary that re-renders its
 * range and must own real removers (`mountReactive` resets the depth itself),
 * so callers keep it on `mountChild`.
 */
export function mountChildAsUnit(
  child: VNodeChild | VNodeChild[],
  parent: Node,
  anchor: Node | null,
): Cleanup {
  _elementDepth++
  try {
    return mountChild(child, parent, anchor)
  } finally {
    _elementDepth--
  }
}

export function mountChild(
  child: VNodeChild | VNodeChild[] | (() => VNodeChild | VNodeChild[]),
  parent: Node,
  anchor: Node | null = null,
): Cleanup {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.mountChild')
  // Reactive accessor — function that reads signals
  if (typeof child === 'function') {
    return mountAccessorChild(child as () => VNodeChild | VNodeChild[], parent, anchor)
  }

  // Array of children (e.g. from .map())
  if (Array.isArray(child)) return mountChildren(child, parent, anchor)

  // Nothing to render
  if (child == null || child === false) return noop

  // Primitive — text node (static, no reactive effects to tear down).
  if (typeof child !== 'object') {
    const tn = document.createTextNode(String(child))
    parent.insertBefore(tn, anchor)
    // `_elementDepth > 0` → this text is a child of a freshly-built element
    // removed as a unit, so a per-node remover is redundant (noop). BUT at depth 0
    // the text was mounted directly into a LIVE parent through a reactive
    // boundary, whose teardown removes children INDIVIDUALLY via their cleanups —
    // a noop there ORPHANS the text node (`() => cond ? <>a b</> : 'x'` rendered
    // "abx"). Mirrors the reactive-text fast path's own `_elementDepth` gate.
    if (_elementDepth > 0) return noop
    return () => detachNode(tn)
  }

  // NativeItem — pre-built DOM element from _tpl() or createTemplate().
  if ((child as unknown as NativeItem).__isNative) {
    const native = child as unknown as NativeItem
    // A re-mountable item whose bindings were disposed by an earlier unmount
    // must be rebuilt before it goes back in the DOM.
    if ((native as Partial<RemountableNativeItem>).__dead === true) {
      ;(native as RemountableNativeItem).__revive()
    }
    parent.insertBefore(native.el, anchor)
    if (!native.cleanup) {
      if (_elementDepth > 0) return noop
      return () => detachNode(native.el)
    }
    if (_elementDepth > 0) return native.cleanup
    return () => {
      native.cleanup?.()
      detachNode(native.el)
    }
  }

  // VNode — element, component, fragment, For, Portal
  const vnode = child as VNode

  if (vnode.type === Fragment) return mountChildren(vnode.children ?? [], parent, anchor)

  if (vnode.type === (ForSymbol as unknown as string)) {
    // The compiler wraps `<For each={signal}>` in `_rp(() => signal())`, so
    // `props.each` is a getter returning the resolved array, not the function.
    // Destructuring would eagerly capture the array, breaking reactivity and
    // crashing mountFor (which calls `source()`). Read it lazily so the getter
    // fires inside mountFor's effect. User-written `each={() => fn()}` still
    // works — props.each is then the function itself.
    const props = vnode.props as unknown as ForProps<unknown>
    const initialEach = props.each
    const source: () => readonly unknown[] =
      typeof initialEach === 'function'
        ? initialEach
        : () => props.each as readonly unknown[]
    const prevDepth = _elementDepth
    _elementDepth = 0
    const cleanup = mountFor(
      source,
      props.by,
      props.children,
      parent,
      anchor,
      mountChild,
      // One-shot hydration-adoption handoff — non-null only when hydrate.ts
      // set it synchronously before dispatching this <For> vnode.
      _takePendingForAdoption(),
      // Inside a freshly built element, the element's removal takes the rows
      // with it — so the For's teardown may skip its own (see `detachNode`).
      prevDepth > 0,
    )
    _elementDepth = prevDepth
    return cleanup
  }

  if (vnode.type === (PortalSymbol as unknown as string)) {
    const { target, children } = vnode.props as unknown as PortalProps
    if (process.env.NODE_ENV !== 'production' && !target) {
      console.warn('[Pyreon] <Portal> received a falsy `target`. Provide a valid DOM element.')
      return noop
    }
    if (process.env.NODE_ENV !== 'production' && !(target instanceof Node)) {
      console.warn(
        `[Pyreon] <Portal> target must be a DOM node. Received ${typeof target}. ` +
          'Use document.getElementById() or a ref to get the target element.',
      )
    }
    // Portal content lives OUTSIDE the app's mount container, so delegated events
    // bubbling from it never reach the app root's listener — every delegated
    // handler inside a portal was silently dead. Make the Portal own its
    // delegation root. Safe when the target is an ANCESTOR of the app root
    // (document.body): the per-dispatch DELEGATED_ELEMENTS invoked-set makes an
    // outer root skip elements an inner one already handled. Idempotent.
    if (target instanceof Element) setupDelegation(target)
    // Portal content mounts into `target` (e.g. document.body) — a LIVE parent
    // NOT removed as a unit, so mountChild's cleanup does not remove the DOM.
    // Without an explicit remover a portaled modal / toast / tooltip LEAKS into
    // the target forever once its owner unmounts. Bracket the content with
    // comment markers and remove everything between them on dispose; mounting
    // before `portalEnd` keeps reactive content inside the bracket.
    const portalStart = document.createComment('portal')
    const portalEnd = document.createComment('/portal')
    target.appendChild(portalStart)
    target.appendChild(portalEnd)
    const disposePortal = mountChild(children, target, portalEnd)
    return () => {
      disposePortal()
      let node: ChildNode | null = portalStart.nextSibling
      while (node && node !== portalEnd) {
        const next = node.nextSibling
        node.remove()
        node = next
      }
      portalStart.remove()
      portalEnd.remove()
    }
  }

  if (typeof vnode.type === 'function') {
    return mountComponent(vnode as VNode & { type: ComponentFn }, parent, anchor)
  }

  if (process.env.NODE_ENV !== 'production' && typeof vnode.type !== 'string') {
    console.warn(
      `[Pyreon] Invalid VNode type: expected a string tag or component function, ` +
        `received ${typeof vnode.type} (${String(vnode.type)}). ` +
        `This usually means you passed an object or class instead of a component function.`,
    )
    return noop
  }

  return mountElement(vnode, parent, anchor)
}

// ─── Element ─────────────────────────────────────────────────────────────────

// Void elements that cannot have children
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export const SVG_NS = 'http://www.w3.org/2000/svg'
export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

// ─── Element namespace ───────────────────────────────────────────────────────
//
// An h() element's namespace comes from the PARENT it is inserted into, the way
// the HTML parser's tree construction decides it: inside SVG content an element
// is SVG (except below `<foreignObject>`, an HTML integration point), inside
// MathML it is MathML (except below a text integration point — `mi`, `mo`, `mn`,
// `ms`, `mtext` — or an `annotation-xml` with an HTML encoding), and in HTML
// content only `<svg>` and `<math>` open a foreign subtree.
//
// The parent is the only source that is right for EVERY entry point. A depth
// counter plus a tag list (what this replaced) only knew about ancestors mounted
// in the same synchronous pass, so anything mounted LATER into an existing
// `<svg>` — a `<Show>` branch, a reactive child, a `<For>` row, a slot, the
// fresh mount after a hydration mismatch — fell back to the list, and every SVG
// element missing from it (`feDropShadow`, `feFuncA`, `mpath`, `switch`, …)
// became an inert HTML element. The counter also put HTML below
// `<foreignObject>` in the SVG namespace (#4453).
//
// Cost on the common path: while `mountElement` builds an element's children,
// that element and its children's namespace are held in two module slots, so a
// nested child resolves by an identity compare — no DOM read. Only a mount into
// some OTHER parent (a top-level or late mount) reads `parent.namespaceURI`, plus
// `localName` when the parent is foreign. The slots are restored when the
// element's children are done, so they never outlive the synchronous pass.

const NS_HTML = 0
const NS_SVG = 1
const NS_MATHML = 2

let _nsParent: Node | null = null
let _nsChildren = NS_HTML

/** The namespace context the CHILDREN of a foreign element are parsed in. */
function childNsOfForeign(el: Element, ns: string | null, localName: string): number {
  if (ns === SVG_NS) return localName === 'foreignObject' ? NS_HTML : NS_SVG
  if (ns === MATHML_NS) {
    if (
      localName === 'mi' ||
      localName === 'mo' ||
      localName === 'mn' ||
      localName === 'ms' ||
      localName === 'mtext'
    )
      return NS_HTML
    if (localName === 'annotation-xml') {
      const enc = el.getAttribute('encoding')?.toLowerCase()
      return enc === 'text/html' || enc === 'application/xhtml+xml' ? NS_HTML : NS_MATHML
    }
    return NS_MATHML
  }
  return NS_HTML
}

function childNsOf(parent: Node): number {
  if (parent === _nsParent) return _nsChildren
  // `namespaceURI` is an Element member: a DocumentFragment, ShadowRoot or
  // Document parent reads `undefined` and is HTML content.
  const ns = (parent as Element).namespaceURI
  if (ns === SVG_NS || ns === MATHML_NS) {
    return childNsOfForeign(parent as Element, ns, (parent as Element).localName)
  }
  return NS_HTML
}

function createElementIn(ns: number, tag: string): Element {
  if (ns === NS_HTML) {
    if (tag === 'svg') return document.createElementNS(SVG_NS, tag)
    if (tag === 'math') return document.createElementNS(MATHML_NS, tag)
    return document.createElement(tag)
  }
  if (ns === NS_SVG) return document.createElementNS(SVG_NS, tag)
  // MathML content: `<svg>` (inside `annotation-xml`) is SVG, the rest MathML.
  // Not modelled: the parser keeps `mglyph`/`malignmark` MathML directly below
  // a text integration point; here they follow the HTML rule like any tag.
  if (tag === 'svg') return document.createElementNS(SVG_NS, tag)
  return document.createElementNS(MATHML_NS, tag)
}

/** The namespace URI `createElementIn(ns, tag)` gives, without asking the DOM. */
function nsUriOf(ns: number, tag: string): string | null {
  if (ns === NS_SVG) return SVG_NS
  if (tag === 'svg') return SVG_NS
  if (ns === NS_MATHML || tag === 'math') return MATHML_NS
  return null
}

function mountElement(vnode: VNode, parent: Node, anchor: Node | null): Cleanup {
  const tag = vnode.type as string
  const parentNs = childNsOf(parent)
  const el = createElementIn(parentNs, tag)

  if (process.env.NODE_ENV !== 'production' && (vnode.children?.length ?? 0) > 0 && VOID_ELEMENTS.has(vnode.type as string)) {
    console.warn(
      `[Pyreon] <${vnode.type as string}> is a void element and cannot have children. ` +
        'Children passed to void elements will be ignored by the browser.',
    )
  }

  // Skip applyProps entirely when props is the shared empty sentinel (identity check — no allocation)
  const props = vnode.props
  // `<select value>` is excluded from the pre-children pass and applied
  // AFTER mountChildren below (PZ-09) — see applySelectValueProp.
  const isSelect = tag === 'select'
  let propCleanup: Cleanup | null =
    props !== EMPTY_PROPS ? applyProps(el, props, isSelect ? 'value' : undefined) : null

  // Mount children inside element context — nested elements can skip DOM removal closures.
  // The element's own children resolve their namespace from the slots below
  // without touching the DOM; an HTML element in HTML content (the common case)
  // decides it with two compares.
  const prevNsParent = _nsParent
  const prevNsChildren = _nsChildren
  _nsParent = el
  _nsChildren =
    parentNs === NS_HTML && tag !== 'svg' && tag !== 'math'
      ? NS_HTML
      : childNsOfForeign(el, nsUriOf(parentNs, tag), tag)
  _elementDepth++
  let childCleanup: Cleanup
  try {
    childCleanup = mountChildren(vnode.children ?? [], el, null)
  } finally {
    _elementDepth--
    _nsParent = prevNsParent
    _nsChildren = prevNsChildren
  }

  // `<select value>` — deferred until after children (PZ-09): the property
  // assignment selects a matching <option>, so the options must exist first. Runs
  // while the element is still detached, which property assignment supports. The
  // cleanup chains into propCleanup so downstream branches are unchanged.
  if (isSelect && props !== EMPTY_PROPS && 'value' in props) {
    const valueCleanup = applySelectValueProp(el, props)
    if (valueCleanup) {
      const prior = propCleanup
      propCleanup = prior
        ? () => {
            prior()
            valueCleanup()
          }
        : valueCleanup
    }
  }

  parent.insertBefore(el, anchor)

  // Populate ref after the element is in the DOM
  const ref = props.ref as RefProp<Element> | null | undefined
  if (ref) {
    if (typeof ref === 'function') ref(el)
    else ref.current = el
  }

  if (!propCleanup && childCleanup === noop && !ref) {
    if (_elementDepth > 0) return noop
    return () => detachNode(el)
  }

  if (_elementDepth > 0) {
    if (!ref && !propCleanup) return childCleanup
    if (!ref && propCleanup)
      return () => {
        propCleanup()
        childCleanup()
      }
    const refToClean = ref
    return () => {
      if (refToClean) {
        if (typeof refToClean === 'function') refToClean(null)
        else refToClean.current = null
      }
      if (propCleanup) propCleanup()
      childCleanup()
    }
  }

  return () => {
    if (ref) {
      if (typeof ref === 'function') ref(null)
      else ref.current = null
    }
    if (propCleanup) propCleanup()
    childCleanup()
    detachNode(el)
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Dev-only (PZ-10): diagnose the `props.X is not a function` setup throw
 * caused by Pyreon's reactive-prop auto-unwrap.
 *
 * `foo={expr}` with a compiler-visible signal compiles to `_rp(() => expr)`;
 * `makeReactiveProps` converts the branded thunk into a property GETTER, so
 * `props.foo` is already the current VALUE. A child that types the prop as
 * `() => T` and calls `props.foo()` throws — and the failure is INTERMITTENT
 * across call sites (raw arrows / hook-returned callables pass through
 * un-wrapped and work), which makes it the worst-DX variant of this class.
 *
 * The diagnosis requires BOTH signals to agree: the TypeError message names
 * the prop AND the merged props object carries a GETTER descriptor for that
 * exact name — a plain data prop (or an unrelated identifier that happens to
 * match) never triggers it. Only called inside the bare
 * `process.env.NODE_ENV` dev gate, so it tree-shakes out of production
 * bundles (locked by `dev-gate-treeshake.test.ts`).
 */
function diagnoseReactivePropCall(
  err: unknown,
  props: Record<string, unknown>,
  componentName: string,
): string | null {
  if (!(err instanceof TypeError)) return null
  const m = /(\w+) is not a function/.exec(err.message)
  if (!m) return null
  const propName = m[1] as string
  if (!Object.getOwnPropertyDescriptor(props, propName)?.get) return null
  return (
    `[Pyreon] <${componentName}> called props.${propName} as a function, but '${propName}' is a ` +
    `compiler-wrapped reactive prop — Pyreon auto-unwraps it to its current VALUE. Type the prop ` +
    `as the value and read props.${propName} in a reactive scope; if you need a lazy accessor, ` +
    `have the caller pass an explicit arrow (${propName}={() => value}).`
  )
}

/**
 * The props object a component runs with — the ONE builder shared by
 * `mountComponent` and `hydrateComponent`, so the two paths cannot drift.
 *
 * Positional children (`h(Comp, props, ...children)`) are merged into
 * `props.children` by DESCRIPTOR copy (`mergeProps`), then compiler-emitted
 * `_rp(() => expr)` thunks become getters (`makeReactiveProps`). An object
 * spread here would fire every getter already on `vnode.props` — e.g. a
 * component forwarding its own props with `h(Inner, props, 'label')` — and
 * freeze the value, so the child would stop tracking the signal.
 */
export function componentProps(vnode: VNode): Record<string, unknown> {
  const props = vnode.props as Record<string, unknown>
  const children = vnode.children ?? []
  const raw =
    children.length > 0 && props.children === undefined
      ? mergeProps(props, { children: children.length === 1 ? children[0] : children })
      : props
  return raw === EMPTY_PROPS ? raw : makeReactiveProps(raw)
}

function mountComponent(
  vnode: VNode & { type: ComponentFn },
  parent: Node,
  anchor: Node | null,
): Cleanup {
  // Owner chain: link this component's scope to its parent owner so
  // `useContext()` resolves up the component tree. The owner stays `scope`
  // through both `runWithHooks` (so `provide()` writes onto it) and `mountChild`
  // (so children chain to it), restored on every exit path. Kept SEPARATE from
  // `setCurrentScope` (effect tracking) so the two concerns don't interfere.
  //
  // The per-component `EffectScope` allocation below is NOT an optimization
  // target — measured + rejected (2026-08). Making it LAZY (allocate on first
  // use, so the ~50% of components that register no effect, computed, template
  // binding, cleanup or context never pay for one) is the obvious idea and it
  // does not pay:
  //
  //  - CEILING. Adding a SECOND `EffectScope` and a second `LifecycleHooks` per
  //    component — the correctness-preserving way to price them, since removing
  //    them breaks disposal and would bias the run by leaking across iterations
  //    — cost +0.59% on the 2,047-component deep-tree mount. In the same
  //    interleaved session the `context → 1,024 consumers` op, which mounts
  //    nothing and cannot be affected, moved ±2%. The allocations are below the
  //    benchmark's own resolution.
  //  - COST. A safe lazy design cannot be free. `getCurrentScope()` and
  //    `getContextOwner()` would each need a materialize branch, and those run
  //    far more often than once per component (every effect, computed, binding,
  //    context read, deferred-boundary capture and effect snapshot-capture).
  //    Per component it also needs two flags, a materialized slot, and
  //    save/restore of three values — which cannot be packed into a frame object
  //    without re-introducing exactly the allocation being removed. The same
  //    bookkeeping applied to the (simpler) hooks object measured net zero.
  //  - RISK. Every registration path would have to be routed through one
  //    materializer or a disposable is silently dropped. `onScopeDispose` reads
  //    the module variable directly rather than through `getCurrentScope()`, and
  //    `EffectScope.runInScope` / `setCurrentScope` would each need to clear the
  //    pending flag or `@pyreon/store`'s scope shielding silently re-parents its
  //    computeds onto the component. `getCurrentScope()` is also public and is
  //    what `@pyreon/solid-compat` returns from `getOwner()`.
  //
  // So: a leak-class risk surface across a public API, for a win that is not
  // measurable. Re-open only with a measurement that clears ±2% on this
  // benchmark. That verdict is about SPEED and the scope. The hooks object IS
  // now lazy (`_runHooked` in `@pyreon/core`), for RETAINED HEAP: it lives as
  // long as the component, and its lazy design needs no hot-path branch
  // (registration is rare, unlike scope/owner reads).
  const prevOwner = getContextOwner()
  const scope = effectScope()
  scope._parent = prevOwner
  setCurrentScope(scope)
  setContextOwner(scope)

  let hooks: LifecycleHooks
  let output: VNodeChild

  const componentName = (vnode.type.name || 'Anonymous') as string

  // Devtools: generate ID + track parent/child hierarchy (dev only).
  // In production, compId/devParentId are never assigned — Vite tree-shakes
  // all __DEV__ blocks + the devtools module import to zero bytes.
  let compId: string | undefined
  let devParentId: string | null | undefined
  if (process.env.NODE_ENV !== 'production') {
    compId = `${componentName}-${Math.random().toString(36).slice(2, 9)}`
    // The parent is the nearest component up the OWNER chain. The mounting
    // stack alone is empty when a reactive update mounts a component later
    // (a <For> row added, a <Show> turning on, a route change), which made
    // every such component a root in the devtools tree.
    let ownerId: string | undefined
    for (let o: EffectScope | null = prevOwner; o !== null && ownerId === undefined; o = o._parent) {
      ownerId = _devScopeIds!.get(o)
    }
    devParentId = ownerId ?? _mountingStack![_mountingStack!.length - 1] ?? null
    _devScopeIds!.set(scope, compId)
    _mountingStack!.push(compId)
  }

  const mergedProps = componentProps(vnode)

  try {
    output = _runHooked(vnode.type, mergedProps)
    hooks = _takeHooks()
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') _mountingStack!.pop()
    setCurrentScope(null)
    setContextOwner(prevOwner)
    scope.stop()
    reportError({
      component: componentName,
      phase: 'setup',
      error: err,
      timestamp: Date.now(),
      props: vnode.props as Record<string, unknown>,
    })
    const handled = dispatchToErrorBoundary(err)
    if (!handled) {
      console.error(`[Pyreon] <${componentName}> threw during setup:`, err)
    }
    if (process.env.NODE_ENV !== 'production') {
      // PZ-10: "props.X is not a function", caused by the reactive-prop
      // auto-unwrap. Printed even when an ErrorBoundary handled the throw — the
      // fallback can't explain the root cause. Fires at most once per mount.
      const diagnosis = diagnoseReactivePropCall(
        err,
        mergedProps as Record<string, unknown>,
        componentName,
      )
      if (diagnosis) console.error(diagnosis)
      if (!handled) {
        const overlay = document.createElement('pre')
        overlay.style.cssText =
          'color:#e53e3e;background:#fff5f5;padding:12px;border:2px solid #e53e3e;border-radius:6px;font-size:12px;margin:4px;font-family:monospace;white-space:pre-wrap;word-break:break-word'
        const e = err as Error
        overlay.textContent = `[${componentName}] ${e.message ?? err}\n${
          diagnosis ? `${diagnosis}\n` : ''
        }${e.stack ?? ''}`
        parent.insertBefore(overlay, anchor)
        return () => overlay.remove()
      }
    }
    return noop
  } finally {
    setCurrentScope(null)
  }

  if (process.env.NODE_ENV !== 'production' && output != null && typeof output === 'object') {
    if (!(output instanceof Promise) && !('type' in output) && !Array.isArray(output) && !(output as any).__isNative) {
      // Objects without `type` that are NOT arrays (valid VNodeChild[] from
      // Fragment returns), NOT NativeItems (from _tpl) and NOT Promises are
      // invalid.
      console.warn(
        `[Pyreon] Component <${componentName}> returned an invalid value. Components must return a VNode, string, null, function, Promise, or array.`,
      )
    }
  }

  if (hooks.update) {
    for (const fn of hooks.update) scope.addUpdateHook(fn)
  }

  // Async component support — parity with `renderToString`, which awaits Promise
  // outputs. Insert a placeholder comment at the mount point, then mount the
  // resolved value once the Promise settles. An outer <Suspense> only recognizes
  // lazy()-style markers, so this is the canonical client-side "async function
  // component" path. Nothing visible renders during the await — use lazy() +
  // Suspense if you need a fallback.
  if (output instanceof Promise) {
    // Below a `<Suspense>` (at any depth), an async component suspends the
    // boundary until it settles — the same contract `lazy()` follows. Resolved
    // with the component's own scope as owner, so the NEAREST boundary answers.
    useContext(SuspenseBoundaryContext)?.register(output)
    const placeholder = document.createComment('async')
    parent.insertBefore(placeholder, anchor)
    let resolvedCleanup: Cleanup = noop
    let cancelled = false
    output
      .then((resolved) => {
        // The placeholder's LIVE parent, not the one captured at setup: while
        // another load keeps an enclosing `<Suspense>` pending, its content
        // (placeholder included) sits in an off-screen fragment.
        const liveParent = placeholder.parentNode
        if (cancelled || liveParent === null) return
        try {
          if (resolved != null) {
            // The resolved subtree mounts in a microtask, outside both the
            // owner and the batch every other mount runs in, so re-enter both:
            //  - the owner: this component's scope, so descendants'
            //    `useContext()` reach the ancestors' providers AND anything
            //    this component `provide()`d before its first await — the
            //    owner the synchronous path gives `mountChild` (#4377);
            //  - a batch: an effect-driven mount (`<Show>`, a route swap)
            //    already runs inside the effect flush, so what it notifies
            //    applies AFTER it finishes. Without one, a still-loading
            //    `lazy()` in the subtree registers with the enclosing
            //    `<Suspense>`, which moves its content off-screen
            //    SYNCHRONOUSLY — taking `placeholder` out of `liveParent` halfway
            //    through this mount (`insertBefore` NotFoundError, empty page).
            batch(() => {
              resolvedCleanup = runWithContextOwner(scope, () =>
                mountChild(resolved as VNodeChild, liveParent, placeholder),
              )
            })
          }
        } catch (err) {
          const handled = propagateError(err, hooks) || dispatchToErrorBoundary(err)
          if (!handled && process.env.NODE_ENV !== 'production') {
            console.error(`[Pyreon] <${componentName}> threw during async render:`, err)
          }
        }
      })
      .catch((err) => {
        if (cancelled) return
        const handled = propagateError(err, hooks) || dispatchToErrorBoundary(err)
        if (!handled && process.env.NODE_ENV !== 'production') {
          console.error(`[Pyreon] <${componentName}> async render rejected:`, err)
        }
      })

    if (process.env.NODE_ENV !== 'production') {
      _mountingStack!.pop()
      // Registered like a sync component (the hydration walk registers async
      // components too). No element yet: its output mounts when the promise settles.
      registerComponent(compId!, componentName, null, devParentId!)
    }

    // Restore the parent owner NOW, as the synchronous path does once its
    // subtree is mounted: this component's siblings must not resolve context
    // through its scope. (Restoring it in the unmount closure instead left the
    // owner pointing here for the rest of the parent's mount, and clobbered
    // whatever owner was current when the component later unmounted.)
    setContextOwner(prevOwner)

    return () => {
      if (process.env.NODE_ENV !== 'production') unregisterComponent(compId!)
      cancelled = true
      resolvedCleanup()
      if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder)
      scope.stop()
    }
  }

  let subtreeCleanup: Cleanup = noop
  // A `<Suspense>` delimits its output so it can move it off-screen while a
  // descendant loads (see `attachSuspenseBoundary`).
  const suspenseAttach = suspenseAttachOf(vnode.type)
  const boundaryEnd = suspenseAttach !== undefined ? document.createComment('/suspense') : null
  const boundaryStart = boundaryEnd !== null ? document.createComment('suspense') : null
  if (boundaryEnd !== null) {
    parent.insertBefore(boundaryStart!, anchor)
    parent.insertBefore(boundaryEnd, anchor)
  }
  // Dev-only: remember where this component's output starts, so devtools
  // records the component's OWN first element rather than the parent's.
  const devEnd = process.env.NODE_ENV !== 'production' ? (boundaryEnd ?? anchor) : null
  const devBefore =
    process.env.NODE_ENV !== 'production' ? (devEnd ? devEnd.previousSibling : parent.lastChild) : null
  try {
    subtreeCleanup = output != null ? mountChild(output, parent, boundaryEnd ?? anchor) : noop
    if (boundaryEnd !== null) {
      const boundary = useContext(SuspenseBoundaryContext)
      if (boundary !== null) {
        const detach = suspenseAttach!(boundary, boundaryStart!, boundaryEnd, mountChild)
        const inner = subtreeCleanup
        subtreeCleanup = () => {
          inner()
          detach()
        }
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') _mountingStack!.pop()
    scope.stop()
    setContextOwner(prevOwner)
    const handled = propagateError(err, hooks) || dispatchToErrorBoundary(err)
    if (!handled) {
      reportError({
        component: componentName,
        phase: 'render',
        error: err,
        timestamp: Date.now(),
        props: vnode.props as Record<string, unknown>,
      })
      console.error(`[Pyreon] <${componentName}> threw during render:`, err)
    }
    return noop
  }

  if (process.env.NODE_ENV !== 'production') {
    _mountingStack!.pop()
    // The first element this component inserted: walk from just after
    // `devBefore` to the end marker. `parent.firstElementChild` (the old
    // read) is the FIRST SIBLING's element for every component but the
    // first, so highlight, the picker and the devtools inspector all
    // pointed at the wrong DOM.
    let firstEl: Element | null = null
    for (
      let n = devBefore ? devBefore.nextSibling : parent.firstChild;
      n !== null && n !== devEnd;
      n = n.nextSibling
    ) {
      if (n.nodeType === 1) {
        firstEl = n as Element
        break
      }
    }
    registerComponent(compId!, componentName, firstEl, devParentId!)
    _devInspectable(compId!, scope, mergedProps)
  }

  // Fire onMount hooks inline — effects created inside are tracked by the scope.
  // Lazy-allocate mountCleanups only when an onMount callback returns a cleanup fn.
  let mountCleanups: Cleanup[] | null = null
  if (hooks.mount) {
    for (const fn of hooks.mount) {
      try {
        let cleanup: (() => void) | undefined
        scope.runInScope(() => {
          cleanup = fn() as (() => void) | undefined
        })
        if (cleanup) {
          if (mountCleanups === null) mountCleanups = []
          mountCleanups.push(cleanup)
        }
      } catch (err) {
        console.error(`[Pyreon] Error in onMount hook of <${componentName}>:`, err)
        reportError({ component: componentName, phase: 'mount', error: err, timestamp: Date.now() })
      }
    }
  }

  // Subtree fully mounted (incl. onMount) — restore the parent owner so this
  // component's siblings resolve their own context, not this component's.
  setContextOwner(prevOwner)

  // No unmount work beyond the scope and the subtree (the common case — no
  // onUnmount / setup onCleanup / onMount cleanup): return a closure that
  // captures only those two. The full closure below captures this function's
  // whole context (parent, owner, hooks, name, …), which then lives as long
  // as the component.
  if (hooks.unmount === null && mountCleanups === null) return leanUnmount(scope, subtreeCleanup, compId)

  return () => {
    if (process.env.NODE_ENV !== 'production') unregisterComponent(compId!)
    scope.stop()
    subtreeCleanup()
    if (hooks.unmount) {
      for (const fn of hooks.unmount) {
        try {
          fn()
        } catch (err) {
          console.error(`[Pyreon] Error in onUnmount hook of <${componentName}>:`, err)
          reportError({
            component: componentName,
            phase: 'unmount',
            error: err,
            timestamp: Date.now(),
          })
        }
      }
    }
    if (mountCleanups) for (const fn of mountCleanups) fn()
  }
}

/** `mountComponent`'s unmount for a component with no hook cleanups — see the call site. */
function leanUnmount(scope: EffectScope, subtreeCleanup: Cleanup, compId: string | undefined): Cleanup {
  return () => {
    if (process.env.NODE_ENV !== 'production') unregisterComponent(compId!)
    scope.stop()
    subtreeCleanup()
  }
}

/**
 * @internal Dev only — devtools bookkeeping for a component the HYDRATION walk
 * runs (`hydrateComponent`). It shares `_devScopeIds` with `mountComponent`, so
 * a hydrated component's parent, and the parent of a component mounted under a
 * hydrated one later (a `<Show>` turning on, a `<For>` row, a route change),
 * resolve through the one owner-chain map. Every caller sits behind
 * `process.env.NODE_ENV !== 'production'`, so production drops these with it.
 *
 * `_devNameScope` runs BEFORE the component's setup and children (a child
 * looks its parent up by scope); `_devRegisterScope` after its subtree;
 * `_devUnregisterScope` from its cleanup. The registry entry is the only
 * retained state, and `_devUnregisterScope` removes it.
 */
export function _devNameScope(scope: EffectScope, name: string): void {
  _devScopeIds!.set(scope, `${name}-${Math.random().toString(36).slice(2, 9)}`)
}

/** @internal Dev only — see {@link _devNameScope}. */
export function _devRegisterScope(
  scope: EffectScope,
  owner: EffectScope | null,
  name: string,
  el: Element | null,
): void {
  let parentId: string | undefined
  for (let o: EffectScope | null = owner; o !== null && parentId === undefined; o = o._parent) {
    parentId = _devScopeIds!.get(o)
  }
  registerComponent(_devScopeIds!.get(scope)!, name, el, parentId ?? null)
}

/** @internal Dev only — see {@link _devNameScope}. */
export function _devUnregisterScope(scope: EffectScope): void {
  const id = _devScopeIds!.get(scope)
  if (id !== undefined) unregisterComponent(id)
}

/**
 * @internal Dev only — the first element in `[from, end)`, the DOM range a
 * component claimed. `null` when the component rendered no element.
 */
export function _devFirstElementIn(from: Node | null, end: Node | null): Element | null {
  for (let n = from; n !== null && n !== end; n = n.nextSibling) {
    if (n.nodeType === 1) return n as Element
  }
  return null
}

// ─── Children ────────────────────────────────────────────────────────────────

/**
 * The text↔subtree SWAP CORE shared by `bindPolymorphicText` (the general
 * reactive-text path) and `_bindText`'s VNode upgrade (the single-signal
 * fast path in template.ts). ONE implementation so the two paths can never
 * drift (the attrSetter↔applyProp divergence lesson in anti-patterns).
 *
 * `apply(v)`: textish values write `text.data` in place; a non-text value
 * swaps the text node for a comment marker and mounts the subtree there
 * (untracked, with the SETUP-time context owner restored — same discipline
 * as mountReactive); a later textish value tears the subtree down and
 * restores the text node. `dispose()` tears down a mounted subtree + marker
 * (real remover into the live parent — never a noop; the text node itself
 * stays the caller's responsibility, matching the historical contract).
 */
export interface PolyTextCore {
  apply: (v: VNodeChild) => void
  dispose: Cleanup
  /** True while the core holds a mounted subtree (its `dispose` has work). */
  mounted: () => boolean
}

export function createPolyTextCore(
  text: Text,
  parentAtSetup: Node,
  ownerAtSetup: ReturnType<typeof getContextOwner>,
): PolyTextCore {
  let marker: Comment | null = null
  let mode: 'text' | 'sub' = 'text'
  let subCleanup: Cleanup = noop
  // The string this core last wrote to `text`. Comparing against it instead of
  // reading `text.data` back saves a DOM read per update; `null` until the
  // first text write, which reads the node once (an adopted SSR node whose
  // text already matches is left untouched).
  let written: string | null = null
  // Bumped by every `apply`. A subtree mount can synchronously re-run the
  // binding that called `apply` (a ref or a nested boundary writing a signal
  // the accessor read), so a NESTED `apply` can land while this one's mount is
  // still on the stack. The outer call must then discard what it mounted:
  // the nested call owns the binding now, and keeping both left the outer
  // subtree on screen with no cleanup pointing at it.
  let applyGen = 0

  return {
    apply(v: VNodeChild): void {
      const myGen = ++applyGen
      const textish =
        v == null || v === false || (typeof v !== 'object' && typeof v !== 'function')
      if (textish) {
        if (mode === 'sub') {
          runUntracked(subCleanup)
          subCleanup = noop
          // Restore the text node at the marker's LIVE position.
          const p = marker!.parentNode ?? parentAtSetup
          p.insertBefore(text, marker)
          marker!.parentNode?.removeChild(marker!)
          mode = 'text'
        }
        const next = v == null || v === false ? '' : String(v as string | number | boolean)
        if (written === null) {
          written = text.data
          // Dev: inside a compiled template's ADOPTION bind this is server
          // text; report the first write if it changes it (#4419). The h()
          // walk reports before it binds and never runs inside that window.
          if (process.env.NODE_ENV !== 'production' && _adoptingCompiledBind)
            reportFirstText(text, v, next, 'reactive')
        }
        if (next !== written) {
          text.data = next
          written = next
        }
        return
      }
      // Non-text value — mount it as a subtree at this binding's position.
      if (mode === 'text') {
        if (!marker) marker = document.createComment('pyreon')
        // Live parent at swap time (the frag-then-move discipline — see the
        // mountReactive stale-parent bug class in anti-patterns).
        const p = text.parentNode ?? parentAtSetup
        p.insertBefore(marker, text)
        p.removeChild(text)
        mode = 'sub'
      } else {
        // Cleared BEFORE running, so a nested `apply` during the mount below
        // cannot run the same cleanup a second time.
        const previous = subCleanup
        subCleanup = noop
        runUntracked(previous)
      }
      const liveParent = marker!.parentNode ?? parentAtSetup
      // Reset _elementDepth: this mount can run at SETUP time (a signal that
      // ALREADY holds a VNode at bind time, inside a `_tpl` bind under
      // mountChildren's depth>0 window). The subtree is torn down INDIVIDUALLY on
      // the next textish flip, so its cleanups must be REAL removers.
      const prevDepth = _elementDepth
      _elementDepth = 0
      const mounted = runUntracked(() =>
        runWithContextOwner(ownerAtSetup, () => mountChild(v as VNodeChild, liveParent, marker)),
      )
      _elementDepth = prevDepth
      if (myGen !== applyGen) {
        runUntracked(mounted)
        return
      }
      subCleanup = mounted
    },
    dispose(): void {
      if (mode === 'sub') {
        subCleanup()
        marker?.parentNode?.removeChild(marker)
      }
    },
    mounted: () => mode === 'sub',
  }
}

/**
 * Reactive TEXT binding that can UPGRADE to a subtree mount (and back).
 *
 * The dominant case — an accessor that only ever yields strings/numbers —
 * pays exactly the historical fast path: one text node, `data` updated
 * in-place. But a reactive child's type is not stable: the idiomatic
 * `{() => loading() ? 'Loading…' : <Table/>}` starts text-ish and later
 * yields a VNode. On the first non-text value the binding swaps the text
 * node for a comment marker and mounts the subtree there (see
 * `createPolyTextCore` for the swap semantics). Shared by mountChild's
 * fast path AND the hydration adoption paths (which bind an SSR-adopted
 * text node the same way).
 */
export function bindPolymorphicText(
  child: () => VNodeChild,
  text: Text,
  parentAtSetup: Node,
): Cleanup {
  const core = createPolyTextCore(text, parentAtSetup, getContextOwner())
  const dispose = renderEffect(() => core.apply(child()))
  // Dev: a text binding at its caller (the compiled template, for the emitted
  // `bindPolymorphicText(() => expr, text, el)`).
  if (process.env.NODE_ENV !== 'production')
    _rdLabelBinding(dispose, 'text', text, undefined, 1)
  // Dead binding whose value was text: nothing re-runs it and the core holds
  // no subtree, so there is nothing to tear down. A first value that mounted a
  // subtree keeps the core's disposer (it removes that subtree).
  if (dispose === _noopDispose && !core.mounted()) return _noopDispose
  return () => {
    dispose()
    core.dispose()
  }
}

/**
 * Mount a reactive accessor child with a SINGLE accessor invocation for the
 * dominant textish shape.
 *
 * Historically `mountChild` ran every function child TWICE at mount: an
 * untracked classification sample (keyed array / textish / general), then the
 * chosen machinery's own tracked first run re-invoked the accessor — user
 * code — a second time (~12k invocations for 6k reactive cells in the table
 * bench). The sample's VALUE could never be reused by the tracked run: the
 * tracked run's invocation is what ESTABLISHES the subscriptions, so skipping
 * it would leave the binding subscribed to nothing. The fix inverts the order
 * instead — classification happens INSIDE the tracked first run of the
 * binding's effect, so the classification call IS the subscription-
 * establishing call:
 *
 * - TEXTISH initial (string/number/boolean — the per-cell/per-label shape):
 *   this renderEffect IS the binding — exactly `bindPolymorphicText`'s shape
 *   (same renderEffect discipline: re-run errors propagate, no onUpdate
 *   notify; same swap core; same context-owner capture) → ONE invocation at
 *   mount, and the reads performed by the classification call are byte-for-
 *   byte the reads the old machinery's first run tracked.
 * - KEYED-ARRAY / GENERAL initial: hand off to mountKeyedList /
 *   mountReactive UNCHANGED — they own effect()-grade semantics
 *   (ErrorBoundary routing, onUpdate notify, the re-entrant generation
 *   guard, inner-effect/onCleanup windows) that a renderEffect-flavored
 *   dispatcher cannot replicate — then dispose this dispatcher so its
 *   first-run subscriptions are dropped. The classified VALUE and the sources
 *   its call read are handed over as a `FirstRun`, so the machinery's first
 *   run mounts that value and replays those reads instead of calling the
 *   accessor again: ONE invocation at mount on every branch (a `.map` maps
 *   once, a compat component body runs once).
 *
 * Classification stays PINNED at the first run's value, exactly as the old
 * untracked sample pinned it — a textish-first accessor that later yields a
 * VNode upgrades via the poly core (never re-classifies to the keyed
 * reconciler), byte-identical to the previous behavior.
 */
const FIRST_RUN_OK = Symbol('pyreon.firstRunOk')
function mountAccessorChild(
  child: () => VNodeChild | VNodeChild[],
  parent: Node,
  anchor: Node | null,
): Cleanup {
  const depthAtEntry = _elementDepth
  const ownerAtSetup = getContextOwner()
  let core: PolyTextCore | null = null
  let text: Text | null = null
  let handoff: Cleanup | null = null
  let firstRunError: unknown = FIRST_RUN_OK
  // Set the moment the first run classifies the value as structural, BEFORE the
  // machinery below is built. Building it mounts the value, and that mount can
  // write a signal this dispatcher read on its first run (a ref recording
  // state, `<Show>` over a transition stage), which re-runs this dispatcher
  // synchronously, before `handoff` is assigned and before `disposeEffect()`
  // below drops the subscription. The machinery's own effect already tracks
  // the same reads and handles the change; a dispatcher re-run here built a
  // SECOND binding and mounted the content twice.
  let structural = false
  const disposeEffect = renderEffect(() => {
    if (structural) return
    if (core !== null) {
      core.apply((child as () => VNodeChild)())
      return
    }
    // First (tracked) run — classify once. The try exists ONLY so a throwing
    // accessor doesn't leak the partial subscriptions collected before the
    // throw: the error is re-thrown below AFTER this dispatcher is disposed,
    // preserving the old sample's propagate-synchronously-out-of-mountChild
    // behavior. Re-runs take the `core !== null` path above with NO catch —
    // renderEffect re-run errors propagate, exactly as before.
    // The first call runs inside an effect-shaped window (inner effects and
    // `onCleanup`), and what it registers is released into whichever frame
    // ends up owning the binding — here for text, the structural machinery's
    // first run otherwise — so a single call registers exactly where it did
    // when the machinery made its own call.
    const run: RunCapture = { inner: null, cleanups: null }
    try {
      const v = _captureRun(child, run)
      // Text fast path: reactive string/number/boolean — update text.data in
      // place. POLYMORPHIC: the accessor may later return a VNode
      // (`() => loading() ? 'Loading…' : <Table/>`), so the binding upgrades
      // to a full subtree mount on the first non-text value (and back). An
      // unconditional `text.data = String(v)` rendered "[object Object]" for
      // the VNode arm.
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        text = document.createTextNode(v === false ? '' : String(v))
        parent.insertBefore(text, anchor)
        core = createPolyTextCore(text, parent, ownerAtSetup)
        _releaseRun(run)
        return
      }
      structural = true
      // The sources that call just read — handed to the structural machinery
      // below with the value, so it does not evaluate the accessor again.
      const reads = _frameReads()
      // No collect frame (never true for this dispatcher's first run): the
      // machinery will call the accessor itself, so the work stays here.
      if (reads === null) _releaseRun(run)
      // Structural shape — hand off to the effect()-grade machinery.
      // Constructed UNTRACKED (the machinery was historically built outside
      // any tracking frame; its own effect establishes the real
      // subscriptions) at depth 0 (reactive-boundary child cleanups must be
      // real removers).
      const prevDepth = _elementDepth
      _elementDepth = 0
      try {
        runUntracked(() => {
          handoff = isKeyedArray(v)
            ? mountKeyedList(
                child as () => VNode[],
                parent,
                anchor,
                (vn, p, a) => mountChild(vn, p, a),
                reads === null ? undefined : { value: v as unknown as VNode[], reads, run },
              )
            : mountReactive(
                child as () => VNodeChild,
                parent,
                anchor,
                mountChild,
                reads === null ? undefined : { value: v, reads, run },
              )
        })
      } finally {
        _elementDepth = prevDepth
      }
    } catch (err) {
      // Whatever the throwing call registered goes where it always went.
      _releaseRun(run)
      firstRunError = err
    }
  })
  if (firstRunError !== FIRST_RUN_OK) {
    if (process.env.NODE_ENV !== 'production') _rdDropBinding(disposeEffect)
    disposeEffect()
    throw firstRunError
  }
  if (handoff !== null) {
    // Drop the dispatcher's first-run subscriptions — the machinery's own
    // effect owns the binding from here. Dev: and its graph node — the
    // machinery's effect is the binding's node.
    if (process.env.NODE_ENV !== 'production') _rdDropBinding(disposeEffect)
    disposeEffect()
    return handoff
  }
  // Dev: this dispatcher is a text binding; its creation site is this file.
  if (process.env.NODE_ENV !== 'production') _rdLabelBinding(disposeEffect, 'text', text, undefined, null)
  // Textish — this dispatcher IS the binding (bindPolymorphicText's shape).
  if (depthAtEntry > 0) {
    // Dead (tracked nothing): the core is in text mode and can never leave it,
    // and the text node leaves with its parent element.
    if (disposeEffect === _noopDispose) return noop
    return () => {
      disposeEffect()
      core?.dispose()
    }
  }
  return () => {
    disposeEffect()
    core?.dispose()
    if (text !== null) {
      const p = text.parentNode
      if (p && p.nodeType !== 11 /* DocumentFragment — FW-3 */) p.removeChild(text)
    }
  }
}

function mountChildren(children: VNodeChild[], parent: Node, anchor: Node | null): Cleanup {
  if (children.length === 0) return noop

  // 1-child fast path
  if (children.length === 1) {
    const c = children[0] as VNodeChild
    if (c !== undefined) {
      // `textContent =` REPLACES the parent's entire child list — valid only when
      // the parent is EMPTY (the dominant fresh-element case). mountChildren is
      // ALSO the Fragment mount path, where the parent is a live element that may
      // already hold earlier siblings: a Fragment whose sole child is text used
      // to WIPE them (`<i>{'head'}<>{'X'}</></i>` rendered just "X").
      if (
        anchor === null &&
        (typeof c === 'string' || typeof c === 'number') &&
        parent.firstChild === null
      ) {
        ;(parent as HTMLElement).textContent = String(c)
        return noop
      }
      return mountChild(c, parent, anchor)
    }
  }

  // 2-child fast path — avoids .map() allocation (covers <tr><td/><td/></tr>)
  if (children.length === 2) {
    const c0 = children[0] as VNodeChild
    const c1 = children[1] as VNodeChild
    if (c0 !== undefined && c1 !== undefined) {
      const d0 = mountChild(c0, parent, anchor)
      const d1 = mountChild(c1, parent, anchor)
      if (d0 === noop && d1 === noop) return noop
      if (d0 === noop) return d1
      if (d1 === noop) return d0
      return () => {
        d0()
        d1()
      }
    }
  }

  // 3+ children: collect ONLY real (non-noop) cleanups — inline-first, promote to
  // an array on the 2nd. A fully-static multi-child element returns the shared
  // `noop` with NO array and NO wrapper closure (the common `<ul><li/>…</ul>`
  // shape). Mirrors the 2-child path and avoids `.map`'s per-call closure.
  let only: Cleanup | null = null
  let rest: Cleanup[] | null = null
  for (let i = 0; i < children.length; i++) {
    const d = mountChild(children[i] as VNodeChild, parent, anchor)
    if (d === noop) continue
    if (only === null) only = d
    else if (rest === null) rest = [only, d]
    else rest.push(d)
  }
  if (rest !== null) {
    const all = rest
    return () => {
      for (const fn of all) fn()
    }
  }
  return only ?? noop
}

// ─── Keyed array detection ────────────────────────────────────────────────────

/** Returns true if value is a non-empty array of VNodes that all carry keys. */
function isKeyedArray(value: unknown): value is VNode[] {
  if (!Array.isArray(value) || value.length === 0) return false
  return value.every(
    (v) =>
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      (v as VNode).key !== null &&
      (v as VNode).key !== undefined,
  )
}
