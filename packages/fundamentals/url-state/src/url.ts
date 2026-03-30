const _isBrowser = typeof window !== 'undefined'

/** Read a search param from the current URL. Returns `null` if not present. */
export function getParam(key: string): string | null {
  if (!_isBrowser) return null
  return new URLSearchParams(window.location.search).get(key)
}

/**
 * Read all values for a repeated param (e.g. `?tags=a&tags=b`).
 * Returns an empty array if the param is not present.
 */
export function getParamAll(key: string): string[] {
  if (!_isBrowser) return []
  return new URLSearchParams(window.location.search).getAll(key)
}

/**
 * Minimal router-like interface — only the `replace` method is needed.
 * This avoids a hard dependency on `@pyreon/router`.
 */
export interface UrlRouter {
  replace(path: string): void | Promise<void>
}

/** Module-level router reference. Set via `setUrlRouter()`. */
let _router: UrlRouter | null = null

/** Register a router to use for URL updates instead of the raw history API. */
export function setUrlRouter(router: UrlRouter | null): void {
  _router = router
}

/** @internal */
export function getUrlRouter(): UrlRouter | null {
  return _router
}

/** Write one or more search params to the URL without a full navigation. */
export function setParams(entries: Record<string, string | null>, replace: boolean): void {
  if (!_isBrowser) return

  const params = new URLSearchParams(window.location.search)

  for (const [key, value] of Object.entries(entries)) {
    if (value === null) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }

  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname

  if (_router) {
    _router.replace(url)
    return
  }

  if (replace) {
    history.replaceState(null, '', url)
  } else {
    history.pushState(null, '', url)
  }
}

/**
 * Write an array param using repeated keys (e.g. `?tags=a&tags=b`).
 * When `values` is null the param is deleted.
 */
export function setParamRepeated(key: string, values: string[] | null, replace: boolean): void {
  if (!_isBrowser) return

  const params = new URLSearchParams(window.location.search)
  params.delete(key)

  if (values !== null) {
    for (const v of values) {
      params.append(key, v)
    }
  }

  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname

  if (_router) {
    _router.replace(url)
    return
  }

  if (replace) {
    history.replaceState(null, '', url)
  } else {
    history.pushState(null, '', url)
  }
}

export { _isBrowser }
