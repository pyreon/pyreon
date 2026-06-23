import { instanceMeta, isModelInstance } from './registry'

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
  // Guard against a pathological cycle (shouldn't happen — parent is set to an
  // ancestor on write — but never loop forever).
  const seen = new Set<object>([current])
  let parent = metaOrThrow(current, 'getRoot').parent
  while (parent !== undefined && !seen.has(parent)) {
    seen.add(parent)
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
  const segments: string[] = []
  let current: object | undefined = node
  const seen = new Set<object>()
  while (current !== undefined && !seen.has(current)) {
    seen.add(current)
    const meta = instanceMeta.get(current)
    if (!meta) {
      if (current === node) throw new Error('[Pyreon] state-tree getPath: not a model instance')
      break
    }
    if (meta.parentKey !== undefined) segments.unshift(meta.parentKey)
    current = meta.parent
  }
  return segments.length > 0 ? `/${segments.join('/')}` : ''
}
