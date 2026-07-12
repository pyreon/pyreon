// ─── Matcher-equivalence lock for the static fast path ───────────────────────
//
// `resolveRoute` splits the fragment + query FIRST, then O(1)-looks the
// cleaned path up in `index.staticMap` (byte-exact key), falling through to
// the fast/general segment lanes. These tests pin the seams where a static
// shortcut could diverge from the canonical split-then-decode behavior — the
// literal-'?' pattern, %-encoded static keys, trailing/double slashes, the
// empty path, query/hash preservation. If any fails after a matcher change,
// the change altered semantics, not just speed. (There is deliberately NO
// pre-split raw-path shortcut: probing the whole raw URL before the query
// split would return a literal-'?' route for `/faq?` where the canonical
// split-first matcher must treat the `?` as a query separator — see the
// literal-'?' spec below. The split-first `staticMap[cleanPath]` fast path
// is already O(1) and correct, so a raw-path variant buys ~two skipped
// `indexOf` calls at the cost of that divergence — not worth it.)
import { describe, expect, it } from 'vitest'
import { resolveRoute } from '../match'
import type { RouteRecord } from '../types'

const Noop = () => null

function table(): RouteRecord[] {
  return [
    { path: '/', component: Noop },
    { path: '/about', component: Noop },
    { path: '/admin', component: Noop, children: [{ path: 'dashboard', component: Noop }] },
    // Literal '?' in a static pattern — pathological but expressible. It
    // must NOT enter the raw-path shortcut (a raw URL's '?' is a query
    // separator; only the %-encoded form can reach this route).
    { path: '/faq?', component: Noop },
    // %-encoded static pattern — stored raw; matches the identical raw URL.
    { path: '/caf%C3%A9', component: Noop },
    {
      path: '/search',
      component: Noop,
      validateSearch: (raw) => ({ q: raw.q ?? '', page: Number(raw.page ?? 1) }),
    },
    { path: '/user/:id', component: Noop },
    { path: '(.*)', component: Noop },
  ]
}

describe('raw static short-circuit — equivalence seams', () => {
  it('clean static path: canonical result shape (empty params/query/hash)', () => {
    const routes = table()
    const r = resolveRoute('/about', routes)
    expect(r.path).toBe('/about')
    expect(r.matched[r.matched.length - 1]).toBe(routes[1])
    expect(r.params).toEqual({})
    expect(r.query).toEqual({})
    expect(r.hash).toBe('')
    expect(r.search).toEqual({})
  })

  it('nested clean static path resolves the full chain', () => {
    const routes = table()
    const r = resolveRoute('/admin/dashboard', routes)
    expect(r.matched.map((m) => m.path)).toEqual(['/admin', 'dashboard'])
  })

  it('static path WITH query still parses the query (split path preserved)', () => {
    const routes = table()
    const r = resolveRoute('/about?tab=team&x=1', routes)
    expect(r.path).toBe('/about')
    expect(r.matched[r.matched.length - 1]).toBe(routes[1])
    expect(r.query).toEqual({ tab: 'team', x: '1' })
  })

  it('static path WITH hash keeps the fragment out of path and query', () => {
    const routes = table()
    const r = resolveRoute('/about?tab=x#bio', routes)
    expect(r.path).toBe('/about')
    expect(r.query).toEqual({ tab: 'x' })
    expect(r.hash).toBe('bio')
  })

  it('validateSearch runs against the (empty) query on a clean static hit', () => {
    const routes = table()
    const r = resolveRoute('/search', routes)
    expect(r.search).toEqual({ q: '', page: 1 })
    const r2 = resolveRoute('/search?q=react&page=3', routes)
    expect(r2.search).toEqual({ q: 'react', page: 3 })
  })

  it("literal '?' static pattern is only reachable byte-exactly — both raw and %-encoded URLs fall to the wildcard", () => {
    const routes = table()
    // '/faq?' — the '?' is a query separator; cleanPath '/faq' matches no
    // static route → falls to the catch-all.
    const viaRaw = resolveRoute('/faq?', routes)
    expect(viaRaw.path).toBe('/faq')
    expect(viaRaw.matched[viaRaw.matched.length - 1]?.path).toBe('(.*)')
    // '/faq%3F' ALSO falls to the wildcard. A static route authored with a
    // char that must be %-encoded in a URL ('/faq?') is reachable ONLY
    // byte-exactly via the O(1) staticMap (key '/faq?') — and a byte-exact
    // '/faq?' URL is impossible (the '?' splits the query). The general lane
    // keys its segment bucket on the route's RAW first segment ('faq?') and
    // dispatches on the URL's UNDECODED first segment ('faq%3F') BEFORE any
    // per-segment decode, so the two never meet. This is the canonical
    // matcher's long-standing behavior — a literal special char in a static
    // PATTERN is pathological; author '/faq' or a `:param` instead.
    const viaEncoded = resolveRoute('/faq%3F', routes)
    expect(viaEncoded.matched[viaEncoded.matched.length - 1]?.path).toBe('(.*)')
  })

  it('%-encoded static pattern matches its identical raw URL byte-for-byte', () => {
    const routes = table()
    const r = resolveRoute('/caf%C3%A9', routes)
    expect(r.matched[r.matched.length - 1]?.path).toBe('/caf%C3%A9')
  })

  it('trailing slash / double slash / empty path keep their canonical behavior', () => {
    const routes = table()
    // Trailing slash — misses the byte-exact staticMap ('/about'), takes the
    // general lane; splitPath drops the trailing empty segment → ['about'],
    // so it matches '/about' exactly like the split-based matcher (locked by
    // match-fastlane.test.ts "trailing slash matches like the split-based
    // matcher").
    const trailing = resolveRoute('/about/', routes)
    expect(trailing.matched[trailing.matched.length - 1]?.path).toBe('/about')
    // Double slash — general lane splits + filters empty segments → matches.
    const doubled = resolveRoute('//about', routes)
    expect(doubled.matched[doubled.matched.length - 1]?.path).toBe('/about')
    // Empty path — resolves like the pre-optimization code (catch-all).
    const empty = resolveRoute('', routes)
    expect(empty.matched[empty.matched.length - 1]?.path).toBe('(.*)')
  })

  it('dynamic paths are unaffected (params + decode)', () => {
    const routes = table()
    expect(resolveRoute('/user/42', routes).params).toEqual({ id: '42' })
    expect(resolveRoute('/user/a%20b', routes).params).toEqual({ id: 'a b' })
    expect(resolveRoute('/user/42?x=1#y', routes).params).toEqual({ id: '42' })
  })

  it('fresh query object per resolve when a query exists (callers may mutate)', () => {
    const routes = table()
    const a = resolveRoute('/about?x=1', routes)
    const b = resolveRoute('/about?x=1', routes)
    expect(a.query).not.toBe(b.query)
  })
})
