import { routes } from 'virtual:zero/routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { apiRoutes } from 'virtual:zero/api-routes'
import { createServer } from '@pyreon/zero/server'

// The same entry runs on Node AND on every edge runtime: the edge sub-build
// resolves `@pyreon/zero/server` to the request-time-only `@pyreon/zero/edge`.
export default createServer({ routes, routeMiddleware, apiRoutes })
