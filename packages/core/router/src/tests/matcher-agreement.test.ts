/**
 * The two matchers must agree.
 *
 * `matchPath(pattern, path)` is the standalone matcher; `resolveRoute(path,
 * routes)` goes through the built route INDEX — a static map, a segment map
 * with per-bucket dispatch, and a first-char fail-fast mask. They are separate
 * implementations of one question, and only the first had real coverage:
 * optional segments, splats and non-ASCII segments are all exercised against
 * `matchPath` and none of them against the indexed path.
 *
 * A divergence is the worst kind of routing bug because it is invisible in
 * isolation. `matchPath('/user/:id?', '/user')` returning a match while the
 * app 404s the same URL reads as a config mistake, not a matcher bug, and the
 * unit test that would catch it passes.
 *
 * The non-ASCII cases have their own hazard. The index builds a 128-entry
 * first-char mask to reject impossible paths without walking the routes, and
 * it must DISABLE that mask when any route's first segment starts outside
 * ASCII. Miss that and `/über`, `/日本語`, `/café` become permanently
 * unreachable — a whole locale's routes 404 while the English ones work.
 */
import { matchPath, resolveRoute } from '../match'
import type { RouteRecord } from '../types'

const Page = () => null

/** Does the INDEXED path match, and with which params? */
function viaIndex(pattern: string, path: string): Record<string, string> | null {
  const routes: RouteRecord[] = [{ path: pattern, component: Page }]
  const r = resolveRoute(path, routes)
  return r.matched.length > 0 ? r.params : null
}

describe('matchPath and resolveRoute agree', () => {
  // Each row is (pattern, path). Both matchers must return the same verdict
  // and the same params — one saying yes while the other says no is the bug.
  const cases: Array<[string, string]> = [
    // plain statics
    ['/about', '/about'],
    ['/about', '/other'],
    ['/', '/'],
    // params
    ['/users/:id', '/users/42'],
    ['/users/:id', '/users'],
    ['/users/:id', '/users/42/extra'],
    ['/a/:x/b/:y', '/a/1/b/2'],
    // OPTIONAL trailing segments — covered against matchPath only
    ['/user/:id?', '/user/42'],
    ['/user/:id?', '/user'],
    ['/user/:id?', '/user/'],
    ['/a/:x?/:y?', '/a'],
    ['/a/:x?/:y?', '/a/1'],
    ['/a/:x?/:y?', '/a/1/2'],
    // splats — the syntax is `:name*`; `*name` is a literal segment, which is
    // worth keeping as a row of its own so a future syntax change is loud.
    ['/files/:path*', '/files/a/b/c'],
    ['/files/:path*', '/files'],
    ['/files/:path*', '/files/single'],
    ['/files/:path*', '/files/'],
    ['/files/*path', '/files/a/b/c'],
    // NON-ASCII segments — the first-char mask must not reject these
    ['/über', '/über'],
    ['/über/:id', '/über/7'],
    ['/日本語', '/日本語'],
    ['/café/menu', '/café/menu'],
    ['/über', '/uber'],
    // percent-encoded, which the mask comment calls out explicitly
    ['/%20space', '/%20space'],
  ]

  /**
   * Divergences that are REAL and not yet fixed.
   *
   * Found by this suite on its first run, so it is doing its job — but the fix
   * is an index change, not a test change, and it belongs in its own PR.
   * Masking it here keeps the rest of the matrix enforcing, which is the point:
   * a NEW divergence still fails.
   *
   * `/files/:path*` vs `/files` — a splat matches ZERO segments in
   * `matchPath` (returning `{ path: '' }`) and does not match at all through
   * the index. The mechanism is the index's segment-COUNT dispatch: the
   * pattern has two segments, the URL has one, so the bucket lookup misses and
   * the route is never considered. `/files/` diverges the same way.
   *
   * The user-visible shape is a catch-all that 404s its own root: a
   * `/docs/:path*` route intended to serve `/docs` plus everything under it
   * serves everything EXCEPT `/docs`. That reads as a config mistake, and the
   * unit test for the pattern passes.
   */
  const KNOWN_DIVERGENCES = new Set(['/files/:path* vs /files', '/files/:path* vs /files/'])

  for (const [pattern, path] of cases) {
    const known = KNOWN_DIVERGENCES.has(`${pattern} vs ${path}`)
    test(`${pattern}  vs  ${path}${known ? '  [known divergence]' : ''}`, () => {
      const direct = matchPath(pattern, path)
      const indexed = viaIndex(pattern, path)
      if (known) {
        // Assert the divergence STILL EXISTS. When it is fixed this fails, and
        // the remedy is to delete the entry — so the allowlist cannot rot into
        // hiding a regression that has since been repaired.
        expect(
          direct !== null && indexed === null,
          `${pattern} vs ${path} no longer diverges — remove it from KNOWN_DIVERGENCES`,
        ).toBe(true)
        return
      }
      expect(
        indexed === null,
        `matchPath says ${direct === null ? 'NO match' : 'match'} but the index says ` +
          `${indexed === null ? 'NO match' : 'match'} for ${pattern} vs ${path}`,
      ).toBe(direct === null)
      if (direct !== null && indexed !== null) {
        expect(indexed, 'both matchers must extract the same params').toEqual(direct)
      }
    })
  }
})

describe('the first-char mask must not exclude a real route', () => {
  test('a non-ASCII route stays reachable alongside ASCII siblings', () => {
    // The realistic shape: a localised route added to an existing tree. If the
    // mask is built from ASCII siblings and not disabled by the non-ASCII one,
    // the new route is unreachable and the old ones still work — which sends
    // you looking at the new route's config rather than at the index.
    const routes: RouteRecord[] = [
      { path: '/about', component: Page },
      { path: '/contact', component: Page },
      { path: '/über-uns', component: Page },
    ]
    expect(resolveRoute('/über-uns', routes).matched.length, '/über-uns must resolve').toBe(1)
    expect(resolveRoute('/about', routes).matched.length, 'ASCII siblings still work').toBe(1)
  })

  test('a non-ASCII DYNAMIC segment bucket is reachable too', () => {
    // The other mask loop reads the segment-map keys rather than the static
    // ones, so a dynamic route under a non-ASCII prefix exercises it.
    const routes: RouteRecord[] = [
      { path: '/about', component: Page },
      { path: '/日本語/:id', component: Page },
    ]
    const r = resolveRoute('/日本語/7', routes)
    expect(r.matched.length).toBe(1)
    expect(r.params).toEqual({ id: '7' })
  })

  test('an unmatched ASCII path is still rejected once the mask is disabled', () => {
    // Disabling the mask must not turn the matcher permissive — the fail-fast
    // is an optimisation, never the thing deciding correctness.
    const routes: RouteRecord[] = [
      { path: '/about', component: Page },
      { path: '/über', component: Page },
    ]
    expect(resolveRoute('/nothing-here', routes).matched.length).toBe(0)
  })
})

describe('path segmentation edges', () => {
  test('the root path has no segments to walk', () => {
    const routes: RouteRecord[] = [{ path: '/', component: Page }]
    expect(resolveRoute('/', routes).matched.length).toBe(1)
  })

  // Paths are ROOT-RELATIVE by contract. These two pin that rather than
  // assert a normalization the resolver deliberately does not do — a future
  // "helpful" fixup here would change which route a given href reaches, so
  // the current answer is worth holding still.
  test('a path with no leading slash does NOT match — callers pass root-relative paths', () => {
    const routes: RouteRecord[] = [{ path: '/about', component: Page }]
    expect(resolveRoute('about', routes).matched.length).toBe(0)
  })

  test('an empty path does NOT resolve as the root', () => {
    const routes: RouteRecord[] = [{ path: '/', component: Page }]
    expect(resolveRoute('', routes).matched.length).toBe(0)
  })
})
