import type { Middleware, MiddlewareContext } from "@pyreon/server"

// ─── Cache control middleware ───────────────────────────────────────────────
//
// Smart caching middleware that sets appropriate cache headers based on
// asset type, URL patterns, and build hashes.
//
// Strategies:
// - Immutable: hashed assets (JS/CSS bundles) — cached forever
// - Static: images, fonts, media — long cache with revalidation
// - Dynamic: HTML pages — short or no cache, stale-while-revalidate
// - API: JSON responses — no cache by default

export interface CacheConfig {
  /** Cache duration for immutable hashed assets (seconds). Default: 31536000 (1 year) */
  immutable?: number
  /** Cache duration for static assets like images/fonts (seconds). Default: 86400 (1 day) */
  static?: number
  /** Cache duration for pages (seconds). Default: 0 (no cache) */
  pages?: number
  /** Stale-while-revalidate window for pages (seconds). Default: 60 */
  staleWhileRevalidate?: number
  /** Custom rules by URL pattern. */
  rules?: CacheRule[]
}

export interface CacheRule {
  /** URL pattern to match (glob-style). e.g. "/api/*" */
  match: string
  /** Cache-Control header value. */
  control: string
}

const HASHED_ASSET = /\.[a-f0-9]{8,}\.\w+$/
const STATIC_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|ogg|mp3|wav)$/i
const SCRIPT_EXT = /\.(js|css|mjs)$/i

/** @internal Exported for testing */
export function matchGlob(pattern: string, path: string): boolean {
  // Escape regex special chars, then convert glob wildcards
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  const regex = escaped.replace(/\*/g, ".*").replace(/\?/g, ".")
  return new RegExp(`^${regex}$`).test(path)
}

function resolveControl(
  path: string,
  immutableDuration: number,
  staticDuration: number,
  pageDuration: number,
  swr: number,
): string {
  if (HASHED_ASSET.test(path)) {
    return `public, max-age=${immutableDuration}, immutable`
  }
  if (SCRIPT_EXT.test(path)) {
    return `public, max-age=3600, stale-while-revalidate=${swr}`
  }
  if (STATIC_EXT.test(path)) {
    return `public, max-age=${staticDuration}, stale-while-revalidate=${swr}`
  }
  if (pageDuration > 0) {
    return `public, max-age=${pageDuration}, stale-while-revalidate=${swr}`
  }
  return "no-cache"
}

/**
 * Cache control middleware for Zero.
 * Sets Cache-Control headers on the response based on asset type.
 *
 * @example
 * import { cacheMiddleware } from "@pyreon/zero/cache"
 *
 * export default createHandler({
 *   routes,
 *   middleware: [
 *     cacheMiddleware({
 *       pages: 60,
 *       staleWhileRevalidate: 300,
 *       rules: [
 *         { match: "/api/*", control: "no-store" },
 *       ],
 *     }),
 *   ],
 * })
 */
export function cacheMiddleware(config: CacheConfig = {}): Middleware {
  const immutableDuration = config.immutable ?? 31536000
  const staticDuration = config.static ?? 86400
  const pageDuration = config.pages ?? 0
  const swr = config.staleWhileRevalidate ?? 60
  const rules = config.rules ?? []

  return (ctx: MiddlewareContext) => {
    const path = ctx.url.pathname

    for (const rule of rules) {
      if (matchGlob(rule.match, path)) {
        ctx.headers.set("Cache-Control", rule.control)
        return
      }
    }

    const control = resolveControl(path, immutableDuration, staticDuration, pageDuration, swr)
    ctx.headers.set("Cache-Control", control)
  }
}

/**
 * Security headers middleware.
 * Adds common security headers to all responses.
 */
export function securityHeaders(): Middleware {
  return (ctx: MiddlewareContext) => {
    ctx.headers.set("X-Content-Type-Options", "nosniff")
    ctx.headers.set("X-Frame-Options", "DENY")
    ctx.headers.set("X-XSS-Protection", "1; mode=block")
    ctx.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
    ctx.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  }
}

/**
 * Compression detection middleware.
 * Sets Vary: Accept-Encoding header so caches can serve compressed variants.
 * Actual compression is handled by the runtime (Bun/Node) or reverse proxy.
 */
export function varyEncoding(): Middleware {
  return (ctx: MiddlewareContext) => {
    const existing = ctx.headers.get("Vary")
    if (!existing?.includes("Accept-Encoding")) {
      ctx.headers.set("Vary", existing ? `${existing}, Accept-Encoding` : "Accept-Encoding")
    }
  }
}
