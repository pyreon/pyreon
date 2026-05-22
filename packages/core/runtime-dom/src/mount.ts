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
  PortalSymbol,
  propagateError,
  reportError,
  runWithHooks,
} from '@pyreon/core'
import {
  defineCrossModuleState,
  effectScope,
  renderEffect,
  runUntracked,
  setCurrentScope,
} from '@pyreon/reactivity'
import { registerComponent, unregisterComponent } from './devtools'
import { mountFor, mountKeyedList, mountReactive } from './nodes'
import { applyProps } from './props'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

type Cleanup = () => void
const noop: Cleanup = () => {
  /* noop */
}

// Cross-module-instance mount state. `elementDepth` / `svgDepth` /
// `mathmlDepth` track namespace + cleanup depth across the synchronous mount
// frame; duplicate `@pyreon/runtime-dom` instances must share these so
// nested mounts dispatched through different instances still see a
// consistent depth value.
interface MountState {
  elementDepth: number
  svgDepth: number
  mathmlDepth: number
  mountingStack: string[] | undefined
}
const _mountState = defineCrossModuleState<MountState>(
  'pyreon-runtime-dom/mount-state',
  () => ({
    elementDepth: 0,
    svgDepth: 0,
    mathmlDepth: 0,
    // Dev-only — production paths never touch this. We allocate the array
    // unconditionally inside the dev branch in the init() so the first
    // mount in __DEV__ doesn't pay an extra check; the `mountingStack`
    // field is `undefined` in prod regardless of which instance reads it.
    mountingStack: __DEV__ ? [] : undefined,
  }),
)

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
  if (__DEV__) _countSink.__pyreon_count__?.('runtime.mountChild')
  // Reactive accessor — function that reads signals
  if (typeof child === 'function') {
    const sample = runUntracked(() => (child as () => VNodeChild | VNodeChild[])())
    if (isKeyedArray(sample)) {
      const prevDepth = _mountState.elementDepth
      _mountState.elementDepth = 0
      const cleanup = mountKeyedList(child as () => VNode[], parent, anchor, (v, p, a) =>
        mountChild(v, p, a),
      )
      _mountState.elementDepth = prevDepth
      return cleanup
    }
    // Text fast path: reactive string/number/boolean — update text.data in-place
    if (typeof sample === 'string' || typeof sample === 'number' || typeof sample === 'boolean') {
      const text = document.createTextNode(sample === false ? '' : String(sample))
      parent.insertBefore(text, anchor)
      const dispose = renderEffect(() => {
        const v = (child as () => unknown)()
        const next = v == null || v === false ? '' : String(v as string | number)
        if (next !== text.data) text.data = next
      })
      if (_mountState.elementDepth > 0) return dispose
      return () => {
        dispose()
        const p = text.parentNode
        if (p && (p as Element).isConnected !== false) p.removeChild(text)
      }
    }
    const prevDepth = _mountState.elementDepth
    _mountState.elementDepth = 0
    const cleanup = mountReactive(child as () => VNodeChild, parent, anchor, mountChild)
    _mountState.elementDepth = prevDepth
    return cleanup
  }

  // Array of children (e.g. from .map())
  if (Array.isArray(child)) return mountChildren(child, parent, anchor)

  // Nothing to render
  if (child == null || child === false) return noop

  // Primitive — text node (static, no reactive effects to tear down).
  if (typeof child !== 'object') {
    parent.insertBefore(document.createTextNode(String(child)), anchor)
    return noop
  }

  // NativeItem — pre-built DOM element from _tpl() or createTemplate().
  if ((child as unknown as NativeItem).__isNative) {
    const native = child as unknown as NativeItem
    parent.insertBefore(native.el, anchor)
    if (!native.cleanup) {
      if (_mountState.elementDepth > 0) return noop
      return () => {
        const p = native.el.parentNode
        if (p && (p as Element).isConnected !== false) p.removeChild(native.el)
      }
    }
    if (_mountState.elementDepth > 0) return native.cleanup
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
    const prevDepth = _mountState.elementDepth
    _mountState.elementDepth = 0
    const cleanup = mountFor(
      source as () => unknown[],
      props.by,
      props.children,
      parent,
      anchor,
      mountChild,
    )
    _mountState.elementDepth = prevDepth
    return cleanup
  }

  if (vnode.type === (PortalSymbol as unknown as string)) {
    const { target, children } = vnode.props as unknown as PortalProps
    if (__DEV__ && !target) {
      console.warn('[Pyreon] <Portal> received a falsy `target`. Provide a valid DOM element.')
      return noop
    }
    if (__DEV__ && !(target instanceof Node)) {
      console.warn(
        `[Pyreon] <Portal> target must be a DOM node. Received ${typeof target}. ` +
          'Use document.getElementById() or a ref to get the target element.',
      )
    }
    return mountChild(children, target, null)
  }

  if (typeof vnode.type === 'function') {
    return mountComponent(vnode as VNode & { type: ComponentFn }, parent, anchor)
  }

  if (__DEV__ && typeof vnode.type !== 'string') {
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

/** Track SVG/MathML context depth — children of <svg> inherit the SVG namespace.
 *  State lives in `_mountState` above (cross-module-instance shared).
 */

function createElementWithNS(tag: string): Element {
  if (_mountState.svgDepth > 0 || SVG_TAGS.has(tag)) return document.createElementNS(SVG_NS, tag)
  if (_mountState.mathmlDepth > 0 || MATHML_TAGS.has(tag)) return document.createElementNS(MATHML_NS, tag)
  return document.createElement(tag)
}

function mountElement(vnode: VNode, parent: Node, anchor: Node | null): Cleanup {
  const tag = vnode.type as string
  const el = createElementWithNS(tag)
  const isSvg = tag === 'svg'
  const isMathml = tag === 'math'
  if (isSvg) _mountState.svgDepth++
  if (isMathml) _mountState.mathmlDepth++

  if (__DEV__ && (vnode.children?.length ?? 0) > 0 && VOID_ELEMENTS.has(vnode.type as string)) {
    console.warn(
      `[Pyreon] <${vnode.type as string}> is a void element and cannot have children. ` +
        'Children passed to void elements will be ignored by the browser.',
    )
  }

  // Skip applyProps entirely when props is the shared empty sentinel (identity check — no allocation)
  const props = vnode.props
  const propCleanup: Cleanup | null = props !== EMPTY_PROPS ? applyProps(el, props) : null

  // Mount children inside element context — nested elements can skip DOM removal closures
  _mountState.elementDepth++
  const childCleanup = mountChildren(vnode.children ?? [], el, null)
  _mountState.elementDepth--
  if (isSvg) _mountState.svgDepth--
  if (isMathml) _mountState.mathmlDepth--

  parent.insertBefore(el, anchor)

  // Populate ref after the element is in the DOM
  const ref = props.ref as RefProp<Element> | null | undefined
  if (ref) {
    if (typeof ref === 'function') ref(el)
    else ref.current = el
  }

  if (!propCleanup && childCleanup === noop && !ref) {
    if (_mountState.elementDepth > 0) return noop
    return () => {
      const p = el.parentNode
      if (p && (p as Element).isConnected !== false) p.removeChild(el)
    }
  }

  if (_mountState.elementDepth > 0) {
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
  const scope = effectScope()
  setCurrentScope(scope)

  let hooks: ReturnType<typeof runWithHooks>['hooks']
  let output: VNodeChild

  const componentName = (vnode.type.name || 'Anonymous') as string

  // Devtools: generate ID + track parent/child hierarchy (dev only).
  // In production, compId/devParentId are never assigned — Vite tree-shakes
  // all __DEV__ blocks + the devtools module import to zero bytes.
  let compId: string | undefined
  let devParentId: string | null | undefined
  if (__DEV__) {
    compId = `${componentName}-${Math.random().toString(36).slice(2, 9)}`
    devParentId = _mountState.mountingStack![_mountState.mountingStack!.length - 1] ?? null
    _mountState.mountingStack!.push(compId)
  }

  // Merge vnode.children into props.children if not already set
  const children = vnode.children ?? []
  const rawProps =
    children.length > 0 && (vnode.props as Record<string, unknown>).children === undefined
      ? {
          ...vnode.props,
          children: children.length === 1 ? children[0] : children,
        }
      : vnode.props

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
    if (__DEV__) _mountState.mountingStack!.pop()
    setCurrentScope(null)
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
    if (__DEV__ && !handled) {
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

  if (__DEV__ && output != null && typeof output === 'object') {
    if (output instanceof Promise) {
      console.warn(
        `[Pyreon] Component <${componentName}> returned a Promise. ` +
          'Components must be synchronous — use lazy() + Suspense for async loading, ' +
          'or fetch data in onMount and store it in a signal.',
      )
    } else if (!('type' in output) && !Array.isArray(output) && !(output as any).__isNative) {
      // Objects without `type` that are NOT arrays (valid VNodeChild[])
      // and NOT NativeItems (from _tpl()) are invalid. Arrays come from
      // Fragment returns, NativeItems come from compiled templates.
      console.warn(
        `[Pyreon] Component <${componentName}> returned an invalid value. Components must return a VNode, string, null, function, or array.`,
      )
    }
  }

  if (hooks.update) {
    for (const fn of hooks.update) scope.addUpdateHook(fn)
  }

  let subtreeCleanup: Cleanup = noop
  try {
    subtreeCleanup = output != null ? mountChild(output, parent, anchor) : noop
  } catch (err) {
    if (__DEV__) _mountState.mountingStack!.pop()
    scope.stop()
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

  if (__DEV__) {
    _mountState.mountingStack!.pop()
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

  return () => {
    if (__DEV__) unregisterComponent(compId!)
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

function mountChildren(children: VNodeChild[], parent: Node, anchor: Node | null): Cleanup {
  if (children.length === 0) return noop

  // 1-child fast path
  if (children.length === 1) {
    const c = children[0] as VNodeChild
    if (c !== undefined) {
      if (anchor === null && (typeof c === 'string' || typeof c === 'number')) {
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

  const cleanups = children.map((c) => mountChild(c, parent, anchor))
  return () => {
    for (const fn of cleanups) fn()
  }
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
