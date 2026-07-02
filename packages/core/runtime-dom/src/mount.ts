import type {
  ComponentFn,
  ForProps,
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
  runWithHooks,
} from '@pyreon/core'
import {
  effectScope,
  getContextOwner,
  renderEffect,
  runUntracked,
  runWithContextOwner,
  setContextOwner,
  setCurrentScope,
} from '@pyreon/reactivity'
import { setupDelegation } from './delegate'
import { registerComponent, unregisterComponent } from './devtools'
import { mountFor, mountKeyedList, mountReactive } from './nodes'
import { applyProps } from './props'

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

/**
 * Mount a single child into `parent`, inserting before `anchor` (null = append).
 * Returns a cleanup that removes the node(s) and disposes all reactive effects.
 *
 * This function is the hot path — all child types are handled inline to avoid
 * function call overhead in tight render loops (1000+ calls per list render).
 */
export function mountChild(
  child: VNodeChild | VNodeChild[] | (() => VNodeChild | VNodeChild[]),
  parent: Node,
  anchor: Node | null = null,
): Cleanup {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.mountChild')
  // Reactive accessor — function that reads signals
  if (typeof child === 'function') {
    const sample = runUntracked(() => (child as () => VNodeChild | VNodeChild[])())
    if (isKeyedArray(sample)) {
      const prevDepth = _elementDepth
      _elementDepth = 0
      const cleanup = mountKeyedList(child as () => VNode[], parent, anchor, (v, p, a) =>
        mountChild(v, p, a),
      )
      _elementDepth = prevDepth
      return cleanup
    }
    // Text fast path: reactive string/number/boolean — update text.data
    // in-place. POLYMORPHIC: the accessor may later return a VNode
    // (`() => loading() ? 'Loading…' : <Table/>`), so the binding upgrades
    // to a full subtree mount on the first non-text value (and back). The
    // historical binding did `text.data = String(v)` unconditionally —
    // rendering "[object Object]" for the VNode arm (fuzz-found via the
    // SSR↔hydration parity campaign's post-flip oracle, 2026-07).
    if (typeof sample === 'string' || typeof sample === 'number' || typeof sample === 'boolean') {
      const text = document.createTextNode(sample === false ? '' : String(sample))
      parent.insertBefore(text, anchor)
      const dispose = bindPolymorphicText(child as () => VNodeChild, text, parent)
      if (_elementDepth > 0) return dispose
      return () => {
        dispose()
        const p = text.parentNode
        if (p && (p as Element).isConnected !== false) p.removeChild(text)
      }
    }
    const prevDepth = _elementDepth
    _elementDepth = 0
    const cleanup = mountReactive(child as () => VNodeChild, parent, anchor, mountChild)
    _elementDepth = prevDepth
    return cleanup
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
    // that is removed as a unit (its removeChild drops all descendants), so a
    // per-node remover is redundant — noop (the perf optimization). BUT at
    // depth 0 the text was mounted directly into a LIVE parent through a
    // reactive boundary (a `mountReactive` accessor, or a top-level Fragment
    // under one), whose teardown removes children INDIVIDUALLY via their
    // cleanups. A noop there ORPHANS the text node: an accessor yielding a
    // fragment-of-static-text then flipping to a different value left the old
    // text stranded (`() => cond ? <>a b</> : 'x'` → "abx"; pre-existing,
    // fuzz-found via the SSR↔hydration parity O5 ground-truth oracle, 2026-07).
    // Mirrors the reactive-text fast path's own `_elementDepth` gate above.
    if (_elementDepth > 0) return noop
    return () => {
      const p = tn.parentNode
      if (p && (p as Element).isConnected !== false) p.removeChild(tn)
    }
  }

  // NativeItem — pre-built DOM element from _tpl() or createTemplate().
  if ((child as unknown as NativeItem).__isNative) {
    const native = child as unknown as NativeItem
    parent.insertBefore(native.el, anchor)
    if (!native.cleanup) {
      if (_elementDepth > 0) return noop
      return () => {
        const p = native.el.parentNode
        if (p && (p as Element).isConnected !== false) p.removeChild(native.el)
      }
    }
    if (_elementDepth > 0) return native.cleanup
    return () => {
      native.cleanup?.()
      const p = native.el.parentNode
      if (p && (p as Element).isConnected !== false) p.removeChild(native.el)
    }
  }

  // VNode — element, component, fragment, For, Portal
  const vnode = child as VNode

  if (vnode.type === Fragment) return mountChildren(vnode.children ?? [], parent, anchor)

  if (vnode.type === (ForSymbol as unknown as string)) {
    // Compiler wraps `<For each={signal}>` in `_rp(() => signal())` →
    // `props.each` is a getter that returns the resolved array, not the
    // function. Destructuring eagerly captures the array and breaks
    // reactivity + crashes mountFor (which calls `source()`). Read each
    // lazily so the _rp getter fires inside mountFor's effect, preserving
    // signal tracking. User-written `each={() => fn()}` (already a
    // function, not _rp-wrapped) still works because props.each is the
    // function itself.
    const props = vnode.props as unknown as ForProps<unknown>
    const initialEach = props.each as unknown
    const source: () => unknown[] =
      typeof initialEach === 'function'
        ? (initialEach as () => unknown[])
        : (() => props.each as unknown as unknown[])
    const prevDepth = _elementDepth
    _elementDepth = 0
    const cleanup = mountFor(
      source as () => unknown[],
      props.by,
      props.children,
      parent,
      anchor,
      mountChild,
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
    // Portal content lives OUTSIDE the app's mount container, so delegated
    // events (onClick etc.) bubbling from it never reach the app root's
    // delegation listener — every delegated handler inside a portal was
    // silently dead unless the consumer manually delegated the target. Make
    // the Portal own its delegation root (the anti-patterns catalog's
    // "fundamentally-correct fix ... tracked separately", now shipped).
    // Safe when the target is an ANCESTOR of the app root (document.body):
    // the per-dispatch DELEGATED_ELEMENTS invoked-set in setupDelegation's
    // handler makes an outer root skip elements an inner root already
    // handled — no double-fire. Idempotent via the `_delegated` WeakSet.
    if (target instanceof Element) setupDelegation(target)
    return mountChild(children, target, null)
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

const SVG_NS = 'http://www.w3.org/2000/svg'
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'

// Tags that require namespace-aware creation
const SVG_TAGS = new Set([
  'svg',
  'circle',
  'ellipse',
  'line',
  'path',
  'polygon',
  'polyline',
  'rect',
  'g',
  'defs',
  'symbol',
  'use',
  'text',
  'tspan',
  'textPath',
  'image',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'linearGradient',
  'radialGradient',
  'stop',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feFlood',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'feSpecularLighting',
  'feTile',
  'feTurbulence',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
  'desc',
  'title',
  'metadata',
  'foreignObject',
])

const MATHML_TAGS = new Set([
  'math',
  'mi',
  'mo',
  'mn',
  'ms',
  'mtext',
  'mspace',
  'mrow',
  'mfrac',
  'msqrt',
  'mroot',
  'msub',
  'msup',
  'msubsup',
  'munder',
  'mover',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mpadded',
  'mphantom',
  'menclose',
])

/** Track SVG context depth — children of <svg> inherit the SVG namespace. */
let _svgDepth = 0
let _mathmlDepth = 0

function createElementWithNS(tag: string): Element {
  if (_svgDepth > 0 || SVG_TAGS.has(tag)) return document.createElementNS(SVG_NS, tag)
  if (_mathmlDepth > 0 || MATHML_TAGS.has(tag)) return document.createElementNS(MATHML_NS, tag)
  return document.createElement(tag)
}

function mountElement(vnode: VNode, parent: Node, anchor: Node | null): Cleanup {
  const tag = vnode.type as string
  const el = createElementWithNS(tag)
  const isSvg = tag === 'svg'
  const isMathml = tag === 'math'
  if (isSvg) _svgDepth++
  if (isMathml) _mathmlDepth++

  if (process.env.NODE_ENV !== 'production' && (vnode.children?.length ?? 0) > 0 && VOID_ELEMENTS.has(vnode.type as string)) {
    console.warn(
      `[Pyreon] <${vnode.type as string}> is a void element and cannot have children. ` +
        'Children passed to void elements will be ignored by the browser.',
    )
  }

  // Skip applyProps entirely when props is the shared empty sentinel (identity check — no allocation)
  const props = vnode.props
  const propCleanup: Cleanup | null = props !== EMPTY_PROPS ? applyProps(el, props) : null

  // Mount children inside element context — nested elements can skip DOM removal closures
  _elementDepth++
  const childCleanup = mountChildren(vnode.children ?? [], el, null)
  _elementDepth--
  if (isSvg) _svgDepth--
  if (isMathml) _mathmlDepth--

  parent.insertBefore(el, anchor)

  // Populate ref after the element is in the DOM
  const ref = props.ref as RefProp<Element> | null | undefined
  if (ref) {
    if (typeof ref === 'function') ref(el)
    else ref.current = el
  }

  if (!propCleanup && childCleanup === noop && !ref) {
    if (_elementDepth > 0) return noop
    return () => {
      const p = el.parentNode
      if (p && (p as Element).isConnected !== false) p.removeChild(el)
    }
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
    const p = el.parentNode
    if (p && (p as Element).isConnected !== false) p.removeChild(el)
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

function mountComponent(
  vnode: VNode & { type: ComponentFn },
  parent: Node,
  anchor: Node | null,
): Cleanup {
  // Owner chain: link this component's scope to its parent owner so
  // `useContext()` resolves up the component tree. The owner stays `scope`
  // through both `runWithHooks` (so `provide()` writes onto it) AND
  // `mountChild` below (so children chain to it), then is restored to
  // `prevOwner` on every exit path. Kept SEPARATE from `setCurrentScope`
  // (effect tracking) so the two concerns don't interfere.
  const prevOwner = getContextOwner()
  const scope = effectScope()
  scope._parent = prevOwner
  setCurrentScope(scope)
  setContextOwner(scope)

  let hooks: ReturnType<typeof runWithHooks>['hooks']
  let output: VNodeChild

  const componentName = (vnode.type.name || 'Anonymous') as string

  // Devtools: generate ID + track parent/child hierarchy (dev only).
  // In production, compId/devParentId are never assigned — Vite tree-shakes
  // all __DEV__ blocks + the devtools module import to zero bytes.
  let compId: string | undefined
  let devParentId: string | null | undefined
  if (process.env.NODE_ENV !== 'production') {
    compId = `${componentName}-${Math.random().toString(36).slice(2, 9)}`
    devParentId = _mountingStack![_mountingStack!.length - 1] ?? null
    _mountingStack!.push(compId)
  }

  // Merge vnode.children into props.children if not already set.
  //
  // Descriptor-copy preserves getter-shaped reactive props (the
  // compiler-emitted `_rp(() => signal())` wrappers later converted to
  // getters by `makeReactiveProps`). A plain `{ ...vnode.props,
  // children: ... }` spread fires every getter on `vnode.props` at
  // this line and stores the resolved value as a static data property
  // — breaking signal-driven reactivity for every prop the component
  // reads in a tracking scope. This is the bug class root for any
  // framework or user-land component called via the canonical
  // `h(Comp, props, ...children)` JSX-compiled shape with reactive
  // props. The sibling fix in `@pyreon/elements` (Element / Text /
  // Content `mergeProps` from `@pyreon/core`) routes children through props so this
  // branch is skipped for that path; this fix closes the bug class for
  // every other caller too.
  const children = vnode.children ?? []
  let rawProps: Record<string, unknown>
  if (
    children.length > 0 &&
    (vnode.props as Record<string, unknown>).children === undefined
  ) {
    // `mergeProps` from @pyreon/core copies own DESCRIPTORS (not values)
    // so any reactive getter props on vnode.props survive the merge.
    // `vnode.props` is always a non-null object at this site (h() never
    // produces null props; EMPTY_PROPS is the empty-but-non-null
    // sentinel), so the null-source guard mergeProps lacks (vs the
    // earlier rocketstyle `mergeDescriptors` helper) is not needed here.
    rawProps = mergeProps(vnode.props as Record<string, unknown>, {
      children: children.length === 1 ? children[0] : children,
    })
  } else {
    rawProps = vnode.props as Record<string, unknown>
  }

  // Convert compiler-emitted () => expr wrappers into getter properties.
  // This makes component props reactive — reading props.state inside an
  // effect/computed tracks the underlying signals.
  const mergedProps =
    rawProps === EMPTY_PROPS ? rawProps : makeReactiveProps(rawProps as Record<string, unknown>)

  try {
    const result = runWithHooks(vnode.type, mergedProps)
    hooks = result.hooks
    output = result.vnode
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
    if (process.env.NODE_ENV !== 'production' && !handled) {
      const overlay = document.createElement('pre')
      overlay.style.cssText =
        'color:#e53e3e;background:#fff5f5;padding:12px;border:2px solid #e53e3e;border-radius:6px;font-size:12px;margin:4px;font-family:monospace;white-space:pre-wrap;word-break:break-word'
      const e = err as Error
      overlay.textContent = `[${componentName}] ${e.message ?? err}\n${e.stack ?? ''}`
      parent.insertBefore(overlay, anchor)
      return () => overlay.remove()
    }
    return noop
  } finally {
    setCurrentScope(null)
  }

  if (process.env.NODE_ENV !== 'production' && output != null && typeof output === 'object') {
    if (!(output instanceof Promise) && !('type' in output) && !Array.isArray(output) && !(output as any).__isNative) {
      // Objects without `type` that are NOT arrays (valid VNodeChild[])
      // and NOT NativeItems (from _tpl()) and NOT Promises (handled below)
      // are invalid. Arrays come from Fragment returns, NativeItems come
      // from compiled templates.
      console.warn(
        `[Pyreon] Component <${componentName}> returned an invalid value. Components must return a VNode, string, null, function, Promise, or array.`,
      )
    }
  }

  if (hooks.update) {
    for (const fn of hooks.update) scope.addUpdateHook(fn)
  }

  // Async component support — parity with `renderToString` which awaits
  // Promise outputs. Insert a placeholder comment at the mount point,
  // then mount the resolved value once the Promise settles. Until then
  // the DOM has just the placeholder; an outer <Suspense> (which only
  // recognizes lazy()-style __loading markers) won't help here, so this
  // path is the canonical "async function component" support on the
  // client. Renders nothing visible during the await — callers wanting
  // a fallback should use lazy() + Suspense, OR put a sibling fallback
  // element inside a Suspense boundary.
  if (output instanceof Promise) {
    const placeholder = document.createComment('async')
    parent.insertBefore(placeholder, anchor)
    let resolvedCleanup: Cleanup = noop
    let cancelled = false
    output
      .then((resolved) => {
        if (cancelled || !placeholder.parentNode) return
        try {
          if (resolved != null) {
            resolvedCleanup = mountChild(resolved as VNodeChild, parent, placeholder)
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

    if (process.env.NODE_ENV !== 'production') _mountingStack!.pop()

    return () => {
      cancelled = true
      resolvedCleanup()
      if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder)
      scope.stop()
      setContextOwner(prevOwner)
    }
  }

  let subtreeCleanup: Cleanup = noop
  try {
    subtreeCleanup = output != null ? mountChild(output, parent, anchor) : noop
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
    const firstEl = parent instanceof Element ? parent.firstElementChild : null
    registerComponent(compId!, componentName, firstEl, devParentId!)
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

// ─── Children ────────────────────────────────────────────────────────────────

/**
 * Reactive TEXT binding that can UPGRADE to a subtree mount (and back).
 *
 * The dominant case — an accessor that only ever yields strings/numbers —
 * pays exactly the historical fast path: one text node, `data` updated
 * in-place. But a reactive child's type is not stable: the idiomatic
 * `{() => loading() ? 'Loading…' : <Table/>}` starts text-ish and later
 * yields a VNode. On the first non-text value the binding swaps the text
 * node for a comment marker and mounts the subtree there (untracked, with
 * the setup-time context owner restored — same discipline as
 * mountReactive); a later text value tears the subtree down and restores
 * the text node. Shared by mountChild's fast path AND the hydration
 * adoption paths (which bind an SSR-adopted text node the same way).
 */
export function bindPolymorphicText(
  child: () => VNodeChild,
  text: Text,
  parentAtSetup: Node,
): Cleanup {
  const ownerAtSetup = getContextOwner()
  let marker: Comment | null = null
  let mode: 'text' | 'sub' = 'text'
  let subCleanup: Cleanup = noop

  const dispose = renderEffect(() => {
    const v = child()
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
      if (next !== text.data) text.data = next
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
      runUntracked(subCleanup)
    }
    const liveParent = marker!.parentNode ?? parentAtSetup
    subCleanup = runUntracked(() =>
      runWithContextOwner(ownerAtSetup, () => mountChild(v as VNodeChild, liveParent, marker)),
    )
  })

  return () => {
    dispose()
    if (mode === 'sub') {
      subCleanup()
      marker?.parentNode?.removeChild(marker)
    }
  }
}

function mountChildren(children: VNodeChild[], parent: Node, anchor: Node | null): Cleanup {
  if (children.length === 0) return noop

  // 1-child fast path
  if (children.length === 1) {
    const c = children[0] as VNodeChild
    if (c !== undefined) {
      // `textContent =` REPLACES the parent's entire child list — only valid
      // when the parent is EMPTY (the dominant fresh-element case:
      // mountElement creates the element and immediately mounts its
      // children). mountChildren is ALSO the Fragment mount path, where the
      // parent is a live element that may already hold earlier siblings — a
      // Fragment whose sole child is text used to WIPE them all
      // (`<i>{'head'}<>{'X'}</></i>` rendered just "X"; fuzz-found via the
      // SSR↔hydration parity oracle, where hydration — correctly —
      // preserved the SSR DOM and pure client mount lost it).
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

  // 3+ children: collect ONLY real (non-noop) cleanups — inline-first, promote
  // to an array on the 2nd. A fully-static multi-child element (every child is
  // baked / static → mountChild returns `noop`) returns the shared `noop` with
  // NO array and NO wrapper closure allocated (the common `<ul><li/>…</ul>`
  // shape); mixed children don't retain noop refs. Mirrors the 2-child fast
  // path's noop-filtering + avoids `.map`'s per-call callback closure.
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
