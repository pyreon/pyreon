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
/**
 * Normalise a target the way a URL parser does, BEFORE classifying it.
 *
 * This is the load-bearing half of the guard. A classifier that inspects the
 * raw string is answering a different question from the one the browser will
 * ask: the WHATWG URL parser preprocesses its input first, so the string that
 * gets a scheme and an origin is not the string we were handed. Two steps, and
 * `String.prototype.trim()` covers neither completely:
 *
 *  1. **Strip leading/trailing C0 controls and space.** `trim()` removes
 *     Unicode whitespace but only five of the C0 controls (tab, LF, VT, FF,
 *     CR) — so `"\u0000//evil.com"` kept its prefix, did not start with `//`,
 *     and was classified INTERNAL. The browser strips the NUL and follows the
 *     protocol-relative URL to another origin.
 *  2. **Remove ALL ASCII tab and newline, anywhere in the input.** This one
 *     `trim()` cannot reach at all, because the character is in the middle:
 *     `"/<TAB>/evil.com"` was classified internal and resolves to
 *     `https://evil.com/`, and `"java<TAB>script:alert(1)"` was classified
 *     internal and resolves to a live `javascript:` URL.
 *
 * Both were verified against the platform's own URL parser rather than argued
 * from the spec text — see `redirect-normalisation.test.ts`.
 *
 * The normalised value is what the classifier inspects AND what it returns, so
 * the string we judged is the string that ships. Returning the original was the
 * second half of the bug: even a correct verdict would have handed the caller
 * back the bytes that produce a different one.
 */
function normaliseTarget(target: string): string {
  // Step 2 first, because it is the one a regex expresses safely: a character
  // class with no quantifier scans linearly and cannot backtrack.
  const s = target.replace(/[\t\n\r]/g, '')

  // Step 1 is an INDEX WALK, deliberately not a regex. The obvious spelling —
  // `/^[\u0000-\u0020\s]+|[\u0000-\u0020\s]+$/g` — is a polynomial ReDoS:
  // the two alternatives are quantified over an AMBIGUOUS class (`\u0000-\u0020`
  // already contains every character `\s` adds below U+0080), so on a long run
  // of matching characters the engine retries the `$`-anchored branch from
  // every position. This function's input can be attacker-supplied — a `?next=`
  // parameter is the canonical case — which is exactly the reachability that
  // makes it a denial of service rather than a curiosity. CodeQL flagged it.
  //
  // `<= 0x20` is not an approximation: the URL parser strips "C0 control or
  // space", which is U+0000–U+001F plus U+0020, and nothing else. Dropping `\s`
  // therefore makes this MORE faithful, not less — a leading U+00A0 is not
  // stripped by a browser either, so it stays part of the path.
  let start = 0
  let end = s.length
  while (start < end && s.charCodeAt(start) <= 0x20) start++
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--
  return s.slice(start, end)
}

export function classifyRedirectTarget(target: string): RedirectClass {
  const t = normaliseTarget(target)
  if (/^https?:\/\//i.test(t)) return { kind: 'external', url: t }
  if (t.startsWith('//')) return { kind: 'block', url: '/' }
  // Any other explicit scheme (javascript:, data:, mailto:, tel:, …) is not a
  // navigation target — block it. A bare path has no leading `scheme:`.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return { kind: 'block', url: '/' }
  return { kind: 'internal', url: t }
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
