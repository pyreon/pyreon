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

/**
 * Only same-origin relative paths may round-trip as `returnTo` (open-redirect guard).
 * A value is accepted only if it starts with a single `/`, contains no control
 * characters or backslashes, AND resolves to the same origin under the WHATWG URL
 * parser — the parser browsers use, so the check cannot disagree with navigation.
 */
export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value || value[0] !== '/' || value[1] === '/' || hasUnsafeReturnChar(value)) return fallback
  try {
    if (new URL(value, ORIGIN_PROBE).origin !== ORIGIN_PROBE) return fallback
  } catch {
    return fallback
  }
  return value
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
