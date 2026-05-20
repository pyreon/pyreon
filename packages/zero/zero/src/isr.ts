import type { ISRConfig } from './types'

// ─── ISR Cache ───────────────────────────────────────────────────────────────

/** Serialized SSR response cached by the ISR layer (one per cache key). */
export interface ISRCacheEntry {
  html: string
  headers: Record<string, string>
  timestamp: number
}

/**
 * Pluggable backing store for the ISR cache. The default in-memory
 * implementation (`createMemoryStore`) is per-process — fine for
 * single-instance deploys, but multi-instance / horizontally-scaled
 * apps need a SHARED store (Redis, Vercel KV, Cloudflare KV, Upstash,
 * etc.) so revalidation in one instance is visible to all instances.
 *
 * The interface accepts BOTH sync and async returns: the in-memory
 * default stays cheap (sync `Map` ops, no `Promise` allocation per
 * request), while external stores return promises naturally. The
 * handler awaits the result either way (`await` on a non-promise just
 * returns the value).
 *
 * `get` is responsible for any LRU bookkeeping — external stores
 * typically rely on their own TTL/eviction policy and can `return
 * this.map.get(key)` directly; the in-memory store does a
 * delete + re-insert to keep the Map's insertion-order LRU correct.
 *
 * `delete` is optional. It's only used when a future on-demand
 * revalidation pathway needs to evict a specific key (the current
 * stale-while-revalidate flow does not call it). External stores that
 * don't support per-key invalidation can omit it.
 */
export interface ISRStore<E = ISRCacheEntry> {
  get(key: string): Promise<E | undefined> | E | undefined
  set(key: string, entry: E): Promise<void> | void
  delete?(key: string): Promise<void> | void
}

/**
 * The default in-memory ISR store: a `Map` with insertion-order LRU
 * eviction, capped at `maxEntries` (default `1000`). Drop in as
 * `config.store` if you want to tweak the cap or wrap the store with
 * instrumentation; pass a different `ISRStore` impl for Redis / KV /
 * etc. backings.
 *
 * `get` does the LRU bump (re-inserts the touched entry at the
 * newest position) so hot paths survive eviction even when the cap is
 * small. Without that, `Map.get(...)` wouldn't update ordering and
 * frequently-read entries could be evicted by occasional writes.
 */
export function createMemoryStore<E = ISRCacheEntry>(opts: {
  maxEntries?: number
} = {}): ISRStore<E> {
  const cache = new Map<string, E>()
  const maxEntries = Math.max(1, opts.maxEntries ?? 1000)
  return {
    get(key) {
      const entry = cache.get(key)
      if (entry !== undefined) {
        cache.delete(key)
        cache.set(key, entry)
      }
      return entry
    },
    set(key, entry) {
      if (cache.has(key)) cache.delete(key)
      cache.set(key, entry)
      while (cache.size > maxEntries) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        cache.delete(oldest)
      }
    },
    delete(key) {
      cache.delete(key)
    },
  }
}

// Internal alias for the default-shape entry — keeps function bodies tidy
// while staying source-compatible with the public `ISRCacheEntry` export.
type CacheEntry = ISRCacheEntry

/**
 * ISR handler with stale-while-revalidate semantics.
 *
 * Wraps an SSR handler and caches responses per URL path. Serves stale
 * content immediately while revalidating in the background. The cache
 * backing is **pluggable** via `config.store` (default:
 * `createMemoryStore({ maxEntries: 1000 })`) — pass a custom `ISRStore`
 * implementation backed by Redis / Vercel KV / Cloudflare KV / Upstash
 * etc. to share state across horizontally-scaled instances. Without an
 * external store, each instance has its own per-process cache (which
 * is fine for single-instance deploys; behaviour-identical to the
 * pre-pluggable-store implementation).
 *
 * Default in-memory store: bounded by `config.maxEntries` (default
 * `1000`) with insertion-order LRU eviction. Without the cap, unbounded
 * URL spaces like `/user/:id` would grow cache memory without limit
 * over the server's lifetime — a real leak in long-running deployments.
 * `config.maxEntries` is ignored when a custom `config.store` is supplied
 * (the custom store owns its own eviction policy).
 */
export function createISRHandler(
  handler: (req: Request) => Promise<Response>,
  config: ISRConfig,
): (req: Request) => Promise<Response> {
  // Pluggable backing store. Default keeps the prior in-memory LRU
  // behaviour byte-identical (same `maxEntries` default, same Map +
  // delete+re-insert LRU bump) so existing callers see no behavioural
  // change.
  const store: ISRStore<CacheEntry>
    = config.store
      ?? createMemoryStore<CacheEntry>(
        config.maxEntries !== undefined ? { maxEntries: config.maxEntries } : {},
      )
  const revalidating = new Set<string>()
  const revalidateMs = config.revalidate * 1000
  // Bounded background-revalidation timeout. Without it, a handler that
  // hangs forever leaves its key permanently in `revalidating` (the
  // `finally` that clears it never runs), so EVERY later request for
  // that key short-circuits the `revalidating.has(key)` guard and the
  // entry stays stale for the rest of the process lifetime — it can
  // never recover. 30s default matches the Suspense streaming timeout;
  // overridable via ISRConfig.revalidateTimeoutMs.
  const REVALIDATE_TIMEOUT_MS = Math.max(1, config.revalidateTimeoutMs ?? 30_000)

  // Only 2xx, cookie-free responses may be cached. Caching a transient
  // 5xx/3xx/404 and replaying it as a 200 for the whole revalidate
  // window is a self-inflicted outage / cache-poisoning bug. Caching a
  // `Set-Cookie` response and replaying it to every visitor leaks one
  // user's session/CSRF cookie cross-user — not covered by the
  // documented "ISR-without-cacheKey is for non-personalized pages"
  // caveat (that caveat is about key variance, not header stripping).
  function isCacheable(res: Response): boolean {
    return res.status >= 200 && res.status < 300 && !res.headers.has('set-cookie')
  }
  // M1.1 — cache-key derivation. Default keys by pathname only (the
  // pre-M1 behaviour). User-supplied `cacheKey` opts in to varying
  // by cookies / query / headers — required for auth-gated pages.
  // See `ISRConfig.cacheKey` JSDoc for the auth-incompatibility caveat.
  const deriveKey: (req: Request, url: URL) => string
    = typeof config.cacheKey === 'function'
      ? (req, _url) => (config.cacheKey as (r: Request) => string)(req)
      : (_req, url) => url.pathname

  async function revalidate(url: URL, originalReq: Request) {
    // Re-derive key from the ORIGINAL request so cookies / headers /
    // query that varied the cache entry are preserved across revalidation.
    // Without this, a user-supplied `cacheKey` that reads cookies would
    // re-render against a no-cookie request and stomp the cached entry
    // with the wrong-user content.
    const key = deriveKey(originalReq, url)
    if (revalidating.has(key)) return
    revalidating.add(key)

    // Hold the timer id outside try/Promise.race so the finally block
    // can `clearTimeout` it on the SUCCESS path. Pre-fix the rejection
    // setTimeout was left pending until REVALIDATE_TIMEOUT_MS (default
    // 30s) every time `handler(req)` won the race — i.e. every
    // successful revalidation. Under sustained traffic this accumulates
    // hundreds of pending timer closures + rejection callbacks before
    // they self-clear.
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      // Default: forward the original request shape (headers + method)
      // so the re-render sees the same auth context as the user's read.
      // Opt-in `revalidateRequest` hook lets auth-gated callers scope
      // the revalidation explicitly — e.g. return `null` to skip
      // revalidation for authenticated entries (stale stays stale until
      // the next live request), or return an anonymous Request for
      // non-personalized entries.
      let req: Request
      if (typeof config.revalidateRequest === 'function') {
        const custom = config.revalidateRequest(originalReq)
        if (custom === null) {
          revalidating.delete(key)
          return
        }
        req = custom
      } else {
        req = new Request(url.href, {
          method: 'GET',
          headers: originalReq.headers,
        })
      }
      // Bound the revalidation so a hung handler can't pin `key` in
      // `revalidating` forever (which would freeze the entry stale).
      const res = await Promise.race([
        handler(req),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('[Pyreon ISR] revalidation timeout')),
            REVALIDATE_TIMEOUT_MS,
          )
        }),
      ])
      // Never overwrite a good stale entry with a bad re-render
      // (5xx/3xx) or poison it with a Set-Cookie response.
      if (isCacheable(res)) {
        const html = await res.text()
        const headers: Record<string, string> = {}
        res.headers.forEach((v, k) => {
          headers[k] = v
        })
        await store.set(key, { html, headers, timestamp: Date.now() })
      }
    } catch {
      // Revalidation failed / timed out — stale cache entry remains valid
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
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
    // The store's `get` is responsible for any LRU bookkeeping — the
    // default in-memory store does delete + re-insert so hot paths
    // survive eviction. External stores (Redis/KV) rely on their own
    // TTL/eviction policy and typically just read directly.
    const entry = await store.get(key)

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

    // Cache miss — render. Only cache (and only normalize to a 200
    // text/html response) when the render is actually cacheable; a
    // transient error / redirect / Set-Cookie response is passed
    // through verbatim with its ORIGINAL status + headers and is NOT
    // stored, so it can't be replayed as a 200 to later visitors.
    const res = await handler(req)
    const html = await res.text()
    const headers: Record<string, string> = {}
    res.headers.forEach((v, k) => {
      headers[k] = v
    })

    if (!isCacheable(res)) {
      return new Response(html, {
        status: res.status,
        statusText: res.statusText,
        headers: { ...headers, 'x-isr-cache': 'BYPASS' },
      })
    }

    await store.set(key, { html, headers, timestamp: Date.now() })

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
