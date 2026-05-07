import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRobots, generateSitemap, jsonLd, seoPlugin } from '../seo'

describe('generateSitemap', () => {
  const config = { origin: 'https://example.com' }

  it('generates sitemap from route files', () => {
    const files = ['index.tsx', 'about.tsx', 'posts/index.tsx']
    const sitemap = generateSitemap(files, config)

    expect(sitemap).toContain('<?xml version="1.0"')
    expect(sitemap).toContain('<loc>https://example.com</loc>')
    expect(sitemap).toContain('<loc>https://example.com/about</loc>')
    expect(sitemap).toContain('<loc>https://example.com/posts/</loc>')
  })

  it('excludes layout, error, and loading files', () => {
    const files = ['index.tsx', '_layout.tsx', '_error.tsx', '_loading.tsx']
    const sitemap = generateSitemap(files, config)

    expect(sitemap).toContain('<loc>https://example.com</loc>')
    expect(sitemap).not.toContain('_layout')
    expect(sitemap).not.toContain('_error')
    expect(sitemap).not.toContain('_loading')
  })

  it('skips dynamic routes', () => {
    const files = ['index.tsx', 'posts/[id].tsx', 'blog/[...slug].tsx']
    const sitemap = generateSitemap(files, config)

    expect(sitemap).toContain('<loc>https://example.com</loc>')
    expect(sitemap).not.toContain('[id]')
    expect(sitemap).not.toContain('[...slug]')
  })

  it('strips route groups from paths', () => {
    const files = ['(admin)/dashboard.tsx']
    const sitemap = generateSitemap(files, config)

    expect(sitemap).toContain('<loc>https://example.com/dashboard</loc>')
    expect(sitemap).not.toContain('(admin)')
  })

  it('respects exclude paths', () => {
    const files = ['index.tsx', 'about.tsx', 'admin/settings.tsx']
    const sitemap = generateSitemap(files, {
      ...config,
      exclude: ['/admin'],
    })

    expect(sitemap).toContain('<loc>https://example.com</loc>')
    expect(sitemap).toContain('<loc>https://example.com/about</loc>')
    expect(sitemap).not.toContain('admin')
  })

  it('includes additional paths for dynamic routes', () => {
    const files = ['index.tsx']
    const sitemap = generateSitemap(files, {
      ...config,
      additionalPaths: [
        { path: '/posts/1', changefreq: 'daily', priority: 0.9 },
        { path: '/posts/2', lastmod: '2026-03-01' },
      ],
    })

    expect(sitemap).toContain('<loc>https://example.com/posts/1</loc>')
    expect(sitemap).toContain('<changefreq>daily</changefreq>')
    expect(sitemap).toContain('<priority>0.9</priority>')
    expect(sitemap).toContain('<lastmod>2026-03-01</lastmod>')
  })

  it('uses custom changefreq and priority', () => {
    const files = ['index.tsx']
    const sitemap = generateSitemap(files, {
      ...config,
      changefreq: 'daily',
      priority: 1.0,
    })

    expect(sitemap).toContain('<changefreq>daily</changefreq>')
    expect(sitemap).toContain('<priority>1</priority>')
  })
})

describe('generateRobots', () => {
  it('generates default robots.txt', () => {
    const robots = generateRobots()
    expect(robots).toContain('User-agent: *')
    expect(robots).toContain('Allow: /')
  })

  it('generates robots with custom rules', () => {
    const robots = generateRobots({
      rules: [
        { userAgent: '*', allow: ['/'], disallow: ['/admin', '/api'] },
        { userAgent: 'Googlebot', allow: ['/'], crawlDelay: 2 },
      ],
    })

    expect(robots).toContain('User-agent: *')
    expect(robots).toContain('Disallow: /admin')
    expect(robots).toContain('Disallow: /api')
    expect(robots).toContain('User-agent: Googlebot')
    expect(robots).toContain('Crawl-delay: 2')
  })

  it('includes sitemap URL', () => {
    const robots = generateRobots({
      sitemap: 'https://example.com/sitemap.xml',
    })

    expect(robots).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it('includes host directive', () => {
    const robots = generateRobots({
      host: 'https://example.com',
    })

    expect(robots).toContain('Host: https://example.com')
  })
})

describe('jsonLd', () => {
  it('generates JSON-LD script tag', () => {
    const result = jsonLd({
      '@type': 'WebSite',
      name: 'My Site',
      url: 'https://example.com',
    })

    expect(result).toContain('<script type="application/ld+json">')
    const jsonStr = result.slice(result.indexOf('>') + 1, result.lastIndexOf('<'))
    const data = JSON.parse(jsonStr)
    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('WebSite')
    expect(data.name).toBe('My Site')
  })

  it('preserves all data fields', () => {
    const result = jsonLd({
      '@type': 'Article',
      headline: 'Test Article',
      author: { '@type': 'Person', name: 'Author' },
    })

    const jsonStr = result.slice(result.indexOf('>') + 1, result.lastIndexOf('<'))
    const data = JSON.parse(jsonStr)
    expect(data.headline).toBe('Test Article')
    expect(data.author.name).toBe('Author')
  })
})

// ─── PR F — useSsgPaths integration ─────────────────────────────────────────

describe('seoPlugin — useSsgPaths (PR F)', () => {
  // Each test writes a fresh dist dir with a `_pyreon-ssg-paths.json`
  // manifest, runs the plugin's closeBundle, asserts the resulting
  // sitemap.xml content. The plugin's `configResolved` captures
  // `distDir`; mock the minimum shape Vite passes in.
  function makeFixture(paths: string[] | null) {
    const root = mkdtempSync(join(tmpdir(), 'pyreon-seo-fixture-'))
    const distDir = join(root, 'dist')
    mkdirSync(distDir, { recursive: true })
    if (paths !== null) {
      writeFileSync(
        join(distDir, '_pyreon-ssg-paths.json'),
        JSON.stringify({ paths }, null, 2),
      )
    }
    return {
      root,
      distDir,
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    }
  }

  it('moves to closeBundle + sets enforce: "post" when useSsgPaths is true', () => {
    // Without `useSsgPaths`, `enforce` is undefined (default) AND
    // sitemap emits at generateBundle. With `useSsgPaths`, `enforce`
    // flips to 'post' AND closeBundle handles emission. Both contracts
    // matter — without enforce: 'post' the plugin might run BEFORE the
    // SSG plugin's manifest-write at closeBundle.
    const off = seoPlugin({ sitemap: { origin: 'https://example.com' } }) as any
    const on = seoPlugin({ sitemap: { origin: 'https://example.com', useSsgPaths: true } }) as any
    expect(off.enforce).toBeUndefined()
    expect(on.enforce).toBe('post')
  })

  it('reads the manifest at closeBundle + emits sitemap.xml with SSG paths', async () => {
    const f = makeFixture(['/', '/about', '/blog/post-a', '/blog/post-b'])
    try {
      const plugin = seoPlugin({
        sitemap: { origin: 'https://example.com', useSsgPaths: true },
      }) as any
      plugin.configResolved({ root: f.root, build: { outDir: 'dist' } })
      await plugin.closeBundle()

      const sitemapPath = join(f.distDir, 'sitemap.xml')
      expect(existsSync(sitemapPath)).toBe(true)
      const xml = readFileSync(sitemapPath, 'utf-8')
      // Every manifest path appears as a <loc>.
      expect(xml).toContain('<loc>https://example.com</loc>')
      expect(xml).toContain('<loc>https://example.com/about</loc>')
      expect(xml).toContain('<loc>https://example.com/blog/post-a</loc>')
      expect(xml).toContain('<loc>https://example.com/blog/post-b</loc>')
    } finally {
      f.cleanup()
    }
  })

  it('cleans up the manifest after reading (internal artifact)', async () => {
    const f = makeFixture(['/', '/about'])
    const manifestPath = join(f.distDir, '_pyreon-ssg-paths.json')
    expect(existsSync(manifestPath)).toBe(true)
    try {
      const plugin = seoPlugin({
        sitemap: { origin: 'https://example.com', useSsgPaths: true },
      }) as any
      plugin.configResolved({ root: f.root, build: { outDir: 'dist' } })
      await plugin.closeBundle()
      // Manifest is internal — must NOT remain in the published dist.
      expect(existsSync(manifestPath)).toBe(false)
    } finally {
      f.cleanup()
    }
  })

  it('falls back gracefully when manifest is missing (no SSG step ran)', async () => {
    const f = makeFixture(null)
    try {
      const plugin = seoPlugin({
        sitemap: { origin: 'https://example.com', useSsgPaths: true },
      }) as any
      plugin.configResolved({ root: f.root, build: { outDir: 'dist' } })
      // Should not throw — sitemap may still emit from the file-scan
      // fallback (or be empty if no routes found). The contract is
      // "don't crash when ssgPlugin didn't run."
      await expect(plugin.closeBundle()).resolves.toBeUndefined()
    } finally {
      f.cleanup()
    }
  })

  it('skips closeBundle emission entirely when useSsgPaths is false', async () => {
    const f = makeFixture(['/should-not-appear'])
    try {
      const plugin = seoPlugin({
        sitemap: { origin: 'https://example.com' },
      }) as any
      plugin.configResolved({ root: f.root, build: { outDir: 'dist' } })
      await plugin.closeBundle()
      // Without `useSsgPaths`, closeBundle must be a no-op — sitemap
      // emission stays at generateBundle for that path.
      expect(existsSync(join(f.distDir, 'sitemap.xml'))).toBe(false)
    } finally {
      f.cleanup()
    }
  })

  it('ignores malformed manifest JSON (bad shape)', async () => {
    const f = makeFixture(null)
    // Hand-write a malformed manifest — wrong shape entirely.
    writeFileSync(join(f.distDir, '_pyreon-ssg-paths.json'), '{"not-paths": "garbage"}')
    try {
      const plugin = seoPlugin({
        sitemap: { origin: 'https://example.com', useSsgPaths: true },
      }) as any
      plugin.configResolved({ root: f.root, build: { outDir: 'dist' } })
      await plugin.closeBundle()
      // Plugin must NOT crash on malformed manifest. It should fall
      // back to file-scan-only behaviour.
      // (Whether sitemap emits depends on whether the file-scan finds
      // any routes — irrelevant to this assertion.)
    } finally {
      f.cleanup()
    }
  })

  it('filters non-string entries from the manifest paths array', async () => {
    const f = makeFixture(null)
    writeFileSync(
      join(f.distDir, '_pyreon-ssg-paths.json'),
      // Mixed types — only strings should land in the sitemap.
      JSON.stringify({ paths: ['/valid', 42, null, '/also-valid', { not: 'string' }] }),
    )
    try {
      const plugin = seoPlugin({
        sitemap: { origin: 'https://example.com', useSsgPaths: true },
      }) as any
      plugin.configResolved({ root: f.root, build: { outDir: 'dist' } })
      await plugin.closeBundle()

      const sitemapPath = join(f.distDir, 'sitemap.xml')
      const xml = readFileSync(sitemapPath, 'utf-8')
      expect(xml).toContain('<loc>https://example.com/valid</loc>')
      expect(xml).toContain('<loc>https://example.com/also-valid</loc>')
      // Non-string entries are dropped silently — sitemap stays clean.
      expect(xml).not.toContain('<loc>https://example.com42</loc>')
    } finally {
      f.cleanup()
    }
  })
})
