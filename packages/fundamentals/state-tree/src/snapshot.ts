import type { Signal } from '@pyreon/reactivity'
import { batch } from '@pyreon/reactivity'
import { buildContainerValue, type ContainerMarker, type ModelDefLike } from './containers'
import type { ReferenceField } from './references'
import { instanceMeta, isModelInstance } from './registry'
import type { InstanceMeta, SnapshotListener, Snapshot, StateShape } from './types'

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
 *
 * Also the value a `replace` patch carries (`trackedSignal`), so a patch for
 * `todos` holds element snapshots, never live instances that serialize to `{}`.
 *
 * @internal
 */
export function serializeValue(val: unknown): unknown {
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
 * The result is CACHED (MST-aligned): repeated calls on an unchanged instance
 * return the SAME object, and the cache is invalidated on every write. Treat the
 * returned snapshot as immutable — do not mutate it, as callers may share it.
 *
 * @example
 * getSnapshot(counter)  // { count: 6 }
 * getSnapshot(app)      // { profile: { name: "Alice" }, title: "My App" }
 */
export function getSnapshot<TState extends StateShape>(instance: object): Snapshot<TState> {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error('[Pyreon] state-tree getSnapshot: not a model instance')

  // Repeated getSnapshot on an UNCHANGED instance returns the cached object
  // (MST-aligned — MST backs its snapshot with a computed). The cache is
  // invalidated on every write (afterSet / emitPatch / reference id-write), so
  // a hit means nothing this instance serializes has changed since the build.
  const cached = meta.snapshotCache
  if (cached !== undefined) return cached as Snapshot<TState>

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
  meta.snapshotCache = out
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
  if (!meta) throw new Error('[Pyreon] state-tree applySnapshot: not a model instance')
  if (snapshot === null || typeof snapshot !== 'object') {
    throw new Error(
      `[Pyreon] state-tree applySnapshot: snapshot must be an object, got ${
        snapshot === null ? 'null' : typeof snapshot
      }`,
    )
  }

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
      restoreField(instance, meta, key, (snapshot as Record<string, unknown>)[key])
    }
  })
}

/**
 * The element model of an UNDECLARED container (`todos: [] as Todo[]`), read
 * off the instances it currently holds — when they all share one definition.
 * Lets a replayed snapshot add / remove elements of a populated list instead
 * of only reconciling the overlap. An empty or mixed container has none.
 */
function inferContainer(current: unknown): ContainerMarker | undefined {
  const isArray = Array.isArray(current)
  if (!isArray && !isPlainObject(current)) return undefined
  const values = isArray ? (current as unknown[]) : Object.values(current as object)
  let type: unknown
  for (const v of values) {
    if (!isModelInstance(v)) return undefined
    const def = instanceMeta.get(v as object)?.definition
    if (def === undefined || (type !== undefined && def !== type)) return undefined
    type = def
  }
  if (type === undefined) return undefined
  return {
    __pyreonContainer: true,
    kind: isArray ? 'array' : 'map',
    type: type as ModelDefLike,
  } as ContainerMarker
}

/**
 * Write one state field from serialized data — the single rule both
 * `applySnapshot` (per key) and `applyPatch` (the patch's last segment) use, so
 * a value that round-trips through one round-trips through the other:
 *
 * - `reference()` field → store the id (or a node's id) through the accessor.
 * - `arrayOf` / `mapOf` field (or an undeclared container whose elements all
 *   share one model) → reconcile: existing instances are updated in place by
 *   index / key, extra snapshot elements are created, missing ones dropped.
 * - nested model field + snapshot object → apply into the live instance.
 * - anything else → write the value.
 *
 * @internal — used by `applySnapshot` and `applyPatch`.
 */
export function restoreField(
  instance: object,
  meta: InstanceMeta,
  key: string,
  val: unknown,
): void {
  if (meta.referenceKeys?.has(key)) {
    ;(instance as Record<string, ReferenceField<object>>)[key]!.set(
      val as string | number | null | undefined,
    )
    return
  }
  const sig = (instance as Record<string, Signal<unknown>>)[key]
  /* v8 ignore next -- defensive: every state key resolves to a signal */
  if (!sig) return
  const current = sig.peek()
  // A value that already HOLDS live instances is written as-is (a hand-built
  // patch / snapshot passing instances); only serialized data is reconciled.
  const liveValue =
    isModelInstance(val) ||
    ((Array.isArray(val) || isPlainObject(val)) && holdsInstance(val as unknown[]))
  const marker =
    meta.containerKeys?.get(key) ??
    (liveValue || meta.isSchema ? undefined : inferContainer(current))
  if (marker) {
    const next = buildContainerValue(marker, val, current, applySnapshot, key)
    if (next !== current) sig.set(next)
    return
  }
  if (isModelInstance(current) && isPlainObject(val)) {
    // Recurse into nested model instance. A non-object value (`null`, a
    // live instance) falls through to the plain write below — recursing
    // with `null` used to throw `Cannot use 'in' operator … in null`.
    applySnapshot(current as object, val)
    return
  }
  if (
    !liveValue &&
    ((Array.isArray(current) && Array.isArray(val)) ||
      (isPlainObject(current) && isPlainObject(val))) &&
    holdsInstance(current as unknown[])
  ) {
    // An undeclared container of MIXED models: no single element type to
    // create from, so reconcile the instances that line up (by index / key)
    // and never overwrite them with plain objects.
    for (const k of Object.keys(val as object)) {
      const cur = (current as Record<string, unknown>)[k]
      const next = (val as Record<string, unknown>)[k]
      if (isModelInstance(cur) && isPlainObject(next)) applySnapshot(cur as object, next)
    }
    return
  }
  sig.set(val)
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
