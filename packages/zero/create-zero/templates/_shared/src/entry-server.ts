import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'
import {
  cacheMiddleware,
  securityHeaders,
  varyEncoding,
} from '@pyreon/zero/cache'

export default createServer({
  routes,
  routeMiddleware,
  // Without this, src/routes/api/* answered in dev and returned an empty
  // HTML page in production.
  apiRoutes,
  config: {
    ssr: { mode: '{{ssrMode}}' },
  },
  middleware: [
    securityHeaders(),
    cacheMiddleware({ staleWhileRevalidate: 120 }),
    varyEncoding(),
  ],
})
