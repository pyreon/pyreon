import type { Middleware, MiddlewareContext } from '@pyreon/server'

// ─── Rate limiting middleware ───────────────────────────────────────────────

export interface RateLimitConfig {
  /** Maximum requests per window. Default: `100` */
  max?: number
  /** Time window in seconds. Default: `60` */
  window?: number
  /**
   * Function to extract the client identifier.
   *
   * Default: see `trustProxy` — with no proxy declared, forwarded headers
   * are NOT read and every request shares one bucket.
   */
  keyFn?: (ctx: MiddlewareContext) => string
  /**
   * How many reverse proxies sit in FRONT of this server.
   *
   * `X-Forwarded-For` is a list the request itself carries, and its FIRST
   * entry is whatever the original client claimed. Keying on that entry
   * makes the limiter worthless — a rotating header mints a fresh bucket
   * per request — and worse, lets an attacker prepend a VICTIM's address
   * and exhaust the victim's bucket. So the header is only consulted when
   * the deployment declares that a proxy is actually there.
   *
   * - `false` (default) — do NOT read `X-Forwarded-For` / `X-Real-IP`.
   *   Uses `ctx.locals.remoteAddress` when a host adapter has populated it,
   *   otherwise ONE shared bucket for every caller (and a once-per-process
   *   warning saying so). Correct for a directly-exposed server.
   * - `true` / `1` — exactly one trusted proxy: take the LAST entry of
   *   `X-Forwarded-For`, which that proxy wrote and the client cannot forge.
   * - `n` — n trusted proxies: take the n-th entry from the RIGHT. If the
   *   chain is shorter than `n` the configuration does not match reality,
   *   so the header is discarded rather than fallen back to a client-written
   *   entry.
   *
   * Setting this on a server that is NOT behind that many proxies re-opens
   * the spoof, so it is opt-in per deployment, never inferred.
   *
   * Default: `false`
   */
  trustProxy?: boolean | number
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
 *
 * // Behind a single reverse proxy (nginx, a cloud load balancer):
 * rateLimitMiddleware({ trustProxy: true })
 *
 * // Or key on something you control end-to-end:
 * rateLimitMiddleware({ keyFn: (ctx) => userIdFrom(ctx) ?? "anon" })
 */
export function rateLimitMiddleware(config: RateLimitConfig = {}): Middleware {
  const {
    max = 100,
    window: windowSec = 60,
    onLimit,
    include,
    exclude,
    trustProxy = false,
  } = config
  const keyFn = config.keyFn ?? makeDefaultKeyFn(trustProxy)

  const windowMs = windowSec * 1000
  const store = new Map<string, RateLimitEntry>()
  const MAX_STORE_SIZE = 10000
  let lastCleanup = Date.now()

  // Inline cleanup — runs during request processing, no setInterval needed.
  // Evicts expired entries when store exceeds half capacity or on window boundary.
  function cleanupIfNeeded(now: number) {
    if (store.size < MAX_STORE_SIZE / 2 && now - lastCleanup < windowMs) return
    lastCleanup = now
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key)
    }
    // HARD cap. The expired-sweep above only removes entries whose
    // window has elapsed. An attacker flooding unique keys WITHIN one
    // window (a spoofed `X-Forwarded-For` under `trustProxy`, or a custom
    // header-derived `keyFn`) produces only fresh entries, so the sweep
    // frees nothing and `store.set` grows the Map without bound — an
    // unauthenticated memory-exhaustion DoS. `MAX_STORE_SIZE` was a
    // declared constant used ONLY as a sweep trigger, never enforced.
    // Map preserves insertion order, so evicting from the front drops
    // the oldest trackers first (acceptable: an evicted attacker key
    // simply gets a fresh window — no bypass of legitimate limits since
    // a real client re-inserts and is immediately re-tracked).
    while (store.size > MAX_STORE_SIZE) {
      const oldest = store.keys().next().value
      if (oldest === undefined) break
      store.delete(oldest)
    }
  }

  return (ctx: MiddlewareContext) => {
    // Check include/exclude patterns
    // Pathname only: `ctx.path` carries the query string, so an exact rule
    // like `include: ['/login']` was dodged by requesting `/login?a=1`.
    const pathname = ctx.url.pathname
    if (include && !include.some((p) => matchSimpleGlob(p, pathname))) return
    if (exclude?.some((p) => matchSimpleGlob(p, pathname))) return

    const key = keyFn(ctx)
    const now = Date.now()

    cleanupIfNeeded(now)

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

/** Bucket every caller shares when no trustworthy identifier is reachable. */
const SHARED_BUCKET_KEY = 'shared'

// Once per process, not once per middleware instance — an app mounting the
// limiter on three route groups should say this once, not three times.
let warnedSharedBucket = false

/** Reset the once-per-process warning latch. Test-only. */
export function _resetRateLimitWarning(): void {
  warnedSharedBucket = false
}

/**
 * Build the default key extractor for a given `trustProxy` setting.
 *
 * The rule: only read a forwarded header when the deployment has declared
 * how many proxies wrote it. The client controls every entry it can reach,
 * so an undeclared chain has no trustworthy element at all.
 */
function makeDefaultKeyFn(trustProxy: boolean | number): (ctx: MiddlewareContext) => string {
  const hops = trustProxy === true ? 1 : trustProxy === false ? 0 : Math.floor(trustProxy)

  return (ctx: MiddlewareContext): string => {
    if (hops > 0) {
      const forwarded = ctx.req.headers.get('x-forwarded-for')
      if (forwarded) {
        const chain = forwarded
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
        // n-th from the RIGHT: the entry the n-th trusted proxy wrote.
        // A chain shorter than the declared hop count means the config does
        // not describe reality — fall through rather than reach leftward
        // into entries the client wrote.
        const entry = chain[chain.length - hops]
        if (entry !== undefined) return entry
      }
      // `X-Real-IP` carries a single value written by the nearest proxy.
      const realIp = ctx.req.headers.get('x-real-ip')?.trim()
      if (realIp) return realIp
    }

    // A host adapter may publish the transport peer here; nothing in the
    // request can forge it. `MiddlewareContext` carries no socket of its
    // own, so this is the only peer that is ever reachable.
    const peer = ctx.locals['remoteAddress']
    if (typeof peer === 'string' && peer.length > 0) return peer

    if (!warnedSharedBucket) {
      warnedSharedBucket = true
      console.warn(
        '[Pyreon] rateLimitMiddleware: no trustworthy client identifier — every ' +
          'request shares ONE bucket. Pass `trustProxy` (the number of reverse ' +
          'proxies in front of this server) if a proxy sets X-Forwarded-For, or ' +
          'pass `keyFn` to key on something you control (a session/user id).',
      )
    }
    return SHARED_BUCKET_KEY
  }
}

/** Simple glob matching for path patterns. Supports trailing `*`. */
function matchSimpleGlob(pattern: string, path: string): boolean {
  if (pattern.endsWith('/*')) {
    return path.startsWith(pattern.slice(0, -1))
  }
  return pattern === path
}
