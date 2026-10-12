export interface GuardOptions<S> {
  /** Resolve the current session (null = signed out). */
  session: () => S | null
  /** Where to send signed-out users. */
  loginPath: string
  /** Optional authorization check beyond "signed in". */
  allow?: (session: S) => boolean
}

export type GuardResult = true | { redirect: string }

/** Only same-origin relative paths may round-trip as `returnTo` (open-redirect guard). */
export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}

/** Framework-neutral guard: returns `true` or a redirect target carrying a safe `returnTo`. */
export function createGuard<S>(opts: GuardOptions<S>): (path: string) => GuardResult {
  return (path) => {
    const s = opts.session()
    if (s && (opts.allow?.(s) ?? true)) return true
    const to = safeReturnTo(path)
    return { redirect: `${opts.loginPath}?returnTo=${encodeURIComponent(to)}` }
  }
}
