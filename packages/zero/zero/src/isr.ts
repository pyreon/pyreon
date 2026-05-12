import type { ISRConfig } from './types'

// ─── ISR Cache ───────────────────────────────────────────────────────────────

interface CacheEntry {
  html: string
  headers: Record<string, string>
  timestamp: number
}

/**
 * In-memory ISR cache with stale-while-revalidate semantics.
 *
 * Wraps an SSR handler and caches responses per URL path.
 * Serves stale content immediately while revalidating in the background.
 *
 * Bounded by `config.maxEntries` (default: 1000) with LRU eviction. The
 * `Map` preserves insertion order, so re-inserting an entry on every
 * serve (touching it) keeps the LRU order correct. Without the cap,
 * unbounded URL spaces like `/user/:id` would grow cache memory without
 * limit over the server's lifetime — a real leak in long-running
 * deployments.
 */
export function createISRHandler(
  handler: (req: Request) => Promise<Response>,
  config: ISRConfig,
): (req: Request) => Promise<Response> {
  const cache = new Map<string, CacheEntry>()
  const revalidating = new Set<string>()
  const revalidateMs = config.revalidate * 1000
  const maxEntries = Math.max(1, config.maxEntries ?? 1000)
  // M1.1 — cache-key derivation. Default keys by pathname only (the
  // pre-M1 behaviour). User-supplied `cacheKey` opts in to varying
  // by cookies / query / headers — required for auth-gated pages.
  // See `ISRConfig.cacheKey` JSDoc for the auth-incompatibility caveat.
  const deriveKey: (req: Request, url: URL) => string
    = typeof config.cacheKey === 'function'
      ? (req, _url) => (config.cacheKey as (r: Request) => string)(req)
      : (_req, url) => url.pathname

  function set(key: string, entry: CacheEntry): void {
    // LRU: re-inserting moves the key to the newest position. Then if we're
    // over the cap, drop the oldest (first in iteration order).
    if (cache.has(key)) cache.delete(key)
    cache.set(key, entry)
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
  }

  function touch(key: string): CacheEntry | undefined {
    const entry = cache.get(key)
    if (entry !== undefined) {
      cache.delete(key)
      cache.set(key, entry)
    }
    return entry
  }

  async function revalidate(url: URL, originalReq: Request) {
    // Re-derive key from the ORIGINAL request so cookies / headers /
    // query that varied the cache entry are preserved across revalidation.
    // Without this, a user-supplied `cacheKey` that reads cookies would
    // re-render against a no-cookie request and stomp the cached entry
    // with the wrong-user content.
    const key = deriveKey(originalReq, url)
    if (revalidating.has(key)) return
    revalidating.add(key)

    try {
      // Forward the original request shape (headers + method) so the
      // re-render sees the same auth context as the user's read.
      const req = new Request(url.href, {
        method: 'GET',
        headers: originalReq.headers,
      })
      const res = await handler(req)
      const html = await res.text()
      const headers: Record<string, string> = {}
      res.headers.forEach((v, k) => {
        headers[k] = v
      })

      set(key, { html, headers, timestamp: Date.now() })
    } catch {
      // Revalidation failed — stale cache entry remains valid
    } finally {
      revalidating.delete(key)
    }
  }

  return async (req: Request): Promise<Response> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return handler(req)
    }

    const url = new URL(req.url)
    const key = deriveKey(req, url)
    // `touch` moves the entry to the newest LRU position on read so
    // hot paths survive eviction even when the cap is small. `get`
    // wouldn't update ordering.
    const entry = touch(key)

    if (entry) {
      const age = Date.now() - entry.timestamp

      if (age > revalidateMs) {
        // Stale — serve cached but revalidate in background
        revalidate(url, req)
      }

      return new Response(entry.html, {
        status: 200,
        headers: {
          ...entry.headers,
          'content-type': 'text/html; charset=utf-8',
          'x-isr-cache': age > revalidateMs ? 'STALE' : 'HIT',
          'x-isr-age': String(Math.round(age / 1000)),
        },
      })
    }

    // Cache miss — render, cache, and return
    const res = await handler(req)
    const html = await res.text()
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => {
      headers[k] = v
    })

    set(key, { html, headers, timestamp: Date.now() })

    return new Response(html, {
      status: 200,
      headers: {
        ...headers,
        'content-type': 'text/html; charset=utf-8',
        'x-isr-cache': 'MISS',
      },
    })
  }
}
