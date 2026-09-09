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
      '(`a.child.set(b)` then `b.child.set(a)`), which makes each the other\'s parent. ' +
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

/** Attach `child` under `parent` at `key` (no-op if `child` isn't a model instance). */
function setParent(child: unknown, parent: object, key: string): void {
  if (!isModelInstance(child)) return
  const meta = instanceMeta.get(child as object)
  /* v8 ignore next — isModelInstance already proved meta exists */
  if (!meta) return
  meta.parent = parent
  meta.parentKey = key
}

/**
 * Scan a value written into `parent[key]` and attach any model instance(s) it
 * carries as children of `parent`. Covers the three shapes a node can hold a
 * child in: a direct field value, an ARRAY element (the headline composition
 * pattern), and a plain-object value. One container level deep — a model nested
 * inside an array inside an array is not auto-attached (rare; use field/array
 * nesting). Called for each state field's INITIAL value at creation AND on every
 * subsequent tracked-signal write, so array children (`self.todos.set([...])`)
 * get a parent the same way field-nested children do.
 *
 * @internal — used by `createInstance`.
 */
export function scanForChildren(value: unknown, parent: object, key: string): void {
  if (isModelInstance(value)) {
    setParent(value, parent, key)
    return
  }
  if (Array.isArray(value)) {
    for (const el of value) setParent(el, parent, key)
    return
  }
  if (isPlainObject(value)) {
    for (const v of Object.values(value)) setParent(v, parent, key)
  }
}

/**
 * Collect the model instances a value carries as children (one container level
 * deep — the same shapes `scanForChildren` attaches). Used by `createInstance`
 * to wire upward patch/snapshot PROPAGATION for array/object-held children, so a
 * mutation inside `self.todos()[0]` reaches the parent's `onPatch`/`onSnapshot`
 * (and `destroy(parent)` tears them down) — matching field-nested children.
 *
 * @internal — used by `createInstance`.
 */
export function collectModelChildren(value: unknown): object[] {
  // Only array / plain-object CONTAINERS — the caller (`wireContainerChildPropagation`)
  // pre-filters a direct model-instance value (that's the field-nested path).
  if (Array.isArray(value)) {
    const out: object[] = []
    for (const el of value) if (isModelInstance(el)) out.push(el as object)
    return out
  }
  if (isPlainObject(value)) {
    const out: object[] = []
    for (const v of Object.values(value)) if (isModelInstance(v)) out.push(v as object)
    return out
  }
  return []
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
 * The JSON-pointer-style path from the root to `node`, built from each ancestor's
 * `parentKey` — e.g. `"/profile/address"`. A root node returns `""`. Array
 * children carry their field key (the array's key), not an index, in v1.
 *
 * @example
 * getPath(child) // "/todos"
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
