import { instanceMeta, isModelInstance } from './registry'

// ─── Model containers: arrayOf(Model) / mapOf(Model) ──────────────────────────
//
// A plain-mode field written as `todos: [] as Todo[]` carries no element type
// at runtime, so a snapshot or patch value (`[{ title: 'a' }]`) cannot be
// turned back into `Todo` instances: `applySnapshot` / `applyPatch` / `create`
// would write plain objects where instances belong. Declaring the container
// with its element model makes the children first-class — snapshots and
// patches round-trip, and replay recreates the instances.

const CONTAINER_BRAND = '__pyreonContainer' as const

/** @internal — runtime shape of an `arrayOf()` / `mapOf()` marker. */
export interface ContainerMarker {
  readonly [CONTAINER_BRAND]: true
  readonly kind: 'array' | 'map'
  readonly type: ModelDefLike
}

/** @internal — the part of a ModelDefinition the container code calls. */
export interface ModelDefLike {
  create(initial?: Record<string, unknown>): object
}

/** Type-only brand: the element definition an `arrayOf` / `mapOf` field holds. */
declare const ELEMENT_DEF: unique symbol

/** Resolve the instance type a model definition produces. */
type InstanceOf<D> = D extends { create(initial?: never): infer I } ? I : object

/**
 * The value type of an `arrayOf(Model)` field: an array of `Model` instances.
 * The phantom `[ELEMENT_DEF]` slot only lets `Snapshot` find the element's
 * snapshot type; it never exists at runtime.
 */
export type ModelArray<D> = InstanceOf<D>[] & { readonly [ELEMENT_DEF]?: D }

/** The value type of a `mapOf(Model)` field: a string-keyed record of `Model` instances. */
export type ModelMap<D> = Record<string, InstanceOf<D>> & { readonly [ELEMENT_DEF]?: D }

/** @internal — extract the element definition from a `ModelArray` / `ModelMap` type. */
export type ElementDefOf<T> = T extends { readonly [ELEMENT_DEF]?: infer D }
  ? unknown extends D
    ? never
    : D
  : never

function isModelDefLike(type: unknown): type is ModelDefLike {
  return (
    type != null &&
    typeof type === 'object' &&
    (type as Record<string, unknown>).__pyreonMod === true &&
    typeof (type as ModelDefLike).create === 'function'
  )
}

function container(kind: 'array' | 'map', type: unknown, fn: string): ContainerMarker {
  if (!isModelDefLike(type)) {
    throw new Error(
      `[Pyreon] state-tree ${fn}(): expected a model definition (the result of \`model({ … })\`), ` +
        `got ${type === null ? 'null' : typeof type}. Pass the definition, not an instance: ` +
        `\`${fn}(Todo)\`, not \`${fn}(Todo.create())\`.`,
    )
  }
  return { [CONTAINER_BRAND]: true, kind, type }
}

/**
 * Declare a plain-mode state field as an ARRAY of `Model` instances. The field
 * is an ordinary signal holding `Model[]` (initially `[]`); declaring the
 * element model is what lets snapshots and patches recreate the children:
 *
 * ```ts
 * const TodoList = model({ state: { todos: arrayOf(Todo) } })
 * const list = TodoList.create({ todos: [{ title: 'a' }] }) // snapshots become Todo instances
 * getPath(list.todos()[0]!)                                // "/todos/0"
 * onPatch(list, (p) => …)                                   // "/todos/0/done", snapshot values
 * applySnapshot(other, getSnapshot(list))                   // recreates Todo instances
 * ```
 *
 * `create()` / `applySnapshot()` / `applyPatch()` accept either snapshots or
 * live instances for the elements. Existing instances are reconciled in place
 * by index; extra snapshot elements are created with `Model.create()`.
 */
export function arrayOf<D>(type: D): ModelArray<D> {
  return container('array', type, 'arrayOf') as unknown as ModelArray<D>
}

/**
 * Declare a plain-mode state field as a string-keyed MAP (plain object) of
 * `Model` instances — the `byId: Record<string, Model>` shape. Same contract
 * as {@link arrayOf}, reconciled by key instead of index; the child path is
 * `/field/<key>` (JSON-pointer escaped).
 */
export function mapOf<D>(type: D): ModelMap<D> {
  return container('map', type, 'mapOf') as unknown as ModelMap<D>
}

/** @internal */
export function isContainerMarker(value: unknown): value is ContainerMarker {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)[CONTAINER_BRAND] === true
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Turn one element value (a live instance or a snapshot) into an instance of
 * `marker.type`, reusing `current` when it is an instance of that type
 * (`reconcile` applies the snapshot into it in place).
 */
function toElement(
  marker: ContainerMarker,
  value: unknown,
  current: unknown,
  reconcile: (node: object, snapshot: Record<string, unknown>) => void,
  where: string,
): unknown {
  if (isModelInstance(value)) return value
  if (!isPlainObject(value)) {
    throw new Error(
      `[Pyreon] state-tree: ${where} must be ${marker.kind === 'array' ? 'an array' : 'a map'} ` +
        `element snapshot (a plain object) or a model instance, got ${
          value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value
        }.`,
    )
  }
  if (isModelInstance(current) && instanceMeta.get(current as object)?.definition === marker.type) {
    reconcile(current as object, value)
    return current
  }
  return marker.type.create(value)
}

/**
 * Build the value a declared container field should hold for `value` (an
 * array / record of snapshots and/or instances), reconciling against the
 * field's `current` value. Returns `current` itself when nothing changed
 * identity-wise, so the caller can skip the signal write.
 *
 * @internal — used by `createInstance`, `applySnapshot` and `applyPatch`.
 */
export function buildContainerValue(
  marker: ContainerMarker,
  value: unknown,
  current: unknown,
  reconcile: (node: object, snapshot: Record<string, unknown>) => void,
  key: string,
): unknown {
  if (marker.kind === 'array') {
    if (!Array.isArray(value)) {
      throw new Error(
        `[Pyreon] state-tree: field "${key}" is declared with arrayOf() and needs an array, got ${
          value === null ? 'null' : typeof value
        }.`,
      )
    }
    const prev = Array.isArray(current) ? current : []
    let same = prev.length === value.length
    const next = value.map((v, i) => {
      const el = toElement(marker, v, prev[i], reconcile, `"${key}/${i}"`)
      if (el !== prev[i]) same = false
      return el
    })
    return same ? current : next
  }
  if (!isPlainObject(value)) {
    throw new Error(
      `[Pyreon] state-tree: field "${key}" is declared with mapOf() and needs a plain object, got ${
        value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value
      }.`,
    )
  }
  const prev = isPlainObject(current) ? current : {}
  const keys = Object.keys(value)
  let same = keys.length === Object.keys(prev).length
  const next: Record<string, unknown> = {}
  for (const k of keys) {
    const cur = Object.hasOwn(prev, k) ? prev[k] : undefined
    const el = toElement(marker, value[k], cur, reconcile, `"${key}/${k}"`)
    if (el !== cur) same = false
    Object.defineProperty(next, k, {
      value: el,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return same ? current : next
}
