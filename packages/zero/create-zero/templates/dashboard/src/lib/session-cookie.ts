/**
 * The session cookie — written and read ONLY on the server.
 *
 * `HttpOnly` keeps it out of `document.cookie`, so an XSS bug cannot read the
 * session id; `SameSite=Lax` keeps it off cross-site POSTs; `Secure` keeps it
 * off plain HTTP everywhere except `http://localhost`, so `vite dev` works
 * without TLS. Kept apart from `auth.ts` so it survives the Supabase overlay,
 * which replaces that file.
 */
export const SESSION_COOKIE = "sid"

/** Session lifetime in seconds — the cookie's Max-Age and the stub's expiry. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

function isLocalHttp(request: Request): boolean {
  const url = new URL(request.url)
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
  )
}

function attributes(request: Request, maxAge: number): string {
  const secure = isLocalHttp(request) ? "" : "; Secure"
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

/** `Set-Cookie` value that stores `sessionId`. */
export function sessionCookie(sessionId: string, request: Request): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; ${attributes(request, SESSION_TTL_SECONDS)}`
}

/** `Set-Cookie` value that removes the session cookie. */
export function clearedSessionCookie(request: Request): string {
  return `${SESSION_COOKIE}=; ${attributes(request, 0)}`
}

/** The session id the request carries, if any. */
export function readSessionId(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") ?? ""
  const raw = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie)?.[1]
  if (!raw) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    return undefined
  }
}
