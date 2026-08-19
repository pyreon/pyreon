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
import { buildRowPlan, replayRowPlan, tplAdoptVerify } from './hydration-plan'
import type { RowPlan } from './hydration-plan'
import { _setPendingForAdoption, mountReactive } from './nodes'
import {
  _setSlotHydrator,
  _setTplAdoptTarget,
  _setTplAdoptVerifier,
  _setTplHoleHydrator,
  _tplAdoptDidConsume,
} from './template'
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

/**
 * The hydration twin of runtime-server's `soleAccessorChild` — an element's
 * ONLY child, when it is a reactive accessor, is SSR-emitted WITHOUT
 * `<!--$-->…<!--/$-->` markers because the element's tag boundary already
 * delimits its extent. Decided from the STATIC vnode shape so both sides agree
 * by construction; see the runtime-server definition for the full rationale.
 */
function soleAccessorChild(children: VNodeChild[] | undefined): (() => VNodeChild) | null {
  return children !== undefined && children.length === 1 && typeof children[0] === 'function'
    ? (children[0] as () => VNodeChild)
    : null
}

/**
 * Hydrate an element's SOLE accessor child, whose extent is the element's
 * entire child list (no markers — see `soleAccessorChild`).
 *
 * Structurally this is the marker path with `[el.firstChild, el.lastChild]`
 * substituted for `[<!--$-->, <!--/$-->]`, so the two arms mirror
 * `hydrateReactiveChild`'s exactly: a single text child with a text-ish
 * initial ADOPTS in place (the dominant case, no remount), everything else —
 * empty, multi-node, or a VNode subtree — mounts the live binding at a marker
 * and drops the SSR content.
 */
function hydrateSoleAccessorChild(
  child: () => VNodeChild,
  el: Element,
  path: string,
): Cleanup {
  const initial = runUntracked(child)
  const first = el.firstChild

  // Adopt: exactly one text child, text-ish initial. Deliberately NOT gated on
  // a value match — a genuine server/client divergence still adopts the SAME
  // node and the binding writes the client value on its first run, so recovery
  // is in place rather than a double mount (mirrors the marker path).
  if (
    (typeof initial === 'string' || typeof initial === 'number' || typeof initial === 'boolean') &&
    first !== null &&
    first.nodeType === Node.TEXT_NODE &&
    first.nextSibling === null
  ) {
    const bound = first as Text
    if (bound.data !== String(initial)) {
      warnHydrationMismatch('text', String(initial), bound.data, `${path} > reactive`)
    }
    // The BARE binder is correct here, and this is the one hydrate site where
    // it is. `bindOwnedText` exists because a node adopted into a live parent
    // must be removed by its own cleanup — but that is only true when nothing
    // ELSE removes it. This node is `el`'s SOLE child, and this cleanup is
    // reachable only as `hydrateElement`'s `childCleanup`, whose composed
    // disposer ends in `el.remove()`. The parent goes as a unit, exactly the
    // `_elementDepth > 0` case in `mountChild`'s dispatcher and the same call
    // `hydration-plan.ts` makes for a row descendant.
    //
    // TRIPWIRE: that invariant is `hydrateElement`'s `el.remove()`. If element
    // teardown ever stops removing its own node (a detach-and-reuse cache, say),
    // this must become `bindOwnedText` — and the general case below already is.
    return bindPolymorphicText(child, bound, el)
  }

  // General case — multi-node, or a VNode subtree. The element's own tag
  // boundary is the region, so ADOPT it exactly as the marked path adopts a
  // `<!--$-->` range: same core, same removal contract, with a synthesized close
  // standing in for the marker SSR elided. (This path used to mount fresh and
  // delete the server nodes, retaining 1/N — the container only. That is the
  // same discard `_tpl` adoption exists to stop, and it reached here because the
  // elision has TWO consumers and only the marked one had learned to adopt.)
  //
  // An empty/null initial does NOT imply a text binding — the accessor can yield
  // a VNode on a later flip — so `mountReactive` remains the only correct
  // boundary either way.
  if (first !== null) {
    const end = document.createComment('pyreon')
    el.appendChild(end)
    const cleanup = adoptReactiveRange(child, el, first, end, path)
    end.remove()
    return cleanup
  }
  // SSR rendered nothing into the element — no region to adopt.
  return mountReactive(child, el, null, mountChild)
}

/**
 * MULTI-ROOT ADOPTION — the one place an already-rendered region becomes a LIVE
 * reactive boundary without discarding the nodes.
 *
 * Mounting fresh and deleting the server nodes is the same discard `_tpl`
 * adoption exists to stop: it destroys node identity, and with it typed input,
 * focus, scroll and any listener non-Pyreon code attached. The binding must
 * still be live (a later flip re-renders), so the adoption goes through
 * `mountReactive` exactly as a cold mount would — only its FIRST mount is
 * swapped for a hydrating one, which walks the accessor's initial value against
 * the nodes already present.
 *
 * `end` is a real node terminating the region, and doubles as `mountReactive`'s
 * anchor so the boundary lands AFTER the adopted content and the first walk has
 * a terminator. The CALLER removes it, together with whatever opened the region.
 * Three callers reach this with the same shape:
 *
 *   - marked (`hydrateReactiveChild`) — `[<!--$-->.nextSibling, <!--/$-->]`, the
 *     range SSR emitted for an accessor child.
 *   - MARKER-LESS, compiled (`hydrateMountSlot`) — `[parent.firstChild, <synth>]`
 *   - MARKER-LESS, h() (`hydrateSoleAccessorChild`) — `[el.firstChild, <synth>]`
 *
 * The two marker-less callers exist because runtime-server ELIDES the marker
 * pair when the accessor is its element's sole child (`soleAccessorChild` there)
 * and the tag boundary already delimits the extent. That elision is decided from
 * the STATIC vnode shape, so it holds only where every consumer reads that shape
 * the same way — and the compiled `_tpl` + `_mountSlot` path is a consumer that
 * never joined the agreement. Synthesizing the close is what lets both run this
 * adoption rather than a parallel one. See `_mountSlot`.
 *
 * Any structural divergence inside the walk is handled by the same recovery
 * `hydrateChild` uses everywhere (warn + repair in place), so a mismatch
 * degrades to the pre-existing correctness, never past it.
 *
 * CONSEQUENCE FOR HOSTS WHOSE FIRST RENDER IS A PLACEHOLDER. The client's first
 * render remains the source of truth: if it produces nothing, the server range
 * is dropped, because an accessor that rendered on the server and not on the
 * client is a genuine divergence and converging on the client is what every
 * other branch of this walker does. So a `lazy()` route whose chunk has not
 * landed still gets the old rebuild — at that instant the client really does
 * render nothing. Such a host must resolve its component BEFORE hydrating;
 * `@pyreon/zero`'s `startClient` calls `router.preload(...)` for exactly this
 * reason.
 *
 * A "keep the range and adopt when content appears later" variant was
 * considered and rejected: it cannot distinguish "not ready yet" from "renders
 * nothing", so it would leave stale server DOM standing forever for the latter,
 * and no oracle in the parity fuzz can catch that.
 */
function adoptReactiveRange(
  child: () => VNodeChild,
  parent: Node,
  rangeFirst: ChildNode,
  end: ChildNode,
  path: string,
): Cleanup {
  let hydrated = false
  // A STABLE start boundary for the adopted region. Neither node delimiting the
  // region can serve: the caller removes both, and leaving a `$` open would let
  // a later `_mountSlot` mistake it for a live slot. A neutral marker also keeps
  // the cleanup honest when the adopted subtree's OWN reactivity adds nodes
  // after the walk — the range is re-read at teardown rather than frozen as a
  // node list captured during hydration.
  //
  // It goes immediately before the CONTENT, not before the opening marker, so
  // the teardown walks below start on real content and never have to special-
  // case a marker the caller is about to remove anyway.
  const startMarker = document.createComment('pyreon')
  parent.insertBefore(startMarker, rangeFirst)
  const cleanup = mountReactive(child, parent, end, (value, p, a) => {
    if (hydrated) return mountChild(value, p, a)
    hydrated = true
    // `rangeFirst` may itself be a comment the walk should skip.
    const cursor = rangeFirst.nodeType === 1 ? rangeFirst : firstReal(rangeFirst)
    const disposeBindings = hydrateChild(value, cursor, p, a, `${path} > reactive`)[0]
    // CONTRACT BRIDGE. `hydrateChild`'s cleanups DISPOSE bindings; they do not
    // remove the nodes, because hydrateRoot tears the whole container down.
    // `mountReactive` needs the opposite: its per-run cleanup is what clears the
    // previous render before the next one mounts, so anything left behind
    // survives every future flip. (The parity fuzzer caught exactly this — an
    // adopted text node stayed put after the accessor flipped to an element,
    // 5/300 seeds diverging post-flip.)
    //
    // Clear the LIVE range at teardown (start marker → mountReactive's anchor),
    // not a list frozen now: the adopted subtree's own bindings may add or drop
    // top-level nodes while it is mounted.
    return () => {
      disposeBindings()
      let c = startMarker.nextSibling
      while (c && c !== a) {
        const nx: ChildNode | null = c.nextSibling
        c.remove()
        c = nx
      }
    }
  })
  // The accessor's initial value may be null/false, in which case mountReactive
  // never called the mount fn — the server region is then stale content the
  // client would not have produced, and leaving the adoption armed would run it
  // against those dead nodes on the FIRST flip. Drop the region and mark the
  // adoption spent.
  if (!hydrated) {
    hydrated = true
    // Stop at mountReactive's OWN marker, which it inserted immediately before
    // the anchor — walking to `end` instead deletes that marker, detaching the
    // boundary so the binding can never render again. Every null-initial
    // accessor (`{err() && <span/>}`, a toast list, a conditional row) is that
    // shape, which is why it fails loudly and everywhere rather than subtly.
    const boundary = end.previousSibling
    let c = startMarker.nextSibling
    while (c && c !== boundary && c !== end) {
      const nx: ChildNode | null = c.nextSibling
      c.remove()
      c = nx
    }
  }
  return cleanup
}

/**
 * Bind a reactive text node that hydration OWNS, with a real remover.
 *
 * Every text node hydration binds — adopted from the server, or created at the
 * cursor to recover a divergence — sits in an ALREADY-LIVE parent, so the
 * binding owns it and its cleanup must actually remove it. That is the same
 * contract `mountChild`'s dispatcher applies at `_elementDepth === 0`; only a
 * node inside a freshly-built element that is removed as a unit may skip it.
 *
 * `bindPolymorphicText` alone does NOT remove: its swap core removes the marker
 * and subtree in `sub` mode, but in `text` mode it disposes the effect and
 * leaves the node. That was invisible while every reactive accessor re-mounted
 * over a full range swap — the parent nuked the whole range regardless — and
 * became observable the moment accessors began adopting their range instead:
 * a NESTED accessor's adopted text survived its parent's re-emission, leaving
 * `x<b>…</b>` where a client mount produced `<b>…</b>`. Caught by the parity
 * fuzzer's O3 post-flip oracle (seeds 12/16/23/25/55).
 *
 * When the core has already upgraded to `sub` mode the node is detached, so the
 * removal is a no-op — the core owns the subtree.
 */
function bindOwnedText(child: () => VNodeChild, text: Text, parentNode: Node): Cleanup {
  const dispose = bindPolymorphicText(child, text, parentNode)
  return () => {
    dispose()
    const p = text.parentNode
    // Skip a DocumentFragment parent (nodeType 11) — mirrors the dispatcher.
    if (p && p.nodeType !== 11) p.removeChild(text)
  }
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
        const dispose = bindOwnedText(child, bound, parent)
        domNode.remove()
        end.remove()
        return [dispose, after ? firstReal(after) : null]
      }
      // An EMPTY range (initial rendered nothing) or a multi-node range falls
      // through to the general case below. An empty/null initial does NOT imply a
      // text binding — the accessor can produce a VNode subtree on a later flip —
      // so only `mountReactive` handles the general case correctly. (A first cut
      // bound a text node here; the parity fuzzer's post-flip oracle caught
      // 217/3000 divergences, VNodes stringified into the text node.)

      // MULTI-ROOT ADOPTION. A non-empty range holds real server nodes, and
      // mounting fresh + deleting them is the same discard `_tpl` adoption
      // exists to stop: it destroys node identity, and with it typed input,
      // focus, scroll and any listener non-Pyreon code attached. The binding
      // must still be LIVE (a later flip re-renders), so the adoption goes
      // through `mountReactive` exactly as before — only its FIRST mount is
      // swapped for a hydrating one, which walks the accessor's initial value
      // against the nodes already in the range.
      //
      // The marker anchors AFTER the range (before `/$`), so re-renders insert
      // at the right position and the first hydration walk has a terminator.
      // Only the two markers are removed; the content stays put.
      //
      // Any structural divergence inside the walk is handled by the same
      // recovery `hydrateChild` uses everywhere (warn + repair in place), so a
      // mismatch degrades to the pre-existing correctness, never past it.
      const rangeFirst = domNode.nextSibling
      if (rangeFirst !== null && rangeFirst !== end) {
        const cleanup = adoptReactiveRange(child, parent, rangeFirst, end, path)
        domNode.remove()
        end.remove()
        return [cleanup, after ? firstReal(after) : null]
      }

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
      domNode.remove()
      end.remove()
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
    const dispose = bindOwnedText(child as () => VNodeChild, tn, parent)
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
    const dispose = bindOwnedText(child as () => VNodeChild, bound, parent)
    return [dispose, next]
  }
  warnHydrationMismatch('text', 'TextNode', domNode?.nodeType ?? 'null', `${path} > reactive`)
  // Recover AT THE CURSOR so sibling order survives.
  const tn = document.createTextNode(expected)
  parent.insertBefore(tn, domNode ?? anchor)
  const dispose = bindOwnedText(child as () => VNodeChild, tn, parent)
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
      // ONE depth-aware pass finds the matching end marker AND parses the
      // block's TOP-LEVEL rows off the <!--k:KEY--> markers (a nested <For>'s
      // k: markers belong to ITS block, not this one). Every row needs ≥1 real
      // DOM node; an empty row makes the parse bail (parseOk = false) → swap
      // semantics inside mountFor.
      //
      // This used to be TWO end-to-end scans of the same sibling chain (find
      // `end`, then re-walk to collect markers) plus a per-row `.nextSibling`
      // for the row's first node and a per-row `.previousSibling` for its last
      // — 6 sibling-getter reads per row on a 1000-row table. Fused, it is 2:
      // the scan already holds `next` (which IS the just-opened row's first
      // node) and `prev` (which IS the closing row's last node), so both
      // per-row lookups are reads of values already in hand, not new DOM
      // traversals. Measured on a 1000-row keyed table: 6000 → 2000.
      //
      // PARALLEL arrays instead of per-row {key,marker,first,last} objects, and
      // the marker data kept RAW ('k:' prefix retained) — a 1000-row block
      // previously allocated 1000 row objects + 1000 `.slice(2)` key strings
      // before a single row was verified; the raw form compares alloc-free via
      // `startsWith(keyStr, 2)` in the verify loop below.
      let end: ChildNode | null = null
      let parseOk = true
      const rowKeysRaw: string[] = []
      const rowMarkers: Comment[] = []
      const rowFirsts: ChildNode[] = []
      const rowLasts: ChildNode[] = []
      {
        let depth = 0
        let cur: ChildNode | null = domNode.nextSibling
        // `prev` mirrors `cur.previousSibling` — the scan is a pure read, so
        // nothing can mutate the chain underneath it.
        let prev: ChildNode | null = null
        let openKey = ''
        let openMarker: Comment | null = null
        let openFirst: ChildNode | null = null
        while (cur) {
          const next: ChildNode | null = cur.nextSibling
          if (cur.nodeType === 8 /* comment */) {
            const d = (cur as Comment).data
            if (d === '/pyreon-for') {
              if (depth === 0) {
                end = cur
                break
              }
              depth--
            } else if (d === 'pyreon-for') depth++
            else if (
              // `parseOk` short-circuits the row bookkeeping once the parse has
              // failed, but the scan MUST continue: `end` is what decides
              // whether this is an adoptable block at all, and a bail before
              // finding it would drop the whole <For> onto the legacy path.
              parseOk &&
              depth === 0 &&
              d.charCodeAt(0) === 107 /* k */ &&
              d.charCodeAt(1) === 58 /* : */
            ) {
              if (openMarker) {
                if (!openFirst || !prev || openFirst === cur) {
                  parseOk = false // empty row — no adoptable range
                } else {
                  rowKeysRaw.push(openKey)
                  rowMarkers.push(openMarker)
                  rowFirsts.push(openFirst)
                  rowLasts.push(prev)
                }
              }
              openKey = d
              openMarker = cur as Comment
              openFirst = next
            }
          }
          prev = cur
          cur = next
        }
        if (end && parseOk && openMarker) {
          // `prev` is the node before `end` — the final row's last node.
          if (!openFirst || !prev || openFirst === end) parseOk = false
          else {
            rowKeysRaw.push(openKey)
            rowMarkers.push(openMarker)
            rowFirsts.push(openFirst)
            rowLasts.push(prev)
          }
        }
        // Content before the first k: marker (shouldn't exist) → not adoptable.
        if (end && parseOk && rowKeysRaw.length === 0 && domNode.nextSibling !== end) parseOk = false
      }
      if (end) {
        const after = end.nextSibling

        // Hand the parsed block to mountFor via the one-shot slot. mountFor
        // adopts on a 1:1 key match (hydrating each row's vnode against its
        // existing DOM range) and clears-the-block + fresh-renders on ANY
        // mismatch — the previous swap semantics, now internal.
        // Lazy per-<For> row plan: built from the FIRST row vnode that reaches
        // the replay hook; null = unsupported shape → interpretive walk for all
        // rows (previous behavior). `planTried` distinguishes "not built yet"
        // from "build bailed".
        // The ENTIRE adoption routine lives here (hydration side) — mountFor
        // only dispatches to adoptRows, so CSR bundles tree-shake all of it.
        let rowPlan: RowPlan | null = null
        let planTried = false
        const rowsAdoptable = parseOk
        _setPendingForAdoption({
          startMarker: domNode as Comment,
          tailMarker: end as Comment,
          adoptRows: (ops) => {
            if (!rowsAdoptable || ops.n !== rowKeysRaw.length) return null
            // Hoist the ops fields — the per-row loop below runs 1000+ times.
            const { items, n: rowCount, getKey, renderItem, tailMarker: opsTail, setEntry } = ops
            const keys = new Array<string | number>(rowCount)
            // Phase 1 — verify every key BEFORE any mutation (all-or-nothing).
            for (let i = 0; i < rowCount; i++) {
              const key = getKey(items[i])
              const raw = rowKeysRaw[i] as string // 'k:KEY', possibly URL-escaped
              if (raw.indexOf('%') < 0) {
                // No escapes — compare against the raw form in place
                // (equivalent to `String(key) === raw.slice(2)` without the
                // per-row slice allocation).
                const keyStr = typeof key === 'string' ? key : String(key)
                if (raw.length !== keyStr.length + 2 || !raw.startsWith(keyStr, 2)) return null
              } else {
                let markerKey: string
                try {
                  markerKey = decodeURIComponent(raw.slice(2))
                } catch {
                  return null // malformed marker — bail, never throw mid-hydration
                }
                if (String(key) !== markerKey) return null
              }
              keys[i] = key
            }
            // Register the compiled-template verifier (idempotent; also set by
            // hydrateRoot — kept here for direct-adoption robustness).
            _setTplAdoptVerifier(tplAdoptVerify)
  _setTplHoleHydrator(hydrateMountHole)
            for (let i = 0; i < rowCount; i++) {
              const rowMarker = rowMarkers[i] as Comment
              const rowFirst = rowFirsts[i] as ChildNode
              const rowLast = rowLasts[i] as ChildNode
              const rowAfter: Node = i + 1 < rowCount ? (rowMarkers[i + 1] as Comment) : opsTail
              // COMPILED rows: arm the one-shot _tpl target BEFORE renderItem —
              // the _tpl call inside binds against the SSR row when the
              // structure verifies. h()-rows ignore it; cleared either way.
              // `true` = opt into the verifier's cached-plan fast path. Sound
              // HERE and only here: every row comes from the same `renderItem`,
              // so rows 2..N are structurally identical to row 1 by
              // construction. Component-root adoption cannot promise that and
              // therefore always runs the full skeleton verify.
              if (rowFirst.nodeType === 1) _setTplAdoptTarget(rowFirst as Element, true)
              const rowVNode = renderItem(items[i])
              const tplAdopted = _tplAdoptDidConsume()
              _setTplAdoptTarget(null) // defensive clear
              let cleanup: (() => void) | null
              // Anchor on the row's k: MARKER (kept in the DOM) — the row range
              // is [marker .. last]; moves/removals carry the marker with the
              // row, so no per-row marker removal at adoption time.
              let endNode: Node | null = rowLast !== (rowMarker as ChildNode) ? rowLast : null
              if (tplAdopted) {
                const native = rowVNode as { el: ChildNode; cleanup?: (() => void) | null }
                const nativeCleanup = native.cleanup ?? null
                const el = native.el
                cleanup = () => {
                  nativeCleanup?.()
                  // NativeItem binds don't remove their element — mirror
                  // hydrateElement's cleanup contract explicitly.
                  el.remove()
                }
              } else {
                // Dispatch-free plan replay first; any verification failure
                // falls back to the interpretive walk for THIS row.
                if (!planTried) {
                  planTried = true
                  rowPlan = buildRowPlan(rowVNode as VNodeChild)
                }
                cleanup =
                  (rowPlan ? replayRowPlan(rowPlan, rowVNode as VNodeChild, rowFirst) : null) ??
                  hydrateChild(rowVNode as VNodeChild, rowFirst, parent, rowAfter, `${path}.for`)[0]
                // A NativeItem row that did NOT adopt was SWAPPED — re-derive
                // the live end from the still-present neighbors.
                if (!rowFirst.isConnected) {
                  const lastLive = (rowAfter as ChildNode).previousSibling
                  endNode = lastLive && lastLive !== (rowMarker as ChildNode) ? lastLive : null
                }
              }
              setEntry(keys[i] as string | number, rowMarker, cleanup, i, endNode)
            }
            return keys
          },
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

/**
 * Hydrate one absorbed COMPONENT child of a compiled template's mount hole,
 * from the hole's running cursor. Registered into `_tpl` as a seam (never
 * imported by it) so a CSR-only bundle still tree-shakes every byte of this
 * module.
 *
 * The cursor is normalized exactly as `hydrateElement` normalizes an element's
 * first child, so a hole and an ordinary element agree on what "the next real
 * node" is. Like `hydrateElement`, whitespace/comments SKIPPED here stay in the
 * DOM rather than being removed — `renderToString` never emits them between
 * elements, so the case does not arise from Pyreon's own SSR output.
 */
function hydrateMountHole(
  child: VNodeChild | VNodeChild[],
  parent: Node,
  cursor: ChildNode | null,
): [Cleanup, ChildNode | null] {
  const start = cursor !== null && cursor.nodeType === 1 ? cursor : firstReal(cursor)
  // The cursor doubles as the ANCHOR. Every recovery path in `hydrateChild`
  // (tag mismatch, text mismatch, a NativeItem with no counterpart) inserts at
  // the anchor, and with `null` that means APPEND — past the unclaimed server
  // content, which `sweepHoles` then deletes along with it, so a mismatch
  // inside a hole would render nothing at all. Anchoring on the cursor puts the
  // recovery BEFORE the content it replaces, so the sweep removes only the
  // stale nodes. When the cursor is null there is nothing left to precede and
  // the anchor is `null` again, which is the append the caller wants.
  return hydrateChild(child, start, parent, start)
}

/**
 * Hydrate a compiled `_mountSlot` against the SSR range its adopted container
 * already holds (see `_mountSlot`). `open` is the live `<!--$-->` marker the
 * compiled placeholder ref resolved to.
 *
 * The ACCESSOR case — what the compiler emits for `{items.map(…)}` and every
 * other dynamic slot — is handed straight to `hydrateChild`, because a `$`
 * cursor is precisely the shape `hydrateReactiveChild` already decodes: it
 * finds the matching close depth-aware, adopts the range, and drops both
 * markers. A non-accessor value (a literal array) has no reactive boundary to
 * install, so it is walked against the range directly and the markers removed
 * here.
 */
function hydrateMountSlot(
  children: VNodeChild | VNodeChild[],
  parent: Node,
  open: Comment | null,
): Cleanup {
  // MARKER-LESS REGION — the slot was its element's SOLE child, so
  // runtime-server elided the `<!--$-->` pair and the extent is the parent's
  // entire child list. See `_mountSlot` for why a `null` open provably means
  // SOLE rather than merely last.
  if (open === null) {
    const first = parent.firstChild
    if (typeof children === 'function') {
      // SSR rendered nothing into the slot, so there is no region to adopt —
      // install the boundary a cold mount would have built, at the end of the
      // (empty) child list.
      if (first === null) return mountReactive(children as () => VNodeChild, parent, null, mountChild)
      // Synthesize the close SSR elided so the shared adoption core runs on
      // exactly the shape it gets for a marked range — including the removal
      // contract, which a direct `hydrateChild` call does NOT carry: its
      // cleanups dispose bindings only, so the server nodes would survive every
      // future flip and the region would DUPLICATE on the first re-render.
      const end = document.createComment('pyreon')
      parent.appendChild(end)
      const cleanup = adoptReactiveRange(children as () => VNodeChild, parent, first, end, 'slot')
      end.remove()
      return cleanup
    }
    // A literal (non-accessor) value installs no reactive boundary, so it is
    // walked against the region directly — there is no later render whose
    // cleanup would have to remove these nodes.
    const cursor = first === null ? null : first.nodeType === 1 ? first : firstReal(first)
    return hydrateChild(children, cursor, parent, null, 'slot')[0]
  }
  if (typeof children === 'function') {
    return hydrateChild(children, open, parent, null, 'slot')[0]
  }
  // Locate the range end (depth-aware — accessor ranges nest).
  let close: ChildNode | null = null
  let depth = 0
  for (let n: ChildNode | null = open.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType !== 8) continue
    const d = (n as Comment).data
    if (d === '$') depth++
    else if (d === '/$') {
      if (depth === 0) {
        close = n
        break
      }
      depth--
    }
  }
  if (close === null) {
    // No range to adopt (shouldn't reach here — the verifier only admits a
    // container whose slot range is well-formed). Fall back to mounting.
    const cleanup = mountChild(children, parent, open)
    open.remove()
    return cleanup
  }
  const first = open.nextSibling
  const cursor = first === close ? null : first!.nodeType === 1 ? first : firstReal(first)
  const [cleanup] = hydrateChild(children, cursor, parent, close, 'slot')
  open.remove()
  close.remove()
  return cleanup
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
    if (native.el === domNode) {
      // ADOPTED — `_tpl` bound against this very node (target armed by
      // hydrateComponent). It is already in place; replacing it with itself
      // would detach + reattach, destroying focus/selection for nothing.
      const adoptedCleanup = () => {
        native.cleanup?.()
        const p = native.el.parentNode
        if (p && p.nodeType !== 11) p.removeChild(native.el)
      }
      return [adoptedCleanup, next]
    }
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

    // Hydrate children. A SOLE accessor child owns the element's whole child
    // list (SSR elided its markers — see `soleAccessorChild`), so it bypasses
    // the cursor walk entirely. Otherwise: fast path — an ELEMENT first-child
    // is always "real" (firstReal returns it untouched), skipping the scan for
    // the dominant case.
    const sole = soleAccessorChild(vnode.children)
    let childCleanup: Cleanup
    if (sole) {
      childCleanup = hydrateSoleAccessorChild(sole, el, elPath)
    } else {
      const fc = el.firstChild as ChildNode | null
      const firstChild = fc !== null && fc.nodeType === 1 ? fc : firstReal(fc)
      ;[childCleanup] = hydrateChildren(vnode.children ?? [], firstChild, el, null, elPath)
    }

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
  // Compiled-template ADOPTION (general case). A component whose body is a
  // static DOM subtree returns a `_tpl()` NativeItem; without a target armed,
  // `_tpl` CLONES and the NativeItem branch of `hydrateChild` then REPLACES the
  // server DOM — discarding it, which is the opposite of hydrating. Arm the
  // one-shot target with this component's SSR cursor so a root `_tpl` binds
  // against the existing nodes instead. `_tpl` clears the slot on ANY outcome
  // and the verifier is all-or-nothing BEFORE mutation, so a non-matching
  // template simply falls through to the clone (previous behaviour).
  const adoptTarget = domNode !== null && domNode.nodeType === 1 ? (domNode as Element) : null
  if (adoptTarget !== null) _setTplAdoptTarget(adoptTarget)
  try {
    result = runWithHooks(vnode.type as ComponentFn, mergedProps)
  } catch (err) {
    if (adoptTarget !== null) _setTplAdoptTarget(null)
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
  // Disarm unconditionally: a component that produced no root `_tpl` must not
  // leave a live target for an unrelated later call.
  if (adoptTarget !== null) _setTplAdoptTarget(null)
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
  // Register the compiled-template adoption verifier on FIRST hydration
  // (idempotent, CALL-time — a module-load call would pin the verify/plan
  // machinery into CSR bundles that tree-shake hydrateRoot).
  _setTplAdoptVerifier(tplAdoptVerify)
  _setTplHoleHydrator(hydrateMountHole)
  _setSlotHydrator(hydrateMountSlot)
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
