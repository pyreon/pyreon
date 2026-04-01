import { describe, expect, it } from 'vitest'
import { parseFileRoutes, filePathToUrlPath } from '../fs-router'
import { matchApiRoute, createApiMiddleware } from '../api-routes'
import { matchPattern } from '../entry-server'
import { resolveAdapter } from '../adapters'
import { buildMetaTags } from '../meta'
import { buildCspHeader } from '../csp'
import { validateEnv, publicEnv, str, num, bool, url, oneOf, schema } from '../env'
import type { MiddlewareContext } from '@pyreon/server'

// ─── Route integration — file scanning + matching ──────────────────────────

describe('route integration — file scanning + matching', () => {
  it('parseFileRoutes: index.tsx → /, about.tsx → /about, users/[id].tsx → /users/:id', () => {
    const routes = parseFileRoutes(['index.tsx', 'about.tsx', 'users/[id].tsx'])
    expect(routes.find((r) => r.filePath === 'index.tsx')?.urlPath).toBe('/')
    expect(routes.find((r) => r.filePath === 'about.tsx')?.urlPath).toBe('/about')
    expect(routes.find((r) => r.filePath === 'users/[id].tsx')?.urlPath).toBe('/users/:id')
  })

  it('_layout.tsx filtered out (isLayout = true)', () => {
    const routes = parseFileRoutes(['_layout.tsx', 'index.tsx'])
    const layout = routes.find((r) => r.isLayout)
    expect(layout).toBeDefined()
    expect(layout?.filePath).toBe('_layout.tsx')
    // Layout should not appear as a normal page route
    const pages = routes.filter((r) => !r.isLayout && !r.isError && !r.isLoading && !r.isNotFound)
    expect(pages.every((r) => r.filePath !== '_layout.tsx')).toBe(true)
  })

  it('_error.tsx filtered out (isError = true)', () => {
    const routes = parseFileRoutes(['_error.tsx', 'index.tsx'])
    const error = routes.find((r) => r.isError)
    expect(error).toBeDefined()
    expect(error?.filePath).toBe('_error.tsx')
  })

  it('[...slug].tsx → catch-all route', () => {
    const routes = parseFileRoutes(['blog/[...slug].tsx'])
    expect(routes[0]?.urlPath).toBe('/blog/:slug*')
    expect(routes[0]?.isCatchAll).toBe(true)
  })

  it('nested: users/[id]/settings.tsx → /users/:id/settings', () => {
    const routes = parseFileRoutes(['users/[id]/settings.tsx'])
    expect(routes[0]?.urlPath).toBe('/users/:id/settings')
  })

  it('route groups: (auth)/login.tsx → /login (group stripped from URL)', () => {
    expect(filePathToUrlPath('(auth)/login')).toBe('/login')
    const routes = parseFileRoutes(['(auth)/login.tsx'])
    expect(routes[0]?.urlPath).toBe('/login')
  })
})

// ─── Route integration — pattern matching ──────────────────────────────────

describe('route integration — pattern matching', () => {
  it('matchPattern: exact match /about → true', () => {
    expect(matchPattern('/about', '/about')).toBe(true)
  })

  it('matchPattern: dynamic /users/:id matches /users/42 → true', () => {
    expect(matchPattern('/users/:id', '/users/42')).toBe(true)
  })

  it('matchPattern: /users/:id does NOT match /users/42/extra → false', () => {
    expect(matchPattern('/users/:id', '/users/42/extra')).toBe(false)
  })

  it('matchPattern: catch-all /blog/:slug* matches /blog/any/path → true', () => {
    expect(matchPattern('/blog/:slug*', '/blog/any/path')).toBe(true)
  })

  it('matchPattern: /blog/:slug* does NOT match /about → false (prefix mismatch)', () => {
    expect(matchPattern('/blog/:slug*', '/about')).toBe(false)
  })
})

// ─── Route integration — API routes ────────────────────────────────────────

describe('route integration — API routes', () => {
  it('matchApiRoute: /api/posts matches /api/posts → params empty', () => {
    const result = matchApiRoute('/api/posts', '/api/posts')
    expect(result).toEqual({})
  })

  it('matchApiRoute: /api/posts/:id matches /api/posts/42 → params.id = "42"', () => {
    const result = matchApiRoute('/api/posts/:id', '/api/posts/42')
    expect(result).toEqual({ id: '42' })
  })

  it('matchApiRoute: /api/posts/:id does NOT match /api/users/42 → null', () => {
    const result = matchApiRoute('/api/posts/:id', '/api/users/42')
    expect(result).toBeNull()
  })

  it('createApiMiddleware: handles POST to registered action', async () => {
    const middleware = createApiMiddleware([
      {
        pattern: '/api/posts',
        module: {
          POST: () => new Response(JSON.stringify({ created: true }), { status: 201 }),
        },
      },
    ])

    const req = new Request('http://localhost/api/posts', { method: 'POST' })
    const ctx = {
      req,
      url: new URL(req.url),
      path: '/api/posts',
      headers: new Headers(),
      locals: {},
    } as unknown as MiddlewareContext

    const response = await middleware(ctx)
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(201)
    const body = await (response as Response).json()
    expect(body).toEqual({ created: true })
  })

  it('createApiMiddleware: returns 404 for unknown action', async () => {
    const middleware = createApiMiddleware([
      {
        pattern: '/api/posts',
        module: { GET: () => new Response('ok') },
      },
    ])

    const req = new Request('http://localhost/api/unknown', { method: 'GET' })
    const ctx = {
      req,
      url: new URL(req.url),
      path: '/api/unknown',
      headers: new Headers(),
      locals: {},
    } as unknown as MiddlewareContext

    const response = await middleware(ctx)
    // No route matched → middleware returns undefined (next middleware handles it)
    expect(response).toBeUndefined()
  })

  it('createApiMiddleware: returns 405 for wrong method', async () => {
    const middleware = createApiMiddleware([
      {
        pattern: '/api/posts',
        module: { GET: () => new Response('ok') },
      },
    ])

    const req = new Request('http://localhost/api/posts', { method: 'DELETE' })
    const ctx = {
      req,
      url: new URL(req.url),
      path: '/api/posts',
      headers: new Headers(),
      locals: {},
    } as unknown as MiddlewareContext

    const response = await middleware(ctx)
    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(405)
    expect((response as Response).headers.get('Allow')).toBe('GET')
  })
})

// ─── Route integration — meta + CSP + env together ─────────────────────────

describe('route integration — meta + CSP + env together', () => {
  it('buildMetaTags with full config → all meta tags present', () => {
    const tags = buildMetaTags({
      title: 'Integration Test',
      description: 'Testing meta, CSP, and env together',
      image: '/og.jpg',
      imageWidth: 1200,
      imageHeight: 630,
      canonical: 'https://example.com/test',
      siteName: 'TestSite',
      type: 'website',
      robots: 'index, follow',
      twitterCard: 'summary_large_image',
      twitterSite: '@test',
    })

    expect(tags.meta.find((m) => m.name === 'description')?.content).toBe(
      'Testing meta, CSP, and env together',
    )
    expect(tags.meta.find((m) => m.property === 'og:title')?.content).toBe('Integration Test')
    expect(tags.meta.find((m) => m.property === 'og:image')?.content).toBe('/og.jpg')
    expect(tags.meta.find((m) => m.property === 'og:image:width')?.content).toBe('1200')
    expect(tags.meta.find((m) => m.property === 'og:image:height')?.content).toBe('630')
    expect(tags.meta.find((m) => m.property === 'og:url')?.content).toBe('https://example.com/test')
    expect(tags.meta.find((m) => m.property === 'og:site_name')?.content).toBe('TestSite')
    expect(tags.meta.find((m) => m.property === 'og:type')?.content).toBe('website')
    expect(tags.meta.find((m) => m.name === 'robots')?.content).toBe('index, follow')
    expect(tags.meta.find((m) => m.name === 'twitter:card')?.content).toBe('summary_large_image')
    expect(tags.meta.find((m) => m.name === 'twitter:site')?.content).toBe('@test')
    expect(tags.link.find((l) => l.rel === 'canonical')?.href).toBe('https://example.com/test')
  })

  it('buildCspHeader → valid CSP string', () => {
    const header = buildCspHeader({
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    })

    expect(header).toContain("default-src 'self'")
    expect(header).toContain("script-src 'self' 'unsafe-inline'")
    expect(header).toContain("img-src 'self' data: https:")
    // Directives are separated by semicolons
    expect(header.split(';').length).toBeGreaterThanOrEqual(3)
  })

  it('validateEnv with defaults → returns typed object', () => {
    const env = validateEnv(
      {
        PORT: 3000,
        DEBUG: false,
        HOST: 'localhost',
      },
      {},
    )

    expect(env.PORT).toBe(3000)
    expect(env.DEBUG).toBe(false)
    expect(env.HOST).toBe('localhost')
  })

  it('validateEnv missing required → throws with ALL errors listed', () => {
    expect(() =>
      validateEnv(
        {
          API_KEY: String,
          DATABASE_URL: url(),
          SECRET: str(),
        },
        {},
      ),
    ).toThrow(/3 error/)
  })

  it('publicEnv extracts ZERO_PUBLIC_ vars', () => {
    const original = { ...process.env }
    process.env.ZERO_PUBLIC_API_URL = 'https://api.example.com'
    process.env.ZERO_PUBLIC_APP_NAME = 'TestApp'
    process.env.SECRET_KEY = 'should-not-appear'

    const pub = publicEnv()

    expect(pub.API_URL).toBe('https://api.example.com')
    expect(pub.APP_NAME).toBe('TestApp')
    expect(pub.SECRET_KEY).toBeUndefined()

    // Restore
    delete process.env.ZERO_PUBLIC_API_URL
    delete process.env.ZERO_PUBLIC_APP_NAME
    delete process.env.SECRET_KEY
    Object.assign(process.env, original)
  })
})

// ─── Route integration — adapter resolution ────────────────────────────────

describe('route integration — adapter resolution', () => {
  it("resolveAdapter('node') → name = 'node'", () => {
    const adapter = resolveAdapter({ adapter: 'node' })
    expect(adapter.name).toBe('node')
  })

  it("resolveAdapter('vercel') → name = 'vercel'", () => {
    const adapter = resolveAdapter({ adapter: 'vercel' })
    expect(adapter.name).toBe('vercel')
  })

  it("resolveAdapter('cloudflare') → name = 'cloudflare'", () => {
    const adapter = resolveAdapter({ adapter: 'cloudflare' })
    expect(adapter.name).toBe('cloudflare')
  })

  it("resolveAdapter('netlify') → name = 'netlify'", () => {
    const adapter = resolveAdapter({ adapter: 'netlify' })
    expect(adapter.name).toBe('netlify')
  })

  it("resolveAdapter('unknown') → throws", () => {
    expect(() =>
      // @ts-expect-error testing invalid input
      resolveAdapter({ adapter: 'unknown' }),
    ).toThrow('[zero] Unknown adapter: "unknown"')
  })
})
