/**
 * Server islands (Phase 4 of the render-modes plan) — the INVERSE of client
 * islands: a static (CDN-cacheable / prerendered / ISR-cached) page with
 * per-request SERVER-rendered holes.
 *
 * `island()` defers CLIENT hydration of an interactive component inside a
 * static page. `serverIsland()` defers SERVER rendering of a fragment whose
 * content depends on the REQUEST (cookies, session, A/B bucket, live data)
 * — so the page around it stays cacheable while the hole is personalized:
 *
 * ```tsx
 * // src/islands/CartBadge.tsx
 * export default function CartBadge({ label }: { label: string }) {
 *   const locals = useRequestLocals()           // cookies → session → count
 *   return <span class="badge">{label}: {locals.cartCount}</span>
 * }
 *
 * // src/routes/_layout.tsx — page can be SSG/ISR-cached; the badge can't
 * import { serverIsland } from "@pyreon/zero"
 * const CartBadge = serverIsland(() => import("../islands/CartBadge"), {
 *   name: "CartBadge",
 *   fallback: <span class="badge">Cart</span>,
 * })
 * <CartBadge label="Cart" />
 * ```
 *
 * How it works:
 *  1. EVERY render (server or client) emits only a `<pyreon-server-island>`
 *     marker carrying the island name + codec-encoded props. The page
 *     therefore contains nothing request-specific — it is safe to prerender,
 *     ISR-cache, or CDN-cache.
 *  2. On the client, `activateServerIslands()` (auto-run by zero's
 *     `startClient`) scans the markers and fetches
 *     `GET /_pyreon/fragment/<name>?props=<encoded>` — a tiny endpoint the
 *     server auto-mounts — then swaps the returned HTML into the marker.
 *  3. The fragment renders PER REQUEST on the server with the full request
 *     context (middleware locals, cookies — `renderToString`
 *     inherits the request context since the renderPage unification), so
 *     auth/personalization work exactly like a normal SSR render.
 *
 * Deliberate v1 contracts:
 *  - **Always deferred.** Even on a fully-SSR page the island renders via
 *    the fragment fetch — ALWAYS-deferred is what makes the surrounding
 *    page's cacheability unconditional (Astro 5 made the same call).
 *  - **Fragments are HTML, not hydrated apps.** A server island's content
 *    is server-rendered markup; composing a client `island()` INSIDE a
 *    server island is a documented follow-up, not v1.
 *  - **Name-allowlisted endpoint.** The fragment endpoint renders ONLY
 *    registered islands — an attacker cannot render arbitrary components.
 *  - **`cache` is opt-in.** Fragment responses default to `no-store`
 *    (they exist BECAUSE they're per-request). A `cache` option sets
 *    Cache-Control for fragments that are deferred-but-shared (e.g. a
 *    slow-but-public widget) — the same auth caveat as ISR's cacheKey
 *    applies: never cache a fragment that varies on cookies.
 *
 * This module is CLIENT-SAFE (imports only @pyreon/core + the island
 * codec) — the fragment RENDERER lives in `server-island-render.ts`
 * (server-only, imports @pyreon/runtime-server) and is exported from the
 * main `@pyreon/server` barrel only.
 */

import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { encodeIslandProps } from './island-codec'

export interface ServerIslandOptions {
  /** Unique island name — the fragment endpoint's allowlist key. */
  name: string
  /**
   * Placeholder content rendered inside the marker until the fragment
   * arrives (and forever, for no-JS clients). Keep it structural — the
   * non-personalized shape of the content.
   */
  fallback?: VNodeChild
  /**
   * Cache-Control for the fragment response (default `no-store`). Only
   * set this for fragments that do NOT vary on cookies/auth.
   */
  cache?: string
}

export interface RegisteredServerIsland {
  loader: () => Promise<{ default: ComponentFn } | ComponentFn>
  options: ServerIslandOptions
}

/**
 * Process-global registry, populated by `serverIsland()` calls at module
 * evaluation (route files run on both server and client; the registry is
 * only CONSUMED server-side by the fragment endpoint).
 *
 * **`globalThis`-keyed, NOT module-level — load-bearing.** In a production
 * SSR bundle this module is reachable BOTH statically (entry-server →
 * `@pyreon/server` → the fragment endpoint) and dynamically (lazy route
 * chunks → `@pyreon/zero` → `@pyreon/server/client` → the marker
 * component), and Rolldown emits TWO module instances for that shape — one
 * inlined into the entry, one in a chunk shared by the route chunks. A
 * module-level Map would split into two registries: routes register into
 * the chunk's copy, the endpoint reads the entry's copy, every fragment
 * 404s ("Unknown server island") even though the page renders its marker.
 * Caught by the ssr-node e2e against the REAL emitted server (unit tests
 * can't see it — vitest never duplicates the module). Same cross-instance
 * pattern as `__PYREON_STYLER_FLUSH__` / `__PYREON_SSR_TEMPLATE__`.
 */
const _g = globalThis as { __PYREON_SERVER_ISLANDS__?: Map<string, RegisteredServerIsland> }
const registry: Map<string, RegisteredServerIsland> = (_g.__PYREON_SERVER_ISLANDS__ ??=
  new Map<string, RegisteredServerIsland>())

/** @internal Fragment endpoint allowlist lookup. */
export function getRegisteredServerIslands(): Map<string, RegisteredServerIsland> {
  return registry
}

/** @internal Test isolation. */
export function _resetServerIslands(): void {
  registry.clear()
}

/**
 * Declare a server island. Returns a component that renders ONLY a marker
 * element — the per-request content arrives via the fragment endpoint.
 * See the module docstring for the full contract.
 */
export function serverIsland<P extends Record<string, unknown> = Record<string, unknown>>(
  loader: () => Promise<{ default: ComponentFn } | ComponentFn>,
  options: ServerIslandOptions,
): ComponentFn<P> {
  if (registry.has(options.name) && process.env.NODE_ENV !== 'production') {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] serverIsland: duplicate name "${options.name}" — the fragment endpoint serves the FIRST registration; this one is ignored.`,
    )
  }
  if (!registry.has(options.name)) {
    registry.set(options.name, { loader, options })
  }

  const ServerIslandMarker: ComponentFn<P> = (props: P) => {
    // The marker carries codec-encoded props (same roundtrip-preserving
    // codec client islands use — Date/Map/Set/RegExp/BigInt survive).
    // children are not serializable across the fragment boundary — same
    // contract as client islands. Mirrors `serializeIslandProps`' shape:
    // children dropped explicitly, encode failures fall back to '{}' with
    // a dev error naming the island (never a 500).
    const clean: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (key === 'children') continue
      clean[key] = value
    }
    let serialized = '{}'
    try {
      serialized = JSON.stringify(encodeIslandProps(clean, options.name))
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error(
          `[Pyreon] serverIsland "${options.name}" props could not be serialized — falling back to empty props. ${(err as Error).message}`,
        )
      }
    }
    return h(
      'pyreon-server-island' as never,
      {
        'data-name': options.name,
        ...(serialized !== '{}' ? { 'data-props': serialized } : {}),
        // SELF-ACTIVATION (client islands' self-hydration precedent): the
        // marker fetches its own fragment when IT mounts — robust whether
        // the page hydrated, the route lazily mounted after activation
        // scans ran, or an SPA navigation rendered fresh markers. A
        // document-level scan (`activateServerIslands`) can't win that
        // timing race; the component owning its lifecycle always can.
        // Server-side the ref never fires; static no-full-hydrate pages
        // use `activateServerIslands` instead.
        ...(typeof document !== 'undefined'
          ? {
              ref: (el: HTMLElement | null) => {
                if (el) activateServerIslandElement(el)
              },
            }
          : {}),
      } as never,
      (options.fallback ?? null) as never,
    )
  }
  return ServerIslandMarker
}

/**
 * Fetch + swap ONE marker's fragment. Idempotent per element
 * (`data-pyreon-si` stamp). Failures leave the fallback content in place
 * and flag the marker (`data-island-error="fragment-failed"`) — a
 * personalized hole degrading to its structural fallback is the designed
 * failure mode, never a broken page. Shared by the marker's
 * self-activation ref and the document-level `activateServerIslands` scan
 * (static pages without a full hydrate).
 */
export function activateServerIslandElement(el: HTMLElement, base = ''): void {
  if (el.hasAttribute('data-pyreon-si')) return
  el.setAttribute('data-pyreon-si', '1')
  const name = el.getAttribute('data-name')
  if (!name) return
  const props = el.getAttribute('data-props')
  const qs = props ? `?props=${encodeURIComponent(props)}` : ''
  fetch(`${base}/_pyreon/fragment/${encodeURIComponent(name)}${qs}`, {
    headers: { Accept: 'text/html' },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`fragment ${name}: HTTP ${res.status}`)
      const html = await res.text()
      if (!el.isConnected) return // route torn down mid-flight
      // Same-origin, name-allowlisted, server-rendered markup — the same
      // trust domain as the page itself.
      el.innerHTML = html
      el.dispatchEvent(
        new CustomEvent('pyreon:server-island', { bubbles: true, detail: { name } }),
      )
    })
    .catch((err: unknown) => {
      el.setAttribute('data-island-error', 'fragment-failed')
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error(`[Pyreon] server island "${name}" fragment fetch failed:`, err)
      }
    })
}
