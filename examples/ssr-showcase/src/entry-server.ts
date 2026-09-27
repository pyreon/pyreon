import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'

/**
 * App-wide auth gate for server actions (production e2e probe). App
 * middleware runs BEFORE the action endpoint, so a POST without the header
 * never reaches the handler.
 */
const requireAuthForActions = (ctx: { url: URL; req: Request }): Response | undefined => {
  if (ctx.url.pathname.startsWith('/_zero/actions/') && ctx.req.headers.get('x-demo-auth') !== 'let-me-in') {
    return new Response('Unauthorized', { status: 401 })
  }
  return undefined
}

export default createServer({ routes, routeMiddleware, apiRoutes, middleware: [requireAuthForActions] })
