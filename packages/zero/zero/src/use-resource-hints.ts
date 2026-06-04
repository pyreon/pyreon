import { useHead } from '@pyreon/head'

// ─── Resource-hint primitives ───────────────────────────────────────────────
//
// These three helpers wrap `useHead` to emit the documented Web Vitals
// resource hints:
//
//   1. `usePreconnect(origin)`  → <link rel="preconnect" href="..." crossorigin>
//   2. `useDnsPrefetch(origin)` → <link rel="dns-prefetch" href="...">
//   3. `usePreload(href, opts)` → <link rel="preload" as="..." href="..." crossorigin>
//
// Why three separate primitives instead of one mega-hook:
//
//   - `preconnect` ALWAYS needs `crossorigin` for cross-origin fonts /
//     APIs (without it the connection isn't reused by the credentialed
//     fetch, defeating the hint).
//   - `dns-prefetch` is a CHEAPER but WEAKER hint (DNS only, no TLS
//     handshake) — different semantics.
//   - `preload` is a strong fetch hint with `as` + `type` requirements
//     that differ per resource class.
//
// Per-helper typed contracts catch usage errors at the type level
// (e.g. `usePreload` without `as` is a TS error).

/**
 * Emit a `<link rel="preconnect" href="..." crossorigin>` into the head.
 *
 * `preconnect` opens the connection (DNS + TCP + TLS) to a remote
 * origin BEFORE any resource is requested — saves ~100-300ms on the
 * first fetch from that origin. Use for the 1-3 most-critical
 * external origins your page hits (font CDN, analytics, image CDN).
 *
 * `crossorigin="anonymous"` is the default (and the correct value for
 * 99% of cases — every font fetch, every cross-origin image, every
 * anonymous fetch). Pass `{ credentials: true }` for credentialed
 * cross-origin fetches (rare).
 *
 * Avoid preconnecting to MORE than 3-4 origins — each connection
 * costs memory + battery; the marginal benefit drops fast past ~4.
 *
 * @example
 * usePreconnect('https://fonts.gstatic.com')
 * usePreconnect('https://cdn.example.com')
 */
export function usePreconnect(
  origin: string,
  opts?: { credentials?: boolean },
): void {
  useHead({
    link: [
      {
        rel: 'preconnect',
        href: origin,
        crossorigin: opts?.credentials ? 'use-credentials' : 'anonymous',
      },
    ],
  })
}

/**
 * Emit a `<link rel="dns-prefetch" href="...">` into the head.
 *
 * `dns-prefetch` is a CHEAPER hint than `preconnect` — only resolves
 * the DNS, doesn't open the TCP/TLS connection. Use for origins that
 * are LIKELY but not certain to be hit, where the full preconnect
 * cost would be wasted (analytics endpoints that may not fire,
 * third-party widgets that may not render, etc.).
 *
 * `dns-prefetch` does NOT take `crossorigin` (DNS resolution is
 * scheme-agnostic).
 *
 * Pair with `preconnect` for fallback browsers — preconnect-capable
 * browsers ignore the dns-prefetch (preconnect supersedes it), while
 * older browsers without preconnect support still get the DNS hint.
 *
 * @example
 * useDnsPrefetch('https://analytics.example.com')
 */
export function useDnsPrefetch(origin: string): void {
  useHead({
    link: [{ rel: 'dns-prefetch', href: origin }],
  })
}

/**
 * Emit a `<link rel="preload" as="..." href="..." crossorigin>` for a
 * specific resource that the page will hit in the critical path.
 *
 * Unlike `usePreloadFont` (which handles font-specific concerns —
 * type-inference + CORS default), `usePreload` is the generic primitive
 * for non-font preloads. Use for:
 *
 *   - LCP images (when not using `<Image priority>`)
 *   - CSS files loaded via JS at runtime
 *   - JSON / fetch responses the critical path needs
 *   - Web worker scripts
 *
 * The `as` value is REQUIRED — the preload scanner ignores `<link
 * rel="preload">` without it. For images, also pass `imagesrcset` +
 * `imagesizes` so the scanner picks the right size.
 *
 * Dedup via `@pyreon/head`'s LinkTag href-keying — two `usePreload(h)`
 * calls with the same href emit ONE preload.
 *
 * @example
 * // LCP image not using <Image priority>:
 * usePreload('/hero.jpg', { as: 'image' })
 *
 * @example
 * // Style sheet loaded at runtime:
 * usePreload('/extra.css', { as: 'style' })
 *
 * @example
 * // Fetch-based JSON (worker, route data, etc.):
 * usePreload('/api/critical.json', { as: 'fetch', type: 'application/json', crossorigin: 'anonymous' })
 */
export function usePreload(
  href: string,
  opts: PreloadOptions,
): void {
  useHead({
    link: [
      {
        rel: 'preload',
        href,
        as: opts.as,
        ...(opts.type !== undefined ? { type: opts.type } : {}),
        ...(opts.crossorigin !== undefined ? { crossorigin: opts.crossorigin } : {}),
        ...(opts.media !== undefined ? { media: opts.media } : {}),
        ...(opts.imagesrcset !== undefined ? { imagesrcset: opts.imagesrcset } : {}),
        ...(opts.imagesizes !== undefined ? { imagesizes: opts.imagesizes } : {}),
        ...(opts.fetchpriority !== undefined ? { fetchpriority: opts.fetchpriority } : {}),
      },
    ],
  })
}

export interface PreloadOptions {
  /**
   * What kind of resource is being preloaded. REQUIRED — the preload
   * scanner ignores `<link rel="preload">` without `as`. The browser
   * uses this to set the Accept header, the priority bucket, and the
   * download size budget.
   */
  as:
    | 'script'
    | 'style'
    | 'image'
    | 'font'
    | 'fetch'
    | 'document'
    | 'audio'
    | 'video'
    | 'track'
    | 'object'
    | 'embed'
    | 'worker'
  /**
   * MIME type. Required for `as: 'font'` (preload scanner ignores
   * `as=font` without matching type) and for `as: 'fetch'` with a
   * specific response shape.
   */
  type?: string
  /**
   * CORS mode. Required for fonts ('anonymous'), and for cross-origin
   * `fetch` / `image` preloads that the page will then read with CORS
   * (without it, double-fetch).
   */
  crossorigin?: 'anonymous' | 'use-credentials'
  /** Media query — only preload when the query matches (e.g. `(max-width: 600px)` for mobile-only). */
  media?: string
  /** Responsive image set (use for LCP image preloads). */
  imagesrcset?: string
  /** Responsive sizes attribute paired with imagesrcset. */
  imagesizes?: string
  /** Browser fetch priority hint. */
  fetchpriority?: 'high' | 'low' | 'auto'
}
