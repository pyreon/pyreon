import type {
  ComponentFn,
  ForProps,
  NativeItem,
  PortalProps,
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
const noop: Cleanup = () => {}

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
export function mountChild(
  child: VNodeChild | VNodeChild[] | (() => VNodeChild | VNodeChild[]),
  parent: Node,
  anchor: Node | null = null,
): Cleanup {
  // Reactive accessor — function that reads signals
  if (typeof child === "function") {
    // Peek at the initial return value (inside a temporary tracking context).
    // If it's an array of keyed VNodes, use the efficient keyed reconciler.
    // We call the function once here; the reconciler's effect will call it again,
    // so this peek is just for routing — not wasteful in practice.
    const sample = runUntracked(() => (child as () => VNodeChild | VNodeChild[])())
    if (isKeyedArray(sample)) {
      // Reactive boundary — children manage their own DOM lifecycle
      const prevDepth = _elementDepth
      _elementDepth = 0
      const cleanup = mountKeyedList(child as () => VNode[], parent, anchor, (vnode, p, a) =>
        mountChild(vnode, p, a),
      )
      _elementDepth = prevDepth
      return cleanup
    }
    // Text fast path: reactive string/number/boolean — update text.data in-place
    // instead of mountReactive (which creates a comment marker + teardown/rebuild).
    // Saves 1 comment node per binding and reduces DOM ops from 3 to 1 per update.
    // NOTE: null/undefined are excluded — they may later become VNodes (e.g. Show
    // starting hidden), so they must go through mountReactive for correct transitions.
    if (typeof sample === "string" || typeof sample === "number" || typeof sample === "boolean") {
      const text = document.createTextNode(sample == null || sample === false ? "" : String(sample))
      parent.insertBefore(text, anchor)
      const dispose = renderEffect(() => {
        const v = (child as () => unknown)()
        text.data = v == null || v === false ? "" : String(v as string | number)
      })
      // Inside an element, parent removal handles text node removal — just dispose the effect
      if (_elementDepth > 0) return dispose
      return () => {
        dispose()
        const p = text.parentNode
        if (p && (p as Element).isConnected !== false) p.removeChild(text)
      }
    }
    // Reactive boundary — content manages its own DOM lifecycle
    const prevDepth = _elementDepth
    _elementDepth = 0
    const cleanup = mountReactive(child as () => VNodeChild, parent, anchor, mountChild)
    _elementDepth = prevDepth
    return cleanup
  }

  // Array of children (e.g. from .map())
  if (Array.isArray(child)) {
    return mountChildren(child, parent, anchor)
  }

  // Nothing to render
  if (child == null || child === false) return noop

  // Primitive — text node (static, no reactive effects to tear down).
  // DOM removal is handled by the parent element's cleanup, so return noop.
  if (typeof child !== "object") {
    parent.insertBefore(document.createTextNode(String(child)), anchor)
    return noop
  }

  // NativeItem — pre-built DOM element from _tpl() or createTemplate().
  // Insert directly, bypassing VNode reconciliation entirely.
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
      native.cleanup!()
      const p = native.el.parentNode
      if (p && (p as Element).isConnected !== false) p.removeChild(native.el)
    }
  }

  const vnode = child as VNode

  if (vnode.type === Fragment) {
    return mountChildren(vnode.children, parent, anchor)
  }

  if (vnode.type === (ForSymbol as unknown as string)) {
    const { each, by, children } = vnode.props as unknown as ForProps<unknown>
    // Reactive boundary — For manages its own DOM lifecycle
    const prevDepth = _elementDepth
    _elementDepth = 0
    const cleanup = mountFor(each, by, children, parent, anchor, mountChild)
    _elementDepth = prevDepth
    return cleanup
  }

  // Portal — mount children into a different DOM target, outside the current tree
  if (vnode.type === (PortalSymbol as unknown as string)) {
    const { target, children } = vnode.props as unknown as PortalProps
    return mountChild(children, target, null)
  }

  if (typeof vnode.type === "function") {
    return mountComponent(vnode as VNode & { type: ComponentFn }, parent, anchor)
  }

  return mountElement(vnode, parent, anchor)
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

function mountComponent(
  vnode: VNode & { type: ComponentFn },
  parent: Node,
  anchor: Node | null,
): Cleanup {
  // Create an EffectScope so all effects/computeds created during setup
  // are automatically disposed when the component unmounts.
  const scope = effectScope()
  setCurrentScope(scope)

  let hooks: ReturnType<typeof runWithHooks>["hooks"]
  let output: VNode | null

  // Function.name is always a string per spec; cast avoids an uncoverable ?? branch
  const componentName = (vnode.type.name || "Anonymous") as string

  // DevTools: generate a stable ID, register under current parent
  const compId = `${componentName}-${Math.random().toString(36).slice(2, 9)}`
  const parentId = _mountingStack[_mountingStack.length - 1] ?? null
  _mountingStack.push(compId)

  // Merge vnode.children into props.children if not already set.
  // This makes `h(Comp, props, child)` equivalent to `h(Comp, { ...props, children: child })`
  // and matches JSX expectations: <Comp>child</Comp> → children in props.
  const mergedProps =
    vnode.children.length > 0 && (vnode.props as Record<string, unknown>).children === undefined
      ? {
          ...vnode.props,
          children: vnode.children.length === 1 ? vnode.children[0] : vnode.children,
        }
      : vnode.props

  try {
    const result = runWithHooks(vnode.type, mergedProps)
    hooks = result.hooks
    output = result.vnode
  } catch (err) {
    _mountingStack.pop()
    setCurrentScope(null)
    scope.stop()
    console.error(`[pyreon] Error in component <${componentName}>:`, err)
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

  // Validate component return value in dev mode
  if (__DEV__ && output != null) {
    const t = typeof output
    if (
      t !== "string" &&
      t !== "number" &&
      t !== "function" &&
      !(typeof output === "object" && "type" in (output as object))
    ) {
      console.warn(
        `[pyreon] Component "${componentName}" returned an invalid value. Components must return JSX, null, a string, or a number.`,
      )
    }
  }

  // Register onUpdate hooks with the scope so they fire after reactive re-runs
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
    if (!handled) console.error("[pyreon] Error mounting component subtree:", err)
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

  // Register with DevTools after subtree is mounted (first child el may now exist)
  const firstEl = parent instanceof Element ? parent.firstElementChild : null
  registerComponent(compId, componentName, firstEl, parentId)

  // Fire onMount hooks; effects created inside are tracked by the scope via runInScope
  const mountCleanups: Cleanup[] = []
  for (const fn of hooks.mount) {
    try {
      let cleanup: (() => void) | undefined
      scope.runInScope(() => {
        cleanup = fn()
      })
      if (cleanup) mountCleanups.push(cleanup)
    } catch (err) {
      console.error("[pyreon] Error in onMount hook:", err)
      reportError({ component: componentName, phase: "mount", error: err, timestamp: Date.now() })
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
        console.error("[pyreon] Error in onUnmount hook:", err)
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

// ─── Children ────────────────────────────────────────────────────────────────

function mountChildren(children: VNodeChild[], parent: Node, anchor: Node | null): Cleanup {
  if (children.length === 0) return noop
  if (children.length === 1) {
    const child = children[0]
    if (child !== undefined) {
      // Static text fast path: textContent is 1 DOM op vs createTextNode + insertBefore (2 ops)
      if (anchor === null && (typeof child === "string" || typeof child === "number")) {
        ;(parent as HTMLElement).textContent = String(child)
        return noop
      }
      return mountChild(child, parent, anchor)
    }
  }
  // 2-child fast path — avoids .map() array allocation (covers <tr><td/><td/></tr>)
  if (children.length === 2) {
    const c0 = children[0]
    const c1 = children[1]
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
      typeof v === "object" &&
      !Array.isArray(v) &&
      (v as VNode).key !== null &&
      (v as VNode).key !== undefined,
  )
}
