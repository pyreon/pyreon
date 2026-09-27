import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'

// The app's OWN middleware — security headers + an action gate. Dev must run
// these too (they used to exist only in production).
export default createServer({
  routes,
  routeMiddleware,
  apiRoutes,
  middleware: [
    (ctx) => {
      ctx.headers.set('x-entry-mw', '1')
      ctx.locals.user = 'alice'
    },
    (ctx) => {
      if (ctx.url.pathname.startsWith('/_zero/actions/') && ctx.req.headers.get('x-block')) {
        return new Response('blocked by entry middleware', { status: 403 })
      }
    },
  ],
})
