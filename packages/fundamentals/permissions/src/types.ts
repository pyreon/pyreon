import type { Computed } from "@pyreon/reactivity";

// ─── Permission values ───────────────────────────────────────────────────────

/**
 * A permission predicate — receives optional context and returns a boolean.
 * Used for instance-level checks (e.g., "can update THIS post?").
 */
export type PermissionPredicate<TContext = unknown> = (context?: TContext) => boolean;

/**
 * A permission value is either a static boolean or a predicate function.
 * - `true` / `false` — static grant or denial
 * - `(context?) => boolean` — dynamic, evaluated per-check
 */
export type PermissionValue<TContext = unknown> = boolean | PermissionPredicate<TContext>;

// ─── Permission map ──────────────────────────────────────────────────────────

/**
 * A map of permission keys to their values.
 * Keys are dot-separated strings (e.g., 'posts.read', 'users.manage').
 * Wildcards are supported: 'posts.*' matches any 'posts.X' key.
 */
export type PermissionMap = Record<string, PermissionValue>;

// ─── Permissions instance ────────────────────────────────────────────────────

/**
 * The permissions instance returned by `createPermissions()`.
 * Callable — `can('posts.read')` returns a boolean, reactive in effects/computeds/JSX.
 */
export interface Permissions {
  /**
   * Check if a permission is granted.
   * Returns a boolean — reactive when read inside effects, computeds, or JSX `{() => ...}`.
   *
   * @param key - Permission key (e.g., 'posts.read')
   * @param context - Optional context for predicate evaluation (e.g., a post instance)
   *
   * @example
   * ```tsx
   * can('posts.read')              // static check
   * can('posts.update', post)      // instance check
   * {() => can('posts.delete') && <DeleteButton />}
   * ```
   */
  (key: string, context?: unknown): boolean;

  /**
   * Inverse check — returns true when the permission is denied.
   *
   * @example
   * ```tsx
   * can.not('billing.export')  // true if user cannot export
   * ```
   */
  not: (key: string, context?: unknown) => boolean;

  /**
   * Check if ALL listed permissions are granted.
   *
   * @example
   * ```tsx
   * can.all('posts.read', 'posts.create')
   * ```
   */
  all: (...keys: string[]) => boolean;

  /**
   * Check if ANY of the listed permissions is granted.
   *
   * @example
   * ```tsx
   * can.any('posts.update', 'posts.delete')
   * ```
   */
  any: (...keys: string[]) => boolean;

  /**
   * Replace all permissions. All reactive reads update automatically.
   *
   * @example
   * ```tsx
   * can.set({ 'posts.read': true, 'users.manage': false })
   * ```
   */
  set: (permissions: PermissionMap) => void;

  /**
   * Merge permissions into the current map.
   * Existing keys are overwritten, new keys are added.
   *
   * @example
   * ```tsx
   * can.patch({ 'billing.export': true })
   * ```
   */
  patch: (permissions: PermissionMap) => void;

  /**
   * All currently granted permission keys (static true + predicates that exist).
   * Reactive signal — updates when permissions change.
   *
   * @example
   * ```tsx
   * // For help dialogs or admin dashboards
   * can.granted()  // ['posts.read', 'posts.create', 'users.manage']
   * ```
   */
  granted: Computed<string[]>;

  /**
   * All permission entries as [key, value] pairs.
   * Reactive signal — updates when permissions change.
   */
  entries: Computed<[string, PermissionValue][]>;
}
