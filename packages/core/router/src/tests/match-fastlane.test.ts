import { resolveRoute } from '../match'
import type { RouteRecord } from '../types'

// ─── Fast-lane / general-lane equivalence + contracts ────────────────────────
//
// The resolve hot path has two lanes: an offset-walking fast lane for
// "plain" paths (no `%`, no `//`, no trailing slash) and the general
// split-based lane for everything else. These specs lock BOTH lanes to the
// same observable semantics, the definition-order priority contract the
// per-bucket count dispatch must preserve, and the frozen-empty-singleton
// contract for params/query/search.
//
// Priority-order specs are bisect-load-bearing: an exact-then-flex split
// of bucket candidates (count-indexed params first, splats after) passes
// every other test in the suite but breaks `splat defined BEFORE param
// wins` — that exact bug was caught during implementation and this spec
// locks it out.

const Noop = () => null

function freshRoutes(defs: Array<Partial<RouteRecord> & { path: string }>): RouteRecord[] {
  // Fresh array per test — resolveRoute caches by RouteRecord[] identity,
  // so sharing one array across tests would mask index-rebuild bugs.
  return defs.map((d) => ({ component: Noop, ...d }))
}

describe('fast lane ↔ general lane equivalence', () => {
  it('plain dynamic path (fast lane) extracts params', () => {
    const routes = freshRoutes([{ path: '/user/:id' }])
    const r = resolveRoute('/user/42', routes)
    expect(r.params).toEqual({ id: '42' })
    expect(r.matched).toHaveLength(1)
  })

  it('trailing slash matches like the split-based matcher (general lane)', () => {
    const routes = freshRoutes([{ path: '/about' }, { path: '/user/:id' }])
    // '/about/' misses the staticMap (key is '/about') and must still match
    expect(resolveRoute('/about/', routes).matched).toHaveLength(1)
    expect(resolveRoute('/user/42/', routes).params).toEqual({ id: '42' })
  })

  it('double-slash empty segments are skipped (general lane)', () => {
    const routes = freshRoutes([{ path: '/user/:id' }])
    expect(resolveRoute('/user//42', routes).params).toEqual({ id: '42' })
  })

  it('%-encoded param values are decoded (general lane)', () => {
    const routes = freshRoutes([{ path: '/file/:name' }])
    expect(resolveRoute('/file/a%20b', routes).params).toEqual({ name: 'a b' })
  })

  it('plain splat captures the joined remainder (fast lane)', () => {
    const routes = freshRoutes([{ path: '/files/:path*' }])
    expect(resolveRoute('/files/docs/2024/report.pdf', routes).params).toEqual({
      path: 'docs/2024/report.pdf',
    })
  })

  it('%-encoded splat segments are decoded (general lane)', () => {
    const routes = freshRoutes([{ path: '/files/:path*' }])
    expect(resolveRoute('/files/a%20b/c', routes).params).toEqual({ path: 'a b/c' })
  })

  it('optional trailing param matches with and without the segment', () => {
    const routes = freshRoutes([{ path: '/docs/:section?' }])
    expect(resolveRoute('/docs/intro', routes).params).toEqual({ section: 'intro' })
    expect(resolveRoute('/docs', routes).params).toEqual({})
  })

  it('query and hash parse identically on both lanes', () => {
    const routes = freshRoutes([{ path: '/user/:id' }])
    const fast = resolveRoute('/user/42?tab=posts#bio', routes)
    expect(fast.query).toEqual({ tab: 'posts' })
    expect(fast.hash).toBe('bio')
    const general = resolveRoute('/user/42/?tab=posts#bio', routes)
    expect(general.query).toEqual({ tab: 'posts' })
    expect(general.hash).toBe('bio')
  })
})

describe('definition-order priority (bucket count-dispatch must not reorder)', () => {
  it('splat defined BEFORE a same-bucket param route wins (ordered flat scan)', () => {
    const routes = freshRoutes([{ path: '/shop/:rest*' }, { path: '/shop/:id' }])
    const r = resolveRoute('/shop/42', routes)
    // First-match-wins: the splat is defined first, so it must capture.
    expect(r.params).toEqual({ rest: '42' })
  })

  it('param defined BEFORE a same-bucket splat wins', () => {
    const routes = freshRoutes([{ path: '/shop/:id' }, { path: '/shop/:rest*' }])
    expect(resolveRoute('/shop/42', routes).params).toEqual({ id: '42' })
    // Deeper path falls through to the splat
    expect(resolveRoute('/shop/a/b', routes).params).toEqual({ rest: 'a/b' })
  })

  it('all-fixed bucket dispatches by segment count without losing order', () => {
    const routes = freshRoutes([
      { path: '/admin/dashboard' },
      { path: '/admin/users/:id' },
      { path: '/admin/users/:id/settings' },
    ])
    expect(resolveRoute('/admin/users/7/settings', routes).params).toEqual({ id: '7' })
    expect(resolveRoute('/admin/users/7', routes).params).toEqual({ id: '7' })
    expect(resolveRoute('/admin/dashboard', routes).matched).toHaveLength(1)
  })
})

describe('frozen-empty singleton contract (params / query / search)', () => {
  it('static hits share ONE frozen empty params object across resolves', () => {
    const routes = freshRoutes([{ path: '/about' }, { path: '/pricing' }])
    const a = resolveRoute('/about', routes)
    const b = resolveRoute('/pricing', routes)
    expect(a.params).toEqual({})
    expect(Object.isFrozen(a.params)).toBe(true)
    expect(b.params).toBe(a.params)
  })

  it('empty query and search are frozen singletons', () => {
    const routes = freshRoutes([{ path: '/about' }])
    const r = resolveRoute('/about', routes)
    expect(Object.isFrozen(r.query)).toBe(true)
    expect(Object.isFrozen(r.search)).toBe(true)
    expect(resolveRoute('/about', routes).query).toBe(r.query)
  })

  it('non-empty params and query are fresh, mutable objects per resolve', () => {
    const routes = freshRoutes([{ path: '/user/:id' }])
    const a = resolveRoute('/user/1?x=1', routes)
    const b = resolveRoute('/user/1?x=1', routes)
    expect(a.params).not.toBe(b.params)
    expect(a.query).not.toBe(b.query)
    expect(Object.isFrozen(a.params)).toBe(false)
    a.params['extra'] = 'ok' // fresh objects stay caller-mutable
    expect(a.params['extra']).toBe('ok')
  })
})

describe('validateSearch through the precomputed validateFn', () => {
  it('runs the leaf validateSearch on a static fast-path hit', () => {
    const routes = freshRoutes([
      {
        path: '/search',
        validateSearch: (raw: Record<string, string>) => ({ q: raw['q'] ?? '', n: 1 }),
      },
    ])
    expect(resolveRoute('/search?q=pyreon', routes).search).toEqual({ q: 'pyreon', n: 1 })
  })

  it('leaf validateSearch wins over an ancestor layout one', () => {
    const routes = freshRoutes([
      {
        path: '/app',
        validateSearch: () => ({ from: 'layout' }),
        children: [
          { path: 'inner', component: Noop, validateSearch: () => ({ from: 'leaf' }) },
        ],
      },
    ])
    expect(resolveRoute('/app/inner', routes).search).toEqual({ from: 'leaf' })
  })

  it('ancestor validateSearch applies when the leaf has none', () => {
    const routes = freshRoutes([
      {
        path: '/app',
        validateSearch: () => ({ from: 'layout' }),
        children: [{ path: 'plain', component: Noop }],
      },
    ])
    expect(resolveRoute('/app/plain', routes).search).toEqual({ from: 'layout' })
  })

  it('a throwing validator falls back to a raw query copy', () => {
    const routes = freshRoutes([
      {
        path: '/strict',
        validateSearch: () => {
          throw new Error('invalid')
        },
      },
    ])
    expect(resolveRoute('/strict?a=1', routes).search).toEqual({ a: '1' })
  })

  it('dynamic-route validateSearch runs through the fast lane', () => {
    const routes = freshRoutes([
      {
        path: '/user/:id',
        validateSearch: (raw: Record<string, string>) => ({ tab: raw['tab'] ?? 'default' }),
      },
    ])
    expect(resolveRoute('/user/9?tab=posts', routes).search).toEqual({ tab: 'posts' })
  })
})
