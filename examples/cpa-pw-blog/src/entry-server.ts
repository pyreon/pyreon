import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { createServer } from '@pyreon/zero/server'
import {
  cacheMiddleware,
  securityHeaders,
  varyEncoding,
} from '@pyreon/zero/cache'

export default createServer({
  routes,
  routeMiddleware,
  config: {
    ssr: { mode: 'string' },
  },
  middleware: [
    securityHeaders(),
    cacheMiddleware({ staleWhileRevalidate: 120 }),
    varyEncoding(),
  ],
})
