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

    it('resolves the synthetic SSR entry id', () => {
      const plugin = ssgPlugin() as any
      const resolved = plugin.resolveId(_internal.SYNTHETIC_SSR_ID)
      expect(resolved).toBe(_internal.SYNTHETIC_SSR_ID)
    })

    it('does not resolve other ids', () => {
      const plugin = ssgPlugin() as any
      expect(plugin.resolveId('some-other-id')).toBeNull()
    })

    it('loads the synthetic entry source', () => {
      const plugin = ssgPlugin() as any
      const code = plugin.load(_internal.SYNTHETIC_SSR_ID)
      expect(code).toContain('virtual:zero/routes')
      expect(code).toContain('createServer')
      expect(code).toContain('export default')
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
