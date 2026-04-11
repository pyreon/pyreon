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
import { effectScope, renderEffect, runUntracked, setCurrentScope } from '@pyreon/reactivity'
import { registerComponent, unregisterComponent } from './devtools'
import { mountFor, mountKeyedList, mountReactive } from './nodes'
import { applyProps } from './props'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
// @ts-ignore — `import.meta.env.DEV` is provided by Vite/Rolldown at build time
const __DEV__ = import.meta.env?.DEV === true

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
const _mountingStack: string[] = []

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
    // Text fast path: reactive string/number/boolean — update text.data in-place
    if (typeof sample === 'string' || typeof sample === 'number' || typeof sample === 'boolean') {
      const text = document.createTextNode(sample === false ? '' : String(sample))
      parent.insertBefore(text, anchor)
      const dispose = renderEffect(() => {
        const v = (child as () => unknown)()
        text.data = v == null || v === false ? '' : String(v as string | number)
      })
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
    parent.insertBefore(document.createTextNode(String(child)), anchor)
    return noop
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
    const { each, by, children } = vnode.props as unknown as ForProps<unknown>
    const prevDepth = _elementDepth
    _elementDepth = 0
    const cleanup = mountFor(each, by, children, parent, anchor, mountChild)
    _elementDepth = prevDepth
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
  'svg', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect',
  'g', 'defs', 'symbol', 'use', 'text', 'tspan', 'textPath', 'image',
  'clipPath', 'mask', 'pattern', 'marker', 'linearGradient', 'radialGradient',
  'stop', 'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
  'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feFlood', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'feSpecularLighting', 'feTile', 'feTurbulence',
  'animate', 'animateMotion', 'animateTransform', 'set', 'desc', 'title',
  'metadata', 'foreignObject',
])

const MATHML_TAGS = new Set([
  'math', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace', 'mrow', 'mfrac',
  'msqrt', 'mroot', 'msub', 'msup', 'msubsup', 'munder', 'mover',
  'munderover', 'mtable', 'mtr', 'mtd', 'mpadded', 'mphantom', 'menclose',
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
      if (refToClean && typeof refToClean === 'object') refToClean.current = null
      if (propCleanup) propCleanup()
      childCleanup()
    }
  }

  return () => {
    if (ref && typeof ref === 'object') ref.current = null
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
  const compId = `${componentName}-${Math.random().toString(36).slice(2, 9)}`
  const parentId = _mountingStack[_mountingStack.length - 1] ?? null
  _mountingStack.push(compId)

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
  const mergedProps = rawProps === EMPTY_PROPS ? rawProps : makeReactiveProps(rawProps as Record<string, unknown>)

  try {
    const result = runWithHooks(vnode.type, mergedProps)
    hooks = result.hooks
    output = result.vnode
  } catch (err) {
    _mountingStack.pop()
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
    } else if (!('type' in output)) {
      console.warn(
        `[Pyreon] Component <${componentName}> returned an invalid value. Components must return a VNode, string, null, or function.`,
      )
    }
  }

  for (const fn of hooks.update) {
    scope.addUpdateHook(fn)
  }

  let subtreeCleanup: Cleanup = noop
  try {
    subtreeCleanup = output != null ? mountChild(output, parent, anchor) : noop
  } catch (err) {
    _mountingStack.pop()
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

  _mountingStack.pop()

  const firstEl = parent instanceof Element ? parent.firstElementChild : null
  registerComponent(compId, componentName, firstEl, parentId)

  // Fire onMount hooks inline — effects created inside are tracked by the scope
  const mountCleanups: Cleanup[] = []
  for (const fn of hooks.mount) {
    try {
      let cleanup: (() => void) | undefined
      scope.runInScope(() => {
        cleanup = fn() as (() => void) | undefined
      })
      if (cleanup) mountCleanups.push(cleanup)
    } catch (err) {
      console.error(`[Pyreon] Error in onMount hook of <${componentName}>:`, err)
      reportError({ component: componentName, phase: 'mount', error: err, timestamp: Date.now() })
    }
  }

  return () => {
    unregisterComponent(compId)
    scope.stop()
    subtreeCleanup()
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
    for (const fn of mountCleanups) fn()
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
