/**
 * Server-island fragment endpoint (Phase 4) — auto-mounted by
 * `createServer` as `GET /_pyreon/fragment/<name>?props=<encoded>`.
 *
 * Renders ONE registered server island per request (the cacheable-page +
 * personalized-hole model — see `@pyreon/server`'s `serverIsland()` docs)
 * with the full request context: middleware ran before this dispatcher, so
 * `ctx.locals` (session, CSP nonce, …) is bridged into the fragment render
 * and `useRequestLocals()` works inside the island exactly like a page.
 *
 * **Cold-registry warm-up (the lazy-routes race).** Server islands register
 * at route-module evaluation, but zero's fs-router emits every route as
 * `lazy()` — so a fragment request hitting a freshly-restarted server whose
 * pages are served from a CDN / prerender cache (the PRIMARY use case)
 * would find an EMPTY registry: the server never rendered a page since
 * boot, so no route module ever evaluated. On a registry miss, the
 * middleware warms ALL route modules once (memoized; server-side eager
 * loading is standard — `lazy()` exists for the CLIENT bundle) and retries
 * the lookup before 404ing.
 *
 * **Signed, page-bound.** A fragment renders only for a marker the server
 * signed (`server-island-token.ts`): the request carries the marker's `page`
 * and `sig` back, and the signature over name + page + props + expiry is
 * verified BEFORE the props are decoded or anything renders — missing,
 * tampered or expired is a 403. The route-middleware gate already matched
 * this request as `page` (`routingPathname`), so the declaring page's auth
 * ran before this middleware; a forged `page` never verifies.
 */
import type { Middleware } from '@pyreon/server'
import {
  getRegisteredServerIslands,
  renderServerIslandFragment,
  SERVER_ISLAND_MINT,
} from '@pyreon/server'
import type { RouteRecord } from '@pyreon/router'
import { ROUTE_MIDDLEWARE_RAN } from './og-route'
import type { IslandSigner } from './server-island-token'
import { createIslandMint, createIslandSigner } from './server-island-token'

export const FRAGMENT_PREFIX = '/_pyreon/fragment/'

/**
 * The page a fragment request is bound to: its `page` parameter when it is a
 * plain absolute pathname, else `null` (refused). Shared by the endpoint and
 * the route-middleware gate, so the page whose middleware ran is the page the
 * signature is checked against. No `\`, control characters, query, fragment
 * or `.`/`..` segments — a server-rendered pathname never has them.
 */
export function fragmentPage(url: URL): string | null {
  const raw = url.searchParams.get('page')
  if (!raw || raw.charCodeAt(0) !== 47) return null
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    if (c === 92 || c === 63 || c === 35 || c < 32 || c === 127) return null
  }
  if (raw.split('/').some((s) => s === '.' || s === '..')) return null
  return raw
}

interface LazyLike {
  loader?: () => Promise<unknown>
}

export async function warmRouteModules(routes: RouteRecord[]): Promise<void> {
  const walk = async (records: RouteRecord[]): Promise<void> => {
    for (const record of records) {
      const component = (record as { component?: unknown }).component
      if (
        component
        && typeof component === 'object'
        && typeof (component as LazyLike).loader === 'function'
      ) {
        try {
          await (component as Required<LazyLike>).loader()
        } catch {
          // A broken route module must not take down the fragment endpoint —
          // the page render path will surface its own error for that route.
        }
      }
      const children = (record as { children?: RouteRecord[] }).children
      if (Array.isArray(children) && children.length > 0) await walk(children)
    }
  }
  await walk(routes)
}

export function createServerIslandMiddleware(
  routes: RouteRecord[],
  signer: IslandSigner = createIslandSigner(),
): Middleware {
  // Memoized warm — at most one full route-module load per process.
  let warmed: Promise<void> | null = null
  const warmOnce = (): Promise<void> => (warmed ??= warmRouteModules(routes))

  return async (ctx) => {
    if (!ctx.url.pathname.startsWith(FRAGMENT_PREFIX)) return
    if (ctx.req.method !== 'GET') {
      return new Response(null, { status: 405, headers: { Allow: 'GET' } })
    }

    // `decodeURIComponent` throws `URIError` on malformed percent-encoding
    // (`GET /_pyreon/fragment/%`), and this runs PRE-AUTH on an unauthenticated
    // endpoint — unguarded it was a one-character 500. Unlike the router's pure
    // matcher this middleware HAS an HTTP context and already answers 400 for a
    // malformed name, so a malformed escape joins that branch rather than
    // falling through as raw text.
    let name: string
    try {
      name = decodeURIComponent(ctx.url.pathname.slice(FRAGMENT_PREFIX.length))
    } catch {
      return new Response('Bad Request', { status: 400 })
    }
    if (!name || name.includes('/')) {
      return new Response('Bad Request', { status: 400 })
    }

    // Verify BEFORE anything else touches the caller's input: the props are
    // decoded, and the island rendered, only for a marker this server signed.
    const rawProps = ctx.url.searchParams.get('props') ?? ''
    const page = fragmentPage(ctx.url)
    if (page === null || !(await signer.verify(name, page, rawProps, ctx.url.searchParams.get('sig')))) {
      return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } })
    }

    // Cold-start warm-up: miss → load every route module once → retry.
    if (!getRegisteredServerIslands().has(name)) {
      await warmOnce()
    }

    // Anything this fragment renders signs for the page it belongs to.
    ctx.locals[SERVER_ISLAND_MINT] = createIslandMint(signer, page)
    const result = await renderServerIslandFragment(name, rawProps, ctx.locals)

    if (result.kind === 'not-found') {
      return new Response('Unknown server island', { status: 404 })
    }
    if (result.kind === 'bad-props') {
      return new Response('Bad Request', { status: 400 })
    }
    return new Response(result.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // A fragment the page's route middleware (or the request's
        // credentials) let through must not be replayed by a shared cache to
        // a visitor those gates would refuse — the island's own `cache`
        // applies only to ungated, anonymous fragments.
        'Cache-Control':
          ctx.locals[ROUTE_MIDDLEWARE_RAN] === true
          || ctx.req.headers.has('cookie')
          || ctx.req.headers.has('authorization')
            ? 'private, no-store'
            : result.cacheControl,
      },
    })
  }
}
