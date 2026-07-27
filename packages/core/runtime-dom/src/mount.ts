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
import { applyProps, applySelectValueProp } from './props'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this uses
// `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

type Cleanup = () => void
const noop: Cleanup = () => {
  /* noop */
}

// When > 0, we're mounting children inside an element — child cleanups can skip DOM
// removal (parent element removal handles it).
let _elementDepth = 0

// Stack tracking which component is currently being mounted (depth-first order).
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
    // Text fast path: reactive string/number/boolean — update text.data in place.
    if (typeof sample === 'string' || typeof sample === 'number' || typeof sample === 'boolean') {
      const text = document.createTextNode(sample === false ? '' : String(sample))
      parent.insertBefore(text, anchor)
      const dispose = bindPolymorphicText(child as () => VNodeChild, text, parent)
      if (_elementDepth > 0) return dispose
      return () => {
        dispose()
        const p = text.parentNode
        if (p && p.nodeType !== 11 /* DocumentFragment — FW-3 */) p.removeChild(text)
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
    // `_elementDepth > 0` → this text is a child of a freshly-built element removed as a unit, so a
    // per-node remover is redundant (noop).
    if (_elementDepth > 0) return noop
    return () => {
      const p = tn.parentNode
      if (p && p.nodeType !== 11 /* DocumentFragment — FW-3 */) p.removeChild(tn)
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
        if (p && p.nodeType !== 11 /* DocumentFragment — FW-3 */) p.removeChild(native.el)
      }
    }
    if (_elementDepth > 0) return native.cleanup
    return () => {
      native.cleanup?.()
      const p = native.el.parentNode
      if (p && p.nodeType !== 11 /* DocumentFragment — FW-3 */) p.removeChild(native.el)
    }
  }

  // VNode — element, component, fragment, For, Portal
  const vnode = child as VNode

  if (vnode.type === Fragment) return mountChildren(vnode.children ?? [], parent, anchor)

  if (vnode.type === (ForSymbol as unknown as string)) {
    // The compiler wraps `<For each={signal}>` in `_rp(() => signal())`, so `props.each` is a
    // getter returning the resolved array, not the function.
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
    // Portal content lives OUTSIDE the app's mount container, so delegated events bubbling from it
    // never reach the app root's listener.
    if (target instanceof Element) setupDelegation(target)
    // Portal content mounts into `target` (e.g. document.body) — a LIVE parent NOT
    // removed as a unit, so mountChild's cleanup does not remove the DOM.
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

// Tags that require namespace-aware creation.
export const SVG_TAGS = new Set([
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

export const MATHML_TAGS = new Set([
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
  // `<select value>` is excluded from the pre-children pass and applied
  // AFTER mountChildren below (PZ-09) — see applySelectValueProp.
  const isSelect = tag === 'select'
  let propCleanup: Cleanup | null =
    props !== EMPTY_PROPS ? applyProps(el, props, isSelect ? 'value' : undefined) : null

  // Mount children inside element context — nested elements can skip DOM removal closures
  _elementDepth++
  const childCleanup = mountChildren(vnode.children ?? [], el, null)
  _elementDepth--
  if (isSvg) _svgDepth--
  if (isMathml) _mathmlDepth--

  // `<select value>` — deferred until after children (PZ-09): the property assignment selects a
  // matching <option>, so the options must exist first.
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
    return () => {
      const p = el.parentNode
      if (p && p.nodeType !== 11 /* DocumentFragment — FW-3 */) p.removeChild(el)
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
    if (p && p.nodeType !== 11 /* DocumentFragment — FW-3 */) p.removeChild(el)
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

function mountComponent(
  vnode: VNode & { type: ComponentFn },
  parent: Node,
  anchor: Node | null,
): Cleanup {
  // Owner chain: link this component's scope to its parent owner so `useContext()` resolves up the
  // component tree.
  const prevOwner = getContextOwner()
  const scope = effectScope()
  scope._parent = prevOwner
  setCurrentScope(scope)
  setContextOwner(scope)

  let hooks: ReturnType<typeof runWithHooks>['hooks']
  let output: VNodeChild

  const componentName = (vnode.type.name || 'Anonymous') as string

  // Devtools: generate ID + track parent/child hierarchy (dev only).
  let compId: string | undefined
  let devParentId: string | null | undefined
  if (process.env.NODE_ENV !== 'production') {
    compId = `${componentName}-${Math.random().toString(36).slice(2, 9)}`
    devParentId = _mountingStack![_mountingStack!.length - 1] ?? null
    _mountingStack!.push(compId)
  }

  // Merge vnode.children into props.children if not already set.
  const children = vnode.children ?? []
  let rawProps: Record<string, unknown>
  if (
    children.length > 0 &&
    (vnode.props as Record<string, unknown>).children === undefined
  ) {
    // `mergeProps` copies own DESCRIPTORS (not values) so reactive getter props on vnode.props
    // survive the merge.
    rawProps = mergeProps(vnode.props as Record<string, unknown>, {
      children: children.length === 1 ? children[0] : children,
    })
  } else {
    rawProps = vnode.props as Record<string, unknown>
  }

  // Convert compiler-emitted () => expr wrappers into getter properties.
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
    if (process.env.NODE_ENV !== 'production') {
      // PZ-10: "props.X is not a function", caused by the reactive-prop auto-unwrap.
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
      // Objects without `type` that are NOT arrays (valid VNodeChild[] from Fragment
      // returns), NOT NativeItems (from _tpl) and NOT Promises are invalid.
      console.warn(
        `[Pyreon] Component <${componentName}> returned an invalid value. Components must return a VNode, string, null, function, Promise, or array.`,
      )
    }
  }

  if (hooks.update) {
    for (const fn of hooks.update) scope.addUpdateHook(fn)
  }

  // Async component support — parity with `renderToString`, which awaits Promise outputs.
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

  // Subtree fully mounted (incl.
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
}

export function createPolyTextCore(
  text: Text,
  parentAtSetup: Node,
  ownerAtSetup: ReturnType<typeof getContextOwner>,
): PolyTextCore {
  let marker: Comment | null = null
  let mode: 'text' | 'sub' = 'text'
  let subCleanup: Cleanup = noop

  return {
    apply(v: VNodeChild): void {
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
      // Reset _elementDepth: this mount can run at SETUP time (a signal that ALREADY holds a VNode
      // at bind time, inside a `_tpl` bind under mountChildren's depth>0 window).
      const prevDepth = _elementDepth
      _elementDepth = 0
      subCleanup = runUntracked(() =>
        runWithContextOwner(ownerAtSetup, () => mountChild(v as VNodeChild, liveParent, marker)),
      )
      _elementDepth = prevDepth
    },
    dispose(): void {
      if (mode === 'sub') {
        subCleanup()
        marker?.parentNode?.removeChild(marker)
      }
    },
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
  return () => {
    dispose()
    core.dispose()
  }
}

function mountChildren(children: VNodeChild[], parent: Node, anchor: Node | null): Cleanup {
  if (children.length === 0) return noop

  // 1-child fast path
  if (children.length === 1) {
    const c = children[0] as VNodeChild
    if (c !== undefined) {
      // `textContent =` REPLACES the parent's entire child list — valid only when the parent is
      // EMPTY (the dominant fresh-element case).
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

  // 3+ children: collect ONLY real (non-noop) cleanups — inline-first, promote to an array on the
  // 2nd.
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
