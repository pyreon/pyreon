import { createServer } from '@pyreon/zero/server'
import { apiRoutes } from 'virtual:zero/api-routes'
import { routeMiddleware } from 'virtual:zero/route-middleware'
import { routes } from 'virtual:zero/routes'

export default createServer({ routes, routeMiddleware, apiRoutes })
