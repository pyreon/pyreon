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
 */
export function createISRHandler(
  handler: (req: Request) => Promise<Response>,
  config: ISRConfig,
): (req: Request) => Promise<Response> {
  const cache = new Map<string, CacheEntry>()
  const revalidating = new Set<string>()
  const revalidateMs = config.revalidate * 1000

  async function revalidate(url: URL) {
    const key = url.pathname
    if (revalidating.has(key)) return
    revalidating.add(key)

    try {
      const req = new Request(url.href, { method: 'GET' })
      const res = await handler(req)
      const html = await res.text()
      const headers: Record<string, string> = {}
      res.headers.forEach((v, k) => {
        headers[k] = v
      })

      cache.set(key, { html, headers, timestamp: Date.now() })
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
    const key = url.pathname
    const entry = cache.get(key)

    if (entry) {
      const age = Date.now() - entry.timestamp

      if (age > revalidateMs) {
        // Stale — serve cached but revalidate in background
        revalidate(url)
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

    cache.set(key, { html, headers, timestamp: Date.now() })

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
