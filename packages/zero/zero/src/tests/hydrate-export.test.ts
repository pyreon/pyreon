/**
 * `export const hydrate = 'islands' | 'app'` on a route or `_layout` file
 * (#4371). The scan reads the literal, the generator puts it on the route
 * record as `meta.hydrate` (in every emission shape: lazy page, namespace
 * page, static/SSG page, layout), and `assertHydrateExports` rejects what
 * the build cannot honour, naming the file and the fix.
 */
import { describe, expect, it } from 'vitest'
import { rulesDeclareHydrate } from '../client-flags-plugin'
import {
  applyHydrateRules,
  assertHydrateExports,
  detectRouteExports,
  generateRouteModuleFromRoutes,
  parseFileRoutes,
} from '../fs-router'
import type { FileRoute, RouteFileExports } from '../types'

function routesFrom(
  sources: Record<string, string>,
  mode: 'ssg' | 'ssr' | 'spa' = 'ssg',
): FileRoute[] {
  const exports = new Map<string, RouteFileExports>()
  for (const [file, src] of Object.entries(sources)) {
    exports.set(file, detectRouteExports(src, file))
  }

  return parseFileRoutes(Object.keys(sources), mode, exports)
}

const page = (extra = '') => `export default function P() { return null }\n${extra}`
const layout = (extra = '') => `export function layout() { return null }\n${extra}`

describe('detectRouteExports — hydrate', () => {
  it('captures a literal hydrate export', () => {
    const exp = detectRouteExports(page(`export const hydrate = 'islands'`))
    expect(exp.hasHydrate).toBe(true)
    expect(exp.hydrateLiteral).toBe(`'islands'`)
  })

  it('accepts as const', () => {
    expect(detectRouteExports(page(`export const hydrate = 'app' as const`)).hydrateLiteral).toBe(
      `'app'`,
    )
  })

  it('records a computed hydrate as present without a literal', () => {
    const exp = detectRouteExports(page(`const x = 'islands'\nexport const hydrate = x`))
    expect(exp.hasHydrate).toBe(true)
    expect(exp.hydrateLiteral).toBeUndefined()
  })
})

describe('generateRouteModuleFromRoutes — meta.hydrate', () => {
  it('a lazy page carries meta.hydrate inline (the page stays code-split)', () => {
    const code = generateRouteModuleFromRoutes(
      routesFrom({ 'index.tsx': page(`export const hydrate = 'islands'`) }, 'ssr'),
      '/r',
    )
    expect(code).toContain(`meta: { hydrate: 'islands' }`)
    expect(code).toMatch(/lazy\(\(\) => import\("\/r\/index\.tsx"\)/)
  })

  it('a page with a loader carries it next to the loader thunk', () => {
    const code = generateRouteModuleFromRoutes(
      routesFrom(
        {
          'index.tsx': page(
            `export const hydrate = 'islands'\nexport async function loader() { return 1 }`,
          ),
        },
        'ssr',
      ),
      '/r',
    )
    expect(code).toContain(`hydrate: 'islands'`)
    expect(code).toContain('loader: (ctx) =>')
  })

  it('a layout carries it, so it cascades to the pages under it', () => {
    const code = generateRouteModuleFromRoutes(
      routesFrom(
        { '_layout.tsx': layout(`export const hydrate = 'islands'`), 'index.tsx': page() },
        'ssr',
      ),
      '/r',
    )
    expect(code).toContain(`hydrate: 'islands'`)
  })

  it('the static (SSG sub-build) shape carries it too', () => {
    const code = generateRouteModuleFromRoutes(
      routesFrom({ 'index.tsx': page(`export const hydrate = 'islands'`) }),
      '/r',
      { staticImports: true },
    )
    expect(code).toContain(`hydrate: 'islands'`)
  })

  it('a route without the export gets no hydrate key', () => {
    const code = generateRouteModuleFromRoutes(routesFrom({ 'index.tsx': page() }, 'ssr'), '/r')
    expect(code).not.toContain('hydrate')
  })
})

describe('assertHydrateExports', () => {
  it('passes for islands pages under ssg / ssr / isr', () => {
    for (const mode of ['ssg', 'ssr', 'isr'] as const) {
      expect(() =>
        assertHydrateExports(
          routesFrom({ 'index.tsx': page(`export const hydrate = 'islands'`) }),
          mode,
        ),
      ).not.toThrow()
    }
  })

  it('rejects a computed value, naming the file', () => {
    expect(() =>
      assertHydrateExports(
        routesFrom({ 'about.tsx': page(`const x = 'islands'\nexport const hydrate = x`) }),
        'ssg',
      ),
    ).toThrow(/\[Pyreon\][\s\S]*about\.tsx[\s\S]*string literal/)
  })

  it('rejects an unknown value', () => {
    expect(() =>
      assertHydrateExports(
        routesFrom({ 'about.tsx': page(`export const hydrate = 'partial'`) }),
        'ssg',
      ),
    ).toThrow(/about\.tsx[\s\S]*'islands' or 'app'/)
  })

  it('rejects islands on an spa page (route declaration)', () => {
    expect(() =>
      assertHydrateExports(
        routesFrom({
          'about.tsx': page(`export const hydrate = 'islands'\nexport const renderMode = 'spa'`),
        }),
        'ssg',
      ),
    ).toThrow(/\[Pyreon\][\s\S]*about\.tsx[\s\S]*spa/)
  })

  it('rejects islands cascaded from a layout onto a page the app renders as spa', () => {
    expect(() =>
      assertHydrateExports(
        routesFrom(
          { '_layout.tsx': layout(`export const hydrate = 'islands'`), 'index.tsx': page() },
          'spa',
        ),
        'spa',
      ),
    ).toThrow(/index\.tsx[\s\S]*spa/)
  })

  it('rejects islands on a page a routeRules glob makes spa', () => {
    expect(() =>
      assertHydrateExports(
        routesFrom({ 'app/index.tsx': page(`export const hydrate = 'islands'`) }),
        'ssr',
        { '/app/**': { renderMode: 'spa' } },
      ),
    ).toThrow(/app\/index\.tsx/)
  })

  it("a page's hydrate = 'app' under an islands layout is fine in spa", () => {
    expect(() =>
      assertHydrateExports(
        routesFrom(
          {
            '_layout.tsx': layout(`export const hydrate = 'islands'`),
            'index.tsx': page(`export const hydrate = 'app'\nexport const renderMode = 'spa'`),
          },
          'ssr',
        ),
        'ssr',
      ),
    ).not.toThrow()
  })
})

/**
 * `routeRules: { '/glob': { hydrate } }` (#4371): a central declaration with
 * the same validation as the export and the precedence `renderMode` has
 * (page export > nearest `_layout` export > the most specific rule > 'app').
 */
describe('routeRules hydrate', () => {
  const hydrateOf = (routes: FileRoute[], urlPath: string) =>
    routes.find((r) => r.urlPath === urlPath && !r.isLayout)?.exports?.hydrateLiteral

  it('a rule marks the pages it matches, as if they exported it', () => {
    const routes = applyHydrateRules(
      routesFrom({ 'index.tsx': page(), 'blog/index.tsx': page(), 'blog/[slug].tsx': page() }, 'ssg'),
      { '/blog/**': { hydrate: 'islands' } },
    )
    expect(hydrateOf(routes, '/blog')).toBe('"islands"')
    expect(hydrateOf(routes, '/blog/:slug')).toBe('"islands"')
    expect(hydrateOf(routes, '/')).toBeUndefined()
  })

  it('the generated record carries it, and a lazy page stays code-split', () => {
    const code = generateRouteModuleFromRoutes(
      applyHydrateRules(routesFrom({ 'docs.tsx': page() }, 'ssr'), { '/docs': { hydrate: 'islands' } }),
      '/r',
    )
    expect(code).toContain('meta: { hydrate: "islands" }')
    expect(code).toMatch(/lazy\(\(\) => import\("\/r\/docs\.tsx"\)/)
  })

  it("a page's own export wins over the rule", () => {
    const routes = applyHydrateRules(
      routesFrom({ 'blog/index.tsx': page(`export const hydrate = 'app'`) }, 'ssg'),
      { '/blog/**': { hydrate: 'islands' } },
    )
    expect(hydrateOf(routes, '/blog')).toBe(`'app'`)
  })

  it("a _layout's export wins over the rule (the page stays unstamped and inherits the layout)", () => {
    const routes = applyHydrateRules(
      routesFrom({ 'blog/_layout.tsx': layout(`export const hydrate = 'app'`), 'blog/index.tsx': page() }, 'ssg'),
      { '/blog/**': { hydrate: 'islands' } },
    )
    expect(hydrateOf(routes, '/blog')).toBeUndefined()
  })

  it('the most specific rule that sets hydrate wins; a more specific rule without it does not hide it', () => {
    const routes = applyHydrateRules(
      routesFrom({ 'blog/index.tsx': page(), 'blog/live.tsx': page(), 'blog/new.tsx': page() }, 'ssr'),
      {
        '/blog/**': { hydrate: 'islands' },
        '/blog/live': { hydrate: 'app' },
        '/blog/new': { renderMode: 'ssr' },
      },
    )
    expect(hydrateOf(routes, '/blog')).toBe('"islands"')
    expect(hydrateOf(routes, '/blog/live')).toBe('"app"')
    expect(hydrateOf(routes, '/blog/new')).toBe('"islands"')
  })

  it('no rule declares hydrate: the routes come back untouched', () => {
    const routes = routesFrom({ 'index.tsx': page() }, 'ssg')
    expect(applyHydrateRules(routes, { '/**': { renderMode: 'ssg' } })).toBe(routes)
    expect(applyHydrateRules(routes, undefined)).toBe(routes)
  })

  it('rejects an unknown value, naming the rule', () => {
    expect(() =>
      assertHydrateExports(routesFrom({ 'index.tsx': page() }), 'ssg', {
        '/docs/**': { hydrate: 'partial' as never },
      }),
    ).toThrow(/\[Pyreon\][\s\S]*routeRules\["\/docs\/\*\*"\]\.hydrate = "partial"[\s\S]*'islands' or 'app'/)
  })

  it('rejects an islands rule on a page that renders spa, naming the rule (app mode, or a rule)', () => {
    expect(() =>
      assertHydrateExports(routesFrom({ 'index.tsx': page() }, 'spa'), 'spa', {
        '/**': { hydrate: 'islands' },
      }),
    ).toThrow(/index\.tsx[\s\S]*from routeRules\["\/\*\*"\][\s\S]*spa/)
    expect(() =>
      assertHydrateExports(routesFrom({ 'app/index.tsx': page() }, 'ssr'), 'ssr', {
        '/app/**': { renderMode: 'spa', hydrate: 'islands' },
      }),
    ).toThrow(/app\/index\.tsx[\s\S]*routeRules/)
  })

  it('an islands rule is fine where the page itself renders on the server or opts back to app', () => {
    expect(() =>
      assertHydrateExports(
        routesFrom({ 'a.tsx': page(`export const renderMode = 'ssg'`), 'b.tsx': page(`export const hydrate = 'app'`) }, 'spa'),
        'spa',
        { '/**': { hydrate: 'islands' } },
      ),
    ).not.toThrow()
  })

  it('a rule that declares hydrate keeps the islands-only client support in the build', () => {
    expect(rulesDeclareHydrate({ routeRules: { '/docs/**': { hydrate: 'islands' } } })).toBe(true)
    expect(rulesDeclareHydrate({ routeRules: { '/docs/**': { renderMode: 'ssg' } } })).toBe(false)
    expect(rulesDeclareHydrate({})).toBe(false)
  })
})
