import {
  buildNameIndex,
  buildPath,
  findRouteByName,
  matchPath,
  parseQuery,
  parseQueryMulti,
  resolveRoute,
  stringifyQuery,
} from '../match'
// Importing from components.tsx triggers the module-load side-effect that
// registers DefaultChromeLayout with match.ts (via _setDefaultChromeLayout).
// Without this import, the layout-less fallback in findNotFoundFallback
// returns null because no chrome layout is registered. Tests below verify
// the registered layout is used as the synthetic chain's first entry.
import { DefaultChromeLayout } from '../components'
import type { RouteRecord } from '../types'

const Home = () => null
const About = () => null
const User = () => null
const NotFound = () => null

// ─── parseQuery — edge cases ─────────────────────────────────────────────────

describe('parseQuery — edge cases', () => {
  test('handles URI-encoded keys', () => {
    expect(parseQuery('hello%20world=value')).toEqual({ 'hello world': 'value' })
  })

  test('handles multiple equals signs in value', () => {
    // Only the first `=` is the delimiter
    expect(parseQuery('expr=a=b')).toEqual({ expr: 'a=b' })
  })

  test('last value wins for duplicate keys', () => {
    expect(parseQuery('a=1&a=2')).toEqual({ a: '2' })
  })

  test('handles empty key (skipped)', () => {
    // "=value" has empty key, should be skipped
    expect(parseQuery('=value')).toEqual({})
  })

  test('handles key-only entry with no equals', () => {
    expect(parseQuery('active')).toEqual({ active: '' })
  })

  test('handles mixed entries', () => {
    expect(parseQuery('a=1&flag&b=2')).toEqual({ a: '1', flag: '', b: '2' })
  })

  test('decodes both keys and values', () => {
    expect(parseQuery('na%2Fme=val%26ue')).toEqual({ 'na/me': 'val&ue' })
  })
})

// ─── parseQueryMulti ─────────────────────────────────────────────────────────

describe('parseQueryMulti', () => {
  test('returns empty object for empty string', () => {
    expect(parseQueryMulti('')).toEqual({})
  })

  test('single value stays as string', () => {
    expect(parseQueryMulti('color=red')).toEqual({ color: 'red' })
  })

  test('duplicate keys become arrays', () => {
    expect(parseQueryMulti('color=red&color=blue')).toEqual({ color: ['red', 'blue'] })
  })

  test('triple duplicate keys become array of three', () => {
    expect(parseQueryMulti('a=1&a=2&a=3')).toEqual({ a: ['1', '2', '3'] })
  })

  test('mixed single and multi values', () => {
    expect(parseQueryMulti('color=red&color=blue&size=lg')).toEqual({
      color: ['red', 'blue'],
      size: 'lg',
    })
  })

  test('key without value', () => {
    expect(parseQueryMulti('flag')).toEqual({ flag: '' })
  })

  test('key without value duplicated', () => {
    expect(parseQueryMulti('flag&flag')).toEqual({ flag: ['', ''] })
  })

  test('empty key is skipped', () => {
    expect(parseQueryMulti('=value')).toEqual({})
  })

  test('decodes URI-encoded keys and values', () => {
    expect(parseQueryMulti('na%2Fme=val%26ue')).toEqual({ 'na/me': 'val&ue' })
  })
})

// ─── stringifyQuery — edge cases ─────────────────────────────────────────────

describe('stringifyQuery — edge cases', () => {
  test('encodes special characters', () => {
    const result = stringifyQuery({ 'key with space': 'value&more' })
    expect(result).toBe('?key%20with%20space=value%26more')
  })

  test('handles single key-value pair', () => {
    expect(stringifyQuery({ page: '1' })).toBe('?page=1')
  })

  test('handles key with empty value', () => {
    expect(stringifyQuery({ debug: '' })).toBe('?debug')
  })
})

// ─── matchPath — edge cases ──────────────────────────────────────────────────

describe('matchPath — edge cases', () => {
  test('splat param captures remaining path', () => {
    const result = matchPath('/files/:path*', '/files/a/b/c')
    expect(result).toEqual({ path: 'a/b/c' })
  })

  test('splat param captures single segment', () => {
    const result = matchPath('/files/:path*', '/files/readme.txt')
    expect(result).toEqual({ path: 'readme.txt' })
  })

  test('optional param matches with value', () => {
    const result = matchPath('/user/:id?', '/user/42')
    expect(result).toEqual({ id: '42' })
  })

  test('optional param matches without value', () => {
    const result = matchPath('/user/:id?', '/user')
    expect(result).toEqual({})
  })

  test('returns null for too many path segments', () => {
    expect(matchPath('/a/b', '/a/b/c')).toBeNull()
  })

  test('exact static match returns empty params', () => {
    expect(matchPath('/about', '/about')).toEqual({})
  })

  test('root path matches root pattern', () => {
    expect(matchPath('/', '/')).toEqual({})
  })

  test('mismatched static segment returns null', () => {
    expect(matchPath('/foo', '/bar')).toBeNull()
  })

  test('decodes URI-encoded segments', () => {
    const result = matchPath('/user/:name', '/user/hello%20world')
    expect(result).toEqual({ name: 'hello world' })
  })

  test('multiple params in a row', () => {
    const result = matchPath('/:a/:b/:c', '/x/y/z')
    expect(result).toEqual({ a: 'x', b: 'y', c: 'z' })
  })
})

// ─── resolveRoute — edge cases ───────────────────────────────────────────────

describe('resolveRoute — edge cases', () => {
  const routes: RouteRecord[] = [
    { path: '/', component: Home },
    { path: '/about', component: About },
    { path: '/user/:id', component: User },
    {
      path: '/admin',
      component: Home,
      meta: { requiresAuth: true },
      children: [
        { path: 'users', component: User },
        { path: 'settings', component: About },
      ],
    },
    { path: '*', component: NotFound },
  ]

  test('resolves root path with empty query', () => {
    const r = resolveRoute('/', routes)
    expect(r.path).toBe('/')
    expect(r.params).toEqual({})
    expect(r.query).toEqual({})
    expect(r.hash).toBe('')
  })

  test('a ? inside the fragment belongs to the hash (WHATWG order)', () => {
    // Everything after '#' is the fragment — a '?' inside it is NOT a
    // query separator. (The pre-fix parser split '?' first and misread
    // 'key=val' as query.)
    const r = resolveRoute('/about#section?key=val', routes)
    expect(r.path).toBe('/about')
    expect(r.hash).toBe('section?key=val')
    expect(r.query).toEqual({})
  })

  test('standard ?query#hash order splits cleanly', () => {
    // /about?key=val#section — query between '?' and '#', fragment after
    // '#'. (Pre-fix the hash leaked into the query value: 'val#section'.)
    const r = resolveRoute('/about?key=val#section', routes)
    expect(r.path).toBe('/about')
    expect(r.hash).toBe('section')
    expect(r.query.key).toBe('val')
  })

  test('resolves nested route with merged meta', () => {
    const r = resolveRoute('/admin/users', routes)
    expect(r.matched.length).toBe(2)
    expect(r.meta.requiresAuth).toBe(true)
  })

  test('resolves dynamic param route', () => {
    const r = resolveRoute('/user/123', routes)
    expect(r.params.id).toBe('123')
    expect(r.matched.length).toBeGreaterThan(0)
  })

  test('wildcard catches unmatched paths', () => {
    const r = resolveRoute('/totally/unknown/path', routes)
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFound)
  })

  test('returns empty matched for no match without wildcard', () => {
    const simpleRoutes: RouteRecord[] = [
      { path: '/', component: Home },
      { path: '/about', component: About },
    ]
    const r = resolveRoute('/nonexistent', simpleRoutes)
    expect(r.matched).toHaveLength(0)
  })

  test('root path with ?-bearing fragment keeps it all in the hash', () => {
    const r = resolveRoute('/#anchor?key=val', routes)
    expect(r.hash).toBe('anchor?key=val')
    expect(r.query).toEqual({})
  })

  test('resolves deeply nested routes', () => {
    const deepRoutes: RouteRecord[] = [
      {
        path: '/a',
        component: Home,
        children: [
          {
            path: 'b',
            component: About,
            children: [{ path: 'c', component: User }],
          },
        ],
      },
    ]
    const r = resolveRoute('/a/b/c', deepRoutes)
    expect(r.matched.length).toBe(3)
  })

  test('optional param route matches with and without param', () => {
    const optRoutes: RouteRecord[] = [{ path: '/page/:slug?', component: Home }]
    const withParam = resolveRoute('/page/about', optRoutes)
    expect(withParam.params.slug).toBe('about')

    const withoutParam = resolveRoute('/page', optRoutes)
    expect(withoutParam.matched.length).toBeGreaterThan(0)
  })

  test('splat route captures all remaining segments', () => {
    const splatRoutes: RouteRecord[] = [{ path: '/docs/:rest*', component: Home }]
    const r = resolveRoute('/docs/api/reference/types', splatRoutes)
    expect(r.params.rest).toBe('api/reference/types')
  })

  // Splat captureSplat fast path: when no segment contains '%', the
  // builder concatenates directly without allocating an intermediate array
  // or calling decodeURIComponent. This pair of tests locks both branches
  // — single-segment + multi-segment clean paths exercise the fast path;
  // %-encoded segments exercise the slow path. Both must produce
  // byte-identical output regardless of which branch fires. If anyone
  // breaks this in pursuit of more aggressive optimization, these tests
  // surface the regression before it ships.
  test('splat captureSplat fast path — clean multi-segment path', () => {
    const splatRoutes: RouteRecord[] = [{ path: '/files/:path*', component: Home }]
    const r = resolveRoute('/files/docs/2024/report.pdf', splatRoutes)
    expect(r.params.path).toBe('docs/2024/report.pdf')
  })

  test('splat captureSplat fast path — single trailing segment', () => {
    const splatRoutes: RouteRecord[] = [{ path: '/files/:path*', component: Home }]
    const r = resolveRoute('/files/readme.txt', splatRoutes)
    expect(r.params.path).toBe('readme.txt')
  })

  test('splat captureSplat slow path — %-encoded segments decoded', () => {
    const splatRoutes: RouteRecord[] = [{ path: '/files/:path*', component: Home }]
    // Mixed clean + encoded: 'docs' clean, 'my%20file.txt' encoded, 'v1' clean
    const r = resolveRoute('/files/docs/my%20file.txt/v1', splatRoutes)
    expect(r.params.path).toBe('docs/my file.txt/v1')
  })

  test('splat captureSplat slow path — all-encoded segments', () => {
    const splatRoutes: RouteRecord[] = [{ path: '/files/:path*', component: Home }]
    const r = resolveRoute('/files/a%2Fb/c%20d/e%26f', splatRoutes)
    // Each segment is decoded independently and joined with '/'
    expect(r.params.path).toBe('a/b/c d/e&f')
  })

  test('caches compiled routes (same reference gives same result)', () => {
    const r1 = resolveRoute('/about', routes)
    const r2 = resolveRoute('/about', routes)
    expect(r1.path).toBe(r2.path)
    expect(r1.matched.length).toBe(r2.matched.length)
  })
})

// ─── resolveRoute — alias support ────────────────────────────────────────────

describe('resolveRoute — alias', () => {
  test('alias string resolves to same component', () => {
    const aliasRoutes: RouteRecord[] = [
      { path: '/user/:id', alias: '/profile/:id', component: User },
    ]
    const r = resolveRoute('/profile/42', aliasRoutes)
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.matched[0]?.component).toBe(User)
    expect(r.params.id).toBe('42')
  })

  test('alias array resolves multiple paths to same component', () => {
    const aliasRoutes: RouteRecord[] = [
      { path: '/home', alias: ['/index', '/main'], component: Home },
    ]
    const r1 = resolveRoute('/index', aliasRoutes)
    const r2 = resolveRoute('/main', aliasRoutes)
    expect(r1.matched[0]?.component).toBe(Home)
    expect(r2.matched[0]?.component).toBe(Home)
  })

  test('primary path still works with alias defined', () => {
    const aliasRoutes: RouteRecord[] = [{ path: '/home', alias: '/index', component: Home }]
    const r = resolveRoute('/home', aliasRoutes)
    expect(r.matched[0]?.component).toBe(Home)
  })
})

// ─── buildPath — edge cases ──────────────────────────────────────────────────

describe('buildPath — edge cases', () => {
  test('omits segment for missing optional param', () => {
    const result = buildPath('/user/:id?', {})
    expect(result).toBe('/user')
  })

  test('includes segment for provided optional param', () => {
    const result = buildPath('/user/:id?', { id: '42' })
    expect(result).toBe('/user/42')
  })

  test('splat param preserves slashes', () => {
    // buildPath regex captures the full param name including * via [^/]+
    // so the key in params must match what the regex captures
    const result = buildPath('/docs/:path*', { 'path*': 'api/reference/types' })
    expect(result).toBe('/docs/api/reference/types')
  })

  test('encodes special characters in params', () => {
    const result = buildPath('/user/:name', { name: 'hello world' })
    expect(result).toBe('/user/hello%20world')
  })

  test('handles path with no params', () => {
    const result = buildPath('/about', {})
    expect(result).toBe('/about')
  })

  test('handles root path', () => {
    const result = buildPath('/', {})
    expect(result).toBe('/')
  })

  test('encodes splat param segments individually', () => {
    // buildPath regex captures full param name including * via [^/]+
    const result = buildPath('/files/:path*', { 'path*': 'dir/my file.txt' })
    expect(result).toBe('/files/dir/my%20file.txt')
  })
})

// ─── findRouteByName — edge cases ────────────────────────────────────────────

describe('findRouteByName — edge cases', () => {
  test('finds deeply nested route', () => {
    const routes: RouteRecord[] = [
      {
        path: '/a',
        component: Home,
        children: [
          {
            path: 'b',
            component: About,
            children: [{ path: 'c', component: User, name: 'deep' }],
          },
        ],
      },
    ]
    const found = findRouteByName('deep', routes)
    expect(found).not.toBeNull()
    expect(found?.path).toBe('c')
  })

  test('returns first match in definition order', () => {
    const routes: RouteRecord[] = [
      { path: '/first', component: Home, name: 'dup' },
      { path: '/second', component: About, name: 'dup' },
    ]
    const found = findRouteByName('dup', routes)
    expect(found?.path).toBe('/first')
  })

  test('returns null for empty routes array', () => {
    expect(findRouteByName('anything', [])).toBeNull()
  })
})

// ─── buildNameIndex — edge cases ─────────────────────────────────────────────

describe('buildNameIndex — edge cases', () => {
  test('handles empty routes', () => {
    const index = buildNameIndex([])
    expect(index.size).toBe(0)
  })

  test('does not index routes without names', () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      { path: '/about', component: About },
    ]
    const index = buildNameIndex(routes)
    expect(index.size).toBe(0)
  })

  test('indexes deeply nested named routes', () => {
    const routes: RouteRecord[] = [
      {
        path: '/a',
        component: Home,
        name: 'a',
        children: [
          {
            path: 'b',
            component: About,
            name: 'b',
            children: [{ path: 'c', component: User, name: 'c' }],
          },
        ],
      },
    ]
    const index = buildNameIndex(routes)
    expect(index.size).toBe(3)
    expect(index.get('c')?.path).toBe('c')
  })
})

// ─── resolveRoute — dynamic first segment ────────────────────────────────────

describe('resolveRoute — dynamic first segment routing', () => {
  test('matches route where first segment is a param', () => {
    const routes: RouteRecord[] = [{ path: '/:lang/about', component: About }]
    const r = resolveRoute('/en/about', routes)
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.params.lang).toBe('en')
  })

  test('static routes take priority over dynamic first segment', () => {
    const routes: RouteRecord[] = [
      { path: '/about', component: About },
      { path: '/:slug', component: User },
    ]
    const r = resolveRoute('/about', routes)
    expect(r.matched[0]?.component).toBe(About)
  })
})

// ─── resolveRoute — wildcard children ────────────────────────────────────────

describe('resolveRoute — wildcard patterns', () => {
  test('(.*) catches any path', () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      { path: '(.*)', component: NotFound },
    ]
    const r = resolveRoute('/any/path/here', routes)
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFound)
  })

  test('* catches any path', () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      { path: '*', component: NotFound },
    ]
    const r = resolveRoute('/any/path/here', routes)
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFound)
  })
})

// ─── + as space in query parsing (application/x-www-form-urlencoded) ────────

describe('parseQuery — + as space', () => {
  it('decodes + as space in values', () => {
    expect(parseQuery('name=john+doe')).toEqual({ name: 'john doe' })
  })

  it('decodes + as space in keys', () => {
    expect(parseQuery('first+name=Alice')).toEqual({ 'first name': 'Alice' })
  })

  it('handles mixed + and %20', () => {
    expect(parseQuery('a=hello+world&b=foo%20bar')).toEqual({
      a: 'hello world',
      b: 'foo bar',
    })
  })

  it('handles multiple + in a value', () => {
    expect(parseQuery('q=one+two+three')).toEqual({ q: 'one two three' })
  })
})

describe('parseQueryMulti — + as space', () => {
  it('decodes + as space in values', () => {
    expect(parseQueryMulti('tag=hello+world&tag=foo+bar')).toEqual({
      tag: ['hello world', 'foo bar'],
    })
  })
})

// ─── resolveRoute — notFoundComponent fallback (PR L5) ───────────────────────
//
// When a URL doesn't match any route AND a parent record has a
// `notFoundComponent`, resolveRoute builds a synthetic matched chain
// `[...ancestors, parentLayout, syntheticLeaf]` so the not-found
// component renders INSIDE its ancestor layouts' chrome.

describe('resolveRoute — notFoundComponent fallback', () => {
  const Layout = () => null
  const NotFoundPage = () => null

  it('synthesises chain through root layout when URL is unmatched', () => {
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundPage,
        children: [
          { path: '/', component: Home },
          { path: '/about', component: About },
        ],
      },
    ]

    const r = resolveRoute('/this-does-not-exist', routes)
    expect(r.isNotFound).toBe(true)
    // Chain: [rootLayout, syntheticLeaf]. The synthetic leaf carries
    // NotFoundPage as its component so the deepest RouterView resolves it.
    expect(r.matched.length).toBe(2)
    expect(r.matched[0]?.component).toBe(Layout)
    expect(r.matched[1]?.component).toBe(NotFoundPage)
    expect(r.matched[1]?.path).toBe('__pyreon_not_found_leaf__')
  })

  it('returns empty matched when no notFoundComponent anywhere', () => {
    const routes: RouteRecord[] = [
      { path: '/', component: Home },
      { path: '/about', component: About },
    ]

    const r = resolveRoute('/unknown', routes)
    expect(r.isNotFound).toBeUndefined()
    expect(r.matched.length).toBe(0)
  })

  it('does not trigger fallback for matched routes', () => {
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundPage,
        children: [{ path: '/about', component: About }],
      },
    ]

    const r = resolveRoute('/about', routes)
    expect(r.isNotFound).toBeUndefined()
    expect(r.matched).not.toContain(NotFoundPage)
  })

  it('picks the DEEPEST matching parent when nested layouts have notFoundComponent', () => {
    const DeNotFound = () => null
    const RootNotFound = () => null
    const DeLayout = () => null
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: RootNotFound,
        children: [
          {
            path: '/de',
            component: DeLayout,
            notFoundComponent: DeNotFound,
            children: [{ path: '/de/about', component: About }],
          },
        ],
      },
    ]

    // URL under /de prefix — should pick the DEEPER /de layout's notFound,
    // not the root's
    const r = resolveRoute('/de/unknown', routes)
    expect(r.isNotFound).toBe(true)
    expect(r.matched[r.matched.length - 1]?.component).toBe(DeNotFound)
    // URL under root only — should fall back to root layout's notFound
    const r2 = resolveRoute('/about-typo', routes)
    expect(r2.isNotFound).toBe(true)
    expect(r2.matched[r2.matched.length - 1]?.component).toBe(RootNotFound)
  })

  it('respects segment boundary in path-prefix match (no substring confusion)', () => {
    const EnNotFound = () => null
    const routes: RouteRecord[] = [
      {
        path: '/en',
        component: Layout,
        notFoundComponent: EnNotFound,
        children: [],
      },
    ]

    // `/encyclopedia` MUST NOT match `/en` as a prefix — full segment boundary required.
    const r = resolveRoute('/encyclopedia', routes)
    expect(r.isNotFound).toBeUndefined()
    expect(r.matched.length).toBe(0)
  })

  it('non-matching URL under a layout prefix triggers fallback (deeper than root)', () => {
    const routes: RouteRecord[] = [
      {
        path: '/admin',
        component: Layout,
        notFoundComponent: NotFoundPage,
        children: [{ path: '/admin/users', component: User }],
      },
    ]

    // `/admin/missing` doesn't match `/admin` (layout itself) OR `/admin/users`
    // → notFoundComponent fallback applies, chain wraps the admin layout
    const r = resolveRoute('/admin/missing', routes)
    expect(r.isNotFound).toBe(true)
    expect(r.matched[0]?.component).toBe(Layout)
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFoundPage)
  })

  it('synthetic leaf has the right path marker (for runtime identification)', () => {
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundPage,
        children: [{ path: '/', component: Home }],
      },
    ]
    const r = resolveRoute('/unknown', routes)
    expect(r.matched[r.matched.length - 1]?.path).toBe('__pyreon_not_found_leaf__')
  })

  it('preserves query string on the synthetic 404 resolution', () => {
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundPage,
        children: [{ path: '/', component: Home }],
      },
    ]
    const r = resolveRoute('/unknown?foo=bar', routes)
    expect(r.isNotFound).toBe(true)
    expect(r.query).toEqual({ foo: 'bar' })
    expect(r.path).toBe('/unknown')
  })

  it('fires fallback via DefaultChromeLayout when the only notFoundComponent is on a page record without children', () => {
    // PR B (layout-less app fallback): page-level `notFoundComponent` now
    // gets wrapped in a synthetic `DefaultChromeLayout` (`<main data-
    // pyreon-default-chrome>`) so the render pipeline produces semantic-
    // HTML output instead of bare component markup. Pre-PR-B the resolver
    // returned an empty chain here — the standalone-render path in the
    // SSG plugin / runtime handler would render the component bare with
    // no wrapping (the documented "no chrome" limitation).
    //
    // Tests in the `layout-less app fallback (PR B)` describe block
    // below cover the synthetic chain shape in detail.
    const PageOnly = () => null
    const routes: RouteRecord[] = [
      { path: '/', component: PageOnly, notFoundComponent: NotFoundPage },
    ]
    const r = resolveRoute('/unknown', routes)
    expect(r.isNotFound).toBe(true)
    // Synthetic chain: [DefaultChromeLayout, syntheticLeaf]
    expect(r.matched).toHaveLength(2)
    expect(r.matched[0]?.component).toBe(DefaultChromeLayout)
    expect(r.matched[1]?.component).toBe(NotFoundPage)
  })

  it('does NOT fire when wildcard catch-all is configured', () => {
    const Catchall = () => null
    const routes: RouteRecord[] = [
      { path: '/', component: Home, notFoundComponent: NotFoundPage },
      { path: '(.*)', component: Catchall },
    ]

    // Wildcard catches everything first — notFoundComponent fallback never runs.
    const r = resolveRoute('/unknown', routes)
    expect(r.isNotFound).toBeUndefined()
    expect(r.matched[0]?.component).toBe(Catchall)
  })

  // ─── Layout-less app fallback (PR B) ───────────────────────────────────────
  //
  // When the user has a page-level `notFoundComponent` (`_404.tsx` at the
  // route root without a wrapping `_layout.tsx`), the resolver synthesizes
  // a chain `[DefaultChromeLayout, syntheticLeaf]` so the render pipeline
  // produces 404 HTML wrapped in `<main data-pyreon-default-chrome>`.
  //
  // These tests import `./components` so the setter call at the bottom of
  // components.tsx runs and registers `DefaultChromeLayout` with match.ts.
  // Without that import, `_defaultChromeLayout` would be null and the
  // fallback returns null (graceful degradation to the standalone-render
  // path). The import happens at the top of the test file via the
  // top-level `import` chain — describe block doesn't need to do anything.
  describe('layout-less app fallback (PR B)', () => {
    it('synthesizes a [DefaultChromeLayout, syntheticLeaf] chain when only a page record has notFoundComponent', () => {
      const Index = () => null
      const NotFound = () => null
      const routes: RouteRecord[] = [
        { path: '/', component: Index, notFoundComponent: NotFound },
      ]
      const r = resolveRoute('/missing', routes)
      expect(r.isNotFound).toBe(true)
      // Chain shape: [synthetic chrome layout, synthetic leaf]
      expect(r.matched).toHaveLength(2)
      // First entry is the synthetic chrome layout (with the
      // page's `fullPath` carried for downstream identification).
      expect(r.matched[0]?.path).toBe('/')
      expect(typeof r.matched[0]?.component).toBe('function')
      // Second entry is the synthetic leaf with the user's notFoundComponent.
      expect(r.matched[1]?.component).toBe(NotFound)
    })

    it('the synthetic chrome layout wraps the leaf in <main data-pyreon-default-chrome>', () => {
      // Render the chain through the actual default chrome component to
      // confirm the `<main>` wrapper materializes. The component reads
      // RouterContext to render its inner RouterView, so we need a
      // minimal harness — easiest path is to verify it's the DefaultChromeLayout
      // we exported from components.tsx (identity check).
      const NotFound = () => null
      const routes: RouteRecord[] = [
        { path: '/', component: () => null, notFoundComponent: NotFound },
      ]
      const r = resolveRoute('/missing', routes)
      // Identity-check: the synthetic layout's component IS the registered
      // DefaultChromeLayout. Avoids re-rendering — the runtime render path
      // is covered by the verify-modes / e2e cells.
      expect(r.matched[0]?.component).toBe(DefaultChromeLayout)
    })

    it('layout-with-notFoundComponent still wins over a page-level one (same urlPath)', () => {
      // Both layout AND page have notFoundComponent. The layout-first
      // logic from PR L5 still applies — page-level is ONLY the fallback.
      const PageNotFound = () => null
      const LayoutNotFound = () => null
      const routes: RouteRecord[] = [
        {
          path: '/',
          component: () => null,
          notFoundComponent: LayoutNotFound,
          children: [
            { path: '/page', component: () => null, notFoundComponent: PageNotFound },
          ],
        },
      ]
      const r = resolveRoute('/missing', routes)
      expect(r.isNotFound).toBe(true)
      // Should pick the layout, not the page — layout has children so
      // the layout pass matches and wins.
      const leaf = r.matched[r.matched.length - 1]
      expect(leaf?.component).toBe(LayoutNotFound)
    })

    it('does NOT wrap when there is a wildcard catch-all (wildcard always wins)', () => {
      // The wildcard route matches the URL directly, so the fallback never
      // fires. Same precedence as the existing wildcard test above.
      const Catchall = () => null
      const NotFound = () => null
      const routes: RouteRecord[] = [
        { path: '/', component: () => null, notFoundComponent: NotFound },
        { path: '(.*)', component: Catchall },
      ]
      const r = resolveRoute('/missing', routes)
      expect(r.isNotFound).toBeUndefined()
      expect(r.matched[0]?.component).toBe(Catchall)
    })
  })
})

// ─── PR-S9: notFoundComponent trie ───────────────────────────────────────────
//
// The trie-backed findNotFoundFallback is O(URL segments) per lookup,
// vs the prior O(routes-in-tree) walk. The tests below assert (a) the
// trie produces byte-identical results to the old walk across the
// representative shapes (nested layouts, dynamic prefixes, page-level
// fallback, root layout), and (b) the cache wires through `_indexCache`
// (cached after first build for a given routes tree).

describe('resolveRoute — PR-S9 notFoundComponent trie', () => {
  const NotFoundRoot = () => null
  const NotFoundDE = () => null
  const NotFoundDeep = () => null
  const Layout = () => null
  const Page = () => null

  it('matches the deepest layout-level notFoundComponent that prefixes the URL', () => {
    const routes = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundRoot,
        children: [
          {
            path: '/de',
            component: Layout,
            notFoundComponent: NotFoundDE,
            children: [{ path: '/de/about', component: Page }],
          },
          {
            path: '/en',
            component: Layout,
            children: [{ path: '/en/about', component: Page }],
          },
        ],
      },
    ]

    // /de/unknown → deeper /de layout wins over root layout
    const r1 = resolveRoute('/de/unknown', routes)
    expect(r1.isNotFound).toBe(true)
    expect(r1.matched[r1.matched.length - 1]?.component).toBe(NotFoundDE)

    // /en/unknown → /en layout has no notFoundComponent, falls back to root
    const r2 = resolveRoute('/en/unknown', routes)
    expect(r2.isNotFound).toBe(true)
    expect(r2.matched[r2.matched.length - 1]?.component).toBe(NotFoundRoot)

    // /xyz → only root layout applies
    const r3 = resolveRoute('/xyz', routes)
    expect(r3.isNotFound).toBe(true)
    expect(r3.matched[r3.matched.length - 1]?.component).toBe(NotFoundRoot)
  })

  it('avoids substring-prefix false matches (/de does NOT match /encyclopedia)', () => {
    const routes = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundRoot,
        children: [
          {
            path: '/de',
            component: Layout,
            notFoundComponent: NotFoundDE,
            children: [{ path: '/de/about', component: Page }],
          },
        ],
      },
    ]

    // /encyclopedia/unknown: /de's notFoundComponent must NOT apply
    // (substring prefix /de of /encyclopedia is forbidden — segment
    // boundary required). Root layout's notFoundComponent IS the fallback.
    const r = resolveRoute('/encyclopedia/unknown', routes)
    expect(r.isNotFound).toBe(true)
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFoundRoot)
  })

  it('handles deeply nested prefixes (3+ levels)', () => {
    const routes = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundRoot,
        children: [
          {
            path: '/admin',
            component: Layout,
            children: [
              {
                path: '/admin/users',
                component: Layout,
                notFoundComponent: NotFoundDeep,
                children: [{ path: '/admin/users/list', component: Page }],
              },
            ],
          },
        ],
      },
    ]

    // /admin/users/unknown → deeper /admin/users layout wins
    const r1 = resolveRoute('/admin/users/unknown', routes)
    expect(r1.isNotFound).toBe(true)
    expect(r1.matched[r1.matched.length - 1]?.component).toBe(NotFoundDeep)

    // /admin/unknown → /admin has no notFoundComponent, falls back to root
    const r2 = resolveRoute('/admin/unknown', routes)
    expect(r2.isNotFound).toBe(true)
    expect(r2.matched[r2.matched.length - 1]?.component).toBe(NotFoundRoot)
  })

  it('returns null (empty matched) when no notFoundComponent exists in the tree', () => {
    const routes = [
      { path: '/', component: Layout, children: [{ path: '/about', component: Page }] },
    ]
    const r = resolveRoute('/unknown', routes)
    expect(r.matched).toEqual([])
    expect(r.isNotFound).toBeUndefined()
  })

  it('caches the trie via _indexCache (build once per RouteRecord[])', () => {
    const routes = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundRoot,
        children: [{ path: '/about', component: Page }],
      },
    ]

    // First 404 resolution builds the index + trie
    const r1 = resolveRoute('/missing-1', routes)
    expect(r1.isNotFound).toBe(true)

    // Subsequent resolutions reuse the cached index — same routes
    // identity, same trie. Asserting via behavior: the resolution must
    // produce the SAME synthetic chain shape on repeated calls (same
    // notFoundComponent reference at the leaf).
    const r2 = resolveRoute('/missing-2', routes)
    const r3 = resolveRoute('/missing-3', routes)
    expect(r2.matched[r2.matched.length - 1]?.component).toBe(NotFoundRoot)
    expect(r3.matched[r3.matched.length - 1]?.component).toBe(NotFoundRoot)
    expect(r1.matched.length).toBe(r2.matched.length)
    expect(r2.matched.length).toBe(r3.matched.length)
  })

  it('PR-S9 perf: 1000 resolutions across a wide tree stay sub-100ms total', () => {
    // Stress test: build a tree with many notFoundComponent-bearing
    // records (mimics i18n × dynamic-route fan-out). The old O(N)
    // walk would scan every record on every lookup; the trie scales
    // with URL segments only.
    //
    // 5 locales × 5 sections × 1 layout + 1 root = 26
    // notFoundComponent records. 1000 lookups across them.
    const localeNames = ['en', 'de', 'cs', 'fr', 'es']
    const sectionNames = ['posts', 'users', 'admin', 'blog', 'docs']
    const routes: RouteRecord[] = [
      {
        path: '/',
        component: Layout,
        notFoundComponent: NotFoundRoot,
        children: localeNames.flatMap((loc) => [
          {
            path: `/${loc}`,
            component: Layout,
            notFoundComponent: NotFoundDE,
            children: sectionNames.map((sec) => ({
              path: `/${loc}/${sec}`,
              component: Layout,
              notFoundComponent: NotFoundDeep,
              children: [{ path: `/${loc}/${sec}/list`, component: Page }],
            })),
          },
        ]),
      },
    ]

    // Prime the cache
    resolveRoute('/en/posts/unknown', routes)

    // Resolve 1000 random 404 URLs across the tree
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      const loc = localeNames[i % localeNames.length]
      const sec = sectionNames[(i + 1) % sectionNames.length]
      resolveRoute(`/${loc}/${sec}/unknown-${i}`, routes)
    }
    const elapsed = performance.now() - start

    // Generous threshold (100ms for 1000 calls = 100µs/call). The actual
    // trie path should land closer to 5-20µs/call on modern hardware.
    // The threshold is intentionally loose to avoid CI flake — the bug
    // class the test catches is "scaled linearly with tree size",
    // which would blow past 100ms easily on this tree shape.
    expect(elapsed).toBeLessThan(100)
  })
})
