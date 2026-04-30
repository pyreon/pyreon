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
 * <PermissionsProvider instance={can}>
 *   <App />
 * </PermissionsProvider>
 * ```
 */
export function PermissionsProvider(props: {
  instance: Permissions
  children?: VNodeChild
}): VNodeChild {
  provide(PermissionsContext, props.instance)

  return props.children ?? null
}

// Mark as native — compat-mode jsx() runtimes skip wrapCompatComponent so
// provide(PermissionsContext, ...) runs inside Pyreon's setup frame.
nativeCompat(PermissionsProvider)

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
      '[@pyreon/permissions] usePermissions() must be used within <PermissionsProvider>.',
    )
  }
  return instance
}
