import { Fragment, ForSymbol, PortalSymbol, propagateError, dispatchToErrorBoundary, runWithHooks, reportError } from "@pyreon/core"
import type { ComponentFn, ForProps, PortalProps, Ref, VNode, VNodeChild } from "@pyreon/core"
import { effectScope, setCurrentScope, runUntracked, effect } from "@pyreon/reactivity"
import { mountFor, mountKeyedList, mountReactive } from "./nodes"
import { applyProps } from "./props"
import { installDevTools, registerComponent, unregisterComponent } from "./devtools"

type Cleanup = () => void
const noop: Cleanup = () => {}

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
      return mountKeyedList(
        child as () => VNode[],
        parent,
        anchor,
        (vnode, p, a) => mountChild(vnode, p, a),
      )
    }
    // Text fast path: reactive string/number/boolean — update text.data in-place
    // instead of mountReactive (which creates a comment marker + teardown/rebuild).
    // Saves 1 comment node per binding and reduces DOM ops from 3 to 1 per update.
    // NOTE: null/undefined are excluded — they may later become VNodes (e.g. Show
    // starting hidden), so they must go through mountReactive for correct transitions.
    if (typeof sample === "string" || typeof sample === "number" || typeof sample === "boolean") {
      const text = document.createTextNode(
        sample == null || sample === false ? "" : String(sample),
      )
      parent.insertBefore(text, anchor)
      const e = effect(() => {
        const v = (child as () => unknown)()
        text.data = v == null || v === false ? "" : String(v as string | number)
      })
      return () => {
        e.dispose()
        const p = text.parentNode
        if (p && (p as Element).isConnected !== false) p.removeChild(text)
      }
    }
    return mountReactive(child as () => VNodeChild, parent, anchor, mountChild)
  }

  // Array of children (e.g. from .map())
  if (Array.isArray(child)) {
    return mountChildren(child, parent, anchor)
  }

  // Nothing to render
  if (child == null || child === false) return noop

  // Primitive — text node
  if (typeof child !== "object") {
    const text = document.createTextNode(String(child))
    parent.insertBefore(text, anchor)
    return () => {
      const p = text.parentNode
      if (p && (p as Element).isConnected !== false) p.removeChild(text)
    }
  }

  const vnode = child as VNode

  if (vnode.type === Fragment) {
    return mountChildren(vnode.children, parent, anchor)
  }

  if (vnode.type === (ForSymbol as unknown as string)) {
    const { each, key, children } = vnode.props as unknown as ForProps<unknown>
    return mountFor(each, key, children, parent, anchor, mountChild)
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

  const cleanups: Cleanup[] = applyProps(el, vnode.props)
  cleanups.push(mountChildren(vnode.children, el, null))

  parent.insertBefore(el, anchor)

  // Populate ref after the element is in the DOM
  const ref = vnode.props.ref as Ref<Element> | null | undefined
  if (ref && typeof ref === "object") ref.current = el

  return () => {
    if (ref && typeof ref === "object") ref.current = null
    for (const fn of cleanups) fn()
    // Skip removeChild when element is already in a detached subtree
    // (e.g. after range.deleteContents() in mountFor fast paths). Calling
    // removeChild on a detached parent is expensive in JS-based DOMs (happy-dom).
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

  const componentName = vnode.type.name ?? "Anonymous"

  // DevTools: generate a stable ID, register under current parent
  const compId = `${componentName}-${Math.random().toString(36).slice(2, 9)}`
  const parentId = _mountingStack[_mountingStack.length - 1] ?? null
  _mountingStack.push(compId)

  // Merge vnode.children into props.children if not already set.
  // This makes `h(Comp, props, child)` equivalent to `h(Comp, { ...props, children: child })`
  // and matches JSX expectations: <Comp>child</Comp> → children in props.
  const mergedProps =
    vnode.children.length > 0 && (vnode.props as Record<string, unknown>).children === undefined
      ? { ...vnode.props, children: vnode.children.length === 1 ? vnode.children[0] : vnode.children }
      : vnode.props

  try {
    const result = runWithHooks(vnode.type, mergedProps)
    hooks = result.hooks
    output = result.vnode
  } catch (err) {
    _mountingStack.pop()
    setCurrentScope(null)
    scope.stop()
    console.error(`[nova] Error in component <${componentName}>:`, err)
    reportError({ component: componentName, phase: "setup", error: err, timestamp: Date.now(), props: vnode.props as Record<string, unknown> })
    dispatchToErrorBoundary(err)
    return noop
  } finally {
    setCurrentScope(null)
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
    if (!handled) console.error("[nova] Error mounting component subtree:", err)
    reportError({ component: componentName, phase: "render", error: err, timestamp: Date.now(), props: vnode.props as Record<string, unknown> })
    return noop
  }

  _mountingStack.pop()

  // Register with DevTools after subtree is mounted (first child el may now exist)
  const firstEl = (parent instanceof Element ? parent.firstElementChild : null)
  registerComponent(compId, componentName, firstEl, parentId)

  // Fire onMount hooks; effects created inside are tracked by the scope via runInScope
  const mountCleanups: Cleanup[] = []
  for (const fn of hooks.mount) {
    try {
      let cleanup: (() => void) | undefined
      scope.runInScope(() => { cleanup = fn() })
      if (cleanup) mountCleanups.push(cleanup)
    } catch (err) {
      console.error("[nova] Error in onMount hook:", err)
      reportError({ component: componentName, phase: "mount", error: err, timestamp: Date.now() })
    }
  }

  return () => {
    unregisterComponent(compId)
    scope.stop()
    subtreeCleanup()
    for (const fn of hooks.unmount) {
      try { fn() } catch (err) {
        console.error("[nova] Error in onUnmount hook:", err)
        reportError({ component: componentName, phase: "unmount", error: err, timestamp: Date.now() })
      }
    }
    for (const fn of mountCleanups) fn()
  }
}

// ─── Children ────────────────────────────────────────────────────────────────

function mountChildren(children: VNodeChild[], parent: Node, anchor: Node | null): Cleanup {
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
    (v) => v !== null && typeof v === "object" && !Array.isArray(v) &&
           (v as VNode).key !== null && (v as VNode).key !== undefined,
  )
}
