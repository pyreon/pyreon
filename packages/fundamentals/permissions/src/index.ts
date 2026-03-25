/**
 * @pyreon/permissions — Reactive permissions for Pyreon.
 *
 * A permission is a boolean or a function. Check with `can()` — reactive
 * in effects, computeds, and JSX. Universal: RBAC, ABAC, feature flags,
 * subscription tiers — any model maps to string keys.
 *
 * @example
 * ```tsx
 * import { createPermissions } from '@pyreon/permissions'
 *
 * const can = createPermissions({
 *   'posts.read': true,
 *   'posts.update': (post: Post) => post.authorId === userId(),
 *   'users.manage': false,
 * })
 *
 * // Reactive check in JSX
 * {() => can('posts.read') && <PostList />}
 *
 * // Update after login
 * can.set(fromRole(user.role))
 * ```
 */

export { PermissionsProvider, usePermissions } from "./context"
export { createPermissions } from "./permissions"

// Types
export type {
  PermissionMap,
  PermissionPredicate,
  Permissions,
  PermissionValue,
} from "./types"
