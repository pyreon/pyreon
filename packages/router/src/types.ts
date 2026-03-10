import type { ComponentFn } from "@pyreon/core"
export type { ComponentFn }

// ─── Path param extraction ────────────────────────────────────────────────────

/**
 * Extracts typed params from a path string at compile time.
 *
 * @example
 * ExtractParams<'/user/:id/posts/:postId'>
 * // → { id: string; postId: string }
 */
export type ExtractParams<T extends string> = T extends `${string}:${infer Param}*/${infer Rest}`
  ? { [K in Param]: string } & ExtractParams<`/${Rest}`>
  : T extends `${string}:${infer Param}*`
    ? { [K in Param]: string }
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
  scrollBehavior?: "top" | "restore" | "none"
}

// ─── Resolved route ───────────────────────────────────────────────────────────

export interface ResolvedRoute<
  P extends Record<string, string> = Record<string, string>,
  Q extends Record<string, string> = Record<string, string>,
> {
  path: string
  params: P
  query: Q
  hash: string
  /** All matched records from root to leaf (one per nesting level) */
  matched: RouteRecord[]
  meta: RouteMeta
}

// ─── Lazy component ───────────────────────────────────────────────────────────

export const LAZY_SYMBOL = Symbol("pyreon.lazy")

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
  return typeof c === "object" && c !== null && (c as LazyComponent)[LAZY_SYMBOL] === true
}

export type RouteComponent = ComponentFn | LazyComponent

// ─── Navigation guard ─────────────────────────────────────────────────────────

export type NavigationGuardResult = boolean | string | undefined
export type NavigationGuard = (
  to: ResolvedRoute,
  from: ResolvedRoute,
) => NavigationGuardResult | Promise<NavigationGuardResult>

export type AfterEachHook = (to: ResolvedRoute, from: ResolvedRoute) => void

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
  /** Child routes rendered inside this route's component via <RouterView /> */
  children?: RouteRecord[]
  /**
   * Data loader — runs before navigation commits, in parallel with sibling loaders.
   * The result is accessible via `useLoaderData()` inside the route component.
   * Receives an AbortSignal that fires if a newer navigation supersedes this one.
   */
  loader?: RouteLoaderFn
  /** Component rendered when this route's loader throws an error */
  errorComponent?: ComponentFn
}

// ─── Router options ───────────────────────────────────────────────────────────

export type ScrollBehaviorFn = (
  to: ResolvedRoute,
  from: ResolvedRoute,
  savedPosition: number | null,
) => "top" | "restore" | "none" | number

export interface RouterOptions {
  routes: RouteRecord[]
  /** "hash" (default) uses location.hash; "history" uses pushState */
  mode?: "hash" | "history"
  /**
   * Global scroll behavior. Per-route meta.scrollBehavior takes precedence.
   * Default: "top"
   */
  scrollBehavior?: ScrollBehaviorFn | "top" | "restore" | "none"
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
}

// ─── Router interface ─────────────────────────────────────────────────────────

export interface Router {
  /** Navigate to a path */
  push(path: string): Promise<void>
  /** Navigate to a path by name */
  push(location: {
    name: string
    params?: Record<string, string>
    query?: Record<string, string>
  }): Promise<void>
  /** Replace current history entry */
  replace(path: string): Promise<void>
  /** Go back */
  back(): void
  /** Register a global before-navigation guard. Returns an unregister function. */
  beforeEach(guard: NavigationGuard): () => void
  /** Register a global after-navigation hook. Returns an unregister function. */
  afterEach(hook: AfterEachHook): () => void
  /** Current resolved route (reactive signal) */
  readonly currentRoute: () => ResolvedRoute
  /** True while a navigation (guards + loaders) is in flight */
  readonly loading: () => boolean
  /** Remove all event listeners, clear caches, and abort in-flight navigations. */
  destroy(): void
}

// ─── Internal router instance ─────────────────────────────────────────────────

import type { Computed, Signal } from "@pyreon/reactivity"

export interface RouterInstance extends Router {
  routes: RouteRecord[]
  mode: "hash" | "history"
  _currentPath: Signal<string>
  _currentRoute: Computed<ResolvedRoute>
  _componentCache: Map<RouteRecord, ComponentFn>
  _loadingSignal: Signal<number>
  _resolve(rawPath: string): ResolvedRoute
  _scrollPositions: Map<string, number>
  _scrollBehavior: RouterOptions["scrollBehavior"]
  _onError: RouterOptions["onError"]
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
}
