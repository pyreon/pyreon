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

function resolve(map: Map<string, PermissionValue>, key: string, context?: unknown): boolean {
  // Resolution is MOST-SPECIFIC-FIRST, so a specific exact/`**` deny overrides a
  // broader subtree grant (and vice-versa) — the CASL `cannot`-over-`can` shape.
  // 1. Exact match
  const exact = map.get(key)
  if (exact !== undefined) {
    return evaluate(exact, context)
  }

  const dotIndex = key.lastIndexOf('.')
  if (dotIndex !== -1) {
    const parent = key.slice(0, dotIndex)

    // 2. Single-segment wildcard — 'posts.read' matches 'posts.*' (exactly one segment).
    const single = map.get(`${parent}.*`)
    if (single !== undefined) {
      return evaluate(single, context)
    }

    // 3. Recursive subtree wildcards — 'posts.admin.delete' matches 'posts.admin.**'
    //    then 'posts.**', most-specific ancestor first. `**` matches any depth
    //    STRICTLY below the prefix (so 'posts.**' covers 'posts.x' and 'posts.x.y',
    //    but the prefix 'posts' itself is matched by 'posts.*' / an exact 'posts').
    let ancestor = parent
    while (true) {
      const recursive = map.get(`${ancestor}.**`)
      if (recursive !== undefined) {
        return evaluate(recursive, context)
      }
      const i = ancestor.lastIndexOf('.')
      if (i === -1) break
      ancestor = ancestor.slice(0, i)
    }
  }

  // 4. Global wildcard (matches any key, any depth)
  const global = map.get('*')
  if (global !== undefined) {
    return evaluate(global, context)
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

  function toMap(obj?: PermissionMap): Map<string, PermissionValue> {
    if (!obj) return new Map()
    return new Map(Object.entries(obj))
  }

  // The main check function — reads `version` to subscribe in reactive contexts
  function can(key: string, context?: unknown): boolean {
    // Reading version subscribes this call to reactive updates
    version()
    return resolve(store.peek(), key, context)
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
      store.set(toMap(permissions))
      version.update((v) => v + 1)
    })
  }

  can.patch = (permissions: PermissionMap): void => {
    batch(() => {
      const current = store.peek()
      for (const [key, value] of Object.entries(permissions)) {
        current.set(key, value)
      }
      store.set(current)
      version.update((v) => v + 1)
    })
  }

  can.clear = (): void => {
    batch(() => {
      store.set(new Map())
      version.update((v) => v + 1)
    })
  }

  can.assert = (key: string, context?: unknown): void => {
    if (!can(key, context)) {
      throw new Error(`[Pyreon] permission denied: '${key}'`)
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
