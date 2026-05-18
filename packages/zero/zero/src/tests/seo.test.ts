import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clusterPathsByLocale,
  generateRobots,
  generateSitemap,
  jsonLd,
  resolveHreflangI18n,
  seoPlugin,
  stripLocalePrefix,
} from '../seo'

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

  it('dedups a path present in BOTH the route scan and additionalPaths (no duplicate <url>)', () => {
    // Regression: the same static route routinely appears in the
    // file-system scan AND `additionalPaths` (SSG-emitted paths merged
    // via seoPlugin). The non-i18n cluster path was a raw 1:1 map with
    // no dedup → a duplicate `<url>`/`<loc>` reached the sitemap.
    const files = ['index.tsx', 'about.tsx']
    const sitemap = generateSitemap(files, {
      origin: 'https://example.com',
      additionalPaths: [{ path: '/about' }, { path: '/extra' }],
    })
    const aboutLocs = sitemap.split('<loc>https://example.com/about</loc>').length - 1
    expect(aboutLocs).toBe(1) // exactly one, not two
    expect(sitemap).toContain('<loc>https://example.com/extra</loc>')
    // Total <url> blocks: index + about + extra = 3 (about not doubled)
    expect(sitemap.split('<url>').length - 1).toBe(3)
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

// ─── PR K — hreflang sitemap cross-references ────────────────────────────────

describe('stripLocalePrefix (PR K)', () => {
  const locales = ['en', 'de', 'cs']

  it('strips a locale prefix from a non-root path', () => {
    expect(stripLocalePrefix('/de/about', locales, 'en', 'prefix-except-default')).toEqual({
      unPrefixed: '/about',
      locale: 'de',
    })
  })

  it('handles the locale root /de → /', () => {
    expect(stripLocalePrefix('/de', locales, 'en', 'prefix-except-default')).toEqual({
      unPrefixed: '/',
      locale: 'de',
    })
  })

  it('treats an unprefixed path as default-locale under prefix-except-default', () => {
    expect(stripLocalePrefix('/about', locales, 'en', 'prefix-except-default')).toEqual({
      unPrefixed: '/about',
      locale: 'en',
    })
  })

  it('treats an unprefixed path as standalone under prefix strategy', () => {
    // Under `prefix` every locale carries an explicit prefix; an
    // unprefixed URL doesn't belong to any locale subtree.
    expect(stripLocalePrefix('/about', locales, 'en', 'prefix')).toEqual({
      unPrefixed: '/about',
      locale: null,
    })
  })

  it('does NOT match partial locale prefixes', () => {
    // `/encyclopedia` must NOT be detected as locale `en` — only exact
    // `/en` or `/en/*` matches.
    expect(stripLocalePrefix('/encyclopedia', locales, 'en', 'prefix-except-default')).toEqual({
      unPrefixed: '/encyclopedia',
      locale: 'en', // unprefixed → default
    })
  })
})

describe('clusterPathsByLocale (PR K)', () => {
  const i18n = { locales: ['en', 'de', 'cs'], defaultLocale: 'en' } as const

  it('groups variants of the same un-prefixed path into one cluster', () => {
    const entries = [
      { path: '/about' },
      { path: '/de/about' },
      { path: '/cs/about' },
    ]
    const clusters = clusterPathsByLocale(entries, i18n)
    expect(clusters).toHaveLength(1)
    const cluster = clusters[0]!
    expect(cluster.variantsByLocale.size).toBe(3)
    expect(cluster.variantsByLocale.get('en')).toEqual({ path: '/about' })
    expect(cluster.variantsByLocale.get('de')).toEqual({ path: '/de/about' })
    expect(cluster.variantsByLocale.get('cs')).toEqual({ path: '/cs/about' })
  })

  it('picks the default-locale variant as the canonical entry', () => {
    const entries = [
      { path: '/de/about' },
      { path: '/about' }, // default locale (en under prefix-except-default)
      { path: '/cs/about' },
    ]
    const clusters = clusterPathsByLocale(entries, i18n)
    expect(clusters[0]?.canonical.path).toBe('/about')
  })

  it('returns single-variant clusters when i18n is undefined', () => {
    const entries = [{ path: '/about' }, { path: '/de/about' }]
    const clusters = clusterPathsByLocale(entries, undefined)
    expect(clusters).toHaveLength(2)
    expect(clusters.every((c) => c.variantsByLocale.size === 1)).toBe(true)
  })

  it('preserves cluster order from caller insertion order', () => {
    // Insertion-order preservation matters for stable sitemap diffs
    // across build runs.
    const entries = [
      { path: '/de/zebra' },
      { path: '/zebra' },
      { path: '/about' },
    ]
    const clusters = clusterPathsByLocale(entries, i18n)
    expect(clusters[0]?.canonical.path).toBe('/zebra')
    expect(clusters[1]?.canonical.path).toBe('/about')
  })
})

describe('generateSitemap — hreflang (PR K)', () => {
  const i18n = {
    locales: ['en', 'de', 'cs'],
    defaultLocale: 'en',
  } as const
  const baseConfig = { origin: 'https://example.com' }

  it('emits xhtml:link siblings for each locale variant of a clustered URL', () => {
    const config = {
      ...baseConfig,
      additionalPaths: [
        { path: '/about' },
        { path: '/de/about' },
        { path: '/cs/about' },
      ],
    }
    const sitemap = generateSitemap([], config, i18n)
    // Clustered: 3 inputs → 1 <url> with 3 hreflang siblings + x-default.
    expect(sitemap.match(/<url>/g) ?? []).toHaveLength(1)
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>')
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/about"/>')
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="cs" href="https://example.com/cs/about"/>')
  })

  it('emits an x-default hreflang pointing at the default-locale URL', () => {
    const config = {
      ...baseConfig,
      additionalPaths: [{ path: '/about' }, { path: '/de/about' }],
    }
    const sitemap = generateSitemap([], config, i18n)
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about"/>')
  })

  it('declares xmlns:xhtml on the urlset only when hreflang is active', () => {
    const withI18n = generateSitemap(
      [],
      { ...baseConfig, additionalPaths: [{ path: '/' }, { path: '/de' }] },
      i18n,
    )
    expect(withI18n).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')

    const withoutI18n = generateSitemap([], {
      ...baseConfig,
      additionalPaths: [{ path: '/' }, { path: '/about' }],
    })
    expect(withoutI18n).not.toContain('xmlns:xhtml')
  })

  it('skips xhtml:link entries for single-variant clusters', () => {
    // A URL that only exists in one locale (e.g. an asset-only page
    // that didn't get duplicated) shouldn't emit hreflang siblings —
    // there's no alternate to point at.
    const config = {
      ...baseConfig,
      additionalPaths: [{ path: '/standalone' }, { path: '/de/about' }, { path: '/about' }],
    }
    const sitemap = generateSitemap([], config, i18n)
    // The /standalone URL has no alternate → no xhtml:link for that <url>
    const standaloneBlock = sitemap.slice(
      sitemap.indexOf('<loc>https://example.com/standalone</loc>'),
      sitemap.indexOf('</url>', sitemap.indexOf('<loc>https://example.com/standalone</loc>')),
    )
    expect(standaloneBlock).not.toContain('<xhtml:link')
    // The clustered /about URL DOES emit alternates.
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="de"')
  })

  it('handles locale root paths (/de → unPrefixed /)', () => {
    const config = {
      ...baseConfig,
      additionalPaths: [{ path: '/' }, { path: '/de' }, { path: '/cs' }],
    }
    const sitemap = generateSitemap([], config, i18n)
    // All three cluster as the "/" URL.
    expect(sitemap.match(/<url>/g) ?? []).toHaveLength(1)
    expect(sitemap).toContain('<loc>https://example.com</loc>')
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://example.com"/>')
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de"/>')
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="cs" href="https://example.com/cs"/>')
  })

  it('omits hreflang when i18n is undefined (back-compat)', () => {
    const config = {
      ...baseConfig,
      additionalPaths: [{ path: '/' }, { path: '/about' }],
    }
    const sitemap = generateSitemap([], config)
    expect(sitemap).not.toContain('<xhtml:link')
    expect(sitemap).not.toContain('xmlns:xhtml')
  })
})

describe('resolveHreflangI18n (PR K)', () => {
  const i18nFromManifest = { locales: ['en', 'de'], defaultLocale: 'en' } as const
  const userI18n = { locales: ['en', 'fr'], defaultLocale: 'en' } as const

  it('returns undefined when hreflang is false or omitted', () => {
    expect(resolveHreflangI18n(false, i18nFromManifest)).toBeUndefined()
    expect(resolveHreflangI18n(undefined, i18nFromManifest)).toBeUndefined()
  })

  it('returns the manifest config when hreflang is true', () => {
    expect(resolveHreflangI18n(true, i18nFromManifest)).toBe(i18nFromManifest)
  })

  it('returns undefined when hreflang is true but no manifest config exists', () => {
    // File-scan path (no SSG manifest) with `hreflang: true` → no-op.
    expect(resolveHreflangI18n(true, undefined)).toBeUndefined()
  })

  it('prefers explicit user config over manifest', () => {
    expect(resolveHreflangI18n(userI18n, i18nFromManifest)).toBe(userI18n)
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
