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
  type ResolvedRoute,
  type RouteMiddlewareContext,
  type RouteRecord,
  type Router,
  type RouterInstance,
  type RouterOptions,
} from './types'

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
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
  // Phase 5 — server-loader data endpoint (single-fetch). Base-prefixed so
  // sub-path deploys hit the right origin path.
  const dataEndpoint = opts.dataEndpoint ?? `${base}/_pyreon/data`

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

  // Browser event listeners — stored so destroy() can remove them.
  // Ternary-bound on `isClient` (the canonical `@pyreon/reactivity` SSR-guard
  // primitive — a recognized guard name) so the lint rule can trace these to an
  // SSR-safe shape without needing `if (isClient && handler)` contortions at
  // every use site.
  const _popstateHandler: (() => void) | null =
    isClient && mode === 'history' ? () => currentPath.set(getCurrentLocation()) : null
  const _hashchangeHandler: (() => void) | null =
    isClient && mode !== 'history' ? () => currentPath.set(getCurrentLocation()) : null

  if (_popstateHandler) window.addEventListener('popstate', _popstateHandler)
  if (_hashchangeHandler) window.addEventListener('hashchange', _hashchangeHandler)

  // Dev-only full-reload-link warning: a plain internal `<a href>` in a
  // router app triggers a full page reload the author almost never wants.
  // Warn at the document bubble phase — `<RouterLink>` (and zero's `<Link>`)
  // call `preventDefault()` on the internal clicks they handle, so
  // `e.defaultPrevented` here uniquely discriminates framework-handled
  // anchors from plain ones. Deliberate full-load links opt out via
  // `target` / `download` / `data-allow-reload`. Applies in BOTH modes —
  // a path-style href full-reloads a hash-mode app too, while valid `#/x`
  // hrefs classify as 'hash' and are skipped. Registered ONCE per router
  // (the router owns global listeners — never per RouterView/RouterLink);
  // removed by identity in `destroy()` (leak class D).
  const _devAnchorWarn: ((e: MouseEvent) => void) | null =
    process.env.NODE_ENV !== 'production' && isClient
      ? (e: MouseEvent) => {
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          // `closest?.` — e.target can be a non-Element (a Text node from a
          // programmatic dispatch; real browser clicks target Elements).
          const a = (e.target as Element | null)?.closest?.('a[href]')
          if (
            !a ||
            a.hasAttribute('download') ||
            a.hasAttribute('target') ||
            a.hasAttribute('data-allow-reload')
          ) {
            return
          }
          // getAttribute, NOT `.href` — an SVG `<a>`'s `.href` is an
          // SVGAnimatedString, and HTMLAnchorElement.href is absolutized.
          const hrefAttr = a.getAttribute('href')
          // Empty href (`<a href="">`) is a deliberate same-page pattern — skip.
          if (!hrefAttr || classifyHref(hrefAttr, opts.links) !== 'internal') return
          console.warn(
            `[Pyreon] internal <a href="${hrefAttr}"> triggers a full page reload — use <RouterLink to="${hrefAttr}"> for client-side navigation. (Deliberate full-load link? add target/download, or data-allow-reload.)`,
          )
        }
      : null
  if (_devAnchorWarn) document.addEventListener('click', _devAnchorWarn)

  // FIFO-bounded — eviction handled by SizedMap.set on overflow. Cap mirrors
  // _loaderCache (via `maxCacheSize`); both caches grow under the same shape
  // of pathological input (unbounded distinct route records / loader keys).
  const componentCache = new SizedMap<RouteRecord, ComponentFn>({ maxEntries: maxCacheSize })
  const loadingSignal = signal(0)
  // PR-S8: separate tick signal for HMR-driven cache invalidation. Pre-fix
  // `_hmrSwap` bumped `loadingSignal` with `+ 1` and never paired a `- 1`
  // — the counter stayed > 0 forever, so `loading: () => loadingSignal() > 0`
  // (i.e. `useTransition()`) was STUCK at `true` for the lifetime of the
  // page after the first HMR swap. The bug class: a navigation-loading
  // signal is for navigation lifecycle (paired start/end counters);
  // hijacking it for "force re-emit the depthEntry computed" is a category
  // confusion. The fix: a dedicated `_hmrTick` signal that `depthEntry`
  // subscribes to alongside `_loadingSignal`. HMR bumps `_hmrTick` and
  // leaves `_loadingSignal` alone — no leak into the navigation counter.
  // Initial value `0`; integer increment per swap (counter, not counter
  // value, so wrap-around never matters in practice — even at one HMR/sec
  // continuous it'd take 68 years to overflow Number.MAX_SAFE_INTEGER).
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
    // `redirect()` from a loader: propagate as a router-level redirect so the
    // navigate flow re-runs against the target path BEFORE the matched route's
    // layout / page mounts. Bypasses the user-supplied `_onError` hook — a
    // redirect is intentional flow control, not an error.
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
    // Pre-fix: nav-1 starts loader (signal=ac1.signal). User navigates again
    // to the same path → nav-2's `router.push` first calls `_abortController?.abort()`
    // (aborting ac1), then calls executeLoader. The Map still holds nav-1's
    // promise (the .catch hasn't run yet); deduping returns it, but its
    // signal is already aborted → nav-2 ends up with a rejected promise
    // even though it has its own fresh ac2.signal. Now we check liveness.
    const inflight = router._loaderInflight.get(key)
    if (inflight && !inflight.signal.aborted) return inflight.promise

    // 3. Execute. Wrap with `Promise.resolve().then(...)` so a SYNCHRONOUS
    // throw from the loader (`redirect('/login')` / `notFound()` / a plain
    // `throw new Error(...)`) becomes a rejected promise the `.catch` can
    // handle — instead of escaping past the promise chain and surfacing as
    // an unhandled exception in `runBlockingLoaders`'s `Promise.allSettled`.
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('router.loaderRun')
    const promise = Promise.resolve()
      .then(() => record.loader!(loaderCtx))
      .then((data) => {
        loaderCacheSet(key, data)
        // Only delete if WE'RE still the registered in-flight (a later nav
        // may have replaced the entry with a fresh promise).
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
      // Short-circuit on first redirect or cancel — later loaders' results
      // are irrelevant once we know the navigation isn't committing here.
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
            // Update cache with fresh data
            const key = getCacheKey(r, loaderCtx)
            loaderCacheSet(key, data)
            // Bump loadingSignal to trigger reactive re-render with fresh data
            loadingSignal.update((n) => n + 1)
            loadingSignal.update((n) => n - 1)
          }
        })
        .catch((err: unknown) => {
          // Background revalidation failed — the stale data remains valid
          // and on screen, so this MUST NOT cancel/redirect the (already
          // settled) navigation. But an empty catch is the silent-failure
          // anti-pattern the project forbids: a persistently-failing
          // revalidation loader (auth expiry, API outage, a bug thrown in
          // the loader) produces ZERO signal — the developer sees
          // permanently-stale data with nothing pointing at the cause.
          // Surface it like every other loader error (dev warn + the
          // user-supplied onError hook) WITHOUT acting on the return
          // value. This path was dead code until the SWR prune fix
          // made `revalidateSwrLoaders` actually run for the
          // nav-away/back case.
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
    // Phase 5 — server loaders. On the SERVER the function import exists
    // (`serverLoader` is a fn) and runs like a normal loader. On the
    // CLIENT only the `hasServerLoader` marker exists — those records'
    // data comes from the data endpoint in ONE request for the whole
    // chain (single-fetch). `staleWhileRevalidate` does not apply to
    // server-loader records (documented).
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
        // Phase 5 — data keyed by MATCHED-CHAIN INDEX (not record.path; a
        // layout + index share a path and path-keying collided — review
        // finding C). The endpoint resolves the same path -> same chain ->
        // same indices, so the client maps `data[matchedIndex]` back to its
        // own matched record at that position.
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
        // Only the records this navigation flagged as remote (hasServerLoader)
        // get applied; isomorphic loaders in the chain ran locally.
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
  ): Promise<void> {
    scrollManager.save(from.path)

    const doCommit = () => {
      currentPath.set(path)
      syncBrowserUrl(path, replace)

      if (isClient && to.meta.title) {
        document.title = to.meta.title
      }

      // Drop loader data for routes no longer matched — EXCEPT
      // `staleWhileRevalidate` routes. SWR's entire contract is "on
      // return to this route, serve the previously-loaded data stale
      // while revalidating in the background"; that requires the data to
      // SURVIVE navigating away. Pruning it here (the pre-fix behaviour)
      // meant `runLoaders`' `_loaderData.has(r)` gate was always false on
      // return, so `revalidateSwrLoaders` never ran and every visit went
      // through the blocking path — `staleWhileRevalidate` was a no-op
      // for the realistic nav-away/back case. Retained SWR data is
      // bounded by the number of SWR route RECORDS (a developer-declared
      // set; param routes share one record), and per-key freshness/LRU
      // is still handled by `_loaderCache`.
      for (const record of router._loaderData.keys()) {
        if (!to.matched.includes(record) && !record.staleWhileRevalidate) {
          router._loaderData.delete(record)
        }
      }
    }

    // Use View Transitions API when available and not explicitly disabled.
    // Route meta can opt out: meta: { viewTransition: false }. We ALSO skip
    // the animation when the user has asked for reduced motion (WCAG 2.3.3
    // "Animation from Interactions") — the DOM still swaps synchronously via
    // the non-VT `else` path below; only the fade/slide is suppressed. This is
    // read per-navigation (not cached) so a user toggling the OS preference
    // mid-session is respected on the next route change.
    // The early-return `typeof` guard makes the whole helper SSR-safe and is
    // the form `@pyreon/lint`'s `no-window-in-ssr` recognises (an inline
    // `typeof matchMedia === 'function' && matchMedia(...)` is NOT — the rule
    // wants an early-return guard at the function entry).
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
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[Pyreon Router] afterEach hook threw an error:`, err)
        }
      }
    }

    if (isClient) {
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

    const loaderOutcome = await runLoaders(to, gen, ac)
    if (loaderOutcome.action !== 'continue') {
      loadingSignal.update((n) => n - 1)
      if (loaderOutcome.action === 'redirect') {
        return navigate(sanitizePath(loaderOutcome.target), replace, redirectDepth + 1)
      }
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
    // PR-S8: dev-only — undefined in prod (no HMR there). `depthEntry`
    // in components.tsx subscribes to this alongside `_loadingSignal` so
    // a swap forces a re-emit. See `loadingSignal` decl above for the bug
    // class.
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
    _loaderCache: new SizedMap({ maxEntries: maxCacheSize }),
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
      // Skip the loader-running step when the caller explicitly opts out
      // (used by the SSG plugin's 404 build path — parent-layout loaders
      // that hit auth resources or external APIs shouldn't fire when
      // generating a static 404 page). Lazy components above DO still
      // resolve so the synthetic chain renders cleanly; only the
      // `r.loader()` invocations are skipped.
      if (preloadOptions?.skipLoaders) return
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
          // Phase 5 — `serverLoader` runs here exactly like `loader`: this
          // preload path only executes on the server (SSR handler, SSG
          // build, the data endpoint), where the function import exists.
          .filter((r) => r.loader || typeof r.serverLoader === 'function')
          .map(async (r) => {
            // Wrap with `Promise.resolve().then(...)` so a SYNCHRONOUS
            // throw — `redirect('/login')` from a sync loader, `notFound()`,
            // a plain `throw new Error(...)` — becomes a rejected promise
            // the surrounding Promise.all surfaces. Bare `await r.loader(...)`
            // would let synchronous throws escape past the `await` and
            // surface as an uncaught exception in the Vite dev SSR pipeline.
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
      // Phase 5 — the single-fetch data endpoint's worker. Runs ONLY the
      // matched chain's `serverLoader` records (NOT isomorphic `loader`s —
      // those run client-side, so running them here would DOUBLE-FIRE their
      // side effects; that was the Phase-5 review finding F). Keys the
      // result by MATCHED-CHAIN INDEX, not `record.path`: a layout and its
      // index page share a path, and path-keying silently overwrote the
      // page's server-loader data with the layout's (review finding C,
      // reproduced). Index is unique per chain position; the client resolves
      // the same path -> same chain -> same indices, so it maps back exactly.
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
            // Same sync-throw-to-rejection wrap as preload so a synchronous
            // `redirect()` / `notFound()` is caught, not leaked.
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
      if (process.env.NODE_ENV !== 'production' && isClient) {
        const g = globalThis as Record<string, unknown>
        if (g.__pyreon_hmr_swap__ === router._hmrSwap) {
          delete g.__pyreon_hmr_swap__
        }
      }
    },

    _resolve: (rawPath: string) => resolveRoute(rawPath, routes),

    // Dev-only HMR coordinator — see RouterInstance._hmrSwap JSDoc.
    // Gated to dev+browser so it's tree-shaken from production bundles.
    ...(process.env.NODE_ENV !== 'production' && isClient
      ? {
          _hmrSwap(id: string, mod: unknown): boolean {
            const m = mod as { default?: ComponentFn } | ComponentFn | null
            const next: ComponentFn | undefined =
              typeof m === 'function' ? m : (m?.default ?? undefined)
            // No default export in the fresh namespace (named-only edit, or
            // the module no longer exports a component) — let the plugin
            // fall back to an automatic reload rather than blank the route.
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
            // PR-S8: bump `_hmrTick` (NOT `_loadingSignal`) so
            // `RouterView`'s `depthEntry` computed re-emits without
            // leaking into the navigation counter. Pre-fix `_loadingSignal
            // .update((n) => n + 1)` here was never paired with a `n - 1`,
            // so `loading() > 0` was stuck `true` forever after the first
            // HMR swap (`useTransition()` stuck on for the page lifetime).
            // `depthEntry`'s `equals` compares `comp` identity, so only the
            // depth whose component actually changed re-renders — every
            // other depth (layout, siblings) stays mounted, signals intact.
            if (changed) hmrTick.update((n) => n + 1)
            return changed
          },
        }
      : {}),
  }

  // Initial route is resolved synchronously — mark ready on next microtask
  // so consumers can await isReady() before the first render.
  queueMicrotask(() => {
    if (router._readyResolve) {
      router._readyResolve()
      router._readyResolve = null
    }
  })

  // Expose the HMR coordinator on globalThis so `@pyreon/vite-plugin`'s
  // injected `import.meta.hot.accept` handler can reach it WITHOUT importing
  // `@pyreon/router` (zero import coupling — same pattern as the perf-harness
  // counter sink). Last router wins; single-router apps (the norm, every
  // `@pyreon/zero` app) are unaffected. Dev+browser only.
  if (process.env.NODE_ENV !== 'production' && isClient && router._hmrSwap) {
    // `_hmrSwap` closes over `currentRoute`/`componentCache`/`loadingSignal`
    // (not `this`), so the raw reference is safe to expose and to compare by
    // identity on `destroy()`.
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
