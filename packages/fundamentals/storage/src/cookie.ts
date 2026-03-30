import { signal } from '@pyreon/reactivity'
import { getEntry, removeEntry, setEntry } from './registry'
import type { CookieOptions, StorageSignal } from './types'
import { deserialize, isBrowser, serialize } from './utils'

// ─── Server-side cookie source ───────────────────────────────────────────────

let serverCookieString = ''

/**
 * Set the cookie source string for SSR. Call this once per request
 * with the raw Cookie header value.
 *
 * @example
 * ```ts
 * // In your SSR request handler
 * setCookieSource(request.headers.get('cookie') ?? '')
 * ```
 */
export function setCookieSource(cookieHeader: string): void {
  serverCookieString = cookieHeader
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
  return serverCookieString
}

function readCookie(key: string): string | null {
  const cookies = parseCookies(getCookieString())
  return cookies.get(key) ?? null
}

// ─── Cookie writing ──────────────────────────────────────────────────────────

function writeCookie<T>(key: string, value: T, options: CookieOptions<T>): void {
  if (!isBrowser()) return

  const serialized = serialize(value, options.serializer)
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

  // biome-ignore lint/suspicious/noDocumentCookie: document.cookie is the standard cookie write API
  document.cookie = cookie
}

function deleteCookie<T>(key: string, options: CookieOptions<T>): void {
  if (!isBrowser()) return

  let cookie = `${encodeURIComponent(key)}=; max-age=0`
  cookie += `; path=${options.path ?? '/'}`
  if (options.domain) {
    cookie += `; domain=${options.domain}`
  }

  // biome-ignore lint/suspicious/noDocumentCookie: document.cookie is the standard cookie write API
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
    raw !== null
      ? deserialize(raw, defaultValue, options.deserializer, options.onError)
      : defaultValue

  const sig = signal<T>(initialValue)

  // Build the storage signal
  const storageSig = (() => sig()) as unknown as StorageSignal<T>

  storageSig.peek = () => sig.peek()
  storageSig.subscribe = (listener: () => void) => sig.subscribe(listener)
  storageSig.direct = (updater: () => void) => sig.direct(updater)
  storageSig.debug = () => sig.debug()

  Object.defineProperty(storageSig, 'label', {
    get: () => sig.label,
    set: (v: string | undefined) => {
      sig.label = v
    },
  })

  storageSig.set = (value: T) => {
    sig.set(value)
    writeCookie(key, value, options)
  }

  storageSig.update = (fn: (current: T) => T) => {
    const newValue = fn(sig.peek())
    storageSig.set(newValue)
  }

  storageSig.remove = () => {
    sig.set(defaultValue)
    deleteCookie(key, options)
    removeEntry('cookie', key)
  }

  setEntry('cookie', key, storageSig, defaultValue)

  return storageSig
}
