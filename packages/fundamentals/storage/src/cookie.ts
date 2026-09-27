import { signal, wrapSignal } from '@pyreon/reactivity'
import { getEntry, releaseEntry, retainEntry, setEntry, warnIfOptionsDiffer } from './registry'
import type { CookieOptions, StorageSignal } from './types'
import { deserialize, isBrowser, serialize } from './utils'

// ─── Server-side cookie source ───────────────────────────────────────────────

// The SSR cookie source. A plain string (fixed for the process/request) OR an
// accessor evaluated LAZILY at each cookie read — the accessor form is the seam
// an SSR integration wires to its per-request context (e.g. reading the current
// request's `Cookie` header out of `runWithRequestContext`'s AsyncLocalStorage),
// so concurrent requests each resolve their own cookies without this module
// holding per-request state. `null` clears it.
//
// The accessor form only became REACHABLE past request #1 once the signal
// registry was isolated per request (see `registry.ts`): the registry caches
// the resolved signal per key, so request B used to be handed request A's
// signal — holding A's cookie value — and this source was never consulted.
// Correct seam, unreachable. Both halves are required.
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
 * The registry that caches cookie signals is isolated per request automatically
 * under `@pyreon/runtime-server` (`renderToString` / `renderToStream` /
 * `runWithRequestContext`), so an accessor source is honoured on EVERY request,
 * not only the first.
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
    const rawName = pair.slice(0, eqIndex).trim()
    const value = pair.slice(eqIndex + 1).trim()
    if (!rawName) continue
    // `writeCookie` URI-encodes the NAME as well as the value, so the name must
    // be decoded here too — otherwise a key with a space, `;`, `=` or any
    // non-ASCII character is written under its encoded form and never found
    // again on read. Same malformed-escape fallback as the value below.
    let name: string
    try {
      name = decodeURIComponent(rawName)
    } catch {
      name = rawName
    }
    // `decodeURIComponent` throws `URIError` on a malformed percent-escape (a
    // bare `%`, or `%` not followed by two hex digits). `document.cookie` mixes
    // in cookies set by ANY code on the origin (third-party scripts, a server
    // reflecting user input un-encoded, subdomains), so one bad entry would
    // otherwise throw out of `parseCookies` and break EVERY cookie read
    // app-wide. Fall back to the raw value so every other cookie still reads.
    try {
      cookies.set(name, decodeURIComponent(value))
    } catch {
      cookies.set(name, value)
    }
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

// Browsers drop a cookie whose name + value exceeds ~4096 bytes — silently.
const COOKIE_SIZE_LIMIT = 4096

function isHttpsPage(): boolean {
  return globalThis.location?.protocol === 'https:'
}

function writeCookie<T>(key: string, value: T, options: CookieOptions<T>): void {
  if (!isBrowser()) {
    // Nothing can reach the response from here: a server-side `.set()` updates
    // the signal for this render and nothing else. Say so once, in dev.
    if (process.env.NODE_ENV !== 'production') {
      warnOnce(
        `server-set:${key}`,
        `[Pyreon] useCookie("${key}").set() ran on the server. It updates the signal for this render only — no Set-Cookie header is sent. Set the cookie in your server response (or from the client) to persist it.`,
      )
    }
    return
  }

  const serialized = serialize(value, options)
  const pair = `${encodeURIComponent(key)}=${encodeURIComponent(serialized)}`
  let cookie = pair

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
  const sameSite = options.sameSite ?? 'lax'
  // Default: secure on an https page (a cookie set there should never travel
  // over plain http), and ALWAYS for `sameSite: 'none'`, which browsers reject
  // outright without `secure`. An explicit `secure` still wins.
  const secure = options.secure ?? (sameSite === 'none' || isHttpsPage())
  if (secure) {
    cookie += '; secure'
  }
  cookie += `; samesite=${sameSite}`

  if (process.env.NODE_ENV !== 'production') {
    if (sameSite === 'none' && !secure) {
      warnOnce(
        `none-insecure:${key}`,
        `[Pyreon] useCookie("${key}"): sameSite: 'none' with secure: false — browsers reject this cookie, so it is never stored. Drop \`secure: false\` (it defaults to true for sameSite 'none') or pick another sameSite.`,
      )
    }
    if (pair.length > COOKIE_SIZE_LIMIT) {
      warnOnce(
        `size:${key}`,
        `[Pyreon] useCookie("${key}"): the encoded cookie is ${pair.length} bytes, over the ~${COOKIE_SIZE_LIMIT}-byte browser limit — browsers silently drop it. Store large values with useIndexedDB or useStorage instead.`,
      )
    }
  }

  document.cookie = cookie
}

// Dev-only, once per message id. Bounded by (keys × 3 kinds).
const warned = new Set<string>()
function warnOnce(id: string, message: string): void {
  if (process.env.NODE_ENV === 'production') return
  if (warned.has(id)) return
  warned.add(id)
  // oxlint-disable-next-line no-console
  console.warn(message)
}

/** Test-only: forget which cookie warnings were already shown. */
export function _resetCookieWarnings(): void {
  warned.clear()
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
 * Reactive signal backed by a browser cookie. SSR-compatible when used with
 * `setCookieSource()` — and per-request under `@pyreon/runtime-server`, which
 * isolates the signal registry for each render (see `registry.ts`).
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
  // Same-key consumers each retain the per-key registry refcount, so the entry
  // is destroyed on the LAST `.remove()` and not the first. `useStorage` was
  // fixed this way in #725/#729 and the registry's own docstring states the
  // contract ("per-consumer `.remove()` goes through `releaseEntry`") — this
  // backend kept the pre-fix shape, so one consumer's `.remove()` orphaned
  // every sibling: `clearStorage`/`removeStorage` stopped seeing their signal,
  // and the next call for the same key minted a SECOND, independent one.
  const existing = getEntry<T>('cookie', key)
  if (existing) {
    warnIfOptionsDiffer('cookie', key, existing, defaultValue, options)
    retainEntry('cookie', key)
    return existing.signal
  }

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
    // The VALUE is always cleared — that is what the caller asked for. Only the
    // registry entry is refcounted, matching `createStorageSignal`'s contract.
    sig.set(defaultValue)
    deleteCookie(key, options)
    releaseEntry('cookie', key)
  }

  setEntry('cookie', key, storageSig, defaultValue, options)

  return storageSig
}
