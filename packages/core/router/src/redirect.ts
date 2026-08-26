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
 * @param url - Target URL. A same-origin path (`/login`) is an SPA navigation;
 *   an explicit `http(s)://…` URL is a real CROSS-ORIGIN navigation on BOTH the
 *   server (a `Location:` header) and the client (a `window.location` nav) — so
 *   VALIDATE an untrusted / user-supplied value (e.g. a `?next=` param) against an
 *   allowlist first, or it is an open redirect. Protocol-relative (`//host`) and
 *   non-`http(s)` schemes (`javascript:` …) are refused and routed to `/`.
 * @param status - HTTP redirect status. Default `307` (Temporary Redirect, method-preserving).
 *   Use `301`/`308` for permanent moves, `302`/`303` to force GET on the target.
 */
export function redirect(url: string, status: RedirectStatus = 307): never {
  const err = new Error(`Redirect to ${url}`)
  ;(err as unknown as Record<symbol, RedirectInfo>)[REDIRECT] = { url, status }
  throw err
}

/** Classification of a redirect target — see {@link classifyRedirectTarget}. */
export type RedirectClass =
  | { kind: 'internal'; url: string }
  | { kind: 'external'; url: string }
  | { kind: 'block'; url: string }

/**
 * Classify a redirect / navigation target, SHARED by the client router and the
 * SSR handler so both agree on what a target means (the two used to disagree —
 * the client rewrote every absolute URL to `/`, silently breaking the documented
 * cross-origin `redirect('https://…')`, while the server emitted it verbatim).
 *
 *  - `external`  — an explicit `http(s)://…` URL: an intentional CROSS-ORIGIN
 *    navigation. On the client this is a real `window.location` navigation; on
 *    the server it becomes a `Location:` header. **The target is trusted to the
 *    caller** — validate an untrusted `?next=` / user-supplied value against an
 *    allowlist before passing it, exactly as with any framework's redirect.
 *  - `block`     — a protocol-relative URL (`//host`, an open-redirect
 *    obfuscation vector) or any non-`http(s)` scheme (`javascript:`, `data:`,
 *    `vbscript:`, `mailto:`, …). Never a valid navigation target; routed to `/`.
 *  - `internal`  — a same-origin path; handled by the router as an SPA nav.
 */
export function classifyRedirectTarget(target: string): RedirectClass {
  const t = target.trim()
  if (/^https?:\/\//i.test(t)) return { kind: 'external', url: t }
  if (t.startsWith('//')) return { kind: 'block', url: '/' }
  // Any other explicit scheme (javascript:, data:, mailto:, tel:, …) is not a
  // navigation target — block it. A bare path has no leading `scheme:`.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return { kind: 'block', url: '/' }
  return { kind: 'internal', url: target }
}

/** Server-safe redirect target: `external`/`internal` pass through, everything else → `/`. */
export function safeRedirectLocation(target: string): string {
  const c = classifyRedirectTarget(target)
  return c.kind === 'block' ? '/' : c.url
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
