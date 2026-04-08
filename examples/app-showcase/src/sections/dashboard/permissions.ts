import { createPermissions } from '@pyreon/permissions'

/**
 * Dashboard permissions singleton.
 *
 * The actual `Permissions` instance lives at module scope so the
 * permission state can be flipped from anywhere (e.g. the role toggle
 * in the header) without prop drilling. Mounted into the component
 * tree via `<PermissionsProvider>` in the dashboard route.
 *
 * The full app would normally derive permissions from a user object
 * coming from a `useQuery` call against `/api/me`; this stub keeps the
 * showcase self-contained.
 */
export type Role = 'admin' | 'viewer'

const ADMIN_PERMS = {
  'orders.view': true,
  'orders.refund': true,
  'customers.view': true,
  'customers.update': true,
}

const VIEWER_PERMS = {
  'orders.view': true,
  'orders.refund': false,
  'customers.view': true,
  'customers.update': false,
}

/** Singleton permissions instance for the dashboard section. */
export const dashboardPermissions = createPermissions(ADMIN_PERMS)

/** Switch the active role and patch the permissions in one batch. */
export function setRole(role: Role): void {
  dashboardPermissions.set(role === 'admin' ? ADMIN_PERMS : VIEWER_PERMS)
}

/**
 * Sugar so consumers don't have to call `usePermissions()` themselves —
 * they get the singleton directly. The `useDashboardPermissions` name
 * matches the convention of other Pyreon hooks.
 */
export function useDashboardPermissions() {
  return dashboardPermissions
}
