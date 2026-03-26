import { apiRoutes } from "virtual:zero/api-routes"
import { routeMiddleware } from "virtual:zero/route-middleware"
import { routes } from "virtual:zero/routes"
import { createServer } from "@pyreon/zero"
import { cacheMiddleware, securityHeaders, varyEncoding } from "@pyreon/zero/cache"
import { corsMiddleware } from "@pyreon/zero/cors"
import { rateLimitMiddleware } from "@pyreon/zero/rate-limit"

export default createServer({
  routes,
  routeMiddleware,
  apiRoutes,
  config: {
    ssr: { mode: "stream" },
  },
  middleware: [
    corsMiddleware(),
    rateLimitMiddleware({ max: 100, window: 60, include: ["/api/*"] }),
    securityHeaders(),
    cacheMiddleware({ staleWhileRevalidate: 120 }),
    varyEncoding(),
  ],
})
