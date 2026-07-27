import { createContext, onUnmount, useContext } from '@pyreon/core'
import { computed, isClient, signal } from '@pyreon/reactivity'
import { SizedMap } from '@pyreon/sized-map'
import { buildNameIndex, buildPath, resolveRoute, stringifyQuery } from './match'
import { getRedirectInfo } from './redirect'
import { ScrollManager } from './scroll'
import { classifyHref } from './typed-routes'
import {
  type AfterEachHook,
  type Blocker,
  type BlockerFn,
  type ComponentFn,
  isLazy,
  type LoaderContext,
  type NavigationGuard,
  type NavigationGuardResult,
  type NavigationResult,
  type ResolvedRoute,
  type RouteMiddlewareContext,
  type RouteRecord,
  type Router,
  type RouterInstance,
  type RouterOptions,
} from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this uses
// `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Router context ─────────────────────────────────────────────────────────── Context-based.

export const RouterContext = createContext<RouterInstance | null>(null)

// Module-level fallback — safe for CSR (single-threaded), not for concurrent SSR.
let _activeRouter: RouterInstance | null = null

// The router that OWNS browser-history writes for cancelled traversals.
let _navOwner: object | null = null

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
 * Programmatic navigation hook. Returns a callable that pushes the
 * given path onto the active router's stack — mirrors the canonical
 * `useNavigate()` shape exposed by `@pyreon/native-router-swift` and
 * `@pyreon/native-router-kotlin`, so the SAME `.tsx` source can call
 * `useNavigate()` on all three targets.
 *
 * @example
 * const navigate = useNavigate()
 * navigate('/dashboard')
 */
export function useNavigate(): (path: string) => void {
  const router = useContext(RouterContext) ?? _activeRouter
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  return (path: string) => router.push(path)
}

/**
 * Read path parameters for the current route. Returns a snapshot map
 * of `{ paramName: value }` extracted from the matched route pattern.
 * Mirrors the canonical `useParams()` shape on native runtimes for
 * cross-target source parity.
 *
 * The generic `T` lets callers type the params shape they expect (e.g.
 * `useParams<{ id: string }>()`); at runtime it's still a string map.
 *
 * @example
 * const params = useParams<{ id: string }>()
 * console.log(params.id)
 */
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const router = useContext(RouterContext) ?? _activeRouter
  if (!router)
    throw new Error(
      '[Pyreon] No router installed. Wrap your app in <RouterProvider router={router}>.',
    )
  return router.currentRoute().params as T
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
 * navigation — return `true` (or resolve to `true`) to block it. Browser
 * Back/Forward traversals run the same pipeline, so blockers cover the
 * back button too: a blocked traversal restores the URL + history position.
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
let _beforeUnloadRefCount = 0
const _beforeUnloadHandler = (e: BeforeUnloadEvent) => {
  e.preventDefault()
}

function retainBeforeUnload(): void {
  if (!isClient) return
  if (_beforeUnloadRefCount === 0) {
    window.addEventListener('beforeunload', _beforeUnloadHandler)
  }
  _beforeUnloadRefCount++
}

function releaseBeforeUnload(): void {
  if (!isClient) return
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
): [get: () => T, set: (updates: Partial<T>) => Promise<NavigationResult>] {
  const router = _getRouter()
  const get = (): T => {
    const query = router.currentRoute().query
    if (!defaults) return query as T
    return { ...defaults, ...query } as T
  }
  const set = (updates: Partial<T>): Promise<NavigationResult> => {
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
  set: (updates: Partial<InferSearchParams<T>>) => Promise<NavigationResult>,
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
  const set = (updates: Partial<InferSearchParams<T>>): Promise<NavigationResult> => {
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
  // Structural sharing: cache the previous result and return it if shallow-equal to the new one.
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
  return () => {
    // Subscribe to route changes; the data itself lives on the router.
    router.currentRoute()
    return router._committedMiddlewareData
  }
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
  // Phase 5 — server-loader data endpoint (single-fetch).
  const dataEndpoint = opts.dataEndpoint ?? `${base}/_pyreon/data`

  // Pre-built O(1) name → record index. Computed once at startup.
  const nameIndex = buildNameIndex(routes)

  const guards: NavigationGuard[] = []
  const afterHooks: AfterEachHook[] = []
  const scrollManager = new ScrollManager(scrollBehavior)

  // Navigation generation counter — cancels in-flight navigations when a newer one starts.
  let _navGen = 0

  // ── History position tracking ───────────────────────────────────────────── Every
  // router-written.
  let _histIdx = 0
  let _suppressBrowserNav = 0

  const readHistoryIdx = (): number | null => {
    if (!isClient) return null
    const st = window.history.state as { __pyreonIdx?: unknown } | null
    return typeof st?.__pyreonIdx === 'number' ? st.__pyreonIdx : null
  }

  // ── Initial location ──────────────────────────────────────────────────────

  const getInitialLocation = (): string => {
    // SSR: use explicitly provided url (strip base if present)
    if (opts.url) return stripBase(opts.url, base)
    if (!isClient) return '/'
    if (mode === 'history') {
      return stripBase(window.location.pathname, base) + window.location.search
    }
    const hash = window.location.hash
    return hash.startsWith('#') ? hash.slice(1) || '/' : '/'
  }

  const getCurrentLocation = (): string => {
    if (!isClient) return currentPath()
    if (mode === 'history') {
      return stripBase(window.location.pathname, base) + window.location.search
    }
    const hash = window.location.hash
    return hash.startsWith('#') ? hash.slice(1) || '/' : '/'
  }

  // ── Signals ───────────────────────────────────────────────────────────────

  const currentPath = signal(normalizeTrailingSlash(getInitialLocation(), trailingSlash))
  const currentRoute = computed<ResolvedRoute>(() => resolveRoute(currentPath(), routes))

  // ── Browser-initiated navigation (Back/Forward.
  const handleBrowserNav = (): void => {
    // Client-only: wired solely to the popstate/hashchange listeners, which are null on the server.
    if (!isClient) return
    const poppedIdx = readHistoryIdx()
    if (_suppressBrowserNav > 0) {
      // Our own restore `go()` — sync the index bookkeeping, skip the pipeline.
      _suppressBrowserNav--
      if (poppedIdx !== null) _histIdx = poppedIdx
      return
    }
    const target = normalizeTrailingSlash(getCurrentLocation(), trailingSlash)
    if (target === currentPath.peek()) {
      // Fragment-only change (history mode) or an echo — native behavior wins.
      if (poppedIdx !== null) _histIdx = poppedIdx
      return
    }
    const prevIdx = _histIdx
    if (poppedIdx !== null) _histIdx = poppedIdx
    void navigate(target, true, 0, true).then((status) => {
      if (status !== 'cancelled') return
      // Guard / blocker / middleware refused the traversal.
      _histIdx = prevIdx
      if (_navOwner !== router) return
      if (poppedIdx !== null && poppedIdx !== prevIdx) {
        _suppressBrowserNav++
        window.history.go(prevIdx - poppedIdx)
      } else {
        syncBrowserUrl(currentPath.peek(), true)
      }
    })
  }

  // Browser event listeners — stored so destroy() can remove them.
  const _popstateHandler: (() => void) | null =
    isClient && mode === 'history' ? handleBrowserNav : null
  const _hashchangeHandler: (() => void) | null =
    isClient && mode !== 'history' ? handleBrowserNav : null

  if (_popstateHandler) window.addEventListener('popstate', _popstateHandler)
  if (_hashchangeHandler) window.addEventListener('hashchange', _hashchangeHandler)

  // Stamp the INITIAL history entry with index 0 (merging any pre-existing state) so a later Back.
  if (isClient) {
    const existing = readHistoryIdx()
    if (existing !== null) {
      _histIdx = existing
    } else {
      const prev = window.history.state as Record<string, unknown> | null
      window.history.replaceState(
        prev && typeof prev === 'object' ? { ...prev, __pyreonIdx: 0 } : { __pyreonIdx: 0 },
        '',
        window.location.href,
      )
    }
  }

  // When the user configures scroll behavior, the ROUTER owns scroll on history traversals.
  const _prevScrollRestoration: History['scrollRestoration'] | null =
    isClient && scrollBehavior !== undefined && 'scrollRestoration' in window.history
      ? window.history.scrollRestoration
      : null
  if (isClient && _prevScrollRestoration !== null) window.history.scrollRestoration = 'manual'

  // Dev-only full-reload-link warning: a plain internal `<a href>` in a router app triggers a full.
  const _devAnchorWarn: ((e: MouseEvent) => void) | null =
    process.env.NODE_ENV !== 'production' && isClient
      ? (e: MouseEvent) => {
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          // `closest?.` — e.target can be a non-Element.
          const a = (e.target as Element | null)?.closest?.('a[href]')
          if (
            !a ||
            a.hasAttribute('download') ||
            a.hasAttribute('target') ||
            a.hasAttribute('data-allow-reload')
          ) {
            return
          }
          // getAttribute, NOT `.href`.
          const hrefAttr = a.getAttribute('href')
          // Empty href (`<a href="">`) is a deliberate same-page pattern — skip.
          if (!hrefAttr || classifyHref(hrefAttr, opts.links) !== 'internal') return
          console.warn(
            `[Pyreon] internal <a href="${hrefAttr}"> triggers a full page reload — use <RouterLink to="${hrefAttr}"> for client-side navigation. (Deliberate full-load link? add target/download, or data-allow-reload.)`,
          )
        }
      : null
  if (_devAnchorWarn) document.addEventListener('click', _devAnchorWarn)

  // FIFO-bounded — eviction handled by SizedMap.set on overflow.
  const componentCache = new SizedMap<RouteRecord, ComponentFn>({ maxEntries: maxCacheSize })
  const loadingSignal = signal(0)
  // Separate tick signal for HMR-driven cache invalidation.
  const hmrTick = signal(0)

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
  ): GuardOutcome {
    if (result.status === 'fulfilled') {
      router._loaderData.set(record, result.value)
      return { action: 'continue' }
    }
    if (ac.signal.aborted) return { action: 'continue' }
    // `redirect()` from a loader: propagate as a router-level redirect so the navigate flow
    // re-runs.
    const info = getRedirectInfo(result.reason)
    if (info) return { action: 'redirect', target: info.url }
    if (router._onError) {
      const cancel = router._onError(result.reason, to)
      if (cancel === false) return { action: 'cancel' }
    }
    router._loaderData.set(record, undefined)
    return { action: 'continue' }
  }

  function syncBrowserUrl(path: string, replace: boolean): void {
    if (!isClient) return
    const url = mode === 'history' ? `${base}${path}` : `#${path}`
    if (replace) {
      // Merge any pre-existing state (third-party code may stash data on the entry).
      const prev = window.history.state as Record<string, unknown> | null
      const merged =
        prev && typeof prev === 'object'
          ? { ...prev, __pyreonIdx: _histIdx }
          : { __pyreonIdx: _histIdx }
      window.history.replaceState(merged, '', url)
    } else {
      _histIdx++
      window.history.pushState({ __pyreonIdx: _histIdx }, '', url)
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
   * Persist a loader result into `_loaderCache`. SizedMap.set handles the
   * FIFO eviction internally — the cap is fixed at `maxCacheSize` when
   * the cache was constructed below. The `gcTime` TTL handles staleness;
   * this just keeps the cache size bounded under unbounded distinct keys
   * (`/posts/:id` with hundreds of unique IDs over a long SPA session).
   */
  function loaderCacheSet(key: string, data: unknown): void {
    router._loaderCache.set(key, { data, timestamp: Date.now() })
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
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('router.loaderCache.hit')
        return Promise.resolve(cached.data)
      }
    }

    // 2. Dedup in-flight — but only if the in-flight signal is still live.
    const inflight = router._loaderInflight.get(key)
    if (inflight && !inflight.signal.aborted) return inflight.promise

    // 3. Execute.
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('router.loaderRun')
    const promise = Promise.resolve()
      .then(() => record.loader!(loaderCtx))
      .then((data) => {
        loaderCacheSet(key, data)
        // Only delete if WE'RE still the registered in-flight.
        if (router._loaderInflight.get(key)?.promise === promise) {
          router._loaderInflight.delete(key)
        }
        return data
      })
      .catch((err) => {
        if (router._loaderInflight.get(key)?.promise === promise) {
          router._loaderInflight.delete(key)
        }
        throw err
      })

    router._loaderInflight.set(key, { promise, signal: loaderCtx.signal })
    return promise
  }

  async function runBlockingLoaders(
    records: RouteRecord[],
    to: ResolvedRoute,
    gen: number,
    ac: AbortController,
  ): Promise<GuardOutcome> {
    const loaderCtx: LoaderContext = { params: to.params, query: to.query, signal: ac.signal }
    const results = await Promise.allSettled(records.map((r) => executeLoader(r, loaderCtx)))
    if (gen !== _navGen) return { action: 'cancel' }
    for (let i = 0; i < records.length; i++) {
      const result = results[i]
      const record = records[i]
      if (!result || !record) continue
      const outcome = processLoaderResult(result, record, ac, to)
      // Short-circuit on first redirect or cancel.
      if (outcome.action !== 'continue') return outcome
    }
    return { action: 'continue' }
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
            const key = getCacheKey(r, loaderCtx)
            loaderCacheSet(key, data)
            // Bump loadingSignal to trigger reactive re-render with fresh data
            loadingSignal.update((n) => n + 1)
            loadingSignal.update((n) => n - 1)
          }
        })
        .catch((err: unknown) => {
          // Background revalidation failed.
          if (process.env.NODE_ENV !== 'production') {
            // oxlint-disable-next-line no-console
            console.warn(
              `[Pyreon Router] SWR background revalidation failed for "${r.path}" — serving stale data:`,
              err,
            )
          }
          router._onError?.(err, to)
        })
    }
  }

  async function runLoaders(
    to: ResolvedRoute,
    gen: number,
    ac: AbortController,
  ): Promise<GuardOutcome> {
    // Phase 5 — server loaders.
    const remote: RouteRecord[] = []
    const loadableRecords: RouteRecord[] = []
    for (const r of to.matched) {
      if (typeof r.serverLoader === 'function') loadableRecords.push(r)
      else if (r.hasServerLoader) remote.push(r)
      else if (r.loader) loadableRecords.push(r)
    }
    if (loadableRecords.length === 0 && remote.length === 0) {
      return { action: 'continue' }
    }

    const blocking: RouteRecord[] = []
    const swr: RouteRecord[] = []
    for (const r of loadableRecords) {
      if (r.staleWhileRevalidate && router._loaderData.has(r)) {
        swr.push(r)
      } else {
        blocking.push(r)
      }
    }

    if (remote.length > 0) {
      const outcome = await fetchServerLoaderData(remote, to, gen, ac)
      if (outcome.action !== 'continue') return outcome
    }
    if (blocking.length > 0) {
      const outcome = await runBlockingLoaders(blocking, to, gen, ac)
      if (outcome.action !== 'continue') return outcome
    }
    if (swr.length > 0) revalidateSwrLoaders(swr, to, ac)
    return { action: 'continue' }
  }

  /**
   * Phase 5 — fetch the matched chain's server-loader data in ONE request
   * (single-fetch semantics). The endpoint runs the chain's serverLoaders
   * server-side with the real request (cookies flow via same-origin fetch
   * credentials) and returns `{ data: { [recordPath]: value } }` — or
   * `{ redirect: { to, status } }` when a server loader threw `redirect()`,
   * which becomes a client-side navigation here.
   */
  async function fetchServerLoaderData(
    records: RouteRecord[],
    to: ResolvedRoute,
    gen: number,
    ac: AbortController,
  ): Promise<GuardOutcome> {
    try {
      // path + query + hash reassembled — `to.path` is just the pathname.
      const qs = Object.entries(to.query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
      const target = `${to.path}${qs ? `?${qs}` : ''}`
      const res = await fetch(
        `${dataEndpoint}?path=${encodeURIComponent(target)}`,
        { signal: ac.signal, headers: { Accept: 'application/json' } },
      )
      if (gen !== _navGen) return { action: 'cancel' }
      if (!res.ok) {
        throw new Error(`[Pyreon Router] data endpoint returned HTTP ${res.status}`)
      }
      const payload = (await res.json()) as {
        // Phase 5 — data keyed by MATCHED-CHAIN INDEX.
        data?: Record<string, unknown>
        redirect?: { to: string; status?: number }
      }
      if (gen !== _navGen) return { action: 'cancel' }
      if (payload.redirect) {
        return { action: 'redirect', target: payload.redirect.to }
      }
      const data = payload.data ?? {}
      for (let i = 0; i < to.matched.length; i++) {
        const r = to.matched[i]
        // Only the records this navigation flagged as remote (hasServerLoader) get applied.
        if (r && records.includes(r) && String(i) in data) {
          router._loaderData.set(r, data[String(i)])
        }
      }
      return { action: 'continue' }
    } catch (err) {
      if (ac.signal.aborted) return { action: 'cancel' }
      // Surface like a failed loader: the route error boundary path.
      throw err
    }
  }

  async function commitNavigation(
    path: string,
    replace: boolean,
    to: ResolvedRoute,
    from: ResolvedRoute,
    fromBrowser = false,
  ): Promise<void> {
    scrollManager.save(from.path)

    const doCommit = () => {
      // Publish the middleware chain's accumulated data BEFORE flipping the path so any reactive.
      router._committedMiddlewareData = to._middlewareData ?? {}
      currentPath.set(path)
      syncBrowserUrl(path, replace)

      if (isClient && to.meta.title) {
        document.title = to.meta.title
      }

      // Drop loader data for routes no longer matched.
      for (const record of router._loaderData.keys()) {
        if (!to.matched.includes(record) && !record.staleWhileRevalidate) {
          router._loaderData.delete(record)
        }
      }
    }

    // Use View Transitions API when available and not explicitly disabled.
    const prefersReducedMotion = (): boolean => {
      if (typeof matchMedia === 'undefined') return false
      return matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    const reducedMotion = isClient && prefersReducedMotion()
    const useVT =
      isClient &&
      !reducedMotion &&
      to.meta.viewTransition !== false &&
      typeof (document as any).startViewTransition === 'function'

    if (useVT) {
      // `startViewTransition(cb)` runs `cb` inside an async transition.
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
      // `startViewTransition` may return `undefined` in test doubles that shim it with a bare.
      if (vt) {
        // The ViewTransition object exposes THREE promises.
        vt.ready?.catch(() => {})
        vt.finished?.catch(() => {})
        if (vt.updateCallbackDone) {
          try {
            await vt.updateCallbackDone
          } catch {
            // `updateCallbackDone` rejects if the callback itself throws.
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
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[Pyreon Router] afterEach hook threw an error:`, err)
        }
      }
    }

    // Scroll ownership split (matches Vue Router semantics):
    if (isClient && (!fromBrowser || scrollBehavior !== undefined)) {
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

    to._middlewareData = ctx.data
    return { action: 'continue' }
  }

  // Navigation outcome — the PUBLIC `NavigationResult` (types.ts).
  async function navigate(
    rawPath: string,
    replace: boolean,
    redirectDepth = 0,
    fromBrowser = false,
  ): Promise<NavigationResult> {
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('router.navigate')
    router._navigationStartTime = Date.now()
    if (redirectDepth > 10) {
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.warn(
          `[Pyreon] Navigation to "${rawPath}" aborted: redirect depth exceeded 10 levels. ` +
            'This likely indicates a redirect loop in your route configuration.',
        )
      }
      return 'cancelled'
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
      return gen === _navGen ? 'cancelled' : 'superseded'
    }

    // Run per-route middleware chain (before guards)
    const mwResult = await runMiddleware(to, from, gen)
    if (mwResult.action !== 'continue') {
      loadingSignal.update((n) => n - 1)
      if (mwResult.action === 'redirect') {
        return navigate(sanitizePath(mwResult.target), replace, redirectDepth + 1)
      }
      return gen === _navGen ? 'cancelled' : 'superseded'
    }

    const guardOutcome = await runAllGuards(to, from, gen)
    if (guardOutcome.action !== 'continue') {
      loadingSignal.update((n) => n - 1)
      if (guardOutcome.action === 'redirect') {
        return navigate(sanitizePath(guardOutcome.target), replace, redirectDepth + 1)
      }
      return gen === _navGen ? 'cancelled' : 'superseded'
    }

    router._abortController?.abort()
    const ac = new AbortController()
    router._abortController = ac

    const loaderOutcome = await runLoaders(to, gen, ac)
    if (loaderOutcome.action !== 'continue') {
      loadingSignal.update((n) => n - 1)
      if (loaderOutcome.action === 'redirect') {
        return navigate(sanitizePath(loaderOutcome.target), replace, redirectDepth + 1)
      }
      return gen === _navGen ? 'cancelled' : 'superseded'
    }

    await commitNavigation(path, replace, to, from, fromBrowser)
    loadingSignal.update((n) => n - 1)
    return 'committed'
  }

  // ── isReady promise ───────────────────────────────────────────────────── Resolves after.

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
    // PR-S8: dev-only — undefined in prod (no HMR there).
    _hmrTick: hmrTick,
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
    _linkConfig: opts.links,
    _maxCacheSize: maxCacheSize,
    _navigationStartTime: Date.now(),
    _committedMiddlewareData: {},
    _loaderCache: new SizedMap({ maxEntries: maxCacheSize }),
    _loaderInflight: new Map(),
    _executeLoader: (record, ctx) => executeLoader(record, ctx),

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
      if (isClient) window.history.back()
    },

    forward() {
      if (isClient) window.history.forward()
    },

    go(delta: number) {
      if (isClient) window.history.go(delta)
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

    async preload(path: string, request?: Request, preloadOptions?: { skipLoaders?: boolean }) {
      const resolved = resolveRoute(path, routes)
      // Load lazy components in parallel and populate the component cache so the synchronous
      // render.
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
      // Skip the loader-running step when the caller explicitly opts out.
      if (preloadOptions?.skipLoaders) return
      // Run loaders for the matched path.
      const ac = new AbortController()
      await Promise.all(
        resolved.matched
          // Phase 5 — `serverLoader` runs here exactly like `loader`: this preload path only.
          .filter((r) => r.loader || typeof r.serverLoader === 'function')
          .map(async (r) => {
            // Wrap with `Promise.resolve().then(...)` so a SYNCHRONOUS throw.
            const run = r.serverLoader ?? r.loader
            const data = await Promise.resolve().then(() =>
              run!({
                params: resolved.params,
                query: resolved.query,
                signal: ac.signal,
                ...(request ? { request } : {}),
              }),
            )
            router._loaderData.set(r, data)
          }),
      )
    },

    async runServerLoaders(path: string, request?: Request) {
      // Phase 5 — the single-fetch data endpoint's worker.
      const resolved = resolveRoute(path, routes)
      const ac = new AbortController()
      const loaderCtx = {
        params: resolved.params,
        query: resolved.query,
        signal: ac.signal,
        ...(request ? { request } : {}),
      }
      const data: Record<number, unknown> = {}
      try {
        await Promise.all(
          resolved.matched.map(async (r, i) => {
            if (typeof r.serverLoader !== 'function') return
            // Same sync-throw-to-rejection wrap as preload so a synchronous `redirect()` /.
            data[i] = await Promise.resolve().then(() => r.serverLoader!(loaderCtx))
          }),
        )
      } catch (err) {
        const info = getRedirectInfo(err)
        if (info) {
          return { kind: 'redirect' as const, to: info.url, status: info.status }
        }
        throw err
      }
      return { kind: 'data' as const, data }
    },

    async revalidate() {
      // Re-run the CURRENT chain's loaders in place (see Router.revalidate).
      const to = currentRoute()
      if (to.matched.length === 0) return
      const ctx = { params: to.params, query: to.query }
      // Drop the chain's cached entries so executeLoader re-runs instead of
      // serving the cache we're trying to refresh.
      for (const r of to.matched) {
        if (r.loader) {
          const key = getCacheKey(r, ctx)
          router._loaderCache.delete(key)
          router._loaderInflight.delete(key)
        }
      }
      const ac = new AbortController()
      // Current generation: a REAL navigation starting mid-revalidate bumps `_navGen`.
      const outcome = await runLoaders(to, _navGen, ac)
      if (outcome.action === 'redirect') {
        await navigate(sanitizePath(outcome.target), true, 0)
        return
      }
      if (outcome.action !== 'continue') return
      // Wake loader-bearing depthEntries so route components re-render with the fresh data.
      loadingSignal.update((n) => n + 1)
      loadingSignal.update((n) => n - 1)
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
      if (isClient && _prevScrollRestoration !== null) {
        window.history.scrollRestoration = _prevScrollRestoration
      }
      if (_devAnchorWarn) document.removeEventListener('click', _devAnchorWarn)
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
      if (_navOwner === router) _navOwner = null
      if (process.env.NODE_ENV !== 'production' && isClient) {
        const g = globalThis as Record<string, unknown>
        if (g.__pyreon_hmr_swap__ === router._hmrSwap) {
          delete g.__pyreon_hmr_swap__
        }
      }
    },

    _resolve: (rawPath: string) => resolveRoute(rawPath, routes),

    // Dev-only HMR coordinator — see RouterInstance._hmrSwap JSDoc.
    ...(process.env.NODE_ENV !== 'production' && isClient
      ? {
          _hmrSwap(id: string, mod: unknown): boolean {
            const m = mod as { default?: ComponentFn } | ComponentFn | null
            const next: ComponentFn | undefined =
              typeof m === 'function' ? m : (m?.default ?? undefined)
            // No default export in the fresh namespace.
            if (typeof next !== 'function') return false

            const matched = currentRoute().matched
            let changed = false
            for (const record of matched) {
              const raw = record.component
              if (!isLazy(raw) || !raw._hmrId) continue
              if (!_hmrIdMatches(raw._hmrId, id)) continue
              componentCache.set(record, next)
              router._erroredChunks.delete(record)
              changed = true
            }
            // PR-S8: bump `_hmrTick` (NOT `_loadingSignal`) so `RouterView`'s `depthEntry`
            // computed.
            if (changed) hmrTick.update((n) => n + 1)
            return changed
          },
        }
      : {}),
  }

  // This (newest) client router owns browser-history restoration for cancelled traversals.
  if (_popstateHandler || _hashchangeHandler) _navOwner = router

  // Initial route is resolved synchronously.
  queueMicrotask(() => {
    if (router._readyResolve) {
      router._readyResolve()
      router._readyResolve = null
    }
  })

  // Expose the HMR coordinator on globalThis so `@pyreon/vite-plugin`'s injected.
  if (process.env.NODE_ENV !== 'production' && isClient && router._hmrSwap) {
    // `_hmrSwap` closes over `currentRoute`/`componentCache`/`loadingSignal` (not `this`).
    ;(globalThis as Record<string, unknown>).__pyreon_hmr_swap__ = router._hmrSwap
  }

  return router as unknown as Router<TNames>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Match a lazy route's `_hmrId` (emitted by `@pyreon/zero`'s fs-router as the
 * absolute route-file path) against the module id `@pyreon/vite-plugin`'s
 * accept handler reports. Both are absolute paths to the same file but may
 * differ in query suffix (`?t=…`, `?v=…`) or, in some Vite setups, a `/@fs`
 * prefix. Strip queries, then accept exact equality OR a suffix match on the
 * longer path — route-file paths are unique within an app so suffix matching
 * can't cross-fire. A miss makes `_hmrSwap` return false → the plugin falls
 * back to an automatic reload (correct, just not in-place), so a too-strict
 * match degrades safely rather than swapping the wrong component.
 */
function _hmrIdMatches(recordId: string, incomingId: string): boolean {
  const a = recordId.split('?')[0] ?? recordId
  const b = incomingId.split('?')[0] ?? incomingId
  if (a === b) return true
  return a.length >= b.length ? a.endsWith(b) : b.endsWith(a)
}

async function runGuard(
  guard: NavigationGuard,
  to: ResolvedRoute,
  from: ResolvedRoute,
): Promise<NavigationGuardResult> {
  try {
    return await guard(to, from)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
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
    if (process.env.NODE_ENV !== 'production') {
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
