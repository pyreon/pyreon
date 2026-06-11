/**
 * Server-loader data endpoint (Phase 5) — auto-mounted by `createServer`
 * as `GET /_pyreon/data?path=<route-path>`.
 *
 * The single-fetch contract: on a client-side navigation to a route chain
 * containing `hasServerLoader` records, the router makes ONE request here;
 * this endpoint builds a per-request router at the path, runs the chain's
 * serverLoaders (and any isomorphic loaders) SERVER-SIDE with the real
 * request (cookies / auth headers flow — `LoaderContext.request` is set),
 * and returns the whole chain's data keyed by record path:
 *
 *   { "data": { "/dash": {...}, "/dash/:id": {...} } }
 *
 * A server loader throwing `redirect()` returns `{ "redirect": { to,
 * status } }` (HTTP 200 — the CLIENT router performs the navigation;
 * a real 30x would make `fetch` follow it transparently and return the
 * target's HTML to a JSON consumer).
 *
 * Loader THROWS surface as HTTP 500 with a JSON error envelope — the
 * client treats it like a failed loader (route error boundary), same as
 * the SSR render path would.
 */
import type { RouteRecord } from '@pyreon/router'
import { createRouter, stringifyLoaderData } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'
import { provideRequestLocals } from '@pyreon/server'
import { runWithRequestContext } from '@pyreon/runtime-server'

const DATA_PREFIX = '/_pyreon/data'

export function createDataEndpointMiddleware(routes: RouteRecord[]): Middleware {
  return async (ctx) => {
    if (ctx.url.pathname !== DATA_PREFIX) return
    if (ctx.req.method !== 'GET') {
      return new Response(null, { status: 405, headers: { Allow: 'GET' } })
    }
    const path = ctx.url.searchParams.get('path')
    if (!path || !path.startsWith('/')) {
      return new Response(JSON.stringify({ error: 'missing or invalid path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const router = createRouter({ routes, mode: 'history', url: path })
    return runWithRequestContext(async () => {
      provideRequestLocals(ctx.locals)
      let result: Awaited<ReturnType<typeof router.runServerLoaders>>
      try {
        // Runs ONLY serverLoaders (not isomorphic loaders — those run
        // client-side; running them here would double-fire side effects),
        // keyed by matched-chain index (path-keying collided layout+index —
        // review findings C + F).
        result = await router.runServerLoaders(path, ctx.req)
      } catch {
        return new Response(JSON.stringify({ error: 'loader failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (result.kind === 'redirect') {
        return new Response(
          JSON.stringify({ redirect: { to: result.to, status: result.status } }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
        )
      }
      // `stringifyLoaderData` is the SAFE serializer (cycle detection with a
      // named path, function/symbol drops, `</script>` escaping). The keys
      // are matched-chain indices (numbers stringify cleanly).
      const body = `{"data":${stringifyLoaderData(result.data)}}`
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Per-request data — never cacheable by default.
          'Cache-Control': 'no-store',
        },
      })
    })
  }
}
