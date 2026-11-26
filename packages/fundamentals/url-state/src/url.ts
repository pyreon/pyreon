import { isClient, signal } from '@pyreon/reactivity'

/** Read a search param from the current URL. Returns `null` if not present. */
export function getParam(key: string): string | null {
  if (!isClient) return null
  return currentParams().get(key)
}

/**
 * Read all values for a repeated param (e.g. `?tags=a&tags=b`).
 * Returns an empty array if the param is not present.
 */
export function getParamAll(key: string): string[] {
  if (!isClient) return []
  return currentParams().getAll(key)
}

/**
 * Minimal router-like interface: `replace` is required, `push` optional.
 * This avoids a hard dependency on `@pyreon/router`.
 */
/** Per-navigation options url-state hands a router (`@pyreon/router`'s `NavigateOptions`). */
export interface UrlNavigateOptions {
  scroll?: boolean
  viewTransition?: boolean
}

/**
 * A url-state write edits the page it is on: the router must neither scroll to
 * the top nor run a view transition, for a push as much as a replace (#4814).
 */
const PARAM_WRITE: UrlNavigateOptions = { scroll: false, viewTransition: false }

export interface UrlRouter {
  // Return type is intentionally `unknown`-wide: url-state calls these purely
  // for their side effect and ignores the result, so ANY router whose
  // `replace(path)` returns nothing OR a promise of anything satisfies the
  // bridge. `@pyreon/router`'s `replace` returns `Promise<NavigationResult>`
  // (since #2171) — narrowing this to `Promise<void>` broke `setUrlRouter(useRouter())`.
  //
  // The second argument is `@pyreon/router`'s `NavigateOptions`: url-state
  // passes `{ scroll: false, viewTransition: false }`, because a param write
  // edits the current page (#4814). A router that takes one argument ignores it.
  replace(path: string, options?: UrlNavigateOptions): void | Promise<unknown>
  /**
   * Optional, and the difference between `replace: false` meaning something and
   * meaning nothing.
   *
   * `useUrlState(key, def, { replace: false })` asks for a history ENTRY, so
   * the user can press Back to undo a filter change. Without this the router
   * branch called `replace` for both intents, so every such update was silently
   * downgraded — and only in router-wired apps, since the raw-history branch
   * had honoured the flag all along.
   *
   * A router without `push` still works: the update falls back to `replace` and
   * dev-warns once, rather than pretending.
   */
  push?(path: string, options?: UrlNavigateOptions): void | Promise<unknown>
  /**
   * Which part of the URL the router treats as the route.
   *
   * `@pyreon/router`'s DEFAULT is `'hash'`, where the whole route — path AND
   * query — lives in the fragment (`#/products?page=3`) and `location.search`
   * is empty. url-state used to build `/{pathname}?{search}` unconditionally,
   * so under the documented `setUrlRouter(useRouter())` bridge a write handed a
   * hash router `/?page=3`, which it wrote as `#/?page=3` — navigating the app
   * OFF `#/products` on the first filter change, and never reading back.
   *
   * `useRouter()` exposes `mode` as a public field, so structural typing picks
   * this up with no cast at the call site. Absent (a hand-rolled router) →
   * `'history'`, which is what every such router has always meant.
   *
   * `'memory'` — the route lives inside the router (`createRouter({ mode:
   * 'memory' })`), not in the page URL: url-state reads the query from
   * `_currentPath` and writes through the router, and never touches
   * `location`, which belongs to the page the router is embedded in.
   */
  mode?: 'hash' | 'history' | 'memory'
  /**
   * Base path for a sub-path deploy, history mode only. Underscore-prefixed
   * because that is the field `@pyreon/router` exposes (`_base`) — the name is
   * what structural typing binds to, so renaming it here would silently read
   * `undefined` off a real router.
   *
   * The router re-prefixes the base itself when it writes the URL, so the path
   * handed to it must be base-RELATIVE; `location.pathname` is not.
   */
  _base?: string
  /**
   * The router's current location (path, query and fragment) — read in
   * `mode: 'memory'`, where the page URL is not the route. Underscore-prefixed
   * for the same reason as `_base`: it is `@pyreon/router`'s field name.
   */
  _currentPath?: () => string
  /**
   * The router's reactive current route. When present, every live
   * `useUrlState` signal re-reads its param after each navigation — so
   * `router.push('/products?page=2')` or a `<RouterLink>` click updates the
   * signal. Without it only `popstate` and url-state's own writes are seen,
   * because a `pushState`/`replaceState` fires no event. `@pyreon/router`'s
   * `useRouter()` exposes it, so `setUrlRouter(useRouter())` needs nothing
   * more.
   */
  currentRoute?: () => unknown
}

/** Module-level router reference. Set via `setUrlRouter()`. */
let _router: UrlRouter | null = null
/**
 * Reactive twin of `_router`, so a signal created BEFORE `setUrlRouter` still
 * subscribes to the router's navigations once one is registered.
 */
const _routerSignal = signal<UrlRouter | null>(null)

/** @internal Tracked read of the registered router (for subscriptions). */
export function trackUrlRouter(): UrlRouter | null {
  return _routerSignal()
}

/**
 * A router without `push` cannot honour `replace: false`. Say so ONCE rather
 * than silently downgrading every update for the life of the page — the silent
 * downgrade is the bug this warning replaces.
 */
let _warnedNoPush = false

/** Register a router to use for URL updates instead of the raw history API. */
export function setUrlRouter(router: UrlRouter | null): void {
  _router = router
  _routerSignal.set(router)
  // A different router deserves its own verdict — the previous one's missing
  // `push` says nothing about this one.
  _warnedNoPush = false
}

/** @internal */
export function getUrlRouter(): UrlRouter | null {
  return _router
}

function warnRouterCannotPush(): void {
  if (_warnedNoPush) return
  _warnedNoPush = true
  /* v8 ignore next — the production arm of a dev gate: NODE_ENV is 'test' under
     vitest, so the false branch is unreachable by construction, not untested. */
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[Pyreon] url-state: `replace: false` asks for a history entry, but the router passed to `setUrlRouter()` has no `push` method — falling back to `replace`, so Back will not undo these updates. Give the router a `push(path)`, or drop `replace: false`.',
    )
  }
}

/**
 * Where the query lives: the registered router's route when the router owns it
 * outside `location.pathname` + `location.search` — in the fragment (hash
 * mode) or inside the router itself (memory mode) — else `null`, and the page
 * URL is the route.
 *
 * Derived from the REGISTERED router, never guessed from the URL: without a
 * router url-state owns `location.search` outright (it writes history itself,
 * and a hash router that was never registered keeps its fragment untouched),
 * so `'history'` is both the honest default and the pre-existing behaviour.
 */
function routerOwnedRoute(): { path: string; search: string; hash: string } | null {
  if (_router?.mode === 'memory') return splitRoute(_router._currentPath?.() ?? '/')
  return _router?.mode === 'hash' ? splitHashRoute() : null
}

/**
 * Split a route (`/products?page=3#top`) into its path, query and fragment.
 * An empty path is the root route, which the router itself spells `/`.
 */
function splitRoute(raw: string): { path: string; search: string; hash: string } {
  const h = raw.indexOf('#')
  const route = h === -1 ? raw : raw.slice(0, h)
  const hash = h === -1 ? '' : raw.slice(h)
  const q = route.indexOf('?')
  if (q === -1) return { path: route || '/', search: '', hash }
  return { path: route.slice(0, q) || '/', search: route.slice(q + 1), hash }
}

/**
 * Split a hash route (`#/products?page=3`) into its path and query halves.
 * An empty hash is the root route.
 */
function splitHashRoute(): { path: string; search: string; hash: string } {
  // SSR guard for the same reason `currentParams` carries one: the callers are
  // already `isClient`-guarded, but the guard is cross-function and the
  // no-window-in-ssr rule cannot trace it.
  /* v8 ignore next — the SSR arm: `isClient` is true under happy-dom, so this
     guard is unreachable in tests; it exists so the helper is SSR-safe. */
  if (!isClient) return { path: '/', search: '', hash: '' }
  return splitRoute(window.location.hash.slice(1))
}

/**
 * Strip the router's base off `location.pathname`, because the router prepends
 * it again when it writes the URL. Without this a `base: '/app'` deploy turned
 * `/app/products` into `/app/app/products?page=2` on the first write.
 */
function stripRouterBase(pathname: string): string {
  const base = _router?._base
  if (!base || base === '/') return pathname
  if (pathname === base) return '/'
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname
}

/** Read the current URL's search params. Client-only — callers guard SSR. */
function currentParams(): URLSearchParams {
  // SSR guard: callers funnel through the public `isClient`-guarded entries,
  // but guard here too so the helper is SSR-safe by construction (and the
  // no-window-in-ssr rule can't trace the cross-function guard).
  /* v8 ignore next — the SSR arm, unreachable under happy-dom (see above). */
  if (!isClient) return new URLSearchParams()
  return new URLSearchParams(routerOwnedRoute()?.search ?? window.location.search)
}

/**
 * Commit a `URLSearchParams` to the URL via the registered router or the raw
 * history API. This is the ONE place that touches `history` / the router —
 * `setParams`, `setParamRepeated`, and `commitParams` all funnel through it,
 * so the router-vs-history branch can't drift between write paths.
 *
 * It CAN still drift in what each branch supports, which is the subtler failure:
 * the history branch honoured `replace` from the start while the router branch
 * called `replace()` for both intents, so `replace: false` was a no-op in
 * exactly the apps that wire a router. Funnelling the CALL through one place
 * does not by itself make the two agree about what the call means.
 */
function commit(params: URLSearchParams, replace: boolean): void {
  /* v8 ignore next — the SSR arm, unreachable under happy-dom (see above). */
  if (!isClient) return
  const search = params.toString()
  const qs = search ? `?${search}` : ''
  // Ask the ROUTER which part of the URL is the route, rather than assuming
  // `location.pathname` is. In hash mode the query belongs INSIDE the fragment
  // next to the route path; in history mode the path handed to the router is
  // base-relative, and the fragment is carried through because it is nobody
  // else's to drop (`/docs#installation` used to become `/docs?page=2`). A
  // memory router's route lives inside it, fragment included.
  const owned = routerOwnedRoute()
  const url = owned
    ? `${owned.path}${qs}${owned.hash}`
    : _router
      ? `${stripRouterBase(window.location.pathname)}${qs}${window.location.hash}`
      : `${window.location.pathname}${qs}${window.location.hash}`

  if (_router) {
    if (!replace && typeof _router.push === 'function') {
      _router.push(url, PARAM_WRITE)
      return
    }
    if (!replace) warnRouterCannotPush()
    _router.replace(url, PARAM_WRITE)
    return
  }

  // A replace rewrites the URL of the CURRENT entry, whose `history.state`
  // belongs to whoever created it (@pyreon/router's `__pyreonIdx` stamp, another
  // library's per-entry state) — keep it. Writing `null` here erased the
  // router's stamp in every router app that never called `setUrlRouter`, such
  // as a Zero island (#4388). A push creates a NEW entry, which starts empty;
  // the entry it leaves keeps its own state.
  if (replace) {
    history.replaceState(history.state, '', url)
  } else {
    history.pushState(null, '', url)
  }
}

/** Write one or more search params to the URL without a full navigation. */
export function setParams(entries: Record<string, string | null>, replace: boolean): void {
  if (!isClient) return

  const params = currentParams()
  for (const [key, value] of Object.entries(entries)) {
    if (value === null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  commit(params, replace)
}

/**
 * Write an array param using repeated keys (e.g. `?tags=a&tags=b`).
 * When `values` is null the param is deleted.
 */
export function setParamRepeated(key: string, values: string[] | null, replace: boolean): void {
  if (!isClient) return

  const params = currentParams()
  params.delete(key)
  if (values !== null) {
    for (const v of values) params.append(key, v)
  }
  commit(params, replace)
}

/**
 * Apply a mix of single-value and repeated-array param mutations to the URL in
 * ONE history operation. Used by `batchUrlUpdates` to coalesce several
 * `.set()` calls into a single `replaceState` / `pushState` (or one
 * `router.replace`), so a batched multi-param update produces exactly one
 * history entry instead of N.
 *
 * @internal
 */
export function commitParams(
  single: Map<string, string | null>,
  repeated: Map<string, string[] | null>,
  replace: boolean,
): void {
  if (!isClient) return

  const params = currentParams()
  for (const [key, value] of single) {
    if (value === null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  for (const [key, values] of repeated) {
    params.delete(key)
    if (values !== null) {
      for (const v of values) params.append(key, v)
    }
  }
  commit(params, replace)
}
