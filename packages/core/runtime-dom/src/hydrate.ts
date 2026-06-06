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

import type { ComponentFn, RefProp, VNode, VNodeChild } from '@pyreon/core'
import {
  dispatchToErrorBoundary,
  ForSymbol,
  Fragment,
  makeReactiveProps,
  PortalSymbol,
  reportError,
  runWithHooks,
} from '@pyreon/core'
import {
  effectScope,
  getContextOwner,
  renderEffect,
  runUntracked,
  setContextOwner,
  setCurrentScope,
} from '@pyreon/reactivity'
import { setupDelegation } from './delegate'
import { warnHydrationMismatch } from './hydration-debug'
import { mountChild } from './mount'
import { mountReactive } from './nodes'
import { applyProps } from './props'

type Cleanup = () => void
const noop: Cleanup = () => {
  /* noop */
}

// ─── DOM cursor helpers ───────────────────────────────────────────────────────

/**
 * Async-component sentinel markers, emitted by `@pyreon/runtime-server`
 * around the awaited output of an `async function Component()`. The
 * client hydrate uses them to locate the SSR DOM range corresponding to
 * the still-pending Promise so it can hydrate the resolved subtree
 * in-place once it settles. Naming chosen for SSR HTML brevity + low
 * collision risk with user content (`$p` = Pyreon, `as`/`ae` = async
 * start/end).
 */
const ASYNC_START_MARKER = '$pas'
const ASYNC_END_MARKER = '$pae'

/** True if `node` is the `<!--$pas-->` async-start comment. */
function isAsyncStartMarker(node: ChildNode | null): boolean {
  return (
    node !== null &&
    node.nodeType === Node.COMMENT_NODE &&
    (node as Comment).data === ASYNC_START_MARKER
  )
}

/**
 * Walk forward from a `<!--$pas-->` comment to its matching `<!--$pae-->`,
 * tracking nesting depth so an inner async component's markers don't
 * close the outer one. Returns the matching end comment, or `null` if
 * the SSR output is malformed (no matching close).
 */
function findMatchingAsyncEnd(start: Comment): Comment | null {
  let depth = 1
  let node: ChildNode | null = start.nextSibling
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const data = (node as Comment).data
      if (data === ASYNC_START_MARKER) depth++
      else if (data === ASYNC_END_MARKER) {
        depth--
        if (depth === 0) return node as Comment
      }
    }
    node = node.nextSibling
  }
  return null
}

/**
 * Skip whitespace-only text nodes and formatting comments — but STOP at
 * structural comment markers (`$pas` async-start, `$pae` async-end, and
 * the For-list `k:`-prefixed key markers from runtime-server). Those are
 * load-bearing signals the hydrate walker must see.
 */
function firstReal(initialNode: ChildNode | null): ChildNode | null {
  let node = initialNode
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const data = (node as Comment).data
      // Structural markers — return as-is so the caller can handle them.
      if (data === ASYNC_START_MARKER || data === ASYNC_END_MARKER) return node
      if (data.startsWith('k:')) return node
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
    const marker = insertMarker(parent, domNode, 'pyreon')
    const cleanup = mountReactive(child, parent, marker, mountChild)
    return [cleanup, domNode]
  }

  if (typeof initial === 'string' || typeof initial === 'number' || typeof initial === 'boolean') {
    return hydrateReactiveText(
      child as () => string | number | boolean | null | undefined,
      domNode,
      parent,
      anchor,
      path,
    )
  }

  // Reactive accessor that produces a VNode/NativeItem subtree.
  const next = domNode ? nextReal(domNode) : null
  if (domNode && domNode.parentNode) {
    domNode.parentNode.removeChild(domNode)
  }
  const marker = insertMarker(parent, next, 'pyreon')
  const cleanup = mountReactive(child, parent, marker, mountChild)
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
      textNode.data = v == null ? '' : String(v)
    })
    return [dispose, nextReal(domNode)]
  }
  warnHydrationMismatch('text', 'TextNode', domNode?.nodeType ?? 'null', `${path} > reactive`)
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
    return hydrateChildren(vnode.children ?? [], domNode, parent, anchor, path)
  }

  if (vnode.type === ForSymbol) {
    const marker = insertMarker(parent, domNode, 'pyreon-for')
    const cleanup = mountChild(vnode, parent, marker)
    return [cleanup, null]
  }

  if (vnode.type === PortalSymbol) {
    const cleanup = mountChild(vnode, parent, anchor)
    return [cleanup, domNode]
  }

  if (typeof vnode.type === 'function') {
    return hydrateComponent(vnode, domNode, parent, anchor, path)
  }

  if (typeof vnode.type === 'string') {
    return hydrateElement(vnode, domNode, parent, anchor, path)
  }

  return [noop, domNode]
}

function hydrateChild(
  child: VNodeChild | VNodeChild[],
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path = 'root',
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

  if (typeof child === 'function') {
    return hydrateReactiveChild(child as () => VNodeChild, domNode, parent, anchor, path)
  }

  if (typeof child === 'string' || typeof child === 'number') {
    if (domNode?.nodeType === Node.TEXT_NODE) {
      return [() => (domNode as Text).remove(), nextReal(domNode)]
    }
    warnHydrationMismatch('text', 'TextNode', domNode?.nodeType ?? 'null', `${path} > text`)
    const cleanup = mountChild(child, parent, anchor)
    return [cleanup, domNode]
  }

  // NativeItem — output of the compiler's `_tpl()` template fast path. The
  // client builds a fresh DOM subtree in memory (cloned + reactively bound).
  // We don't yet have a true hydration mode for `_tpl` (which would adopt
  // existing DOM nodes and rebind without remount). For now, swap the SSR
  // subtree at this position for the freshly-mounted one — same final DOM,
  // no duplication, reactivity intact. This is correctness-first; a true
  // adopting hydration is a separate compiler-side change.
  if ((child as unknown as { __isNative?: boolean })?.__isNative === true) {
    const native = child as unknown as { __isNative: true; el: Node; cleanup?: () => void }
    const next = domNode ? nextReal(domNode) : null
    if (domNode && domNode.parentNode) {
      domNode.parentNode.replaceChild(native.el, domNode)
    } else {
      parent.insertBefore(native.el, anchor)
    }
    const cleanup = () => {
      native.cleanup?.()
      const p = native.el.parentNode
      if (p && (p as Element).isConnected !== false) p.removeChild(native.el)
    }
    return [cleanup, next]
  }

  return hydrateVNode(child as VNode, domNode, parent, anchor, path)
}

// ─── Element hydration ────────────────────────────────────────────────────────

function hydrateElement(
  vnode: VNode,
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path = 'root',
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
    const [childCleanup] = hydrateChildren(vnode.children ?? [], firstChild, el, null, elPath)
    cleanups.push(childCleanup)

    // Set ref
    const ref = vnode.props.ref as RefProp<Element> | undefined
    if (ref) {
      if (typeof ref === 'function') ref(el)
      else ref.current = el
    }

    const cleanup = () => {
      if (ref) {
        if (typeof ref === 'function') ref(null)
        else ref.current = null
      }
      for (const c of cleanups) c()
      el.remove()
    }

    return [cleanup, nextReal(domNode)]
  }

  // Mismatch — fall back to fresh mount
  const actual =
    domNode?.nodeType === Node.ELEMENT_NODE
      ? (domNode as Element).tagName.toLowerCase()
      : (domNode?.nodeType ?? 'null')
  warnHydrationMismatch('tag', vnode.type, actual, elPath)
  const cleanup = mountChild(vnode, parent, anchor)
  return [cleanup, domNode]
}

// ─── Children hydration ───────────────────────────────────────────────────────

function hydrateChildren(
  children: VNodeChild[],
  domNode: ChildNode | null,
  parent: Node,
  anchor: Node | null,
  path = 'root',
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
  path = 'root',
): [Cleanup, ChildNode | null] {
  // Owner chain — mirrors mount.ts so `useContext()` resolves up the tree
  // during hydration too. Owner stays `scope` through `runWithHooks` +
  // `hydrateChild` + onMount, restored to `prevOwner` on every exit.
  const prevOwner = getContextOwner()
  const scope = effectScope()
  scope._parent = prevOwner
  setCurrentScope(scope)
  setContextOwner(scope)

  let subtreeCleanup: Cleanup = noop
  const mountCleanups: Cleanup[] = []
  let nextDom: ChildNode | null = domNode

  // Function.name is always a string per spec; || handles empty string, avoids uncoverable ?? branch
  const componentName = ((vnode.type as ComponentFn).name || 'Anonymous') as string
  const rawProps =
    (vnode.children ?? []).length > 0 &&
    (vnode.props as Record<string, unknown>).children === undefined
      ? {
          ...vnode.props,
          children:
            (vnode.children ?? []).length === 1
              ? (vnode.children ?? [])[0]
              : (vnode.children ?? []),
        }
      : (vnode.props as Record<string, unknown>)
  // Convert compiler-emitted `_rp(() => expr)` wrappers into getter properties —
  // mirrors mount.ts so component code can read `props.x` and get the resolved
  // value (not the raw `_rp` function). Without this, hydration set up reactive
  // bindings against the wrong values and any signal-driven re-render would
  // diverge from the SSR HTML.
  const mergedProps = makeReactiveProps(rawProps as Record<string, unknown>)

  let result: ReturnType<typeof runWithHooks>
  try {
    result = runWithHooks(vnode.type as ComponentFn, mergedProps)
  } catch (err) {
    setCurrentScope(null)
    setContextOwner(prevOwner)
    scope.stop()

    console.error(`[Pyreon] Error hydrating component <${componentName}>:`, err)
    reportError({
      component: componentName,
      phase: 'setup',
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
  if (hooks.update) {
    for (const fn of hooks.update) scope.addUpdateHook(fn)
  }

  if (output instanceof Promise) {
    // Async component support — proper hydration. SSR (runtime-server)
    // wraps the awaited output in sentinel comments: `<!--$pas-->` and
    // `<!--$pae-->` (start / end). We:
    //   1. Find the matching end marker (depth-tracked so nested async
    //      components don't confuse the walker).
    //   2. Snapshot the DOM range bounded by the markers.
    //   3. Advance the parent's sibling cursor past the end marker (sync)
    //      so the parent's hydration continues normally.
    //   4. Await the Promise. Once resolved, hydrate the resolved VNode
    //      against the snapshotted DOM range — this wires up events,
    //      lifecycle, signal subscriptions on every node in the subtree
    //      (the part missing from earlier versions of this branch).
    //
    // Fallback: if markers are absent (older runtime-server, or some
    // edge case where the SSR pipeline didn't emit them), we skip
    // hydration of the async subtree and just leave the SSR DOM
    // standing — same as the pre-marker behaviour. Dev mode warns.
    let resolvedCleanup: Cleanup = noop
    let cancelled = false

    const startMarker = isAsyncStartMarker(domNode) ? (domNode as Comment) : null
    const endMarker = startMarker ? findMatchingAsyncEnd(startMarker) : null
    const rangeStart = startMarker ? startMarker.nextSibling : null

    if (startMarker && endMarker) {
      // Advance the parent's DOM cursor PAST the end marker — synchronous,
      // so the parent's hydration loop continues normally for siblings.
      nextDom = endMarker.nextSibling
    } else {
      // Markers missing — fall back to "do not touch SSR DOM" behaviour.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[Pyreon] Hydration: async component <${componentName}> SSR markers ` +
            'not found. Reactivity for this subtree will NOT be attached. ' +
            'Ensure `@pyreon/runtime-server` is on the version that emits ' +
            '<!--$pas-->/<!--$pae--> around awaited component output.',
        )
      }
      nextDom = null
    }

    output
      .then((resolved) => {
        if (cancelled) return
        if (resolved == null) return
        if (!startMarker || !endMarker) return
        try {
          // Hydrate the resolved subtree against the SSR DOM range.
          // `anchor = endMarker` bounds the sibling walk; hydrateChild
          // returns when it has consumed the range or hit the end marker.
          const [childCleanup] = hydrateChild(
            resolved as VNodeChild,
            rangeStart,
            parent,
            endMarker,
            `${path}:async`,
          )
          resolvedCleanup = childCleanup
        } catch (err) {
          const handled = dispatchToErrorBoundary(err)
          if (!handled && process.env.NODE_ENV !== 'production') {
            console.error(
              `[Pyreon] <${componentName}> threw during async hydration:`,
              err,
            )
          }
        }
      })
      .catch((err) => {
        if (cancelled) return
        const handled = dispatchToErrorBoundary(err)
        if (!handled && process.env.NODE_ENV !== 'production') {
          console.error(
            `[Pyreon] <${componentName}> async hydration rejected:`,
            err,
          )
        }
      })

    subtreeCleanup = () => {
      cancelled = true
      resolvedCleanup()
      // Remove the SSR markers themselves on unmount so re-mount doesn't
      // confuse the walker. The DOM range between them is owned by the
      // resolved cleanup (subtree's mount cleanup removes its nodes).
      if (startMarker?.parentNode) startMarker.parentNode.removeChild(startMarker)
      if (endMarker?.parentNode) endMarker.parentNode.removeChild(endMarker)
    }
  } else if (output != null) {
    const [childCleanup, next] = hydrateChild(output, domNode, parent, anchor, path)
    subtreeCleanup = childCleanup
    nextDom = next
  }

  // Fire onMount hooks; effects created inside are tracked by the scope via runInScope
  if (hooks.mount) {
    for (const fn of hooks.mount) {
      try {
        let c: (() => void) | undefined
        scope.runInScope(() => {
          c = fn() as (() => void) | undefined
        })
        if (c) mountCleanups.push(c)
      } catch (err) {
        reportError({ component: componentName, phase: 'mount', error: err, timestamp: Date.now() })
      }
    }
  }

  // Subtree fully hydrated — restore the parent owner for siblings.
  setContextOwner(prevOwner)

  const cleanup: Cleanup = () => {
    scope.stop()
    subtreeCleanup()
    if (hooks.unmount) for (const fn of hooks.unmount) fn()
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
