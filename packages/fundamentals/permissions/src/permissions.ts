import { batch, computed, signal } from '@pyreon/reactivity'
import type { PermissionMap, Permissions, PermissionValue } from './types'

/**
 * Resolve a permission key against the map.
 * Resolution order: exact match → wildcard (e.g., 'posts.*') → global wildcard ('*') → false.
 */
/**
 * Safely evaluate a permission value. Predicates that throw are treated as denied.
 */
function evaluate(value: PermissionValue, context?: unknown): boolean {
  if (typeof value === 'function') {
    try {
      return value(context)
    } catch {
      return false
    }
  }
  return value
}

/**
 * Pre-partitioned permission index. Splitting wildcard keys out of the exact map
 * lets `resolve` do direct prefix lookups with NO per-check candidate-key string
 * allocation — the flat-map resolver built `` `${parent}.*` `` / `` `${ancestor}.**` ``
 * on EVERY check (the dominant cost) — and early-out when the map has no wildcards
 * at all (a deny becomes a single `Map.get` miss). The partitions together hold
 * exactly the source map's keys; `granted`/`entries` still read the full map.
 */
interface PermIndex {
  exact: Map<string, PermissionValue> // non-wildcard keys
  single: Map<string, PermissionValue> // 'prefix.*'  → prefix → value
  recursive: Map<string, PermissionValue> // 'prefix.**' → prefix → value
  global: PermissionValue | undefined // '*'
  hasWildcard: boolean
  // True when ANY value is a predicate fn. Predicates depend on `context`, so a
  // key→boolean resolve memo is only sound when the WHOLE map is static booleans.
  hasPredicate: boolean
}

function emptyIndex(): PermIndex {
  return { exact: new Map(), single: new Map(), recursive: new Map(), global: undefined, hasWildcard: false, hasPredicate: false }
}

/** Route one key into its partition (deterministic by key shape). */
function indexKey(idx: PermIndex, key: string, value: PermissionValue): void {
  if (typeof value === 'function') idx.hasPredicate = true
  if (key === '*') {
    idx.global = value
    idx.hasWildcard = true
  } else if (key.endsWith('.**')) {
    idx.recursive.set(key.slice(0, -3), value)
    idx.hasWildcard = true
  } else if (key.endsWith('.*')) {
    idx.single.set(key.slice(0, -2), value)
    idx.hasWildcard = true
  } else {
    idx.exact.set(key, value)
  }
}

function buildIndex(map: Map<string, PermissionValue>): PermIndex {
  const idx = emptyIndex()
  for (const [key, value] of map) indexKey(idx, key, value)
  return idx
}

/** Defensive bound on the per-instance resolve memo (real permission vocabularies
 *  are far smaller; this only guards against an adversarial distinct-key flood). */
const RESOLVE_CACHE_CAP = 4096

/**
 * Resolve a permission key against the pre-built index.
 * MOST-SPECIFIC-FIRST (a specific exact/`**` deny overrides a broader subtree
 * grant — the CASL `cannot`-over-`can` shape): exact → `parent.*` → nearest-
 * ancestor `**` (most-specific first) → global `*` → denied. The RESULT is
 * identical to the flat-map resolver — only the per-check string allocations and
 * the no-wildcard chain walk are gone.
 */
function resolve(idx: PermIndex, key: string, context?: unknown): boolean {
  // 1. Exact match
  const exact = idx.exact.get(key)
  if (exact !== undefined) {
    return evaluate(exact, context)
  }

  // No wildcards anywhere → a miss is definitively a deny (no chain to walk).
  if (!idx.hasWildcard) {
    return false
  }

  const dotIndex = key.lastIndexOf('.')
  if (dotIndex !== -1) {
    const parent = key.slice(0, dotIndex)

    // 2. Single-segment wildcard — 'posts.read' matches 'posts.*' (exactly one segment).
    //    Skip the lookup entirely when no `prefix.*` keys exist.
    if (idx.single.size !== 0) {
      const single = idx.single.get(parent)
      if (single !== undefined) {
        return evaluate(single, context)
      }
    }

    // 3. Recursive subtree wildcards — 'posts.admin.delete' matches 'posts.admin.**'
    //    then 'posts.**', most-specific ancestor first. `**` matches any depth
    //    STRICTLY below the prefix (so 'posts.**' covers 'posts.x' and 'posts.x.y',
    //    but the prefix 'posts' itself is matched by 'posts.*' / an exact 'posts').
    //    Skip the ancestor walk entirely when no `prefix.**` keys exist.
    if (idx.recursive.size !== 0) {
      let ancestor = parent
      while (true) {
        const recursive = idx.recursive.get(ancestor)
        if (recursive !== undefined) {
          return evaluate(recursive, context)
        }
        const i = ancestor.lastIndexOf('.')
        if (i === -1) break
        ancestor = ancestor.slice(0, i)
      }
    }
  }

  // 4. Global wildcard (matches any key, any depth)
  if (idx.global !== undefined) {
    return evaluate(idx.global, context)
  }

  // 5. No match → denied
  return false
}

/**
 * Create a reactive permissions instance.
 *
 * The returned `can` function checks permissions reactively —
 * reads update automatically when permissions change via `set()` or `patch()`.
 *
 * @param initial - Optional initial permission map
 * @returns A callable `Permissions` instance
 *
 * @example
 * ```tsx
 * const can = createPermissions({
 *   'posts.read': true,
 *   'posts.update': (post: Post) => post.authorId === userId(),
 *   'users.manage': false,
 * })
 *
 * // Check (reactive in effects/computeds/JSX)
 * can('posts.read')              // true
 * can('posts.update', myPost)    // evaluates predicate
 *
 * // JSX
 * {() => can('posts.delete') && <DeleteButton />}
 *
 * // Update
 * can.set({ 'posts.read': true, 'admin': true })
 * can.patch({ 'users.manage': true })
 * ```
 */
export function createPermissions(initial?: PermissionMap): Permissions {
  // Internal reactive state — a signal holding the permission map
  const store = signal(toMap(initial))
  // Version counter — incremented on every set/patch to trigger reactive updates
  const version = signal(0)
  // Derived pre-partitioned index used by `resolve` (the hot path). Kept in sync
  // with `store` on every set/patch/clear; `store` stays the source of truth for
  // `granted`/`entries` + the reactive signal.
  let index = buildIndex(store.peek())
  // Per-key resolve memo. Apps check the same permission repeatedly (per render),
  // so caching key→boolean turns a repeated wildcard/deny check (a multi-step
  // partition walk) into one `Map.get`. SOUND only when the map is all static
  // booleans (no predicates) AND no per-call `context` is supplied — then
  // `resolve(key)` is a pure function of `key`. Cleared on every set/patch/clear.
  // Capped so an adversarial flood of distinct keys can't grow it unboundedly.
  const resolveCache = new Map<string, boolean>()

  function toMap(obj?: PermissionMap): Map<string, PermissionValue> {
    if (!obj) return new Map()
    return new Map(Object.entries(obj))
  }

  // The main check function — reads `version` to subscribe in reactive contexts
  function can(key: string, context?: unknown): boolean {
    // Reading version subscribes this call to reactive updates
    version()
    // Memoized fast path: pure-static map + no context → resolve(key) is pure.
    if (context === undefined && !index.hasPredicate) {
      const cached = resolveCache.get(key)
      if (cached !== undefined) return cached
      const result = resolve(index, key)
      if (resolveCache.size < RESOLVE_CACHE_CAP) resolveCache.set(key, result)
      return result
    }
    return resolve(index, key, context)
  }

  can.not = (key: string, context?: unknown): boolean => {
    return !can(key, context)
  }

  can.all = (...keys: string[]): boolean => {
    return keys.every((key) => can(key))
  }

  can.any = (...keys: string[]): boolean => {
    return keys.some((key) => can(key))
  }

  can.set = (permissions: PermissionMap): void => {
    batch(() => {
      const map = toMap(permissions)
      store.set(map)
      index = buildIndex(map) // full rebuild — `set` replaces ALL permissions
      resolveCache.clear() // permissions changed → memo is stale
      version.update((v) => v + 1)
    })
  }

  can.patch = (permissions: PermissionMap): void => {
    batch(() => {
      const current = store.peek()
      for (const [key, value] of Object.entries(permissions)) {
        current.set(key, value)
        // Incremental: `patch` only adds/overwrites (never deletes), and a key's
        // partition is determined by its string shape — so routing each patched
        // key keeps the index in sync without an O(map) rebuild.
        indexKey(index, key, value)
      }
      store.set(current)
      resolveCache.clear() // permissions changed → memo is stale
      version.update((v) => v + 1)
    })
  }

  can.clear = (): void => {
    batch(() => {
      store.set(new Map())
      index = emptyIndex()
      resolveCache.clear()
      version.update((v) => v + 1)
    })
  }

  can.assert = (key: string, context?: unknown, message?: string): void => {
    if (!can(key, context)) {
      throw new Error(message ? `[Pyreon] ${message}` : `[Pyreon] permission denied: '${key}'`)
    }
  }

  can.granted = computed(() => {
    version()
    const keys: string[] = []
    // `version()` above is the tracked dependency; `store` is read
    // untracked by design (the signal that changes is `version`).
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    for (const [key, value] of store.peek()) {
      // Static true or predicate (capability exists)
      if (value === true || typeof value === 'function') {
        keys.push(key)
      }
    }
    return keys
  })

  can.entries = computed(() => {
    version()
    // `version()` is the tracked dependency; `store` read untracked.
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    return [...store.peek().entries()]
  })

  return can as Permissions
}
