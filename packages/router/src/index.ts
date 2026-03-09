/**
 * @pyreon/router — type-safe client-side router for Nova.
 *
 * Features:
 *   - TypeScript param inference from path strings
 *   - Nested routes with recursive matching
 *   - Per-route and global navigation guards
 *   - Redirects (static and dynamic)
 *   - Route metadata (title, requiresAuth, scrollBehavior, …)
 *   - Named routes + typed navigation
 *   - Lazy loading with optional loading component
 *   - Scroll restoration
 *   - Hash and history mode
 *
 * @example
 * const router = createRouter({
 *   routes: [
 *     { path: "/",            component: Home },
 *     { path: "/about",       component: About },
 *     { path: "/user/:id",    component: UserPage, name: "user",
 *       meta: { title: "User Profile" } },
 *     {
 *       path: "/admin",
 *       component: AdminLayout,
 *       meta: { requiresAuth: true },
 *       children: [
 *         { path: "users",    component: AdminUsers },
 *         { path: "settings", component: AdminSettings },
 *       ],
 *     },
 *     { path: "/settings", redirect: "/admin/settings" },
 *     { path: "(.*)",         component: NotFound },
 *   ],
 * })
 *
 * // Typed params:
 * const route = useRoute<"/user/:id">()
 * route().params.id  // string
 *
 * // Named navigation:
 * router.push({ name: "user", params: { id: "42" } })
 */

// Types
export type {
  ExtractParams,
  RouteMeta,
  ResolvedRoute,
  LazyComponent,
  RouteComponent,
  NavigationGuardResult,
  NavigationGuard,
  AfterEachHook,
  RouteRecord,
  RouterOptions,
  ScrollBehaviorFn,
  Router,
} from "./types"

// Lazy helper
export { lazy } from "./types"

// Router factory + hooks
export { createRouter, useRouter, useRoute, RouterContext } from "./router"

// Components
export { RouterProvider, RouterView, RouterLink } from "./components"
export type { RouterProviderProps, RouterViewProps, RouterLinkProps } from "./components"

// Data loaders
export type { LoaderContext, RouteLoaderFn } from "./types"
export { useLoaderData, prefetchLoaderData, serializeLoaderData, hydrateLoaderData } from "./loader"

// Match utilities (useful for SSR route pre-fetching)
export { resolveRoute, parseQuery, stringifyQuery, buildPath, findRouteByName } from "./match"
