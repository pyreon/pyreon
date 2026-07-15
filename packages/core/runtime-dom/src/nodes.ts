import type { VNode, VNodeChild } from '@pyreon/core'

type MountFn = (child: VNodeChild, parent: Node, anchor: Node | null) => Cleanup

import { effect, getContextOwner, runUntracked, runWithContextOwner } from '@pyreon/reactivity'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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

/** Emit `runtime.cleanup` once per registered mount cleanup that actually runs. */
function _emitCleanup(): void {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.cleanup')
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.mountReactive')
  const marker = document.createComment('pyreon')
  parent.insertBefore(marker, anchor)

  // Capture the context OWNER at creation time — this reactive boundary lives
  // under the component that set it up, so its owner is the right parent for
  // any children mounted later (e.g. Show toggling on). Restoring this single
  // reference when we mount deferred children lets them resolve ancestor
  // providers via the owner chain, with no stack snapshot to dedup or leak.
  const ownerAtSetup = getContextOwner()

  let currentCleanup: Cleanup = () => {
    /* noop */
  }
  // hasCleanup gates `runtime.cleanup` so we don't count the placeholder
  // noop on the first effect run as a "cleanup invocation".
  let hasCleanup = false
  let generation = 0

  const e = effect(() => {
    const myGen = ++generation
    // Run cleanup outside tracking context — cleanup may write to signals
    // (e.g. onUnmount hooks), and those writes must not accidentally register
    // as dependencies of this effect, which would cause infinite recursion.
    if (hasCleanup) _emitCleanup()
    runUntracked(() => currentCleanup())
    currentCleanup = () => {
      /* noop */
    }
    hasCleanup = false
    const value = accessor()
    // Note: typeof value === 'function' is a VALID return from a reactive
    // accessor — it represents a nested `() => VNodeChild` accessor (the
    // conditional rendering pattern: `{() => show() ? <A /> : null}`).
    // mountChild handles function children by calling them reactively.
    // Do NOT warn on function returns — they are handled correctly at
    // runtime by mountChild's function branch (line 58 above).
    if (value != null && value !== false) {
      // Mount children UNTRACKED — signal reads during child component
      // setup (useContext, useTheme, etc.) must NOT subscribe this
      // mountReactive effect. Otherwise, any signal read during the
      // entire child tree's setup becomes a dependency, causing full
      // DOM teardown + remount on that signal's change.
      //
      // Child components set up their OWN effects for reactivity
      // (e.g. DynamicStyled's class swap effect). Those effects track
      // their own dependencies independently.
      //
      // Use the marker's LIVE parent (not the closure-captured `parent`):
      // when this mountReactive was created inside a DocumentFragment that
      // mountFor later moved into the live tree via `insertBefore(frag, ...)`,
      // the captured `parent` becomes a stale reference to the now-empty
      // fragment. The marker, in contrast, was moved with the fragment's
      // contents and `marker.parentNode` reflects the current live parent.
      // Falling back to the captured `parent` only when the marker is
      // detached (cleanup edge case) preserves prior behavior.
      const liveParent = marker.parentNode ?? parent
      const cleanup = runUntracked(() =>
        runWithContextOwner(ownerAtSetup, () => mount(value, liveParent, marker)),
      )
      // Guard: a re-entrant signal update (e.g. ErrorBoundary catching a child
      // throw) may have already re-run this effect and updated currentCleanup.
      // In that case, discard our stale cleanup rather than overwriting the one
      // set by the re-entrant run.
      if (myGen === generation) {
        currentCleanup = cleanup
        hasCleanup = true
      } else {
        _emitCleanup()
        cleanup()
      }
    }
  })

  return () => {
    e.dispose()
    if (hasCleanup) _emitCleanup()
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
  /**
   * Last DOM node of this entry's content, or null when the entry is the
   * anchor comment alone. Captured at mount; stays valid because every
   * dynamic child inserts BEFORE its own end marker, which lies inside
   * [anchor..end]. Lets `moveEntryBefore` move the exact range with no
   * module-level anchor registry (a per-row `WeakSet<Node>` registry
   * retained its grown backing table forever — V8 never shrinks it — which
   * was the entire retained-heap delta vs Solid on the 10k-row bench).
   */
  end: Node | null
}

/** LIS-based reorder state — shared across keyed list instances, grown as needed */
interface LisState {
  tails: Int32Array
  tailIdx: Int32Array
  pred: Int32Array
  stay: Uint8Array
  // Reused per-update buffer of resolved cache entries (mountFor only). Lets
  // the reorder resolve `cache.get(key)` ONCE per index instead of 3× (in
  // computeForLis, applyForMoves, and the pos-refresh loop) — for a 1k swap
  // that's ~2k fewer Map hashes per update. mountKeyedList leaves it empty.
  entries: (ForEntry | undefined)[]
}

function growLisArrays(lis: LisState, n: number): LisState {
  if (n <= lis.pred.length) return lis
  return {
    tails: new Int32Array(n + 16),
    tailIdx: new Int32Array(n + 16),
    pred: new Int32Array(n + 16),
    stay: new Uint8Array(n + 16),
    entries: new Array<ForEntry | undefined>(n + 16),
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
  let ops = 0
  for (let i = 0; i < n; i++) {
    const key = newKeyOrder[i]
    if (key === undefined) continue
    const v = curPos.get(key) ?? -1
    if (v < 0) continue

    let lo = 0
    let hi = lisLen
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      ops++
      if ((tails[mid] as number) < v) lo = mid + 1
      else hi = mid
    }
    tails[lo] = v
    tailIdx[lo] = i
    if (lo > 0) pred[i] = tailIdx[lo - 1] as number
    if (lo === lisLen) lisLen++
  }
  if (process.env.NODE_ENV !== 'production' && ops > 0)
    _countSink.__pyreon_count__?.('runtime.mountFor.lisOps', ops)
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
    if (!stay[i]) moveEntryBefore(parent, entry.anchor, entry.end, cursor)
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
  const startMarker = document.createComment('')
  const tailMarker = document.createComment('')
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
    entries: [], // grows via growLisArrays / on assignment (mountFor reorder only)
  }

  const collectKeyOrder = (newList: VNode[]): (string | number)[] => {
    const newKeyOrder: (string | number)[] = []
    for (const vnode of newList) {
      const key = vnode.key
      if (key !== null && key !== undefined) newKeyOrder.push(key)
    }
    return newKeyOrder
  }

  const removeStaleEntries = (newKeySet: Set<string | number>) => {
    for (const [key, entry] of cache) {
      if (newKeySet.has(key)) continue
      _emitCleanup()
      entry.cleanup()
      entry.anchor.parentNode?.removeChild(entry.anchor)
      cache.delete(key)
      curPos.delete(key)
    }
  }

  const mountNewEntries = (newList: VNode[], liveParent: Node): number => {
    let added = 0
    for (const vnode of newList) {
      const key = vnode.key
      if (key === null || key === undefined) continue
      if (cache.has(key)) continue
      const anchor = document.createComment('')
      liveParent.insertBefore(anchor, tailMarker)
      const cleanup = mountVNode(vnode, liveParent, tailMarker)
      // Content just mounted immediately before tailMarker — its last node is
      // tailMarker's previous sibling (or the anchor itself when empty).
      const last = tailMarker.previousSibling
      cache.set(key, { anchor, cleanup, end: last === anchor ? null : last })
      added++
    }
    return added
  }

  const e = effect(() => {
    const newList = accessor()
    const n = newList.length
    // Same untracking rationale as mountFor — see comment there. Child
    // mounts via mountVNode must not re-track on this effect's run.
    runUntracked(() => {
      // Use the marker's LIVE parent (not the closure-captured `parent`).
      // Same bug class fixed in #776 for mountReactive: when this
      // mountKeyedList was created inside a DocumentFragment that mountFor
      // later moved via `liveParent.insertBefore(frag, tailMarker)`, the
      // captured `parent` becomes a stale reference to the now-empty
      // fragment. The markers were moved with the fragment's contents
      // and their `parentNode` reflects the current live parent.
      // Fallback to the captured `parent` only when the marker is
      // detached (cleanup edge case) preserves prior behavior.
      const liveParent = tailMarker.parentNode ?? parent

      if (n === 0 && cache.size > 0) {
        for (const entry of cache.values()) {
          _emitCleanup()
          entry.cleanup()
        }
        cache.clear()
        curPos.clear()
        currentKeyOrder = []
        clearBetween(startMarker, tailMarker)
        return
      }

      const newKeyOrder = collectKeyOrder(newList)
      // Pure-reorder skip (mirrors mountFor): mount new entries FIRST + count.
      // When nothing was added AND the cache already holds exactly the keyed
      // count, it's a same-key-set reorder (swap/reverse/sort) — nothing stale —
      // so skip building the newKey Set + the O(m) stale scan entirely.
      const added = mountNewEntries(newList, liveParent)
      if (added !== 0 || cache.size !== newKeyOrder.length) {
        removeStaleEntries(new Set(newKeyOrder))
      }

      if (currentKeyOrder.length > 0 && n > 0) {
        lis = keyedListReorder(lis, n, newKeyOrder, curPos, cache, liveParent, tailMarker)
      }

      curPos.clear()
      for (let i = 0; i < newKeyOrder.length; i++) {
        const k = newKeyOrder[i]
        if (k !== undefined) curPos.set(k, i)
      }
      currentKeyOrder = newKeyOrder
    })
  })

  return () => {
    e.dispose()
    for (const entry of cache.values()) {
      _emitCleanup()
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

// anchor is the first DOM node of the entry (element for normal vnodes, comment fallback for empty).
// Using the element itself saves 1 createComment + 1 DOM node per entry.
// pos is merged here (instead of a separate Map) to halve Map operations.
// cleanup is null when the entry has no teardown work (saves function call overhead on clear).
// end is the entry's LAST DOM node, or null for the dominant single-node case
// (compiled-template rows) — see KeyedEntry.end for the range contract + the
// retained-heap rationale for why this replaced the module-level WeakSet
// anchor registry.
interface ForEntry {
  anchor: Node
  cleanup: Cleanup | null
  pos: number
  end: Node | null
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

function computeForLis(lis: LisState, n: number): number {
  const { tails, tailIdx, pred, entries } = lis
  let lisLen = 0
  let ops = 0
  // Two-tier fast path.
  //
  // Tier 1 — "extend LIS": if v > the current tail-of-tails, v becomes the
  // new tail. O(1). Covers APPEND: positions [0..N-1] are strictly
  // increasing → the whole sequence is the LIS, 0 probes.
  //
  // Tier 2 — "known slot": if v ≤ lastV but tails[v] === v already, the
  // binary-search answer is provably lo = v (strict-increase invariant
  // guarantees tails[v-1] < v, so v slots exactly at index v). O(1) too.
  // Covers PREPEND: [new N rows, old M rows] produces positions [0..N-1,
  // 0..M-1] — the second monotonic run replaces tails[0..M-1] at indices
  // N..N+M-1 with zero probes each. Before this tier, 1k prepend was ~10k
  // probes; with it, 0.
  //
  // Tier 3 — binary search fallback. Random shuffles and other mixed
  // reorders pay the standard log₂(lisLen) per index.
  //
  // Safety: the `v < lisLen && tails[v] === v` check is a strict subset of
  // "binary-search would return v", so it never produces a wrong answer on
  // shufles — it just opportunistically avoids probing when the answer
  // happens to be the index itself. No behaviour change, only fewer probes.
  let lastV = -1
  for (let i = 0; i < n; i++) {
    const v = entries[i]?.pos ?? 0
    // Sentinel skip: a NEW entry mounted this update at the tail with a survivor
    // after it in newKeys (prepend / middle insert) carries pos = -1 — it MUST
    // move to its logical slot, never STAY, so it is excluded from the LIS
    // entirely (never a tail/tailIdx/pred node). applyForMoves then threads it
    // in before its successor (its stay bit is left 0). Pure reorders (no new
    // keys) never set a negative pos → this branch never fires → byte-identical
    // LIS + probe count. See mountNewForEntries for the pos assignment.
    if (v < 0) continue
    // Tier 1: extend LIS.
    if (v > lastV) {
      tails[lisLen] = v
      tailIdx[lisLen] = i
      if (lisLen > 0) pred[i] = tailIdx[lisLen - 1] as number
      lisLen++
      lastV = v
      continue
    }
    // Tier 2: known slot for piecewise-monotonic patterns (prepend, etc.).
    let lo: number
    if (v < lisLen && (tails[v] as number) === v) {
      lo = v
    } else {
      // Tier 3: binary search.
      lo = 0
      let hi = lisLen
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        ops++
        if ((tails[mid] as number) < v) lo = mid + 1
        else hi = mid
      }
    }
    tails[lo] = v
    tailIdx[lo] = i
    if (lo > 0) pred[i] = tailIdx[lo - 1] as number
    // v ≤ lastV here, so tails can't be extended: lo < lisLen always.
  }
  if (process.env.NODE_ENV !== 'production' && ops > 0)
    _countSink.__pyreon_count__?.('runtime.mountFor.lisOps', ops)
  return lisLen
}

function applyForMoves(
  n: number,
  entries: (ForEntry | undefined)[],
  stay: Uint8Array,
  liveParent: Node,
  tailMarker: Comment,
): void {
  let cursor: Node = tailMarker
  for (let i = n - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!entry) continue
    if (!stay[i]) moveEntryBefore(liveParent, entry.anchor, entry.end, cursor)
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

  // Resolve cache entries ONCE per index — computeForLis, applyForMoves, and
  // the pos-refresh below all read them, so this replaces 3× Map.get(key) per
  // entry with 1× (a 1k swap drops ~2k key hashes per update).
  const entries = grown.entries
  for (let i = 0; i < n; i++) entries[i] = cache.get(newKeys[i] as string | number)

  const lisLen = computeForLis(grown, n)
  markStayingEntries(grown, lisLen)
  applyForMoves(n, entries, grown.stay, liveParent, tailMarker)

  for (let i = 0; i < n; i++) {
    const cached = entries[i]
    if (cached) cached.pos = i
  }

  // Release the scratch references — `entries` is per-<For> state that
  // lives as long as the component. Left populated, a large reorder
  // followed by a SHRINK (10k rows filtered to 50) leaves the stale tail
  // [newN..oldN) pinning every removed row's ForEntry → its `anchor` DOM
  // subtree + `cleanup` closure (disposers → signal subscriber links) —
  // unreclaimable for the <For>'s remaining lifetime. Later reorders only
  // overwrite [0..n), so the tail never self-heals. The typed arrays
  // (tails/pred/stay) hold plain numbers and stay as scratch capacity.
  // Class-H retention (closure-held scratch snapshot); leak-class audit
  // 2026-07.
  entries.fill(undefined, 0, n)

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
  renderItem: (item: T) => import('@pyreon/core').VNode | import('@pyreon/core').NativeItem,
  parent: Node,
  anchor: Node | null,
  mountChild: MountFn,
): Cleanup {
  const startMarker = document.createComment('')
  const tailMarker = document.createComment('')
  parent.insertBefore(startMarker, anchor)
  parent.insertBefore(tailMarker, anchor)

  let cache = new Map<string | number, ForEntry>()
  let currentKeys: (string | number)[] = []
  const _reusableKeySet = new Set<string | number>()
  let cleanupCount = 0

  let lis: LisState = {
    tails: new Int32Array(16),
    tailIdx: new Int32Array(16),
    pred: new Int32Array(16),
    stay: new Uint8Array(16),
    entries: [], // grows via growLisArrays / on assignment (mountFor reorder only)
  }

  const warnForKey = (seen: Set<string | number> | null, key: string | number) => {
    if (!seen) return
    if (process.env.NODE_ENV !== 'production' && key == null) {
      console.warn(
        '[Pyreon] <For> `by` function returned null/undefined. ' +
          'Keys must be strings or numbers. Check your `by` prop.',
      )
    }
    if (seen.has(key)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[Pyreon] Duplicate key "${String(key)}" in <For> list. Keys must be unique.`)
      }
      // In production: skip duplicate — use first occurrence only.
      // Prevents silent DOM corruption from cache key collision.
      return true
    }
    seen.add(key)
    return false
  }

  /** Render item into container, update cache+cleanupCount. */
  const renderInto = (
    item: T,
    key: string | number,
    pos: number,
    container: Node,
    before: Node | null,
  ) => {
    const result = renderItem(item)
    if ((result as import('@pyreon/core').NativeItem).__isNative) {
      const native = result as import('@pyreon/core').NativeItem
      container.insertBefore(native.el, before)
      cache.set(key, { anchor: native.el, cleanup: native.cleanup, pos, end: null })
      if (native.cleanup) cleanupCount++
      return
    }
    const priorLast = before ? before.previousSibling : container.lastChild
    const cl = mountChild(result as import('@pyreon/core').VNode, container, before)
    const firstMounted = priorLast ? priorLast.nextSibling : container.firstChild
    if (!firstMounted || firstMounted === before) {
      const ph = document.createComment('')
      container.insertBefore(ph, before)
      cache.set(key, { anchor: ph, cleanup: cl, pos, end: null })
    } else {
      // Everything mounted for this entry sits in [firstMounted..lastMounted];
      // end stays null for the dominant single-node case.
      const lastMounted = before ? before.previousSibling : container.lastChild
      cache.set(key, {
        anchor: firstMounted,
        cleanup: cl,
        pos,
        end: lastMounted && lastMounted !== firstMounted ? lastMounted : null,
      })
    }
    cleanupCount++
  }

  const handleFreshRender = (items: T[], n: number, liveParent: Node) => {
    const frag = document.createDocumentFragment()
    const keys = new Array<string | number>(n)
    const _seenKeys = new Set<string | number>()
    for (let i = 0; i < n; i++) {
      const item = items[i] as T
      const key = getKey(item)
      if (warnForKey(_seenKeys, key)) continue // skip duplicate
      keys[i] = key
      renderInto(item, key, i, frag, null)
    }
    liveParent.insertBefore(frag, tailMarker)
    currentKeys = keys
  }

  const collectNewKeys = (items: T[], n: number): (string | number)[] => {
    const newKeys = new Array<string | number>(n)
    for (let i = 0; i < n; i++) {
      newKeys[i] = getKey(items[i] as T)
    }
    // Duplicate-key detection here is purely a DEV diagnostic — the update path
    // does NOT skip duplicates (keys array must match items length; duplicate
    // keys cause cache collisions, first wins). So the per-update Set +
    // warnForKey scan is dead weight in production: gate it out so the hot
    // reorder path (swap/partial-update/replace) allocates zero Set. The
    // fresh-render path keeps its load-bearing dedup (it DOES skip duplicates
    // to prevent DOM corruption). The key loop above always runs (no uncovered
    // production-only statements); only this dev-diagnostic block is gated.
    if (process.env.NODE_ENV !== 'production') {
      const _seenUpdate = new Set<string | number>()
      for (let i = 0; i < n; i++) warnForKey(_seenUpdate, newKeys[i] as string | number)
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
      for (const entry of cache.values()) {
        if (entry.cleanup) {
          _emitCleanup()
          entry.cleanup()
        }
      }
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
        _emitCleanup()
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
  ): number => {
    // New entries are physically mounted at the tail (before tailMarker), in
    // newKeys iteration order. The subsequent LIS reorder (forLisReorder) reads
    // each entry's `pos` as its CURRENT (pre-reorder) DOM position to decide
    // which entries STAY vs. MOVE, so a new entry's recorded `pos` must not lie
    // about where it physically is. Recording the target logical index `i` made
    // a new row whose slot sat between two survivors look "already in order"
    // (its pos straddled the survivors' stale pos), so the LIS never moved it
    // off the tail — stranding it (e.g. [1,2,3,4] → [1,5,3] rendered [1,3,5]).
    //
    // Two shapes, split by whether a SURVIVOR follows the new entry in newKeys:
    //
    //  • NEW entry with a survivor after it (prepend / middle insert) MUST move
    //    off the tail to its logical slot. It gets a SENTINEL pos (-1) that
    //    `computeForLis` SKIPS, so it is never an LIS member and always falls to
    //    `applyForMoves`, which threads it in before its logical successor. This
    //    also keeps the PREPEND fast path at zero probes: the survivors form a
    //    monotone run the LIS extends, and every new row is a skipped sentinel.
    //
    //  • NEW entry in the TRAILING all-new run (append) is already at its
    //    logical position; it keeps a strictly-increasing pos ABOVE every
    //    survivor (`currentKeys.length + added`; survivors ∈ [0,
    //    currentKeys.length) by the post-update invariant that fresh/replace/
    //    reorder all set pos = logical index) so the LIS extends it as a STAY —
    //    append does ZERO moves and ZERO probes.
    //
    // `lastSurvivorIdx` is computed BEFORE any new key is added to the cache, so
    // `cache.has` cleanly separates survivors from the rows about to be mounted.
    // (Both sentinel and trailing pos are overwritten with the final logical
    // index by the reorder's pos-refresh; the small-k path ignores pos for
    // placement — it relocates via survivor anchors — so this is inert there.)
    let lastSurvivorIdx = -1
    for (let i = 0; i < n; i++) {
      if (cache.has(newKeys[i] as string | number)) lastSurvivorIdx = i
    }
    const tailBase = currentKeys.length
    let added = 0
    for (let i = 0; i < n; i++) {
      const key = newKeys[i] as string | number
      if (cache.has(key)) continue
      const pos = i > lastSurvivorIdx ? tailBase + added : -1
      renderInto(items[i] as T, key, pos, liveParent, tailMarker)
      added++
    }
    return added
  }

  const handleFastClear = (liveParent: Node) => {
    if (cache.size === 0) return
    if (cleanupCount > 0) {
      for (const entry of cache.values()) {
        if (entry.cleanup) {
          _emitCleanup()
          entry.cleanup()
        }
      }
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
    // Mount new entries FIRST and count them. If nothing was added AND the
    // cache now holds exactly `n` entries, every newKey was already cached and
    // the counts match — i.e. a PURE REORDER (same key set, new order: swap /
    // reverse / sort). There's then nothing stale to remove, so skip the O(n)
    // newKey-Set rebuild + the O(m) stale scan entirely (measured ~17% off a
    // 1k full-reverse). Only when a key was added/removed do we pay for them.
    //
    // Mounting before removing is order-independent for correctness: new and
    // stale keys are disjoint, and `removeStaleForEntries` skips any cache key
    // present in the newKey Set (which includes the just-added ones).
    const added = mountNewForEntries(items, n, newKeys, liveParent)
    if (added !== 0 || cache.size !== n) {
      _reusableKeySet.clear()
      for (let i = 0; i < newKeys.length; i++) _reusableKeySet.add(newKeys[i] as string | number)
      removeStaleForEntries(_reusableKeySet)
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
    // Child mounts (renderInto → mountChild) must NOT re-track on this
    // effect's run, mirroring mountReactive's pattern at line ~92. Without
    // this, any signal read during a child component's setup (e.g. useQuery
    // calling `new QueryObserver(client, options())` at construction time,
    // which reads any signals inside the options builder) leaks its
    // subscription up to the For effect. A flip of the unrelated signal
    // re-runs For, runCleanup() disposes ALL inner effects, and
    // handleIncrementalUpdate skips re-mount on key match — leaving the
    // subtree's inner effects gone forever. Reproduced by the
    // `<For>`-shaped test in fanout-repro.test.tsx.
    runUntracked(() => {
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
  })

  return () => {
    e.dispose()
    for (const entry of cache.values()) {
      if (cleanupCount > 0 && entry.cleanup) {
        _emitCleanup()
        entry.cleanup()
      }
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
  cache: Map<string | number, { anchor: Node; cleanup: Cleanup | null; end: Node | null }>,
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
    moveEntryBefore(parent, entry.anchor, entry.end, cursor)
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
function moveEntryBefore(parent: Node, startNode: Node, endNode: Node | null, before: Node): void {
  // Single-node fast path (covers all createTemplate rows — the common case).
  // `end === null` is the entry's own mount-time statement that its content is
  // exactly one node — no neighbor inspection, no module-level anchor registry
  // (the prior WeakSet registry retained its grown backing table forever).
  if (endNode === null) {
    parent.insertBefore(startNode, before)
    return
  }
  // Multi-node slow path (fragments, components with multiple root nodes):
  // move exactly [startNode..endNode]. Capturing nextSibling before each
  // insertBefore keeps the walk valid while nodes detach — no toMove array.
  let cur: Node | null = startNode
  while (cur && cur !== before) {
    const next: Node | null = cur.nextSibling
    parent.insertBefore(cur, before)
    if (cur === endNode) return
    cur = next
  }
}
