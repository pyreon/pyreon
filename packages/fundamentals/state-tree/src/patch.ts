import type { Signal } from '@pyreon/reactivity'
import { batch, wrapSignal } from '@pyreon/reactivity'
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
  afterSet?: (newValue: T) => void,
): Signal<T> {
  // `wrapSignal` delegates reads (incl. `.direct` + `_v` for the compiler's
  // `_bindText` fast path) to `inner` and routes writes through our patch
  // emitter; `.update` defaults to `set(fn(peek()))`. Previously this was a
  // hand-rolled facade that forwarded neither `.direct` nor `_v` — so a model
  // field bound via `{() => model.field()}` (the text fast path) would render
  // empty and stay empty. The primitive forwards both by construction.
  return wrapSignal(inner, {
    set: (newValue: T): void => {
      const prev = inner.peek()
      inner.set(newValue)
      if (!Object.is(prev, newValue)) {
        // Parent tracking runs on EVERY change (always-on, not listener-gated)
        // so tree helpers see array/field children written after creation.
        afterSet?.(newValue)
        // Skip patch emission when no one is listening — avoids object
        // allocation and (for nested instances) a full recursive snapshot.
        if (!hasListeners || hasListeners()) {
          // For model instances, emit the snapshot rather than the live object
          // so patches are always plain JSON-serializable values.
          const patchValue = isModelInstance(newValue)
            ? snapshotValue(newValue as object)
            : newValue
          emitPatch({ op: 'replace', path, value: patchValue })
        }
      }
    },
  })
}

/** Shallow snapshot helper (avoids importing snapshot.ts to prevent circular deps). */
function snapshotValue(instance: object): Record<string, unknown> {
  const meta = instanceMeta.get(instance)
  // Defensive: `snapshotValue` is only called on values that already passed
  // `isModelInstance`, so `meta` is always present here.
  /* v8 ignore next */
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
        // Defensive guard for a nested patch path that walks through a
        // non-model value — only reachable with a deliberately malformed
        // nested-plain-object state shape the normal model API doesn't build.
        /* v8 ignore next 2 */
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
      /* v8 ignore next -- defensive: a validated state key always resolves to a settable signal (unknown keys throw above) */
      if (sig && typeof sig.set === 'function') {
        sig.set(p.value)
      }
    }
  })
}
