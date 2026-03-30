import type { Plugin } from 'vite'
import { generateApiRouteModule } from './api-routes'
import { resolveConfig } from './config'
import { renderErrorOverlay } from './error-overlay'
import { generateMiddlewareModule, generateRouteModule, scanRouteFiles } from './fs-router'
import type { ZeroConfig } from './types'

const VIRTUAL_ROUTES_ID = 'virtual:zero/routes'
const RESOLVED_VIRTUAL_ROUTES_ID = `\0${VIRTUAL_ROUTES_ID}`

const VIRTUAL_MIDDLEWARE_ID = 'virtual:zero/route-middleware'
const RESOLVED_VIRTUAL_MIDDLEWARE_ID = `\0${VIRTUAL_MIDDLEWARE_ID}`

const VIRTUAL_API_ROUTES_ID = 'virtual:zero/api-routes'
const RESOLVED_VIRTUAL_API_ROUTES_ID = `\0${VIRTUAL_API_ROUTES_ID}`

/**
 * Zero Vite plugin — adds file-based routing and zero-config conventions
 * on top of @pyreon/vite-plugin.
 *
 * @example
 * // vite.config.ts
 * import pyreon from "@pyreon/vite-plugin"
 * import zero from "@pyreon/zero"
 *
 * export default {
 *   plugins: [pyreon(), zero()],
 * }
 */
export function zeroPlugin(userConfig: ZeroConfig = {}): Plugin {
  const config = resolveConfig(userConfig)
  let routesDir: string
  let root: string

  const plugin: Plugin & { _zeroConfig: ZeroConfig } = {
    name: 'pyreon-zero',
    enforce: 'pre',
    _zeroConfig: userConfig,

    configResolved(resolvedConfig) {
      root = resolvedConfig.root
      routesDir = `${root}/src/routes`
    },

    resolveId(id) {
      if (id === VIRTUAL_ROUTES_ID) return RESOLVED_VIRTUAL_ROUTES_ID
      if (id === VIRTUAL_MIDDLEWARE_ID) return RESOLVED_VIRTUAL_MIDDLEWARE_ID
      if (id === VIRTUAL_API_ROUTES_ID) return RESOLVED_VIRTUAL_API_ROUTES_ID
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_ROUTES_ID) {
        try {
          const files = await scanRouteFiles(routesDir)
          return generateRouteModule(files, routesDir)
        } catch (_err) {
          return `export const routes = []`
        }
      }

      if (id === RESOLVED_VIRTUAL_MIDDLEWARE_ID) {
        try {
          const files = await scanRouteFiles(routesDir)
          return generateMiddlewareModule(files, routesDir)
        } catch (_err) {
          return `export const routeMiddleware = []`
        }
      }

      if (id === RESOLVED_VIRTUAL_API_ROUTES_ID) {
        try {
          const files = await scanRouteFiles(routesDir)
          return generateApiRouteModule(files, routesDir)
        } catch (_err) {
          return `export const apiRoutes = []`
        }
      }
    },

    configureServer(server) {
      // SSR error overlay — intercept HTML requests and catch SSR errors
      // This runs as a late middleware (return function) so it wraps
      // Vite's own SSR handling and catches rendering failures.
      server.middlewares.use((req, res, next) => {
        const accept = req.headers.accept ?? ''
        if (!accept.includes('text/html')) return next()

        const originalEnd = res.end.bind(res)
        let errored = false

        const handleError = (err: unknown) => {
          if (errored) return
          errored = true
          const error = err instanceof Error ? err : new Error(String(err))
          server.ssrFixStacktrace(error)
          const html = renderErrorOverlay(error)
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Content-Length', Buffer.byteLength(html))
          originalEnd(html)
        }

        res.on('error', handleError)

        // Wrap next() in try/catch to handle both sync and async errors.
        // Express-style middleware may throw synchronously or pass errors
        // through next(err), and Vite's SSR pipeline may reject promises.
        try {
          const result = next() as unknown
          // Handle async errors from Vite's SSR pipeline
          if (result && typeof (result as Promise<unknown>).catch === 'function') {
            ;(result as Promise<unknown>).catch(handleError)
          }
        } catch (err) {
          handleError(err)
        }
      })

      // Watch routes directory for changes
      server.watcher.add(`${routesDir}/**/*.{tsx,jsx,ts,js}`)

      // Invalidate virtual modules when route files change
      server.watcher.on('all', (event, path) => {
        if (path.startsWith(routesDir) && (event === 'add' || event === 'unlink')) {
          for (const resolvedId of [
            RESOLVED_VIRTUAL_ROUTES_ID,
            RESOLVED_VIRTUAL_MIDDLEWARE_ID,
            RESOLVED_VIRTUAL_API_ROUTES_ID,
          ]) {
            const mod = server.moduleGraph.getModuleById(resolvedId)
            if (mod) server.moduleGraph.invalidateModule(mod)
          }
          server.ws.send({ type: 'full-reload' })
        }
      })
    },

    config() {
      return {
        resolve: {
          conditions: ['bun'],
        },
        server: {
          port: config.port,
        },
        define: {
          __ZERO_MODE__: JSON.stringify(config.mode),
          __ZERO_BASE__: JSON.stringify(config.base),
        },
      }
    },
  }

  return plugin
}
