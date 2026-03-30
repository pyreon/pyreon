import type { Signal } from '@pyreon/reactivity'
import { batch } from '@pyreon/reactivity'
import { instanceMeta, isModelInstance } from './registry'
import type { Patch, PatchListener } from './types'

/** Property names that must never be used as patch path segments. */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

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

  read.subscribe = (listener: () => void): (() => void) => inner.subscribe(listener)

  read.set = (newValue: T): void => {
    const prev = inner.peek()
    inner.set(newValue)
    // Skip patch emission entirely when no one is listening — avoids object
    // allocation and (for nested instances) a full recursive snapshot.
    if (!Object.is(prev, newValue) && (!hasListeners || hasListeners())) {
      // For model instances, emit the snapshot rather than the live object
      // so patches are always plain JSON-serializable values.
      const patchValue = isModelInstance(newValue) ? snapshotValue(newValue as object) : newValue
      emitPatch({ op: 'replace', path, value: patchValue })
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
    if (!sig) continue
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
export function onPatch(instance: object, listener: PatchListener): () => void {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error('[@pyreon/state-tree] onPatch: not a model instance')
  meta.patchListeners.add(listener)
  return () => meta.patchListeners.delete(listener)
}

// ─── applyPatch ─────────────────────────────────────────────────────────────

/**
 * Apply a JSON patch (or array of patches) to a model instance.
 * Only "replace" operations are supported (matching the patches emitted by `onPatch`).
 *
 * Paths use JSON pointer format: `"/count"` for top-level, `"/profile/name"` for nested.
 * Nested model instances are resolved automatically.
 *
 * @example
 * applyPatch(counter, { op: "replace", path: "/count", value: 10 })
 *
 * @example
 * // Replay patches recorded from onPatch (undo/redo, time-travel)
 * applyPatch(counter, [
 *   { op: "replace", path: "/count", value: 1 },
 *   { op: "replace", path: "/count", value: 2 },
 * ])
 */
export function applyPatch(instance: object, patch: Patch | Patch[]): void {
  const patches = Array.isArray(patch) ? patch : [patch]

  batch(() => {
    for (const p of patches) {
      if (p.op !== 'replace') {
        throw new Error(`[@pyreon/state-tree] applyPatch: unsupported op "${p.op}"`)
      }

      const segments = p.path.split('/').filter(Boolean)
      if (segments.length === 0) {
        throw new Error('[@pyreon/state-tree] applyPatch: empty path')
      }

      // Walk to the target instance for nested paths
      let target: object = instance
      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i]!
        if (RESERVED_KEYS.has(segment)) {
          throw new Error(`[@pyreon/state-tree] applyPatch: reserved property name "${segment}"`)
        }
        const meta = instanceMeta.get(target)
        if (!meta)
          throw new Error(`[@pyreon/state-tree] applyPatch: not a model instance at "${segment}"`)
        const sig = (target as Record<string, Signal<unknown>>)[segment]
        if (!sig || typeof sig.peek !== 'function') {
          throw new Error(`[@pyreon/state-tree] applyPatch: unknown state key "${segment}"`)
        }
        const nested = sig.peek()
        if (!nested || typeof nested !== 'object' || !isModelInstance(nested)) {
          throw new Error(
            `[@pyreon/state-tree] applyPatch: "${segment}" is not a nested model instance`,
          )
        }
        target = nested as object
      }

      const lastKey = segments[segments.length - 1]!
      if (RESERVED_KEYS.has(lastKey)) {
        throw new Error(`[@pyreon/state-tree] applyPatch: reserved property name "${lastKey}"`)
      }
      const meta = instanceMeta.get(target)
      if (!meta) throw new Error('[@pyreon/state-tree] applyPatch: not a model instance')
      if (!meta.stateKeys.includes(lastKey)) {
        throw new Error(`[@pyreon/state-tree] applyPatch: unknown state key "${lastKey}"`)
      }

      const sig = (target as Record<string, Signal<unknown>>)[lastKey]
      if (sig && typeof sig.set === 'function') {
        sig.set(p.value)
      }
    }
  })
}
