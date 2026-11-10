/**
 * Run the request pipeline BEFORE the ISR cache is consulted.
 *
 * `createISRHandler` wraps a whole page handler, and the page handler is where
 * the middleware ran — so a cache HIT returned without running any of it. A
 * page rendered for a request that app-wide or route middleware ADMITTED was
 * then served to every later request for the same key: an IP allow-list or a
 * geo gate never ran again under the default key, and under a custom
 * `cacheKey` function (the init warning's own suggestion) neither did a
 * cookie / Authorization gate. A cache must sit after the gates, never in
 * front of them.
 *
 * The split:
 *
 * - {@link PipelineGate.wrapCache} runs the middleware chain for every request
 *   that reaches the cache. A middleware `Response` answers immediately (never
 *   cached). Otherwise the request's middleware results (`ctx.locals`,
 *   `ctx.headers`) are carried to the render through a `WeakMap<Request>`, and
 *   the cache runs.
 * - {@link PipelineGate.pageMiddleware} is the page handler's ONLY middleware.
 *   For a carried request (a MISS, a preview bypass, a non-GET) it restores
 *   that state instead of running the chain again — middleware runs exactly
 *   once per request (rate limiters count once). For any other request it runs
 *   the chain itself: the endpoint paths routed around the cache, and the
 *   cache's own background REVALIDATION, which re-renders on behalf of the
 *   original requester (`createISRHandler` forwards their headers and socket
 *   address) and so passes the same gates that requester passed.
 * - A HIT / STALE / coalesced response was rendered for someone else: this
 *   request's middleware headers are applied on top of it, so security
 *   headers, cookies and per-request headers set by middleware reach it too.
 */
import type { Middleware, MiddlewareContext } from '@pyreon/server'
import { REMOTE_ADDRESS } from '@pyreon/server'

type RequestHandler = (req: Request) => Promise<Response>

interface CarriedState {
  locals: Record<string, unknown>
  headers: Headers
  /** Set when the page handler rendered with this state (a MISS). */
  rendered: boolean
}

export interface PipelineGate {
  /** The page handler's only middleware — restore the carried state, or run the chain. */
  pageMiddleware: Middleware
  /** Put the middleware chain in front of a cache wrapping a `pageMiddleware` handler. */
  wrapCache(cached: RequestHandler): RequestHandler
}

/** Log line + body match `@pyreon/server`'s `createHandler` for a throwing middleware. */
function middlewareFailed(path: string, err: unknown): Response {
  // oxlint-disable-next-line no-console
  console.error(`[Pyreon] Middleware failed for ${path}:`, err)
  return new Response('Internal Server Error', {
    status: 500,
    headers: { 'Content-Type': 'text/plain' },
  })
}

/**
 * Apply the headers middleware set for THIS request to a response rendered
 * for another one. The stored content type wins (middleware does not choose a
 * page's type; the context starts with the HTML default).
 */
function applyMiddlewareHeaders(res: Response, headers: Headers): Response {
  const out = new Headers(res.headers)
  let changed = false
  for (const [key, value] of headers) {
    if (key === 'content-type' || key === 'set-cookie') continue
    out.set(key, value)
    changed = true
  }
  const cookies = headers.getSetCookie()
  if (cookies.length > 0) {
    out.delete('set-cookie')
    for (const c of cookies) out.append('set-cookie', c)
    changed = true
  }
  if (!changed) return res
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out })
}

export function createPipelineGate(middleware: readonly Middleware[]): PipelineGate {
  const carried = new WeakMap<Request, CarriedState>()

  const pageMiddleware: Middleware = async (ctx) => {
    const state = carried.get(ctx.req)
    if (state) {
      state.rendered = true
      // The SAME objects the chain populated: the render reads exactly what
      // one middleware pass produced.
      ctx.locals = state.locals
      ctx.headers = state.headers
      return
    }
    for (const mw of middleware) {
      const result = await mw(ctx)
      if (result instanceof Response) return result
    }
  }

  const wrapCache = (cached: RequestHandler): RequestHandler => async (req) => {
    const url = new URL(req.url)
    const ctx: MiddlewareContext = {
      req,
      url,
      path: url.pathname + url.search,
      headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
      locals: {},
    }
    const remote = (req as unknown as Record<symbol, unknown>)[REMOTE_ADDRESS]
    if (typeof remote === 'string' && remote) ctx.locals.remoteAddress = remote
    try {
      for (const mw of middleware) {
        const result = await mw(ctx)
        if (result instanceof Response) return result
      }
    } catch (err) {
      return middlewareFailed(ctx.path, err)
    }
    const state: CarriedState = { locals: ctx.locals, headers: ctx.headers, rendered: false }
    carried.set(req, state)
    const res = await cached(req)
    return state.rendered ? res : applyMiddlewareHeaders(res, ctx.headers)
  }

  return { pageMiddleware, wrapCache }
}
