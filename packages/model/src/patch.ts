import type { Signal } from "@pyreon/reactivity"
import type { Patch, PatchListener } from "./types"
import { instanceMeta, isModelInstance } from "./registry"

// ─── Tracked signal ───────────────────────────────────────────────────────────

/**
 * Wraps a signal so that every write emits a JSON patch via `emitPatch`.
 * Reads are pass-through — no overhead on hot reactive paths.
 *
 * @param hasListeners Optional predicate — when provided, patch object allocation
 *   and snapshotting are skipped entirely when no listeners are registered.
 */
export function trackedSignal<T>(
  inner: Signal<T>,
  path: string,
  emitPatch: (patch: Patch) => void,
  hasListeners?: () => boolean,
): Signal<T> {
  const read = (): T => inner()

  read.peek = (): T => inner.peek()

  read.subscribe = (listener: () => void): (() => void) =>
    inner.subscribe(listener)

  read.set = (newValue: T): void => {
    const prev = inner.peek()
    inner.set(newValue)
    // Skip patch emission entirely when no one is listening — avoids object
    // allocation and (for nested instances) a full recursive snapshot.
    if (!Object.is(prev, newValue) && (!hasListeners || hasListeners())) {
      // For model instances, emit the snapshot rather than the live object
      // so patches are always plain JSON-serializable values.
      const patchValue = isModelInstance(newValue)
        ? snapshotValue(newValue as object)
        : newValue
      emitPatch({ op: "replace", path, value: patchValue })
    }
  }

  read.update = (fn: (current: T) => T): void => {
    read.set(fn(inner.peek()))
  }

  return read as Signal<T>
}

/** Shallow snapshot helper (avoids importing snapshot.ts to prevent circular deps). */
function snapshotValue(instance: object): Record<string, unknown> {
  const meta = instanceMeta.get(instance)
  if (!meta) return instance as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of meta.stateKeys) {
    const sig = (instance as Record<string, Signal<unknown>>)[key]
    const val = sig.peek()
    out[key] = isModelInstance(val) ? snapshotValue(val as object) : val
  }
  return out
}

// ─── onPatch ──────────────────────────────────────────────────────────────────

/**
 * Subscribe to every state mutation in `instance` as a JSON patch.
 * Also captures mutations in nested model instances (path is prefixed).
 *
 * Returns an unsubscribe function.
 *
 * @example
 * const unsub = onPatch(counter, patch => {
 *   // { op: "replace", path: "/count", value: 6 }
 * })
 */
export function onPatch(
  instance: object,
  listener: PatchListener,
): () => void {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error("[@pyreon/model] onPatch: not a model instance")
  meta.patchListeners.add(listener)
  return () => meta.patchListeners.delete(listener)
}
