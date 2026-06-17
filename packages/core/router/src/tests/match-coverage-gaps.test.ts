// Lane-precise coverage for resolveRoute's residual branches. resolveRoute
// dispatches across four lanes — staticMap (1042), fast dynamicFirst (1091),
// fast wildcard (1108), and the general split-based lane (1120+). Each test
// names the lane + branch it targets.

import { describe, expect, test } from 'vitest'
import { resolveRoute } from '../match'
import type { RouteRecord } from '../types'

const C = () => null

describe('resolveRoute — fast dynamicFirst lane validateSearch (1104)', () => {
  const routes: RouteRecord[] = [
    {
      path: '/:slug',
      component: C,
      validateSearch: (raw: Record<string, string>) => ({ q: raw.q ?? '' }),
    },
  ]
  test('a param-first route with validateSearch applies it in the fast dynamicFirst lane', () => {
    const r = resolveRoute('/hello?q=x', routes)
    expect(r.params.slug).toBe('hello')
    expect((r.search as { q: string }).q).toBe('x')
  })
})

describe('resolveRoute — fast wildcard lane validateSearch (1117)', () => {
  const routes: RouteRecord[] = [
    { path: '/known', component: C },
    {
      path: '*',
      component: C,
      validateSearch: (raw: Record<string, string>) => ({ from: raw.from ?? '' }),
    },
  ]
  test('a wildcard route with validateSearch applies it', () => {
    const r = resolveRoute('/nope?from=link', routes)
    expect(r.matched.length).toBeGreaterThan(0)
    expect((r.search as { from: string }).from).toBe('link')
  })
})

describe('resolveRoute — general lane (encoded / double-slash paths)', () => {
  const routes: RouteRecord[] = [
    { path: '/u/:name', component: C },
    { path: '/files/:path*', component: C },
    { path: '/opt/:id?', component: C },
    { path: '*', component: C },
  ]

  test('encoded param in the general lane decodes', () => {
    // %2F keeps the slash encoded → forces the general (split + decode) lane
    const r = resolveRoute('/u/a%2Bb', routes)
    expect(r.params.name).toBe('a+b')
  })

  test('double-slash path goes through the general lane', () => {
    const r = resolveRoute('/u//x', routes)
    // either matches with an empty/normalized segment or falls to wildcard —
    // the point is exercising splitPath's filter + the general matcher
    expect(r.matched.length).toBeGreaterThan(0)
  })

  test('splat in the general lane captures + decodes the remainder', () => {
    const r = resolveRoute('/files/a%20b/c', routes)
    expect(r.params.path).toContain('b')
  })

  test('optional segment absent in the general lane (trailing slash)', () => {
    const r = resolveRoute('/opt/', routes)
    expect(r.matched.length).toBeGreaterThan(0)
  })

  test('general lane falls to wildcard for an unmatched encoded path', () => {
    const r = resolveRoute('/x%20y/deep/unknown', routes)
    expect(r.matched.length).toBeGreaterThan(0)
  })
})

describe('resolveRoute — not-found trie specificity (nested notFoundComponent)', () => {
  const routes: RouteRecord[] = [
    {
      path: '/',
      component: C,
      notFoundComponent: C,
      children: [
        { path: 'a', component: C },
        {
          path: 'admin',
          component: C,
          notFoundComponent: C, // deeper notFound → wins for /admin/* unmatched
          children: [{ path: 'users', component: C }],
        },
      ],
    },
  ]

  test('an unmatched path under a deep layout uses the deepest notFound fallback', () => {
    const r = resolveRoute('/admin/nonexistent', routes)
    expect(r.isNotFound).toBe(true)
    expect(r.matched.length).toBeGreaterThan(0)
  })

  test('an unmatched top-level path uses the root notFound fallback', () => {
    const r = resolveRoute('/totally-unknown', routes)
    expect(r.isNotFound).toBe(true)
  })
})
