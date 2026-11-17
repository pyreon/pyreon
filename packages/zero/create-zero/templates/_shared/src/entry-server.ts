import { cacheMiddleware, securityHeaders, varyEncoding } from '@pyreon/zero/cache'
import { createServer } from '@pyreon/zero/server'
import { apiRoutes } from 'virtual:zero/api-routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { routes } from 'virtual:zero/routes'

export default createServer({
  routes,
  routeMiddleware,
  // Without this, src/routes/api/* answered in dev and returned an empty
  // HTML page in production.
  apiRoutes,
  config: {
    ssr: { mode: '{{ssrMode}}' },
  },
  middleware: [securityHeaders(), cacheMiddleware({ staleWhileRevalidate: 120 }), varyEncoding()],
})
