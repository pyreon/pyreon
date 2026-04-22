import type { ComponentFn } from '@pyreon/core'

export type { ComponentFn }

// ─── Path param extraction ────────────────────────────────────────────────────

/**
 * Extracts typed params from a path string at compile time.
 * Supports optional params via `:param?` — their type is `string | undefined`.
 *
 * @example
 * ExtractParams<'/user/:id/posts/:postId'>
 * // → { id: string; postId: string }
 *
 * ExtractParams<'/user/:id?'>
 * // → { id?: string | undefined }
 */
export type ExtractParams<T extends string> = T extends `${string}:${infer Param}*/${infer Rest}`
  ? { [K in Param]: string } & ExtractParams<`/${Rest}`>
  : T extends `${string}:${infer Param}*`
    ? { [K in Param]: string }
    : T extends `${string}:${infer Param}?/${infer Rest}`
      ? { [K in Param]?: string | undefined } & ExtractParams<`/${Rest}`>
      : T extends `${string}:${infer Param}?`
        ? { [K in Param]?: string | undefined }
        : T extends `${string}:${infer Param}/${infer Rest}`
          ? { [K in Param]: string } & ExtractParams<`/${Rest}`>
          : T extends `${string}:${infer Param}`
            ? { [K in Param]: string }
            : Record<never, never>

// ─── Route meta ───────────────────────────────────────────────────────────────

/**
 * Route metadata interface. Extend it via module augmentation to add custom fields:
 *
 * @example
 * // globals.d.ts
 * declare module "@pyreon/router" {
 *   interface RouteMeta {
 *     requiresRole?: "admin" | "user"
 *     pageTitle?: string
 *   }
 * }
 */
export interface RouteMeta {
  /** Sets document.title on navigation */
  title?: string
  /** Page description (for meta tags) */
  description?: string
  /** If true, guards can redirect to login */
  requiresAuth?: boolean
  /** Scroll behavior for this route */
  scrollBehavior?: 'top' | 'restore' | 'none'
  /** Set to false to disable View Transitions API for this route. Default: true */
  viewTransition?: boolean
}

// ─── Resolved route ───────────────────────────────────────────────────────────

export interface ResolvedRoute<
  P extends Record<string, string | undefined> = Record<string, string>,
  Q extends Record<string, string> = Record<string, string>,
> {
  path: string
  params: P
  query: Q
  hash: string
  /** All matched records from root to leaf (one per nesting level) */
  matched: RouteRecord[]
  meta: RouteMeta
  /** Middleware data attached during navigation (populated by middleware chain) */
  _middlewareData?: Record<string, unknown> | undefined
}

// ─── Lazy component ───────────────────────────────────────────────────────────

export const LAZY_SYMBOL = Symbol('pyreon.lazy')

export interface LazyComponent {
  readonly [LAZY_SYMBOL]: true
  readonly loader: () => Promise<ComponentFn | { default: ComponentFn }>
  /** Optional component shown while the lazy chunk is loading */
  readonly loadingComponent?: ComponentFn
  /** Optional component shown after all retries have failed */
  readonly errorComponent?: ComponentFn
}

export function lazy(
  loader: () => Promise<ComponentFn | { default: ComponentFn }>,
  options?: { loading?: ComponentFn; error?: ComponentFn },
): LazyComponent {
  return {
    [LAZY_SYMBOL]: true,
    loader,
    ...(options?.loading ? { loadingComponent: options.loading } : {}),
    ...(options?.error ? { errorComponent: options.error } : {}),
  }
}

export function isLazy(c: RouteComponent): c is LazyComponent {
  return typeof c === 'object' && c !== null && (c as LazyComponent)[LAZY_SYMBOL] === true
}

export type RouteComponent = ComponentFn | LazyComponent

// ─── Navigation guard ─────────────────────────────────────────────────────────

export type NavigationGuardResult = boolean | string | undefined
export type NavigationGuard = (
  to: ResolvedRoute,
  from: ResolvedRoute,
) => NavigationGuardResult | Promise<NavigationGuardResult>

export type AfterEachHook = (to: ResolvedRoute, from: ResolvedRoute) => void

// ─── Route middleware ────────────────────────────────────────────────────────

/**
 * Context object passed through the middleware chain.
 * Middleware can read/write arbitrary data on `ctx.data`.
 */
export interface RouteMiddlewareContext {
  /** The route being navigated to. */
  to: ResolvedRoute
  /** The route being navigated from. */
  from: ResolvedRoute
  /** Shared data — middleware can accumulate state here for downstream middleware/components. */
  data: Record<string, unknown>
}

/**
 * Route middleware function. Called before guards.
 * - Return nothing/undefined to continue
 * - Return `false` to cancel navigation
 * - Return a string to redirect
 */
export type RouteMiddleware = (
  ctx: RouteMiddlewareContext,
) => void | false | string | Promise<void | false | string>

// ─── Navigation blockers ──────────────────────────────────────────────────────

/**
 * Called before each navigation. Return `true` to block, `false` to allow.
 * Async blockers are supported (e.g. to show a confirmation dialog).
 */
export type BlockerFn = (to: ResolvedRoute, from: ResolvedRoute) => boolean | Promise<boolean>

export interface Blocker {
  /** Unregister this blocker so future navigations proceed freely. */
  remove(): void
}

// ─── Route loaders ────────────────────────────────────────────────────────────

export interface LoaderContext {
  params: Record<string, string>
  query: Record<string, string>
  /** Aborted when a newer navigation supersedes this one */
  signal: AbortSignal
}

export type RouteLoaderFn = (ctx: LoaderContext) => Promise<unknown>

// ─── Route record ─────────────────────────────────────────────────────────────

export interface RouteRecord<TPath extends string = string> {
  /** Path pattern — supports `:param` segments and `(.*)` wildcard */
  path: TPath
  component: RouteComponent
  /** Optional route name for named navigation */
  name?: string
  /** Metadata attached to this route */
  meta?: RouteMeta
  /**
   * Redirect target. Evaluated before guards.
   * String: redirect to that path.
   * Function: called with the resolved route, return path string.
   */
  redirect?: string | ((to: ResolvedRoute) => string)
  /** Guard(s) run only for this route, before global beforeEach guards */
  beforeEnter?: NavigationGuard | NavigationGuard[]
  /** Guard(s) run before leaving this route. Return false to cancel. */
  beforeLeave?: NavigationGuard | NavigationGuard[]
  /**
   * Alternative path(s) for this route. Alias paths render the same component
   * and share guards, loaders, and metadata with the primary path.
   *
   * @example
   * { path: "/user/:id", alias: ["/profile/:id"], component: UserPage }
   */
  alias?: string | string[]
  /** Child routes rendered inside this route's component via <RouterView /> */
  children?: RouteRecord[]
  /**
   * Data loader — runs before navigation commits, in parallel with sibling loaders.
   * The result is accessible via `useLoaderData()` inside the route component.
   * Receives an AbortSignal that fires if a newer navigation supersedes this one.
   */
  loader?: RouteLoaderFn
  /**
   * When true, the router shows cached loader data immediately (stale) and
   * revalidates in the background. The component re-renders once fresh data arrives.
   * Only applies when navigating to a route that already has cached loader data.
   */
  staleWhileRevalidate?: boolean
  /** Component rendered when this route's loader throws an error */
  errorComponent?: ComponentFn
  /** Per-route middleware — runs before guards, can accumulate context data. */
  middleware?: RouteMiddleware | RouteMiddleware[]
}

// ─── Router options ───────────────────────────────────────────────────────────

export type ScrollBehaviorFn = (
  to: ResolvedRoute,
  from: ResolvedRoute,
  savedPosition: number | null,
) => 'top' | 'restore' | 'none' | number

export interface RouterOptions {
  routes: RouteRecord[]
  /** "hash" (default) uses location.hash; "history" uses pushState */
  mode?: 'hash' | 'history'
  /**
   * Base path for the application. Used when deploying to a sub-path
   * (e.g. `"/app"` for `https://example.com/app/`).
   * Only applies in history mode. Must start with `/`.
   * Default: `""` (no base path).
   */
  base?: string
  /**
   * Global scroll behavior. Per-route meta.scrollBehavior takes precedence.
   * Default: "top"
   */
  scrollBehavior?: ScrollBehaviorFn | 'top' | 'restore' | 'none'
  /**
   * Initial URL for SSR. On the server, window.location is unavailable;
   * pass the request URL here so the router resolves the correct route.
   *
   * @example
   * // In your SSR handler:
   * const router = createRouter({ routes, url: req.url })
   */
  url?: string
  /**
   * Called when a route loader throws. If not provided, errors are logged
   * and the navigation continues with `undefined` data for the failed loader.
   * Return `false` to cancel the navigation.
   */
  onError?: (err: unknown, route: ResolvedRoute) => undefined | false
  /**
   * Maximum number of resolved lazy components to cache.
   * When exceeded, the oldest entry is evicted.
   * Default: 100.
   */
  maxCacheSize?: number
  /**
   * Trailing slash handling:
   *   - `"strip"` — removes trailing slashes before matching (default)
   *   - `"add"` — ensures paths always end with `/`
   *   - `"ignore"` — no normalization
   */
  trailingSlash?: 'strip' | 'add' | 'ignore'
}

// ─── Router interface ─────────────────────────────────────────────────────────

/**
 * Router interface. Parameterized by route name union for type-safe named navigation.
 *
 * @example
 * ```ts
 * type MyRoutes = 'home' | 'user' | 'settings'
 * const router: Router<MyRoutes> = createRouter({ routes })
 * router.push({ name: 'user', params: { id: '42' } }) // ✓
 * router.push({ name: 'typo' })                        // TS error
 * ```
 */
export interface Router<TNames extends string = string> {
  /** Navigate to a path */
  push(path: string): Promise<void>
  /** Navigate to a named route */
  push(location: {
    name: TNames
    params?: Record<string, string>
    query?: Record<string, string>
  }): Promise<void>
  /** Replace current history entry */
  replace(path: string): Promise<void>
  /** Replace current history entry using a named route */
  replace(location: {
    name: TNames
    params?: Record<string, string>
    query?: Record<string, string>
  }): Promise<void>
  /** Go back one step in history */
  back(): void
  /** Go forward one step in history */
  forward(): void
  /** Navigate forward or backward by `delta` steps in the history stack */
  go(delta: number): void
  /** Register a global before-navigation guard. Returns an unregister function. */
  beforeEach(guard: NavigationGuard): () => void
  /** Register a global after-navigation hook. Returns an unregister function. */
  afterEach(hook: AfterEachHook): () => void
  /** Current resolved route (reactive signal) */
  readonly currentRoute: () => ResolvedRoute
  /** True while a navigation (guards + loaders) is in flight */
  readonly loading: () => boolean
  /**
   * Promise that resolves once the initial navigation is complete.
   * Useful for SSR and for delaying rendering until the first route is resolved.
   */
  isReady(): Promise<void>
  /**
   * Resolve `path` and prepare everything needed to render it: load any lazy
   * route components into the router's cache and run the matched routes'
   * loaders. After this resolves, a `RouterView` rendered against this router
   * for `path` will produce final HTML synchronously — no loading fallbacks,
   * no `useLoaderData()` returning `undefined`.
   *
   * Used by SSR/SSG to hydrate the route tree before `renderToString`.
   * The router's `currentRoute` is NOT changed by `preload` — pass the path
   * separately when creating the router (`createRouter({ url, ... })`) or
   * call this for the same `url` you initialised the router with.
   */
  preload(path: string): Promise<void>
  /** Remove all event listeners, clear caches, and abort in-flight navigations. */
  destroy(): void
}

// ─── Internal router instance ─────────────────────────────────────────────────

import type { Computed, Signal } from '@pyreon/reactivity'

export interface RouterInstance extends Router {
  routes: RouteRecord[]
  mode: 'hash' | 'history'
  /** Normalized base path (e.g. "/app"), empty string if none */
  _base: string
  _currentPath: Signal<string>
  _currentRoute: Computed<ResolvedRoute>
  _componentCache: Map<RouteRecord, ComponentFn>
  _loadingSignal: Signal<number>
  _resolve(rawPath: string): ResolvedRoute
  _scrollPositions: Map<string, number>
  _scrollBehavior: RouterOptions['scrollBehavior']
  _onError: RouterOptions['onError']
  _maxCacheSize: number
  /**
   * Current RouterView nesting depth. Incremented by each RouterView as it
   * mounts (in tree order = depth-first), so each view knows which level of
   * `matched[]` to render. Reset to 0 by RouterProvider.
   */
  _viewDepth: number
  /** Route records whose lazy chunk permanently failed (all retries exhausted) */
  _erroredChunks: Set<RouteRecord>
  /** Loader data keyed by route record — populated before each navigation commits */
  _loaderData: Map<RouteRecord, unknown>
  /** AbortController for the in-flight loader batch — aborted when a newer navigation starts */
  _abortController: AbortController | null
  /** Registered navigation blockers */
  _blockers: Set<BlockerFn>
  /** Resolves the isReady() promise after initial navigation completes */
  _readyResolve: (() => void) | null
  /** The isReady() promise instance */
  _readyPromise: Promise<void>
}
