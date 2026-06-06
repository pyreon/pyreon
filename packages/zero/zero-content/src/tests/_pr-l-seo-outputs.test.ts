// PR-L — SEO + build outputs (audit M19)
//
// Three pure builders + their Vite plugin auto-emit hook:
//
//  - generateSitemap — sitemap.xml per sitemap.org spec
//  - generateRssFeed — RSS 2.0 with ISO→RFC-822 date conversion
//  - generateLlmsTxt — llmstxt.org index format
//  - emitSeoOutputs  — plugin closeBundle hook honoring the
//                       `seo: { sitemap, rss, llms }` opt-ins

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  generateLlmsTxt,
  generateRssFeed,
  generateSitemap,
  joinUrl,
  toRfc822,
} from '../index'
import { emitSeoOutputs } from '../plugin'

describe('PR-L — joinUrl helper', () => {
  it.each([
    ['https://x.com', '/a', 'https://x.com/a'],
    ['https://x.com/', '/a', 'https://x.com/a'],
    ['https://x.com', 'a', 'https://x.com/a'],
    ['https://x.com', '', 'https://x.com'],
    ['https://x.com//', '/a', 'https://x.com/a'],
  ])('joinUrl(%j, %j) === %j', (base, p, expected) => {
    expect(joinUrl(base, p)).toBe(expected)
  })
})

describe('PR-L — generateSitemap', () => {
  it('emits a minimal sitemap with one URL', () => {
    const xml = generateSitemap({
      baseUrl: 'https://x.com',
      pages: [{ path: '/a' }],
    })
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://x.com/a</loc>')
    expect(xml).toContain('</urlset>')
  })

  it('includes optional lastmod / changefreq / priority when set', () => {
    const xml = generateSitemap({
      baseUrl: 'https://x.com',
      pages: [
        {
          path: '/a',
          lastmod: '2025-01-01',
          changefreq: 'weekly',
          priority: 0.7,
        },
      ],
    })
    expect(xml).toContain('<lastmod>2025-01-01</lastmod>')
    expect(xml).toContain('<changefreq>weekly</changefreq>')
    expect(xml).toContain('<priority>0.7</priority>')
  })

  it('clamps priority to [0.0, 1.0]', () => {
    expect(
      generateSitemap({
        baseUrl: 'https://x.com',
        pages: [{ path: '/a', priority: 2.5 }],
      }),
    ).toContain('<priority>1.0</priority>')
    expect(
      generateSitemap({
        baseUrl: 'https://x.com',
        pages: [{ path: '/a', priority: -1 }],
      }),
    ).toContain('<priority>0.0</priority>')
  })

  it('escapes XML-sensitive characters in URLs', () => {
    const xml = generateSitemap({
      baseUrl: 'https://x.com',
      pages: [{ path: '/a?b=1&c=2' }],
    })
    expect(xml).toContain('&amp;')
    expect(xml).not.toContain('?b=1&c=')
  })
})

describe('PR-L — generateRssFeed', () => {
  it('emits a minimal feed with channel metadata + one item', () => {
    const xml = generateRssFeed({
      title: 'Blog',
      baseUrl: 'https://x.com',
      items: [{ title: 'Post', link: '/blog/post' }],
    })
    expect(xml).toContain('<rss version="2.0">')
    expect(xml).toContain('<title>Blog</title>')
    expect(xml).toContain('<link>https://x.com</link>')
    expect(xml).toContain('<title>Post</title>')
    expect(xml).toContain('<link>https://x.com/blog/post</link>')
    expect(xml).toContain('<guid isPermaLink="true">https://x.com/blog/post</guid>')
  })

  it.each([
    ['2025-01-15T12:00:00Z', 'Wed, 15 Jan 2025 12:00:00 GMT'],
    ['2025-12-31T23:59:59Z', 'Wed, 31 Dec 2025 23:59:59 GMT'],
  ])('toRfc822(%j) === %j', (iso, expected) => {
    expect(toRfc822(iso)).toBe(expected)
  })

  it('passes invalid dates through verbatim', () => {
    expect(toRfc822('not a date')).toBe('not a date')
  })

  it('emits lastBuildDate from explicit override OR first item pubDate', () => {
    const explicit = generateRssFeed({
      title: 't',
      baseUrl: 'https://x.com',
      items: [],
      lastBuildDate: '2025-06-01T00:00:00Z',
    })
    expect(explicit).toContain('<lastBuildDate>Sun, 01 Jun 2025 00:00:00 GMT</lastBuildDate>')

    const fromItem = generateRssFeed({
      title: 't',
      baseUrl: 'https://x.com',
      items: [{ title: 'p', link: '/p', pubDate: '2024-01-02T00:00:00Z' }],
    })
    expect(fromItem).toContain('<lastBuildDate>Tue, 02 Jan 2024 00:00:00 GMT</lastBuildDate>')
  })

  it('renders item categories', () => {
    const xml = generateRssFeed({
      title: 't',
      baseUrl: 'https://x.com',
      items: [
        {
          title: 'p',
          link: '/p',
          categories: ['pyreon', 'release'],
        },
      ],
    })
    expect(xml).toContain('<category>pyreon</category>')
    expect(xml).toContain('<category>release</category>')
  })

  it('honors a custom GUID with isPermaLink=false', () => {
    const xml = generateRssFeed({
      title: 't',
      baseUrl: 'https://x.com',
      items: [{ title: 'p', link: '/p', guid: 'urn:custom-id' }],
    })
    expect(xml).toContain('<guid isPermaLink="false">urn:custom-id</guid>')
  })
})

describe('PR-L — generateLlmsTxt', () => {
  it('emits the minimal shape with title + sections', () => {
    const txt = generateLlmsTxt({
      title: 'Pyreon',
      baseUrl: 'https://x.com',
      sections: [
        {
          name: 'Docs',
          pages: [
            { title: 'Intro', path: '/docs/intro' },
            { title: 'Guide', path: '/docs/guide', description: 'A short guide' },
          ],
        },
      ],
    })
    expect(txt).toContain('# Pyreon\n')
    expect(txt).toContain('## Docs')
    expect(txt).toContain('- [Intro](https://x.com/docs/intro)')
    expect(txt).toContain('- [Guide](https://x.com/docs/guide): A short guide')
  })

  it('renders a blockquote description when supplied', () => {
    const txt = generateLlmsTxt({
      title: 'X',
      baseUrl: 'https://x.com',
      description: 'A demo',
      sections: [],
    })
    expect(txt).toContain('> A demo')
  })

  it('handles empty sections without crashing', () => {
    const txt = generateLlmsTxt({
      title: 'X',
      baseUrl: 'https://x.com',
      sections: [],
    })
    expect(txt).toContain('# X')
  })
})

describe('PR-L — emitSeoOutputs (plugin closeBundle hook)', () => {
  let outDir: string

  beforeEach(async () => {
    outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-content-seo-'))
  })

  afterEach(async () => {
    await fs.rm(outDir, { recursive: true, force: true })
  })

  const entries = {
    docs: [
      {
        slug: 'intro',
        title: 'Introduction',
        description: 'Start here',
        headings: [],
        body: '',
        url: '/docs/intro',
      },
      {
        slug: 'guide',
        title: 'Guide',
        headings: [],
        body: '',
        url: '/docs/guide',
      },
    ],
    blog: [
      {
        slug: 'post1',
        title: 'First Post',
        description: 'Hello world',
        headings: [],
        body: '',
        url: '/blog/post1',
      },
    ],
  }

  const warnings: string[] = []
  const warn = (m: string) => warnings.push(m)

  it('warns when baseUrl is missing', async () => {
    warnings.length = 0
    await emitSeoOutputs({ sitemap: true }, entries, outDir, warn)
    expect(warnings.some((w) => w.includes('baseUrl'))).toBe(true)
  })

  it('emits sitemap.xml when sitemap: true', async () => {
    warnings.length = 0
    await emitSeoOutputs(
      { baseUrl: 'https://x.com', sitemap: true },
      entries,
      outDir,
      warn,
    )
    const xml = await fs.readFile(path.join(outDir, 'sitemap.xml'), 'utf8')
    expect(xml).toContain('<loc>https://x.com/docs/intro</loc>')
    expect(xml).toContain('<loc>https://x.com/blog/post1</loc>')
  })

  it('honors per-collection URL overrides', async () => {
    warnings.length = 0
    await emitSeoOutputs(
      {
        baseUrl: 'https://x.com',
        sitemap: true,
        collectionUrls: { blog: '/news' },
      },
      entries,
      outDir,
      warn,
    )
    const xml = await fs.readFile(path.join(outDir, 'sitemap.xml'), 'utf8')
    expect(xml).toContain('<loc>https://x.com/news/post1</loc>')
    expect(xml).not.toContain('/blog/post1')
  })

  it('skips a collection when its URL override is null', async () => {
    warnings.length = 0
    await emitSeoOutputs(
      {
        baseUrl: 'https://x.com',
        sitemap: true,
        collectionUrls: { blog: null },
      },
      entries,
      outDir,
      warn,
    )
    const xml = await fs.readFile(path.join(outDir, 'sitemap.xml'), 'utf8')
    expect(xml).toContain('/docs/intro')
    expect(xml).not.toContain('/blog/')
  })

  it('emits rss.xml only when scoped to a collection', async () => {
    warnings.length = 0
    await emitSeoOutputs(
      {
        baseUrl: 'https://x.com',
        rss: { collection: 'blog', title: 'My Blog' },
      },
      entries,
      outDir,
      warn,
    )
    const xml = await fs.readFile(path.join(outDir, 'rss.xml'), 'utf8')
    expect(xml).toContain('<title>My Blog</title>')
    expect(xml).toContain('<title>First Post</title>')
    expect(xml).toContain('<description>Hello world</description>')
  })

  it('warns when rss: true without scope', async () => {
    warnings.length = 0
    await emitSeoOutputs(
      { baseUrl: 'https://x.com', rss: true },
      entries,
      outDir,
      warn,
    )
    expect(warnings.some((w) => w.includes('rss: true'))).toBe(true)
  })

  it('emits llms.txt with collections as sections', async () => {
    warnings.length = 0
    await emitSeoOutputs(
      {
        baseUrl: 'https://x.com',
        llms: { title: 'Pyreon', description: 'Signal UI' },
      },
      entries,
      outDir,
      warn,
    )
    const txt = await fs.readFile(path.join(outDir, 'llms.txt'), 'utf8')
    expect(txt).toContain('# Pyreon')
    expect(txt).toContain('> Signal UI')
    expect(txt).toContain('## Docs')
    expect(txt).toContain('## Blog')
    expect(txt).toContain('[Introduction](https://x.com/docs/intro): Start here')
  })

  it('emits all three when each is enabled', async () => {
    warnings.length = 0
    await emitSeoOutputs(
      {
        baseUrl: 'https://x.com',
        sitemap: true,
        rss: { collection: 'blog', title: 'B' },
        llms: true,
      },
      entries,
      outDir,
      warn,
    )
    expect(await fs.stat(path.join(outDir, 'sitemap.xml'))).toBeTruthy()
    expect(await fs.stat(path.join(outDir, 'rss.xml'))).toBeTruthy()
    expect(await fs.stat(path.join(outDir, 'llms.txt'))).toBeTruthy()
  })
})
