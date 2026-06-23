import { instanceMeta } from './registry'
import { getSnapshot } from './snapshot'

// ─── isAlive ───────────────────────────────────────────────────────────────────

/**
 * Returns `true` while the instance is live, `false` after `destroy(instance)`.
 * Also `false` for a non-model-instance object.
 *
 * @example
 * isAlive(counter) // true
 * destroy(counter)
 * isAlive(counter) // false
 */
export function isAlive(instance: object): boolean {
  const meta = instanceMeta.get(instance)
  return meta !== undefined && meta.alive
}

// ─── destroy ───────────────────────────────────────────────────────────────────

/**
 * Tear down a model instance: run its `beforeDestroy` handlers (from
 * `.lifecycle()`), recursively destroy field-nested child models, drop all
 * subscriptions (patch listeners + middleware), and mark it dead. After
 * `destroy`, `isAlive(instance)` is `false`, and actions + schema mutation
 * helpers dev-warn and no-op. Idempotent — destroying twice is a safe no-op.
 *
 * **What this does NOT do: free memory.** Pyreon signals have no explicit
 * per-signal dispose; the instance's signals are reclaimed by GC once you drop
 * your references to the instance. `destroy` tears down SUBSCRIPTIONS + runs
 * cleanup (timers, listeners you opened in `beforeDestroy`) + flips the liveness
 * flag — it is not a `free()`. Direct signal writes (`self.field.set(v)`) on a
 * destroyed instance are unguarded (undefined behavior — don't).
 *
 * @example
 * const clock = Clock.create()
 * // .lifecycle(() => ({ afterCreate: start, beforeDestroy: stop }))
 * destroy(clock) // runs stop(), marks dead
 */
export function destroy(instance: object): void {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error('[Pyreon] state-tree destroy: not a model instance')
  if (!meta.alive) return // idempotent — already destroyed

  // Run beforeDestroy first (handlers may read live state / clear timers).
  if (meta.beforeDestroy) meta.beforeDestroy()

  // Recurse into field-nested children (depth-first). A child's patchListeners
  // hold the parent's upward-propagation listener — cleared by this recursion.
  for (const child of meta.children) destroy(child)
  meta.children.clear()

  // Drop subscriptions.
  meta.patchListeners.clear()
  meta.snapshotListeners.clear()
  meta.middlewares.length = 0

  meta.alive = false
}

// ─── getType / clone ─────────────────────────────────────────────────────────

/**
 * Returns the `ModelDefinition` that produced `instance` (the back-reference
 * stored at `.create()` time), or `undefined` if the instance was created
 * without one.
 */
export function getType(instance: object): unknown {
  return instanceMeta.get(instance)?.definition
}

/**
 * Structurally clone a model instance: snapshot its current state, then create
 * a fresh, fully-independent instance from the SAME definition. The clone has
 * its own signals, listeners, middleware, and lifecycle — mutating one never
 * affects the other. In schema mode the snapshot is re-validated by `.create()`.
 * Throws if the instance carries no definition back-reference.
 *
 * @example
 * const draft = clone(original) // independent copy of original's current state
 */
export function clone<T extends object>(instance: T): T {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error('[Pyreon] state-tree clone: not a model instance')
  const def = meta.definition as { create(initial?: unknown): unknown } | undefined
  if (!def || typeof def.create !== 'function') {
    throw new Error(
      '[Pyreon] state-tree clone: instance has no definition back-reference. ' +
        'clone works on instances created via ModelDefinition.create().',
    )
  }
  return def.create(getSnapshot(instance)) as T
}
