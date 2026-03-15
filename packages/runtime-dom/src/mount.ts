import type {
  ComponentFn,
  ForProps,
  NativeItem,
  PortalProps,
  Props,
  Ref,
  VNode,
  VNodeChild,
} from "@pyreon/core"
import {
  dispatchToErrorBoundary,
  EMPTY_PROPS,
  ForSymbol,
  Fragment,
  PortalSymbol,
  propagateError,
  reportError,
  runWithHooks,
} from "@pyreon/core"
import { effectScope, renderEffect, runUntracked, setCurrentScope } from "@pyreon/reactivity"
import { registerComponent, unregisterComponent } from "./devtools"
import { mountFor, mountKeyedList, mountReactive } from "./nodes"
import { applyProps } from "./props"

const __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production"

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
 * Accepts:
 *  - `() => VNodeChild`   → reactive: re-mounts whenever the accessor changes
 *  - `null | undefined | false` → nothing
 *  - `string | number`    → text node
 *  - VNode with string type    → DOM element
 *  - VNode with function type  → component
 *  - VNode with Fragment symbol → transparent wrapper
 */
/** Mount a reactive accessor (function child) */
function mountReactiveChild(
  child: () => VNodeChild | VNodeChild[],
  parent: Node,
  anchor: Node | null,
): Cleanup {
  const sample = runUntracked(() => child())
  if (isKeyedArray(sample)) {
    const prevDepth = _elementDepth
    _elementDepth = 0
    const cleanup = mountKeyedList(child as () => VNode[], parent, anchor, (v, p, a) =>
      mountChild(v, p, a),
    )
    _elementDepth = prevDepth
    return cleanup
  }
  if (typeof sample === "string" || typeof sample === "number" || typeof sample === "boolean") {
    return mountReactiveText(child as () => unknown, sample, parent, anchor)
  }
  const prevDepth = _elementDepth
  _elementDepth = 0
  const cleanup = mountReactive(child as () => VNodeChild, parent, anchor, mountChild)
  _elementDepth = prevDepth
  return cleanup
}

/** Mount a reactive text binding (string/number/boolean accessor) */
function mountReactiveText(
  child: () => unknown,
  sample: string | number | boolean,
  parent: Node,
  anchor: Node | null,
): Cleanup {
  const text = document.createTextNode(sample == null || sample === false ? "" : String(sample))
  parent.insertBefore(text, anchor)
  const dispose = renderEffect(() => {
    const v = child()
    text.data = v == null || v === false ? "" : String(v as string | number)
  })
  if (_elementDepth > 0) return dispose
  return () => {
    dispose()
    const p = text.parentNode
    if (p && (p as Element).isConnected !== false) p.removeChild(text)
  }
}

/** Mount a NativeItem (pre-built DOM element from _tpl() or createTemplate()) */
function mountNativeItem(native: NativeItem, parent: Node, anchor: Node | null): Cleanup {
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

/** Mount a VNode (element, component, fragment, For, Portal) */
function mountVNode(vnode: VNode, parent: Node, anchor: Node | null): Cleanup {
  if (vnode.type === Fragment) {
    return mountChildren(vnode.children, parent, anchor)
  }

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
      return noop
    }
    return mountChild(children, target, null)
  }

  if (typeof vnode.type === "function") {
    return mountComponent(vnode as VNode & { type: ComponentFn }, parent, anchor)
  }

  return mountElement(vnode, parent, anchor)
}

export function mountChild(
  child: VNodeChild | VNodeChild[] | (() => VNodeChild | VNodeChild[]),
  parent: Node,
  anchor: Node | null = null,
): Cleanup {
  // Reactive accessor — function that reads signals
  if (typeof child === "function") {
    return mountReactiveChild(child as () => VNodeChild | VNodeChild[], parent, anchor)
  }

  // Array of children (e.g. from .map())
  if (Array.isArray(child)) {
    return mountChildren(child, parent, anchor)
  }

  // Nothing to render
  if (child == null || child === false) return noop

  // Primitive — text node (static, no reactive effects to tear down).
  if (typeof child !== "object") {
    parent.insertBefore(document.createTextNode(String(child)), anchor)
    return noop
  }

  // NativeItem — pre-built DOM element from _tpl() or createTemplate().
  if ((child as unknown as NativeItem).__isNative) {
    return mountNativeItem(child as unknown as NativeItem, parent, anchor)
  }

  return mountVNode(child as VNode, parent, anchor)
}

// ─── Element ─────────────────────────────────────────────────────────────────

function mountElement(vnode: VNode, parent: Node, anchor: Node | null): Cleanup {
  const el = document.createElement(vnode.type as string)

  // Skip applyProps entirely when props is the shared empty sentinel (identity check — no allocation)
  const props = vnode.props
  const propCleanup: Cleanup | null = props !== EMPTY_PROPS ? applyProps(el, props) : null

  // Mount children inside element context — nested elements can skip DOM removal closures
  _elementDepth++
  const childCleanup = mountChildren(vnode.children, el, null)
  _elementDepth--

  parent.insertBefore(el, anchor)

  // Populate ref after the element is in the DOM
  const ref = props.ref as Ref<Element> | null | undefined
  if (ref && typeof ref === "object") ref.current = el

  if (!propCleanup && childCleanup === noop && !ref) {
    // No reactive work — if nested inside another element, parent removal handles us
    if (_elementDepth > 0) return noop
    return () => {
      const p = el.parentNode
      if (p && (p as Element).isConnected !== false) p.removeChild(el)
    }
  }

  // Nested elements: parent removal handles DOM, cleanup only disposes reactive work
  if (_elementDepth > 0) {
    if (!ref && !propCleanup) return childCleanup
    if (!ref && propCleanup)
      return () => {
        propCleanup()
        childCleanup()
      }
    const refToClean = ref
    return () => {
      if (refToClean && typeof refToClean === "object") refToClean.current = null
      if (propCleanup) propCleanup()
      childCleanup()
    }
  }

  return () => {
    if (ref && typeof ref === "object") ref.current = null
    if (propCleanup) propCleanup()
    childCleanup()
    const p = el.parentNode
    if (p && (p as Element).isConnected !== false) p.removeChild(el)
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

/** Merge vnode.children into props.children if not already set. */
function mergeChildrenIntoProps(vnode: VNode): Props {
  if (
    vnode.children.length > 0 &&
    (vnode.props as Record<string, unknown>).children === undefined
  ) {
    return {
      ...vnode.props,
      children: vnode.children.length === 1 ? vnode.children[0] : vnode.children,
    }
  }
  return vnode.props
}

/** Fire onMount hooks and collect their cleanups. */
function fireOnMountHooks(
  hooks: ReturnType<typeof runWithHooks>["hooks"],
  scope: ReturnType<typeof effectScope>,
  componentName: string,
): Cleanup[] {
  const mountCleanups: Cleanup[] = []
  for (const fn of hooks.mount) {
    try {
      let cleanup: (() => void) | undefined
      scope.runInScope(() => {
        cleanup = fn()
      })
      if (cleanup) mountCleanups.push(cleanup)
    } catch (err) {
      console.error(`[Pyreon] Error in onMount hook of <${componentName}>:`, err)
      reportError({ component: componentName, phase: "mount", error: err, timestamp: Date.now() })
    }
  }
  return mountCleanups
}

/** Build the component cleanup function. */
function buildComponentCleanup(
  compId: string,
  scope: ReturnType<typeof effectScope>,
  subtreeCleanup: Cleanup,
  hooks: ReturnType<typeof runWithHooks>["hooks"],
  mountCleanups: Cleanup[],
  componentName: string,
): Cleanup {
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
          phase: "unmount",
          error: err,
          timestamp: Date.now(),
        })
      }
    }
    for (const fn of mountCleanups) fn()
  }
}

function mountComponent(
  vnode: VNode & { type: ComponentFn },
  parent: Node,
  anchor: Node | null,
): Cleanup {
  const scope = effectScope()
  setCurrentScope(scope)

  let hooks: ReturnType<typeof runWithHooks>["hooks"]
  let output: VNode | null

  const componentName = (vnode.type.name || "Anonymous") as string
  const compId = `${componentName}-${Math.random().toString(36).slice(2, 9)}`
  const parentId = _mountingStack[_mountingStack.length - 1] ?? null
  _mountingStack.push(compId)

  const mergedProps = mergeChildrenIntoProps(vnode)

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
      phase: "setup",
      error: err,
      timestamp: Date.now(),
      props: vnode.props as Record<string, unknown>,
    })
    dispatchToErrorBoundary(err)
    return noop
  } finally {
    setCurrentScope(null)
  }

  if (__DEV__ && output != null && typeof output === "object" && !("type" in output)) {
    console.warn(
      `[Pyreon] Component <${componentName}> returned an invalid value. Components must return a VNode, string, null, or function.`,
    )
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
    if (!handled)
      reportError({
        component: componentName,
        phase: "render",
        error: err,
        timestamp: Date.now(),
        props: vnode.props as Record<string, unknown>,
      })
    return noop
  }

  _mountingStack.pop()

  const firstEl = parent instanceof Element ? parent.firstElementChild : null
  registerComponent(compId, componentName, firstEl, parentId)

  const mountCleanups = fireOnMountHooks(hooks, scope, componentName)

  return buildComponentCleanup(compId, scope, subtreeCleanup, hooks, mountCleanups, componentName)
}

// ─── Children ────────────────────────────────────────────────────────────────

/** 1-child fast path for mountChildren */
function mountSingleChild(child: VNodeChild, parent: Node, anchor: Node | null): Cleanup | null {
  if (child === undefined) return null
  if (anchor === null && (typeof child === "string" || typeof child === "number")) {
    ;(parent as HTMLElement).textContent = String(child)
    return noop
  }
  return mountChild(child, parent, anchor)
}

/** 2-child fast path — avoids .map() array allocation (covers <tr><td/><td/></tr>) */
function mountTwoChildren(
  c0: VNodeChild,
  c1: VNodeChild,
  parent: Node,
  anchor: Node | null,
): Cleanup | null {
  if (c0 === undefined || c1 === undefined) return null
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

function mountChildren(children: VNodeChild[], parent: Node, anchor: Node | null): Cleanup {
  if (children.length === 0) return noop
  if (children.length === 1) {
    const result = mountSingleChild(children[0] as VNodeChild, parent, anchor)
    if (result !== null) return result
  }
  if (children.length === 2) {
    const result = mountTwoChildren(
      children[0] as VNodeChild,
      children[1] as VNodeChild,
      parent,
      anchor,
    )
    if (result !== null) return result
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
      typeof v === "object" &&
      !Array.isArray(v) &&
      (v as VNode).key !== null &&
      (v as VNode).key !== undefined,
  )
}
