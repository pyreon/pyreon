import type { Signal } from '@pyreon/reactivity'
import { batch } from '@pyreon/reactivity'
import { instanceMeta, isModelInstance } from './registry'
import type { SnapshotListener, Snapshot, StateShape } from './types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** True if an array/object holds at least one model instance (one level deep). */
function holdsInstance(container: unknown[] | Record<string, unknown>): boolean {
  const values = Array.isArray(container) ? container : Object.values(container)
  for (const v of values) if (isModelInstance(v)) return true
  return false
}

/**
 * Serialize a single state value for `getSnapshot`. Recurses into model
 * instances AND into arrays / plain objects that HOLD model instances — the
 * `todos: Todo[]` (array of model instances) and `byId: { [k]: Model }` shapes,
 * which previously serialized the live signal facades (`[Function …]`) instead
 * of plain data. Arrays / objects of plain values are returned as-is (identity
 * preserved), so only the previously-broken instance-bearing case changes.
 */
function serializeValue(val: unknown): unknown {
  if (isModelInstance(val)) return getSnapshot(val as object)
  if (Array.isArray(val)) return holdsInstance(val) ? val.map(serializeValue) : val
  if (isPlainObject(val)) {
    if (!holdsInstance(val)) return val
    const out: Record<string, unknown> = {}
    for (const k in val) out[k] = serializeValue(val[k])
    return out
  }
  return val
}

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
    // Reference field: serialize the raw stored id, NOT the resolved node
    // (the node lives elsewhere in the tree and serializes under its own owner).
    const refIdSig = meta.referenceKeys?.get(key)
    if (refIdSig) {
      out[key] = refIdSig.peek()
      continue
    }
    const sig = (instance as Record<string, Signal<unknown>>)[key]
    if (!sig) continue
    out[key] = serializeValue(sig.peek())
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
      const val = (snapshot as Record<string, unknown>)[key]
      // Reference field: restore the raw stored id via the backing id-signal
      // (the snapshot value IS the id).
      const refIdSig = meta.referenceKeys?.get(key)
      if (refIdSig) {
        refIdSig.set(val)
        continue
      }
      const sig = (instance as Record<string, Signal<unknown>>)[key]
      if (!sig) continue
      const current = sig.peek()
      if (isModelInstance(current)) {
        // Recurse into nested model instance
        applySnapshot(current as object, val as Record<string, unknown>)
      } else if (Array.isArray(current) && Array.isArray(val) && holdsInstance(current)) {
        // Array of model instances (`todos: Todo[]`): reconcile the existing
        // instances in place from the matching snapshot elements. Same-shape
        // lists round-trip exactly. Length changes beyond the overlap are NOT
        // reconciled into instances (there's no element type to recreate them);
        // the raw signal is deliberately NOT overwritten so instances are never
        // replaced by plain snapshot objects (use the array's own mutation
        // methods to add/remove elements).
        const n = Math.min(current.length, val.length)
        for (let i = 0; i < n; i++) {
          const el = current[i]
          if (isModelInstance(el)) applySnapshot(el as object, val[i] as Record<string, unknown>)
        }
      } else if (isPlainObject(current) && isPlainObject(val) && holdsInstance(current)) {
        // Plain object whose values are model instances (`byId: { [k]: Model }`):
        // reconcile each existing instance in place by key.
        for (const k in val) {
          const cur = current[k]
          if (isModelInstance(cur)) applySnapshot(cur as object, val[k] as Record<string, unknown>)
        }
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
