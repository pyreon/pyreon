import { SizedMap } from '@pyreon/sized-map'
import type { ISRConfig } from './types'

// Dev-mode counter sink — see packages/internals/perf-harness for contract.
// Zero cost in prod (gate folds to `false`, optional-chain short-circuits).
const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// Module-level dedup for the default-cacheKey dev warning. Keyed on the
// per-handler `deriveKey` function reference (one per `createISRHandler`
// call) so each handler instance warns AT MOST once, even under heavy
// request load. WeakSet so finalized handlers don't pin their derive-key
// closures alive — the warning state GC's with the handler.
//
// Test contract: each `createISRHandler` call produces a FRESH `deriveKey`
// closure, so per-test isolation is automatic — no reset needed. Tests
// asserting "warns once" call the same handler twice and count
// `console.warn` invocations; tests asserting "fresh handlers each warn"
// just create two handlers.
const _warnedDefaultCacheKeyHandlers = new WeakSet<(req: Request, url: URL) => string>()

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
  /**
   * Drop EVERY entry. Optional — external stores (Redis with TTL-only,
   * Vercel KV with per-key invalidation, etc.) may not support a
   * blanket purge. When omitted, `ISRHandler.revalidateAll()` throws a
   * clear error pointing at the missing method. The default
   * `createMemoryStore` implements it.
   */
  clear?(): Promise<void> | void
  /**
   * Phase 6 — tag-based invalidation. `setTags` records the tags an entry
   * was cached under; `keysByTag` returns every cached key carrying a tag
   * (consumed by `ISRHandler.revalidateTag`). Optional — stores without
   * them make `revalidateTag` throw a clear error naming the missing
   * methods. Both shipped stores (`createMemoryStore`, `createFsStore`)
   * implement them.
   */
  setTags?(key: string, tags: readonly string[]): Promise<void> | void
  keysByTag?(tag: string): Promise<string[]> | string[]
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
  // SizedMap in LRU-on-read mode mirrors the original delete + re-set
  // touch the docstring above promises (frequently-read entries survive
  // eviction). `set` handles cap-enforced eviction internally.
  const cache = new SizedMap<string, E>({
    maxEntries: opts.maxEntries ?? 1000,
    lru: true,
  })
  // Phase 6 — tag index for revalidateTag. tag → Set<key>. Pruned lazily:
  // keysByTag drops keys that no longer exist (evicted/deleted), so the
  // index can't outgrow tags-actually-used × live-keys for long.
  const tagIndex = new Map<string, Set<string>>()
  return {
    get(key) {
      return cache.get(key)
    },
    set(key, entry) {
      cache.set(key, entry)
    },
    delete(key) {
      cache.delete(key)
    },
    clear() {
      cache.clear()
      tagIndex.clear()
    },
    setTags(key, tags) {
      for (const tag of tags) {
        let keys = tagIndex.get(tag)
        if (!keys) {
          keys = new Set()
          tagIndex.set(tag, keys)
        }
        keys.add(key)
      }
    },
    keysByTag(tag) {
      const keys = tagIndex.get(tag)
      if (!keys) return []
      const live: string[] = []
      for (const key of keys) {
        if (cache.get(key) !== undefined) live.push(key)
        else keys.delete(key) // lazy prune of evicted entries
      }
      if (keys.size === 0) tagIndex.delete(tag)
      return live
    },
  }
}

/**
 * Phase 6 — filesystem-backed ISR store for self-hosted node/bun deploys.
 * The memory default means every server restart = cold cache = a
 * thundering herd on the origin; a content-dir store survives restarts.
 *
 * Layout: one JSON file per key under `dir` (key → fs-safe encoded
 * filename) + a `_tags.json` sidecar for the tag index (best-effort,
 * rewritten on change). Reads/writes are per-request-rare (cache misses
 * + invalidations), so simple atomic-ish file IO is the right tradeoff —
 * NOT a database. Errors degrade to cache-miss behavior, never a throw
 * on the request path.
 *
 * Multi-INSTANCE deploys still want a shared external store (Redis/KV) —
 * fs is per-box.
 */
export function createFsStore<E = ISRCacheEntry>(dir: string): ISRStore<E> {
  // Lazy node imports keep the module client-bundle-safe (the isr module
  // is server-only in practice, but mirrors the adapters' lazy pattern).
  const fsp = () => import('node:fs/promises')
  const keyFile = (key: string) =>
    `${dir}/${encodeURIComponent(key).replace(/\*/g, '%2A')}.json`
  const tagsFile = `${dir}/_tags.json`
  let tagsLoaded: Promise<Map<string, string[]>> | null = null
  const loadTags = (): Promise<Map<string, string[]>> =>
    (tagsLoaded ??= (async () => {
      try {
        const { readFile } = await fsp()
        const raw = JSON.parse(await readFile(tagsFile, 'utf-8')) as Record<string, string[]>
        return new Map(Object.entries(raw))
      } catch {
        return new Map()
      }
    })())
  const persistTags = async (tags: Map<string, string[]>): Promise<void> => {
    try {
      const { writeFile, mkdir } = await fsp()
      await mkdir(dir, { recursive: true })
      await writeFile(tagsFile, JSON.stringify(Object.fromEntries(tags)), 'utf-8')
    } catch {
      // Best-effort — a failed tag persist degrades revalidateTag after a
      // restart, never caching itself.
    }
  }
  return {
    async get(key) {
      try {
        const { readFile } = await fsp()
        return JSON.parse(await readFile(keyFile(key), 'utf-8')) as E
      } catch {
        return undefined
      }
    },
    async set(key, entry) {
      try {
        const { writeFile, mkdir } = await fsp()
        await mkdir(dir, { recursive: true })
        await writeFile(keyFile(key), JSON.stringify(entry), 'utf-8')
      } catch {
        // Failed write = the entry just isn't cached — miss next time.
      }
    },
    async delete(key) {
      try {
        const { rm } = await fsp()
        await rm(keyFile(key), { force: true })
      } catch {
        /* already gone */
      }
    },
    async clear() {
      try {
        const { rm, mkdir } = await fsp()
        await rm(dir, { recursive: true, force: true })
        await mkdir(dir, { recursive: true })
        tagsLoaded = null
      } catch {
        /* best-effort */
      }
    },
    async setTags(key, tags) {
      const index = await loadTags()
      for (const tag of tags) {
        const keys = index.get(tag) ?? []
        if (!keys.includes(key)) keys.push(key)
        index.set(tag, keys)
      }
      await persistTags(index)
    },
    async keysByTag(tag) {
      const index = await loadTags()
      return index.get(tag) ?? []
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
/**
 * The fetch handler `createISRHandler` returns is also a callable
 * carrying imperative invalidation methods. Webhooks, CMS notifications,
 * admin endpoints etc. call these methods to drop one or all cached
 * entries on demand — strictly more responsive than waiting for the
 * TTL-based stale-while-revalidate cycle.
 *
 * The shape is `(req) => Promise<Response>` PLUS the methods, so
 * existing consumers (`Bun.serve({ fetch: handler })`) keep working
 * byte-identically.
 */
export interface ISRHandler {
  (req: Request): Promise<Response>
  /**
   * Drop the cache entry for a single path (or `cacheKey`-derived key).
   * The next request for that key will MISS and re-render fresh. Returns
   * `{ dropped: true }` if an entry was found and deleted, `{ dropped: false }`
   * if no entry existed.
   *
   * Useful for webhook-driven invalidation: a CMS notifies that a post
   * was updated, the webhook handler calls `isrHandler.revalidateNow('/posts/123')`,
   * and the very next visitor gets the fresh content — no stale window.
   *
   * Idempotent. Safe to call against keys that don't exist (returns
   * `dropped: false` cleanly).
   */
  revalidateNow(key: string): Promise<{ dropped: boolean }>
  /**
   * Drop ALL cached entries. Useful for "purge cache" admin actions or
   * deploy-completion hooks that want a clean slate.
   *
   * The default in-memory store supports this via repeated `delete`
   * calls under the hood; custom stores that omit `delete` (Redis with
   * TTL-only, etc.) throw a clear error pointing at the missing method
   * so the caller knows their store implementation can't honor the call.
   */
  revalidateAll(): Promise<void>
  /**
   * Phase 6 — drop every cached entry carrying `tag` (recorded via
   * `config.tagsForRequest` at cache-set time). The webhook-ergonomic
   * unit: "the posts collection changed" → `revalidateTag('posts')`
   * drops every page that rendered posts, without enumerating paths.
   * Returns the number of entries dropped. Throws a clear error when the
   * configured store doesn't implement `keysByTag`/`setTags`.
   */
  revalidateTag(tag: string): Promise<{ dropped: number }>
}

export function createISRHandler(
  handler: (req: Request) => Promise<Response>,
  config: ISRConfig,
): ISRHandler {
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

  // PR-S5: per-key epoch counter for the revalidateNow / in-flight
  // revalidation race. revalidateNow() bumps the epoch BEFORE
  // delete()-ing — a revalidation that started before the bump captures
  // the old epoch and skips its store.set() when it sees the epoch has
  // changed. Without this, the in-flight revalidation could re-populate
  // the cache AFTER revalidateNow() deleted, defeating the invalidation.
  const _keyEpoch = new Map<string, number>()
  const _currentEpoch = (key: string): number => _keyEpoch.get(key) ?? 0
  const _bumpEpoch = (key: string): void => {
    _keyEpoch.set(key, _currentEpoch(key) + 1)
  }
  // Bounded background-revalidation timeout. Without it, a handler that
  // hangs forever leaves its key permanently in `revalidating` (the
  // `finally` that clears it never runs), so EVERY later request for
  // that key short-circuits the `revalidating.has(key)` guard and the
  // entry stays stale for the rest of the process lifetime — it can
  // never recover. 30s default matches the Suspense streaming timeout;
  // overridable via ISRConfig.revalidateTimeoutMs.
  const REVALIDATE_TIMEOUT_MS = Math.max(1, config.revalidateTimeoutMs ?? 30_000)

  // PR-S4: extended cacheability check — was previously
  // `2xx + no Set-Cookie` only. The old check missed RFC 7234 directives
  // that explicitly signal a response is not safe to cache, AND missed
  // headers that prove per-user content (Authorization, Vary: Cookie
  // without an explicit cacheKey). Caching ANY of these and replaying
  // them to other users via a default `cacheKey: url.pathname` leaks
  // private data across user sessions.
  //
  // Disqualifiers (any one trips → not cacheable):
  //   1. Non-2xx status (transient errors / redirects)
  //   2. Set-Cookie present (per-user session state)
  //   3. Cache-Control: private | no-store | no-cache (RFC 7234)
  //   4. Vary: Cookie | Authorization, AND no explicit cacheKey (the
  //      response varies per cookie/auth → can't share across users)
  //   5. Authorization response header (auth-gated content)
  //
  // `hasCacheKey` is set at handler-init time (config.cacheKey !== undefined).
  // When the user supplied a cacheKey, they're opting into per-user caching
  // (the auth-incompatibility caveat in ISRConfig.cacheKey JSDoc applies),
  // so Vary: Cookie is fine — they're keying by cookie themselves.
  const hasCacheKey = typeof config.cacheKey === 'function'

  function isCacheable(res: Response): boolean {
    if (res.status < 200 || res.status >= 300) return false
    if (res.headers.has('set-cookie')) return false

    // Cache-Control directives — case-insensitive directive matching.
    // The Vary spec uses comma-separated tokens; same for Cache-Control.
    const cc = res.headers.get('cache-control')?.toLowerCase() ?? ''
    if (cc.includes('private') || cc.includes('no-store') || cc.includes('no-cache')) {
      return false
    }

    // Authorization response header — present only when an auth challenge
    // OR auth-bearing token is being communicated. Either way, per-user.
    if (res.headers.has('authorization')) return false

    // Vary: Cookie / Vary: Authorization → response varies per-user.
    // Safe when user opted into per-user caching via `cacheKey`; otherwise
    // sharing across users via `pathname`-only key is a leak.
    if (!hasCacheKey) {
      const vary = res.headers.get('vary')?.toLowerCase() ?? ''
      // Match whole tokens to avoid false-positives on field names like
      // `Vary: Accept-Cookie-Format` (hypothetical but defensive).
      const varyTokens = vary.split(',').map((t) => t.trim())
      if (varyTokens.includes('cookie') || varyTokens.includes('authorization') || varyTokens.includes('*')) {
        if (__DEV__) {
          console.warn(
            '[Pyreon ISR] Response has `Vary: Cookie` (or Authorization / *) ' +
              'but no `cacheKey` is configured — refusing to cache to prevent ' +
              'cross-user data leak. Supply `cacheKey: (req) => ...` keyed on the ' +
              'cookie identity to enable per-user caching for this page.',
          )
        }
        return false
      }
    }

    return true
  }
  // Cache-key derivation. Default keys by `pathname + search` — the
  // safe default that matches Next.js ISR and RSC conventions: query
  // strings carry session IDs, pagination state, sort/filter selectors
  // that ALL affect the rendered HTML. A `pathname`-only default
  // (shipped pre-fix as M1.1) silently served `/posts?id=42` HTML to
  // `/posts?id=99` requests — visibly wrong content, structurally
  // invisible to tests that only probe one URL per route.
  //
  // Two trade-offs callers should know about (the dev warning below
  // names both):
  //   1. **Auth-gated content** — `pathname + search` is still NOT safe
  //      when the loader reads cookies / Authorization headers. Supply
  //      `cacheKey: (req) => ...` that includes the session/user
  //      identifier in the key. See `ISRConfig.cacheKey` JSDoc.
  //   2. **High-cardinality query params** — analytics tokens
  //      (`utm_source`, `fbclid`, etc.) cause cache explosion (one
  //      entry per click variant). Strip them with `cacheKey: (req) =>
  //      new URL(req.url).pathname` if your route doesn't depend on
  //      any query params.
  const deriveKey: (req: Request, url: URL) => string
    = typeof config.cacheKey === 'function'
      ? (req, _url) => (config.cacheKey as (r: Request) => string)(req)
      : (_req, url) => url.pathname + url.search

  // One-time dev warning when the default cacheKey is in effect. Mirrors
  // the M2.4 adapter env-var warning pattern: warn ONCE per handler
  // instance so a busy production CMS doesn't spam logs. The warning
  // fires regardless of whether the handler ever sees an auth-bearing
  // request — the goal is to teach the trade-offs at developer time,
  // not at runtime.
  // Bare `process.env.NODE_ENV` gate (NOT the file's local `__DEV__`
  // alias) — folds to dead code under every modern bundler's define
  // replacement, so the warning string + WeakSet membership check
  // tree-shake to zero bytes in production. The local `__DEV__` const
  // shipped pre-fix throughout this file is the documented anti-pattern
  // (catches bundler reliability gaps in Bun.build / some esbuild
  // configs); migrating existing call sites is a separate cleanup.
  // See .claude/rules/anti-patterns.md → "Local `__DEV__` const alias".
  if (
    process.env.NODE_ENV !== 'production'
    && !hasCacheKey
    && !_warnedDefaultCacheKeyHandlers.has(deriveKey)
  ) {
    _warnedDefaultCacheKeyHandlers.add(deriveKey)
    // oxlint-disable-next-line no-console
    console.warn(
      '[Pyreon ISR] No `cacheKey` configured — using default '
      + '`url.pathname + url.search`. Two caveats:\n'
      + '  1. AUTH-UNSAFE for loaders that read cookies / Authorization. '
      + 'Supply `cacheKey: (req) => `${pathname}::${session}`` to vary '
      + 'by user identifier.\n'
      + '  2. HIGH-CARDINALITY query params (utm_*, fbclid) cause cache '
      + 'explosion. Use `cacheKey: (req) => new URL(req.url).pathname` '
      + 'if your route ignores query strings.\n'
      + 'See https://docs.pyreon.com/zero#isr-handler-runtime for details.',
    )
  }

  /**
   * Phase 6 — record the entry's tags at cache-set time (both the miss
   * path and background revalidations). A throwing user callback is
   * swallowed with a dev warning — tagging must never take down caching.
   */
  async function recordTags(key: string, request: Request): Promise<void> {
    if (!config.tagsForRequest || !store.setTags) return
    try {
      const tags = await config.tagsForRequest(request)
      if (Array.isArray(tags) && tags.length > 0) {
        await store.setTags(key, tags)
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.warn('[Pyreon] isr.tagsForRequest threw — entry cached untagged:', err)
      }
    }
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

    // Hold the timer id outside try/Promise.race so the finally block
    // can `clearTimeout` it on the SUCCESS path. Pre-fix the rejection
    // setTimeout was left pending until REVALIDATE_TIMEOUT_MS (default
    // 30s) every time `handler(req)` won the race — i.e. every
    // successful revalidation. Under sustained traffic this accumulates
    // hundreds of pending timer closures + rejection callbacks before
    // they self-clear.
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    // PR-S5: per-revalidation AbortController. The timeout now ABORTS the
    // inner handler instead of just rejecting the Promise.race — without
    // this, a hung handler kept running after the race rejected, holding
    // request resources + memory indefinitely.
    const controller = new AbortController()
    // PR-S5: snapshot the key's epoch at start. If revalidateNow /
    // revalidateAll bumps the epoch mid-revalidation, our store.set() is
    // skipped — the invalidator's intent (this key MUST miss next time)
    // wins over a re-populating revalidation that started before the bump.
    const startEpoch = _currentEpoch(key)
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
          // PR-S5: when the user opts to skip revalidation for this
          // entry, DELETE the stale entry so the next live request hits
          // a fresh MISS rather than serving stale content forever.
          // Pre-fix the entry stayed stale indefinitely — every subsequent
          // request triggered revalidate → null → bail → stale served
          // again, an infinite-stale loop.
          await store.delete?.(key)
          revalidating.delete(key)
          return
        }
        // PR-S5: re-construct with the abort signal — the user's custom
        // Request doesn't carry our controller's signal otherwise.
        req = new Request(custom.url, {
          method: custom.method,
          headers: custom.headers,
          body: custom.body,
          signal: controller.signal,
        })
      } else {
        req = new Request(url.href, {
          method: 'GET',
          headers: originalReq.headers,
          signal: controller.signal,
        })
      }
      // Bound the revalidation so a hung handler can't pin `key` in
      // `revalidating` forever. PR-S5: abort the inner handler via the
      // AbortController so its loaders / DB queries actually stop.
      const res = await Promise.race([
        handler(req),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort()
            reject(new Error('[Pyreon ISR] revalidation timeout'))
          }, REVALIDATE_TIMEOUT_MS)
        }),
      ])
      // Never overwrite a good stale entry with a bad re-render
      // (5xx/3xx) or poison it with a Set-Cookie response.
      // PR-S4: also disqualify per RFC 7234 cache directives + apply
      // responseFilter as the final-say override. Filter runs BEFORE
      // body consumption so the user can re-construct a Response.
      // PR-S5: epoch guard — skip store.set() if revalidateNow /
      // revalidateAll bumped the epoch while we were running. Without
      // this, an in-flight revalidation started before the invalidator
      // would re-populate the cache AFTER the delete, defeating the
      // invalidation's intent.
      const finalRes = config.responseFilter ? (config.responseFilter(res) ?? null) : res
      if (finalRes !== null && isCacheable(finalRes) && _currentEpoch(key) === startEpoch) {
        const html = await finalRes.text()
        const headers: Record<string, string> = {}
        finalRes.headers.forEach((v, k) => {
          headers[k] = v
        })
        await store.set(key, { html, headers, timestamp: Date.now() })
        await recordTags(key, originalReq)
      }
    } catch {
      // Revalidation failed / timed out — stale cache entry remains valid
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        // Leak-class I diagnostic — emit one per cleared timer. Healthy
        // count = revalidation-attempts (every attempt should clear its
        // timer in finally). A LOWER count than revalidations means
        // clearTimeout failed to fire — the orphan-timer leak is back.
        if (__DEV__) _countSink.__pyreon_count__?.('isr.revalidate.timerClear')
      }
      revalidating.delete(key)
    }
  }

  const fetch = async (req: Request): Promise<Response> => {
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
    const rawRes = await handler(req)

    // PR-S4: apply responseFilter BEFORE consuming the body so the user
    // can re-construct a Response with `res.body` (otherwise the body
    // stream is locked once res.text() runs). Filter returning null →
    // skip cache entirely; non-null result becomes the response we
    // cache + serve.
    const res = config.responseFilter ? (config.responseFilter(rawRes) ?? null) : rawRes
    if (res === null) {
      const html = await rawRes.text()
      const headers: Record<string, string> = {}
      rawRes.headers.forEach((v, k) => {
        headers[k] = v
      })
      return new Response(html, {
        status: rawRes.status,
        statusText: rawRes.statusText,
        headers: { ...headers, 'x-isr-cache': 'BYPASS' },
      })
    }

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
    await recordTags(key, req)

    return new Response(html, {
      status: 200,
      headers: {
        ...headers,
        'content-type': 'text/html; charset=utf-8',
        'x-isr-cache': 'MISS',
      },
    })
  }

  // Attach the imperative invalidation methods. The result is a
  // callable (still works with `Bun.serve({ fetch: handler })`) plus
  // `.revalidateNow(key)` and `.revalidateAll()` for webhook-driven
  // cache busting.
  const isrHandler = fetch as ISRHandler

  isrHandler.revalidateTag = async (tag: string) => {
    if (!store.keysByTag || !store.setTags) {
      throw new Error(
        '[Pyreon] revalidateTag requires a store with setTags/keysByTag — the shipped createMemoryStore and createFsStore implement them; your custom store does not.',
      )
    }
    const keys = await store.keysByTag(tag)
    let dropped = 0
    for (const key of keys) {
      const result = await isrHandler.revalidateNow(key)
      if (result.dropped) dropped++
    }
    return { dropped }
  }

  isrHandler.revalidateNow = async (key: string) => {
    // PR-S5: bump the epoch BEFORE touching the store so any
    // in-flight revalidation that started before this call AND lands
    // its store.set() AFTER it skips the write (epoch-guard fires in
    // revalidate()). Pre-fix shape: revalidateNow read existed → store
    // delete; meanwhile a parallel revalidate's handler(req) completed
    // and called store.set(key, ...) AFTER our delete. Cache returned
    // to populated with the SAME data we tried to invalidate — the
    // CMS-webhook caller saw `dropped: true` but the next request
    // served stale-thought-fresh content. Epoch bump first means the
    // racing revalidation's snapshot is now stale and the guard skips.
    _bumpEpoch(key)
    // Get-then-delete so we can return an accurate `dropped` flag. The
    // store's `delete` doesn't return whether anything existed, so the
    // precheck is the only way to distinguish "actually dropped" from
    // "no-op against missing key". For the default in-memory store the
    // get is O(1); external stores pay one extra round-trip (acceptable
    // for an invalidation API that fires on CMS webhooks, not on the
    // hot path).
    //
    // `dropped: true` is only returned when (a) the entry existed AND
    // (b) the store actually supported delete. A store without
    // `delete?` returns `dropped: false` even if the entry existed —
    // the caller's intent (make this key MISS next time) wasn't
    // honored, so the honest answer is "no". Such stores rely on TTL
    // for eviction.
    const existed = (await store.get(key)) !== undefined
    let dropped = false
    if (existed && store.delete) {
      await store.delete(key)
      dropped = true
    }
    // Always clear the in-flight revalidation flag so the next request
    // re-renders fresh rather than short-circuiting on the
    // `revalidating.has(key)` guard — regardless of whether we
    // physically dropped the entry.
    revalidating.delete(key)
    return { dropped }
  }

  isrHandler.revalidateAll = async () => {
    if (!store.clear) {
      throw new Error(
        '[Pyreon ISR] revalidateAll() called against a store that does not implement `clear()`. The default in-memory store supports this; external stores (Redis/KV/etc.) must opt in by implementing `ISRStore.clear()`.',
      )
    }
    // PR-S5: bump epochs for every IN-FLIGHT revalidation AND every
    // key we've ever bumped before, so any racing store.set lands
    // with a stale snapshot and the epoch guard skips it. The
    // `revalidating` Set is the authoritative source of "what's about
    // to write" — `_currentEpoch` is a pure read that doesn't seed
    // the map, so `_keyEpoch.keys()` alone misses every key that has
    // never been individually invalidated. The union (revalidating ∪
    // _keyEpoch.keys) covers both: in-flight reads-pending-write +
    // history of prior revalidateNow targets.
    for (const key of revalidating) _bumpEpoch(key)
    for (const key of _keyEpoch.keys()) _bumpEpoch(key)
    await store.clear()
    // Drop every in-flight revalidation flag — fresh requests should
    // re-render rather than waiting on stale resolve callbacks pointing
    // at entries we just purged.
    revalidating.clear()
  }

  return isrHandler
}
