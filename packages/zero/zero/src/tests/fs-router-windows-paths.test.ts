import { win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateApiRouteModule } from '../api-routes'
import {
  generateMiddlewareModule,
  generateRouteModule,
  parseFileRoutes,
  toPosixPath,
} from '../fs-router'

// Windows `path.relative` yields backslash-separated route paths and an
// absolute `C:\…` routes dir. Synthesize both with `path.win32` so the test
// runs on any host.
const ROUTES_DIR = win32.join('C:\\', 'app', 'src', 'routes')
const files = [
  win32.join('blog', '_layout.tsx'),
  win32.join('blog', 'index.tsx'),
  win32.join('blog', '[slug].tsx'),
  'index.tsx',
]

describe('Windows (backslash) route paths', () => {
  it('synthetic inputs really are backslash-shaped', () => {
    expect(files[0]).toBe('blog\\_layout.tsx')
    expect(ROUTES_DIR).toBe('C:\\app\\src\\routes')
  })

  it('parse the same as their posix twins (nested routes keep their layout)', () => {
    const win = parseFileRoutes(files)
    const posix = parseFileRoutes(files.map(toPosixPath))
    expect(win).toEqual(posix)
    const slug = win.find((r) => r.filePath === 'blog/[slug].tsx')
    expect(slug?.urlPath).toBe('/blog/:slug')
    expect(slug?.dirPath).toBe('blog')
  })

  it('generated route module is byte-identical to the posix twin and has no backslashes', () => {
    const win = generateRouteModule(files, ROUTES_DIR)
    const posix = generateRouteModule(files.map(toPosixPath), 'C:/app/src/routes')
    expect(win).toBe(posix)
    expect(win).not.toContain('\\')
    expect(win).toContain('"C:/app/src/routes/blog/[slug].tsx"')
  })

  it('middleware and api modules carry no backslashes', () => {
    expect(generateMiddlewareModule(files, ROUTES_DIR)).not.toContain('\\')
    const api = generateApiRouteModule([win32.join('api', 'posts.ts')], ROUTES_DIR)
    expect(api).toContain('C:/app/src/routes/api/posts.ts')
    expect(api).not.toContain('\\')
  })
})
