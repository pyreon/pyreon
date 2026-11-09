// @vitest-environment node
/**
 * Draft and scheduled (future-dated) entries stay out of every public
 * surface of a production build: the bundle (so the page is not routable),
 * `getCollection`, the search index, the sitemap, the RSS feed and
 * llms.txt.
 *
 * The real-build test is the one that matters. Each surface used to decide
 * on its own, and a surface that forgets is a leak nobody sees: the page
 * 404s, yet the post sits in the public search index or the feed, and RSS
 * importers republish it the same hour. So the test builds a real project
 * through Vite and reads what landed in `dist/`.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { build } from 'vite'
import content, { resolvePublishNow } from '../plugin'
import { isPublished } from '../publish'
import { _setRegistry, getCollection } from '../runtime'
import { renderVirtualCollections } from '../virtual-collections'

const NOW = Date.parse('2026-11-16T12:00:00Z')

describe('isPublished', () => {
  it('a draft is never published', () => {
    expect(isPublished({ draft: true, date: '2020-01-01' }, 'date', NOW)).toBe(false)
  })

  it('a future publishDate is unpublished until that instant', () => {
    expect(isPublished({ date: '2026-11-17' }, 'date', NOW)).toBe(false)
    expect(isPublished({ date: '2026-11-16' }, 'date', NOW)).toBe(true)
    // YAML reads an unquoted date as a Date object.
    expect(isPublished({ date: new Date('2026-11-17') }, 'date', NOW)).toBe(false)
    expect(isPublished({ date: new Date('2026-11-01') }, 'date', NOW)).toBe(true)
  })

  it('ignores dates on a collection that declares no publishDate', () => {
    expect(isPublished({ date: '2099-01-01' }, undefined, NOW)).toBe(true)
  })

  it('treats a missing or unparseable date as published (the schema enforces presence)', () => {
    expect(isPublished({}, 'date', NOW)).toBe(true)
    expect(isPublished({ date: 'soon' }, 'date', NOW)).toBe(true)
  })
})

describe('resolvePublishNow', () => {
  it('reads PYREON_CONTENT_NOW, and refuses a value that is not a date', () => {
    expect(resolvePublishNow({ PYREON_CONTENT_NOW: '2026-11-16' })).toBe(Date.parse('2026-11-16'))
    expect(() => resolvePublishNow({ PYREON_CONTENT_NOW: 'monday' })).toThrow(/PYREON_CONTENT_NOW/)
    const t = resolvePublishNow({})
    expect(Math.abs(t - Date.now())).toBeLessThan(5_000)
  })
})

describe('getCollection skips scheduled entries with drafts', () => {
  afterEach(() => _setRegistry({}))
  const entry = (slug: string, fm: Record<string, unknown>) => async () => ({
    slug,
    frontmatter: { title: slug, ...fm },
    headings: [],
    default: () => null,
  })

  it('judges against the build cutoff, not the visitor clock', async () => {
    _setRegistry({
      blog: {
        name: 'blog',
        type: 'pages',
        publishDate: 'date',
        publishCutoff: NOW,
        loaders: {
          past: entry('past', { date: '2026-11-01' }),
          future: entry('future', { date: '2026-11-20' }),
          wip: entry('wip', { date: '2026-11-01', draft: true }),
        },
      } as never,
    })
    const slugs = (await getCollection('blog', { includeDrafts: false })).map((e) => e.slug)
    expect(slugs).toEqual(['past'])
    // Dev / explicit opt-in still sees everything.
    expect((await getCollection('blog', { includeDrafts: true })).length).toBe(3)
  })
})

describe('renderVirtualCollections', () => {
  it('turns excluded files into negative glob patterns and carries the publish fields', () => {
    const out = renderVirtualCollections({
      config: { collections: { blog: { type: 'pages', schema: {}, publishDate: 'date' } } },
      root: '/abs/proj',
      exclude: { blog: ['/abs/proj/src/content/blog/z.md', '/abs/proj/src/content/blog/a.md'] },
      publishCutoff: NOW,
    })
    expect(out).toContain(
      'import.meta.glob(["/src/content/blog/**/*.{md,mdx}","!/src/content/blog/a.md","!/src/content/blog/z.md"])',
    )
    expect(out).toContain('publishDate: "date"')
    expect(out).toContain(`publishCutoff: ${NOW}`)
  })
})

// ─── A real production build ──────────────────────────────────────────────

const FIXTURE = path.join(process.cwd(), 'src', 'tests', '__publish_fixture_tmp__')
const DIST = path.join(FIXTURE, 'dist')

const post = (title: string, fm: string, body: string) =>
  `---\ntitle: ${title}\ndescription: About ${title}\n${fm}\n---\n\n${body}\n`

async function readDist(rel: string): Promise<string> {
  return fs.readFile(path.join(DIST, rel), 'utf8')
}

async function readAllJs(): Promise<string> {
  const files = await fs.readdir(DIST, { recursive: true })
  const js = files.filter((f) => f.endsWith('.js'))
  return (await Promise.all(js.map((f) => readDist(f)))).join('\n')
}

describe('a production build leaves unpublished entries out of every output', () => {
  beforeAll(async () => {
    await fs.rm(FIXTURE, { recursive: true, force: true })
    const blog = path.join(FIXTURE, 'src', 'content', 'blog')
    await fs.mkdir(blog, { recursive: true })
    await fs.writeFile(
      path.join(FIXTURE, 'content.config.mjs'),
      `export default { collections: { blog: { type: 'pages', path: 'src/content/blog', schema: {}, publishDate: 'date', unpublished: 'omit' } } }\n`,
    )
    await fs.writeFile(
      path.join(blog, 'live-post.md'),
      post(
        'Live post',
        'date: 2026-11-10\ntags: [web, signals]',
        'LIVE_BODY_MARKER with [a link](/docs/x).',
      ),
    )
    await fs.writeFile(
      path.join(blog, 'older-post.md'),
      post('Older post', 'date: 2026-10-01', 'OLDER_BODY_MARKER'),
    )
    await fs.writeFile(
      path.join(blog, 'future-post.md'),
      post('Future post', 'date: 2026-11-23', 'FUTURE_BODY_MARKER'),
    )
    await fs.writeFile(
      path.join(blog, 'draft-post.md'),
      post('Draft post', 'date: 2026-11-01\ndraft: true', 'DRAFT_BODY_MARKER'),
    )
    await fs.writeFile(
      path.join(FIXTURE, 'main.js'),
      `import 'virtual:zero-content/collections'\nexport { getCollection } from '@pyreon/zero-content'\n`,
    )

    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PYREON_CONTENT_NOW', new Date(NOW).toISOString())
    try {
      await build({
        root: FIXTURE,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          content({
            seo: {
              baseUrl: 'https://example.dev',
              sitemap: true,
              llms: true,
              rss: { collection: 'blog', title: 'Blog', path: 'blog/rss.xml', content: 'full' },
            },
          }),
        ],
        build: {
          outDir: DIST,
          emptyOutDir: true,
          minify: false,
          lib: { entry: path.join(FIXTURE, 'main.js'), formats: ['es'], fileName: 'main' },
          rollupOptions: { external: [/^@pyreon\//] },
        },
      })
    } finally {
      vi.unstubAllEnvs()
    }
  }, 60_000)

  afterAll(async () => {
    await fs.rm(FIXTURE, { recursive: true, force: true })
  })

  it('does not bundle them, so their routes cannot resolve', async () => {
    const js = await readAllJs()
    expect(js).toContain('LIVE_BODY_MARKER')
    expect(js).toContain('OLDER_BODY_MARKER')
    expect(js).not.toContain('FUTURE_BODY_MARKER')
    expect(js).not.toContain('DRAFT_BODY_MARKER')
  })

  it('keeps them out of the RSS feed, which lists the rest newest first with full bodies', async () => {
    const rss = await readDist('blog/rss.xml')
    expect(rss).not.toContain('Future post')
    expect(rss).not.toContain('Draft post')
    const live = rss.indexOf('<title>Live post</title>')
    const older = rss.indexOf('<title>Older post</title>')
    expect(live).toBeGreaterThan(-1)
    expect(older).toBeGreaterThan(live)
    expect(rss).toContain('<link>https://example.dev/blog/live-post</link>')
    expect(rss).toContain('<guid isPermaLink="true">https://example.dev/blog/live-post</guid>')
    expect(rss).toContain('<pubDate>Tue, 10 Nov 2026 00:00:00 GMT</pubDate>')
    expect(rss).toContain('<category>signals</category>')
    expect(rss).toContain('href="https://example.dev/blog/rss.xml" rel="self"')
    // Full body, with the root-relative link made absolute for readers.
    expect(rss).toContain(
      '<content:encoded><![CDATA[<p>LIVE_BODY_MARKER with <a href="https://example.dev/docs/x">a link</a>.</p>]]></content:encoded>',
    )
  })

  it('keeps them out of the sitemap, the search index and llms.txt', async () => {
    const sitemap = await readDist('sitemap.xml')
    expect(sitemap).toContain('/blog/live-post')
    expect(sitemap).not.toContain('future-post')
    expect(sitemap).not.toContain('draft-post')

    const files = await fs.readdir(DIST)
    const index = (
      await Promise.all(files.filter((f) => f.startsWith('search-index')).map((f) => readDist(f)))
    ).join('\n')
    expect(index).toContain('Live post')
    expect(index).not.toContain('Future post')
    expect(index).not.toContain('Draft post')

    const llms = await readDist('llms.txt')
    expect(llms).toContain('Live post')
    expect(llms).not.toContain('Future post')
    expect(llms).not.toContain('Draft post')
  })
})
