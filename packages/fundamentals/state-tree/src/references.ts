import { type Signal, signal } from '@pyreon/reactivity'
import { instanceMeta, isModelInstance } from './registry'
import { getRoot } from './tree'

// ─── Markers ─────────────────────────────────────────────────────────────────

const IDENTIFIER_BRAND = '__pyreonIdentifier' as const
const REFERENCE_BRAND = '__pyreonReference' as const

/** @internal — runtime shape of an `identifier()` marker. */
export interface IdentifierMarker {
  readonly [IDENTIFIER_BRAND]: true
  readonly default: string | number
}

/** @internal — runtime shape of a `reference()` marker. */
export interface ReferenceMarker {
  readonly [REFERENCE_BRAND]: true
  readonly type: unknown
}

/**
 * Declare a state field as this model's IDENTIFIER — the field a `reference()`
 * resolves against. Use as a plain-mode field value:
 *
 * ```ts
 * const User = model({ state: { id: identifier(), name: '' } })
 * ```
 *
 * The field is a normal signal at runtime (initialized to `defaultValue`, or
 * `''`); the marker just records WHICH field is the id on the model definition.
 * Schema mode declares it differently: `model({ schema, identifier: 'id' })`.
 * Returns a value typed as `T` so the state field types correctly.
 */
export function identifier<T extends string | number = string>(defaultValue?: T): T {
  const marker: IdentifierMarker = {
    [IDENTIFIER_BRAND]: true,
    default: defaultValue ?? '',
  }
  return marker as unknown as T
}

/** @internal */
export function isIdentifierMarker(value: unknown): value is IdentifierMarker {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)[IDENTIFIER_BRAND] === true
  )
}

/** Resolve the instance type a model definition produces (for `reference` typing). */
type InstanceOf<D> = D extends { create(initial?: never): infer I } ? I : object

/**
 * Declare a state field as a REFERENCE to another model by its identifier. The
 * field STORES the target's id (serializable) but RESOLVES to the live node on
 * read:
 *
 * ```ts
 * const Post = model({ state: { id: identifier(), author: reference(User) } })
 * post.author()        // → the live User node (or undefined if unresolved)
 * post.author.set(user)// stores user's id
 * post.author.id()     // the raw stored id
 * getSnapshot(post)    // { id, author: <id> }  — serialized as the id
 * ```
 *
 * Resolution walks the tree from `getRoot(node)` to find a node of the target
 * type whose identifier equals the stored id (O(n) per read in v1). Returns a
 * value typed as the resolved instance so `post.author()` types correctly.
 */
export function reference<D>(type: D): ReferenceField<InstanceOf<D>> {
  const marker: ReferenceMarker = { [REFERENCE_BRAND]: true, type }
  return marker as unknown as ReferenceField<InstanceOf<D>>
}

/** @internal */
export function isReferenceMarker(value: unknown): value is ReferenceMarker {
  return (
    value != null &&
    typeof value === 'object' &&
    (value as Record<string, unknown>)[REFERENCE_BRAND] === true
  )
}

/** The accessor a reference field exposes on the instance. */
export interface ReferenceField<T> {
  /** Resolve to the live target node (reactive on the stored id), or `undefined`. */
  (): T | undefined
  /** Store a reference — accepts the target node (its id is read) OR a raw id. */
  set(value: T | string | number | null | undefined): void
  /** Resolve without subscribing. */
  peek(): T | undefined
  /** Read the raw stored id (reactive). */
  id(): string | number | null | undefined
  /** Set the raw stored id directly. */
  setId(id: string | number | null | undefined): void
}

// ─── resolveIdentifier ─────────────────────────────────────────────────────────

/** Read a node's identifier value (via its definition's `_identifierKey`). */
function readIdentifierOf(node: object, idKey: string): unknown {
  const sig = (node as Record<string, { peek?: () => unknown }>)[idKey]
  return typeof sig?.peek === 'function' ? sig.peek() : undefined
}

/** Push any model instances carried by `val` (one container level) onto `stack`. */
function collectInstances(val: unknown, stack: object[]): void {
  if (isModelInstance(val)) {
    stack.push(val as object)
    return
  }
  if (Array.isArray(val)) {
    for (const el of val) if (isModelInstance(el)) stack.push(el as object)
    return
  }
  if (val != null && typeof val === 'object') {
    const proto = Object.getPrototypeOf(val)
    if (proto === Object.prototype || proto === null) {
      for (const v of Object.values(val)) if (isModelInstance(v)) stack.push(v as object)
    }
  }
}

/**
 * Walk every model instance in `root`'s subtree (depth-first, cycle-safe),
 * reading each node's OWNED state (fields, array elements, plain-object values).
 * Reference fields are NOT followed — they point at nodes already in the tree.
 */
function walkInstances(root: object, visit: (node: object) => boolean | void): void {
  const seen = new Set<object>()
  const stack: object[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === undefined || seen.has(node)) continue
    seen.add(node)
    if (visit(node) === true) return // visitor signalled "found — stop"
    const meta = instanceMeta.get(node)
    if (!meta) continue
    const refKeys = meta.referenceKeys
    for (const key of meta.stateKeys) {
      if (refKeys?.has(key)) continue // don't walk into references (they don't own the target)
      const sig = (node as Record<string, { peek?: () => unknown }>)[key]
      collectInstances(typeof sig?.peek === 'function' ? sig.peek() : undefined, stack)
    }
  }
}

/**
 * Find the model instance of `type` whose identifier equals `id`, searching
 * `root`'s subtree. Returns `undefined` if no match. Throws if `type` has no
 * `identifier()` field declared.
 *
 * @example
 * const user = resolveIdentifier(store, User, 'u-42')
 */
export function resolveIdentifier<T extends object = object>(
  root: object,
  type: unknown,
  id: unknown,
): T | undefined {
  const idKey = (type as { _identifierKey?: string })?._identifierKey
  if (!idKey) {
    throw new Error(
      '[Pyreon] state-tree resolveIdentifier: the model type has no identifier — declare ' +
        'one with `identifier()` (plain mode) or `model({ schema, identifier: "field" })`.',
    )
  }
  if (id == null) return undefined
  let found: object | undefined
  walkInstances(root, (node) => {
    const meta = instanceMeta.get(node)
    if (meta?.definition === type && Object.is(readIdentifierOf(node, idKey), id)) {
      found = node
      return true
    }
  })
  return found as T | undefined
}

// ─── Reference field builder (used by createInstance) ──────────────────────────

/**
 * Build the resolving accessor + backing id-signal for a `reference()` field.
 * @internal
 */
export function buildReferenceField(
  instance: object,
  type: unknown,
  initialValue: unknown,
): { accessor: ReferenceField<object>; idSig: Signal<unknown> } {
  const idKey = (type as { _identifierKey?: string })?._identifierKey
  // Normalize the initial value (a target node OR a raw id) to an id at
  // construction — so `createInstance` never calls the public `.set` to seed it.
  const initialId =
    isModelInstance(initialValue) && idKey
      ? readIdentifierOf(initialValue as object, idKey)
      : (initialValue ?? null)
  const idSig = signal<unknown>(initialId)

  const resolve = (id: unknown): object | undefined => {
    if (id == null) return undefined
    return resolveIdentifier(getRoot(instance), type, id)
  }

  const accessor = (() => resolve(idSig())) as ReferenceField<object>
  // Single id-write site — `.set` (node-or-id) normalizes then delegates to
  // `.setId` so there's one `idSig.set` in this scope.
  accessor.setId = (id) => idSig.set(id ?? null)
  accessor.set = (value) => {
    const id =
      isModelInstance(value) && idKey
        ? readIdentifierOf(value as object, idKey)
        : value
    accessor.setId(id as string | number | null | undefined)
  }
  accessor.peek = () => resolve(idSig.peek())
  accessor.id = () => idSig() as string | number | null | undefined
  return { accessor, idSig }
}
