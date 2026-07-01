import { describe, expect, it } from 'vitest'
import { extractRouteParams, generateRouteTypes } from '../route-types'

describe('typed routes — extractRouteParams', () => {
  it('returns [] for a static path', () => {
    expect(extractRouteParams('/about')).toEqual([])
    expect(extractRouteParams('/')).toEqual([])
  })
  it('extracts a dynamic segment', () => {
    expect(extractRouteParams('/posts/:id')).toEqual(['id'])
  })
  it('strips the catch-all marker', () => {
    expect(extractRouteParams('/blog/:slug*')).toEqual(['slug'])
  })
  it('extracts multiple params in order', () => {
    expect(extractRouteParams('/u/:userId/post/:postId')).toEqual(['userId', 'postId'])
  })
  it('dedupes repeated names', () => {
    expect(extractRouteParams('/:x/:x')).toEqual(['x'])
  })
})

describe('typed routes — generateRouteTypes', () => {
  it('emits a RegisteredRoutes augmentation with per-path param shapes', () => {
    const out = generateRouteTypes(['/', '/about', '/posts/:id', '/blog/:slug*'])
    expect(out).toContain('declare module "@pyreon/zero"')
    expect(out).toContain('interface RegisteredRoutes')
    expect(out).toContain('"/": Record<string, never>')
    expect(out).toContain('"/about": Record<string, never>')
    expect(out).toContain('"/posts/:id": { id: string }')
    expect(out).toContain('"/blog/:slug*": { slug: string }')
    expect(out).toContain('export {}')
  })

  it('sorts paths + dedupes for stable output', () => {
    const a = generateRouteTypes(['/b', '/a', '/a'])
    const b = generateRouteTypes(['/a', '/b'])
    expect(a).toBe(b)
    // '/a' appears before '/b'
    expect(a.indexOf('"/a"')).toBeLessThan(a.indexOf('"/b"'))
  })

  it('multi-param route emits a multi-key shape', () => {
    const out = generateRouteTypes(['/u/:userId/post/:postId'])
    expect(out).toContain('"/u/:userId/post/:postId": { userId: string; postId: string }')
  })

  it('honors a custom module name (non-zero consumers)', () => {
    const out = generateRouteTypes(['/'], { module: '@pyreon/router' })
    expect(out).toContain('declare module "@pyreon/router"')
  })

  it('emits an empty (but valid) interface for no routes', () => {
    const out = generateRouteTypes([])
    expect(out).toContain('interface RegisteredRoutes')
    expect(out).toContain('export {}')
    expect(out).not.toMatch(/"\/.*":/)
  })
})
