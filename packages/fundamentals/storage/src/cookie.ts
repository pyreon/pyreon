import { signal, wrapSignal } from '@pyreon/reactivity'
import { getEntry, removeEntry, setEntry } from './registry'
import type { CookieOptions, StorageSignal } from './types'
import { deserialize, isBrowser, serialize } from './utils'

// ─── Server-side cookie source ───────────────────────────────────────────────

// The SSR cookie source. A plain string (fixed for the process/request) OR an
// accessor evaluated LAZILY at each cookie read — the accessor form is the seam
// an SSR integration wires to its per-request context (e.g. reading the current
// request's `Cookie` header out of `runWithRequestContext`'s AsyncLocalStorage),
// so concurrent requests each resolve their own cookies without this module
// holding per-request state. `null` clears it.
let serverCookieSource: string | (() => string) | null = null

/**
 * Tell `useCookie` how to read cookies during SSR. Pass the raw `Cookie` header
 * string, an accessor returning it (evaluated lazily at read time — wire this to
 * your per-request context for concurrency-safe SSR), or `null` to clear.
 *
 * The module-level source is a single slot, so a bare STRING is shared across
 * concurrent requests — safe only when rendering is serialized per process. For
 * a server handling concurrent requests, pass an ACCESSOR that reads the current
 * request's cookies from your request context.
 *
 * @example
 * ```ts
 * // Simplest — single request in flight (dev / serialized render):
 * setCookieSource(request.headers.get('cookie') ?? '')
 *
 * // Concurrency-safe — accessor bound to the per-request context:
 * setCookieSource(() => currentRequest().headers.get('cookie') ?? '')
 * ```
 */
export function setCookieSource(source: string | (() => string) | null): void {
  serverCookieSource = source
}

// ─── Cookie parsing ──────────────────────────────────────────────────────────

function parseCookies(cookieString: string): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!cookieString) return cookies

  for (const pair of cookieString.split(';')) {
    const eqIndex = pair.indexOf('=')
    if (eqIndex === -1) continue
    const name = pair.slice(0, eqIndex).trim()
    const value = pair.slice(eqIndex + 1).trim()
    if (name) cookies.set(name, decodeURIComponent(value))
  }

  return cookies
}

function getCookieString(): string {
  if (isBrowser()) return document.cookie
  if (typeof serverCookieSource === 'function') return serverCookieSource()
  return serverCookieSource ?? ''
}

function readCookie(key: string): string | null {
  const cookies = parseCookies(getCookieString())
  return cookies.get(key) ?? null
}

// ─── Cookie writing ──────────────────────────────────────────────────────────

function writeCookie<T>(key: string, value: T, options: CookieOptions<T>): void {
  /* v8 ignore next — SSR/isBrowser guard */
  if (!isBrowser()) return

  const serialized = serialize(value, options)
  let cookie = `${encodeURIComponent(key)}=${encodeURIComponent(serialized)}`

  if (options.maxAge !== undefined) {
    cookie += `; max-age=${options.maxAge}`
  }
  if (options.expires) {
    cookie += `; expires=${options.expires.toUTCString()}`
  }
  cookie += `; path=${options.path ?? '/'}`
  if (options.domain) {
    cookie += `; domain=${options.domain}`
  }
  if (options.secure) {
    cookie += '; secure'
  }
  cookie += `; samesite=${options.sameSite ?? 'lax'}`

  document.cookie = cookie
}

function deleteCookie<T>(key: string, options: CookieOptions<T>): void {
  /* v8 ignore next — SSR/isBrowser guard */
  if (!isBrowser()) return

  let cookie = `${encodeURIComponent(key)}=; max-age=0`
  cookie += `; path=${options.path ?? '/'}`
  if (options.domain) {
    cookie += `; domain=${options.domain}`
  }

  document.cookie = cookie
}

// ─── useCookie ───────────────────────────────────────────────────────────────

/**
 * Reactive signal backed by a browser cookie. SSR-compatible when
 * used with setCookieSource().
 *
 * @example
 * ```ts
 * const locale = useCookie('locale', 'en', {
 *   maxAge: 60 * 60 * 24 * 365, // 1 year
 *   path: '/',
 *   sameSite: 'lax',
 * })
 * locale()          // 'en'
 * locale.set('de')  // sets cookie + updates signal
 * locale.remove()   // deletes cookie, resets to default
 * ```
 */
export function useCookie<T>(
  key: string,
  defaultValue: T,
  options: CookieOptions<T> = {},
): StorageSignal<T> {
  // Return existing signal if already registered
  const existing = getEntry<T>('cookie', key)
  if (existing) return existing.signal

  // Read initial value from cookie
  const raw = readCookie(key)
  const initialValue =
    raw !== null ? deserialize(raw, defaultValue, options) : defaultValue

  const sig = signal<T>(initialValue)

  // `wrapSignal` delegates reads (incl. `.direct` + `_v`) to the shared base
  // `sig` and routes writes through our cookie writer; `.update` defaults.
  const storageSig = wrapSignal(sig, {
    set: (value: T) => {
      sig.set(value)
      writeCookie(key, value, options)
    },
  }) as unknown as StorageSignal<T>

  storageSig.remove = () => {
    sig.set(defaultValue)
    deleteCookie(key, options)
    removeEntry('cookie', key)
  }

  setEntry('cookie', key, storageSig, defaultValue, options)

  return storageSig
}
