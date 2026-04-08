import { describe, expect, it } from 'vitest'
import { matchPattern } from '../entry-server'
import {
  filePathToUrlPath,
  generateMiddlewareModule,
  generateRouteModule,
  parseFileRoutes,
} from '../fs-router'

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
  it('generates valid module code', () => {
    const code = generateRouteModule(['index.tsx', 'about.tsx'], '/src/routes')
    expect(code).toContain('export const routes')
    expect(code).toContain('path: "/"')
    expect(code).toContain('path: "/about"')
    // No more lazy import — all routes are statically imported
    expect(code).not.toContain('import { lazy }')
  })

  it('imports route modules for loader/guard/meta access', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    // Should have module import for accessing loader, guard, meta
    expect(code).toContain('import * as')
  })

  it('uses single static import for component and module exports', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    // Component is now `mod.default` from a single `import * as mod` —
    // avoids INEFFECTIVE_DYNAMIC_IMPORT warning from importing same file twice.
    expect(code).toContain('import * as')
    expect(code).toContain('.default')
    // No more lazy() calls
    expect(code).not.toContain('lazy(')
  })

  it('wires up loader from module via _pick helper', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).toContain('loader: _pick(')
    expect(code).toContain('"loader"')
  })

  it('wires up guard as beforeEnter via _pick helper', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).toContain('beforeEnter: _pick(')
    expect(code).toContain('"guard"')
  })

  it('wires up meta from module via _pick helper', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).toContain('meta: { ..._pick(')
    expect(code).toContain('"meta"')
  })

  it('wraps routes in layout when _layout exists', () => {
    const code = generateRouteModule(['_layout.tsx', 'index.tsx', 'about.tsx'], '/src/routes')
    expect(code).toContain('children:')
  })

  it('wires error component from _error.tsx', () => {
    const code = generateRouteModule(['_error.tsx', 'index.tsx'], '/src/routes')
    expect(code).toContain('errorComponent:')
  })

  it('imports loading component from _loading.tsx', () => {
    const code = generateRouteModule(['_loading.tsx', 'index.tsx'], '/src/routes')
    // Static-imports refactor: loading component is still imported and
    // available; the previous lazy({ loading }) wiring was removed when
    // we eliminated dynamic imports to fix INEFFECTIVE_DYNAMIC_IMPORT warnings.
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
    // Should have nested children structures
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

  it('wires renderMode into route meta', () => {
    const code = generateRouteModule(['index.tsx'], '/src/routes')
    expect(code).toContain('"renderMode"')
    expect(code).toMatch(/meta:.*renderMode/)
  })

  it('wires renderMode in layout routes', () => {
    const code = generateRouteModule(['_layout.tsx', 'index.tsx'], '/src/routes')
    // Both layout and page should have renderMode in meta
    const matches = code.match(/renderMode/g)
    expect(matches?.length).toBeGreaterThanOrEqual(2)
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

// ─── static imports (no lazy) ─────────────────────────────────────────────

describe('generateRouteModule — static imports', () => {
  it('uses static import * for all routes (no lazy)', () => {
    const files = ['index.tsx']
    const result = generateRouteModule(files, './routes')
    // No lazy() or dynamic import() calls — single static import * as
    expect(result).not.toContain('lazy(')
    expect(result).not.toContain('import("./routes/index.tsx")')
    expect(result).toContain('import * as')
    // Component reference uses .default from the static module import
    expect(result).toContain('.default')
  })

  it('legacy staticImports option still accepted (no-op now)', () => {
    const files = ['index.tsx']
    // Behavior is identical with or without the option — kept for back-compat
    const a = generateRouteModule(files, './routes')
    const b = generateRouteModule(files, './routes', { staticImports: true })
    expect(a).toBe(b)
  })

  it('does not emit errorComponent without _error file', () => {
    const files = ['index.tsx', 'about.tsx']
    const result = generateRouteModule(files, './routes')
    expect(result).not.toContain('.error')
  })

  it('emits errorComponent when _error file exists', () => {
    const files = ['index.tsx', '_error.tsx']
    const result = generateRouteModule(files, './routes')
    expect(result).toContain('errorComponent')
  })
})
