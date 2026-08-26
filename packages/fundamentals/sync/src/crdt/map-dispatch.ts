import type { CrdtMap } from './types'

/**
 * Per-map keyed observer dispatch — ONE `CrdtMap.observe` per map, routing each
 * committed transaction's changed keys to the per-key handlers registered for
 * them.
 *
 * **Why it exists (perf, N observers → 1).** `syncedSignal` needs "fire when MY
 * key changes". Attaching one raw `map.observe` per field means a store of N
 * fields installs N engine observers on the SAME map (2N with the defaults
 * map), and every committed transaction invokes all N callbacks just so N−1 of
 * them can early-return on `changedKeys.has(key)` — O(N) filter work per write,
 * plus N engine-side handler-list entries. The dispatcher makes that one
 * observer per (doc, map) and O(changed keys) routing per transaction: iterate
 * the (usually 1-element) changed-key set, `Map.get` the handlers for each.
 *
 * **What it deliberately does NOT change (the update-loop invariant).** This is
 * pure fan-out plumbing between `CrdtMap.observe` and the per-field handlers:
 *
 * - Handlers still fire SYNCHRONOUSLY at transaction commit, exactly when the
 *   raw per-field observer fired.
 * - Handlers still fire regardless of ORIGIN — local and remote alike. Loop
 *   prevention stays where it always was: the NETWORK loop is prevented in the
 *   transport (it never re-broadcasts a `REMOTE`-origin update), and the local
 *   echo is deduped by the base signal's `Object.is` write-skip. The dispatcher
 *   never inspects origin, so it cannot introduce a gate that wasn't there.
 * - A handler is invoked only when its key is in the transaction's changed set —
 *   the exact `changedKeys.has(key)` predicate each per-field observer applied,
 *   evaluated once via key-indexed lookup instead of N times.
 *
 * **Registry + lifecycle (the per-(doc,X) pattern — see `doc-sync.ts` /
 * `yjs-awareness.ts`).** Keyed by the `CrdtMap` OBJECT in a `WeakMap`, which is
 * per-(doc, map name) identity because `CrdtDoc.getMap` is contracted to return
 * the same object for the same name. Registrations are refcounted: removing a
 * handler removes only that handler; the shared engine observer detaches when
 * the LAST handler for the map is removed (and the registry entry with it), so
 * two stores over the same doc share one observer and disposing one never
 * unhooks the other. A map whose doc is destroyed is simply collectable — the
 * `WeakMap` holds nothing alive.
 *
 * Ordering note: within one multi-key transaction, handlers run in the
 * engine's changed-key iteration order (write order for Yjs' `keysChanged`),
 * where N raw observers ran in observer-registration order. Both are
 * deterministic; no contract ever promised cross-field ordering. Handlers for
 * the SAME key run in registration order.
 */

type KeyHandler = () => void

interface DispatcherEntry {
  /** Per-key handler sets, insertion-ordered. */
  readonly handlers: Map<string, Set<KeyHandler>>
  /** Total registered handlers across all keys — the refcount. */
  count: number
  /** Detach the single underlying `CrdtMap.observe`. */
  readonly off: () => void
}

// One dispatcher per CrdtMap object. WeakMap so a destroyed doc's maps (and
// their handler sets) are collectable without any explicit sweep. Eviction
// trigger: last-handler removal deletes the entry eagerly; doc death collects
// the rest. Cleanup contract: refcount (identity-based removal per handler).
const dispatchers = new WeakMap<CrdtMap, DispatcherEntry>()

/**
 * Register `handler` to run whenever a committed transaction on `map` changed
 * `key`. Installs the map's single dispatcher observer on first registration.
 * Returns an idempotent unsubscribe; the LAST unsubscribe for the map detaches
 * the underlying observer.
 *
 * Registering the SAME function twice for the same key is a no-op (set
 * semantics) whose returned unsubscribe releases nothing — every real caller
 * registers a fresh closure per field.
 */
export function observeMapKey(map: CrdtMap, key: string, handler: KeyHandler): () => void {
  let entry = dispatchers.get(map)
  if (!entry) {
    const handlers = new Map<string, Set<KeyHandler>>()
    const off = map.observe((changedKeys) => {
      for (const k of changedKeys) {
        const set = handlers.get(k)
        if (!set) continue
        // Snapshot before invoking — parity with the raw-observer engines
        // (both the fake adapter's `[...observers]` and Yjs' live-array
        // forEach let a handler removed mid-dispatch still fire once), and a
        // handler that disposes a SIBLING registration mid-iteration must not
        // mutate the set we are walking.
        for (const h of [...set]) h()
      }
    })
    entry = { handlers, count: 0, off }
    dispatchers.set(map, entry)
  }

  let set = entry.handlers.get(key)
  if (!set) {
    set = new Set()
    entry.handlers.set(key, set)
  }
  if (set.has(handler)) return () => {}
  set.add(handler)
  entry.count++

  let removed = false
  return () => {
    if (removed) return
    removed = true
    set.delete(handler)
    if (set.size === 0) entry.handlers.delete(key)
    if (--entry.count === 0) {
      entry.off()
      dispatchers.delete(map)
    }
  }
}
