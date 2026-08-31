/**
 * Malformed percent-encoding must not throw out of the matcher.
 *
 * `decodeURIComponent` throws `URIError` on a lone `%`, `%zz`, or a truncated
 * multi-byte escape. Every decode in `match.ts` is applied to attacker-supplied
 * text, and the matcher is reached PRE-AUTH from `router.preload` inside the SSR
 * handler — so `GET /?q=%` was an unauthenticated 500 on every server-rendered
 * Pyreon app. One character, no auth, and a STATIC route: no dynamic parameter
 * is needed, because the QUERY parser decodes too.
 *
 * The matcher has no HTTP context and cannot answer 400, so an undecodable
 * segment resolves to its literal text. Well-formed input must be unaffected —
 * that is the assertion that keeps this from being "stop decoding".
 *
 * Bisect-verified: reverting `safeDecodeURIComponent` to a bare
 * `decodeURIComponent` fails these with `URIError: URI malformed`.
 */
import { describe, expect, it } from 'vitest'
import { parseQuery, parseQueryMulti, resolveRoute, matchPath } from '../match'
import type { RouteRecord } from '../types'

const C = () => null
const routes: RouteRecord[] = [
  { path: '/', component: C },
  { path: '/posts/:id', component: C },
  { path: '/posts/:id?', component: C },
  { path: '/files/:rest*', component: C },
]

describe('malformed percent-encoding does not throw', () => {
  it('a static route with a malformed QUERY still resolves', () => {
    // The shape that made this unauthenticated: no dynamic param involved.
    expect(() => resolveRoute('/?q=%', routes)).not.toThrow()
    expect(resolveRoute('/?q=%', routes).query).toEqual({ q: '%' })
  })

  it('an UNMATCHED path with a malformed query still resolves', () => {
    expect(() => resolveRoute('/nope?x=%', routes)).not.toThrow()
    expect(resolveRoute('/nope?x=%', routes).matched).toHaveLength(0)
  })

  it('a malformed dynamic PARAM resolves to its literal text', () => {
    expect(resolveRoute('/posts/%', routes).params).toEqual({ id: '%' })
    expect(resolveRoute('/posts/%zz', routes).params).toEqual({ id: '%zz' })
  })

  it('a malformed SPLAT segment resolves to its literal text', () => {
    expect(resolveRoute('/files/a/%E0%A4', routes).params).toEqual({ rest: 'a/%E0%A4' })
  })

  it('parseQuery / parseQueryMulti do not throw', () => {
    expect(parseQuery('q=%')).toEqual({ q: '%' })
    expect(parseQuery('%=v')).toEqual({ '%': 'v' })
    expect(parseQueryMulti('a=%&a=%zz')).toEqual({ a: ['%', '%zz'] })
  })

  it('matchPath does not throw on a malformed segment', () => {
    expect(matchPath('/posts/:id', '/posts/%')).toEqual({ id: '%' })
  })

  it('WELL-FORMED encoding still decodes (this is a guard, not a retreat)', () => {
    expect(resolveRoute('/posts/a%20b', routes).params).toEqual({ id: 'a b' })
    expect(resolveRoute('/files/x/a%2Fb', routes).params).toEqual({ rest: 'x/a/b' })
    expect(parseQuery('q=a%20b&r=c+d')).toEqual({ q: 'a b', r: 'c d' })
    expect(resolveRoute('/posts/%E2%9C%93', routes).params).toEqual({ id: '✓' })
  })
})
