export interface GuardOptions<S> {
  /** Resolve the current session (null = signed out). */
  session: () => S | null
  /** Where to send signed-out users. */
  loginPath: string
  /** Optional authorization check beyond "signed in". */
  allow?: (session: S) => boolean
}

export type GuardResult = true | { redirect: string }

// C0 controls + DEL, and the backslash browsers treat as a slash. The URL parser
// strips tab/CR/LF ANYWHERE in the input before parsing, so "/\t/evil.example"
// passes a `startsWith('//')` check and is then followed as "//evil.example".
function hasUnsafeReturnChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c <= 0x1f || c === 0x7f || c === 0x5c /* \ */) return true
  }

  return false
}
const ORIGIN_PROBE = 'https://return-to.invalid'

/** Decode percent-escapes until stable (a proxy or router may decode more than once); null if malformed. */
function decodeFully(path: string): string | null {
  let cur = path
  for (let i = 0; i < 3; i++) {
    let next: string
    try {
      next = decodeURIComponent(cur)
    } catch {
      return null
    }
    if (next === cur) return cur
    cur = next
  }

  return cur
}

/**
 * Only same-origin relative paths may round-trip as `returnTo` (open-redirect guard).
 * A value is accepted only if it starts with a single `/`, contains no control
 * characters or backslashes, resolves to the same origin under the WHATWG URL
 * parser (the parser browsers use), AND its resolved path does not start with `//`
 * — before or after percent-decoding — because `/a/../..//evil` resolves to `//evil`,
 * and a protocol-relative `Location: //evil` (or a decoding proxy turning `%2F%2F`
 * into `//`) leaves the site. Returns the normalised path (dot segments resolved).
 */
export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value || value[0] !== '/' || value[1] === '/' || hasUnsafeReturnChar(value)) return fallback
  let u: URL
  try {
    u = new URL(value, ORIGIN_PROBE)
  } catch {
    return fallback
  }
  if (u.origin !== ORIGIN_PROBE || u.pathname.startsWith('//')) return fallback
  const decoded = decodeFully(u.pathname)
  if (decoded === null || decoded.startsWith('//') || hasUnsafeReturnChar(decoded)) return fallback
  // The decoded path may resolve dot segments differently (`/%2e%2e/%2fevil`): resolve it too.
  try {
    const again = new URL(decoded, ORIGIN_PROBE)
    if (again.origin !== ORIGIN_PROBE || again.pathname.startsWith('//')) return fallback
  } catch {
    return fallback
  }

  return u.pathname + u.search + u.hash
}

/** Framework-neutral guard: returns `true` or a redirect target carrying a safe `returnTo`. */
export function createGuard<S>(opts: GuardOptions<S>): (path: string) => GuardResult {
  return (path) => {
    const s = opts.session()
    if (s && (opts.allow?.(s) ?? true)) return true
    const to = safeReturnTo(path)
    const sep = opts.loginPath.includes('?') ? '&' : '?'

    return { redirect: `${opts.loginPath}${sep}returnTo=${encodeURIComponent(to)}` }
  }
}
