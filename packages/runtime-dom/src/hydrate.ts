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
import { ForSymbol, Fragment, PortalSymbol, reportError, runWithHooks } from "@pyreon/core"
import { effect, effectScope, runUntracked, setCurrentScope } from "@pyreon/reactivity"
import { warnHydrationMismatch } from "./hydration-debug"
import { mountChild } from "./mount"
import { mountReactive } from "./nodes"
import { applyProps } from "./props"

type Cleanup = () => void
const noop: Cleanup = () => {}

// ─── DOM cursor helpers ───────────────────────────────────────────────────────

/** Skip comment and whitespace-only text nodes, return first "real" node */
function firstReal(initialNode: ChildNode | null): ChildNode | null {
  let node = initialNode
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node = node.nextSibling
      continue
    }
    if (node.nodeType === Node.TEXT_NODE && (node as Text).data.trim() === "") {
      node = node.nextSibling
      continue
    }
    return node
  }
  return null
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
function hydrateChild(
  child: VNodeChild | VNodeChild[],
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path = "root",
): [Cleanup, ChildNode | null] {
  // ── Array ──────────────────────────────────────────────────────────────────
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

  // ── Null / false / undefined ───────────────────────────────────────────────
  if (child == null || child === false) return [noop, domNode]

  // ── Reactive accessor: () => VNodeChild ────────────────────────────────────
  if (typeof child === "function") {
    // Peek at the initial value without tracking
    const initial = runUntracked(child as () => VNodeChild)

    if (initial == null || initial === false) {
      // Nothing rendered on server — insert comment marker + mountReactive
      const marker = document.createComment("pyreon")
      if (domNode) {
        parent.insertBefore(marker, domNode)
      } else {
        parent.appendChild(marker)
      }
      const cleanup = mountReactive(child as () => VNodeChild, parent, marker, mountChild)
      return [cleanup, domNode]
    }

    if (
      typeof initial === "string" ||
      typeof initial === "number" ||
      typeof initial === "boolean"
    ) {
      // Reactive text — reuse the existing text node
      if (domNode?.nodeType === Node.TEXT_NODE) {
        const textNode = domNode as Text
        const e = effect(() => {
          const v = (child as () => string | number | boolean | null | undefined)()
          textNode.data = v == null ? "" : String(v)
        })
        return [() => e.dispose(), nextReal(domNode)]
      }
      // DOM mismatch — fall back to fresh mount
      warnHydrationMismatch("text", "TextNode", domNode?.nodeType ?? "null", `${path} > reactive`)
      const cleanup = mountChild(child, parent, anchor)
      return [cleanup, domNode]
    }

    // Reactive VNode / complex — insert comment marker and delegate to mountReactive
    const marker = document.createComment("pyreon")
    if (domNode) {
      parent.insertBefore(marker, domNode)
    } else {
      parent.appendChild(marker)
    }
    const cleanup = mountReactive(child as () => VNodeChild, parent, marker, mountChild)
    // mountReactive will remount the content; advance past the SSR-rendered node
    const next = domNode ? nextReal(domNode) : null
    return [cleanup, next]
  }

  // ── Primitive string / number ──────────────────────────────────────────────
  if (typeof child === "string" || typeof child === "number") {
    if (domNode?.nodeType === Node.TEXT_NODE) {
      // Reuse — text was already rendered correctly by SSR
      return [() => (domNode as Text).remove(), nextReal(domNode)]
    }
    // Mismatch — fresh mount
    warnHydrationMismatch("text", "TextNode", domNode?.nodeType ?? "null", `${path} > text`)
    const cleanup = mountChild(child, parent, anchor)
    return [cleanup, domNode]
  }

  // ── VNode ──────────────────────────────────────────────────────────────────
  const vnode = child as VNode

  // Fragment — transparent wrapper, hydrate children directly
  if (vnode.type === Fragment) {
    return hydrateChildren(vnode.children, domNode, parent, anchor, path)
  }

  // For — look for SSR hydration markers <!--pyreon-for--> ... <!--/pyreon-for-->
  if (vnode.type === ForSymbol) {
    // Check if SSR left boundary markers
    if (domNode?.nodeType === Node.COMMENT_NODE && (domNode as Comment).data === "pyreon-for") {
      // Remove the start marker, collect SSR-rendered children, remove end marker
      const startMarker = domNode
      let cursor: ChildNode | null = startMarker.nextSibling
      const ssrNodes: ChildNode[] = []
      while (cursor) {
        if (cursor.nodeType === Node.COMMENT_NODE && (cursor as Comment).data === "/pyreon-for") {
          break
        }
        ssrNodes.push(cursor)
        cursor = cursor.nextSibling
      }
      const endMarker = cursor
      const afterEnd = endMarker ? (endMarker.nextSibling as ChildNode | null) : null

      // Remove SSR-rendered items (the reactive For will re-create them)
      for (const n of ssrNodes) n.remove()
      if (endMarker) endMarker.remove()

      // Replace start marker with the reactive For mount point
      const marker = document.createComment("pyreon-for")
      parent.replaceChild(marker, startMarker)
      const cleanup = mountChild(vnode, parent, marker)
      return [cleanup, afterEnd ? firstReal(afterEnd) : null]
    }

    // No markers — fallback to fresh mount
    const marker = document.createComment("pyreon-for")
    if (domNode) {
      parent.insertBefore(marker, domNode)
    } else {
      parent.appendChild(marker)
    }
    const cleanup = mountChild(vnode, parent, marker)
    return [cleanup, null]
  }

  // Portal — always remounts into target
  if (vnode.type === PortalSymbol) {
    const cleanup = mountChild(vnode, parent, anchor)
    return [cleanup, domNode]
  }

  // Component
  if (typeof vnode.type === "function") {
    return hydrateComponent(vnode, domNode, parent, anchor, path)
  }

  // DOM element
  if (typeof vnode.type === "string") {
    return hydrateElement(vnode, domNode, parent, anchor, path)
  }

  return [noop, domNode]
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
    const ref = vnode.props.ref as Ref<Element> | undefined
    if (ref && typeof ref === "object") ref.current = el

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

  const componentName = (vnode.type as ComponentFn).name ?? "Anonymous"
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
    console.error(`[pyreon] Error hydrating component <${componentName}>:`, err)
    reportError({
      component: componentName,
      phase: "setup",
      error: err,
      timestamp: Date.now(),
      props: vnode.props as Record<string, unknown>,
    })
    return [noop, domNode]
  }
  setCurrentScope(null)

  const { vnode: output, hooks } = result

  // Register onUpdate hooks with the scope
  for (const fn of hooks.update) {
    scope.addUpdateHook(fn)
  }

  if (output != null) {
    const [cleanup, next] = hydrateChild(output, domNode, parent, anchor, path)
    subtreeCleanup = cleanup
    nextDom = next
  }

  // Fire onMount hooks; effects created inside are tracked by the scope via runInScope
  for (const fn of hooks.mount) {
    let c: (() => void) | undefined
    scope.runInScope(() => {
      c = fn()
    })
    if (c) mountCleanups.push(c)
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
  const firstChild = firstReal(container.firstChild as ChildNode | null)
  const [cleanup] = hydrateChild(vnode, firstChild, container, null)
  return cleanup
}
