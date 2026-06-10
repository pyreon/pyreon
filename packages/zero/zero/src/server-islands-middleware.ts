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
 */
import type { Middleware } from '@pyreon/server'
import { getRegisteredServerIslands, renderServerIslandFragment } from '@pyreon/server'
import type { RouteRecord } from '@pyreon/router'

const FRAGMENT_PREFIX = '/_pyreon/fragment/'

interface LazyLike {
  loader?: () => Promise<unknown>
}

async function warmRouteModules(routes: RouteRecord[]): Promise<void> {
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

export function createServerIslandMiddleware(routes: RouteRecord[]): Middleware {
  // Memoized warm — at most one full route-module load per process.
  let warmed: Promise<void> | null = null
  const warmOnce = (): Promise<void> => (warmed ??= warmRouteModules(routes))

  return async (ctx) => {
    if (!ctx.url.pathname.startsWith(FRAGMENT_PREFIX)) return
    if (ctx.req.method !== 'GET') {
      return new Response(null, { status: 405, headers: { Allow: 'GET' } })
    }

    const name = decodeURIComponent(ctx.url.pathname.slice(FRAGMENT_PREFIX.length))
    if (!name || name.includes('/')) {
      return new Response('Bad Request', { status: 400 })
    }

    // Cold-start warm-up: miss → load every route module once → retry.
    if (!getRegisteredServerIslands().has(name)) {
      await warmOnce()
    }

    const rawProps = ctx.url.searchParams.get('props')
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
        'Cache-Control': result.cacheControl,
      },
    })
  }
}
