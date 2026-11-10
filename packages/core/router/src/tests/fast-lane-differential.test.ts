/**
 * The fast lanes of `resolveRoute` must agree with the general lane.
 *
 * `resolveRoute` answers most URLs without the general split-and-decode
 * matcher: a raw static hit returns the route's cached result, a first-char
 * miss jumps to the wildcard, and a plain path is matched in place against
 * boundaries `scanPath` recorded. Each is a separate implementation of the same
 * question, so this suite fuzzes random nested route tables (params, optionals,
 * splats, aliases, `%`-encoded and literal-`?` statics, validators, not-found
 * layouts, wildcards) with random root-relative URLs (queries, hashes, `//`,
 * trailing slashes, encodings) and requires the same answer from
 * `_resolveGeneralForTest`, the general lane alone.
 */
import { _resolveGeneralForTest, resolveRoute } from '../match'
import type { ResolvedRoute, RouteRecord } from '../types'

const C = () => null

function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function view(r: ResolvedRoute) {
  return {
    path: r.path,
    params: { ...r.params },
    query: { ...r.query },
    hash: r.hash,
    // Identity of each matched record (the synthetic not-found leaf is fresh per resolve).
    matched: r.matched.map((m) => (m.path === '__pyreon_not_found_leaf__' ? 'NF' : m)),
    meta: r.meta,
    search: { ...r.search },
    isNotFound: r.isNotFound ?? false,
  }
}

describe('fast lanes agree with the general lane', () => {
  it('random tables × random root-relative URLs', () => {
    const rnd = makeRng(0x5eed1)
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T
    const statics = ['a', 'b', 'about', 'user', 'x', 'über', '%20', 'files', 'faq?', 'c%C3%A9', 'ab']
    const patternSeg = () => {
      const r = rnd()
      if (r < 0.5) return pick(statics)
      if (r < 0.75) return `:p${Math.floor(rnd() * 3)}`
      if (r < 0.85) return `:o${Math.floor(rnd() * 3)}?`
      return `:s${Math.floor(rnd() * 3)}*`
    }
    const table = (depth: number): RouteRecord[] => {
      const out: RouteRecord[] = []
      const n = 1 + Math.floor(rnd() * 5)
      for (let i = 0; i < n; i++) {
        let path = Array.from({ length: 1 + Math.floor(rnd() * 3) }, patternSeg).join('/')
        if (depth === 0 || rnd() < 0.2) path = `/${path}`
        if (rnd() < 0.05) path = '/'
        const r: RouteRecord = { path, component: C }
        if (rnd() < 0.2) r.meta = { m: i } as never
        if (rnd() < 0.1) r.validateSearch = (q: Record<string, string>) => ({ v: q.q ?? null })
        if (rnd() < 0.1) r.alias = `/al${i}`
        if (rnd() < 0.1) r.notFoundComponent = C
        if (depth < 2 && rnd() < 0.3) r.children = table(depth + 1)
        out.push(r)
      }
      if (depth === 0 && rnd() < 0.5) out.push({ path: rnd() < 0.5 ? '(.*)' : '*', component: C })
      return out
    }
    const urlSegs = ['a', 'b', 'about', 'user', 'x', 'über', '%20', 'files', '42', 'faq%3F', 'faq?', 'c%C3%A9', 'café', '', 'al0', 'al1', '%', 'ab']
    const url = () => {
      let p = `/${Array.from({ length: Math.floor(rnd() * 5) }, () => pick(urlSegs)).join('/')}`
      if (rnd() < 0.1) p += '/'
      if (rnd() < 0.2) p += `?q=${pick(['1', 'a%20b', '', 'x#y'])}`
      if (rnd() < 0.15) p += `#${pick(['h', '', 'a?b'])}`
      return p
    }

    let checked = 0
    for (let t = 0; t < 400; t++) {
      const routes = table(0)
      for (let j = 0; j < 50; j++) {
        const u = url()
        const fast = view(resolveRoute(u, routes))
        const general = view(_resolveGeneralForTest(u, routes))
        expect(fast, `url=${JSON.stringify(u)} routes=${JSON.stringify(routes)}`).toEqual(general)
        checked++
      }
    }
    expect(checked).toBe(20_000)
  })

  it('a static hit returns one frozen object per route, fresh ones once a query or hash is present', () => {
    const routes: RouteRecord[] = [
      { path: '/about', component: C },
      { path: '/admin', component: C, children: [{ path: 'dashboard', component: C }] },
    ]
    const a = resolveRoute('/about', routes)
    expect(resolveRoute('/about', routes)).toBe(a)
    expect(Object.isFrozen(a)).toBe(true)
    const nested = resolveRoute('/admin/dashboard', routes)
    expect(resolveRoute('/admin/dashboard', routes)).toBe(nested)
    expect(nested.matched).toEqual([routes[1], routes[1]?.children?.[0]])

    const withQuery = resolveRoute('/about?x=1', routes)
    expect(withQuery).not.toBe(a)
    expect(withQuery.query).toEqual({ x: '1' })
    expect(resolveRoute('/about#top', routes).hash).toBe('top')
  })

  it('a static route with validateSearch runs the validator on every resolve', () => {
    let calls = 0
    const routes: RouteRecord[] = [
      { path: '/search', component: C, validateSearch: () => ({ n: ++calls }) },
    ]
    expect(resolveRoute('/search', routes).search).toEqual({ n: 1 })
    expect(resolveRoute('/search', routes).search).toEqual({ n: 2 })
  })
})
