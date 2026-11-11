import type { Signal } from '@pyreon/reactivity'
import { batch, wrapSignal } from '@pyreon/reactivity'
import { instanceMeta, isModelInstance } from './registry'
import { restoreField, serializeValue } from './snapshot'
import { unescapeSegment } from './tree'
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
          // Emit serialized data, never live instances: a model value becomes
          // its snapshot, and so does every instance an array / plain object
          // holds (`todos: Todo[]`) — a live instance serializes to `{}`, so a
          // patch sent over the wire or stored for undo lost the data.
          emitPatch({ op: 'replace', path, value: serializeValue(newValue) })
        }
      }
    },
  })
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
  if (!meta) throw new Error('[Pyreon] state-tree onPatch: not a model instance')
  meta.patchListeners.add(listener)
  return () => meta.patchListeners.delete(listener)
}

// ─── applyPatch ─────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** One intermediate step of an `applyPatch` path walk. */
function step(target: unknown, segment: string, path: string): unknown {
  if (isModelInstance(target)) {
    const meta = instanceMeta.get(target as object)!
    if (!meta.stateKeys.includes(segment)) {
      throw new Error(`[Pyreon] state-tree applyPatch: unknown state key "${segment}"`)
    }
    if (meta.referenceKeys?.has(segment)) {
      throw new Error(
        `[Pyreon] state-tree applyPatch: "${segment}" is a reference field — a patch cannot ` +
          'walk through it (the target is owned elsewhere in the tree; patch it at its own path).',
      )
    }
    const value = (target as Record<string, Signal<unknown>>)[segment]!.peek()
    if (value === null || typeof value !== 'object') {
      throw new Error(
        `[Pyreon] state-tree applyPatch: "${segment}" is not a nested model instance or container`,
      )
    }
    return value
  }
  if (Array.isArray(target)) {
    if (/^(0|[1-9]\d*)$/.test(segment) && Number(segment) < target.length) {
      return target[Number(segment)]
    }
    throw new Error(`[Pyreon] state-tree applyPatch: no element at index "${segment}" in "${path}"`)
  }
  if (isPlainObject(target) && Object.hasOwn(target, segment)) return target[segment]
  throw new Error(`[Pyreon] state-tree applyPatch: no entry "${segment}" in "${path}"`)
}

/**
 * Apply a JSON patch (or array of patches) to a model instance.
 * Only "replace" operations are supported (matching the patches emitted by `onPatch`).
 *
 * Paths use JSON pointer format: `"/count"` for top-level, `"/profile/name"` for
 * a nested model, `"/todos/1/done"` for an element of an array / map field.
 * A value is restored the same way `applySnapshot` restores it: a snapshot
 * into a model field reconciles into the live instance, an `arrayOf` /
 * `mapOf` field recreates its elements, a `reference` field stores the id.
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
        throw new Error(`[Pyreon] state-tree applyPatch: unsupported op "${p.op}"`)
      }

      // JSON-pointer segments (RFC 6901 `~0` / `~1` unescaped).
      const segments = p.path.split('/').filter(Boolean).map(unescapeSegment)
      if (segments.length === 0) {
        throw new Error('[Pyreon] state-tree applyPatch: empty path')
      }

      // Walk to the model instance that owns the last segment. A step goes
      // through a model's state field (`/profile`) or into a container's
      // element by index / key (`/todos/1`) — the paths `onPatch` emits.
      let target: unknown = instance
      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i]!
        if (RESERVED_KEYS.has(segment)) {
          throw new Error(`[Pyreon] state-tree applyPatch: reserved property name "${segment}"`)
        }
        target = step(target, segment, p.path)
      }

      const lastKey = segments[segments.length - 1]!
      if (RESERVED_KEYS.has(lastKey)) {
        throw new Error(`[Pyreon] state-tree applyPatch: reserved property name "${lastKey}"`)
      }
      const meta = isModelInstance(target) ? instanceMeta.get(target as object) : undefined
      if (!meta) {
        throw new Error(
          isPlainObject(target)
            ? `[Pyreon] state-tree applyPatch: "${p.path}" reached a plain object, not a model ` +
                'instance. If the field holds model instances, declare it with `arrayOf(Model)` / ' +
                '`mapOf(Model)` so snapshots and patches recreate its elements.'
            : `[Pyreon] state-tree applyPatch: "${p.path}" does not end at a model state field — ` +
                "patch an element's fields (`/todos/1/title`) or replace the whole field (`/todos`).",
        )
      }
      if (!meta.stateKeys.includes(lastKey)) {
        throw new Error(`[Pyreon] state-tree applyPatch: unknown state key "${lastKey}"`)
      }
      // One write rule with applySnapshot: a model field reconciles its
      // snapshot into the live instance, an arrayOf / mapOf field recreates
      // its elements from their snapshots, a reference field stores the id.
      restoreField(target as object, meta, lastKey, p.value)
    }
  })
}
