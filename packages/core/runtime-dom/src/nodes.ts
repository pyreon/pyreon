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

  // Capture the context OWNER at creation — this reactive boundary lives under
  // the component that set it up, so its owner is the right parent for children
  // mounted later (e.g. Show toggling on). Restoring this one reference lets them
  // resolve ancestor providers, with no stack snapshot to dedup or leak.
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
    // NOTE: `typeof value === 'function'` is a VALID accessor return — a nested
    // `() => VNodeChild` (the `{() => show() ? <A /> : null}` pattern), which
    // mountChild handles reactively. Do NOT warn on function returns.
    if (value != null && value !== false) {
      // Mount children UNTRACKED — signal reads during child component setup
      // (useContext, useTheme, …) must NOT subscribe this mountReactive effect,
      // or any such read becomes a dependency and the whole child tree tears
      // down + remounts on that signal's change. Children set up their own
      // effects and track independently.
      //
      // Use the marker's LIVE parent, not the closure-captured `parent`: if this
      // was created inside a DocumentFragment that mountFor later moved into the
      // live tree, the captured `parent` is a stale reference to the now-empty
      // fragment, while the marker moved with the content.
      const liveParent = marker.parentNode ?? parent
      const cleanup = runUntracked(() =>
        runWithContextOwner(ownerAtSetup, () => mount(value, liveParent, marker)),
      )
      // Guard: a re-entrant signal update (e.g. ErrorBoundary catching a child
      // throw) may have already re-run this effect and set currentCleanup —
      // discard our stale cleanup rather than overwriting the newer one.
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
  // Reused per-update buffer of resolved cache entries (mountFor only). Lets the
  // reorder resolve `cache.get(key)` ONCE per index instead of 3x — for a 1k swap
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

  /**
   * Pure contiguous insertion fast path — the keyed-array sibling of mountFor's
   * `tryContiguousInsertion` (same class, same proof; see the comment there).
   * When `newKeyOrder` is exactly `currentKeyOrder` with one contiguous run of
   * NEW keys inserted, mounting the run at its slot IS the whole update: no key
   * can be stale (`p + s === oldLen` proves every old key survives) and no
   * survivor moves — so the newKey-Set build + O(m) stale scan AND the O(n) LIS
   * reorder are skipped. The caller's shared tail (curPos rebuild +
   * `currentKeyOrder` assignment) still runs, so bookkeeping is untouched.
   *
   * Guards: bails when any vnode is KEYLESS (`newKeyOrder.length !== n` —
   * key↔vnode index alignment would be unsound), on non-growth, and duplicates
   * in the run are SKIPPED with the same first-wins semantics as
   * `mountNewEntries`.
   */
  const tryContiguousInsertionKeyed = (
    newList: VNode[],
    n: number,
    newKeyOrder: (string | number)[],
    liveParent: Node,
  ): boolean => {
    if (newKeyOrder.length !== n) return false // keyless vnodes — indices misalign
    const oldLen = currentKeyOrder.length
    if (n <= oldLen || oldLen === 0) return false

    let p = 0
    while (p < oldLen && currentKeyOrder[p] === newKeyOrder[p]) p++
    let s = 0
    const maxS = oldLen - p
    while (s < maxS && currentKeyOrder[oldLen - 1 - s] === newKeyOrder[n - 1 - s]) s++
    if (p + s !== oldLen) return false

    const runEnd = n - s
    let before: Node = tailMarker
    if (s > 0) {
      const suffixEntry = cache.get(newKeyOrder[runEnd] as string | number)
      if (!suffixEntry) return false
      before = suffixEntry.anchor
    }

    for (let i = p; i < runEnd; i++) {
      const key = newKeyOrder[i] as string | number
      if (cache.has(key)) continue // duplicate — first wins, like mountNewEntries
      const anchor = document.createComment('')
      liveParent.insertBefore(anchor, before)
      const cleanup = mountVNode(newList[i] as VNode, liveParent, before)
      // Content just mounted immediately before `before` — its last node is
      // `before`'s previous sibling (or the anchor itself when empty).
      const last = before.previousSibling
      cache.set(key, { anchor, cleanup, end: last === anchor ? null : last })
    }
    if (process.env.NODE_ENV !== 'production')
      _countSink.__pyreon_count__?.('runtime.mountFor.insertFast')
    return true
  }

  const e = effect(() => {
    const newList = accessor()
    const n = newList.length
    // Same untracking rationale as mountFor — see comment there. Child
    // mounts via mountVNode must not re-track on this effect's run.
    runUntracked(() => {
      // Use the marker's LIVE parent, not the closure-captured `parent`: when
      // this was created inside a DocumentFragment that mountFor later moved via
      // `insertBefore(frag, tailMarker)`, the captured `parent` is a stale
      // reference to the now-empty fragment. The markers moved with the
      // fragment's contents, so `marker.parentNode` is the live parent. Fall back
      // to `parent` only when the marker is detached (cleanup edge case).
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
      // Pure contiguous insertion (append / prepend / middle-insert with all old
      // keys surviving in order) mounts the run and skips stale scan + reorder;
      // the shared curPos/currentKeyOrder tail below still runs.
      if (!tryContiguousInsertionKeyed(newList, n, newKeyOrder, liveParent)) {
        // Pure-reorder skip (mirrors mountFor): mount new entries FIRST + count.
        // Nothing added AND the cache already holds exactly the keyed count means a
        // same-key-set reorder, so skip the newKey Set + O(m) stale scan.
        const added = mountNewEntries(newList, liveParent)
        if (added !== 0 || cache.size !== newKeyOrder.length) {
          removeStaleEntries(new Set(newKeyOrder))
        }

        if (currentKeyOrder.length > 0 && n > 0) {
          lis = keyedListReorder(lis, n, newKeyOrder, curPos, cache, liveParent, tailMarker)
        }
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

// anchor is the entry's first DOM node (the element itself for normal vnodes,
// a comment fallback for empty) — using the element saves 1 createComment + 1
// DOM node per entry. pos is merged here rather than a separate Map to halve Map
// operations. cleanup is null when there is no teardown work. end is the entry's
// LAST DOM node, or null for the dominant single-node case — see KeyedEntry.end
// for the range contract.
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
  // Three-tier search.
  //
  // Tier 1 "extend LIS" — v > current tail-of-tails, so v becomes the new tail.
  // O(1). Covers APPEND: strictly increasing positions are their own LIS.
  //
  // Tier 2 "known slot" — v <= lastV but tails[v] === v already, so the
  // binary-search answer is provably lo = v (the strict-increase invariant
  // guarantees tails[v-1] < v). O(1). Covers PREPEND, which was ~10k probes for
  // 1k rows before this tier and is now 0.
  //
  // Tier 3 — binary search. Random shuffles pay the standard log2(lisLen).
  //
  // The tier-2 check is a strict subset of "binary search would return v", so it
  // never produces a wrong answer — it only skips probing when the answer
  // happens to be the index itself.
  let lastV = -1
  for (let i = 0; i < n; i++) {
    const v = entries[i]?.pos ?? 0
    // Sentinel skip: a NEW entry mounted at the tail with a survivor after it
    // carries pos = -1 — it MUST move to its logical slot, never STAY, so it is
    // excluded from the LIS entirely and `applyForMoves` threads it in. Pure
    // reorders never set a negative pos, so this branch never fires there and
    // the LIS + probe count stay byte-identical.
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

  // Release the scratch references — `entries` is per-<For> state living as long
  // as the component. Left populated, a large reorder followed by a SHRINK (10k
  // rows filtered to 50) leaves the stale tail pinning every removed row's
  // ForEntry, its DOM subtree and its cleanup closure, unreclaimable for the
  // <For>'s lifetime — later reorders only overwrite [0..n), so it never
  // self-heals. Class-H retention. The typed arrays hold plain numbers and stay
  // as scratch capacity.
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
/**
 * SSR-block adoption context for a hydrating `<For>` — parsed from the
 * `<!--pyreon-for--> <!--k:KEY-->row… <!--/pyreon-for-->` markers by
 * hydrate.ts and handed to `mountFor` via the one-shot slot below. When the
 * client's first items align 1:1 (same keys, same order) with the SSR rows,
 * each row's vnode is HYDRATED against its existing DOM range instead of
 * being rebuilt — the SSR DOM is adopted, not thrown away. Any mismatch
 * (different/missing/extra/reordered keys, empty rows) bails to the previous
 * correctness-first swap semantics: clear the block, mount fresh.
 */
export interface ForAdoptOps {
  items: unknown[]
  n: number
  getKey: (item: unknown) => string | number
  renderItem: (item: unknown) => unknown
  tailMarker: Comment
  /** Record one adopted row as a normal ForEntry (pos === index invariant). */
  setEntry: (
    key: string | number,
    anchor: Node,
    cleanup: Cleanup | null,
    pos: number,
    end: Node | null,
  ) => void
}

export interface ForAdoption {
  startMarker: Comment
  tailMarker: Comment
  /**
   * Adopt the SSR rows (1:1 key match) — the WHOLE adoption routine (row
   * verify, compiled-template arming, plan replay, interpretive fallback,
   * anchor bookkeeping) lives on the HYDRATION side and is handed in here, so
   * mountFor carries only this dispatch and CSR bundles tree-shake all of it.
   * Returns the adopted key order, or null on ANY mismatch (caller clears the
   * SSR block and falls through to a fresh render — the swap semantics).
   */
  adoptRows: (ops: ForAdoptOps) => (string | number)[] | null
}

// One-shot synchronous handoff: hydrate.ts sets it immediately before its
// mountChild(For vnode) call; mount.ts's For branch consumes + clears it in the
// same synchronous dispatch. Never survives past a single mountFor call — not
// a registry, no cleanup contract (always cleared on read).
let _pendingForAdoption: ForAdoption | null = null
export function _setPendingForAdoption(a: ForAdoption): void {
  _pendingForAdoption = a
}
export function _takePendingForAdoption(): ForAdoption | null {
  const a = _pendingForAdoption
  _pendingForAdoption = null
  return a
}

export function mountFor<T>(
  source: () => T[],
  getKey: (item: T) => string | number,
  renderItem: (item: T) => import('@pyreon/core').VNode | import('@pyreon/core').NativeItem,
  parent: Node,
  anchor: Node | null,
  mountChild: MountFn,
  adoption?: ForAdoption | null,
): Cleanup {
  let startMarker: Comment
  let tailMarker: Comment
  if (adoption) {
    // Hydration adoption: the SSR block's own boundary comments become this
    // For's live markers — they already sit at the right positions.
    startMarker = adoption.startMarker
    tailMarker = adoption.tailMarker
  } else {
    startMarker = document.createComment('')
    tailMarker = document.createComment('')
    parent.insertBefore(startMarker, anchor)
    parent.insertBefore(tailMarker, anchor)
  }
  let pendingAdoption: ForAdoption | null = adoption ?? null

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

  /**
   * Duplicate check against an EXISTING keyed map (the fresh-render path, where
   * `cache` is both the membership set and the destination). Same warnings and
   * same skip-the-duplicate semantics as `warnForKey`, minus the `add` — the
   * caller's `renderInto` inserts the key.
   */
  const warnForKeyIn = (seen: Map<string | number, ForEntry>, key: string | number) => {
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
      return true
    }
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
    // Duplicate detection reuses `cache` instead of a second `Set`. `cache` is
    // provably EMPTY here (this path only runs when `currentKeys.length === 0`,
    // and the one site that empties `currentKeys` resets `cache` on the line
    // before), and `renderInto` writes every key into it — so `cache.has(key)`
    // is exactly the membership `seen.has(key)` tested. Saves an n-entry Set
    // allocation plus one hash op per row on the bulk-create path; duplicates
    // are still skipped, so DOM-corruption safety is unchanged.
    for (let i = 0; i < n; i++) {
      const item = items[i] as T
      const key = getKey(item)
      if (warnForKeyIn(cache, key)) continue // skip duplicate
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
    // Duplicate-key detection is purely a DEV diagnostic — the update path does
    // NOT skip duplicates (first wins on cache collision). Gate it out so the hot
    // reorder path allocates zero Set. The fresh-render path keeps its
    // load-bearing dedup, which DOES skip duplicates to prevent DOM corruption.
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

  /**
   * Fast path for a pure contiguous removal — the krausest `remove` op (delete
   * one row from a full list). Diffs `currentKeys` against `newKeys` with a
   * common-prefix + common-suffix scan (mirrors Solid's `mapArray` fast path).
   * When `newKeys` is exactly `currentKeys` with a single contiguous run
   * deleted — no adds, no reorder of survivors — the DOM already matches the
   * target once the removed rows are unmounted. That lets us skip the general
   * path's per-key `cache.has` probe (`mountNewForEntries`), the full-cache
   * `Set` build + scan (`removeStaleForEntries`), AND the O(n) all-stay LIS
   * (`forLisReorder`) entirely — replacing ~4n Map/Set operations with a cheap
   * `===` prefix/suffix scan + the O(removed) teardown that is genuinely
   * required work.
   *
   * SAFETY: only fires when `n < currentKeys.length` (a net shrink) AND the
   * prefix+suffix cover every survivor (`p + s === n`). That gate guarantees
   * (a) nothing was ADDED — every `newKeys[i]` maps to a distinct `currentKeys`
   * position — so no tail-mounted entry can carry a stale pos, and (b) the
   * survivors keep their old relative order — so no DOM moves are needed. A
   * remove-plus-reorder or remove-plus-add fails `p + s === n` and falls
   * through to the general reconciler unchanged. Keys are unique, so the
   * removed run cannot reappear in `newKeys`.
   *
   * Teardown is byte-identical to `removeStaleForEntries` (cleanup → detach
   * anchor → drop from cache + decrement `cleanupCount`) so multi-node entries
   * behave exactly as on the general path.
   */
  const tryContiguousRemoval = (n: number, newKeys: (string | number)[]): boolean => {
    const oldLen = currentKeys.length
    if (n >= oldLen) return false // not a shrink — let the general path decide

    // Longest common prefix.
    let p = 0
    while (p < n && currentKeys[p] === newKeys[p]) p++
    // Longest common suffix, not overlapping the prefix.
    let s = 0
    const maxS = n - p
    while (s < maxS && currentKeys[oldLen - 1 - s] === newKeys[n - 1 - s]) s++

    // Pure contiguous removal ⟺ prefix + suffix account for every survivor.
    if (p + s !== n) return false

    // Unmount the removed run `currentKeys[p .. oldLen - s)`.
    for (let i = p; i < oldLen - s; i++) {
      const key = currentKeys[i] as string | number
      const entry = cache.get(key)
      if (!entry) continue
      if (entry.cleanup) {
        _emitCleanup()
        entry.cleanup()
        cleanupCount--
      }
      entry.anchor.parentNode?.removeChild(entry.anchor)
      cache.delete(key)
    }

    // Refresh the shifted suffix's `pos` to its new indices `[p .. n)`. Prefix
    // entries keep their pos (unchanged index). Keeping `pos === current index`
    // means the NEXT reorder's Tier-2 LIS fast path stays contiguous.
    for (let i = p; i < n; i++) {
      const entry = cache.get(newKeys[i] as string | number)
      if (entry) entry.pos = i
    }
    if (process.env.NODE_ENV !== 'production')
      _countSink.__pyreon_count__?.('runtime.mountFor.removeFast')
    return true
  }

  /**
   * Fast path for a pure contiguous insertion — the krausest `append` op, plus
   * prepend and middle-insert. The mirror of `tryContiguousRemoval`: when
   * `newKeys` is exactly `currentKeys` with one contiguous run of NEW keys
   * inserted — no removals, no survivor reorder — the DOM already matches the
   * target once the run is mounted at its slot. That skips the general path's
   * per-key `cache.has` pre-pass over ALL n keys (`mountNewForEntries`), the
   * O(n) newKey-Set build + O(n) stale scan (`removeStaleForEntries` — nothing
   * can be stale: `p + s === oldLen` proves every old key survives), AND the
   * O(n) LIS walk — replacing ~4n Map/Set hash ops with an O(oldLen) `===`
   * prefix/suffix scan + the O(added) mount that is genuinely required work.
   * The run mounts into a DocumentFragment and lands with ONE live
   * `insertBefore` (the fresh-render pattern) instead of one per row.
   *
   * SAFETY: only fires when `n > oldLen` (a net growth) AND the prefix+suffix
   * cover every OLD key (`p + s === oldLen`). That gate guarantees (a) nothing
   * was REMOVED — every `currentKeys[i]` maps to a distinct `newKeys` position
   * — so the stale scan is provably a no-op, and (b) the survivors keep their
   * old relative order — so no DOM moves are needed. A grow-plus-remove or
   * grow-plus-reorder fails `p + s === oldLen` and falls through unchanged.
   *
   * DUPLICATE keys (a warned-invalid state): a run key already in the cache —
   * a duplicate of a survivor or an earlier run key — is SKIPPED, byte-matching
   * `mountNewForEntries`' `cache.has → continue` first-wins semantics, so the
   * invalid-input behavior stays identical to the general path (no overwrite,
   * no leaked cleanup). The skipped-stale-scan stays sound: no old key can be
   * stale regardless of duplicates.
   *
   * `pos === current index` postcondition (what the LIS fast tiers + the
   * removal fast path rely on): prefix entries keep their pos (unchanged
   * index), run entries record their logical index at `renderInto`, and the
   * shifted suffix is refreshed to `[runEnd .. n)` below — same discipline as
   * `tryContiguousRemoval`.
   */
  const tryContiguousInsertion = (
    items: T[],
    n: number,
    newKeys: (string | number)[],
    liveParent: Node,
  ): boolean => {
    const oldLen = currentKeys.length
    if (n <= oldLen || oldLen === 0) return false // not a growth — fresh/other paths own it

    // Longest common prefix over the OLD keys.
    let p = 0
    while (p < oldLen && currentKeys[p] === newKeys[p]) p++
    // Longest common suffix, not overlapping the prefix. `n > oldLen` keeps the
    // new-side index `n - 1 - s` >= p for every s < maxS, so the scans never
    // cross.
    let s = 0
    const maxS = oldLen - p
    while (s < maxS && currentKeys[oldLen - 1 - s] === newKeys[n - 1 - s]) s++

    // Pure contiguous insertion ⟺ prefix + suffix account for every old key.
    if (p + s !== oldLen) return false

    // The suffix's first entry is the DOM anchor the run mounts before. It is a
    // survivor (newKeys[runEnd] === currentKeys[p]) so the lookup can't miss;
    // bail defensively rather than corrupt if it somehow does.
    const runEnd = n - s
    let before: Node = tailMarker
    if (s > 0) {
      const suffixEntry = cache.get(newKeys[runEnd] as string | number)
      if (!suffixEntry) return false
      before = suffixEntry.anchor
    }

    // Mount the run `newKeys[p .. runEnd)` into a fragment — one live
    // insertBefore for the whole run.
    const frag = document.createDocumentFragment()
    for (let i = p; i < runEnd; i++) {
      const key = newKeys[i] as string | number
      if (cache.has(key)) continue // duplicate — first wins, like mountNewForEntries
      renderInto(items[i] as T, key, i, frag, null)
    }
    liveParent.insertBefore(frag, before)

    // Refresh the shifted suffix's pos to its new indices `[runEnd .. n)`.
    for (let i = runEnd; i < n; i++) {
      const entry = cache.get(newKeys[i] as string | number)
      if (entry) entry.pos = i
    }
    if (process.env.NODE_ENV !== 'production')
      _countSink.__pyreon_count__?.('runtime.mountFor.insertFast')
    return true
  }

  const mountNewForEntries = (
    items: T[],
    n: number,
    newKeys: (string | number)[],
    liveParent: Node,
  ): number => {
    // New entries are physically mounted at the TAIL, but the LIS reorder reads
    // each entry's `pos` as its CURRENT DOM position to decide STAY vs MOVE — so
    // a new entry's `pos` must not lie about where it physically is. Recording
    // the target logical index made a new row whose slot sat between two
    // survivors look "already in order", so the LIS never moved it off the tail
    // (e.g. [1,2,3,4] -> [1,5,3] rendered [1,3,5]).
    //
    // Two shapes, split by whether a SURVIVOR follows the new entry:
    //
    //  • Survivor after it (prepend / middle insert) → SENTINEL pos (-1), which
    //    `computeForLis` SKIPS, so it is never an LIS member and always falls to
    //    `applyForMoves` to be threaded in before its logical successor. Keeps
    //    PREPEND at zero probes: survivors form a monotone run the LIS extends.
    //
    //  • Trailing all-new run (append) → already at its logical position, so it
    //    keeps a strictly-increasing pos ABOVE every survivor and the LIS extends
    //    it as a STAY. Append does ZERO moves and ZERO probes.
    //
    // `lastSurvivorIdx` is computed BEFORE any new key enters the cache, so
    // `cache.has` cleanly separates survivors from rows about to be mounted.
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
    // Fast path: pure contiguous removal (the krausest `remove` op). A cheap
    // prefix/suffix `===` scan replaces the general path's per-key cache probe,
    // full-cache Set scan and all-stay LIS. Falls through unchanged otherwise.
    if (tryContiguousRemoval(n, newKeys)) {
      currentKeys = newKeys
      return
    }

    // Fast path: pure contiguous insertion (the krausest `append` op, plus
    // prepend / middle-insert). Disjoint with removal by the length gates
    // (n < oldLen vs n > oldLen), so same-length updates pay two O(1) checks.
    if (tryContiguousInsertion(items, n, newKeys, liveParent)) {
      currentKeys = newKeys
      return
    }

    // Mount new entries FIRST and count them. If nothing was added AND the cache
    // now holds exactly `n`, every newKey was already cached — a PURE REORDER
    // (swap / reverse / sort) with nothing stale — so skip the O(n) newKey-Set
    // rebuild and the O(m) stale scan (~17% off a 1k full-reverse).
    //
    // Mounting before removing is order-independent: new and stale keys are
    // disjoint, and `removeStaleForEntries` skips any key in the newKey Set.
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
    // Child mounts must NOT re-track on this effect's run (mirrors
    // mountReactive). Otherwise any signal read during a child component's setup
    // leaks its subscription up to the For effect: a flip of that unrelated
    // signal re-runs For, runCleanup() disposes ALL inner effects, and the
    // incremental update skips re-mount on key match — leaving the subtree's
    // inner effects gone forever. Locked by fanout-repro.test.tsx.
    runUntracked(() => {
      // Hydration adoption — first run only (one-shot). On a 1:1 key match the
      // SSR rows are adopted in place; any mismatch clears the SSR block and
      // falls through to the normal dispatch (fresh render / fast clear) — the
      // previous correctness-first swap semantics, now internal to mountFor.
      if (pendingAdoption) {
        const a = pendingAdoption
        pendingAdoption = null
        if (n > 0) {
          const keys = a.adoptRows({
            items: items as unknown[],
            n,
            getKey: getKey as (item: unknown) => string | number,
            renderItem: renderItem as (item: unknown) => unknown,
            tailMarker,
            setEntry: (key, anchor, cleanup, pos, end) => {
              cache.set(key, { anchor, cleanup, pos, end })
              cleanupCount++
            },
          })
          if (keys) {
            currentKeys = keys
            if (process.env.NODE_ENV !== 'production')
              _countSink.__pyreon_count__?.('runtime.mountFor.hydrateAdopt')
            return
          }
        }
        clearBetween(startMarker, tailMarker)
      }

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
  // Single-node fast path (covers all createTemplate rows). `end === null` is the
  // entry's own mount-time statement that its content is exactly one node — no
  // neighbor inspection, no module-level anchor registry (the prior WeakSet
  // registry retained its grown backing table forever).
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
