// ─── Redirect symbol + throw ────────────────────────────────────────────────

const REDIRECT = Symbol.for('pyreon.redirect')

/** Standard redirect status codes. 307/308 preserve the request method, 302/303 don't. */
export type RedirectStatus = 301 | 302 | 303 | 307 | 308

interface RedirectInfo {
  url: string
  status: RedirectStatus
}

/**
 * Throw inside a route loader to redirect the navigation server-side
 * (during SSR returns a 302/307 `Location:` response) and client-side
 * (during CSR triggers `router.replace()` before the layout renders).
 *
 * The auth-gate use case: replaces the fragile `onMount + router.push()`
 * workaround. `onMount` doesn't fire reliably under nested-layout dev SSR +
 * hydration — so the layout renders briefly before the push happens, leaking
 * authenticated UI to unauthenticated users. `redirect()` runs in the loader
 * BEFORE the layout's component is invoked, so the unauthenticated UI never
 * mounts in the first place.
 *
 * @example
 * ```ts
 * // src/routes/app/_layout.tsx
 * export const loader = async ({ request }) => {
 *   const session = await getSession(request)
 *   if (!session) redirect('/login')
 *   return { user: session.user }
 * }
 * ```
 *
 * @param url - Target URL (typically a path like `/login` or absolute URL for cross-origin).
 * @param status - HTTP redirect status. Default `307` (Temporary Redirect, method-preserving).
 *   Use `301`/`308` for permanent moves, `302`/`303` to force GET on the target.
 */
export function redirect(url: string, status: RedirectStatus = 307): never {
  const err = new Error(`Redirect to ${url}`)
  ;(err as unknown as Record<symbol, RedirectInfo>)[REDIRECT] = { url, status }
  throw err
}

/** Check if an error is a RedirectError thrown by `redirect()`. */
export function isRedirectError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as Record<symbol, unknown>)[REDIRECT] === 'object'
  )
}

/**
 * Extract the redirect URL and status from a thrown RedirectError. Returns
 * `null` if `err` isn't a RedirectError. Used by the router's loader-runner
 * (CSR) and the SSR handler to convert the thrown error into the right kind
 * of response (a `router.replace()` call or a `302`/`307` Response).
 */
export function getRedirectInfo(err: unknown): RedirectInfo | null {
  if (!isRedirectError(err)) return null
  return (err as Record<symbol, RedirectInfo>)[REDIRECT] ?? null
}
