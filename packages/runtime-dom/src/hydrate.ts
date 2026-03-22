/**
 * SSR Hydration — "walk-and-claim" strategy.
 *
 * The server renders plain HTML (no special markers needed). On the client,
 * hydrateRoot walks the VNode tree in parallel with the live DOM tree and:
 *
 *  - Static elements   → matched by tag position, props attached (events + reactive effects)
 *  - Static text       → existing text node reused
 *  - Reactive text     → existing text node found, reactive effect attached to .data
 *  - Reactive blocks   → comment marker inserted, mountReactive takes over
 *  - Components        → component fn called, output VNode matched against DOM subtree
 *  - For lists         → full remount (can't map keys to DOM without SSR markers)
 *  - Fragment          → transparent, children matched directly
 *  - Portal            → always remounts into target
 *
 * Falls back to mountChild() whenever DOM structure doesn't match the VNode.
 */

import type { ComponentFn, Ref, VNode, VNodeChild } from "@pyreon/core"
import {
  dispatchToErrorBoundary,
  ForSymbol,
  Fragment,
  PortalSymbol,
  reportError,
  runWithHooks,
} from "@pyreon/core"
import { effectScope, renderEffect, runUntracked, setCurrentScope } from "@pyreon/reactivity"
import { setupDelegation } from "./delegate"
import { warnHydrationMismatch } from "./hydration-debug"
import { mountChild } from "./mount"
import { mountReactive } from "./nodes"
import { applyProps } from "./props"

type Cleanup = () => void
const noop: Cleanup = () => {
  /* noop */
}

// ─── DOM cursor helpers ───────────────────────────────────────────────────────

/** Skip comment and whitespace-only text nodes, return first "real" node */
function firstReal(initialNode: ChildNode | null): ChildNode | null {
  let node = initialNode
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node = node.nextSibling
      continue
    }
    if (node.nodeType === Node.TEXT_NODE && isWhitespaceOnly((node as Text).data)) {
      node = node.nextSibling
      continue
    }
    return node
  }
  return null
}

/** Check if a string is whitespace-only without allocating a trimmed copy. */
function isWhitespaceOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    // space, tab, newline, carriage return, form feed
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) return false
  }
  return true
}

/** Advance past a node, skipping whitespace-only text and comments */
function nextReal(node: ChildNode): ChildNode | null {
  return firstReal(node.nextSibling)
}

// ─── Core recursive walker ────────────────────────────────────────────────────

/**
 * Hydrate a single VNodeChild against the DOM subtree starting at `domNode`.
 * Returns [cleanup, nextDomSibling].
 */
/** Insert a comment marker before domNode (or append if domNode is null). */
function insertMarker(parent: Node, domNode: ChildNode | null, text: string): Comment {
  const marker = document.createComment(text)
  if (domNode) {
    parent.insertBefore(marker, domNode)
  } else {
    parent.appendChild(marker)
  }
  return marker
}

/** Hydrate a reactive accessor (function child). */
function hydrateReactiveChild(
  child: () => VNodeChild,
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path: string,
): [Cleanup, ChildNode | null] {
  const initial = runUntracked(child)

  if (initial == null || initial === false) {
    const marker = insertMarker(parent, domNode, "pyreon")
    const cleanup = mountReactive(child, parent, marker, mountChild)
    return [cleanup, domNode]
  }

  if (typeof initial === "string" || typeof initial === "number" || typeof initial === "boolean") {
    return hydrateReactiveText(
      child as () => string | number | boolean | null | undefined,
      domNode,
      parent,
      anchor,
      path,
    )
  }

  const marker = insertMarker(parent, domNode, "pyreon")
  const cleanup = mountReactive(child, parent, marker, mountChild)
  const next = domNode ? nextReal(domNode) : null
  return [cleanup, next]
}

/** Hydrate a reactive text binding against an existing text node. */
function hydrateReactiveText(
  child: () => string | number | boolean | null | undefined,
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path: string,
): [Cleanup, ChildNode | null] {
  if (domNode?.nodeType === Node.TEXT_NODE) {
    const textNode = domNode as Text
    const dispose = renderEffect(() => {
      const v = child()
      textNode.data = v == null ? "" : String(v)
    })
    return [dispose, nextReal(domNode)]
  }
  warnHydrationMismatch("text", "TextNode", domNode?.nodeType ?? "null", `${path} > reactive`)
  const cleanup = mountChild(child, parent, anchor)
  return [cleanup, domNode]
}

/** Hydrate a VNode (fragment, For, Portal, component, element). */
function hydrateVNode(
  vnode: VNode,
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path: string,
): [Cleanup, ChildNode | null] {
  if (vnode.type === Fragment) {
    return hydrateChildren(vnode.children, domNode, parent, anchor, path)
  }

  if (vnode.type === ForSymbol) {
    const marker = insertMarker(parent, domNode, "pyreon-for")
    const cleanup = mountChild(vnode, parent, marker)
    return [cleanup, null]
  }

  if (vnode.type === PortalSymbol) {
    const cleanup = mountChild(vnode, parent, anchor)
    return [cleanup, domNode]
  }

  if (typeof vnode.type === "function") {
    return hydrateComponent(vnode, domNode, parent, anchor, path)
  }

  if (typeof vnode.type === "string") {
    return hydrateElement(vnode, domNode, parent, anchor, path)
  }

  return [noop, domNode]
}

function hydrateChild(
  child: VNodeChild | VNodeChild[],
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path = "root",
): [Cleanup, ChildNode | null] {
  if (Array.isArray(child)) {
    const cleanups: Cleanup[] = []
    let cursor = domNode
    for (const c of child) {
      const [cleanup, next] = hydrateChild(c, cursor, parent, anchor, path)
      cleanups.push(cleanup)
      cursor = next
    }
    return [
      () => {
        for (const c of cleanups) c()
      },
      cursor,
    ]
  }

  if (child == null || child === false) return [noop, domNode]

  if (typeof child === "function") {
    return hydrateReactiveChild(child as () => VNodeChild, domNode, parent, anchor, path)
  }

  if (typeof child === "string" || typeof child === "number") {
    if (domNode?.nodeType === Node.TEXT_NODE) {
      return [() => (domNode as Text).remove(), nextReal(domNode)]
    }
    warnHydrationMismatch("text", "TextNode", domNode?.nodeType ?? "null", `${path} > text`)
    const cleanup = mountChild(child, parent, anchor)
    return [cleanup, domNode]
  }

  return hydrateVNode(child as VNode, domNode, parent, anchor, path)
}

// ─── Element hydration ────────────────────────────────────────────────────────

function hydrateElement(
  vnode: VNode,
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path = "root",
): [Cleanup, ChildNode | null] {
  const elPath = `${path} > ${vnode.type as string}`

  // Check if existing DOM node matches
  if (
    domNode?.nodeType === Node.ELEMENT_NODE &&
    (domNode as Element).tagName.toLowerCase() === vnode.type
  ) {
    const el = domNode as Element
    const cleanups: Cleanup[] = []

    // Attach props (events + reactive effects) — don't set static attrs (SSR already did)
    const propCleanup = applyProps(el, vnode.props)
    if (propCleanup) cleanups.push(propCleanup)

    // Hydrate children
    const firstChild = firstReal(el.firstChild as ChildNode | null)
    const [childCleanup] = hydrateChildren(vnode.children, firstChild, el, null, elPath)
    cleanups.push(childCleanup)

    // Set ref
    const ref = vnode.props.ref as Ref<Element> | ((el: Element) => void) | undefined
    if (ref) {
      if (typeof ref === "function") ref(el)
      else ref.current = el
    }

    const cleanup = () => {
      if (ref && typeof ref === "object") ref.current = null
      for (const c of cleanups) c()
      el.remove()
    }

    return [cleanup, nextReal(domNode)]
  }

  // Mismatch — fall back to fresh mount
  const actual =
    domNode?.nodeType === Node.ELEMENT_NODE
      ? (domNode as Element).tagName.toLowerCase()
      : (domNode?.nodeType ?? "null")
  warnHydrationMismatch("tag", vnode.type, actual, elPath)
  const cleanup = mountChild(vnode, parent, anchor)
  return [cleanup, domNode]
}

// ─── Children hydration ───────────────────────────────────────────────────────

function hydrateChildren(
  children: VNodeChild[],
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path = "root",
): [Cleanup, ChildNode | null] {
  if (children.length === 0) return [noop, domNode]

  // Single-child fast path — avoids cleanups array allocation
  if (children.length === 1) {
    return hydrateChild(children[0] as VNodeChild, domNode, parent, anchor, path)
  }

  const cleanups: Cleanup[] = []
  let cursor = domNode
  for (const child of children) {
    const [cleanup, next] = hydrateChild(child, cursor, parent, anchor, path)
    cleanups.push(cleanup)
    cursor = next
  }
  return [
    () => {
      for (const c of cleanups) c()
    },
    cursor,
  ]
}

// ─── Component hydration ──────────────────────────────────────────────────────

function hydrateComponent(
  vnode: VNode,
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path = "root",
): [Cleanup, ChildNode | null] {
  const scope = effectScope()
  setCurrentScope(scope)

  let subtreeCleanup: Cleanup = noop
  const mountCleanups: Cleanup[] = []
  let nextDom: ChildNode | null = domNode

  // Function.name is always a string per spec; || handles empty string, avoids uncoverable ?? branch
  const componentName = ((vnode.type as ComponentFn).name || "Anonymous") as string
  const mergedProps =
    vnode.children.length > 0 && (vnode.props as Record<string, unknown>).children === undefined
      ? {
          ...vnode.props,
          children: vnode.children.length === 1 ? vnode.children[0] : vnode.children,
        }
      : vnode.props

  let result: ReturnType<typeof runWithHooks>
  try {
    result = runWithHooks(vnode.type as ComponentFn, mergedProps)
  } catch (err) {
    setCurrentScope(null)
    scope.stop()

    console.error(`[Pyreon] Error hydrating component <${componentName}>:`, err)
    reportError({
      component: componentName,
      phase: "setup",
      error: err,
      timestamp: Date.now(),
      props: vnode.props as Record<string, unknown>,
    })
    dispatchToErrorBoundary(err)
    return [noop, domNode]
  }
  setCurrentScope(null)

  const { vnode: output, hooks } = result

  // Register onUpdate hooks with the scope
  for (const fn of hooks.update) {
    scope.addUpdateHook(fn)
  }

  if (output != null) {
    const [childCleanup, next] = hydrateChild(output, domNode, parent, anchor, path)
    subtreeCleanup = childCleanup
    nextDom = next
  }

  // Fire onMount hooks; effects created inside are tracked by the scope via runInScope
  for (const fn of hooks.mount) {
    try {
      let c: (() => void) | undefined
      scope.runInScope(() => {
        c = fn() as (() => void) | undefined
      })
      if (c) mountCleanups.push(c)
    } catch (err) {
      reportError({ component: componentName, phase: "mount", error: err, timestamp: Date.now() })
    }
  }

  const cleanup: Cleanup = () => {
    scope.stop()
    subtreeCleanup()
    for (const fn of hooks.unmount) fn()
    for (const fn of mountCleanups) fn()
  }

  return [cleanup, nextDom]
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hydrate a server-rendered container with a Pyreon VNode tree.
 *
 * Reuses existing DOM elements for static structure, attaches event listeners
 * and reactive effects without re-rendering. Falls back to fresh mount for
 * dynamic content (reactive conditionals, For lists).
 *
 * @example
 * // Server:
 * const html = await renderToString(h(App, null))
 *
 * // Client:
 * const unmount = hydrateRoot(document.getElementById("app")!, h(App, null))
 */
export function hydrateRoot(container: Element, vnode: VNodeChild): () => void {
  setupDelegation(container)
  const firstChild = firstReal(container.firstChild as ChildNode | null)
  const [cleanup] = hydrateChild(vnode, firstChild, container, null)
  return cleanup
}
