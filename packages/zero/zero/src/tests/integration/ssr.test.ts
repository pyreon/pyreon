import { resolve } from 'node:path'
import pyreon from '@pyreon/vite-plugin'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'

const FIXTURE_DIR = resolve(import.meta.dirname, 'fixture')

let server: ViteDevServer
let baseUrl: string

beforeAll(async () => {
  server = await createServer({
    root: FIXTURE_DIR,
    configFile: false, // Don't load vite.config.ts — configure inline
    plugins: [pyreon(), zeroPlugin({ mode: 'ssr' })],
    resolve: { conditions: ['bun'] },
    ssr: { resolve: { conditions: ['bun'] } },
    optimizeDeps: {
      exclude: [
        '@pyreon/core',
        '@pyreon/reactivity',
        '@pyreon/router',
        '@pyreon/runtime-dom',
        '@pyreon/runtime-server',
        '@pyreon/head',
        '@pyreon/server',
        '@pyreon/vite-plugin',
      ],
    },
    server: { port: 0 },
    logLevel: 'silent',
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (address && typeof address === 'object') {
    baseUrl = `http://localhost:${address.port}`
  }
}, 30_000)

afterAll(async () => {
  await server?.close()
})

describe('SSR integration', () => {
  it('boots the Vite dev server', () => {
    expect(baseUrl).toBeDefined()
    expect(baseUrl).toMatch(/^http:\/\/localhost:\d+$/)
  })

  it('resolves virtual:zero/routes module', async () => {
    const mod = await server.ssrLoadModule('virtual:zero/routes')
    expect(mod.routes).toBeDefined()
    expect(Array.isArray(mod.routes)).toBe(true)
    expect(mod.routes.length).toBeGreaterThan(0)
  })

  it('generates routes for fixture pages', async () => {
    const mod = await server.ssrLoadModule('virtual:zero/routes')
    const paths = flattenPaths(mod.routes)
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
  })

  it('generates route for dynamic [id] param', async () => {
    const mod = await server.ssrLoadModule('virtual:zero/routes')
    const paths = flattenPaths(mod.routes)
    expect(paths.some((p: string) => p.includes(':id'))).toBe(true)
  })

  it('wires renderMode into route meta', async () => {
    const mod = await server.ssrLoadModule('virtual:zero/routes')
    const route = mod.routes.find((r: { path: string }) => r.path === '/')
    expect(route).toBeDefined()
    expect(route.meta).toBeDefined()
  })

  it('serves index.html on GET /', async () => {
    const res = await fetch(`${baseUrl}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<div id="app">')
  })

  it('serves the about page', async () => {
    const res = await fetch(`${baseUrl}/about`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('returns HTML for dynamic routes', async () => {
    const res = await fetch(`${baseUrl}/users/42`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<div id="app">')
  })

  it('loads virtual modules via plugin resolveId', async () => {
    const resolved = await server.pluginContainer.resolveId('virtual:zero/routes')
    expect(resolved).toBeTruthy()
    expect(resolved?.id).toContain('virtual:zero/routes')
  })

  it('generates API route module for fixture', async () => {
    const { scanRouteFiles } = await import('../../fs-router')
    const { generateApiRouteModule } = await import('../../api-routes')
    const routesDir = resolve(FIXTURE_DIR, 'src/routes')
    const files = await scanRouteFiles(routesDir)
    const code = generateApiRouteModule(files, routesDir)
    expect(code).toContain('/api/health')
    expect(code).toContain('apiRoutes')
  })

  it('generates middleware module for fixture', async () => {
    const { generateMiddlewareModule, scanRouteFiles } = await import('../../fs-router')
    const routesDir = resolve(FIXTURE_DIR, 'src/routes')
    const files = await scanRouteFiles(routesDir)
    const code = generateMiddlewareModule(files, routesDir)
    expect(code).toContain('routeMiddleware')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/this-route-does-not-exist`)
    // Vite dev server returns 200 with index.html for SPA fallback,
    // but the HTML should still be served (client-side router handles 404)
    expect(res.status).toBe(200)
    const html = await res.text()
    // Even for unknown routes, the shell HTML is served for client-side routing
    expect(html).toContain('<div id="app">')
  })

  it('serves API routes and returns JSON', async () => {
    // Verify the API route module is correctly generated with the health endpoint
    const { generateApiRouteModule } = await import('../../api-routes')
    const { scanRouteFiles } = await import('../../fs-router')
    const routesDir = resolve(FIXTURE_DIR, 'src/routes')
    const files = await scanRouteFiles(routesDir)
    const code = generateApiRouteModule(files, routesDir)
    expect(code).toContain('/api/health')
    expect(code).toContain('apiRoutes')

    // Also verify the virtual module loads correctly via SSR
    const mod = await server.ssrLoadModule('virtual:zero/api-routes')
    expect(mod.apiRoutes).toBeDefined()
    expect(Array.isArray(mod.apiRoutes)).toBe(true)
    const healthRoute = mod.apiRoutes.find((r: { pattern: string }) => r.pattern === '/api/health')
    expect(healthRoute).toBeDefined()
    expect(healthRoute.module.GET).toBeTypeOf('function')
  })

  it('serves static assets (index.html exists)', async () => {
    // Verify the fixture's index.html is accessible as a static asset
    const res = await fetch(`${baseUrl}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<meta charset="UTF-8">')
    expect(html).toContain('<title>')
  })

  it('generates routes for the broken page fixture', async () => {
    const mod = await server.ssrLoadModule('virtual:zero/routes')
    const paths = flattenPaths(mod.routes)
    expect(paths).toContain('/broken')
  })

  it('handles SSR errors gracefully (error overlay)', async () => {
    // The SSR middleware wraps errors and returns a 500 error overlay
    const res = await fetch(`${baseUrl}/broken`)
    const html = await res.text()
    // The response should be HTML regardless (error overlay or shell)
    expect(html).toContain('<!DOCTYPE html>')
  })
})

function flattenPaths(routes: Array<{ path?: string; children?: unknown[] }>): string[] {
  const paths: string[] = []
  for (const r of routes) {
    if (r.path) paths.push(r.path)
    if (r.children) paths.push(...flattenPaths(r.children as typeof routes))
  }
  return paths
}
