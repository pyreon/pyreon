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
  runUntracked,
  setContextOwner,
  setCurrentScope,
} from '@pyreon/reactivity'
import { setupDelegation } from './delegate'
import { installDevTools } from './devtools'
import { warnHydrationMismatch } from './hydration-debug'
import { bindPolymorphicText, mountChild } from './mount'
import { _setPendingForAdoption, mountReactive } from './nodes'
import type { ForAdoption } from './nodes'
import { applyProps, applySelectValueProp } from './props'

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
      if (data === 'pyreon-for' || data === '/pyreon-for') return node
      if (data === '$' || data === '/$') return node
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

  // Range-marked accessor output: the SSR renderer wraps every function child's
  // output in `<!--$-->…<!--/$-->`, giving this accessor's EXACT DOM extent —
  // zero nodes (empty/null initial), one, or many (fragment / <For> / component
  // subtree). Pre-markers this path removed exactly ONE node before re-mounting,
  // so a multi-root initial left the rest of its SSR output DUPLICATED and an
  // empty initial mis-anchored the binding, corrupting sibling order.
  if (domNode?.nodeType === Node.COMMENT_NODE && (domNode as Comment).data === '$') {
    // Find the matching end marker, depth-aware (accessors nest).
    let end: ChildNode | null = null
    let depth = 0
    let n: ChildNode | null = domNode.nextSibling
    while (n) {
      if (n.nodeType === Node.COMMENT_NODE) {
        const d = (n as Comment).data
        if (d === '$') depth++
        else if (d === '/$') {
          if (depth === 0) {
            end = n
            break
          }
          depth--
        }
      }
      n = n.nextSibling
    }
    if (end) {
      const after = end.nextSibling
      // Single-text-node range + text-ish initial → ADOPT the node and bind
      // directly (the dominant reactive-text case, no remount). Deliberately NOT
      // gated on `data === String(initial)`: a genuine server/client divergence
      // still adopts the SAME text node and the renderEffect writes the client
      // value on its first run, so recovery is in-place rather than a
      // double-mount. Only the value is corrected; the mismatch is reported.
      const only = domNode.nextSibling
      if (
        (typeof initial === 'string' || typeof initial === 'number' || typeof initial === 'boolean') &&
        only &&
        only.nodeType === Node.TEXT_NODE &&
        only.nextSibling === end
      ) {
        const bound = only as Text
        if (bound.data !== String(initial)) {
          warnHydrationMismatch('text', String(initial), bound.data, `${path} > reactive`)
        }
        // Polymorphic binding: the accessor may later yield a VNode
        // (`() => loading() ? 'Loading…' : <Table/>`) — the shared helper
        // upgrades the adopted text node to a subtree mount when it does.
        const dispose = bindPolymorphicText(child, bound, parent)
        domNode.remove()
        end.remove()
        return [dispose, after ? firstReal(after) : null]
      }
      // An EMPTY range (initial rendered nothing) or a multi-node range falls
      // through to the general swap below. An empty/null initial does NOT imply a
      // text binding — the accessor can produce a VNode subtree on a later flip —
      // so only `mountReactive` handles the general case correctly. (A first cut
      // bound a text node here; the parity fuzzer's post-flip oracle caught
      // 217/3000 divergences, VNodes stringified into the text node.)
      // General case — mount the live binding at the range position, then remove
      // the SSR range, markers included.
      const marker = insertMarker(parent, domNode, 'pyreon')
      const cleanup = mountReactive(child, parent, marker, mountChild)
      let cur: ChildNode | null = domNode
      while (cur) {
        const nx: ChildNode | null = cur === end ? null : cur.nextSibling
        cur.remove()
        cur = nx
      }
      return [cleanup, after ? firstReal(after) : null]
    }
  }

  // Legacy SSR output (no range markers — older @pyreon/runtime-server).
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
  const initial = runUntracked(child)
  const expected = initial == null ? '' : String(initial)

  // Empty initial value: SSR emitted NOTHING, so there is no text node to adopt.
  // Bind a fresh text node inserted at the CURSOR (client parity), consuming
  // nothing. Pre-fix this fell through to the mismatch branch, which appended at
  // the PARENT's anchor and corrupted sibling order for every following element.
  if (expected === '') {
    const tn = document.createTextNode('')
    parent.insertBefore(tn, domNode ?? anchor)
    const dispose = bindPolymorphicText(child as () => VNodeChild, tn, parent)
    return [dispose, domNode]
  }

  if (domNode?.nodeType === Node.TEXT_NODE) {
    let textNode = domNode as Text
    let next: ChildNode | null = null
    const data = textNode.data
    if (data === expected) {
      next = nextReal(domNode)
    } else if (data.startsWith(expected)) {
      // Merged adjacent text (see the static-text twin above): adopt this
      // binding's prefix; the remainder stays for the next sibling.
      next = textNode.splitText(expected.length)
    } else {
      warnHydrationMismatch('text', expected, data, `${path} > reactive`)
      textNode = document.createTextNode(expected)
      parent.insertBefore(textNode, domNode)
      next = domNode
    }
    const bound = textNode
    const dispose = bindPolymorphicText(child as () => VNodeChild, bound, parent)
    return [dispose, next]
  }
  warnHydrationMismatch('text', 'TextNode', domNode?.nodeType ?? 'null', `${path} > reactive`)
  // Recover AT THE CURSOR so sibling order survives.
  const tn = document.createTextNode(expected)
  parent.insertBefore(tn, domNode ?? anchor)
  const dispose = bindPolymorphicText(child as () => VNodeChild, tn, parent)
  return [dispose, domNode]
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
    // SSR emits a fully-bounded block for a <For>:
    //   <!--pyreon-for-->  <!--k:KEY-->row…  xN  <!--/pyreon-for-->
    // Correctness-first swap (matching the _tpl/__isNative precedent): mount the
    // fresh keyed list before the block, remove the SSR block, and hand back the
    // node AFTER it as the sibling cursor. Pre-fix this mounted fresh rows but
    // LEFT the SSR rows in place (every hydrated <For> duplicated its list) and
    // returned a null cursor. True keyed ADOPTION via the <!--k:KEY--> markers is
    // a perf follow-up.
    if (domNode?.nodeType === Node.COMMENT_NODE && (domNode as Comment).data === 'pyreon-for') {
      // Find the matching end marker, depth-aware (nested <For> blocks).
      let end: ChildNode | null = null
      let depth = 0
      let n: ChildNode | null = domNode.nextSibling
      while (n) {
        if (n.nodeType === Node.COMMENT_NODE) {
          const d = (n as Comment).data
          if (d === 'pyreon-for') depth++
          else if (d === '/pyreon-for') {
            if (depth === 0) {
              end = n
              break
            }
            depth--
          }
        }
        n = n.nextSibling
      }
      if (end) {
        const after = end.nextSibling
        // Parse the block's TOP-LEVEL rows off the <!--k:KEY--> markers
        // (depth-aware — a nested <For>'s k: markers belong to ITS block, not
        // this one). Every row needs ≥1 real DOM node; an empty row makes the
        // parse bail (rows = null) → swap semantics inside mountFor.
        let rows: ForAdoption['rows'] | null = []
        {
          let rowDepth = 0
          let cur: ChildNode | null = domNode.nextSibling
          let open: { key: string; marker: Comment; first: ChildNode | null } | null = null
          const closeRow = (lastBoundary: ChildNode) => {
            if (!open) return true
            const last = lastBoundary.previousSibling
            if (!open.first || !last || open.first === lastBoundary) {
              rows = null // empty row — no adoptable range
              return false
            }
            rows?.push({ key: open.key, marker: open.marker, first: open.first, last })
            open = null
            return true
          }
          while (cur && cur !== end && rows) {
            if (cur.nodeType === Node.COMMENT_NODE) {
              const d = (cur as Comment).data
              if (d === 'pyreon-for') rowDepth++
              else if (d === '/pyreon-for') rowDepth--
              else if (rowDepth === 0 && d.startsWith('k:')) {
                if (!closeRow(cur)) break
                open = { key: d.slice(2), marker: cur as Comment, first: cur.nextSibling }
              }
            }
            cur = cur.nextSibling
          }
          if (rows && !closeRow(end)) rows = null
          // Content before the first k: marker (shouldn't exist) → not adoptable.
          if (rows && rows.length === 0 && domNode.nextSibling !== end) rows = null
        }

        // Hand the parsed block to mountFor via the one-shot slot. mountFor
        // adopts on a 1:1 key match (hydrating each row's vnode against its
        // existing DOM range) and clears-the-block + fresh-renders on ANY
        // mismatch — the previous swap semantics, now internal.
        _setPendingForAdoption({
          startMarker: domNode as Comment,
          tailMarker: end as Comment,
          rows: rows ?? [],
          hydrateRow: (rowVNode, first, rowAfter) =>
            hydrateChild(rowVNode as VNodeChild, first, parent, rowAfter, `${path}.for`)[0],
        })
        const cleanup = mountChild(vnode, parent, end)
        return [cleanup, after ? firstReal(after) : null]
      }
    }
    // Legacy SSR output (no block markers) — previous behavior.
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
    const expected = String(child)
    // Empty static text: SSR emitted NOTHING for it, so there is no node to
    // adopt. Insert the empty text node the client renderer would have
    // created (DOM parity) at the CURSOR — consuming nothing keeps every
    // following sibling aligned.
    if (expected === '') {
      const tn = document.createTextNode('')
      parent.insertBefore(tn, domNode ?? anchor)
      return [() => tn.remove(), domNode]
    }
    if (domNode?.nodeType === Node.TEXT_NODE) {
      const data = (domNode as Text).data
      if (data === expected) {
        const tns = domNode.nextSibling
        return [
          () => (domNode as Text).remove(),
          tns !== null && tns.nodeType === 1 ? tns : firstReal(tns),
        ]
      }
      // MERGED adjacent text: the HTML parser joins text-producing siblings SSR
      // emitted back-to-back ('23' + 'hello' parses as ONE '23hello' node). Adopt
      // exactly this child's prefix via splitText — the remainder stays at the
      // cursor for the NEXT sibling. Prefix matching is exact by construction
      // (the SSR output came from the same tree), not a heuristic.
      if (data.startsWith(expected)) {
        const rest = (domNode as Text).splitText(expected.length)
        return [() => (domNode as Text).remove(), rest]
      }
      // Genuine content mismatch (server/client divergence).
      warnHydrationMismatch('text', expected, data, `${path} > text`)
      const tn = document.createTextNode(expected)
      parent.insertBefore(tn, domNode)
      return [() => tn.remove(), domNode]
    }
    warnHydrationMismatch('text', 'TextNode', domNode?.nodeType ?? 'null', `${path} > text`)
    // Recover AT THE CURSOR (not at the parent-level anchor) so sibling
    // order survives the mismatch.
    const tn = document.createTextNode(expected)
    parent.insertBefore(tn, domNode ?? anchor)
    return [() => tn.remove(), domNode]
  }

  // NativeItem — output of the compiler's `_tpl()` fast path. The client builds a
  // fresh subtree in memory (cloned + reactively bound); there is no true `_tpl`
  // hydration mode yet that would adopt existing nodes and rebind in place. Swap
  // the SSR subtree for the freshly-mounted one — same final DOM, no duplication,
  // reactivity intact. Correctness-first; adopting hydration is a compiler-side
  // follow-up.
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
      if (p && p.nodeType !== 11 /* DocumentFragment — FW-3 */) p.removeChild(native.el)
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
  // Diagnostic path strings compound per element (root > table > tbody > tr >
  // td …) and were built UNCONDITIONALLY — thousands of growing string allocs
  // per hydration feeding GC, purely for mismatch warnings that are themselves
  // dev-rare. In production pass the parent's path ref through unchanged.
  const elPath =
    process.env.NODE_ENV !== 'production' ? `${path} > ${vnode.type as string}` : path

  // Check if existing DOM node matches
  if (
    domNode?.nodeType === Node.ELEMENT_NODE &&
    (domNode as Element).tagName.toLowerCase() === vnode.type
  ) {
    const el = domNode as Element

    // Attach props (events + reactive effects); static attrs are already in the
    // SSR DOM. `<select value>` is deferred until after children hydrate (PZ-09):
    // a child hydration mismatch can re-mount the options, so applying value
    // after `hydrateChildren` guarantees the assignment sees the FINAL list.
    const isSelect = vnode.type === 'select'
    const propCleanup = applyProps(el, vnode.props, isSelect ? 'value' : undefined)

    // Hydrate children. Fast path: an ELEMENT first-child is always "real"
    // (firstReal returns it untouched) — skip the scan for the dominant case.
    const fc = el.firstChild as ChildNode | null
    const firstChild = fc !== null && fc.nodeType === 1 ? fc : firstReal(fc)
    const [childCleanup] = hydrateChildren(vnode.children ?? [], firstChild, el, null, elPath)

    // The cleanup slots are statically known (props / children / select-value /
    // ref) — compose the disposer over locals instead of allocating + pushing a
    // cleanups array per element (~1 array + N pushes for every hydrated
    // element; the dominant td/tr case carries only childCleanup [+propCleanup]).
    const valueCleanup =
      isSelect && 'value' in vnode.props ? applySelectValueProp(el, vnode.props) : null

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
      if (propCleanup) propCleanup()
      childCleanup()
      if (valueCleanup) valueCleanup()
      el.remove()
    }

    // Fast path: an ELEMENT next-sibling is always "real" — skip the scan.
    const ns = domNode.nextSibling
    return [cleanup, ns !== null && ns.nodeType === 1 ? ns : firstReal(ns)]
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
  // mirrors mount.ts so component code reading `props.x` gets the resolved value,
  // not the raw `_rp` function. Without it hydration binds against the wrong
  // values and any signal-driven re-render diverges from the SSR HTML.
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
    // Async component hydration. SSR wraps the awaited output in `<!--$pas-->` /
    // `<!--$pae-->` sentinels, so we find the matching end marker (depth-tracked
    // for nesting), snapshot the bounded DOM range, advance the parent's sibling
    // cursor past it synchronously, then await and hydrate the resolved VNode
    // against that range — wiring events, lifecycle and subscriptions on every
    // node in the subtree.
    //
    // Without markers (older runtime-server) we leave the SSR DOM standing
    // unhydrated, as before, and warn in dev.
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
  // Install the devtools hook on hydration too, not just `mount()` — otherwise
  // the reactive dev overlay (Ctrl+Shift+R) + `__PYREON_DEVTOOLS__` silently
  // don't exist in SSR/hydrated apps, which is most real Pyreon apps. Idempotent
  // + dev-gated (tree-shaken in production), mirroring `mount()`.
  if (process.env.NODE_ENV !== 'production') installDevTools()
  setupDelegation(container)
  const firstChild = firstReal(container.firstChild as ChildNode | null)
  const [cleanup] = hydrateChild(vnode, firstChild, container, null)
  return cleanup
}
