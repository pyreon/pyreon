/**
 * Preview / draft mode — `@pyreon/zero/preview`.
 *
 * A visitor who opens the secret-protected enable endpoint receives a signed
 * `HttpOnly` preview cookie. While it is valid:
 *  - `createISRHandler` skips its cache for that visitor (no HIT, no store),
 *  - `previewMiddleware` marks every response `Cache-Control: private,
 *    no-store`, so a draft render can never be cached or served to others,
 *  - `isPreview(request)` is `true`, and `@pyreon/zero-content`'s
 *    `getCollection(name, { request })` includes `draft: true` entries.
 *
 * Preview only affects SERVER-rendered responses (SSR / ISR routes, and every
 * route under `zero dev`). An SSG page is a static file on the host — no
 * server code runs to bypass it.
 *
 * This module is client-safe (Web Crypto only, no `node:*`, no runtime import
 * of `@pyreon/server`), so `isPreview` can be imported from shared code.
 */
import type { Middleware, MiddlewareContext } from '@pyreon/server'
import {
  createSigner,
  markPrivate,
  normalizeSecrets,
  readCookie,
  replaceSetCookie,
  serializeCookie,
} from './utils/signed-cookie'

/** The preview cookie name. `createISRHandler` bypasses its cache when present. */
export const PREVIEW_COOKIE = '__pyreon_preview'

const PREVIEW_LOCAL = '__pyreonPreview'
const previewRequests = new WeakSet<Request>()

export interface PreviewOptions {
  /** Cookie signing secret(s), each ≥ 32 characters. `secret[0]` signs. */
  secret: string | readonly string[]
  /** Preview lifetime in seconds. Default 1 hour. */
  maxAge?: number
}

export interface PreviewHandlerOptions extends PreviewOptions {
  /**
   * The shared token a CMS sends to enable preview (`?token=`). Distinct from
   * the signing secret so it can be rotated independently. ≥ 32 characters.
   */
  token: string
  /** Endpoint path. `<path>` enables, `<path>/exit` disables. Default `'/api/preview'`. */
  path?: string
}

function isLocalHttp(url: URL): boolean {
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
}

function cookieAttrs(url: URL) {
  return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: !isLocalHttp(url) }
}

async function tokensEqual(a: string, b: string): Promise<boolean> {
  // Compare SHA-256 digests so the comparison time does not depend on where
  // the strings first differ, nor leak the token length.
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([
    globalThis.crypto.subtle.digest('SHA-256', enc.encode(a)),
    globalThis.crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const xa = new Uint8Array(x)
  const ya = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < xa.length; i++) diff |= xa[i]! ^ ya[i]!
  return diff === 0
}

/** Only same-origin relative paths — never an open redirect. */
function safeRedirect(target: string | null): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return '/'
  return target
}

/**
 * Verifies the preview cookie on every request. Put it early in
 * `createServer({ middleware })`.
 *
 * @example
 * ```ts
 * import { createPreviewHandler, previewMiddleware } from '@pyreon/zero/preview'
 *
 * const secret = process.env.PREVIEW_SECRET!
 * export default createServer({
 *   routes,
 *   middleware: [
 *     createPreviewHandler({ secret, token: process.env.PREVIEW_TOKEN! }),
 *     previewMiddleware({ secret }),
 *   ],
 * })
 * ```
 */
export function previewMiddleware(options: PreviewOptions): Middleware {
  const signer = createSigner(normalizeSecrets(options.secret, 'previewMiddleware'))
  return async (ctx: MiddlewareContext) => {
    const cookie = readCookie(ctx.req, PREVIEW_COOKIE)
    if (!cookie) return
    const payload = await signer.verify(cookie)
    if (payload !== true) return
    previewRequests.add(ctx.req)
    ctx.locals[PREVIEW_LOCAL] = true
    markPrivate(ctx.headers)
  }
}

/**
 * Enable/disable endpoint. `GET <path>?token=…&redirect=/draft-page` sets the
 * cookie and 307-redirects; `GET <path>/exit?redirect=/` clears it. A wrong
 * token answers `401`. `redirect` must be a same-origin path.
 *
 * @example
 * ```ts
 * // CMS preview URL: https://site.example/api/preview?token=…&redirect=/blog/draft
 * createPreviewHandler({ secret: process.env.PREVIEW_SECRET!, token: process.env.PREVIEW_TOKEN! })
 * ```
 */
export function createPreviewHandler(options: PreviewHandlerOptions): Middleware {
  const signer = createSigner(normalizeSecrets(options.secret, 'createPreviewHandler'))
  normalizeSecrets(options.token, 'createPreviewHandler (token)')
  const path = (options.path ?? '/api/preview').replace(/\/$/, '')
  const maxAge = options.maxAge ?? 60 * 60
  return async (ctx) => {
    const { pathname } = ctx.url
    if (pathname !== path && pathname !== `${path}/exit`) return
    const headers = new Headers({ 'cache-control': 'private, no-store' })
    const location = safeRedirect(ctx.url.searchParams.get('redirect'))
    if (pathname === `${path}/exit`) {
      headers.append('set-cookie', serializeCookie(PREVIEW_COOKIE, '', { ...cookieAttrs(ctx.url), maxAge: 0 }))
      headers.set('location', location)
      return new Response(null, { status: 307, headers })
    }
    const token = ctx.url.searchParams.get('token') ?? ''
    if (!(await tokensEqual(token, options.token))) {
      headers.set('content-type', 'text/plain; charset=utf-8')
      return new Response('Invalid preview token', { status: 401, headers })
    }
    replaceSetCookie(
      headers,
      PREVIEW_COOKIE,
      serializeCookie(PREVIEW_COOKIE, await signer.sign(true, maxAge), { ...cookieAttrs(ctx.url), maxAge }),
    )
    headers.set('location', location)
    return new Response(null, { status: 307, headers })
  }
}

/**
 * Whether this request is in (verified) preview mode. Accepts a `Request`, a
 * middleware context, or a loader context (`{ request }`). Always `false` on
 * the client and when `previewMiddleware` did not run.
 *
 * @example
 * ```ts
 * export const loader = ({ request }: LoaderContext) =>
 *   getCollection('blog', { includeDrafts: isPreview({ request }) })
 * ```
 */
export function isPreview(
  source: Request | MiddlewareContext | { request?: Request | undefined } | undefined,
): boolean {
  if (!source) return false
  if (source instanceof Request) return previewRequests.has(source)
  if ('locals' in source) return source.locals[PREVIEW_LOCAL] === true
  return source.request ? previewRequests.has(source.request) : false
}
