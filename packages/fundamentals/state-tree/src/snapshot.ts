import type { Signal } from "@pyreon/reactivity"
import { batch } from "@pyreon/reactivity"
import { instanceMeta, isModelInstance } from "./registry"
import type { Snapshot, StateShape } from "./types"

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
  if (!meta) throw new Error("[@pyreon/state-tree] getSnapshot: not a model instance")

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
  if (!meta) throw new Error("[@pyreon/state-tree] applySnapshot: not a model instance")

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
