import type { VNode, VNodeChild } from '@pyreon/core'

type MountFn = (child: VNodeChild, parent: Node, anchor: Node | null) => Cleanup

/**
 * An accessor's value from a call the caller ALREADY made, plus the sources
 * that call read. `mountReactive` / `mountKeyedList` use it for their first
 * run instead of calling the accessor again: the value mounts as-is and the
 * reads are replayed into the effect's frame (`_replayReads`), which records
 * exactly the subscriptions a second call would have. Each accessor is user
 * code (a `.map`, a compat component body), so a second call at mount was a
 * second evaluation, not just a second read.
 */
export interface FirstRun<T> {
  value: T
  reads: SubscriberHost[]
  /** Effects / `onCleanup`s that call registered, re-homed into this run. */
  run: RunCapture
}

import type { EffectScope, RunCapture, SubscriberHost } from '@pyreon/reactivity'
import { _abortOwnerFrame, _closeOwnerFrame, _effectOwned, _frameReads, _openOwnerFrame, _rdDropBinding, _rdLabelBinding, _releaseRun, _replayReads, effectScope, getContextOwner, getCurrentScope, runUntracked, runWithContextOwner, setCurrentScope } from '@pyreon/reactivity'


/**
 * BULK DETACH. While a `<For>` whose parent element is removed as a unit tears
 * down, every node it would remove one at a time is about to leave the
 * document with that parent anyway. On a 1,000-row × 6-column table that was
 * ~9,000 `removeChild` calls for a subtree detached once. Inside the window
 * `detachNode` skips the removal; cleanups still run, so effects are disposed
 * and refs cleared.
 *
 * Only `mountFor` opens the window, in two places. On its own teardown, when
 * it was mounted inside a freshly built element (`_elementDepth > 0` at
 * mount) — the same contract that lets `mountChild` return a no-op remover
 * there. And on an in-place CLEAR or REPLACE-ALL while it owns every child of
 * its parent (`replaceChildren(start, tail)` follows the cleanups, so every
 * node under the parent leaves in that one call): a row holding a reactive
 * range (`{cond() ? <a/> : <b/>}` in a cell) used to pay two live
 * `removeChild` calls per row there — its branch and its marker — half the
 * on-CPU cost of clearing 1,000 such rows. A `<Portal>` inside the
 * subtree removes its own bracketed range directly, never through
 * `detachNode`, so a portaled node in a live target is still removed.
 *
 * The window is SCOPED to the detaching parent: only a node inside that
 * parent's subtree leaves with it. A row cleanup can tear down an UNRELATED
 * tree (a row's `onUnmount` disposing a separate root), and that tree's nodes
 * must still be removed — so the window records the parent rather than being
 * a module-wide on/off switch. Nested windows (an inner `<For>` torn down from
 * an outer row) save and RESTORE the outer parent, never reset it.
 */
let bulkDetachParent: Node | null = null

/** Remove `node` from its parent, unless a bulk detach makes it redundant. */
export function detachNode(node: Node): void {
  const p = node.parentNode
  if (!p || p.nodeType === 11 /* DocumentFragment — FW-3 */) return
  if (!leavesWithBulk(p)) p.removeChild(node)
}

/** Is `p` inside the parent an open bulk-detach window is about to empty? */
function leavesWithBulk(p: Node): boolean {
  const bulk = bulkDetachParent
  // A row's own root sits directly in the parent (one compare); a node deeper
  // inside a row (a reactive text inside a cell) takes the `contains` walk.
  return bulk !== null && (p === bulk || bulk.contains(p))
}

/**
 * Run every entry's cleanup. With a `bulk` parent, inside that bulk-detach
 * window (see BULK DETACH): the caller removes all of `bulk`'s children right
 * after, so the cleanups' own removals inside it are skipped. Saves and
 * RESTORES the outer window, like every window, so nested lists compose.
 */
function runEntryCleanups(cache: Map<ListKey, ForEntry>, bulk: Node | null): void {
  const prevBulk = bulkDetachParent
  if (bulk !== null) bulkDetachParent = bulk
  try {
    for (const entry of cache.values()) {
      if (entry.cleanup) {
        _emitCleanup()
        entry.cleanup()
      }
    }
  } finally {
    bulkDetachParent = prevBulk
  }
}

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

/** Same length and the same element objects, position by position. */
function sameItems(value: unknown[], snapshot: unknown[]): boolean {
  if (value.length !== snapshot.length) return false
  for (let i = 0; i < value.length; i++) if (value[i] !== snapshot[i]) return false
  return true
}

/**
 * Dev: did a structural boundary's FIRST run track nothing? Keyed by the
 * boundary's own marker comment, which exists before its effect runs, so no
 * production local is needed: the effect body records the answer on its first
 * run (`has()` is false only then — the naming step below overwrites the entry
 * with `false`, so re-runs never record again), and the code after `effect()`
 * reads it. A boundary that tracked nothing (`() => <b>static</b>`, a `<For>`
 * over a plain array) can never re-run, so its graph node is dropped instead of
 * labelled — the dead-binding rule `renderEffect` / `_bind` follow by returning
 * `_noopDispose`. Left in, it read as a binding that never fired, permanently,
 * and Reactive Coverage counted it. A WeakMap: an entry dies with its marker.
 */
const _structuralDead = /* @__PURE__ */ new WeakMap<Node, boolean>()

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
  first?: FirstRun<VNodeChild>,
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

  // The value mounted by the previous run, for the identity check below.
  // A dedicated sentinel rather than `undefined`, which is a legitimate
  // accessor result that must not read as "same as last time" on the first run.
  const NEVER_RAN: unique symbol = Symbol('pyreon.never-ran') as never
  let lastValue: unknown = NEVER_RAN
  // A copy of the array mounted last time, kept ONLY when it holds a compiled
  // template (`__isNative`). `value === lastValue` cannot tell "the same array,
  // unchanged" from "the same array, mutated in place" (`signal.trigger()`), so
  // the skip below also compares the elements against this snapshot.
  let lastItems: unknown[] | null = null

  // Owned by the cleanup returned below, not the ambient scope (`_effectOwned`).
  const e = _effectOwned(() => {
    const myGen = ++generation
    // Read the accessor FIRST: the identity check needs the value, and the
    // read is what establishes this effect's dependencies either way. A
    // caller-supplied first run stands in for the first call (see `FirstRun`).
    let value: VNodeChild
    if (first !== undefined) {
      value = first.value
      _replayReads(first.reads)
      _releaseRun(first.run)
      first = undefined
    } else value = accessor()
    if (process.env.NODE_ENV !== 'production' && !_structuralDead.has(marker))
      _structuralDead.set(marker, _frameReads()?.length === 0)

    // An accessor can re-run and produce the SAME value — `<Show when={() =>
    // sel() !== undefined}>` re-runs on every `sel` change while the verdict
    // stays `true`. Tearing down and re-mounting there is not merely wasteful,
    // it is DESTRUCTIVE for the shape the compiler now emits: a component's
    // sole child is `_lc`-memoized, so the accessor hands back the SAME `_tpl`
    // NativeItem whose DOM and bindings were built once. The teardown disposes
    // those bindings and the remount re-inserts the same element without
    // rebuilding them — one live node, permanently stale, no warning.
    //
    // Identity is the right test precisely because it is conservative: every
    // shape that builds a fresh value per run (a bare `h()` in an accessor, a
    // changed primitive, a new array) compares unequal and behaves exactly as
    // before. Only a value that is literally the one already mounted is
    // skipped, and for that one the DOM is already correct.
    // ...but identity alone is the WRONG test, because `===` cannot separate
    // "the same value, unchanged" from "the same value, mutated in place" — and
    // Pyreon ships two APIs whose entire purpose is the latter. `signal.trigger()`
    // is public and manifest-documented as "force-notifies subscribers after an
    // in-place mutation" (the Vue `triggerRef` semantic), and `createStore`'s
    // proxy cache hands back an identical reference for a nested array on every
    // read. Skipping on identity made both silently do nothing:
    //
    //   const rows = signal([<li>a</li>, <li>b</li>])   // unkeyed -> mountReactive
    //   rows.peek().push(<li>c</li>); rows.trigger()    // third row never mounted
    //
    // So gate the skip on what actually makes a re-mount destructive: a value
    // carrying construction-time DOM and bindings, i.e. a `_tpl` NativeItem. That
    // is exactly the `_lc`-memoized shape #3082 was written for — tearing one down
    // disposes bindings the re-mount does not rebuild, leaving one live, forever
    // stale node. Every other value (a VNode, an array, a primitive) is rebuilt
    // correctly by a re-mount, which is the pre-#3082 behaviour and is what
    // `trigger()` and store mutation depend on.
    // A component with SEVERAL children hands back an ARRAY of such items (a
    // multi-child `<Show>`), and the same destruction applies to every one. The
    // array is skipped only when it is the same array AND every element is the
    // same object as when it was mounted — a mutated array re-mounts as always.
    if (
      value === lastValue &&
      ((value as { __isNative?: boolean } | null)?.__isNative === true ||
        (lastItems !== null && sameItems(value as unknown[], lastItems)))
    ) {
      if (process.env.NODE_ENV !== 'production') {
        _countSink.__pyreon_count__?.('runtime.mountReactive.identitySkip')
      }
      return
    }

    // Run cleanup outside tracking context — cleanup may write to signals
    // (e.g. onUnmount hooks), and those writes must not accidentally register
    // as dependencies of this effect, which would cause infinite recursion.
    if (hasCleanup) _emitCleanup()
    runUntracked(() => currentCleanup())
    currentCleanup = () => {
      /* noop */
    }
    hasCleanup = false
    // Recorded only once the teardown has actually happened, so a throw from
    // `accessor()` above leaves the previous mount and its record intact.
    lastValue = value
    lastItems =
      Array.isArray(value) && value.some((v) => (v as { __isNative?: boolean } | null)?.__isNative === true)
        ? value.slice()
        : null
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
        // A newer run superseded this one and owns `lastValue`. Leaving our
        // stale value recorded would let a later run matching IT skip a mount
        // that never happened.
        lastValue = NEVER_RAN
      }
    }
  })
  // Dev: name this boundary's graph node; its creation site is this file.
  if (process.env.NODE_ENV !== 'production') {
    if (_structuralDead.get(marker) === true) _rdDropBinding(e)
    else _rdLabelBinding(e, 'child', parent, undefined, null)
    _structuralDead.set(marker, false)
  }

  return () => {
    e.dispose()
    if (hasCleanup) _emitCleanup()
    currentCleanup()
    // The marker goes like the content it bounds: skipped inside a bulk-detach
    // window (the whole parent is emptied right after), removed otherwise —
    // from a DocumentFragment too, unlike `detachNode`.
    const p = marker.parentNode
    if (p !== null && !leavesWithBulk(p)) p.removeChild(marker)
  }
}

// ─── Keyed list reconciler ────────────────────────────────────────────────────
/**
 * A key in a keyed list. `<For>` keys are strings or numbers (its `by`); a
 * keyless vnode in a keyed `.map()` list gets a fresh `Symbol` per run, which
 * no user key can equal (see `mountKeyedList`).
 */
type ListKey = string | number | symbol


/** LIS-based reorder state — shared across keyed list instances, grown as needed */
interface LisState {
  tails: Int32Array
  tailIdx: Int32Array
  pred: Int32Array
  stay: Uint8Array
  // Reused per-update buffer of resolved cache entries (mountFor only). Lets the
  // reorder resolve `cache.get(key)` ONCE per index instead of 3x — for a 1k swap
  // that's ~2k fewer Map hashes per update.
  entries: (ForEntry | undefined)[]
}

/**
 * The zero-capacity reorder state every keyed list starts from.
 *
 * The LIS buffers are needed only when a list REORDERS, but they used to be
 * allocated eagerly — four typed arrays per list instance. A list of lists (a
 * table row's cells, a tree level's children) mounted one inner list per row,
 * so a 1,000-row table paid 4,000 typed-array allocations that nothing ever
 * read. Every reorder path calls `growLisArrays` before touching the buffers,
 * and that returns a FRESH state whenever `n` exceeds the capacity (here 0),
 * so this shared object is never written: for `n === 0` the fills and the
 * entries loop are empty ranges.
 */
const EMPTY_LIS: LisState = {
  tails: new Int32Array(0),
  tailIdx: new Int32Array(0),
  pred: new Int32Array(0),
  stay: new Uint8Array(0),
  entries: [],
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


function markStayingEntries(lis: LisState, lisLen: number): void {
  const { tailIdx, pred, stay } = lis
  let cur: number = lisLen > 0 ? (tailIdx[lisLen - 1] as number) : -1
  while (cur !== -1) {
    stay[cur] = 1
    cur = pred[cur] as number
  }
}



/**
 * Keyed reconciler for an accessor that returns `VNode[]` whose vnodes carry a
 * `key` (a keyed `.map()` in a reactive child, a compat layer's keyed list).
 *
 * It is `<For>`'s reconciler (`mountFor`) with the vnode as the item, its `key`
 * as the key and identity as the render callback — one keyed core, not two, so
 * every fast path and every fix `<For>` gets (contiguous insert/remove,
 * small-k permutation, the LIS reorder, duplicate handling, owns-parent bulk
 * clear) applies here too. A vnode already mounted under a key is kept on
 * later runs, exactly as before: the new vnode for a cached key is not
 * re-mounted.
 *
 * A vnode WITHOUT a key has no identity, so the only correct reconciliation
 * for it is replace: it gets a fresh key on every run (a new `Symbol`, which
 * can never collide with a user key), so it is mounted anew and the previous
 * run's keyless entry is removed as stale. Keyed siblings keep their rows.
 * (Classification is pinned once the dispatcher decides — see
 * `mountAccessorChild` — so a list that later loses keys cannot hand itself
 * back to the general path. It decides on the first value that is not empty
 * or nullish, `isUndecidedChild`.)
 */
export function mountKeyedList(
  accessor: () => VNode[],
  parent: Node,
  listAnchor: Node | null,
  mountVNode: MountFn,
  first?: FirstRun<VNode[]>,
): Cleanup {
  return mountFor<VNode>(
    () => {
      let value: unknown
      if (first === undefined) value = accessor()
      else {
        // First run: the caller already called the accessor. Mount that value
        // and replay its reads into this effect's frame instead of calling
        // again (see `FirstRun`).
        const f = first
        first = undefined
        _replayReads(f.reads)
        _releaseRun(f.run)
        value = f.value
      }
      // The binding stays keyed for life, but the accessor may stop returning
      // an array (`cond() ? rows.map(…) : null`, a lone vnode, a string). Such a
      // value is a list of one item, nothing for nullish — before, `null`
      // threw inside the effect and a lone vnode rendered nothing.
      return Array.isArray(value) ? value : value == null || value === false ? [] : [value as VNode]
    },
    keyOfVNode,
    identityVNode,
    parent,
    listAnchor,
    mountVNode,
  )
}

/** Drop repeated keys in place, keeping each key's FIRST occurrence. */
function dedupeKeys(keys: ListKey[]): void {
  const seen = new Set<ListKey>()
  let w = 0
  for (let r = 0; r < keys.length; r++) {
    const key = keys[r] as ListKey
    if (seen.has(key)) continue
    seen.add(key)
    keys[w++] = key
  }
  keys.length = w
}

function keyOfVNode(vnode: VNode): ListKey {
  const key = vnode !== null && typeof vnode === 'object' ? vnode.key : null
  return key === null || key === undefined ? Symbol() : key
}

function identityVNode(vnode: VNode): VNode {
  return vnode
}

// ─── For — source-aware keyed reconciler ─────────────────────────────────────

/** Maximum number of displaced positions before falling back to full LIS. */
const SMALL_K = 8

// anchor is the entry's first DOM node (the element itself for normal vnodes,
// a comment fallback for empty) — using the element saves 1 createComment + 1
// DOM node per entry. pos is merged here rather than a separate Map to halve Map
// operations. cleanup is null when there is no teardown work. end is the entry's
// LAST DOM node, or null for the dominant single-node case — see ForEntry.end
// for the range contract.
interface ForEntry {
  anchor: Node
  cleanup: Cleanup | null
  pos: number
  end: Node | null
  /** Generation of the last update that saw this key — see `mountNewForEntries`. */
  seen: number
}

/** Try small-k reorder; returns true if handled, false if LIS fallback needed. */
function trySmallKReorder(
  n: number,
  newKeys: ListKey[],
  currentKeys: ListKey[],
  cache: Map<ListKey, ForEntry>,
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
    const cached = cache.get(newKeys[i] as ListKey)
    if (cached) cached.pos = i
  }
  return true
}

/**
 * Same-length update that only PERMUTES a few positions (the krausest `swap`
 * op): `newKeys` differs from `currentKeys` at ≤ SMALL_K indices, and the keys
 * at those indices are the same multiset before and after. Nothing is added and
 * nothing goes stale, so the cache is already exact and the update is just the
 * small-k placement. Recognizing that from the ≤k differing keys skips the
 * general path's two full `cache.has` passes in `mountNewForEntries` (2n Map
 * probes to learn that nothing was added).
 *
 * Returns `'done'` when it applied the update, `'many'` when more than SMALL_K
 * positions differ (so `trySmallKReorder` would fail too and can be skipped),
 * and `'no'` otherwise (an add or removal hides among the differences — the
 * general path handles it). Never mutates anything unless it returns `'done'`.
 */
function trySmallKPermutation(
  n: number,
  newKeys: ListKey[],
  currentKeys: ListKey[],
  cache: Map<ListKey, ForEntry>,
  liveParent: Node,
  tailMarker: Comment,
): 'done' | 'many' | 'no' {
  if (n !== currentKeys.length) return 'no'
  const diffs: number[] = []
  for (let i = 0; i < n; i++) {
    if (newKeys[i] !== currentKeys[i]) {
      diffs.push(i)
      if (diffs.length > SMALL_K) return 'many'
    }
  }
  const k = diffs.length
  // One-to-one match of the new keys at the differing positions against the old
  // keys at those positions. k ≤ SMALL_K, so the quadratic match is a handful of
  // compares. Bitmask of old positions already matched.
  let used = 0
  for (let a = 0; a < k; a++) {
    const key = newKeys[diffs[a] as number]
    let found = false
    for (let b = 0; b < k; b++) {
      if ((used & (1 << b)) === 0 && currentKeys[diffs[b] as number] === key) {
        used |= 1 << b
        found = true
        break
      }
    }
    if (!found) return 'no'
  }
  if (k > 0) smallKPlace(liveParent, diffs, newKeys, cache, tailMarker)
  for (let a = 0; a < k; a++) {
    const i = diffs[a] as number
    const cached = cache.get(newKeys[i] as ListKey)
    if (cached) cached.pos = i
  }
  return 'done'
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
  newKeys: ListKey[],
  cache: Map<ListKey, ForEntry>,
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
  for (let i = 0; i < n; i++) entries[i] = cache.get(newKeys[i] as ListKey)

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
 * `<!--pyreon-for--> bare-row… <!--k:KEY-->row… <!--/pyreon-for:KEYS-->`
 * block by
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
  source: () => readonly T[],
  getKey: (item: T) => ListKey,
  renderItem: (item: T) => import('@pyreon/core').VNode | import('@pyreon/core').NativeItem,
  parent: Node,
  anchor: Node | null,
  mountChild: MountFn,
  adoption?: ForAdoption | null,
  parentRemovesUnit = false,
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

  let cache = new Map<ListKey, ForEntry>()
  let currentKeys: ListKey[] = []
  // Allocated on the first update that removes keys — most lists never do.
  let _reusableKeySet: Set<ListKey> | null = null
  let cleanupCount = 0
  // Per-update stamp + distinct-survivor count (see `mountNewForEntries`).
  let updateGen = 0
  let keptDistinct = 0

  // Starts as the shared zero-capacity state: the first reorder's
  // `growLisArrays` allocates this list's own buffers (see EMPTY_LIS).
  let lis: LisState = EMPTY_LIS

  const warnForKey = (seen: Set<ListKey> | null, key: ListKey) => {
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
  const warnForKeyIn = (seen: Map<ListKey, ForEntry>, key: ListKey) => {
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
    key: ListKey,
    pos: number,
    container: Node,
    before: Node | null,
  ) => {
    // The row is MOUNTED inside the callback's collector window, not only
    // rendered: a keyed `.map()` reaches here with an identity callback and a
    // row that builds lazily at its mount, so mounting after the window handed
    // whatever the row's template gives the ambient scope (`ownByScope`) to the
    // component's scope on the first render — kept with the removed row until
    // the component unmounted — and to NO scope on a later run, never disposed.
    // Typed by assertion: TS does not see the callback assign them, and would
    // narrow each to `null` after it.
    let native = null as import('@pyreon/core').NativeItem | null
    let priorLast = null as Node | null
    let mounted = null as Cleanup | null
    const { scope: rowScope } = runRowCallback(() => {
      const r = renderItem(item)
      // Optional-chained: `renderItem` may legitimately return null/undefined —
      // `{(r) => r.visible ? <Row/> : null}` is how a row is conditionally
      // hidden, and the empty-entry branch below exists precisely to give such
      // a row a placeholder anchor. A bare property read on that null THREW
      // inside the <For> effect, which is not a broken row but a broken LIST:
      // the error escaped before any row was placed, so the whole list
      // rendered as its two markers and nothing else, and the throw surfaced
      // only as an unhandled effect error in the console. SSR renders the same
      // source correctly, so it was also a guaranteed hydration divergence.
      if ((r as import('@pyreon/core').NativeItem | null | undefined)?.__isNative === true) {
        native = r as import('@pyreon/core').NativeItem
        container.insertBefore(native.el, before)
      } else {
        priorLast = before ? before.previousSibling : container.lastChild
        mounted = mountChild(r as import('@pyreon/core').VNode, container, before)
      }
    })
    if (native !== null) {
      const nativeCleanup = withRowScope(rowScope, native.cleanup ?? null)
      cache.set(key, { anchor: native.el, cleanup: nativeCleanup, pos, end: null, seen: 0 })
      if (nativeCleanup) cleanupCount++
      return
    }
    const cl = withRowScope(rowScope, mounted) as Cleanup
    const firstMounted = priorLast ? priorLast.nextSibling : container.firstChild
    if (!firstMounted || firstMounted === before) {
      const ph = document.createComment('')
      container.insertBefore(ph, before)
      cache.set(key, { anchor: ph, cleanup: cl, pos, end: null, seen: 0 })
    } else {
      // Everything mounted for this entry sits in [firstMounted..lastMounted].
      const lastMounted = (before ? before.previousSibling : container.lastChild) as ChildNode
      if (lastMounted === firstMounted && firstMounted.nodeType === 1) {
        // The dominant shape: a single element. Nothing inside a row can
        // replace the row's own root element, so it is a stable anchor and the
        // range needs no end.
        cache.set(key, { anchor: firstMounted, cleanup: cl, pos, end: null, seen: 0 })
      } else {
        // Any other shape can REPLACE its own boundary nodes while mounted: a
        // reactive accessor (`() => …`, or a component returning one — the
        // documented reactive-conditional pattern) swaps its first node on
        // every re-run, and a polymorphic text binding swaps its text node for
        // a subtree. An anchor taken from the mounted content then goes stale,
        // and the next reorder moves the DETACHED old node back into the list
        // while the live content is stranded in place. So the range is
        // delimited by nodes nothing inside it can replace: a start comment,
        // plus an end comment when the row ends in a text node (every other
        // boundary a reactive region leaves is its own stable trailing marker).
        const start = document.createComment('')
        container.insertBefore(start, firstMounted)
        let end: Node = lastMounted
        if (lastMounted.nodeType === 3) {
          end = document.createComment('')
          container.insertBefore(end, before)
        }
        cache.set(key, { anchor: start, cleanup: cl, pos, end, seen: 0 })
      }
    }
    cleanupCount++
  }

  /*
   * DIRECT INSERTION (fresh render, replace-all, contiguous insert). Rows are
   * mounted straight into the live parent instead of being staged in a
   * DocumentFragment that is then moved in with one insertBefore. Staging
   * parents every row TWICE — once into the fragment, once out of it — and the
   * second move is not free: Chromium's fragment insertion re-walks and
   * re-parents each child. Measured in real Chromium on the bench row (same
   * build, arms interleaved per sample, CI95 disjoint): 1,000 rows fresh JS
   * 0.99 → 0.905 ms, replace 1.56 → 1.43 ms; 10,000 rows fresh 10.47 → 9.50
   * ms, replace 17.57 → 16.20 ms. Forced layout afterwards is unchanged.
   *
   * Trade-offs, measured or reasoned:
   *  - A MutationObserver on an ancestor now receives one record per row
   *    instead of one record holding every row. With a subtree childList
   *    observer on <body> the JS half still came out ahead (1k fresh 1.005 →
   *    0.975 ms) and the totals were CI-tied, so this is not a regression.
   *  - Rows are CONNECTED while the next row is built (they used to be
   *    connected all at once at the end). A row `ref` / custom-element
   *    `connectedCallback` therefore sees a connected node — strictly more
   *    useful — and a ref that forces layout pays per row (it used to read
   *    zero-sized boxes, which was wrong).
   *  - The owns-parent replace clears with one in-place
   *    `replaceChildren(start, tail)` first, keeping the parent's identity.
   *  - When the For itself is still inside an outer row's not-yet-attached
   *    subtree, `liveParent` is that subtree and the two shapes cost the same.
   */
  const handleFreshRender = (items: readonly T[], n: number, liveParent: Node) => {
    const keys = new Array<ListKey>(n)
    // Duplicate detection reuses `cache` instead of a second `Set`. `cache` is
    // provably EMPTY here (this path only runs when `currentKeys.length === 0`,
    // and the one site that empties `currentKeys` resets `cache` on the line
    // before), and `renderInto` writes every key into it — so `cache.has(key)`
    // is exactly the membership `seen.has(key)` tested. Saves an n-entry Set
    // allocation plus one hash op per row on the bulk-create path; duplicates
    // are still skipped, so DOM-corruption safety is unchanged.
    //
    // Rows are mounted STRAIGHT into the live parent before `tailMarker` — see
    // DIRECT INSERTION above.
    for (let i = 0; i < n; i++) {
      const item = items[i] as T
      const key = getKey(item)
      if (warnForKeyIn(cache, key)) continue // skip duplicate
      keys[i] = key
      renderInto(item, key, i, liveParent, tailMarker)
    }
    currentKeys = keys
  }

  const collectNewKeys = (items: readonly T[], n: number): ListKey[] => {
    const newKeys = new Array<ListKey>(n)
    for (let i = 0; i < n; i++) {
      newKeys[i] = getKey(items[i] as T)
    }
    // Duplicate-key detection is purely a DEV diagnostic — the update path does
    // NOT skip duplicates (first wins on cache collision). Gate it out so the hot
    // reorder path allocates zero Set. The fresh-render path keeps its
    // load-bearing dedup, which DOES skip duplicates to prevent DOM corruption.
    if (process.env.NODE_ENV !== 'production') {
      const _seenUpdate = new Set<ListKey>()
      for (let i = 0; i < n; i++) warnForKey(_seenUpdate, newKeys[i] as ListKey)
    }
    return newKeys
  }

  const handleReplaceAll = (
    items: readonly T[],
    n: number,
    newKeys: ListKey[],
    liveParent: Node,
  ) => {
    // For owns EVERY child of liveParent (markers are first+last) ⟺ wiping the
    // parent's children wipes exactly this For's block.
    const ownsParent =
      liveParent.firstChild === startMarker && liveParent.lastChild === tailMarker
    // Owns-parent: the rows leave in the one `replaceChildren` below, so
    // their cleanups' own removals are skipped (see BULK DETACH).
    if (cleanupCount > 0) runEntryCleanups(cache, ownsParent ? liveParent : null)
    cache = new Map()
    cleanupCount = 0

    // Direct insertion (see handleFreshRender): clear the old block first, then
    // mount every new row straight into the live parent. In the owns-parent
    // shape the clear is ONE native in-place `replaceChildren(start, tail)` —
    // the parent element keeps its identity (and with it delegated `__ev_*`
    // handlers, refs, observers and listeners); see handleFastClear for why a
    // cloneNode + replaceChild parent swap is NOT used. Measured against the
    // previous `replaceChildren(start, frag, tail)` shape, real Chromium,
    // 1,000 rows: replace JS 1.56 → 1.43 ms.
    if (ownsParent) {
      ;(liveParent as Element).replaceChildren(startMarker, tailMarker)
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('runtime.mountFor.replaceFast')
    } else {
      clearBetween(startMarker, tailMarker)
    }
    // Duplicates are skipped first-wins and the kept keys compacted, exactly as
    // in `handleFreshRender`: a second `renderInto` for a key would overwrite
    // the first row's cache entry and strand its DOM and cleanup.
    let w = 0
    for (let i = 0; i < n; i++) {
      const key = newKeys[i] as ListKey
      if (cache.has(key)) continue
      renderInto(items[i] as T, key, w, liveParent, tailMarker)
      newKeys[w++] = key
    }
    newKeys.length = w
    currentKeys = newKeys
  }

  const removeStaleForEntries = (newKeySet: Set<ListKey>) => {
    for (const [key, entry] of cache) {
      if (newKeySet.has(key)) continue
      if (entry.cleanup) {
        _emitCleanup()
        entry.cleanup()
        cleanupCount--
      }
      entry.anchor.parentNode?.removeChild(entry.anchor)
      entry.end?.parentNode?.removeChild(entry.end)
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
  const tryContiguousRemoval = (n: number, newKeys: ListKey[]): boolean => {
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
      const key = currentKeys[i] as ListKey
      const entry = cache.get(key)
      if (!entry) continue
      if (entry.cleanup) {
        _emitCleanup()
        entry.cleanup()
        cleanupCount--
      }
      entry.anchor.parentNode?.removeChild(entry.anchor)
      entry.end?.parentNode?.removeChild(entry.end)
      cache.delete(key)
    }

    // Refresh the shifted suffix's `pos` to its new indices `[p .. n)`. Prefix
    // entries keep their pos (unchanged index). Keeping `pos === current index`
    // means the NEXT reorder's Tier-2 LIS fast path stays contiguous.
    for (let i = p; i < n; i++) {
      const entry = cache.get(newKeys[i] as ListKey)
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
   * The run mounts straight into the live parent before the suffix's first
   * anchor (see DIRECT INSERTION).
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
    items: readonly T[],
    n: number,
    newKeys: ListKey[],
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
      const suffixEntry = cache.get(newKeys[runEnd] as ListKey)
      if (!suffixEntry) return false
      before = suffixEntry.anchor
    }

    // Mount the run `newKeys[p .. runEnd)` in place, before the suffix.
    let dup = false
    for (let i = p; i < runEnd; i++) {
      const key = newKeys[i] as ListKey
      if (cache.has(key)) {
        dup = true // duplicate — first wins, like mountNewForEntries
        continue
      }
      renderInto(items[i] as T, key, i, liveParent, before)
    }

    // Refresh the shifted suffix's pos to its new indices `[runEnd .. n)`.
    for (let i = runEnd; i < n; i++) {
      const entry = cache.get(newKeys[i] as ListKey)
      if (entry) entry.pos = i
    }
    if (dup) {
      // A run key that is already cached repeats a survivor or an earlier run
      // key. First wins: a repeat of a SUFFIX key first occurs here in the run,
      // so that row has to move up to it — the "nothing moves" premise of this
      // path is false. The pos values above follow DOM order (prefix, mounted
      // run, suffix), so the general LIS can finish the job over the
      // deduplicated order; the caller then stores that order as current.
      dedupeKeys(newKeys)
      lis = forLisReorder(lis, newKeys.length, newKeys, cache, liveParent, tailMarker)
    }
    if (process.env.NODE_ENV !== 'production')
      _countSink.__pyreon_count__?.('runtime.mountFor.insertFast')
    return true
  }

  const mountNewForEntries = (
    items: readonly T[],
    n: number,
    newKeys: ListKey[],
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
    //
    // The same pass counts the DISTINCT cached entries this update keeps, by
    // stamping each with the update's generation (`cache.get` is the same one
    // hash `cache.has` was). The caller's pure-reorder shortcut needs that
    // count: "nothing added and `cache.size === n`" also holds when a key is
    // DUPLICATED and another removed (`[1,2,3] -> [2,2,1]`), and skipping the
    // stale scan there left the removed row in the DOM.
    let lastSurvivorIdx = -1
    const gen = ++updateGen
    let distinct = 0
    for (let i = 0; i < n; i++) {
      const e = cache.get(newKeys[i] as ListKey)
      if (e !== undefined) {
        lastSurvivorIdx = i
        if (e.seen !== gen) {
          e.seen = gen
          distinct++
        }
      }
    }
    keptDistinct = distinct
    const tailBase = currentKeys.length
    let added = 0
    for (let i = 0; i < n; i++) {
      const key = newKeys[i] as ListKey
      if (cache.has(key)) continue
      const pos = i > lastSurvivorIdx ? tailBase + added : -1
      renderInto(items[i] as T, key, pos, liveParent, tailMarker)
      added++
    }
    return added
  }

  const handleFastClear = (liveParent: Node) => {
    if (cache.size === 0) return
    const ownsParent =
      liveParent.firstChild === startMarker && liveParent.lastChild === tailMarker
    // Owns-parent: the rows leave in the one `replaceChildren` below, so
    // their cleanups' own removals are skipped (see BULK DETACH).
    if (cleanupCount > 0) runEntryCleanups(cache, ownsParent ? liveParent : null)
    if (ownsParent) {
      // For owns every child → ONE native remove-all + marker re-insert, IN
      // PLACE. See handleReplaceAll's ownsParent comment for the full measured
      // trade: the previous cloneNode+replaceChild swap was ~20µs/1000-rows
      // faster on-CPU but replaced the parent element, dropping its
      // expandos/refs/listeners — a silent correctness bug this branch fixes.
      ;(liveParent as Element).replaceChildren(startMarker, tailMarker)
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('runtime.mountFor.clearFast')
    } else {
      clearBetween(startMarker, tailMarker)
    }
    cache = new Map()
    cleanupCount = 0
    currentKeys = []
  }

  const hasAnyKeptKey = (n: number, newKeys: ListKey[]): boolean => {
    for (let i = 0; i < n; i++) {
      if (cache.has(newKeys[i] as ListKey)) return true
    }
    return false
  }

  const handleIncrementalUpdate = (
    items: readonly T[],
    n: number,
    newKeys: ListKey[],
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

    // Fast path: a few positions permuted, nothing added or removed (swap).
    const perm = trySmallKPermutation(n, newKeys, currentKeys, cache, liveParent, tailMarker)
    if (perm === 'done') {
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime.mountFor.permFast')
      currentKeys = newKeys
      return
    }

    // Mount new entries FIRST and count them. If nothing was added AND the
    // update KEPT every cached entry (`keptDistinct`, counted by
    // `mountNewForEntries`), it is a PURE REORDER (swap / reverse / sort) with
    // nothing stale — so skip the O(n) newKey-Set rebuild and the O(m) stale
    // scan (~17% off a 1k full-reverse). Counting distinct kept entries, not
    // comparing `cache.size` to `n`, is what keeps a duplicated key from
    // hiding a removed one.
    //
    // Mounting before removing is order-independent: new and stale keys are
    // disjoint, and `removeStaleForEntries` skips any key in the newKey Set.
    const added = mountNewForEntries(items, n, newKeys, liveParent)
    // Every distinct key is either a kept entry or a newly mounted one, so
    // fewer than `n` of them means `newKeys` repeats a key. The DOM holds each
    // key once (first wins), and every pass below addresses rows by index, so
    // they must see the same deduplicated order — the raw one moved a
    // duplicated row twice and left it at its LAST position.
    if (keptDistinct + added !== n) {
      dedupeKeys(newKeys)
      n = newKeys.length
    }
    if (added !== 0 || keptDistinct !== cache.size) {
      const keySet = (_reusableKeySet ??= new Set<ListKey>())
      keySet.clear()
      for (let i = 0; i < newKeys.length; i++) keySet.add(newKeys[i] as ListKey)
      removeStaleForEntries(keySet)
    }

    if (perm !== 'many' && trySmallKReorder(n, newKeys, currentKeys, cache, liveParent, tailMarker)) {
      currentKeys = newKeys
      return
    }

    lis = forLisReorder(lis, n, newKeys, cache, liveParent, tailMarker)
    currentKeys = newKeys
  }

  // Owned by the cleanup returned below, not the ambient scope (`_effectOwned`).
  const e = _effectOwned(() => {
    const liveParent = startMarker.parentNode
    if (!liveParent) return
    const items = source()
    if (process.env.NODE_ENV !== 'production' && !_structuralDead.has(startMarker))
      _structuralDead.set(startMarker, _frameReads()?.length === 0)
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
          // An adopted row's callback is owned exactly like a client-mounted
          // row's (`renderInto`): it runs under the row collector, and the
          // scope it fills stops with the row. adoptRows calls renderItem then
          // setEntry once per row, in that order, so the scope is handed from
          // one to the other through `adoptScope`. (adoptRows verifies every
          // key BEFORE calling renderItem, so a null result never leaves a
          // row callback run and unowned.)
          let adoptScope: EffectScope | null = null
          const keys = a.adoptRows({
            items: items as unknown[],
            n,
            getKey: getKey as (item: unknown) => string | number,
            renderItem: (item: unknown) => {
              const { result, scope } = runRowCallback(() => renderItem(item as T))
              adoptScope = scope
              return result
            },
            tailMarker,
            setEntry: (key, entryAnchor, cleanup, pos, end) => {
              const rowCleanup = withRowScope(adoptScope, cleanup)
              adoptScope = null
              cache.set(key, { anchor: entryAnchor, cleanup: rowCleanup, pos, end, seen: 0 })
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
  // Dev: name this boundary's graph node; its creation site is this file.
  if (process.env.NODE_ENV !== 'production') {
    if (_structuralDead.get(startMarker) === true) _rdDropBinding(e)
    else _rdLabelBinding(e, 'list', parent, undefined, null)
    _structuralDead.set(startMarker, false)
  }

  return () => {
    e.dispose()
    const unitParent = parentRemovesUnit ? startMarker.parentNode : null
    if (unitParent !== null) {
      // The parent element leaves the document as a unit right after this, so
      // the rows' own removals are redundant (see `detachNode`).
      if (cleanupCount > 0) runEntryCleanups(cache, unitParent)
      cache = new Map()
      cleanupCount = 0
      return
    }
    for (const entry of cache.values()) {
      if (cleanupCount > 0 && entry.cleanup) {
        _emitCleanup()
        entry.cleanup()
      }
      entry.anchor.parentNode?.removeChild(entry.anchor)
      entry.end?.parentNode?.removeChild(entry.end)
    }
    cache = new Map()
    cleanupCount = 0
    startMarker.parentNode?.removeChild(startMarker)
    tailMarker.parentNode?.removeChild(tailMarker)
  }
}

/**
 * A `<For>` row callback is a component-like body that runs outside any
 * component, so an `effect()` or `computed()` created in it had no owner: it
 * registered with whatever scope was current (none, after the surrounding
 * component's setup) and was never disposed — a removed row kept running its
 * effects, and so did every row once the list unmounted. Each row callback now
 * runs under a collector scope that the row keeps, and stops on removal, ONLY
 * when something registered with it; a row that registers nothing (no binding,
 * no effect) costs no allocation. One collector is pooled across rows.
 */
let rowCollector: EffectScope | null = null

function runRowCallback<R>(fn: () => R): { result: R; scope: EffectScope | null } {
  const prev = getCurrentScope()
  const collector = rowCollector ?? (rowCollector = effectScope())
  setCurrentScope(collector)
  // Template bindings the row builds are owned by the row's cleanup, not the
  // collector; this frame owns them only if the callback throws.
  const ownerFrame = _openOwnerFrame()
  let result: R
  try {
    result = fn()
  } catch (err) {
    _abortOwnerFrame(ownerFrame)
    // A half-filled collector must never be handed to the next row.
    collector.stop()
    rowCollector = null
    throw err
  } finally {
    setCurrentScope(prev)
  }
  _closeOwnerFrame(ownerFrame)
  if (collector._isEmpty()) return { result, scope: null }
  rowCollector = null
  return { result, scope: collector }
}

/** Chain a row scope's stop in front of the row's own cleanup. */
function withRowScope(scope: EffectScope | null, cleanup: Cleanup | null): Cleanup | null {
  if (scope === null) return cleanup
  if (cleanup === null) return () => scope.stop()
  return () => {
    scope.stop()
    cleanup()
  }
}

/**
 * Small-k reorder: directly place the k displaced entries without LIS.
 */
function smallKPlace(
  parent: Node,
  diffs: number[],
  newKeys: ListKey[],
  cache: Map<ListKey, { anchor: Node; cleanup: Cleanup | null; end: Node | null }>,
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
      const nc = cache.get(newKeys[nextNonDiff] as ListKey)?.anchor
      if (nc) cursor = nc
    }

    const entry = cache.get(newKeys[i] as ListKey)
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
 * Move an EXISTING node with the DOM's state-preserving move when the browser
 * has one (`ParentNode.moveBefore`, Chromium 133+). A plain `insertBefore`
 * removes and re-inserts: the moved subtree loses focus, restarts CSS
 * animations and transitions, reloads iframes and resets media and scroll
 * state. `moveBefore` keeps all of that, so a keyed reorder no longer disturbs
 * the rows it moves.
 *
 * It applies only to a node already connected under a connected parent in the
 * same document; anything else (a detached parent, a fragment, a DOM without
 * the method) takes `insertBefore`, as does any move the browser rejects.
 */
function moveNode(parent: Node, node: Node, before: Node | null): void {
  const move = (parent as { moveBefore?: (node: Node, child: Node | null) => void }).moveBefore
  if (move !== undefined && parent.isConnected && node.isConnected && node.ownerDocument === parent.ownerDocument) {
    try {
      move.call(parent, node, before)
      return
    } catch {
      // Rejected by the browser — fall through to the plain insert.
    }
  }
  parent.insertBefore(node, before)
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
    moveNode(parent, startNode, before)
    return
  }
  // Multi-node slow path (fragments, components with multiple root nodes):
  // move exactly [startNode..endNode]. Capturing nextSibling before each
  // insertBefore keeps the walk valid while nodes detach — no toMove array.
  let cur: Node | null = startNode
  while (cur && cur !== before) {
    const next: Node | null = cur.nextSibling
    moveNode(parent, cur, before)
    if (cur === endNode) return
    cur = next
  }
}
