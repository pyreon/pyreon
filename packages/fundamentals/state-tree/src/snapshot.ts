import type { Signal } from '@pyreon/reactivity'
import { batch } from '@pyreon/reactivity'
import { instanceMeta, isModelInstance } from './registry'
import type { SnapshotListener, Snapshot, StateShape } from './types'

// ─── getSnapshot ──────────────────────────────────────────────────────────────

/**
 * Serialize a model instance to a plain JS object (no signals, no functions).
 * Nested model instances are recursively serialized.
 *
 * @example
 * getSnapshot(counter)  // { count: 6 }
 * getSnapshot(app)      // { profile: { name: "Alice" }, title: "My App" }
 */
export function getSnapshot<TState extends StateShape>(instance: object): Snapshot<TState> {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error('[@pyreon/state-tree] getSnapshot: not a model instance')

  const out: Record<string, unknown> = {}
  for (const key of meta.stateKeys) {
    const sig = (instance as Record<string, Signal<unknown>>)[key]
    if (!sig) continue
    const val = sig.peek()
    out[key] = isModelInstance(val) ? getSnapshot(val as object) : val
  }
  return out as Snapshot<TState>
}

// ─── applySnapshot ────────────────────────────────────────────────────────────

/**
 * Restore a model instance from a plain-object snapshot.
 * All signal writes are coalesced via `batch()` for a single reactive flush.
 * Keys absent from the snapshot are left unchanged.
 *
 * @example
 * applySnapshot(counter, { count: 0 })
 */
export function applySnapshot<TState extends StateShape>(
  instance: object,
  snapshot: Partial<Snapshot<TState>>,
): void {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error('[@pyreon/state-tree] applySnapshot: not a model instance')

  // Schema mode: route through the schema-validated `patch` helper so an
  // invalid snapshot is REJECTED (the schema is the source of truth) rather
  // than written raw to signals. `patch` shallow-merges the partial onto the
  // current state and validates the result — preserving the "keys absent from
  // the snapshot are left unchanged" contract while closing the integrity hole
  // where a malformed snapshot could bypass validation. (Schema mode is flat —
  // no nested field-models — so no recursion is needed.)
  if (meta.isSchema) {
    ;(instance as { patch: (p: Record<string, unknown>) => void }).patch(
      snapshot as Record<string, unknown>,
    )
    return
  }

  batch(() => {
    for (const key of meta.stateKeys) {
      if (!(key in snapshot)) continue
      const sig = (instance as Record<string, Signal<unknown>>)[key]
      if (!sig) continue
      const val = (snapshot as Record<string, unknown>)[key]
      const current = sig.peek()
      if (isModelInstance(current)) {
        // Recurse into nested model instance
        applySnapshot(current as object, val as Record<string, unknown>)
      } else {
        sig.set(val)
      }
    }
  })
}

// ─── onSnapshot ────────────────────────────────────────────────────────────────

/**
 * Subscribe to snapshot changes. The listener fires (microtask-coalesced) with
 * the new snapshot after any STATE change — all writes in one synchronous burst
 * (a multi-field `set`/`patch`, several signal writes in one action) collapse
 * into a SINGLE emit on the next microtask (MST-like async semantics). Does NOT
 * fire on subscribe. Volatile-field changes do NOT fire it (volatile is excluded
 * from snapshots). Returns an unsubscribe function; `destroy(instance)` also
 * clears all snapshot listeners.
 *
 * @example
 * const dispose = onSnapshot(counter, (snap) => {
 *   localStorage.setItem('counter', JSON.stringify(snap))
 * })
 */
export function onSnapshot<TState extends StateShape>(
  instance: object,
  listener: SnapshotListener<TState>,
): () => void {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error('[Pyreon] state-tree onSnapshot: not a model instance')
  meta.snapshotListeners.add(listener as SnapshotListener)
  return () => {
    meta.snapshotListeners.delete(listener as SnapshotListener)
  }
}
