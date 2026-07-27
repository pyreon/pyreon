/**
 * Middleware composition.
 *
 * Deliberately WITHOUT Koa's "next() called multiple times" guard: retry is
 * a middleware that legitimately re-enters the downstream chain in a loop,
 * and that guard is precisely what would forbid it. Allowing repeated
 * `next()` is the property that lets retry / refresh / circuit-breaking be
 * ordinary middleware instead of special-cased client features.
 */

import type { HttpMiddleware, HttpRequest, HttpResponse, Transport } from './types'

/**
 * Fold `middleware` (outermost first) over `transport` into a single
 * callable. Each middleware receives the request and a `next` that runs
 * everything below it; calling `next()` with no argument reuses the
 * request it was given.
 */
export function compose(
  middleware: readonly HttpMiddleware[],
  transport: Transport,
): Transport {
  if (middleware.length === 0) return transport

  return function dispatch(request: HttpRequest): Promise<HttpResponse> {
    const run = (index: number, current: HttpRequest): Promise<HttpResponse> => {
      const mw = middleware[index]
      if (!mw) return transport(current)
      return mw(current, (next) => run(index + 1, next ?? current))
    }
    return run(0, request)
  }
}
