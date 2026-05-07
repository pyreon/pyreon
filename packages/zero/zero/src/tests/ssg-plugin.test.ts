import { describe, expect, it } from 'vitest'
import { _internal, ssgPlugin } from '../ssg-plugin'

describe('ssgPlugin', () => {
  describe('plugin shape', () => {
    it('returns a Vite plugin with the expected name', () => {
      const plugin = ssgPlugin() as any
      expect(plugin.name).toBe('pyreon-zero-ssg')
    })

    it('is build-only (apply: "build")', () => {
      const plugin = ssgPlugin() as any
      expect(plugin.apply).toBe('build')
    })

    it('runs after the main plugin (enforce: "post")', () => {
      const plugin = ssgPlugin() as any
      expect(plugin.enforce).toBe('post')
    })

    it('declares closeBundle hook (the SSG entry point)', () => {
      const plugin = ssgPlugin() as any
      expect(typeof plugin.closeBundle).toBe('function')
    })

    it('exposes a stable SSR entry filename for the materialized sub-build entry', () => {
      // The plugin writes a temporary `__pyreon-zero-ssg-entry.js` file at
      // the project root for the SSR sub-build. The name must start with
      // `__` so it doesn't collide with user route files (which never start
      // with double underscore).
      expect(_internal.SSR_ENTRY_FILENAME).toMatch(/^__/)
      expect(_internal.SSR_ENTRY_FILENAME).toMatch(/\.js$/)
    })

    it('SSR entry source imports zero virtual modules and renders fresh per path', () => {
      // The materialized entry must:
      // 1. Import the virtual route tree
      // 2. Use `createApp({ url: path })` to get a fresh router PER REQUEST
      //    (NOT createServer, which bakes in a single router that always
      //    points at "/")
      // 3. Preload loaders for the path
      // 4. Use renderWithHead to produce HTML
      // 5. Serialize loader data for hydration
      // 6. Default-export the renderer
      expect(_internal.SSR_ENTRY_SOURCE).toContain('virtual:zero/routes')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('@pyreon/zero/server')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('createApp')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('url: path')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('router.preload(path)')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('renderWithHead')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('serializeLoaderData')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('export default')
      // Must NOT use createServer — that's the bug we fixed (single-router
      // instance baked in at app creation, can't render different paths).
      expect(_internal.SSR_ENTRY_SOURCE).not.toContain('createServer')
    })
  })

  describe('path resolution', () => {
    it('explicit string[] paths returned verbatim', async () => {
      const paths = await _internal.resolvePaths(
        { mode: 'ssg', ssg: { paths: ['/', '/a', '/b'] } },
        '/tmp/nonexistent-routes',
      )
      expect(paths).toEqual(['/', '/a', '/b'])
    })

    it('async function paths awaited', async () => {
      const paths = await _internal.resolvePaths(
        { mode: 'ssg', ssg: { paths: async () => ['/x', '/y'] } },
        '/tmp/nonexistent-routes',
      )
      expect(paths).toEqual(['/x', '/y'])
    })

    it('sync function paths invoked', async () => {
      const paths = await _internal.resolvePaths(
        { mode: 'ssg', ssg: { paths: () => ['/sync'] } },
        '/tmp/nonexistent-routes',
      )
      expect(paths).toEqual(['/sync'])
    })

    it('falls back to "/" when no paths and no routes dir', async () => {
      const paths = await _internal.resolvePaths(
        { mode: 'ssg' },
        '/tmp/nonexistent-routes-fallback',
      )
      expect(paths).toEqual(['/'])
    })
  })

  describe('expandUrlPattern', () => {
    it('substitutes a single :param', () => {
      expect(_internal.expandUrlPattern('/posts/:id', { id: 'a' })).toBe('/posts/a')
    })

    it('substitutes multiple :params', () => {
      expect(_internal.expandUrlPattern('/users/:userId/posts/:postId', { userId: '1', postId: '2' })).toBe(
        '/users/1/posts/2',
      )
    })

    it('expands a catch-all :param* preserving slashes', () => {
      expect(_internal.expandUrlPattern('/blog/:slug*', { slug: 'a/b/c' })).toBe('/blog/a/b/c')
    })

    it('throws when a required param is missing', () => {
      expect(() => _internal.expandUrlPattern('/posts/:id', {})).toThrow(/without "id"/)
    })

    it('throws on empty-string value (would produce ambiguous URL)', () => {
      expect(() => _internal.expandUrlPattern('/posts/:id', { id: '' })).toThrow(/without "id"/)
    })

    it('passes through static segments unchanged', () => {
      expect(_internal.expandUrlPattern('/static/path', {})).toBe('/static/path')
    })
  })

  describe('autoDetectStaticPaths with getStaticPaths', () => {
    // We exercise autoDetectStaticPaths against a fixture directory built
    // on-the-fly with mkdtempSync. Each test writes a minimal route tree,
    // optionally a getStaticPaths registry, and asserts the expanded paths.
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs')
    const { tmpdir } = require('node:os')
    const path = require('node:path')

    function makeFixture(files: Record<string, string>) {
      const root = mkdtempSync(path.join(tmpdir(), 'pyreon-ssg-fixture-'))
      for (const [rel, body] of Object.entries(files)) {
        const full = path.join(root, rel)
        mkdirSync(path.dirname(full), { recursive: true })
        writeFileSync(full, body)
      }
      return {
        routesDir: root,
        cleanup: () => rmSync(root, { recursive: true, force: true }),
      }
    }

    it('expands a dynamic route via getStaticPaths', async () => {
      const f = makeFixture({
        'index.tsx': 'export default () => null',
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        // The fs-router scanner picks up `getStaticPaths` from the route
        // file; the SSG plugin pulls the actual function from the registry
        // (which the SSR sub-build's compiled output exposes). For the
        // unit test we hand-build the registry to mirror that contract.
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          ['/posts/:id', () => [{ params: { id: 'a' } }, { params: { id: 'b' } }]],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(paths).toContain('/')
        expect(paths).toContain('/posts/a')
        expect(paths).toContain('/posts/b')
        expect(errors).toEqual([])
      } finally {
        f.cleanup()
      }
    })

    it('skips dynamic routes silently when no getStaticPaths is registered', async () => {
      const f = makeFixture({
        'index.tsx': 'export default () => null',
        'posts/[id].tsx': 'export default () => null',
      })
      try {
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, undefined, errors)
        expect(paths).toEqual(['/'])
        expect(errors).toEqual([])
      } finally {
        f.cleanup()
      }
    })

    it('expands an async getStaticPaths', async () => {
      const f = makeFixture({
        'posts/[id].tsx': 'export default () => null\nexport async function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Promise<Array<{ params: Record<string, string> }>>>([
          ['/posts/:id', async () => [{ params: { id: 'x' } }]],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(paths).toContain('/posts/x')
        expect(errors).toEqual([])
      } finally {
        f.cleanup()
      }
    })

    it('captures errors when getStaticPaths throws', async () => {
      const f = makeFixture({
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          [
            '/posts/:id',
            () => {
              throw new Error('fetch failed')
            },
          ],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        // Failing route is omitted, but the call doesn't crash.
        expect(paths).not.toContain('/posts/:id')
        expect(errors).toHaveLength(1)
        expect(errors[0]!.path).toBe('/posts/:id')
        expect((errors[0]!.error as Error).message).toBe('fetch failed')
      } finally {
        f.cleanup()
      }
    })

    it('captures errors when getStaticPaths returns a non-array', async () => {
      const f = makeFixture({
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => unknown>([['/posts/:id', () => ({}) as any]])
        const errors: { path: string; error: unknown }[] = []
        await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(errors).toHaveLength(1)
        expect((errors[0]!.error as Error).message).toMatch(/must return an array/)
      } finally {
        f.cleanup()
      }
    })

    it('captures errors when entry is missing params', async () => {
      const f = makeFixture({
        'posts/[id].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          // @ts-expect-error — deliberately malformed for the test
          ['/posts/:id', () => [{ wrong: 'shape' }]],
        ])
        const errors: { path: string; error: unknown }[] = []
        await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(errors).toHaveLength(1)
        expect((errors[0]!.error as Error).message).toMatch(/without "params"/)
      } finally {
        f.cleanup()
      }
    })

    it('handles a catch-all route via getStaticPaths', async () => {
      const f = makeFixture({
        'docs/[...slug].tsx': 'export default () => null\nexport function getStaticPaths() {}',
      })
      try {
        const registry = new Map<string, () => Array<{ params: Record<string, string> }>>([
          ['/docs/:slug*', () => [{ params: { slug: 'a/b' } }, { params: { slug: 'c' } }]],
        ])
        const errors: { path: string; error: unknown }[] = []
        const paths = await _internal.autoDetectStaticPaths(f.routesDir, registry as any, errors)
        expect(paths).toContain('/docs/a/b')
        expect(paths).toContain('/docs/c')
      } finally {
        f.cleanup()
      }
    })
  })

  describe('SSR entry source — getStaticPaths registry', () => {
    it('emits a __getStaticPathsRegistry collector that walks routes + children', () => {
      // The SSR sub-build exports a Map<urlPath, getStaticPaths>. The
      // collector must:
      // 1. Walk the top-level routes array
      // 2. Recurse into route.children (nested layouts)
      // 3. Skip routes without a getStaticPaths function
      // 4. Use the route's `path` as the map key
      expect(_internal.SSR_ENTRY_SOURCE).toContain('__getStaticPathsRegistry')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('collectStaticPathsRegistry')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('typeof r.getStaticPaths === "function"')
      expect(_internal.SSR_ENTRY_SOURCE).toContain('Array.isArray(r.children)')
    })
  })

  describe('output path resolution', () => {
    it('"/" → dist/index.html', () => {
      expect(_internal.resolveOutputPath('/dist', '/')).toBe('/dist/index.html')
    })

    it('"/about" → dist/about/index.html', () => {
      expect(_internal.resolveOutputPath('/dist', '/about')).toBe('/dist/about/index.html')
    })

    it('"/foo/bar" → dist/foo/bar/index.html', () => {
      expect(_internal.resolveOutputPath('/dist', '/foo/bar')).toBe('/dist/foo/bar/index.html')
    })

    it('explicit .html → dist/<path>', () => {
      expect(_internal.resolveOutputPath('/dist', '/sitemap.html')).toBe('/dist/sitemap.html')
    })
  })

  describe('closeBundle is no-op when mode != "ssg"', () => {
    // The plugin returns from closeBundle without side effects when SSG
    // is not configured. We can't easily run the real closeBundle in unit
    // tests (it triggers a Vite SSR build), but we can verify the early
    // return path doesn't throw when called against a non-SSG config.
    it('closeBundle returns silently for SPA mode', async () => {
      const plugin = ssgPlugin({ mode: 'spa' }) as any
      // configResolved must be called first to set distDir.
      plugin.configResolved({ root: '/tmp', build: { outDir: 'dist' } })
      // Should not throw and should not attempt any SSR build
      await expect(plugin.closeBundle()).resolves.toBeUndefined()
    })

    it('closeBundle returns silently for SSR mode', async () => {
      const plugin = ssgPlugin({ mode: 'ssr' }) as any
      plugin.configResolved({ root: '/tmp', build: { outDir: 'dist' } })
      await expect(plugin.closeBundle()).resolves.toBeUndefined()
    })
  })
})
