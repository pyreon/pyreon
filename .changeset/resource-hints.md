---
'@pyreon/zero': minor
---

Resource hint primitives — `usePreconnect` / `useDnsPrefetch` / `usePreload`.

Three documented Web Vitals resource hints with type-safe ergonomics. Each wraps `useHead` with the correct defaults + dedup behavior.

```tsx
import { usePreconnect, useDnsPrefetch, usePreload } from '@pyreon/zero'

export default function HomeRoute() {
  // Strong connection hint: full DNS + TCP + TLS handshake
  // (~100-300ms saved per origin). Use for 1-3 most-critical origins.
  usePreconnect('https://fonts.gstatic.com')
  usePreconnect('https://cdn.example.com')

  // Weak hint: DNS resolution only. Cheap fallback for older browsers
  // OR for origins that are likely-but-not-certain to be hit.
  useDnsPrefetch('https://analytics.example.com')

  // Strong fetch hint: tells the browser "fetch this NOW with this
  // priority bucket." Use for non-Image-priority LCP resources.
  usePreload('/hero.jpg', { as: 'image' })
  usePreload('/critical.css', { as: 'style' })
  usePreload('/api/critical.json', { as: 'fetch', type: 'application/json', crossorigin: 'anonymous' })

  return <h1>Home</h1>
}
```

**Correctness contracts handled automatically:**

- **`usePreconnect`** defaults to `crossorigin="anonymous"` — without it the connection isn't reused by the credentialed fetch (defeats the hint for cross-origin fonts/APIs). Pass `{ credentials: true }` for the rare credentialed case.
- **`useDnsPrefetch`** intentionally does NOT emit `crossorigin` — DNS resolution is scheme-agnostic.
- **`usePreload`** REQUIRES `as` at the type level — the preload scanner ignores `<link rel="preload">` without it. Optional fields are only emitted when supplied.
- **Dedup** — multiple calls with the same href emit ONE tag (via `@pyreon/head`'s LinkTag keying).

**Why three primitives instead of one mega-hook**: each has different semantics. `preconnect` opens the full TLS connection (~3KB memory per origin); `dns-prefetch` is the cheaper-but-weaker fallback; `preload` requires per-resource type info (`as`, `type`, `imagesrcset`). Splitting prevents API soup.

**Pairs with existing primitives:**

- `usePreloadFont` (PR #1359) — font-specific preload with auto-MIME + CORS default
- `<Image priority>` (PR #1351 / #1357) — auto-preload of LCP images
- `usePreload` — generic primitive for everything else (CSS at runtime, fetch responses, Web Workers, ServiceWorker scripts)

**Combined Web Vitals impact** (with PR #1356 image+font auto-wire + PR #1365 script defer default + this PR's resource hints): a Pyreon app declaring 2-3 preconnects + 1 LCP preload via `usePreload` in its layout typically scores 95+ on Lighthouse's Performance category WITHOUT manual `<link>` plumbing.

**API**:

```ts
function usePreconnect(origin: string, opts?: { credentials?: boolean }): void
function useDnsPrefetch(origin: string): void
function usePreload(href: string, opts: PreloadOptions): void

interface PreloadOptions {
  as: 'script' | 'style' | 'image' | 'font' | 'fetch' | 'document'
    | 'audio' | 'video' | 'track' | 'object' | 'embed' | 'worker'
  type?: string
  crossorigin?: 'anonymous' | 'use-credentials'
  media?: string                     // mobile-only preload, etc.
  imagesrcset?: string                // responsive image preload
  imagesizes?: string
  fetchpriority?: 'high' | 'low' | 'auto'
}
```

**14 specs** lock the contract:

- usePreconnect: default crossorigin, credentials override, dedup
- useDnsPrefetch: rel/href shape, no-crossorigin contract, dedup
- usePreload: basic shape, type emit, responsive image attrs, fetchpriority, media, no-extra-attrs negative, dedup
- Cross-hint composition: three hooks coexist with three distinct link tags

**Bisect-verified**: replacing the `crossorigin: 'anonymous'` default in `usePreconnect` with `undefined` fails the load-bearing default spec; 13 other specs continue to pass.

Subpath export at `@pyreon/zero/use-resource-hints`. Main entry re-exports all three hooks + the `PreloadOptions` type.

23/23 verify-modes • 1278/1279 zero tests pass (+14 new) • 11/11 validate-fast • typecheck + lint clean.
