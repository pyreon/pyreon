/**
 * @pyreon/router — type-safe client-side router for Pyreon.
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

export type { RouterLinkProps, RouterProviderProps, RouterViewProps } from './components'
// Components
export { RouterLink, RouterProvider, RouterView } from './components'
export type { NotFoundBoundaryProps } from './not-found'
export { isNotFoundError, NotFoundBoundary, notFound } from './not-found'
export { hydrateLoaderData, prefetchLoaderData, serializeLoaderData, useLoaderData } from './loader'
// Match utilities (useful for SSR route pre-fetching)
export {
  buildPath,
  findRouteByName,
  parseQuery,
  parseQueryMulti,
  resolveRoute,
  stringifyQuery,
} from './match'
// Router factory + hooks
export {
  createRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  RouterContext,
  useBlocker,
  useIsActive,
  useRoute,
  useRouter,
  useMiddlewareData,
  useSearchParams,
  useTransition,
  useTypedSearchParams,
  useValidatedSearch,
} from './router'
// Types
// Data loaders
export type {
  AfterEachHook,
  Blocker,
  BlockerFn,
  ExtractParams,
  LazyComponent,
  LoaderContext,
  NavigationGuard,
  NavigationGuardResult,
  ResolvedRoute,
  RouteComponent,
  RouteLoaderFn,
  RouteMeta,
  RouteMiddleware,
  RouteMiddlewareContext,
  RouteRecord,
  Router,
  RouterOptions,
  ScrollBehaviorFn,
} from './types'
// Lazy helper
export { lazy } from './types'
