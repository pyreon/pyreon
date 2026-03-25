const _isBrowser = typeof window !== "undefined"

/** Read a search param from the current URL. Returns `null` if not present. */
export function getParam(key: string): string | null {
  if (!_isBrowser) return null
  return new URLSearchParams(window.location.search).get(key)
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

  if (replace) {
    history.replaceState(null, "", url)
  } else {
    history.pushState(null, "", url)
  }
}

export { _isBrowser }
