import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { matchPattern } from '../entry-server'
import {
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

  it('strips groups from dirPath', () => {
    const routes = parseFileRoutes(['(auth)/login.tsx'])
    expect(routes[0]?.dirPath).toBe('')
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
    expect(code).toContain('lazy(() => import("/src/routes/index.tsx"))')
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

  it('emits namespace import for files with detected metadata', () => {
    write(
      'dashboard.tsx',
      `export const loader = async () => ({})\nexport default function Dashboard() { return null }`,
    )
    const code = generateRouteModule(['dashboard.tsx'], dir)
    expect(code).toContain('import * as')
    expect(code).toMatch(/loader: _m\d+\.loader/)
    expect(code).not.toContain('_pick')
    expect(code).not.toContain('lazy(')
  })

  it('mixes lazy() and namespace imports across files', () => {
    write('home.tsx', `export default function Home() { return null }`)
    write(
      'admin.tsx',
      `export const meta = { title: 'Admin' }\nexport default function Admin() { return null }`,
    )
    const code = generateRouteModule(['home.tsx', 'admin.tsx'], dir)
    expect(code).toContain('lazy(() => import(')
    expect(code).toContain('import * as')
    expect(code).toMatch(/meta: \{ \.\.\._m\d+\.meta \}/)
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
    expect(code).toMatch(/loader: _m\d+\.loader/)
    expect(code).toMatch(/beforeEnter: _m\d+\.guard/)
    expect(code).toMatch(/meta: \{ \.\.\._m\d+\.meta, renderMode: _m\d+\.renderMode \}/)
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
  it('generates middleware imports for route files', () => {
    const code = generateMiddlewareModule(['index.tsx', 'about.tsx'], '/src/routes')
    expect(code).toContain('import { middleware as')
    expect(code).toContain('export const routeMiddleware')
  })

  it('maps URL patterns to middleware', () => {
    const code = generateMiddlewareModule(['about.tsx'], '/src/routes')
    expect(code).toContain('pattern: "/about"')
  })

  it('skips layout, error, loading, and not-found files', () => {
    const code = generateMiddlewareModule(
      ['_layout.tsx', '_error.tsx', '_loading.tsx', '_404.tsx', '_not-found.tsx', 'index.tsx'],
      '/src/routes',
    )
    expect(code).not.toContain('_layout')
    expect(code).not.toContain('_error')
    expect(code).not.toContain('_loading')
    expect(code).not.toContain('_404')
    expect(code).not.toContain('_not-found')
    expect(code).toContain('pattern: "/"')
  })

  it('filters out entries with no middleware at runtime', () => {
    const code = generateMiddlewareModule(['index.tsx'], '/src/routes')
    expect(code).toContain('.filter(e => e.middleware)')
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
    expect(result).toContain('lazy(() => import("./routes/about.tsx"))')
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
    expect(result).toContain('lazy(() => import("./routes/home.tsx"))')
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

  it('emits no lazy import when all routes have metadata (no code split)', () => {
    const routes = [
      makeRoute('a.tsx', { hasLoader: true }),
      makeRoute('b.tsx', { hasMeta: true }),
    ]
    const result = generateRouteModuleFromRoutes(routes, './routes')
    expect(result).not.toContain('import { lazy }')
    expect(result).not.toContain('lazy(')
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
})
