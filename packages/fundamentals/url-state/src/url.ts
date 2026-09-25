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
export interface UrlRouter {
  // Return type is intentionally `unknown`-wide: url-state calls these purely
  // for their side effect and ignores the result, so ANY router whose
  // `replace(path)` returns nothing OR a promise of anything satisfies the
  // bridge. `@pyreon/router`'s `replace` returns `Promise<NavigationResult>`
  // (since #2171) — narrowing this to `Promise<void>` broke `setUrlRouter(useRouter())`.
  replace(path: string): void | Promise<unknown>
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
  push?(path: string): void | Promise<unknown>
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
   */
  mode?: 'hash' | 'history'
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
 * Which half of the URL the query lives in.
 *
 * Derived from the REGISTERED router, never guessed from the URL: without a
 * router url-state owns `location.search` outright (it writes history itself,
 * and a hash router that was never registered keeps its fragment untouched),
 * so `'history'` is both the honest default and the pre-existing behaviour.
 */
function routeOwnsHash(): boolean {
  return _router?.mode === 'hash'
}

/**
 * Split a hash route (`#/products?page=3`) into its path and query halves.
 * An empty hash is the root route, which the router itself spells `/`.
 */
function splitHashRoute(): { path: string; search: string } {
  // SSR guard for the same reason `currentParams` carries one: the callers are
  // already `isClient`-guarded, but the guard is cross-function and the
  // no-window-in-ssr rule cannot trace it.
  /* v8 ignore next — the SSR arm: `isClient` is true under happy-dom, so this
     guard is unreachable in tests; it exists so the helper is SSR-safe. */
  if (!isClient) return { path: '/', search: '' }
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const q = raw.indexOf('?')
  if (q === -1) return { path: raw || '/', search: '' }
  return { path: raw.slice(0, q) || '/', search: raw.slice(q + 1) }
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
  return new URLSearchParams(routeOwnsHash() ? splitHashRoute().search : window.location.search)
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
  // else's to drop (`/docs#installation` used to become `/docs?page=2`).
  const url = _router
    ? routeOwnsHash()
      ? `${splitHashRoute().path}${qs}`
      : `${stripRouterBase(window.location.pathname)}${qs}${window.location.hash}`
    : `${window.location.pathname}${qs}${window.location.hash}`

  if (_router) {
    if (!replace && typeof _router.push === 'function') {
      _router.push(url)
      return
    }
    if (!replace) warnRouterCannotPush()
    _router.replace(url)
    return
  }

  if (replace) {
    history.replaceState(null, '', url)
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
