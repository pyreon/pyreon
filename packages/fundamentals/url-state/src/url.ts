import { isClient } from '@pyreon/reactivity'

/** Read a search param from the current URL. Returns `null` if not present. */
export function getParam(key: string): string | null {
  if (!isClient) return null
  return new URLSearchParams(window.location.search).get(key)
}

/**
 * Read all values for a repeated param (e.g. `?tags=a&tags=b`).
 * Returns an empty array if the param is not present.
 */
export function getParamAll(key: string): string[] {
  if (!isClient) return []
  return new URLSearchParams(window.location.search).getAll(key)
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
}

/** Module-level router reference. Set via `setUrlRouter()`. */
let _router: UrlRouter | null = null

/**
 * A router without `push` cannot honour `replace: false`. Say so ONCE rather
 * than silently downgrading every update for the life of the page — the silent
 * downgrade is the bug this warning replaces.
 */
let _warnedNoPush = false

/** Register a router to use for URL updates instead of the raw history API. */
export function setUrlRouter(router: UrlRouter | null): void {
  _router = router
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
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[Pyreon] url-state: `replace: false` asks for a history entry, but the router passed to `setUrlRouter()` has no `push` method — falling back to `replace`, so Back will not undo these updates. Give the router a `push(path)`, or drop `replace: false`.',
    )
  }
}

/** Read the current URL's search params. Client-only — callers guard SSR. */
function currentParams(): URLSearchParams {
  // SSR guard: callers funnel through the public `isClient`-guarded entries,
  // but guard here too so the helper is SSR-safe by construction (and the
  // no-window-in-ssr rule can't trace the cross-function guard).
  if (!isClient) return new URLSearchParams()
  return new URLSearchParams(window.location.search)
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
  if (!isClient) return
  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname

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
