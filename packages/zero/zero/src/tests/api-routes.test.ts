import { describe, expect, it } from 'vitest'
import {
  apiFilePathToPattern,
  generateApiRouteModule,
  isApiRoute,
  matchApiRoute,
} from '../api-routes'

describe('isApiRoute', () => {
  it('detects api/ .ts files', () => {
    expect(isApiRoute('api/posts.ts')).toBe(true)
  })

  it('detects nested api routes', () => {
    expect(isApiRoute('api/posts/[id].ts')).toBe(true)
  })

  it('rejects .tsx files', () => {
    expect(isApiRoute('api/posts.tsx')).toBe(false)
  })

  it('rejects non-api routes', () => {
    expect(isApiRoute('posts.ts')).toBe(false)
    expect(isApiRoute('about.tsx')).toBe(false)
  })

  it('detects .js files', () => {
    expect(isApiRoute('api/health.js')).toBe(true)
  })
})

describe('apiFilePathToPattern', () => {
  it('converts simple route', () => {
    expect(apiFilePathToPattern('api/posts.ts')).toBe('/api/posts')
  })

  it('converts index route', () => {
    expect(apiFilePathToPattern('api/posts/index.ts')).toBe('/api/posts')
  })

  it('converts dynamic param', () => {
    expect(apiFilePathToPattern('api/posts/[id].ts')).toBe('/api/posts/:id')
  })

  it('converts catch-all', () => {
    expect(apiFilePathToPattern('api/[...path].ts')).toBe('/api/:path*')
  })

  it('converts nested dynamic', () => {
    expect(apiFilePathToPattern('api/users/[id]/posts.ts')).toBe('/api/users/:id/posts')
  })
})

describe('matchApiRoute', () => {
  it('matches static paths', () => {
    expect(matchApiRoute('/api/posts', '/api/posts')).toEqual({})
  })

  it('rejects non-matching paths', () => {
    expect(matchApiRoute('/api/posts', '/api/users')).toBeNull()
  })

  it('extracts dynamic params', () => {
    expect(matchApiRoute('/api/posts/:id', '/api/posts/123')).toEqual({
      id: '123',
    })
  })

  it('extracts multiple params', () => {
    expect(matchApiRoute('/api/users/:userId/posts/:postId', '/api/users/1/posts/2')).toEqual({
      userId: '1',
      postId: '2',
    })
  })

  it('matches catch-all', () => {
    expect(matchApiRoute('/api/:path*', '/api/foo/bar/baz')).toEqual({
      path: 'foo/bar/baz',
    })
  })

  it('rejects extra segments', () => {
    expect(matchApiRoute('/api/posts', '/api/posts/123')).toBeNull()
  })

  it('rejects missing segments', () => {
    expect(matchApiRoute('/api/posts/:id', '/api/posts')).toBeNull()
  })
})

describe('generateApiRouteModule', () => {
  it('returns empty for no api routes', () => {
    const code = generateApiRouteModule(['index.tsx', 'about.tsx'], '/src/routes')
    expect(code).toContain('export const apiRoutes = []')
  })

  it('generates imports for api routes', () => {
    const code = generateApiRouteModule(['api/posts.ts', 'index.tsx'], '/src/routes')
    expect(code).toContain('import * as')
    expect(code).toContain('/src/routes/api/posts.ts')
    expect(code).toContain('pattern: "/api/posts"')
  })

  it('handles multiple api routes', () => {
    const code = generateApiRouteModule(
      ['api/posts.ts', 'api/users.ts', 'api/posts/[id].ts'],
      '/src/routes',
    )
    expect(code).toContain('pattern: "/api/posts"')
    expect(code).toContain('pattern: "/api/users"')
    expect(code).toContain('pattern: "/api/posts/:id"')
  })

  it('skips non-api files', () => {
    const code = generateApiRouteModule(['api/posts.ts', 'index.tsx', 'about.tsx'], '/src/routes')
    expect(code).not.toContain('index.tsx')
    expect(code).not.toContain('about.tsx')
  })
})
