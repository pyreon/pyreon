import type { Middleware, MiddlewareContext } from '@pyreon/server'

// ─── Middleware composition ─────────────────────────────────────────────────
//
// Chains multiple middleware functions into a single middleware.
// Each middleware runs in order. If any returns a Response, the chain
// short-circuits and that Response is returned. If all return void,
// the composed middleware returns void (continues to rendering).

/**
 * Compose multiple middleware into a single middleware function.
 * Middleware runs sequentially — if any returns a Response, the chain stops.
 *
 * @example
 * import { compose } from "@pyreon/zero/middleware"
 * import { corsMiddleware } from "@pyreon/zero/cors"
 * import { rateLimitMiddleware } from "@pyreon/zero/rate-limit"
 *
 * const combined = compose(
 *   corsMiddleware({ origin: "*" }),
 *   rateLimitMiddleware({ max: 100 }),
 *   cacheMiddleware(),
 * )
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return async (ctx: MiddlewareContext) => {
    for (const mw of middlewares) {
      const result = await mw(ctx)
      if (result instanceof Response) return result
    }
  }
}

// ─── Shared request context ─────────────────────────────────────────────────
//
// Lightweight context bag attached to MiddlewareContext.locals so middleware
// can communicate without coupling. Uses a namespaced key to avoid collisions
// with user-defined locals.

const ZERO_CTX_KEY = '__zeroCtx'

/**
 * Get the shared Zero context from a middleware context.
 * Creates one if it doesn't exist. Middleware can use this to
 * pass data to downstream middleware without polluting `ctx.locals`.
 *
 * @example
 * const authMiddleware: Middleware = (ctx) => {
 *   const zctx = getContext(ctx)
 *   zctx.userId = "user_123"
 * }
 *
 * const loggingMiddleware: Middleware = (ctx) => {
 *   const zctx = getContext(ctx)
 *   console.log("User:", zctx.userId)
 * }
 */
export function getContext(ctx: MiddlewareContext): Record<string, unknown> {
  let zctx = ctx.locals[ZERO_CTX_KEY] as Record<string, unknown> | undefined
  if (!zctx) {
    zctx = {}
    ctx.locals[ZERO_CTX_KEY] = zctx
  }
  return zctx
}
