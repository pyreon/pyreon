import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { matchPattern } from '../entry-server'
import {
  applyModeInference, inferRouteMode, resolveAutoAppMode, resolveAutoModeSync,
  collectFileRouteModes,
  detectRouteExports,
  filePathToUrlPath,
  generateMiddlewareModule,
  generateRouteModule,
  generateRouteModuleFromRoutes,
  parseFileRoutes,
} from '../fs-router'
import type { FileRoute, RouteFileExports } from '../types'

// ─── filePathToUrlPath ───────────────────────────────────────────────────────

describe('filePathToUrlPath', () => {
  it('maps index to /', () => {
    expect(filePathToUrlPath('index')).toBe('/')
  })

  it('maps static route', () => {
    expect(filePathToUrlPath('about')).toBe('/about')
  })

  it('maps nested index', () => {
    expect(filePathToUrlPath('users/index')).toBe('/users')
  })

  it('maps dynamic param', () => {
    expect(filePathToUrlPath('users/[id]')).toBe('/users/:id')
  })

  it('maps nested dynamic route', () => {
    expect(filePathToUrlPath('users/[id]/settings')).toBe('/users/:id/settings')
  })

  it('maps catch-all', () => {
    expect(filePathToUrlPath('blog/[...slug]')).toBe('/blog/:slug*')
  })

  it('strips route groups', () => {
    expect(filePathToUrlPath('(auth)/login')).toBe('/login')
  })

  it('strips nested route groups', () => {
    expect(filePathToUrlPath('(marketing)/features/pricing')).toBe('/features/pricing')
  })

  it('strips _layout', () => {
    expect(filePathToUrlPath('_layout')).toBe('/')
  })

  it('strips _error', () => {
    expect(filePathToUrlPath('_error')).toBe('/')
  })

  it('strips _loading', () => {
    expect(filePathToUrlPath('_loading')).toBe('/')
  })

  it('strips _404', () => {
    expect(filePathToUrlPath('_404')).toBe('/')
  })

  it('strips _not-found', () => {
    expect(filePathToUrlPath('_not-found')).toBe('/')
  })

  it('strips nested _404', () => {
    expect(filePathToUrlPath('dashboard/_404')).toBe('/dashboard')
  })

  it('strips nested _not-found', () => {
    expect(filePathToUrlPath('users/_not-found')).toBe('/users')
  })

  it('strips nested _layout', () => {
    expect(filePathToUrlPath('dashboard/_layout')).toBe('/dashboard')
  })
})

// ─── parseFileRoutes ─────────────────────────────────────────────────────────

describe('parseFileRoutes', () => {
  it('parses basic routes', () => {
    const routes = parseFileRoutes(['index.tsx', 'about.tsx'])
    expect(routes).toHaveLength(2)
    expect(routes[0]?.urlPath).toBe('/')
    expect(routes[1]?.urlPath).toBe('/about')
  })

  it('filters non-route files', () => {
    const routes = parseFileRoutes(['index.tsx', 'README.md', 'styles.css'])
    expect(routes).toHaveLength(1)
  })

  it('identifies layouts', () => {
    const routes = parseFileRoutes(['_layout.tsx', 'index.tsx'])
    const layout = routes.find((r) => r.isLayout)
    expect(layout).toBeDefined()
    expect(layout?.filePath).toBe('_layout.tsx')
  })

  it('identifies error boundaries', () => {
    const routes = parseFileRoutes(['_error.tsx', 'index.tsx'])
    const error = routes.find((r) => r.isError)
    expect(error).toBeDefined()
  })

  it('identifies loading fallbacks', () => {
    const routes = parseFileRoutes(['_loading.tsx', 'index.tsx'])
    const loading = routes.find((r) => r.isLoading)
    expect(loading).toBeDefined()
  })

  it('identifies not-found files (_404)', () => {
    const routes = parseFileRoutes(['_404.tsx', 'index.tsx'])
    const notFound = routes.find((r) => r.isNotFound)
    expect(notFound).toBeDefined()
    expect(notFound?.filePath).toBe('_404.tsx')
  })

  it('identifies not-found files (_not-found)', () => {
    const routes = parseFileRoutes(['_not-found.tsx', 'index.tsx'])
    const notFound = routes.find((r) => r.isNotFound)
    expect(notFound).toBeDefined()
    expect(notFound?.filePath).toBe('_not-found.tsx')
  })

  it('identifies nested _404 files', () => {
    const routes = parseFileRoutes(['users/_404.tsx', 'users/index.tsx'])
    const notFound = routes.find((r) => r.isNotFound)
    expect(notFound).toBeDefined()
    expect(notFound?.dirPath).toBe('users')
  })

  it('identifies catch-all routes', () => {
    const routes = parseFileRoutes(['blog/[...slug].tsx'])
    expect(routes[0]?.isCatchAll).toBe(true)
  })

  it('sorts static before dynamic', () => {
    const routes = parseFileRoutes(['[id].tsx', 'about.tsx'])
    expect(routes[0]?.urlPath).toBe('/about')
    expect(routes[1]?.urlPath).toBe('/:id')
  })

  it('sorts catch-all last', () => {
    const routes = parseFileRoutes(['[...all].tsx', 'about.tsx', '[id].tsx'])
    expect(routes[routes.length - 1]?.isCatchAll).toBe(true)
  })

  it('sorts layouts first at same depth', () => {
    const routes = parseFileRoutes(['index.tsx', '_layout.tsx'])
    expect(routes[0]?.isLayout).toBe(true)
  })

  it('computes dirPath correctly', () => {
    const routes = parseFileRoutes(['users/[id].tsx', 'users/_layout.tsx'])
    for (const r of routes) {
      expect(r.dirPath).toBe('users')
    }
  })

  it('KEEPS groups in dirPath (tree boundary) while stripping them from urlPath', () => {
    // Pre-fix this test asserted dirPath === '' — codifying the bug: group
    // stripping collapsed `(auth)/` onto the parent node, so a group's
    // `_layout.tsx` landed on the SAME tree node as the root layout and
    // `placeRoute`'s last-wins assignment silently clobbered one of them.
    // Groups are URL-invisible but they ARE nesting boundaries.
    const routes = parseFileRoutes(['(auth)/login.tsx'])
    expect(routes[0]?.dirPath).toBe('(auth)')
    expect(routes[0]?.urlPath).toBe('/login')
  })

  it('uses default renderMode', () => {
    const routes = parseFileRoutes(['index.tsx'], 'ssg')
    expect(routes[0]?.renderMode).toBe('ssg')
  })
})

// ─── generateRouteModule ─────────────────────────────────────────────────────

describe('generateRouteModule', () => {
  // These tests pass synthetic file paths that don't exist on disk. The
  // generator can't read them, so it treats them as having no metadata
  // exports and emits the optimal `lazy()` shape (one dynamic import per
  // route, no static metadata wiring). Tests that need metadata wiring use
  // `generateRouteModuleFromRoutes` directly with explicit exports.

  it('generates valid module code', () => {
    const code = generateRouteModule(['index.tsx', 'about.tsx'], '/src/routes')
    expect(code).toContain('export const routes')
    expect(code).toContain('path: "/"')
    expect(code).toContain('path: "/about"')
  })

  it('uses lazy() for routes when files cannot be read', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).toContain('import { lazy }')
    // `, { hmrId: ... }` is appended by codegen for dev HMR (inert in
    // prod). Assert the lazy import target without pinning the closing.
    expect(code).toContain('lazy(() => import("/src/routes/index.tsx")')
  })

  it('emits no `import * as` when no metadata is detected', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).not.toContain('import * as')
  })

  it('emits no _pick helper', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).not.toContain('_pick')
    expect(code).not.toContain('function _pick')
  })

  it('emits no metadata wiring when files cannot be read', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).not.toContain('loader:')
    expect(code).not.toContain('beforeEnter:')
    expect(code).not.toContain('meta:')
  })

  it('wraps routes in layout when _layout exists', () => {
    const code = generateRouteModule(['_layout.tsx', 'index.tsx', 'about.tsx'], '/src/routes')
    expect(code).toContain('children:')
    expect(code).toContain('import { layout as')
  })

  it('wires error component from _error.tsx', () => {
    const code = generateRouteModule(['_error.tsx', 'index.tsx'], '/src/routes')
    expect(code).toContain('errorComponent:')
  })

  it('imports loading component from _loading.tsx', () => {
    const code = generateRouteModule(['_loading.tsx', 'index.tsx'], '/src/routes')
    // The _loading file gets imported as the loading fallback for any
    // lazy() route in the same tree node.
    expect(code).toContain('_loading')
  })

  it('handles nested directory routes', () => {
    const code = generateRouteModule(
      ['index.tsx', 'users/index.tsx', 'users/[id].tsx'],
      '/src/routes',
    )
    expect(code).toContain('path: "/"')
    expect(code).toContain('path: "/users"')
    expect(code).toContain('path: "/users/:id"')
  })

  it('handles nested layouts with children', () => {
    const code = generateRouteModule(
      [
        '_layout.tsx',
        'index.tsx',
        'dashboard/_layout.tsx',
        'dashboard/index.tsx',
        'dashboard/settings.tsx',
      ],
      '/src/routes',
    )
    expect(code).toContain('children:')
  })

  it('returns empty routes for empty file list', () => {
    const code = generateRouteModule([], '/src/routes')
    expect(code).toContain('export const routes')
  })

  it('includes clean() helper to strip undefined props', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).toContain('function clean(routes)')
  })

  it('wires notFoundComponent from _404.tsx', () => {
    const code = generateRouteModule(['_404.tsx', 'index.tsx'], '/src/routes')
    expect(code).toContain('notFoundComponent:')
  })

  it('wires notFoundComponent from _not-found.tsx', () => {
    const code = generateRouteModule(['_not-found.tsx', 'index.tsx'], '/src/routes')
    expect(code).toContain('notFoundComponent:')
  })

  it('wires notFoundComponent in layout with _404', () => {
    const code = generateRouteModule(['_layout.tsx', '_404.tsx', 'index.tsx'], '/src/routes')
    expect(code).toContain('notFoundComponent:')
    expect(code).toContain('children:')
  })

  it('does not include notFoundComponent when no _404 exists', () => {
    const code = generateRouteModule(['index.tsx', 'about.tsx'], '/src/routes')
    expect(code).not.toContain('notFoundComponent:')
  })
})

// ─── generateRouteModule with real fixture files ───────────────────────────
//
// End-to-end coverage of the file-reading path: write actual route files
// to a temp dir and verify the generator detects metadata exports and emits
// the optimal shape (lazy() for routes without metadata, namespace import
// for routes with metadata, no _pick anywhere).

describe('generateRouteModule (real files)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pyreon-zero-fs-router-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function write(filePath: string, source: string) {
    const full = join(dir, filePath)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, source, 'utf-8')
  }

  it('emits lazy() for files with no metadata exports', () => {
    write('index.tsx', `export default function Home() { return null }`)
    const code = generateRouteModule(['index.tsx'], dir)
    expect(code).toContain('import { lazy }')
    expect(code).toContain('lazy(() => import(')
    expect(code).not.toContain('import * as')
    expect(code).not.toContain('_pick')
  })

  it('lazy-thunks the loader when paired with inlinable meta', () => {
    write(
      'dashboard.tsx',
      `export const loader = async () => ({})\nexport const meta = { title: 'Dashboard' }\nexport default function Dashboard() { return null }`,
    )
    const code = generateRouteModule(['dashboard.tsx'], dir)
    // Component is lazy(), loader is wrapped in a dynamic-import thunk so the
    // entire route module stays in its own chunk.
    expect(code).toContain('lazy(() => import(')
    expect(code).toContain('loader: (ctx) => import(')
    expect(code).toContain('.then((m) => m.loader(ctx))')
    // Meta is inlined as a literal, not pulled from a static module import.
    expect(code).toMatch(/meta: \{ \.\.\.\(\{ title: 'Dashboard' \}\) \}/)
    expect(code).not.toContain('import * as')
    expect(code).not.toContain('_pick')
  })

  it('falls back to namespace import when meta isn\'t a literal', () => {
    write(
      'computed-meta.tsx',
      `const baseTitle = 'Page'\nexport const loader = async () => ({})\nexport const meta = { title: baseTitle + ' — Site' }\nexport default function P() { return null }`,
    )
    const code = generateRouteModule(['computed-meta.tsx'], dir)
    // Inliner sees `baseTitle` (an identifier), so it gives up on the
    // literal extraction. Generator falls back to the static
    // `import * as` shape so the loader/meta access still works.
    expect(code).toContain('import * as')
    expect(code).toMatch(/loader: _m\d+\.loader/)
  })

  it('mixes lazy() across files with no warnings about dual imports', () => {
    write('home.tsx', `export default function Home() { return null }`)
    write(
      'admin.tsx',
      `export const meta = { title: 'Admin' }\nexport default function Admin() { return null }`,
    )
    const code = generateRouteModule(['home.tsx', 'admin.tsx'], dir)
    // Both routes should be lazy() — admin has meta but it's a literal,
    // so it gets inlined and the route file lazy-loads cleanly.
    expect(code).toContain('lazy(() => import(')
    expect(code).toMatch(/lazy.*home\.tsx/)
    expect(code).toMatch(/lazy.*admin\.tsx/)
    // Inlined meta literal — no static module import
    expect(code).toContain("meta: { ...({ title: 'Admin' }) }")
    expect(code).not.toContain('import * as')
    expect(code).not.toContain('_pick')
  })

  it('detects every supported metadata export name', () => {
    write(
      'page.tsx',
      `
export const loader = async () => ({})
export const guard = () => true
export const meta = { title: 'Page' }
export const renderMode = 'ssg'
export const error = function ErrorBoundary() { return null }
export const middleware = () => undefined
export default function Page() { return null }
      `,
    )
    const code = generateRouteModule(['page.tsx'], dir)
    // meta + renderMode are literals → inlined.
    // loader + guard + error are functions → wrapped in dynamic-import thunks.
    expect(code).toContain('lazy(() => import(')
    expect(code).toContain('loader: (ctx) => import(')
    expect(code).toContain('beforeEnter: (to, from) => import(')
    expect(code).toContain("meta: { ...({ title: 'Page' }), renderMode: 'ssg' }")
    expect(code).not.toContain('_pick')
  })

  it('layout with metadata uses single namespace import', () => {
    write(
      '_layout.tsx',
      `export const loader = async () => ({})\nexport function layout({ children }) { return children }`,
    )
    write('index.tsx', `export default function Home() { return null }`)
    const code = generateRouteModule(['_layout.tsx', 'index.tsx'], dir)
    // Layout has metadata → namespace import covers both `.layout` and `.loader`
    expect(code).toMatch(/component: _m\d+\.layout/)
    expect(code).toMatch(/loader: _m\d+\.loader/)
    expect(code).not.toContain('import { layout as')
    expect(code).not.toContain('_pick')
  })

  it('layout without metadata uses named layout import', () => {
    write('_layout.tsx', `export function layout({ children }) { return children }`)
    write('index.tsx', `export default function Home() { return null }`)
    const code = generateRouteModule(['_layout.tsx', 'index.tsx'], dir)
    expect(code).toContain('import { layout as')
    expect(code).not.toContain('_pick')
  })
})

// ─── generateMiddlewareModule ───────────────────────────────────────────────

describe('generateMiddlewareModule', () => {
  // The generator now reads each route file's source to detect whether it
  // actually exports `middleware` (so SSG's static-import path doesn't fail
  // Rolldown's missing-export check). Tests need real files on disk so the
  // detection has source to read.
  let mwTmp = ''

  beforeEach(() => {
    mwTmp = mkdtempSync(join(tmpdir(), 'pyreon-mw-'))
  })

  afterEach(() => {
    if (mwTmp) rmSync(mwTmp, { recursive: true, force: true })
  })

  function writeRouteWithMiddleware(name: string): void {
    writeFileSync(
      join(mwTmp, name),
      `export const middleware = [() => {}]\nexport default function Page() { return null }\n`,
    )
  }

  function writeRouteWithoutMiddleware(name: string): void {
    writeFileSync(
      join(mwTmp, name),
      `export default function Page() { return null }\n`,
    )
  }

  it('generates middleware imports for route files that export middleware', () => {
    writeRouteWithMiddleware('index.tsx')
    writeRouteWithMiddleware('about.tsx')
    const code = generateMiddlewareModule(['index.tsx', 'about.tsx'], mwTmp)
    expect(code).toContain('import { middleware as')
    expect(code).toContain('export const routeMiddleware')
  })

  it('maps URL patterns to middleware', () => {
    writeRouteWithMiddleware('about.tsx')
    const code = generateMiddlewareModule(['about.tsx'], mwTmp)
    expect(code).toContain('pattern: "/about"')
  })

  it('skips layout, error, loading, and not-found files', () => {
    writeRouteWithMiddleware('_layout.tsx')
    writeRouteWithMiddleware('_error.tsx')
    writeRouteWithMiddleware('_loading.tsx')
    writeRouteWithMiddleware('_404.tsx')
    writeRouteWithMiddleware('_not-found.tsx')
    writeRouteWithMiddleware('index.tsx')
    const code = generateMiddlewareModule(
      ['_layout.tsx', '_error.tsx', '_loading.tsx', '_404.tsx', '_not-found.tsx', 'index.tsx'],
      mwTmp,
    )
    expect(code).not.toContain('_layout')
    expect(code).not.toContain('_error')
    expect(code).not.toContain('_loading')
    expect(code).not.toContain('_404')
    expect(code).not.toContain('_not-found')
    expect(code).toContain('pattern: "/"')
  })

  it('filters out entries with no middleware at runtime', () => {
    writeRouteWithMiddleware('index.tsx')
    const code = generateMiddlewareModule(['index.tsx'], mwTmp)
    expect(code).toContain('.filter(e => e.middleware)')
  })

  // New: regression test for the SSG / static-import path. Routes WITHOUT
  // a `middleware` export must not appear as `import { middleware as ... }`
  // in the generated module — Rolldown's static-import check would fail
  // the build with `"middleware" is not exported by ...`.
  it('OMITS imports for route files that do not export middleware', () => {
    writeRouteWithoutMiddleware('about.tsx')
    const code = generateMiddlewareModule(['about.tsx'], mwTmp)
    expect(code).not.toContain('import { middleware as')
  })
})

// ─── matchPattern ───────────────────────────────────────────────────────────

describe('matchPattern', () => {
  it('matches exact paths', () => {
    expect(matchPattern('/about', '/about')).toBe(true)
  })

  it('rejects non-matching paths', () => {
    expect(matchPattern('/about', '/contact')).toBe(false)
  })

  it('matches root path', () => {
    expect(matchPattern('/', '/')).toBe(true)
  })

  it('matches dynamic segments', () => {
    expect(matchPattern('/users/:id', '/users/123')).toBe(true)
  })

  it('rejects paths with wrong prefix for dynamic routes', () => {
    expect(matchPattern('/users/:id', '/posts/123')).toBe(false)
  })

  it('matches catch-all segments', () => {
    expect(matchPattern('/blog/:slug*', '/blog/2024/hello-world')).toBe(true)
  })

  it('rejects paths with different segment count', () => {
    expect(matchPattern('/about', '/about/team')).toBe(false)
  })

  it('matches nested dynamic paths', () => {
    expect(matchPattern('/users/:id/settings', '/users/42/settings')).toBe(true)
  })
})

// ─── optimal path (detected exports) ───────────────────────────────────────

describe('generateRouteModuleFromRoutes — with detected exports', () => {
  function makeRoute(filePath: string, exp: Partial<RouteFileExports> = {}): FileRoute {
    return {
      filePath,
      urlPath: filePath === 'index.tsx' ? '/' : `/${filePath.replace('.tsx', '')}`,
      dirPath: '',
      depth: filePath === 'index.tsx' ? 0 : 1,
      isLayout: false,
      isError: false,
      isLoading: false,
      isNotFound: false,
      isCatchAll: false,
      renderMode: 'ssr',
      exports: {
        hasLoader: false,
        hasGuard: false,
        hasMeta: false,
        hasRenderMode: false,
        hasError: false,
        hasMiddleware: false,
        ...exp,
      },
    }
  }

  it('uses lazy() for routes with no metadata exports (code splitting)', () => {
    const routes = [makeRoute('about.tsx')]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).toContain('import { lazy }')
    expect(result).toContain('lazy(() => import("./routes/about.tsx")')
    // No static `import * as` for metadata since none exists
    expect(result).not.toContain('import * as')
    // No _pick helper either
    expect(result).not.toContain('_pick')
  })

  it('uses static `import * as` only when route has metadata', () => {
    const routes = [
      makeRoute('home.tsx'), // no exports
      makeRoute('dashboard.tsx', { hasLoader: true, hasMeta: true }),
    ]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    // dashboard has metadata → static import for direct access
    expect(result).toContain('import * as')
    expect(result).toContain('dashboard.tsx')
    // home has no metadata → lazy() only
    expect(result).toContain('lazy(() => import("./routes/home.tsx")')
    // Direct property access, not _pick
    expect(result).toContain('.loader')
    expect(result).not.toContain('_pick')
  })

  it('only emits metadata props that actually exist', () => {
    const routes = [makeRoute('page.tsx', { hasLoader: true })] // only loader
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).toContain('loader:')
    expect(result).not.toContain('beforeEnter:') // no guard
    expect(result).not.toContain('meta:') // no meta
    expect(result).not.toContain('renderMode:') // no renderMode
  })

  it('emits meta with renderMode when both exist', () => {
    const routes = [makeRoute('page.tsx', { hasMeta: true, hasRenderMode: true })]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).toMatch(/meta:.*\.\.\..*\.meta.*renderMode:.*\.renderMode/)
  })

  it('emits meta with only renderMode when meta missing', () => {
    const routes = [makeRoute('page.tsx', { hasRenderMode: true })]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).toContain('meta: { renderMode:')
  })

  it('static-only mode bundles everything (no lazy)', () => {
    const routes = [makeRoute('about.tsx')]
    const result = generateRouteModuleFromRoutes(routes, './routes', { staticImports: true })
    expect(result).not.toContain('lazy(')
    expect(result).toContain('import')
  })

  it('emits getStaticPaths on the route record in static-imports mode', () => {
    const routes = [
      makeRoute('posts/[id].tsx', { hasGetStaticPaths: true } as Partial<RouteFileExports>),
    ]
    const result = generateRouteModuleFromRoutes(routes, './routes', { staticImports: true })
    // Namespace import → `mod.getStaticPaths` lands as a route field.
    expect(result).toMatch(/import \* as _m\d+ from "\.\/routes\/posts\/\[id\]\.tsx"/)
    expect(result).toMatch(/getStaticPaths: _m\d+\.getStaticPaths/)
  })

  it('emits getStaticPaths on the route record in lazy mode (mixed branch)', () => {
    // Lazy/SSR mode + getStaticPaths-only export → mixed shape: lazy
    // component + namespace import for the function-shaped export.
    const routes = [
      makeRoute('posts/[id].tsx', { hasGetStaticPaths: true } as Partial<RouteFileExports>),
    ]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).toContain('lazy(() => import("./routes/posts/[id].tsx")')
    expect(result).toContain('getStaticPaths:')
    expect(result).toMatch(/import \* as _m\d+ from "\.\/routes\/posts\/\[id\]\.tsx"/)
  })

  it('layout with no metadata only emits component import', () => {
    const layoutRoute: FileRoute = {
      filePath: '_layout.tsx',
      urlPath: '/',
      dirPath: '',
      depth: 0,
      isLayout: true,
      isError: false,
      isLoading: false,
      isNotFound: false,
      isCatchAll: false,
      renderMode: 'ssr',
      exports: {
        hasLoader: false,
        hasGuard: false,
        hasMeta: false,
        hasRenderMode: false,
        hasError: false,
        hasMiddleware: false,
      },
    }
    const result = generateRouteModuleFromRoutes([layoutRoute, makeRoute('about.tsx')], './routes')
    expect(result).toContain('import { layout as')
    // No `import * as` for layout — no metadata to access
    expect(result.match(/import \* as/g)?.length ?? 0).toBe(0)
  })

  it('emits no _pick helper when all routes have known exports', () => {
    const routes = [makeRoute('a.tsx'), makeRoute('b.tsx', { hasLoader: true })]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).not.toContain('_pick')
    expect(result).not.toContain('function _pick')
  })

  it('routes with loader-only and no meta literal lazy() the component + thunk-wrap the loader', () => {
    // `a.tsx` has hasLoader=true but no `meta`/`renderMode` flags. With
    // the framework-level inlining fix, the generator detects "no meta
    // is needed → meta is trivially inlinable (it's empty)", takes the
    // mixed branch, and emits a lazy() component + a dynamic-import
    // thunk for the loader. No static `import * as` is generated.
    const routes = [makeRoute('a.tsx', { hasLoader: true })]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).toContain('import { lazy }')
    expect(result).toContain('lazy(() => import(')
    expect(result).toContain('loader: (ctx) => import(')
    expect(result).not.toContain('import * as')
  })

  it('routes with hasMeta but no metaLiteral fall back to static import', () => {
    // `b.tsx` claims `hasMeta: true` via the synthetic exports map but
    // doesn't supply a `metaLiteral` — that mimics what would happen
    // if the literal extractor saw a non-pure expression. Generator
    // takes the pessimistic path and emits a static `import * as`.
    const routes = [makeRoute('b.tsx', { hasMeta: true })]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).toContain('import * as')
    expect(result).not.toContain('lazy(')
  })

  it('emits lazy() when metaLiteral is supplied alongside metadata flags', () => {
    const routes = [
      makeRoute('a.tsx', { hasMeta: true, metaLiteral: "{ title: 'A' }" }),
      makeRoute('b.tsx', { hasMeta: true, metaLiteral: "{ title: 'B' }" }),
    ]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    // Both routes have inlinable meta → both get lazy() components
    // and inlined meta literals. No static `import * as` is needed.
    expect(result).toContain('import { lazy }')
    expect(result).toContain('lazy(() => import(')
    expect(result).toContain("meta: { ...({ title: 'A' }) }")
    expect(result).toContain("meta: { ...({ title: 'B' }) }")
    expect(result).not.toContain('import * as')
  })

  it('layout with metadata uses single namespace import for component AND metadata', () => {
    const layoutWithMeta: FileRoute = {
      filePath: '_layout.tsx',
      urlPath: '/',
      dirPath: '',
      depth: 0,
      isLayout: true,
      isError: false,
      isLoading: false,
      isNotFound: false,
      isCatchAll: false,
      renderMode: 'ssr',
      exports: {
        hasLoader: true,
        hasGuard: false,
        hasMeta: false,
        hasRenderMode: false,
        hasError: false,
        hasMiddleware: false,
      },
    }
    const result = generateRouteModuleFromRoutes(
      [layoutWithMeta, makeRoute('index.tsx')],
      './routes',
    )
    // Single `import * as` for layout — covers both .layout and .loader
    const namespaceImports = (result.match(/import \* as .* from "\.\/routes\/_layout\.tsx"/g) ?? [])
      .length
    expect(namespaceImports).toBe(1)
    // Component reference is mod.layout (not a separate named import)
    expect(result).toMatch(/component: _m\d+\.layout/)
    expect(result).toMatch(/loader: _m\d+\.loader/)
    // No duplicate `import { layout }` for the same file
    expect(result).not.toContain('import { layout as')
  })
})

// ─── export detection ──────────────────────────────────────────────────────

describe('detectRouteExports', () => {
  it('detects export const loader', () => {
    const result = detectRouteExports('export const loader = async () => {}')
    expect(result.hasLoader).toBe(true)
  })

  it('detects export async function loader', () => {
    const result = detectRouteExports('export async function loader() {}')
    expect(result.hasLoader).toBe(true)
  })

  it('detects export function guard', () => {
    const result = detectRouteExports('export function guard() {}')
    expect(result.hasGuard).toBe(true)
  })

  it('detects export const meta', () => {
    const result = detectRouteExports('export const meta = { title: "Home" }')
    expect(result.hasMeta).toBe(true)
  })

  it('returns all false for default-only file', () => {
    const result = detectRouteExports('export default function Home() { return null }')
    expect(result.hasLoader).toBe(false)
    expect(result.hasGuard).toBe(false)
    expect(result.hasMeta).toBe(false)
    expect(result.hasRenderMode).toBe(false)
    expect(result.hasError).toBe(false)
    expect(result.hasMiddleware).toBe(false)
    expect(result.hasGetStaticPaths).toBe(false)
  })

  it('detects export function getStaticPaths', () => {
    const result = detectRouteExports('export function getStaticPaths() { return [] }')
    expect(result.hasGetStaticPaths).toBe(true)
  })

  it('detects export async function getStaticPaths', () => {
    const result = detectRouteExports('export async function getStaticPaths() { return [] }')
    expect(result.hasGetStaticPaths).toBe(true)
  })

  it('detects export const getStaticPaths', () => {
    const result = detectRouteExports('export const getStaticPaths = () => []')
    expect(result.hasGetStaticPaths).toBe(true)
  })

  it('detects export { getStaticPaths } re-export', () => {
    const result = detectRouteExports(`
      const getStaticPaths = () => []
      export { getStaticPaths }
    `)
    expect(result.hasGetStaticPaths).toBe(true)
  })

  it('ignores commented-out exports', () => {
    const result = detectRouteExports(`
      // export const loader = () => {}
      /* export const meta = {} */
      export default function() {}
    `)
    expect(result.hasLoader).toBe(false)
    expect(result.hasMeta).toBe(false)
  })

  it('detects multiple exports in one file', () => {
    const result = detectRouteExports(`
      export const loader = async () => {}
      export const meta = { title: 'Page' }
      export const renderMode = 'ssg'
      export default function Page() {}
    `)
    expect(result.hasLoader).toBe(true)
    expect(result.hasMeta).toBe(true)
    expect(result.hasRenderMode).toBe(true)
    expect(result.hasGuard).toBe(false)
  })

  it('detects export list: export { loader, meta }', () => {
    const result = detectRouteExports(`
      const loader = async () => {}
      const meta = { title: 'Page' }
      export { loader, meta }
      export default function Page() {}
    `)
    expect(result.hasLoader).toBe(true)
    expect(result.hasMeta).toBe(true)
  })

  it('detects export list with rename: export { foo as loader }', () => {
    const result = detectRouteExports(`
      const foo = async () => {}
      export { foo as loader }
      export default function Page() {}
    `)
    expect(result.hasLoader).toBe(true)
  })

  it('ignores exports inside string literals', () => {
    const result = detectRouteExports(`
      const x = "export const loader = () => {}"
      const y = 'export const meta = {}'
      export default function Page() { return null }
    `)
    expect(result.hasLoader).toBe(false)
    expect(result.hasMeta).toBe(false)
  })

  it('ignores exports inside template literals', () => {
    const result = detectRouteExports(`
      const x = \`export const loader = () => {}\`
      export default function Page() { return null }
    `)
    expect(result.hasLoader).toBe(false)
  })

  it('ignores exports inside template literal expression slots', () => {
    // Tricky: \`\${export}\` shouldn't trigger anything either
    const result = detectRouteExports(`
      const code = \`\${'export const loader = () => {}'}\`
      export default function Page() { return null }
    `)
    expect(result.hasLoader).toBe(false)
  })

  it('ignores exports inside nested function bodies (brace depth > 0)', () => {
    const result = detectRouteExports(`
      function generate() {
        const code = "export const loader = () => {}"
      }
      export default function Page() { return null }
    `)
    expect(result.hasLoader).toBe(false)
  })

  it('still works with real-world route file shape', () => {
    const result = detectRouteExports(`
import type { LoaderContext } from '@pyreon/zero'

export async function loader(ctx: LoaderContext) {
  return { data: [] }
}

export const meta = {
  title: 'Posts',
}

export const renderMode = 'ssg'

export default function PostsPage() {
  return <div>Posts</div>
}
    `)
    expect(result.hasLoader).toBe(true)
    expect(result.hasMeta).toBe(true)
    expect(result.hasRenderMode).toBe(true)
    expect(result.hasGuard).toBe(false)
  })

  // PR I — build-time ISR. `revalidate` literal capture for the
  // `dist/_pyreon-revalidate.json` manifest. The literal flows through
  // `RouteFileExports.revalidateLiteral` and the SSG plugin reads it
  // WITHOUT loading the route module — so the scanner-side detection
  // tested here is the load-bearing contract for the entire feature.
  describe('revalidate (PR I)', () => {
    it('detects export const revalidate = 60 (number)', () => {
      const result = detectRouteExports('export const revalidate = 60')
      expect(result.hasRevalidate).toBe(true)
      expect(result.revalidateLiteral).toBe('60')
    })

    it('detects export const revalidate = false (never revalidate)', () => {
      const result = detectRouteExports('export const revalidate = false')
      expect(result.hasRevalidate).toBe(true)
      expect(result.revalidateLiteral).toBe('false')
    })

    it('detects export const revalidate = 0 (always revalidate)', () => {
      const result = detectRouteExports('export const revalidate = 0')
      expect(result.hasRevalidate).toBe(true)
      expect(result.revalidateLiteral).toBe('0')
    })

    it('strips `as const` type assertions from the literal', () => {
      const result = detectRouteExports('export const revalidate = 3600 as const')
      expect(result.hasRevalidate).toBe(true)
      expect(result.revalidateLiteral).toBe('3600')
    })

    it('returns hasRevalidate:false for default-only file', () => {
      const result = detectRouteExports('export default function Home() { return null }')
      expect(result.hasRevalidate).toBe(false)
      expect(result.revalidateLiteral).toBeUndefined()
    })

    it('detects export { revalidate } re-export but does not capture the literal (no rhs to extract)', () => {
      // The re-export form sets `hasRevalidate: true` but
      // `revalidateLiteral` stays undefined because the literal lives
      // in the original `const revalidate = N` declaration, not at
      // the re-export site. The SSG plugin treats this as "no
      // manifest entry" — the user gets `hasRevalidate: true` for
      // any feature gating, but the manifest skips it. Documented as
      // a limitation; users who want the manifest entry should
      // export inline (`export const revalidate = 60`) rather than
      // declare-then-export.
      const result = detectRouteExports(`
        const revalidate = 60
        export { revalidate }
      `)
      expect(result.hasRevalidate).toBe(true)
      expect(result.revalidateLiteral).toBeUndefined()
    })

    it('does not capture non-literal expressions (function calls, references)', () => {
      const result = detectRouteExports(`
        const TTL = 60
        export const revalidate = TTL
      `)
      // hasRevalidate is true — the export exists. But the literal is
      // not pure (references `TTL`), so revalidateLiteral is dropped
      // and the manifest skips this route. Same defensive shape as
      // metaLiteral / renderModeLiteral — the SSG plugin never
      // evaluates user code, only literals.
      expect(result.hasRevalidate).toBe(true)
      expect(result.revalidateLiteral).toBeUndefined()
    })
  })
})

describe('collectFileRouteModes (file-level mode resolution parity)', () => {
  let modeDir: string
  const write = (rel: string, body: string) => {
    const full = join(modeDir, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, body)
  }

  beforeEach(() => {
    modeDir = mkdtempSync(join(tmpdir(), 'pyreon-mode-'))
  })
  afterEach(() => {
    rmSync(modeDir, { recursive: true, force: true })
  })

  it('leaf declaration > layout declaration > app mode (the runtime cascade)', async () => {
    write('index.tsx', 'export default () => null')
    write('blog/_layout.tsx', "export default (p) => p.children\nexport const renderMode = 'ssg'")
    write('blog/post.tsx', 'export default () => null')
    write('blog/live.tsx', "export default () => null\nexport const renderMode = 'ssr'")
    const entries = await collectFileRouteModes(modeDir, 'isr')
    const byPattern = new Map(entries.map((e) => [e.pattern, e]))
    // no declaration anywhere → app mode
    expect(byPattern.get('/')).toMatchObject({ mode: 'isr', declared: false })
    // layout cascade
    expect(byPattern.get('/blog/post')).toMatchObject({ mode: 'ssg', declared: true })
    // leaf wins over layout
    expect(byPattern.get('/blog/live')).toMatchObject({ mode: 'ssr', declared: true })
  })

  it('nearest ancestor layout wins over a higher one', async () => {
    write('_layout.tsx', "export default (p) => p.children\nexport const renderMode = 'ssg'")
    write('app/_layout.tsx', "export default (p) => p.children\nexport const renderMode = 'spa'")
    write('app/page.tsx', 'export default () => null')
    write('about.tsx', 'export default () => null')
    const entries = await collectFileRouteModes(modeDir, 'ssr')
    const byPattern = new Map(entries.map((e) => [e.pattern, e]))
    expect(byPattern.get('/app/page')?.mode).toBe('spa')
    expect(byPattern.get('/about')?.mode).toBe('ssg') // root layout cascades
  })

  it('skips api routes and special files', async () => {
    write('index.tsx', 'export default () => null')
    write('api/items.ts', 'export function GET() { return new Response("ok") }')
    write('_404.tsx', 'export default () => null')
    const entries = await collectFileRouteModes(modeDir, 'ssr')
    expect(entries.map((e) => e.pattern)).toEqual(['/'])
  })
})

describe('computed renderMode warning (Tier-2 D)', () => {
  const routeWith = (exp: Partial<RouteFileExports>): FileRoute => ({
    filePath: 'computed-mode.tsx',
    urlPath: '/computed-mode',
    dirPath: '',
    depth: 1,
    isLayout: false,
    isError: false,
    isLoading: false,
    isNotFound: false,
    isCatchAll: false,
    renderMode: 'ssr',
    exports: {
      hasLoader: false,
      hasGuard: false,
      hasMeta: false,
      hasRenderMode: false,
      hasError: false,
      hasMiddleware: false,
      hasLoading: false,
      hasGetStaticPaths: false,
      hasLoaderKey: false,
      hasGcTime: false,
      hasServerLoader: false,
      ...exp,
    } as RouteFileExports,
  })

  it('warns once when renderMode is detected but not a pure literal', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateRouteModuleFromRoutes([routeWith({ hasRenderMode: true })], './routes')
      generateRouteModuleFromRoutes([routeWith({ hasRenderMode: true })], './routes')
      const hits = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('COMPUTED renderMode'))
      expect(hits).toHaveLength(1) // deduped per file
      expect(hits[0]).toContain('computed-mode.tsx')
      expect(hits[0]).toContain("export const renderMode = 'ssg'")
    } finally {
      warn.mockRestore()
    }
  })

  it('does not warn for a literal renderMode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      generateRouteModuleFromRoutes(
        [routeWith({ hasRenderMode: true, renderModeLiteral: "'ssg'" })],
        './routes',
      )
      expect(
        warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('COMPUTED renderMode')),
      ).toBeUndefined()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('collectFileRouteModes — routeRules integration (Tier-4)', () => {
  it('rule applies when no file/layout declaration; file declaration wins over rule', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')
    const dir = mkdtempSync(path.join(tmpdir(), 'pyreon-rules-'))
    try {
      const write = (rel: string, body: string) => {
        const full = path.join(dir, rel)
        mkdirSync(path.dirname(full), { recursive: true })
        writeFileSync(full, body)
      }
      write('blog/post.tsx', 'export default () => null')
      write('blog/live.tsx', "export default () => null\nexport const renderMode = 'ssr'")
      write('about.tsx', 'export default () => null')
      const entries = await collectFileRouteModes(dir, 'ssr', {
        '/blog/**': { renderMode: 'isr' },
      })
      const by = new Map(entries.map((e) => [e.pattern, e]))
      expect(by.get('/blog/post')).toMatchObject({ mode: 'isr', declared: true }) // rule
      expect(by.get('/blog/live')).toMatchObject({ mode: 'ssr', declared: true }) // file wins
      expect(by.get('/about')).toMatchObject({ mode: 'ssr', declared: false }) // app default
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("mode: 'auto' inference (EXPERIMENTAL)", () => {
  const exp = (over: Partial<RouteFileExports>): RouteFileExports =>
    ({
      hasLoader: false,
      hasGuard: false,
      hasMeta: false,
      hasRenderMode: false,
      hasRevalidate: false,
      hasError: false,
      hasMiddleware: false,
      hasLoading: false,
      hasGetStaticPaths: false,
      hasLoaderKey: false,
      hasGcTime: false,
      ...over,
    }) as RouteFileExports

  it('inferRouteMode: static unless the code says otherwise', () => {
    expect(inferRouteMode(exp({}))).toBe('ssg')
    expect(inferRouteMode(exp({ hasLoader: true }))).toBe('ssr')
    expect(inferRouteMode(exp({ hasGuard: true }))).toBe('ssr')
    expect(inferRouteMode(exp({ hasMiddleware: true }))).toBe('ssr')
    expect(inferRouteMode(exp({ hasRevalidate: true }))).toBe('isr')
    // an enumerator is a static-intent signal even alongside a loader
    expect(inferRouteMode(exp({ hasLoader: true, hasGetStaticPaths: true }))).toBe('ssg')
  })

  it('applyModeInference injects literals for undeclared pages only', () => {
    const routes: FileRoute[] = [
      {
        filePath: 'index.tsx', urlPath: '/', dirPath: '', depth: 0,
        isLayout: false, isError: false, isLoading: false, isNotFound: false,
        isCatchAll: false, renderMode: 'ssr', exports: exp({}),
      },
      {
        filePath: 'dash.tsx', urlPath: '/dash', dirPath: '', depth: 1,
        isLayout: false, isError: false, isLoading: false, isNotFound: false,
        isCatchAll: false, renderMode: 'ssr',
        exports: exp({ hasRenderMode: true, renderModeLiteral: "'spa'" } as never),
      },
      {
        filePath: '_layout.tsx', urlPath: '/', dirPath: '', depth: 0,
        isLayout: true, isError: false, isLoading: false, isNotFound: false,
        isCatchAll: false, renderMode: 'ssr', exports: exp({ hasLoader: true }),
      },
    ]
    const out = applyModeInference(routes)
    expect(out[0]!.exports?.renderModeLiteral).toBe('"ssg"') // inferred
    expect(out[1]!.exports?.renderModeLiteral).toBe("'spa'") // declared untouched
    expect(out[2]!.exports?.renderModeLiteral).toBeUndefined() // layout untouched
  })

  it('resolveAutoAppMode: pure-static → ssg; any server-needing page or rule → ssr', () => {
    const page = (over: Partial<RouteFileExports>): FileRoute => ({
      filePath: 'x.tsx', urlPath: '/x', dirPath: '', depth: 1,
      isLayout: false, isError: false, isLoading: false, isNotFound: false,
      isCatchAll: false, renderMode: 'ssr', exports: exp(over),
    })
    expect(resolveAutoAppMode([page({})])).toBe('ssg')
    expect(resolveAutoAppMode([page({ hasLoader: true })])).toBe('ssr')
    expect(resolveAutoAppMode([page({})], { '/x': { renderMode: 'isr' } })).toBe('ssr')
  })

  it('resolveAutoModeSync + collectFileRouteModes(auto) agree on a real fixture', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')
    const dir = mkdtempSync(path.join(tmpdir(), 'pyreon-auto-'))
    try {
      const write = (rel: string, body: string) => {
        const full = path.join(dir, rel)
        mkdirSync(path.dirname(full), { recursive: true })
        writeFileSync(full, body)
      }
      write('index.tsx', 'export default () => null')
      write('dash.tsx', 'export default () => null\nexport const loader = async () => ({})')
      const nodeFs = require('node:fs')
      const sync = resolveAutoModeSync(dir, undefined, nodeFs)
      expect(sync).toEqual({ mode: 'ssr', pages: 2 })

      const entries = await collectFileRouteModes(dir, 'auto')
      const by = new Map(entries.map((e) => [e.pattern, e]))
      expect(by.get('/')?.mode).toBe('ssg') // inferred static
      expect(by.get('/dash')?.mode).toBe('ssr') // inferred server (loader)

      // generation carries the inference as literals
      const { scanRouteFilesWithExports } = await import('../fs-router')
      const scanned = await scanRouteFilesWithExports(dir, 'ssr')
      const generated = generateRouteModuleFromRoutes(applyModeInference(scanned), dir)
      expect(generated).toContain('renderMode: "ssg"')
      expect(generated).toContain('renderMode: "ssr"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
