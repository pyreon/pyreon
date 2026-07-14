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

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/router
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export type { RouterLinkProps, RouterProviderProps, RouterViewProps } from './components'
// Components
export { RouterLink, RouterProvider, RouterView } from './components'
// Typed routes + external-link classification
export type {
  CheckHref,
  ExternalHref,
  InterpolateRoute,
  LinkConfig,
  LinkKind,
  RegisteredRoutes,
  RoutePath,
} from './typed-routes'
export { classifyHref, toRouterPath } from './typed-routes'
export type { NotFoundBoundaryProps } from './not-found'
export { isNotFoundError, NotFoundBoundary, notFound } from './not-found'
export type { RedirectStatus } from './redirect'
export { getRedirectInfo, isRedirectError, redirect } from './redirect'
export {
  hydrateLoaderData,
  prefetchLoaderData,
  serializeLoaderData,
  stringifyLoaderData,
  useLoaderData,
} from './loader'
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
  getActiveRouter,
  setActiveRouter,
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  RouterContext,
  useBlocker,
  useIsActive,
  useNavigate,
  useParams,
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
  NavigationResult,
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
