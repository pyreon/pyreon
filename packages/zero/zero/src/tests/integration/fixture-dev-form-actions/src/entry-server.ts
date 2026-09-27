import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'

const counts = ((globalThis as Record<string, unknown>).__zfCounts ??= { app: 0, route: 0 }) as {
  app: number
  route: number
}

export default createServer({
  routes,
  routeMiddleware,
  apiRoutes,
  middleware: [
    (ctx) => {
      if (ctx.req.method === 'POST') counts.app++
      ctx.headers.set('x-entry-mw', '1')
      ctx.locals.user = 'alice'
    },
  ],
})
