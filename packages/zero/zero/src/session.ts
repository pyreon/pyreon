/**
 * Signed cookie sessions — `@pyreon/zero/session`.
 *
 * Stateless: the whole session lives in one HMAC-SHA256-signed cookie (Web
 * Crypto, so Node / Bun / Deno / workerd all work). Tampered, expired or
 * malformed cookies read as an EMPTY session — never an error.
 *
 * **Privacy contract.** Any response whose handling READ or WROTE the session
 * is marked `Cache-Control: private, no-store` + `Vary: Cookie`. That is an
 * unconditional disqualifier in `createISRHandler`'s cacheability check (it
 * holds even with a custom `cacheKey`), so a per-user render can never enter
 * the ISR cache or a shared CDN cache. A request that never touches the
 * session stays cacheable.
 *
 * **Streaming caveat.** In `mode: 'stream'` response headers leave with the
 * shell, so a session read/write that first happens inside a Suspense
 * boundary AFTER the shell flush cannot mark the response or set a cookie.
 * Touch the session in middleware or a loader (both run before the shell).
 */
import type { Middleware, MiddlewareContext } from '@pyreon/server'
import { useRequestLocals } from '@pyreon/server'
import {
  createSigner,
  markPrivate,
  normalizeSecrets,
  readCookie,
  replaceSetCookie,
  serializeCookie,
} from './utils/signed-cookie'
import type { CookieAttributes } from './utils/signed-cookie'

/** Browsers cap a cookie (name + value + attributes) at ~4096 bytes. */
const DEFAULT_MAX_BYTES = 4096

export interface SessionOptions {
  /**
   * Signing secret(s), each ≥ 32 characters. `secret[0]` signs, every entry
   * verifies — rotate by prepending a new secret and removing the oldest
   * after one `maxAge`.
   */
  secret: string | readonly string[]
  /** Cookie name. Default `'pyreon_session'`. */
  cookieName?: string
  /** Lifetime in seconds (cookie `Max-Age` AND signed expiry). Default 7 days. */
  maxAge?: number
  /**
   * Cookie attributes. Defaults: `httpOnly: true`, `sameSite: 'lax'`,
   * `path: '/'`, `secure: true` except for `http://localhost` / `127.0.0.1`
   * requests (so local dev works without TLS).
   */
  cookie?: Omit<CookieAttributes, 'maxAge'>
  /** Maximum serialized `Set-Cookie` size in bytes. Default 4096. */
  maxBytes?: number
}

/** A request-scoped session. Reads are sync; writes are async (they re-sign). */
export interface Session<T extends Record<string, unknown> = Record<string, unknown>> {
  get<K extends keyof T & string>(key: K): T[K] | undefined
  has(key: keyof T & string): boolean
  /** A shallow copy of every value. */
  all(): Partial<T>
  set<K extends keyof T & string>(key: K, value: T[K]): Promise<void>
  /** Merge several keys in one signing pass. */
  update(patch: Partial<T>): Promise<void>
  unset(key: keyof T & string): Promise<void>
  /** Clear every value and expire the cookie. */
  destroy(): Promise<void>
}

const SESSION_LOCAL = '__pyreonSession'
// Request → session, so loaders (which receive only `request`) can reach it.
// A WeakMap keyed by the Request object: collected with the request.
const byRequest = new WeakMap<Request, Session>()

function isLocalHttp(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
}

/**
 * Session middleware. Register it BEFORE anything that reads the session.
 *
 * @example
 * ```ts
 * import { createServer } from '@pyreon/zero/server'
 * import { sessionMiddleware } from '@pyreon/zero/session'
 *
 * export default createServer({
 *   routes,
 *   middleware: [sessionMiddleware({ secret: process.env.SESSION_SECRET! })],
 * })
 * ```
 */
export function sessionMiddleware(options: SessionOptions): Middleware {
  const secrets = normalizeSecrets(options.secret, 'sessionMiddleware')
  const signer = createSigner(secrets)
  const name = options.cookieName ?? 'pyreon_session'
  const maxAge = options.maxAge ?? 60 * 60 * 24 * 7
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  return async (ctx: MiddlewareContext) => {
    const raw = await signer.verify(readCookie(ctx.req, name))
    let data: Record<string, unknown> =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
    const attrs: CookieAttributes = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !isLocalHttp(ctx.url),
      ...options.cookie,
    }
    const touch = (): void => markPrivate(ctx.headers)
    const commit = async (): Promise<void> => {
      touch()
      if (Object.keys(data).length === 0) {
        replaceSetCookie(ctx.headers, name, serializeCookie(name, '', { ...attrs, maxAge: 0 }))
        return
      }
      const cookie = serializeCookie(name, await signer.sign(data, maxAge), { ...attrs, maxAge })
      if (cookie.length > maxBytes) {
        throw new Error(
          `[Pyreon] session: the signed session cookie is ${cookie.length} bytes, over the ${maxBytes}-byte limit `
          + '(browsers drop larger cookies silently). Store an id in the session and keep the data server-side.',
        )
      }
      replaceSetCookie(ctx.headers, name, cookie)
    }
    const session: Session = {
      get: (k) => (touch(), data[k]),
      has: (k) => (touch(), Object.hasOwn(data, k)),
      all: () => (touch(), { ...data }),
      async set(k, v) {
        data = { ...data, [k]: v }
        await commit()
      },
      async update(patch) {
        data = { ...data, ...patch }
        await commit()
      },
      async unset(k) {
        const next = { ...data }
        delete next[k]
        data = next
        await commit()
      },
      async destroy() {
        data = {}
        await commit()
      },
    }
    ctx.locals[SESSION_LOCAL] = session
    byRequest.set(ctx.req, session)
  }
}

function missing(): never {
  throw new Error(
    '[Pyreon] getSession: no session for this request — add `sessionMiddleware({ secret })` to `createServer({ middleware })` '
    + '(before any middleware that reads the session).',
  )
}

/**
 * The session for a middleware context, a `Request`, or a loader context
 * (`{ request }`). Throws when `sessionMiddleware` did not run.
 *
 * @example
 * ```ts
 * export const loader = async ({ request }: LoaderContext) => {
 *   const session = getSession<{ userId?: string }>({ request })
 *   return { userId: session.get('userId') ?? null }
 * }
 * ```
 */
export function getSession<T extends Record<string, unknown> = Record<string, unknown>>(
  source: MiddlewareContext | Request | { request?: Request | undefined },
): Session<T> {
  if (source instanceof Request) return (byRequest.get(source) as Session<T> | undefined) ?? missing()
  if ('locals' in source) return (source.locals[SESSION_LOCAL] as Session<T> | undefined) ?? missing()
  const req = source.request
  return (req ? (byRequest.get(req) as Session<T> | undefined) : undefined) ?? missing()
}

/**
 * The current request's session inside a component during SSR. Returns
 * `null` on the client (the cookie is `HttpOnly`) and when no session
 * middleware ran — pass what the UI needs through a loader instead of
 * rendering session values directly, or hydration will disagree.
 *
 * @example
 * ```tsx
 * const session = useSession<{ name?: string }>()
 * ```
 */
export function useSession<T extends Record<string, unknown> = Record<string, unknown>>(): Session<T> | null {
  return (useRequestLocals()[SESSION_LOCAL] as Session<T> | undefined) ?? null
}

export interface RequireUserOptions<T extends Record<string, unknown>> {
  /** Return truthy when the session is authenticated. Default: `session.has('userId')`. */
  check?: (session: Session<T>) => boolean
  /**
   * Redirect target for unauthenticated requests. The original path is
   * appended as `?next=<path>`. Omit to answer `401` instead.
   */
  redirectTo?: string
  /** Query parameter carrying the original path. Default `'next'`. */
  nextParam?: string
}

/**
 * Route / app middleware that blocks unauthenticated requests. Needs
 * `sessionMiddleware` earlier in the chain.
 *
 * @example
 * ```ts
 * // src/routes/dashboard/_layout.tsx
 * export const middleware = requireUser({ redirectTo: '/login' })
 * ```
 */
export function requireUser<T extends Record<string, unknown> = Record<string, unknown>>(
  options: RequireUserOptions<T> = {},
): Middleware {
  const check = options.check ?? ((s: Session<T>) => s.has('userId' as keyof T & string))
  const param = options.nextParam ?? 'next'
  return (ctx) => {
    const session = ctx.locals[SESSION_LOCAL] as Session<T> | undefined
    if (!session) {
      throw new Error('[Pyreon] requireUser: `sessionMiddleware` must run before `requireUser` in the middleware chain.')
    }
    if (check(session)) return
    const headers = new Headers({ 'cache-control': 'private, no-store', vary: 'Cookie' })
    if (options.redirectTo === undefined) {
      headers.set('content-type', 'text/plain; charset=utf-8')
      return new Response('Unauthorized', { status: 401, headers })
    }
    const target = new URL(options.redirectTo, ctx.url)
    target.searchParams.set(param, ctx.url.pathname + ctx.url.search)
    headers.set('location', target.origin === ctx.url.origin ? target.pathname + target.search : target.href)
    return new Response(null, { status: 302, headers })
  }
}
