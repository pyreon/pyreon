import { batch as reactivityBatch } from '@pyreon/reactivity'
import { commitParams, setParamRepeated, setParams } from './url'

/**
 * Cross-hook URL-state synchronization + atomic batch writes.
 *
 * Two `useUrlState('page', 1)` calls for the SAME key are independent signals.
 * Without coordination, `a.set(5)` would write the URL but leave `b()` stale
 * (a raw `history.replaceState` does NOT emit `popstate`). This module keeps
 * every live signal for a key in sync: after any write to key K, every OTHER
 * signal bound to K re-reads from the URL and fires its `onChange`.
 *
 * It also provides `batchUrlUpdates`, which coalesces several `.set()` calls
 * into ONE history operation (one `replaceState` / `pushState` / `router.replace`).
 */

/** A signal's "re-read from URL + notify" callback. Keyed by param name. */
type ReRead = () => void

// ─── Cross-hook subscriber registry ───────────────────────────────────────────
//
// Module-level registry keyed by param name. Eviction is identity-based and
// refcounted-by-emptiness: `subscribeKey` returns an unsubscribe that removes
// the EXACT callback (Set.delete) and drops the key entry when its set empties.
// The cleanup path is tied to the owning effect scope (see use-url-state.ts) and
// is exercised by a regression test — see anti-patterns "Memory Leak Classes"
// (Class C/D: a module-level registry must have an eviction trigger + a tested
// cleanup contract).
const _subscribers = new Map<string, Set<ReRead>>()

/**
 * Register a signal's re-read callback for a param key. Returns an
 * unsubscribe that removes exactly this callback.
 */
export function subscribeKey(key: string, cb: ReRead): () => void {
  let set = _subscribers.get(key)
  if (set === undefined) {
    set = new Set()
    _subscribers.set(key, set)
  }
  set.add(cb)
  return () => {
    const s = _subscribers.get(key)
    if (s === undefined) return
    s.delete(cb)
    if (s.size === 0) _subscribers.delete(key)
  }
}

/** Notify every signal bound to `key` except the writer (`except`). */
function notifyKey(key: string, except: ReRead | undefined): void {
  const set = _subscribers.get(key)
  if (set === undefined || set.size === 0) return
  // Snapshot: a re-read could (in theory) create/dispose a sibling signal.
  for (const cb of [...set]) {
    if (cb !== except) cb()
  }
}

// ─── Atomic batch writes ──────────────────────────────────────────────────────

let _depth = 0
let _pendingSingle: Map<string, string | null> | null = null
let _pendingRepeated: Map<string, string[] | null> | null = null
let _pendingPush = false
let _pendingNotify: Array<[string, ReRead | undefined]> = []

/** True while a `batchUrlUpdates` call is running. */
export function isBatching(): boolean {
  return _depth > 0
}

/**
 * Write a single-value param — immediately, or accumulated into the current
 * batch. After the write, sibling signals for `key` re-read (excluding `self`).
 */
export function writeSingleParam(
  key: string,
  value: string | null,
  replace: boolean,
  self: ReRead | undefined,
): void {
  if (_depth > 0) {
    _pendingSingle!.set(key, value)
    if (!replace) _pendingPush = true
    _pendingNotify.push([key, self])
    return
  }
  setParams({ [key]: value }, replace)
  notifyKey(key, self)
}

/**
 * Write a repeated-array param — immediately, or accumulated into the current
 * batch. After the write, sibling signals for `key` re-read (excluding `self`).
 */
export function writeRepeatedParam(
  key: string,
  values: string[] | null,
  replace: boolean,
  self: ReRead | undefined,
): void {
  if (_depth > 0) {
    _pendingRepeated!.set(key, values)
    if (!replace) _pendingPush = true
    _pendingNotify.push([key, self])
    return
  }
  setParamRepeated(key, values, replace)
  notifyKey(key, self)
}

/**
 * Apply several URL-state writes as ONE history entry.
 *
 * Every `.set()` / `.reset()` / `.remove()` invoked inside `fn` is coalesced
 * into a single `history.replaceState` / `pushState` (or one `router.replace`).
 * The signal values still update synchronously — only the URL write is
 * deferred to the end of the batch. Signal notifications are also batched (via
 * `@pyreon/reactivity`'s `batch`), so subscribers reading several params
 * re-run once.
 *
 * Debounce is bypassed inside a batch: writes land in the batch synchronously.
 * If ANY write requested `replace: false`, the batch uses `pushState`; otherwise
 * `replaceState`.
 *
 * @example
 * ```ts
 * const { page, q } = useUrlState({ page: 1, q: '' })
 * batchUrlUpdates(() => {
 *   page.set(2)
 *   q.set('hello')
 * }) // → one replaceState with ?page=2&q=hello
 * ```
 */
export function batchUrlUpdates<T>(fn: () => T): T {
  if (_depth === 0) {
    _pendingSingle = new Map()
    _pendingRepeated = new Map()
    _pendingPush = false
    _pendingNotify = []
  }
  _depth++
  try {
    // `@pyreon/reactivity`'s `batch` returns void, so capture the fn's result.
    let result: T
    reactivityBatch(() => {
      result = fn()
    })
    return result!
  } finally {
    _depth--
    if (_depth === 0) flushBatch()
  }
}

function flushBatch(): void {
  // Non-null by construction: flushBatch only runs from `batchUrlUpdates`'s
  // `finally` at depth 0, where the pending maps were just initialized.
  const single = _pendingSingle!
  const repeated = _pendingRepeated!
  const push = _pendingPush
  const notify = _pendingNotify

  _pendingSingle = null
  _pendingRepeated = null
  _pendingPush = false
  _pendingNotify = []

  if (single.size > 0 || repeated.size > 0) {
    commitParams(single, repeated, !push)
  }
  for (const [key, self] of notify) {
    notifyKey(key, self)
  }
}
