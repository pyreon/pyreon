import type { Middleware, MiddlewareContext } from '@pyreon/server'

// ─── Rate limiting middleware ───────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum requests per window. Default: `100` */
  max?: number
  /** Time window in seconds. Default: `60` */
  window?: number
  /** Function to extract the client identifier. Default: IP from headers. */
  keyFn?: (ctx: MiddlewareContext) => string
  /** Custom response when rate limited. */
  onLimit?: (ctx: MiddlewareContext) => Response
  /** URL patterns to rate limit (glob-style). Default: all paths. */
  include?: string[]
  /** URL patterns to exclude from rate limiting. */
  exclude?: string[]
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * Rate limiting middleware — limits requests per client within a time window.
 * Uses an in-memory store (suitable for single-instance deployments).
 *
 * @example
 * import { rateLimitMiddleware } from "@pyreon/zero/rate-limit"
 *
 * // 100 requests per minute (default)
 * rateLimitMiddleware()
 *
 * // Strict API rate limiting
 * rateLimitMiddleware({
 *   max: 20,
 *   window: 60,
 *   include: ["/api/*"],
 * })
 */
export function rateLimitMiddleware(config: RateLimitConfig = {}): Middleware {
  const {
    max = 100,
    window: windowSec = 60,
    keyFn = defaultKeyFn,
    onLimit,
    include,
    exclude,
  } = config

  const windowMs = windowSec * 1000
  const store = new Map<string, RateLimitEntry>()

  // Periodic cleanup of expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
  }, windowMs)

  // Allow GC to clean up the interval
  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref()
  }

  return (ctx: MiddlewareContext) => {
    // Check include/exclude patterns
    if (include && !include.some((p) => matchSimpleGlob(p, ctx.path))) return
    if (exclude?.some((p) => matchSimpleGlob(p, ctx.path))) return

    const key = keyFn(ctx)
    const now = Date.now()
    let entry = store.get(key)

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count++
    const remaining = Math.max(0, max - entry.count)
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000)

    // Set rate limit headers on all responses
    ctx.headers.set('X-RateLimit-Limit', String(max))
    ctx.headers.set('X-RateLimit-Remaining', String(remaining))
    ctx.headers.set('X-RateLimit-Reset', String(resetSeconds))

    if (entry.count > max) {
      if (onLimit) return onLimit(ctx)

      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(resetSeconds),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetSeconds),
        },
      })
    }
  }
}

function defaultKeyFn(ctx: MiddlewareContext): string {
  return (
    ctx.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    ctx.req.headers.get('x-real-ip') ??
    'unknown'
  )
}

/** Simple glob matching for path patterns. Supports trailing `*`. */
function matchSimpleGlob(pattern: string, path: string): boolean {
  if (pattern.endsWith('/*')) {
    return path.startsWith(pattern.slice(0, -1))
  }
  return pattern === path
}
