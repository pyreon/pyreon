import type { VNodeChild } from '@pyreon/core'
import { createContext, nativeCompat, provide, useContext } from '@pyreon/core'
import { createPermissions } from './permissions'
import type { PermissionMap, Permissions } from './types'

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
 * Access a permissions instance.
 *
 * Two forms, and both run on every target:
 *
 * - `usePermissions()` reads the nearest `<PermissionsProvider>`. Use it when
 *   the grants come from the session — one place decides, the whole tree reads.
 * - `usePermissions(['posts.edit', 'posts.*'])` builds a self-contained
 *   instance seeded with those grants and needs no provider. Use it when the
 *   grants are a fixed property of the screen.
 *
 * The seeded form exists because it is the shape the native targets compile to:
 * `@pyreon/native-compiler` lowers it to a `PyreonPermissions` seeded with the
 * same literal keys. Before this it was native-only — the identical call threw
 * `must be used within <PermissionsProvider>` in a browser, so a screen written
 * once could not run on all three targets.
 *
 * @example
 * ```tsx
 * const can = usePermissions()                  // from the provider
 * const can = usePermissions(['posts.edit'])    // self-contained
 * {() => can('posts.edit') && <EditButton />}
 * ```
 */
export function usePermissions(grants?: readonly string[]): Permissions {
  // A seeded call is self-contained by definition — it says what it grants, so
  // there is nothing for a provider to contribute and no reason to require one.
  if (grants && grants.length > 0) {
    const map: PermissionMap = {}
    for (const key of grants) map[key] = true
    return createPermissions(map)
  }
  const instance = useContext(PermissionsContext)
  if (!instance) {
    throw new Error(
      '[Pyreon] usePermissions() must be used within <PermissionsProvider>, or seeded at the call site: usePermissions([\'posts.edit\']).',
    )
  }
  return instance
}
