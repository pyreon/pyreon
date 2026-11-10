// Server entry — the canonical shape zero synthesizes when this file is absent
// (https://pyreon.dev/docs/zero#ssrisr-build, "createServer" in #app-assembly-apis),
// plus ONE app middleware.
//
// KNOWN PYREON DEFECT this middleware works around: the documented way to answer
// 404 for a missing resource — `notFound()` thrown from the loader (kept in
// routes/items/[id].server.ts) — answers HTTP 500 under SSR ("[Pyreon] SSR
// render failed … Error: Not Found"): `renderPage` maps only the
// no-route-matched fallback (`isNotFound`) to 404 and rethrows every other
// preload rejection. A route-level `middleware` export would ship this module's
// data import to the client bundle, so the check lives here, server-only.
// Cost on the timed `/items` path: one regex test per request.
import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'
import { getItem } from './server/data'

const DETAIL = /^\/items\/(\d+)\/?$/

const itemNotFound = async (ctx: { url: URL }): Promise<Response | undefined> => {
  const m = DETAIL.exec(ctx.url.pathname)
  if (m && !(await getItem(Number(m[1])))) return new Response('Not Found', { status: 404 })
  return undefined
}

export default createServer({ routes, routeMiddleware, apiRoutes, middleware: [itemNotFound] })
