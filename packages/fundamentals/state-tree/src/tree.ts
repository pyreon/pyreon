import { instanceMeta, isModelInstance } from './registry'

// Bound for the ancestor-walk cycle guards in `getRoot` / `getPath`. A
// well-formed tree never approaches this; it exists only so a corrupt
// parent chain can never loop forever. Chosen far above any realistic model
// nesting, so reaching it is never a deep tree — it is always a CYCLE.
//
// A cycle IS constructible through the public API: `a.child.set(b)` makes `b`
// a child of `a`, and `b.child.set(a)` then makes `a` a child of `b`. Both
// walks below therefore THROW when the bound is reached rather than returning
// whatever they happen to be holding — hitting the bound means the invariant
// these functions rest on (the parent chain is acyclic) is already broken, and
// there is no correct answer left to return. Returning one silently produced a
// wrong root on the hot `reference()` resolve path, every call, forever.
const MAX_TREE_DEPTH = 100_000

/**
 * Build the throw for a parent chain that exceeded `MAX_TREE_DEPTH`. Named
 * separately so both walks report the same diagnosis, and so the message
 * carries enough about the node to find it (models carry no name, so the key
 * it is attached under plus its state keys are the identifying detail we have).
 */
function cyclicChainError(fn: string, node: object): Error {
  const meta = instanceMeta.get(node)
  const key = meta?.parentKey
  const where = key === undefined ? 'a root-attached node' : `the node at key "${key}"`
  const keys = meta?.stateKeys?.length ? ` (state keys: ${meta.stateKeys.join(', ')})` : ''
  return new Error(
    `[Pyreon] state-tree ${fn}: cyclic parent chain — walked ${MAX_TREE_DEPTH} ancestors ` +
      `from ${where}${keys} without reaching a root. A model instance's parent chain must be ` +
      'acyclic. This happens when two instances are written into each other ' +
      "(`a.child.set(b)` then `b.child.set(a)`), which makes each the other's parent. " +
      'Detach one side before reading the tree.',
  )
}

// ─── Internal parent-tracking ──────────────────────────────────────────────────

/** Detect a plain object (literal `{}` / `Object.create(null)`) — scan target. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/** Attach the model instance `child` under `parent` at path segment `key`. */
function setParent(child: object, parent: object, key: string): void {
  const meta = instanceMeta.get(child)
  /* v8 ignore next — isModelInstance already proved meta exists */
  if (!meta) return
  meta.parent = parent
  meta.parentKey = key
}

/**
 * Escape one JSON-pointer path segment (RFC 6901): `~` → `~0`, `/` → `~1`.
 * Every segment the tree emits (state keys, array indices, map keys) goes
 * through this, and `applyPatch` reverses it with {@link unescapeSegment}.
 *
 * @internal
 */
export function escapeSegment(segment: string): string {
  return segment.includes('~') || segment.includes('/')
    ? segment.replace(/~/g, '~0').replace(/\//g, '~1')
    : segment
}

/** Reverse of {@link escapeSegment}. @internal */
export function unescapeSegment(segment: string): string {
  return segment.includes('~') ? segment.replace(/~1/g, '/').replace(/~0/g, '~') : segment
}

/**
 * A model child a field holds, with the path segment(s) that address it under
 * the owner: `profile` for a direct field value, `todos/1` for an array element,
 * `byId/x` for a plain-object value (each part JSON-pointer escaped).
 *
 * @internal
 */
export interface HeldChild {
  node: object
  segment: string
}

/**
 * Collect the model instances a field value carries as children — a direct
 * field value, an ARRAY element (the headline composition pattern), or a
 * plain-object value — each with the path segment that addresses it. One
 * container level deep: a model nested inside an array inside an array is not
 * auto-attached (rare; use field/array nesting).
 *
 * The segment carries the element's INDEX / KEY, so `getPath` and the patches a
 * child emits name the exact element (`/todos/1/done`, not `/todos/done`): a
 * patch without the index cannot be replayed. The owner re-collects on every
 * write to the field, so a reorder re-addresses every child.
 *
 * @internal — used by `createInstance`.
 */
export function collectHeldChildren(value: unknown, key: string): HeldChild[] {
  const base = escapeSegment(key)
  if (isModelInstance(value)) return [{ node: value as object, segment: base }]
  const out: HeldChild[] = []
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const el = value[i]
      if (isModelInstance(el)) out.push({ node: el as object, segment: `${base}/${i}` })
    }
  } else if (isPlainObject(value)) {
    for (const k of Object.keys(value)) {
      const v = value[k]
      if (isModelInstance(v))
        out.push({ node: v as object, segment: `${base}/${escapeSegment(k)}` })
    }
  }
  return out
}

/**
 * Attach every held child under `parent` (parent pointer + addressing
 * segment), so getParent / getRoot / getPath work for array and map children,
 * not just field-nested ones. Called for each state field's INITIAL value at
 * creation AND on every subsequent tracked-signal write.
 *
 * @internal — used by `createInstance`.
 */
export function attachChildren(children: readonly HeldChild[], parent: object): void {
  for (const { node, segment } of children) setParent(node, parent, segment)
}

// ─── Public tree helpers ─────────────────────────────────────────────────────

function metaOrThrow(instance: object, fn: string): { parent?: object; parentKey?: string } {
  const meta = instanceMeta.get(instance)
  if (!meta) throw new Error(`[Pyreon] state-tree ${fn}: not a model instance`)
  return meta
}

/**
 * The model instance `node` is attached under (its tree parent), or `undefined`
 * if `node` is a root. A node gets a parent when it is written into another
 * model's state — as a field, an array element, or a plain-object value.
 *
 * @example
 * const list = TodoList.create()
 * list.add('x')                 // pushes a Todo into the `todos` array
 * getParent(list.todos()[0])    // → list
 */
export function getParent<T extends object = object>(node: object): T | undefined {
  return metaOrThrow(node, 'getParent').parent as T | undefined
}

/** Whether `node` has a tree parent (i.e. is NOT a root). */
export function hasParent(node: object): boolean {
  return metaOrThrow(node, 'hasParent').parent !== undefined
}

/** Whether `node` is a root (has no tree parent). */
export function isRoot(node: object): boolean {
  return metaOrThrow(node, 'isRoot').parent === undefined
}

/**
 * The root of `node`'s tree — walk parents until one has none. Returns `node`
 * itself if it is already a root.
 *
 * @example
 * getRoot(deeplyNestedChild) // → the top-level model instance
 */
export function getRoot<T extends object = object>(node: object): T {
  let current = node
  // A bounded depth counter replaces a per-call `Set` cycle-guard: `getRoot` is
  // on the hot reference-resolve path (once per `reference()` read) and the
  // parent chain is a tree, so the Set was pure garbage — a parentless root
  // allocated one for a loop that never ran. Exceeding the bound THROWS (see
  // `cyclicChainError`): there is no root to return, so returning `current`
  // would be a silently wrong answer on every subsequent read.
  let parent = metaOrThrow(current, 'getRoot').parent
  let depth = 0
  while (parent !== undefined) {
    if (++depth > MAX_TREE_DEPTH) throw cyclicChainError('getRoot', node)
    current = parent
    parent = instanceMeta.get(current)?.parent
  }
  return current as T
}

/**
 * The JSON-pointer path from the root to `node`, built from each ancestor's
 * address under its parent — e.g. `"/profile/address"`. A root node returns
 * `""`. Array and map children include their index / key (`"/todos/1"`,
 * `"/byId/u1"`), the same path their patches carry.
 *
 * @example
 * getPath(list.todos()[1]) // "/todos/1"
 */
export function getPath(node: object): string {
  // Collected leaf-to-root then reversed, rather than `unshift`ed. Same result,
  // but `unshift` is O(n) per hop — which made the cycle guard below O(n²) and
  // cost ~700ms of array-shuffling before it could report the corruption.
  const segments: string[] = []
  let current: object | undefined = node
  // Bounded depth counter instead of a per-call `Set` cycle-guard — same
  // rationale (and the same throw-on-bound) as `getRoot`.
  let depth = 0
  while (current !== undefined) {
    if (++depth > MAX_TREE_DEPTH) throw cyclicChainError('getPath', node)
    const meta = instanceMeta.get(current)
    if (!meta) {
      if (current === node) throw new Error('[Pyreon] state-tree getPath: not a model instance')
      /* v8 ignore next -- defensive: a parent reached via parentKey always has meta; only the start node can lack it */
      break
    }
    if (meta.parentKey !== undefined) segments.push(meta.parentKey)
    current = meta.parent
  }
  return segments.length > 0 ? `/${segments.reverse().join('/')}` : ''
}
