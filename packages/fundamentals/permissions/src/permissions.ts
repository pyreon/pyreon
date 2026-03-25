import { computed, signal } from "@pyreon/reactivity"
import type { PermissionMap, Permissions, PermissionValue } from "./types"

/**
 * Resolve a permission key against the map.
 * Resolution order: exact match → wildcard (e.g., 'posts.*') → global wildcard ('*') → false.
 */
/**
 * Safely evaluate a permission value. Predicates that throw are treated as denied.
 */
function evaluate(value: PermissionValue, context?: unknown): boolean {
  if (typeof value === "function") {
    try {
      return value(context)
    } catch {
      return false
    }
  }
  return value
}

function resolve(map: Map<string, PermissionValue>, key: string, context?: unknown): boolean {
  // 1. Exact match
  const exact = map.get(key)
  if (exact !== undefined) {
    return evaluate(exact, context)
  }

  // 2. Wildcard match — 'posts.read' matches 'posts.*'
  const dotIndex = key.lastIndexOf(".")
  if (dotIndex !== -1) {
    const prefix = key.slice(0, dotIndex)
    const wildcard = map.get(`${prefix}.*`)
    if (wildcard !== undefined) {
      return evaluate(wildcard, context)
    }
  }

  // 3. Global wildcard
  const global = map.get("*")
  if (global !== undefined) {
    return evaluate(global, context)
  }

  // 4. No match → denied
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
    store.set(toMap(permissions))
    version.update((v) => v + 1)
  }

  can.patch = (permissions: PermissionMap): void => {
    const current = store.peek()
    for (const [key, value] of Object.entries(permissions)) {
      current.set(key, value)
    }
    store.set(current)
    version.update((v) => v + 1)
  }

  can.granted = computed(() => {
    version()
    const keys: string[] = []
    for (const [key, value] of store.peek()) {
      // Static true or predicate (capability exists)
      if (value === true || typeof value === "function") {
        keys.push(key)
      }
    }
    return keys
  })

  can.entries = computed(() => {
    version()
    return [...store.peek().entries()]
  })

  return can as Permissions
}
