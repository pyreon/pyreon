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
