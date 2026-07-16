import type { VNodeChild } from '@pyreon/core'
import { createContext, nativeCompat, provide, useContext } from '@pyreon/core'
import type { Permissions } from './types'

const PermissionsContext = createContext<Permissions | null>(null)

/**
 * Provide a permissions instance to descendant components.
 * Use this for SSR isolation or testing — each request/test gets its own instance.
 *
 * @example
 * ```tsx
 * const can = createPermissions({ ... })
 *
 * <PermissionsProvider value={can}>
 *   <App />
 * </PermissionsProvider>
 * ```
 */
function PermissionsProvider(props: {
  value: Permissions
  children?: VNodeChild
}): VNodeChild {
  provide(PermissionsContext, props.value)

  return props.children ?? null
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// provide(PermissionsContext, ...) runs inside Pyreon's setup frame.
// ASSIGNMENT + /* @__PURE__ */ form (not a bare statement): inside a built
// lib's shared chunk a bare `nativeCompat(X)` call is an unremovable side
// effect that RETAINS the component body in every consumer bundle that
// never imports it (see runtime-dom's native-compat-treeshake lock). The
// PURE call is droppable exactly when the export is unused; when used it
// returns the SAME fn with the marker applied.
const _PermissionsProvider = /* @__PURE__ */ nativeCompat(PermissionsProvider)
export { _PermissionsProvider as PermissionsProvider }
/**
 * Access the nearest permissions instance from context.
 * Must be used within a `<PermissionsProvider>`.
 *
 * @example
 * ```tsx
 * const can = usePermissions()
 * {() => can('posts.read') && <PostList />}
 * ```
 */
export function usePermissions(): Permissions {
  const instance = useContext(PermissionsContext)
  if (!instance) {
    throw new Error(
      '[Pyreon] usePermissions() must be used within <PermissionsProvider>.',
    )
  }
  return instance
}
