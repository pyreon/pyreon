/**
 * Behavioral lock for the SHARED fs-route convention + island naming.
 *
 * These fixtures are ports of `@pyreon/zero`'s own `fs-router.test.ts` /
 * `api-routes.test.ts` expectations (zero was the source of truth when the
 * functions were extracted) plus the divergence shapes the scanner's old
 * comment-synced copies got WRONG. Zero's suite keeps running against its
 * re-exports; identity parity tests over there assert the re-exports ARE
 * these functions — this file locks the semantics compiler-side so the
 * module stands on its own.
 */
import {
  apiFilePathToPattern,
  filePathToUrlPath,
  isApiRoute,
  ROUTE_EXTENSIONS,
  SPECIAL_ROUTE_FILES,
  stripRouteExtension,
} from '../fs-route-convention'
import { deriveIslandName, fnv1a6, islandRelPath } from '../island-naming'

describe('fs-route-convention — isApiRoute (zero-exact semantics)', () => {
  test('accepts .ts/.js under the TOP-LEVEL api/ dir', () => {
    expect(isApiRoute('api/posts.ts')).toBe(true)
    expect(isApiRoute('api/posts/[id].ts')).toBe(true)
    expect(isApiRoute('api/health.js')).toBe(true)
  })

  test('rejects .tsx/.jsx even under api/ (they stay page routes)', () => {
    expect(isApiRoute('api/posts.tsx')).toBe(false)
    expect(isApiRoute('api/widget.jsx')).toBe(false)
  })

  test('rejects files outside api/', () => {
    expect(isApiRoute('posts.ts')).toBe(false)
    expect(isApiRoute('about.tsx')).toBe(false)
  })

  test('rejects NESTED api/ dirs — the scanner-divergence shape', () => {
    // zero requires startsWith('api/'); the scanner's old copy accepted
    // includes('/api/') and invented API routes zero never serves.
    expect(isApiRoute('posts/api/x.ts')).toBe(false)
    expect(isApiRoute('admin/api/users/[id].ts')).toBe(false)
  })

  test('normalizes Windows separators before matching', () => {
    expect(isApiRoute('api\\posts.ts')).toBe(true)
    expect(isApiRoute('posts\\api\\x.ts')).toBe(false)
  })
})

describe('fs-route-convention — apiFilePathToPattern (zero-exact semantics)', () => {
  test('maps static, index, dynamic and catch-all segments', () => {
    expect(apiFilePathToPattern('api/posts.ts')).toBe('/api/posts')
    expect(apiFilePathToPattern('api/posts/index.ts')).toBe('/api/posts')
    expect(apiFilePathToPattern('api/posts/[id].ts')).toBe('/api/posts/:id')
    expect(apiFilePathToPattern('api/[...path].ts')).toBe('/api/:path*')
    expect(apiFilePathToPattern('api/users/[id]/posts.ts')).toBe('/api/users/:id/posts')
  })

  test('strips .js too', () => {
    expect(apiFilePathToPattern('api/health.js')).toBe('/api/health')
  })
})

describe('fs-route-convention — filePathToUrlPath (zero-exact semantics)', () => {
  test('maps the zero fs-router corpus', () => {
    expect(filePathToUrlPath('index')).toBe('/')
    expect(filePathToUrlPath('about')).toBe('/about')
    expect(filePathToUrlPath('users/index')).toBe('/users')
    expect(filePathToUrlPath('users/[id]')).toBe('/users/:id')
    expect(filePathToUrlPath('users/[id]/settings')).toBe('/users/:id/settings')
    expect(filePathToUrlPath('blog/[...slug]')).toBe('/blog/:slug*')
  })

  test('route groups are URL-invisible', () => {
    expect(filePathToUrlPath('(auth)/login')).toBe('/login')
    expect(filePathToUrlPath('(marketing)/features/pricing')).toBe('/features/pricing')
  })

  test('special files map to their directory URL', () => {
    expect(filePathToUrlPath('_layout')).toBe('/')
    expect(filePathToUrlPath('_error')).toBe('/')
    expect(filePathToUrlPath('_loading')).toBe('/')
    expect(filePathToUrlPath('_404')).toBe('/')
    expect(filePathToUrlPath('_not-found')).toBe('/')
    expect(filePathToUrlPath('dashboard/_layout')).toBe('/dashboard')
  })
})

describe('fs-route-convention — extensions + specials', () => {
  test('ROUTE_EXTENSIONS keeps zero precedence order (.tsx before .ts)', () => {
    expect(ROUTE_EXTENSIONS).toEqual(['.tsx', '.jsx', '.ts', '.js'])
  })

  test('stripRouteExtension strips the first matching extension only', () => {
    expect(stripRouteExtension('posts/[id].tsx')).toBe('posts/[id]')
    expect(stripRouteExtension('api/posts.ts')).toBe('api/posts')
    expect(stripRouteExtension('no-extension')).toBe('no-extension')
  })

  test('SPECIAL_ROUTE_FILES matches the set filePathToUrlPath skips', () => {
    expect([...SPECIAL_ROUTE_FILES].sort()).toEqual(
      ['_404', '_error', '_layout', '_loading', '_not-found'].sort(),
    )
    for (const name of SPECIAL_ROUTE_FILES) {
      expect(filePathToUrlPath(name)).toBe('/')
    }
  })
})

describe('island-naming — deriveIslandName (vite-plugin-exact semantics)', () => {
  test('derivation is deterministic and file-scoped', () => {
    const a = deriveIslandName('Counter', 'src/islands.ts')
    expect(a).toBe(deriveIslandName('Counter', 'src/islands.ts'))
    expect(a).toMatch(/^Counter\$[0-9a-z]{1,6}$/)
    // Same binding in a DIFFERENT file → different name (collision-free)
    expect(deriveIslandName('Counter', 'src/other.ts')).not.toBe(a)
  })

  test('fnv1a6 is the styler-family FNV-1a 32-bit base36 hash', () => {
    // Known-value lock: hash of the canonical scanner-test fixture path.
    expect(fnv1a6('src/components/widgets.tsx')).toBe(fnv1a6('src/components/widgets.tsx'))
    expect(deriveIslandName('Widget', 'src/components/widgets.tsx')).toBe(
      `Widget$${fnv1a6('src/components/widgets.tsx')}`,
    )
    expect(fnv1a6('')).toBe((0x811c9dc5 >>> 0).toString(36).slice(0, 6))
  })

  test('islandRelPath yields a root-relative forward-slash path', () => {
    expect(islandRelPath('/app', '/app/src/islands.ts')).toBe('src/islands.ts')
  })
})
