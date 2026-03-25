import type { VNode, VNodeChild } from "@pyreon/core"

type MountFn = (child: VNodeChild, parent: Node, anchor: Node | null) => Cleanup

import { effect, runUntracked } from "@pyreon/reactivity"

const __DEV__ = typeof process !== "undefined" && process.env.NODE_ENV !== "production"

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
  mount: (child: VNodeChild, p: Node, a: Node | null) => Cleanup,
): Cleanup {
  const marker = document.createComment("pyreon")
  parent.insertBefore(marker, anchor)

  let currentCleanup: Cleanup = () => {
    /* noop */
  }
  let generation = 0

  const e = effect(() => {
    const myGen = ++generation
    // Run cleanup outside tracking context — cleanup may write to signals
    // (e.g. onUnmount hooks), and those writes must not accidentally register
    // as dependencies of this effect, which would cause infinite recursion.
    runUntracked(() => currentCleanup())
    currentCleanup = () => {
      /* noop */
    }
    const value = accessor()
    if (__DEV__ && typeof value === "function") {
      console.warn(
        "[Pyreon] Reactive accessor returned a function instead of a value. Did you forget to call the signal?",
      )
    }
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

/** LIS-based reorder state — shared across keyed list instances, grown as needed */
interface LisState {
  tails: Int32Array
  tailIdx: Int32Array
  pred: Int32Array
  stay: Uint8Array
}

function growLisArrays(lis: LisState, n: number): LisState {
  if (n <= lis.pred.length) return lis
  return {
    tails: new Int32Array(n + 16),
    tailIdx: new Int32Array(n + 16),
    pred: new Int32Array(n + 16),
    stay: new Uint8Array(n + 16),
  }
}

function computeKeyedLis(
  lis: LisState,
  n: number,
  newKeyOrder: (string | number)[],
  curPos: Map<string | number, number>,
): number {
  const { tails, tailIdx, pred } = lis
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
      if ((tails[mid] as number) < v) lo = mid + 1
      else hi = mid
    }
    tails[lo] = v
    tailIdx[lo] = i
    if (lo > 0) pred[i] = tailIdx[lo - 1] as number
    if (lo === lisLen) lisLen++
  }
  return lisLen
}

function markStayingEntries(lis: LisState, lisLen: number): void {
  const { tailIdx, pred, stay } = lis
  let cur: number = lisLen > 0 ? (tailIdx[lisLen - 1] as number) : -1
  while (cur !== -1) {
    stay[cur] = 1
    cur = pred[cur] as number
  }
}

function applyKeyedMoves(
  n: number,
  newKeyOrder: (string | number)[],
  stay: Uint8Array,
  cache: Map<string | number, KeyedEntry>,
  parent: Node,
  tailMarker: Comment,
): void {
  let cursor: Node = tailMarker
  for (let i = n - 1; i >= 0; i--) {
    const key = newKeyOrder[i]
    if (key === undefined) continue
    const entry = cache.get(key)
    if (!entry) continue
    if (!stay[i]) moveEntryBefore(parent, entry.anchor, cursor)
    cursor = entry.anchor
  }
}

/** Grow LIS typed arrays if needed, then compute and apply reorder. */
function keyedListReorder(
  lis: LisState,
  n: number,
  newKeyOrder: (string | number)[],
  curPos: Map<string | number, number>,
  cache: Map<string | number, KeyedEntry>,
  parent: Node,
  tailMarker: Comment,
): LisState {
  const grown = growLisArrays(lis, n)
  grown.pred.fill(-1, 0, n)
  grown.stay.fill(0, 0, n)

  const lisLen = computeKeyedLis(grown, n, newKeyOrder, curPos)
  markStayingEntries(grown, lisLen)
  applyKeyedMoves(n, newKeyOrder, grown.stay, cache, parent, tailMarker)

  return grown
}

export function mountKeyedList(
  accessor: () => VNode[],
  parent: Node,
  listAnchor: Node | null,
  mountVNode: (vnode: VNode, p: Node, a: Node | null) => Cleanup,
): Cleanup {
  const startMarker = document.createComment("")
  const tailMarker = document.createComment("")
  parent.insertBefore(startMarker, listAnchor)
  parent.insertBefore(tailMarker, listAnchor)

  const cache = new Map<string | number, KeyedEntry>()
  const curPos = new Map<string | number, number>()
  let currentKeyOrder: (string | number)[] = []

  let lis: LisState = {
    tails: new Int32Array(16),
    tailIdx: new Int32Array(16),
    pred: new Int32Array(16),
    stay: new Uint8Array(16),
  }

  const collectKeyOrder = (
    newList: VNode[],
  ): { newKeyOrder: (string | number)[]; newKeySet: Set<string | number> } => {
    const newKeyOrder: (string | number)[] = []
    const newKeySet = new Set<string | number>()
    for (const vnode of newList) {
      const key = vnode.key
      if (key !== null && key !== undefined) {
        newKeyOrder.push(key)
        newKeySet.add(key)
      }
    }
    return { newKeyOrder, newKeySet }
  }

  const removeStaleEntries = (newKeySet: Set<string | number>) => {
    for (const [key, entry] of cache) {
      if (newKeySet.has(key)) continue
      entry.cleanup()
      entry.anchor.parentNode?.removeChild(entry.anchor)
      cache.delete(key)
      curPos.delete(key)
    }
  }

  const mountNewEntries = (newList: VNode[]) => {
    for (const vnode of newList) {
      const key = vnode.key
      if (key === null || key === undefined) continue
      if (cache.has(key)) continue
      const anchor = document.createComment("")
      _keyedAnchors.add(anchor)
      parent.insertBefore(anchor, tailMarker)
      const cleanup = mountVNode(vnode, parent, tailMarker)
      cache.set(key, { anchor, cleanup })
    }
  }

  const e = effect(() => {
    const newList = accessor()
    const n = newList.length

    if (n === 0 && cache.size > 0) {
      for (const entry of cache.values()) entry.cleanup()
      cache.clear()
      curPos.clear()
      currentKeyOrder = []
      clearBetween(startMarker, tailMarker)
      return
    }

    const { newKeyOrder, newKeySet } = collectKeyOrder(newList)
    removeStaleEntries(newKeySet)
    mountNewEntries(newList)

    if (currentKeyOrder.length > 0 && n > 0) {
      lis = keyedListReorder(lis, n, newKeyOrder, curPos, cache, parent, tailMarker)
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

// anchor is the first DOM node of the entry (element for normal vnodes, comment fallback for empty).
// Using the element itself saves 1 createComment + 1 DOM node per entry.
// pos is merged here (instead of a separate Map) to halve Map operations.
// cleanup is null when the entry has no teardown work (saves function call overhead on clear).
interface ForEntry {
  anchor: Node
  cleanup: Cleanup | null
  pos: number
}

/** Try small-k reorder; returns true if handled, false if LIS fallback needed. */
function trySmallKReorder(
  n: number,
  newKeys: (string | number)[],
  currentKeys: (string | number)[],
  cache: Map<string | number, ForEntry>,
  liveParent: Node,
  tailMarker: Comment,
): boolean {
  if (n !== currentKeys.length) return false
  const diffs: number[] = []
  for (let i = 0; i < n; i++) {
    if (newKeys[i] !== currentKeys[i]) {
      diffs.push(i)
      if (diffs.length > SMALL_K) return false
    }
  }
  if (diffs.length > 0) smallKPlace(liveParent, diffs, newKeys, cache, tailMarker)
  for (const i of diffs) {
    const cached = cache.get(newKeys[i] as string | number)
    if (cached) cached.pos = i
  }
  return true
}

function computeForLis(
  lis: LisState,
  n: number,
  newKeys: (string | number)[],
  cache: Map<string | number, ForEntry>,
): number {
  const { tails, tailIdx, pred } = lis
  let lisLen = 0
  for (let i = 0; i < n; i++) {
    const key = newKeys[i] as string | number
    const v = cache.get(key)?.pos ?? 0
    let lo = 0
    let hi = lisLen
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((tails[mid] as number) < v) lo = mid + 1
      else hi = mid
    }
    tails[lo] = v
    tailIdx[lo] = i
    if (lo > 0) pred[i] = tailIdx[lo - 1] as number
    if (lo === lisLen) lisLen++
  }
  return lisLen
}

function applyForMoves(
  n: number,
  newKeys: (string | number)[],
  stay: Uint8Array,
  cache: Map<string | number, ForEntry>,
  liveParent: Node,
  tailMarker: Comment,
): void {
  let cursor: Node = tailMarker
  for (let i = n - 1; i >= 0; i--) {
    const entry = cache.get(newKeys[i] as string | number)
    if (!entry) continue
    if (!stay[i]) moveEntryBefore(liveParent, entry.anchor, cursor)
    cursor = entry.anchor
  }
}

/** LIS-based reorder for mountFor. */
function forLisReorder(
  lis: LisState,
  n: number,
  newKeys: (string | number)[],
  cache: Map<string | number, ForEntry>,
  liveParent: Node,
  tailMarker: Comment,
): LisState {
  const grown = growLisArrays(lis, n)
  grown.pred.fill(-1, 0, n)
  grown.stay.fill(0, 0, n)

  const lisLen = computeForLis(grown, n, newKeys, cache)
  markStayingEntries(grown, lisLen)
  applyForMoves(n, newKeys, grown.stay, cache, liveParent, tailMarker)

  for (let i = 0; i < n; i++) {
    const cached = cache.get(newKeys[i] as string | number)
    if (cached) cached.pos = i
  }

  return grown
}

/**
 * Keyed reconciler that works directly on the source item array.
 *
 * Optimizations:
 *  - Calls renderItem() only for NEW keys — 0 VNode allocations for reorders
 *  - Small-k fast path: if <= SMALL_K positions changed, skips LIS
 *  - Fast clear path: moves nodes to DocumentFragment for O(n) bulk detach
 *  - Fresh render fast path: skips stale-check and reorder on first render
 */
export function mountFor<T>(
  source: () => T[],
  getKey: (item: T) => string | number,
  renderItem: (item: T) => import("@pyreon/core").VNode | import("@pyreon/core").NativeItem,
  parent: Node,
  anchor: Node | null,
  mountChild: MountFn,
): Cleanup {
  const startMarker = document.createComment("")
  const tailMarker = document.createComment("")
  parent.insertBefore(startMarker, anchor)
  parent.insertBefore(tailMarker, anchor)

  let cache = new Map<string | number, ForEntry>()
  let currentKeys: (string | number)[] = []
  let cleanupCount = 0
  let anchorsRegistered = false

  let lis: LisState = {
    tails: new Int32Array(16),
    tailIdx: new Int32Array(16),
    pred: new Int32Array(16),
    stay: new Uint8Array(16),
  }

  const warnForKey = (seen: Set<string | number> | null, key: string | number) => {
    if (!__DEV__ || !seen) return
    if (key == null) {
      console.warn(
        "[Pyreon] <For> `by` function returned null/undefined. " +
          "Keys must be strings or numbers. Check your `by` prop.",
      )
    }
    if (seen.has(key)) {
      console.warn(`[Pyreon] Duplicate key "${String(key)}" in <For> list. Keys must be unique.`)
    }
    seen.add(key)
  }

  /** Render item into container, update cache+cleanupCount. No anchor registration. */
  const renderInto = (
    item: T,
    key: string | number,
    pos: number,
    container: Node,
    before: Node | null,
  ) => {
    const result = renderItem(item)
    if ((result as import("@pyreon/core").NativeItem).__isNative) {
      const native = result as import("@pyreon/core").NativeItem
      container.insertBefore(native.el, before)
      cache.set(key, { anchor: native.el, cleanup: native.cleanup, pos })
      if (native.cleanup) cleanupCount++
      return
    }
    const priorLast = before ? before.previousSibling : container.lastChild
    const cl = mountChild(result as import("@pyreon/core").VNode, container, before)
    const firstMounted = priorLast ? priorLast.nextSibling : container.firstChild
    if (!firstMounted || firstMounted === before) {
      const ph = document.createComment("")
      container.insertBefore(ph, before)
      cache.set(key, { anchor: ph, cleanup: cl, pos })
    } else {
      cache.set(key, { anchor: firstMounted, cleanup: cl, pos })
    }
    cleanupCount++
  }

  const handleFreshRender = (items: T[], n: number, liveParent: Node) => {
    const frag = document.createDocumentFragment()
    const keys = new Array<string | number>(n)
    const _seenKeys = __DEV__ ? new Set<string | number>() : null
    for (let i = 0; i < n; i++) {
      const item = items[i] as T
      const key = getKey(item)
      warnForKey(_seenKeys, key)
      keys[i] = key
      renderInto(item, key, i, frag, null)
    }
    liveParent.insertBefore(frag, tailMarker)
    anchorsRegistered = false
    currentKeys = keys
  }

  const collectNewKeys = (items: T[], n: number): (string | number)[] => {
    const newKeys = new Array<string | number>(n)
    const _seenUpdate = __DEV__ ? new Set<string | number>() : null
    for (let i = 0; i < n; i++) {
      newKeys[i] = getKey(items[i] as T)
      warnForKey(_seenUpdate, newKeys[i] as string | number)
    }
    return newKeys
  }

  const handleReplaceAll = (
    items: T[],
    n: number,
    newKeys: (string | number)[],
    liveParent: Node,
  ) => {
    if (cleanupCount > 0) {
      for (const entry of cache.values()) if (entry.cleanup) entry.cleanup()
    }
    cache = new Map()
    cleanupCount = 0

    const parentParent = liveParent.parentNode
    const canSwap =
      parentParent && liveParent.firstChild === startMarker && liveParent.lastChild === tailMarker

    const frag = document.createDocumentFragment()
    for (let i = 0; i < n; i++) {
      renderInto(items[i] as T, newKeys[i] as string | number, i, frag, null)
    }
    anchorsRegistered = false

    if (canSwap) {
      const fresh = liveParent.cloneNode(false)
      fresh.appendChild(startMarker)
      fresh.appendChild(frag)
      fresh.appendChild(tailMarker)
      parentParent.replaceChild(fresh, liveParent)
    } else {
      clearBetween(startMarker, tailMarker)
      liveParent.insertBefore(frag, tailMarker)
    }
    currentKeys = newKeys
  }

  const removeStaleForEntries = (newKeySet: Set<string | number>) => {
    for (const [key, entry] of cache) {
      if (newKeySet.has(key)) continue
      if (entry.cleanup) {
        entry.cleanup()
        cleanupCount--
      }
      entry.anchor.parentNode?.removeChild(entry.anchor)
      cache.delete(key)
    }
  }

  const mountNewForEntries = (
    items: T[],
    n: number,
    newKeys: (string | number)[],
    liveParent: Node,
  ) => {
    for (let i = 0; i < n; i++) {
      const key = newKeys[i] as string | number
      if (cache.has(key)) continue
      renderInto(items[i] as T, key, i, liveParent, tailMarker)
      const entry = cache.get(key)
      if (entry) _forAnchors.add(entry.anchor)
    }
  }

  const handleFastClear = (liveParent: Node) => {
    if (cache.size === 0) return
    if (cleanupCount > 0) {
      for (const entry of cache.values()) if (entry.cleanup) entry.cleanup()
    }
    const pp = liveParent.parentNode
    if (pp && liveParent.firstChild === startMarker && liveParent.lastChild === tailMarker) {
      const fresh = liveParent.cloneNode(false)
      fresh.appendChild(startMarker)
      fresh.appendChild(tailMarker)
      pp.replaceChild(fresh, liveParent)
    } else {
      clearBetween(startMarker, tailMarker)
    }
    cache = new Map()
    cleanupCount = 0
    currentKeys = []
  }

  const hasAnyKeptKey = (n: number, newKeys: (string | number)[]): boolean => {
    for (let i = 0; i < n; i++) {
      if (cache.has(newKeys[i] as string | number)) return true
    }
    return false
  }

  const handleIncrementalUpdate = (
    items: T[],
    n: number,
    newKeys: (string | number)[],
    liveParent: Node,
  ) => {
    removeStaleForEntries(new Set<string | number>(newKeys))
    mountNewForEntries(items, n, newKeys, liveParent)

    if (!anchorsRegistered) {
      for (const entry of cache.values()) _forAnchors.add(entry.anchor)
      anchorsRegistered = true
    }

    if (trySmallKReorder(n, newKeys, currentKeys, cache, liveParent, tailMarker)) {
      currentKeys = newKeys
      return
    }

    lis = forLisReorder(lis, n, newKeys, cache, liveParent, tailMarker)
    currentKeys = newKeys
  }

  const e = effect(() => {
    const liveParent = startMarker.parentNode
    if (!liveParent) return
    const items = source()
    const n = items.length

    if (n === 0) {
      handleFastClear(liveParent)
      return
    }

    if (currentKeys.length === 0) {
      handleFreshRender(items, n, liveParent)
      return
    }

    const newKeys = collectNewKeys(items, n)

    if (!hasAnyKeptKey(n, newKeys)) {
      handleReplaceAll(items, n, newKeys, liveParent)
      return
    }

    handleIncrementalUpdate(items, n, newKeys, liveParent)
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
      const nc = cache.get(newKeys[nextNonDiff] as string | number)?.anchor
      if (nc) cursor = nc
    }

    const entry = cache.get(newKeys[i] as string | number)
    if (!entry) {
      prevDiffIdx = i
      continue
    }
    moveEntryBefore(parent, entry.anchor, cursor)
    cursor = entry.anchor
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
