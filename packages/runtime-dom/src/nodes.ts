import type { NativeItem, VNode, VNodeChild } from "@pyreon/core"

type MountFn = (child: VNodeChild, parent: Node, anchor: Node | null) => Cleanup
import { effect } from "@pyreon/reactivity"

type Cleanup = () => void

/**
 * Move all nodes strictly between `start` and `end` into a throwaway
 * DocumentFragment, detaching them from the live DOM in O(n) top-level moves.
 *
 * This is dramatically faster than Range.deleteContents() in JS-based DOMs
 * (happy-dom, jsdom) where deleting connected nodes with deep subtrees is O(n²).
 * In real browsers both approaches are similar, but the fragment approach is
 * never slower and avoids the pathological case.
 *
 * After this call every moved node has isConnected=false, so cleanup functions
 * that guard removeChild with `isConnected !== false` become no-ops.
 */
function clearBetween(start: Node, end: Node): void {
  const frag = document.createDocumentFragment()
  let cur: Node | null = start.nextSibling
  while (cur && cur !== end) {
    const next: Node | null = cur.nextSibling
    frag.appendChild(cur)
    cur = next
  }
  // frag goes out of scope → nodes are GC-eligible
}

/**
 * Mount a reactive node whose content changes over time.
 *
 * A comment node is used as a stable anchor point in the DOM.
 * On each change: old nodes are removed, new ones inserted before the anchor.
 */
export function mountReactive(
  accessor: () => VNodeChild,
  parent: Node,
  anchor: Node | null,
  mount: (child: VNodeChild, parent: Node, anchor: Node | null) => Cleanup,
): Cleanup {
  const marker = document.createComment("pyreon")
  parent.insertBefore(marker, anchor)

  let currentCleanup: Cleanup = () => {}
  let generation = 0

  const e = effect(() => {
    const myGen = ++generation
    currentCleanup()
    currentCleanup = () => {}
    const value = accessor()
    if (value != null && value !== false) {
      const cleanup = mount(value, parent, marker)
      // Guard: a re-entrant signal update (e.g. ErrorBoundary catching a child
      // throw) may have already re-run this effect and updated currentCleanup.
      // In that case, discard our stale cleanup rather than overwriting the one
      // set by the re-entrant run.
      if (myGen === generation) {
        currentCleanup = cleanup
      } else {
        cleanup()
      }
    }
  })

  return () => {
    e.dispose()
    currentCleanup()
    marker.parentNode?.removeChild(marker)
  }
}

// ─── Keyed list reconciler ────────────────────────────────────────────────────

/**
 * Efficient keyed list reconciler.
 *
 * When a reactive accessor returns VNode[] where every vnode carries a key,
 * this reconciler reuses, moves, and creates DOM nodes surgically instead of
 * tearing down and rebuilding the full list on every signal update.
 */

interface KeyedEntry {
  /** Comment node placed immediately before this entry's DOM content. */
  anchor: Comment
  cleanup: Cleanup
}

// WeakSets to identify anchor nodes belonging to list entries.
// Entries use their first DOM node as anchor (element for simple vnodes, comment fallback for empty).
const _keyedAnchors = new WeakSet<Node>()

export function mountKeyedList(
  accessor: () => VNode[],
  parent: Node,
  listAnchor: Node | null,
  mountVNode: (vnode: VNode, parent: Node, anchor: Node | null) => Cleanup,
): Cleanup {
  const startMarker = document.createComment("")
  const tailMarker = document.createComment("")
  parent.insertBefore(startMarker, listAnchor)
  parent.insertBefore(tailMarker, listAnchor)

  const cache = new Map<string | number, KeyedEntry>()
  const curPos = new Map<string | number, number>()
  let currentKeyOrder: (string | number)[] = []

  // Reusable typed arrays for LIS — grown as needed, never shrunk
  let lisTails = new Int32Array(16)
  let lisTailIdx = new Int32Array(16)
  let lisPred = new Int32Array(16)
  let lisStay = new Uint8Array(16)

  const e = effect(() => {
    const newList = accessor()
    const n = newList.length

    // Fast clear path: bulk DOM removal
    if (n === 0 && cache.size > 0) {
      for (const entry of cache.values()) entry.cleanup()
      cache.clear()
      curPos.clear()
      currentKeyOrder = []
      clearBetween(startMarker, tailMarker)
      return
    }

    // Step 1: collect new key set + order
    const newKeyOrder: (string | number)[] = []
    const newKeySet = new Set<string | number>()
    for (const vnode of newList) {
      const key = vnode.key
      if (key !== null && key !== undefined) {
        newKeyOrder.push(key)
        newKeySet.add(key)
      }
    }

    // Step 2: remove stale entries
    for (const [key, entry] of cache) {
      if (!newKeySet.has(key)) {
        entry.cleanup()
        entry.anchor.parentNode?.removeChild(entry.anchor)
        cache.delete(key)
        curPos.delete(key)
      }
    }

    // Step 3: mount new entries (appended before tailMarker; reorder fixes position)
    for (const vnode of newList) {
      const key = vnode.key
      if (key === null || key === undefined) continue
      if (!cache.has(key)) {
        const anchor = document.createComment("")
        _keyedAnchors.add(anchor)
        parent.insertBefore(anchor, tailMarker)
        const cleanup = mountVNode(vnode, parent, tailMarker)
        cache.set(key, { anchor, cleanup })
      }
    }

    // Step 4: reorder using inline LIS with typed arrays.
    if (currentKeyOrder.length > 0 && n > 0) {
      if (n > lisPred.length) {
        lisTails = new Int32Array(n + 16)
        lisTailIdx = new Int32Array(n + 16)
        lisPred = new Int32Array(n + 16)
        lisStay = new Uint8Array(n + 16)
      }
      lisPred.fill(-1, 0, n)
      lisStay.fill(0, 0, n)

      let lisLen = 0

      for (let i = 0; i < n; i++) {
        const key = newKeyOrder[i]
        if (key === undefined) continue
        const v = curPos.get(key) ?? -1
        if (v < 0) continue

        let lo = 0
        let hi = lisLen
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if ((lisTails[mid] ?? 0) < v) lo = mid + 1
          else hi = mid
        }
        lisTails[lo] = v
        lisTailIdx[lo] = i
        if (lo > 0) lisPred[i] = lisTailIdx[lo - 1] ?? -1
        if (lo === lisLen) lisLen++
      }

      let cur: number = lisLen > 0 ? (lisTailIdx[lisLen - 1] ?? -1) : -1
      while (cur !== -1) {
        lisStay[cur] = 1
        cur = lisPred[cur] ?? -1
      }

      let cursor: Node = tailMarker
      for (let i = n - 1; i >= 0; i--) {
        const key = newKeyOrder[i]
        if (key === undefined) continue
        const entry = cache.get(key)
        if (!entry) continue
        if (!lisStay[i]) moveEntryBefore(parent, entry.anchor, cursor)
        cursor = entry.anchor
      }
    }

    curPos.clear()
    for (let i = 0; i < newKeyOrder.length; i++) {
      const k = newKeyOrder[i]
      if (k !== undefined) curPos.set(k, i)
    }
    currentKeyOrder = newKeyOrder
  })

  return () => {
    e.dispose()
    for (const entry of cache.values()) {
      entry.cleanup()
      entry.anchor.parentNode?.removeChild(entry.anchor)
    }
    cache.clear()
    startMarker.parentNode?.removeChild(startMarker)
    tailMarker.parentNode?.removeChild(tailMarker)
  }
}

// ─── For — source-aware keyed reconciler ─────────────────────────────────────

/** Maximum number of displaced positions before falling back to full LIS. */
const SMALL_K = 8

// WeakSet to identify anchor nodes belonging to mountFor entries.
const _forAnchors = new WeakSet<Node>()

/**
 * Keyed reconciler that works directly on the source item array.
 *
 * Optimizations:
 *  - Calls renderItem() only for NEW keys — 0 VNode allocations for reorders
 *  - Small-k fast path: if ≤ SMALL_K positions changed, skips LIS
 *  - Fast clear path: moves nodes to DocumentFragment for O(n) bulk detach
 *  - Fresh render fast path: skips stale-check and reorder on first render
 */
export function mountFor<T>(
  source: () => T[],
  getKey: (item: T) => string | number,
  renderItem: (item: T) => VNode | NativeItem,
  parent: Node,
  anchor: Node | null,
  mountChild: MountFn,
): Cleanup {
  const startMarker = document.createComment("")
  const tailMarker = document.createComment("")
  parent.insertBefore(startMarker, anchor)
  parent.insertBefore(tailMarker, anchor)

  // anchor is the first DOM node of the entry (element for normal vnodes, comment fallback for empty).
  // Using the element itself saves 1 createComment + 1 DOM node per entry.
  // pos is merged here (instead of a separate Map) to halve Map operations.
  // cleanup is null when the entry has no teardown work (saves function call overhead on clear).
  interface ForEntry {
    anchor: Node
    cleanup: Cleanup | null
    pos: number
  }
  let cache = new Map<string | number, ForEntry>()
  let currentKeys: (string | number)[] = []
  let cleanupCount = 0 // track entries with non-null cleanup to skip iteration when 0
  let anchorsRegistered = false // lazy _forAnchors population — only needed for reorder

  let lisTails = new Int32Array(16)
  let lisTailIdx = new Int32Array(16)
  let lisPred = new Int32Array(16)
  let lisStay = new Uint8Array(16)

  const e = effect(() => {
    // Use startMarker.parentNode as the live parent so that if this For was
    // initially mounted into a DocumentFragment (by a parent For/component),
    // subsequent re-runs after fragment insertion see the real DOM parent.
    const liveParent = startMarker.parentNode as Node
    const items = source()
    const n = items.length

    // ── Fast clear path ───────────────────────────────────────────────────
    if (n === 0) {
      if (cache.size > 0) {
        if (cleanupCount > 0) {
          for (const entry of cache.values()) if (entry.cleanup) entry.cleanup()
        }
        const parentParent = liveParent.parentNode
        // Parent-swap: clone empty parent, move markers into it, replace in one shot.
        // This is O(1) DOM ops regardless of how many children existed — the old parent
        // with all its children is detached wholesale instead of removing nodes one by one.
        if (
          parentParent &&
          liveParent.firstChild === startMarker &&
          liveParent.lastChild === tailMarker
        ) {
          const fresh = liveParent.cloneNode(false) as Node
          fresh.appendChild(startMarker)
          fresh.appendChild(tailMarker)
          parentParent.replaceChild(fresh, liveParent)
        } else {
          clearBetween(startMarker, tailMarker)
        }
        cache = new Map()
        cleanupCount = 0
        currentKeys = []
      }
      return
    }

    // ── Fresh render fast path (initial mount) ────────────────────────────
    // Compute keys inline — avoids a separate O(n) loop to build newKeys array.
    // Use DocumentFragment: all entries built off-screen, then inserted in one DOM op.
    if (currentKeys.length === 0) {
      const frag = document.createDocumentFragment()
      const keys = new Array<string | number>(n)
      for (let i = 0; i < n; i++) {
        const item = items[i] as T
        const key = getKey(item)
        keys[i] = key
        const result = renderItem(item)
        if ((result as NativeItem).__isNative) {
          const { el, cleanup } = result as NativeItem
          frag.appendChild(el)
          cache.set(key, { anchor: el, cleanup, pos: i })
          if (cleanup) cleanupCount++
        } else {
          const priorLast = frag.lastChild
          const cleanup = mountChild(result as VNode, frag as Node, null)
          cleanupCount++
          const firstMounted = priorLast ? priorLast.nextSibling : frag.firstChild
          if (firstMounted) {
            cache.set(key, { anchor: firstMounted, cleanup, pos: i })
          } else {
            const ph = document.createComment("")
            frag.appendChild(ph)
            cache.set(key, { anchor: ph, cleanup, pos: i })
          }
        }
      }
      liveParent.insertBefore(frag, tailMarker)
      anchorsRegistered = false
      currentKeys = keys
      return
    }

    // ── Step 1: collect new key order ─────────────────────────────────────
    const newKeys = new Array<string | number>(n)
    for (let i = 0; i < n; i++) {
      newKeys[i] = getKey(items[i] as T)
    }

    // ── Replace-all fast path ─────────────────────────────────────────────
    // Check if any current entry survives by scanning new keys against cache.
    // Uses Map.has (O(1)) per key — avoids O(n) Set construction for replace-all.
    let anyKept = false
    for (let i = 0; i < n; i++) {
      if (cache.has(newKeys[i] as string | number)) {
        anyKept = true
        break
      }
    }

    if (!anyKept) {
      if (cleanupCount > 0) {
        for (const entry of cache.values()) if (entry.cleanup) entry.cleanup()
      }
      cache = new Map()
      cleanupCount = 0

      const parentParent = liveParent.parentNode
      const canSwap =
        parentParent && liveParent.firstChild === startMarker && liveParent.lastChild === tailMarker

      // Build all new entries into a fragment
      const frag = document.createDocumentFragment()
      for (let i = 0; i < n; i++) {
        const key = newKeys[i] as string | number
        const result = renderItem(items[i] as T)
        if ((result as NativeItem).__isNative) {
          const { el, cleanup } = result as NativeItem
          frag.appendChild(el)
          cache.set(key, { anchor: el, cleanup, pos: i })
          if (cleanup) cleanupCount++
        } else {
          const priorLast = frag.lastChild
          const cleanup = mountChild(result as VNode, frag as Node, null)
          cleanupCount++
          const firstMounted = priorLast ? priorLast.nextSibling : frag.firstChild
          if (firstMounted) {
            cache.set(key, { anchor: firstMounted, cleanup, pos: i })
          } else {
            const ph = document.createComment("")
            frag.appendChild(ph)
            cache.set(key, { anchor: ph, cleanup, pos: i })
          }
        }
      }
      anchorsRegistered = false

      // Parent-swap: clone empty parent, insert startMarker + new content + tailMarker,
      // then replace old parent in one shot. Old parent with all stale children is detached
      // wholesale — O(1) instead of O(n) individual node removals.
      if (canSwap) {
        const fresh = liveParent.cloneNode(false) as Node
        fresh.appendChild(startMarker)
        fresh.appendChild(frag)
        fresh.appendChild(tailMarker)
        parentParent.replaceChild(fresh, liveParent)
      } else {
        clearBetween(startMarker, tailMarker)
        liveParent.insertBefore(frag, tailMarker)
      }
      currentKeys = newKeys
      return
    }

    // ── Step 2: remove stale entries ─────────────────────────────────────
    // Build newKeySet lazily — only when some entries are kept (skipped on replace-all)
    const newKeySet = new Set<string | number>(newKeys)
    for (const [key, entry] of cache) {
      if (!newKeySet.has(key)) {
        if (entry.cleanup) {
          entry.cleanup()
          cleanupCount--
        }
        entry.anchor.parentNode?.removeChild(entry.anchor)
        cache.delete(key)
      }
    }

    // ── Step 3: mount new entries ─────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const key = newKeys[i] as string | number
      if (!cache.has(key)) {
        const result = renderItem(items[i] as T)
        if ((result as NativeItem).__isNative) {
          const { el, cleanup } = result as NativeItem
          liveParent.insertBefore(el, tailMarker)
          _forAnchors.add(el)
          cache.set(key, { anchor: el, cleanup, pos: i })
          if (cleanup) cleanupCount++
        } else {
          const priorLast = tailMarker.previousSibling
          const cleanup = mountChild(result as VNode, liveParent, tailMarker)
          cleanupCount++
          const candidate = priorLast ? priorLast.nextSibling : liveParent.firstChild
          const firstMounted = candidate !== tailMarker ? candidate : null
          if (firstMounted) {
            _forAnchors.add(firstMounted)
            cache.set(key, { anchor: firstMounted, cleanup, pos: i })
          } else {
            const ph = document.createComment("")
            _forAnchors.add(ph)
            liveParent.insertBefore(ph, tailMarker)
            cache.set(key, { anchor: ph, cleanup, pos: i })
          }
        }
      }
    }

    // ── Step 4: reorder ───────────────────────────────────────────────────
    // Lazy anchor registration — only needed when moveEntryBefore runs
    if (!anchorsRegistered) {
      for (const entry of cache.values()) _forAnchors.add(entry.anchor)
      anchorsRegistered = true
    }
    if (n === currentKeys.length) {
      const diffs: number[] = []
      let exceeded = false
      for (let i = 0; i < n; i++) {
        if (newKeys[i] !== currentKeys[i]) {
          diffs.push(i)
          if (diffs.length > SMALL_K) {
            exceeded = true
            break
          }
        }
      }

      if (!exceeded) {
        if (diffs.length > 0) smallKPlace(liveParent, diffs, newKeys, cache, tailMarker)
        for (const i of diffs) {
          const k = newKeys[i]
          if (k !== undefined) {
            const entry = cache.get(k)
            if (entry) entry.pos = i
          }
        }
        currentKeys = newKeys
        return
      }
    }

    // ── LIS fallback ──────────────────────────────────────────────────────
    if (n > lisPred.length) {
      lisTails = new Int32Array(n + 16)
      lisTailIdx = new Int32Array(n + 16)
      lisPred = new Int32Array(n + 16)
      lisStay = new Uint8Array(n + 16)
    }
    lisPred.fill(-1, 0, n)
    lisStay.fill(0, 0, n)

    let lisLen = 0
    for (let i = 0; i < n; i++) {
      const key = newKeys[i]
      if (key === undefined) continue
      const v = cache.get(key)?.pos ?? -1
      if (v < 0) continue
      let lo = 0
      let hi = lisLen
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if ((lisTails[mid] ?? 0) < v) lo = mid + 1
        else hi = mid
      }
      lisTails[lo] = v
      lisTailIdx[lo] = i
      if (lo > 0) lisPred[i] = lisTailIdx[lo - 1] ?? -1
      if (lo === lisLen) lisLen++
    }

    let cur: number = lisLen > 0 ? (lisTailIdx[lisLen - 1] ?? -1) : -1
    while (cur !== -1) {
      lisStay[cur] = 1
      cur = lisPred[cur] ?? -1
    }

    let cursor: Node = tailMarker
    for (let i = n - 1; i >= 0; i--) {
      const key = newKeys[i]
      if (key === undefined) continue
      const entry = cache.get(key)
      if (!entry) continue
      if (!lisStay[i]) moveEntryBefore(liveParent, entry.anchor, cursor)
      cursor = entry.anchor
    }

    // Update pos for all entries
    for (let i = 0; i < n; i++) {
      const k = newKeys[i]
      if (k !== undefined) {
        const entry = cache.get(k)
        if (entry) entry.pos = i
      }
    }
    currentKeys = newKeys
  })

  return () => {
    e.dispose()
    for (const entry of cache.values()) {
      if (cleanupCount > 0 && entry.cleanup) entry.cleanup()
      entry.anchor.parentNode?.removeChild(entry.anchor)
    }
    cache = new Map()
    cleanupCount = 0
    startMarker.parentNode?.removeChild(startMarker)
    tailMarker.parentNode?.removeChild(tailMarker)
  }
}

/**
 * Small-k reorder: directly place the k displaced entries without LIS.
 */
function smallKPlace(
  parent: Node,
  diffs: number[],
  newKeys: (string | number)[],
  cache: Map<string | number, { anchor: Node; cleanup: Cleanup | null }>,
  tailMarker: Comment,
): void {
  const diffSet = new Set(diffs)
  let cursor: Node = tailMarker
  let prevDiffIdx = newKeys.length

  for (let d = diffs.length - 1; d >= 0; d--) {
    const i = diffs[d] as number

    let nextNonDiff = -1
    for (let j = i + 1; j < prevDiffIdx; j++) {
      if (!diffSet.has(j)) {
        nextNonDiff = j
        break
      }
    }

    if (nextNonDiff >= 0) {
      const nk = newKeys[nextNonDiff]
      const nc = nk !== undefined ? cache.get(nk)?.anchor : undefined
      if (nc) cursor = nc
    }

    const key = newKeys[i]
    if (key !== undefined) {
      const entry = cache.get(key)
      if (entry) {
        moveEntryBefore(parent, entry.anchor, cursor)
        cursor = entry.anchor
      }
    }
    prevDiffIdx = i
  }
}

/**
 * Move startNode and all siblings belonging to this entry to just before `before`.
 * Stops at the next entry anchor (identified via WeakSet) or the tail marker.
 *
 * Fast path: if the next sibling is already a boundary (another entry or tail),
 * this entry is a single node — skip the toMove array entirely.
 */
function moveEntryBefore(parent: Node, startNode: Node, before: Node): void {
  const next = startNode.nextSibling
  // Single-node fast path (covers all createTemplate rows — the common case)
  if (
    !next ||
    next === before ||
    (next.parentNode === parent && (_forAnchors.has(next) || _keyedAnchors.has(next)))
  ) {
    parent.insertBefore(startNode, before)
    return
  }
  // Multi-node slow path (fragments, components with multiple root nodes)
  const toMove: Node[] = [startNode]
  let cur: Node | null = next
  while (cur && cur !== before) {
    const nextNode: Node | null = cur.nextSibling
    toMove.push(cur)
    cur = nextNode
    if (
      cur &&
      cur.parentNode === parent &&
      (cur === before || _forAnchors.has(cur) || _keyedAnchors.has(cur))
    )
      break
  }
  for (const node of toMove) {
    parent.insertBefore(node, before)
  }
}
