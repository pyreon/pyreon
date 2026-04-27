import { createContext, onUnmount, useContext } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { buildNameIndex, buildPath, resolveRoute, stringifyQuery } from './match'
import { ScrollManager } from './scroll'
import {
  type AfterEachHook,
  type Blocker,
  type BlockerFn,
  type ComponentFn,
  isLazy,
  type LoaderContext,
  type NavigationGuard,
  type NavigationGuardResult,
  type ResolvedRoute,
  type RouteMiddleware,
  type RouteMiddlewareContext,
  type RouteRecord,
  type Router,
  type RouterInstance,
  type RouterOptions,
} from './types'

// Evaluated once at module load — collapses to `true` in browser / happy-dom,
// `false` on the server. Using a constant avoids per-call `typeof` branches
// that are uncoverable in test environments.
const _isBrowser = typeof window !== 'undefined'
// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Router context ───────────────────────────────────────────────────────────
// Context-based access: isolated per request in SSR (ALS-backed via
// @pyreon/runtime-server), isolated per component tree in CSR.
// Falls back to the module-level singleton for code running outside a component
// tree (e.g. programmatic navigation from event handlers).

export const RouterContext = createContext<RouterInstance | null>(null)

// Module-level fallback — safe for CSR (single-threaded), not for concurrent SSR.
// RouterProvider also sets this so legacy useRouter() calls outside the tree work.
let _activeRouter: RouterInstance | null = null

export function getActiveRouter(): RouterInstance | null {
  return useContext(RouterContext) ?? _activeRouter
}

export function setActiveRouter(router: RouterInstance | null): void {
  if (router) router._viewDepth = 0
  _activeRouter = router
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useRouter(): Router {
  const router = useContext(RouterContext) ?? _activeRouter
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  return router
}

export function useRoute<TPath extends string = string>(): () => ResolvedRoute<
  import('./types').ExtractParams<TPath> & Record<string, string>,
  Record<string, string>
> {
  const router = useContext(RouterContext) ?? _activeRouter
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  return router.currentRoute as never
}

/**
 * In-component guard: called before the component's route is left.
 * Return `false` to cancel, a string to redirect, or `undefined`/`true` to proceed.
 * Automatically removed on component unmount.
 *
 * @example
 * onBeforeRouteLeave((to, from) => {
 *   if (hasUnsavedChanges()) return false
 * })
 */
export function onBeforeRouteLeave(guard: NavigationGuard): () => void {
  const router = (useContext(RouterContext) ?? _activeRouter) as RouterInstance | null
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  // Register as a global guard that only fires when leaving the current route
  const currentMatched = router.currentRoute().matched
  const wrappedGuard: NavigationGuard = (to, from) => {
    // Only fire if we're actually leaving one of the matched routes
    const isLeaving = from.matched.some((r) => currentMatched.includes(r))
    if (!isLeaving) return undefined
    return guard(to, from)
  }
  const remove = router.beforeEach(wrappedGuard)
  onUnmount(() => remove())
  return remove
}

/**
 * In-component guard: called when the route changes but the component is reused
 * (e.g. `/user/1` → `/user/2`). Useful for reacting to param changes.
 * Automatically removed on component unmount.
 *
 * @example
 * onBeforeRouteUpdate((to, from) => {
 *   if (!isValidId(to.params.id)) return false
 * })
 */
export function onBeforeRouteUpdate(guard: NavigationGuard): () => void {
  const router = (useContext(RouterContext) ?? _activeRouter) as RouterInstance | null
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  const currentMatched = router.currentRoute().matched
  const wrappedGuard: NavigationGuard = (to, from) => {
    // Only fire when the same component is reused (matched routes overlap)
    const isReused = to.matched.some((r) => currentMatched.includes(r))
    if (!isReused) return undefined
    return guard(to, from)
  }
  const remove = router.beforeEach(wrappedGuard)
  onUnmount(() => remove())
  return remove
}

/**
 * Register a navigation blocker. The `fn` callback is called before each
 * navigation — return `true` (or resolve to `true`) to block it.
 *
 * Automatically removed on component unmount if called during component setup.
 * Also installs a `beforeunload` handler so the browser shows a confirmation
 * dialog when the user tries to close the tab while a blocker is active.
 *
 * @example
 * const blocker = useBlocker((to, from) => {
 *   return hasUnsavedChanges() && !confirm("Discard changes?")
 * })
 * // later: blocker.remove()
 */
// Shared beforeunload handler — single listener for all active blockers.
// Attached when the first blocker registers, detached when the last one is
// removed. Avoids listener accumulation from multiple useBlocker() calls.
let _beforeUnloadRefCount = 0
const _beforeUnloadHandler = (e: BeforeUnloadEvent) => {
  e.preventDefault()
}

function retainBeforeUnload(): void {
  if (!_isBrowser) return
  if (_beforeUnloadRefCount === 0) {
    window.addEventListener('beforeunload', _beforeUnloadHandler)
  }
  _beforeUnloadRefCount++
}

function releaseBeforeUnload(): void {
  if (!_isBrowser) return
  _beforeUnloadRefCount--
  if (_beforeUnloadRefCount <= 0) {
    _beforeUnloadRefCount = 0
    window.removeEventListener('beforeunload', _beforeUnloadHandler)
  }
}

export function useBlocker(fn: BlockerFn): Blocker {
  const router = (useContext(RouterContext) ?? _activeRouter) as RouterInstance | null
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  router._blockers.add(fn)
  retainBeforeUnload()

  const remove = () => {
    router._blockers.delete(fn)
    releaseBeforeUnload()
  }

  // Auto-remove when the component that called useBlocker unmounts
  onUnmount(() => remove())

  return { remove }
}

/**
 * Reactive read/write access to the current route's query parameters.
 *
 * Returns `[get, set]` where `get` is a reactive signal producing the merged
 * query object and `set` navigates to the current path with updated params.
 *
 * @example
 * const [params, setParams] = useSearchParams({ page: "1", sort: "name" })
 * params().page  // "1" if not in URL
 * setParams({ page: "2" })  // navigates to ?page=2&sort=name
 */
/**
 * Check if a path is active (matches the current route).
 * Returns a reactive boolean signal.
 *
 * - Exact mode: `/admin` matches only `/admin`
 * - Partial mode (default): `/admin` matches `/admin`, `/admin/users`, `/admin/settings`
 *   Uses segment-aware prefix matching — `/admin` does NOT match `/admin-panel`
 *
 * @example
 * ```tsx
 * const isAdmin = useIsActive("/admin")           // partial — matches /admin/*
 * const isExact = useIsActive("/admin", true)     // exact — only /admin
 *
 * <div class={isAdmin() ? "active" : ""}>Admin</div>
 * <Show when={isAdmin()}><Badge>Active</Badge></Show>
 * ```
 */
export function useIsActive(path: string, exact = false): () => boolean {
  const router = (useContext(RouterContext) ?? _activeRouter) as RouterInstance | null
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  return () => {
    const current = router.currentRoute().path
    if (exact) {
      return matchSegments(current, path, true)
    }
    if (path === '/') return current === '/'
    // Segment-aware prefix: /admin matches /admin/users but NOT /admin-panel
    return matchSegments(current, path, false)
  }
}

/** Match current path segments against a pattern that may contain `:param` segments. */
function matchSegments(current: string, pattern: string, exact: boolean): boolean {
  const cs = current.split('/').filter(Boolean)
  const ps = pattern.split('/').filter(Boolean)
  if (exact) {
    if (cs.length !== ps.length) return false
    return ps.every((seg, i) => seg.startsWith(':') || seg === cs[i])
  }
  if (ps.length > cs.length) return false
  return ps.every((seg, i) => seg.startsWith(':') || seg === cs[i])
}

/** Schema entry for typed search params. */
export type SearchParamSchema = {
  [key: string]: 'string' | 'number' | 'boolean'
}

/** Infer the typed result from a search param schema. */
type InferSearchParams<T extends SearchParamSchema> = {
  [K in keyof T]: T[K] extends 'number' ? number : T[K] extends 'boolean' ? boolean : string
}

/**
 * Read and write URL search params reactively.
 *
 * @example Basic (untyped)
 * ```ts
 * const [params, setParams] = useSearchParams({ page: "1" })
 * params().page // "1"
 * setParams({ page: "2" }) // updates URL
 * ```
 *
 * @example Typed with schema
 * ```ts
 * const [params, setParams] = useSearchParams({
 *   page: 'number',
 *   sort: 'string',
 *   desc: 'boolean',
 * })
 * params().page  // number (auto-coerced)
 * params().desc  // boolean
 * ```
 */
export function useSearchParams<T extends Record<string, string>>(
  defaults?: T,
): [get: () => T, set: (updates: Partial<T>) => Promise<void>] {
  const router = _getRouter()
  const get = (): T => {
    const query = router.currentRoute().query
    if (!defaults) return query as T
    return { ...defaults, ...query } as T
  }
  const set = (updates: Partial<T>): Promise<void> => {
    const merged = { ...get(), ...updates }
    const path = router.currentRoute().path + stringifyQuery(merged as Record<string, string>)
    return router.replace(path)
  }
  return [get, set]
}

/**
 * Typed search params with auto-coercion.
 *
 * Schema values define the type: `'string'`, `'number'`, or `'boolean'`.
 * Query string values are automatically coerced to the declared type.
 *
 * @example
 * ```ts
 * const [params, setParams] = useTypedSearchParams({
 *   page: 'number',
 *   sort: 'string',
 *   desc: 'boolean',
 * })
 * params().page  // number (coerced from "3" → 3)
 * params().desc  // boolean (coerced from "true" → true)
 * setParams({ page: 2 }) // updates URL with ?page=2
 * ```
 */
export function useTypedSearchParams<T extends SearchParamSchema>(
  schema: T,
): [
  get: () => InferSearchParams<T>,
  set: (updates: Partial<InferSearchParams<T>>) => Promise<void>,
] {
  const router = _getRouter()
  const get = (): InferSearchParams<T> => {
    const query = router.currentRoute().query
    const result: Record<string, unknown> = {}
    for (const [key, type] of Object.entries(schema)) {
      const raw = query[key]
      if (type === 'number') {
        const n = raw !== undefined ? Number(raw) : 0
        result[key] = Number.isNaN(n) ? 0 : n
      } else if (type === 'boolean') result[key] = raw === 'true' || raw === '1'
      else result[key] = raw ?? ''
    }
    return result as InferSearchParams<T>
  }
  const set = (updates: Partial<InferSearchParams<T>>): Promise<void> => {
    const current = get()
    const merged: Record<string, string> = {}
    for (const [k, v] of Object.entries({ ...current, ...updates })) {
      merged[k] = String(v)
    }
    const path = router.currentRoute().path + stringifyQuery(merged)
    return router.replace(path)
  }
  return [get, set]
}

/**
 * Read the validated search params from the current route's `validateSearch`.
 * Returns a reactive accessor that re-evaluates when the route changes.
 *
 * The generic `T` should match the return type of your `validateSearch` function.
 *
 * @example
 * ```tsx
 * // Route config:
 * { path: '/search', validateSearch: (raw) => ({
 *   page: Number(raw.page) || 1,
 *   q: raw.q ?? '',
 * }), component: SearchPage }
 *
 * // In SearchPage:
 * const search = useValidatedSearch<{ page: number; q: string }>()
 * // search().page — typed as number
 * // search().q — typed as string
 * ```
 */
export function useValidatedSearch<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): () => T {
  const router = _getRouter()
  // Structural sharing: cache the previous result and return it if
  // shallow-equal to the new one. Prevents downstream re-renders when
  // unrelated query params change but the validated subset didn't.
  let prev: T | null = null
  return () => {
    const next = router.currentRoute().search as T
    if (prev && shallowEqual(prev, next)) return prev
    prev = next
    return next
  }
}

/** Shallow equality check for plain objects — keys + strict value comparison. */
function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

function _getRouter(): RouterInstance {
  const router = (useContext(RouterContext) ?? _activeRouter) as RouterInstance | null
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  return router
}

/**
 * Returns true while a navigation is in progress (guards + loaders running).
 * Use this to show loading indicators during route transitions.
 *
 * @example
 * ```tsx
 * const isNavigating = useTransition()
 * <Show when={isNavigating}>
 *   <LoadingBar />
 * </Show>
 * ```
 */
export function useTransition(): () => boolean {
  const router = _getRouter()
  return () => router._loadingSignal() > 0
}

/**
 * Read data accumulated by route middleware.
 *
 * @example
 * ```ts
 * // In middleware:
 * const authMiddleware: RouteMiddleware = async (ctx) => {
 *   ctx.data.user = await getUser(ctx.to)
 *   if (!ctx.data.user) return '/login'
 * }
 *
 * // In component:
 * const data = useMiddlewareData()
 * const user = () => data().user as User
 * ```
 */
export function useMiddlewareData(): () => Record<string, unknown> {
  const router = _getRouter()
  return () => router.currentRoute()._middlewareData ?? {}
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createRouter<TNames extends string = string>(
  options: RouterOptions | RouteRecord[],
): Router<TNames> {
  const opts: RouterOptions = Array.isArray(options) ? { routes: options } : options
  const {
    routes,
    mode = 'hash',
    scrollBehavior,
    onError,
    maxCacheSize = 100,
    trailingSlash = 'strip',
  } = opts

  // Base path only applies to history mode — hash-based routing already namespaces via #
  const base = mode === 'history' ? normalizeBase(opts.base ?? '') : ''

  // Pre-built O(1) name → record index. Computed once at startup.
  const nameIndex = buildNameIndex(routes)

  const guards: NavigationGuard[] = []
  const afterHooks: AfterEachHook[] = []
  const scrollManager = new ScrollManager(scrollBehavior)

  // Navigation generation counter — cancels in-flight navigations when a newer
  // one starts. Prevents out-of-order completion from stale async guards.
  let _navGen = 0

  // ── Initial location ──────────────────────────────────────────────────────

  const getInitialLocation = (): string => {
    // SSR: use explicitly provided url (strip base if present)
    if (opts.url) return stripBase(opts.url, base)
    if (!_isBrowser) return '/'
    if (mode === 'history') {
      return stripBase(window.location.pathname, base) + window.location.search
    }
    const hash = window.location.hash
    return hash.startsWith('#') ? hash.slice(1) || '/' : '/'
  }

  const getCurrentLocation = (): string => {
    if (!_isBrowser) return currentPath()
    if (mode === 'history') {
      return stripBase(window.location.pathname, base) + window.location.search
    }
    const hash = window.location.hash
    return hash.startsWith('#') ? hash.slice(1) || '/' : '/'
  }

  // ── Signals ───────────────────────────────────────────────────────────────

  const currentPath = signal(normalizeTrailingSlash(getInitialLocation(), trailingSlash))
  const currentRoute = computed<ResolvedRoute>(() => resolveRoute(currentPath(), routes))

  // Browser event listeners — stored so destroy() can remove them.
  // Ternary-bound on `_isBrowser` (a typeof-derived const) so the lint rule
  // can trace these to an SSR-safe shape without needing `if (_isBrowser &&
  // handler)` contortions at every use site.
  const _popstateHandler: (() => void) | null =
    _isBrowser && mode === 'history' ? () => currentPath.set(getCurrentLocation()) : null
  const _hashchangeHandler: (() => void) | null =
    _isBrowser && mode !== 'history' ? () => currentPath.set(getCurrentLocation()) : null

  if (_popstateHandler) window.addEventListener('popstate', _popstateHandler)
  if (_hashchangeHandler) window.addEventListener('hashchange', _hashchangeHandler)

  const componentCache = new Map<RouteRecord, ComponentFn>()
  const loadingSignal = signal(0)

  // ── Navigation ────────────────────────────────────────────────────────────

  type GuardOutcome =
    | { action: 'continue' }
    | { action: 'cancel' }
    | { action: 'redirect'; target: string }

  async function evaluateGuard(
    guard: NavigationGuard,
    to: ResolvedRoute,
    from: ResolvedRoute,
    gen: number,
  ): Promise<GuardOutcome> {
    const result = await runGuard(guard, to, from)
    if (gen !== _navGen) return { action: 'cancel' }
    if (result === false) return { action: 'cancel' }
    if (typeof result === 'string') return { action: 'redirect', target: result }
    return { action: 'continue' }
  }

  async function runRouteGuards(
    records: RouteRecord[],
    guardKey: 'beforeLeave' | 'beforeEnter',
    to: ResolvedRoute,
    from: ResolvedRoute,
    gen: number,
  ): Promise<GuardOutcome> {
    for (const record of records) {
      const raw = record[guardKey]
      if (!raw) continue
      const routeGuards = Array.isArray(raw) ? raw : [raw]
      for (const guard of routeGuards) {
        const outcome = await evaluateGuard(guard, to, from, gen)
        if (outcome.action !== 'continue') return outcome
      }
    }
    return { action: 'continue' }
  }

  async function runGlobalGuards(
    globalGuards: NavigationGuard[],
    to: ResolvedRoute,
    from: ResolvedRoute,
    gen: number,
  ): Promise<GuardOutcome> {
    for (const guard of globalGuards) {
      const outcome = await evaluateGuard(guard, to, from, gen)
      if (outcome.action !== 'continue') return outcome
    }
    return { action: 'continue' }
  }

  function processLoaderResult(
    result: PromiseSettledResult<unknown>,
    record: RouteRecord,
    ac: AbortController,
    to: ResolvedRoute,
  ): boolean {
    if (result.status === 'fulfilled') {
      router._loaderData.set(record, result.value)
      return true
    }
    if (ac.signal.aborted) return true
    if (router._onError) {
      const cancel = router._onError(result.reason, to)
      if (cancel === false) return false
    }
    router._loaderData.set(record, undefined)
    return true
  }

  function syncBrowserUrl(path: string, replace: boolean): void {
    if (!_isBrowser) return
    const url = mode === 'history' ? `${base}${path}` : `#${path}`
    if (replace) {
      window.history.replaceState(null, '', url)
    } else {
      window.history.pushState(null, '', url)
    }
  }

  function resolveRedirect(to: ResolvedRoute): string | null {
    const leaf = to.matched[to.matched.length - 1]
    if (!leaf?.redirect) return null
    return sanitizePath(typeof leaf.redirect === 'function' ? leaf.redirect(to) : leaf.redirect)
  }

  async function runAllGuards(
    to: ResolvedRoute,
    from: ResolvedRoute,
    gen: number,
  ): Promise<GuardOutcome> {
    const leaveOutcome = await runRouteGuards(from.matched, 'beforeLeave', to, from, gen)
    if (leaveOutcome.action !== 'continue') return leaveOutcome

    const enterOutcome = await runRouteGuards(to.matched, 'beforeEnter', to, from, gen)
    if (enterOutcome.action !== 'continue') return enterOutcome

    return runGlobalGuards(guards, to, from, gen)
  }

  /** Default cache key: path + serialized params */
  function defaultLoaderKey(
    record: RouteRecord,
    ctx: Pick<LoaderContext, 'params' | 'query'>,
  ): string {
    return `${record.path}:${JSON.stringify(ctx.params)}`
  }

  /** Get cache key for a route record + context. */
  function getCacheKey(record: RouteRecord, ctx: Pick<LoaderContext, 'params' | 'query'>): string {
    return record.loaderKey ? record.loaderKey(ctx) : defaultLoaderKey(record, ctx)
  }

  /** Check if a cached entry is still fresh (not expired by gcTime). */
  function isCacheFresh(entry: { timestamp: number }, record: RouteRecord): boolean {
    const gcTime = record.gcTime ?? 300_000 // 5 min default
    if (gcTime === 0) return false // caching disabled
    return Date.now() - entry.timestamp < gcTime
  }

  /**
   * Execute a loader with cache + dedup:
   * 1. Cache hit + fresh → return cached data (skip loader entirely)
   * 2. In-flight for same key → dedup (return existing promise)
   * 3. Otherwise → run loader, cache result, clean up in-flight
   */
  function executeLoader(record: RouteRecord, loaderCtx: LoaderContext): Promise<unknown> {
    if (!record.loader) return Promise.resolve(undefined)

    const key = getCacheKey(record, loaderCtx)

    // 1. Cache hit — skip for SWR routes (they always revalidate via the SWR path)
    if (!record.staleWhileRevalidate) {
      const cached = router._loaderCache.get(key)
      if (cached && isCacheFresh(cached, record)) {
        if (__DEV__) _countSink.__pyreon_count__?.('router.loaderCache.hit')
        return Promise.resolve(cached.data)
      }
    }

    // 2. Dedup in-flight
    const inflight = router._loaderInflight.get(key)
    if (inflight) return inflight

    // 3. Execute
    if (__DEV__) _countSink.__pyreon_count__?.('router.loaderRun')
    const promise = record
      .loader(loaderCtx)
      .then((data) => {
        router._loaderCache.set(key, { data, timestamp: Date.now() })
        router._loaderInflight.delete(key)
        return data
      })
      .catch((err) => {
        router._loaderInflight.delete(key)
        throw err
      })

    router._loaderInflight.set(key, promise)
    return promise
  }

  async function runBlockingLoaders(
    records: RouteRecord[],
    to: ResolvedRoute,
    gen: number,
    ac: AbortController,
  ): Promise<boolean> {
    const loaderCtx: LoaderContext = { params: to.params, query: to.query, signal: ac.signal }
    const results = await Promise.allSettled(records.map((r) => executeLoader(r, loaderCtx)))
    if (gen !== _navGen) return false
    for (let i = 0; i < records.length; i++) {
      const result = results[i]
      const record = records[i]
      if (!result || !record) continue
      if (!processLoaderResult(result, record, ac, to)) return false
    }
    return true
  }

  /** Fire-and-forget background revalidation for stale-while-revalidate routes. */
  function revalidateSwrLoaders(records: RouteRecord[], to: ResolvedRoute, ac: AbortController) {
    const loaderCtx: LoaderContext = { params: to.params, query: to.query, signal: ac.signal }
    for (const r of records) {
      if (!r.loader) continue
      // Bypass cache for revalidation — always fetch fresh
      r.loader(loaderCtx)
        .then((data) => {
          if (!ac.signal.aborted) {
            router._loaderData.set(r, data)
            // Update cache with fresh data
            const key = getCacheKey(r, loaderCtx)
            router._loaderCache.set(key, { data, timestamp: Date.now() })
            // Bump loadingSignal to trigger reactive re-render with fresh data
            loadingSignal.update((n) => n + 1)
            loadingSignal.update((n) => n - 1)
          }
        })
        .catch(() => {
          /* Background revalidation failure — stale data remains valid */
        })
    }
  }

  async function runLoaders(to: ResolvedRoute, gen: number, ac: AbortController): Promise<boolean> {
    const loadableRecords = to.matched.filter((r) => r.loader)
    if (loadableRecords.length === 0) return true

    const blocking: RouteRecord[] = []
    const swr: RouteRecord[] = []
    for (const r of loadableRecords) {
      if (r.staleWhileRevalidate && router._loaderData.has(r)) {
        swr.push(r)
      } else {
        blocking.push(r)
      }
    }

    if (blocking.length > 0) {
      const ok = await runBlockingLoaders(blocking, to, gen, ac)
      if (!ok) return false
    }
    if (swr.length > 0) revalidateSwrLoaders(swr, to, ac)
    return true
  }

  async function commitNavigation(
    path: string,
    replace: boolean,
    to: ResolvedRoute,
    from: ResolvedRoute,
  ): Promise<void> {
    scrollManager.save(from.path)

    const doCommit = () => {
      currentPath.set(path)
      syncBrowserUrl(path, replace)

      if (_isBrowser && to.meta.title) {
        document.title = to.meta.title
      }

      for (const record of router._loaderData.keys()) {
        if (!to.matched.includes(record)) {
          router._loaderData.delete(record)
        }
      }
    }

    // Use View Transitions API when available and not explicitly disabled.
    // Route meta can opt out: meta: { viewTransition: false }
    const useVT =
      _isBrowser &&
      to.meta.viewTransition !== false &&
      typeof (document as any).startViewTransition === 'function'

    if (useVT) {
      // `startViewTransition(cb)` runs `cb` inside an async transition. Its
      // `.updateCallbackDone` promise resolves as soon as the callback
      // finishes — DOM has swapped, state is live, but the fade/slide
      // animation is still running. That's what `await router.push()`
      // should wait for: callers need the new route live before they act
      // (e.g. focus an element, inspect `location`, query a new DOM node);
      // they don't want to block on the full animation (`.finished`),
      // which would add 200-300ms to every programmatic navigation.
      //
      // Before this await, `commitNavigation` was sync: the transition
      // callback ran in a later microtask, so `await router.push()`
      // resolved BEFORE the DOM swap. Browser smoke tests had to opt out
      // of View Transitions per-route via `meta: { viewTransition: false }`
      // to stay deterministic — a flag whose only purpose was to paper
      // over this bug.
      type ViewTransitionLike = {
        updateCallbackDone?: Promise<void>
        ready?: Promise<void>
        finished?: Promise<void>
      }
      const vt = (
        document as { startViewTransition?: (cb: () => void) => ViewTransitionLike | undefined }
      ).startViewTransition!(() => {
        doCommit()
      })
      // `startViewTransition` may return `undefined` in test doubles
      // that shim it with a bare `(cb) => cb()`. Guard accordingly.
      if (vt) {
        // The ViewTransition object exposes THREE promises —
        // `updateCallbackDone`, `ready`, `finished`. When a newer
        // `startViewTransition()` starts while this one is in flight,
        // `ready` and `finished` reject with `AbortError: Transition
        // was skipped`. We only need to wait on `updateCallbackDone`
        // (the DOM-commit signal), but the other two MUST still be
        // handled or the rejection surfaces as an unhandled promise
        // rejection that breaks test runners and CI dashboards.
        vt.ready?.catch(() => {})
        vt.finished?.catch(() => {})
        if (vt.updateCallbackDone) {
          try {
            await vt.updateCallbackDone
          } catch {
            // `updateCallbackDone` rejects if the callback itself throws.
            // The DOM may be in a partial-commit state; the newer
            // navigation (if any) will re-commit. Swallow so the
            // navigation chain never hangs on a transition error.
          }
        }
      }
    } else {
      doCommit()
    }

    for (const hook of afterHooks) {
      try {
        hook(to, from)
      } catch (err) {
        if (__DEV__) {
          console.warn(`[Pyreon Router] afterEach hook threw an error:`, err)
        }
      }
    }

    if (_isBrowser) {
      queueMicrotask(() => scrollManager.restore(to, from))
    }
  }

  async function checkBlockers(
    to: ResolvedRoute,
    from: ResolvedRoute,
    gen: number,
  ): Promise<'continue' | 'cancel'> {
    for (const blocker of router._blockers) {
      const blocked = await blocker(to, from)
      if (gen !== _navGen || blocked) return 'cancel'
    }
    return 'continue'
  }

  /** Run per-route middleware chain. Middleware from all matched routes execute in order. */
  async function runMiddleware(
    to: ResolvedRoute,
    from: ResolvedRoute,
    gen: number,
  ): Promise<
    { action: 'continue' } | { action: 'cancel' } | { action: 'redirect'; target: string }
  > {
    const ctx: RouteMiddlewareContext = { to, from, data: {} }

    for (const record of to.matched) {
      if (!record.middleware) continue
      const mws = Array.isArray(record.middleware) ? record.middleware : [record.middleware]
      for (const mw of mws) {
        if (gen !== _navGen) return { action: 'cancel' }
        const result = await mw(ctx)
        if (result === false) return { action: 'cancel' }
        if (typeof result === 'string') return { action: 'redirect', target: result }
      }
    }

    // Store middleware data on the resolved route for component access
    to._middlewareData = ctx.data
    return { action: 'continue' }
  }

  async function navigate(rawPath: string, replace: boolean, redirectDepth = 0): Promise<void> {
    if (__DEV__) _countSink.__pyreon_count__?.('router.navigate')
    router._navigationStartTime = Date.now()
    if (redirectDepth > 10) {
      if (__DEV__) {
        // oxlint-disable-next-line no-console
        console.warn(
          `[Pyreon] Navigation to "${rawPath}" aborted: redirect depth exceeded 10 levels. ` +
            'This likely indicates a redirect loop in your route configuration.',
        )
      }
      return
    }

    const path = normalizeTrailingSlash(rawPath, trailingSlash)
    const gen = ++_navGen
    loadingSignal.update((n) => n + 1)

    const to = resolveRoute(path, routes)
    const from = currentRoute()

    const redirectTarget = resolveRedirect(to)
    if (redirectTarget !== null) {
      loadingSignal.update((n) => n - 1)
      return navigate(redirectTarget, replace, redirectDepth + 1)
    }

    const blockerResult = await checkBlockers(to, from, gen)
    if (blockerResult !== 'continue') {
      loadingSignal.update((n) => n - 1)
      return
    }

    // Run per-route middleware chain (before guards)
    const mwResult = await runMiddleware(to, from, gen)
    if (mwResult.action !== 'continue') {
      loadingSignal.update((n) => n - 1)
      if (mwResult.action === 'redirect') {
        return navigate(sanitizePath(mwResult.target), replace, redirectDepth + 1)
      }
      return
    }

    const guardOutcome = await runAllGuards(to, from, gen)
    if (guardOutcome.action !== 'continue') {
      loadingSignal.update((n) => n - 1)
      if (guardOutcome.action === 'redirect') {
        return navigate(sanitizePath(guardOutcome.target), replace, redirectDepth + 1)
      }
      return
    }

    router._abortController?.abort()
    const ac = new AbortController()
    router._abortController = ac

    const loadersOk = await runLoaders(to, gen, ac)
    if (!loadersOk) {
      loadingSignal.update((n) => n - 1)
      return
    }

    await commitNavigation(path, replace, to, from)
    loadingSignal.update((n) => n - 1)
  }

  // ── isReady promise ─────────────────────────────────────────────────────
  // Resolves after the first navigation (including guards + loaders) completes.

  let _readyResolve: (() => void) | null = null
  const _readyPromise = new Promise<void>((resolve) => {
    _readyResolve = resolve
  })

  // ── Public router object ──────────────────────────────────────────────────

  const router: RouterInstance = {
    routes,
    mode,
    _base: base,
    currentRoute,
    _currentPath: currentPath,
    _currentRoute: currentRoute,
    _componentCache: componentCache,
    _loadingSignal: loadingSignal,
    _scrollPositions: new Map(),
    _scrollBehavior: scrollBehavior,
    _viewDepth: 0,
    _erroredChunks: new Set(),
    _loaderData: new Map(),
    _abortController: null,
    _blockers: new Set(),
    _readyResolve,
    _readyPromise,
    _onError: onError,
    _maxCacheSize: maxCacheSize,
    _navigationStartTime: Date.now(),
    _loaderCache: new Map(),
    _loaderInflight: new Map(),

    async push(
      location:
        | string
        | { name: string; params?: Record<string, string>; query?: Record<string, string> },
    ) {
      if (typeof location === 'string') {
        const resolved = resolveRelativePath(location, currentPath())
        return navigate(sanitizePath(resolved), false)
      }
      const path = resolveNamedPath(
        location.name,
        location.params ?? {},
        location.query ?? {},
        nameIndex,
      )
      return navigate(path, false)
    },

    async replace(
      location:
        | string
        | { name: string; params?: Record<string, string>; query?: Record<string, string> },
    ) {
      if (typeof location === 'string') {
        const resolved = resolveRelativePath(location, currentPath())
        return navigate(sanitizePath(resolved), true)
      }
      const path = resolveNamedPath(
        location.name,
        location.params ?? {},
        location.query ?? {},
        nameIndex,
      )
      return navigate(path, true)
    },

    back() {
      if (_isBrowser) window.history.back()
    },

    forward() {
      if (_isBrowser) window.history.forward()
    },

    go(delta: number) {
      if (_isBrowser) window.history.go(delta)
    },

    beforeEach(guard: NavigationGuard) {
      guards.push(guard)
      return () => {
        const idx = guards.indexOf(guard)
        if (idx >= 0) guards.splice(idx, 1)
      }
    },

    afterEach(hook: AfterEachHook) {
      afterHooks.push(hook)
      return () => {
        const idx = afterHooks.indexOf(hook)
        if (idx >= 0) afterHooks.splice(idx, 1)
      }
    },

    loading: () => loadingSignal() > 0,

    isReady() {
      return router._readyPromise
    },

    async preload(path: string) {
      const resolved = resolveRoute(path, routes)
      // Load lazy components in parallel and populate the component cache so
      // the synchronous render pass finds ready components instead of kicking
      // off async imports (which would fall back to loadingComponent).
      await Promise.all(
        resolved.matched.map(async (record) => {
          if (componentCache.has(record)) return
          const raw = record.component
          if (!isLazy(raw)) {
            componentCache.set(record, raw)
            return
          }
          const mod = await raw.loader()
          const comp = typeof mod === 'function' ? mod : mod.default
          componentCache.set(record, comp)
        }),
      )
      // Run loaders for the matched path — uses the same code path SSR
      // already relied on, so loader data ends up in `_loaderData` under the
      // matched route records. Uses a LOCAL AbortController: `preload` is
      // a prefetch operation and must NOT clobber `router._abortController`,
      // which belongs to the active navigation. Without this, calling
      // `router.preload(...)` during a navigation destroyed the nav's
      // abort capability.
      const ac = new AbortController()
      await Promise.all(
        resolved.matched
          .filter((r) => r.loader)
          .map(async (r) => {
            const data = await r.loader?.({
              params: resolved.params,
              query: resolved.query,
              signal: ac.signal,
            })
            router._loaderData.set(r, data)
          }),
      )
    },

    invalidateLoader(keyOrPredicate?: string | ((key: string) => boolean)) {
      if (!keyOrPredicate) {
        // Invalidate all
        router._loaderCache.clear()
        router._loaderInflight.clear()
        return
      }
      if (typeof keyOrPredicate === 'string') {
        router._loaderCache.delete(keyOrPredicate)
        router._loaderInflight.delete(keyOrPredicate)
        return
      }
      // Predicate
      for (const key of [...router._loaderCache.keys()]) {
        if (keyOrPredicate(key)) {
          router._loaderCache.delete(key)
          router._loaderInflight.delete(key)
        }
      }
    },

    destroy() {
      if (_popstateHandler) window.removeEventListener('popstate', _popstateHandler)
      if (_hashchangeHandler) window.removeEventListener('hashchange', _hashchangeHandler)
      guards.length = 0
      afterHooks.length = 0
      // Release beforeunload for any remaining blockers
      for (let i = router._blockers.size; i > 0; i--) releaseBeforeUnload()
      router._blockers.clear()
      componentCache.clear()
      router._loaderData.clear()
      router._loaderCache.clear()
      router._loaderInflight.clear()
      router._abortController?.abort()
      router._abortController = null
      // Clear global ref so stale router doesn't survive in SSR or re-creation
      if (_activeRouter === router) _activeRouter = null
    },

    _resolve: (rawPath: string) => resolveRoute(rawPath, routes),
  }

  // Initial route is resolved synchronously — mark ready on next microtask
  // so consumers can await isReady() before the first render.
  queueMicrotask(() => {
    if (router._readyResolve) {
      router._readyResolve()
      router._readyResolve = null
    }
  })

  return router as unknown as Router<TNames>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function runGuard(
  guard: NavigationGuard,
  to: ResolvedRoute,
  from: ResolvedRoute,
): Promise<NavigationGuardResult> {
  try {
    return await guard(to, from)
  } catch (err) {
    if (__DEV__) {
      console.warn(`[Pyreon Router] Navigation guard threw an error — navigation cancelled:`, err)
    }
    return false
  }
}

function resolveNamedPath(
  name: string,
  params: Record<string, string>,
  query: Record<string, string>,
  index: Map<string, RouteRecord>,
): string {
  const record = index.get(name)
  if (!record) {
    if (__DEV__) {
      // oxlint-disable-next-line no-console
      console.warn(
        `[Pyreon Router] Unknown route name "${name}". ` +
          `Available names: ${[...index.keys()].join(', ') || '(none)'}. Falling back to "/".`,
      )
    }
    return '/'
  }
  let path = buildPath(record.path, params)
  const qs = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  if (qs) path += `?${qs}`
  return path
}

/** Normalize a base path: ensure leading `/`, strip trailing `/`. */
function normalizeBase(raw: string): string {
  if (!raw) return ''
  let b = raw
  if (!b.startsWith('/')) b = `/${b}`
  if (b.endsWith('/')) b = b.slice(0, -1)
  return b
}

/** Strip the base prefix from a full URL path. Returns the app-relative path. */
function stripBase(path: string, base: string): string {
  if (!base) return path
  if (path === base || path === `${base}/`) return '/'
  if (path.startsWith(`${base}/`)) return path.slice(base.length)
  return path
}

/** Normalize trailing slash on a path according to the configured strategy. */
function normalizeTrailingSlash(path: string, strategy: 'strip' | 'add' | 'ignore'): string {
  if (strategy === 'ignore' || path === '/') return path
  // Split off query string + hash so we only touch the path portion
  const qIdx = path.indexOf('?')
  const hIdx = path.indexOf('#')
  const endIdx = qIdx >= 0 ? qIdx : hIdx >= 0 ? hIdx : path.length
  const pathPart = path.slice(0, endIdx)
  const suffix = path.slice(endIdx)
  if (strategy === 'strip') {
    return pathPart.length > 1 && pathPart.endsWith('/') ? pathPart.slice(0, -1) + suffix : path
  }
  // strategy === "add"
  return !pathPart.endsWith('/') ? `${pathPart}/${suffix}` : path
}

/**
 * Resolve a relative path (starting with `.` or `..`) against the current path.
 * Non-relative paths are returned as-is.
 */
function resolveRelativePath(to: string, from: string): string {
  if (!to.startsWith('./') && !to.startsWith('../') && to !== '.' && to !== '..') return to

  // Split current path into segments, drop the last segment (file-like resolution)
  const fromSegments = from.split('/').filter(Boolean)
  fromSegments.pop()

  const toSegments = to.split('/').filter(Boolean)
  for (const seg of toSegments) {
    if (seg === '..') {
      fromSegments.pop()
    } else if (seg !== '.') {
      fromSegments.push(seg)
    }
  }
  return `/${fromSegments.join('/')}`
}

/** Block unsafe navigation targets: javascript/data/vbscript URIs and absolute URLs. */
function sanitizePath(path: string): string {
  const trimmed = path.trim()
  if (/^(?:javascript|data|vbscript):/i.test(trimmed)) {
    return '/'
  }
  // Block absolute URLs and protocol-relative URLs — router only handles same-origin paths
  if (/^\/\/|^https?:/i.test(trimmed)) {
    return '/'
  }
  return path
}

export { isLazy }
