// @vitest-environment node
/**
 * A real Vite production build of a blog, then every blog surface rendered
 * from what the build emitted. A draft and a future-dated post exist in the
 * source; none of the index pages, tag pages, tag counts, page count,
 * previous/next, related posts, static paths, RSS feed or sitemap may show
 * them.
 *
 * The listing surfaces are all derived from one published list, so a
 * single regression (the virtual module bundling unpublished files, or
 * `getPosts` asking for drafts) leaks into every one of them at once —
 * which is why the test reads each surface rather than trusting one.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Blog } from '../blog/define-blog'

let mockParams: Record<string, string> = {}
vi.mock('@pyreon/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pyreon/router')>()),
  useParams: () => mockParams,
}))

const { default: content } = await import('../plugin')
const { _resetRegistryForTesting } = await import('../runtime')

// `'runtime'` bundles unpublished posts and judges them against the clock
// at query time, so its published dates are in the past and its future post
// far in the future — the test must not change verdict as real time passes.
const NOW = '2025-11-16T12:00:00Z'

const post = (slug: string, fm: string) =>
  `---\ntitle: Title ${slug}\ndescription: About ${slug}\n${fm}\n---\n\nBODY_${slug.toUpperCase().replace(/-/g, '_')} words here.\n`

// Published: p1 (newest) … p5 (oldest). Unpublished: a draft and a post
// dated a week after the build — both newest-looking and sharing tags with
// published posts, so a leak shows up in ordering, counts and related.
const POSTS: Record<string, string> = {
  p1: post('p1', 'date: 2025-11-15\ntags: [signals, compiler]'),
  p2: post('p2', 'date: 2025-11-10\ntags: [signals]'),
  p3: post('p3', 'date: 2025-11-05\ntags: [compiler, ssr]'),
  p4: post('p4', 'date: 2025-11-01\ntags: [ssr]'),
  p5: post('p5', 'date: 2025-10-20\ntags: [signals, ssr]'),
  'draft-post': post('draft-post', 'date: 2025-11-14\ndraft: true\ntags: [signals, compiler, secret-draft-tag]'),
  'future-post': post('future-post', 'date: 2099-01-01\ntags: [signals, compiler, secret-future-tag]'),
}
const LEAKS = /draft-post|future-post|DRAFT_POST|FUTURE_POST|secret-draft-tag|secret-future-tag|Title draft|Title future/

async function render(Page: ComponentFn, params: Record<string, string> = {}) {
  mockParams = params
  return renderWithHead(h(Page, null))
}

// `'omit'` (the blogCollection default, static sites) leaves unpublished
// files out of the bundle; `'runtime'` (SSR + preview) bundles them, and the
// blog's own queries must keep them off every surface.
describe.each(['omit', 'runtime'] as const)('a production blog build (unpublished: %s) keeps drafts and future-dated posts off every surface', (mode) => {
  const FIXTURE = path.join(process.cwd(), 'src', 'tests', `__blog_build_${mode}_tmp__`)
  const DIST = path.join(FIXTURE, 'dist')
  let blog: Blog
  const readDist = (rel: string): Promise<string> => fs.readFile(path.join(DIST, rel), 'utf8')

  beforeAll(async () => {
    await fs.rm(FIXTURE, { recursive: true, force: true })
    const dir = path.join(FIXTURE, 'src', 'content', 'blog')
    await fs.mkdir(dir, { recursive: true })
    // The same collection definition `blogCollection()` returns (asserted in
    // blog-schema.test.ts); written inline because a `.mjs` config is
    // loaded by Node, which cannot import this package's TypeScript source.
    await fs.writeFile(
      path.join(FIXTURE, 'content.config.mjs'),
      `export default { collections: { blog: { type: 'pages', schema: {}, publishDate: 'date', unpublished: '${mode}' } } }\n`,
    )
    for (const [slug, source] of Object.entries(POSTS)) {
      await fs.writeFile(path.join(dir, `${slug}.md`), source)
    }
    await fs.writeFile(
      path.join(FIXTURE, 'main.js'),
      [
        `import 'virtual:zero-content/collections'`,
        `import { defineBlog } from '@pyreon/zero-content/blog'`,
        `export const blog = defineBlog({ siteUrl: 'https://example.dev', title: 'Blog', description: 'Notes', pageSize: 2 })`,
        '',
      ].join('\n'),
    )

    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PYREON_CONTENT_NOW', NOW)
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
    // Render what the build emitted, as production would.
    vi.stubEnv('NODE_ENV', 'production')
    _resetRegistryForTesting()
    const mod = (await import(/* @vite-ignore */ path.join(DIST, 'main.js'))) as { blog: Blog }
    blog = mod.blog
  }, 90_000)

  afterAll(async () => {
    vi.unstubAllEnvs()
    await fs.rm(FIXTURE, { recursive: true, force: true })
  })

  it(mode === 'omit' ? 'does not bundle them' : 'bundles them (so only the queries keep them out)', async () => {
    const files = await fs.readdir(DIST, { recursive: true })
    const js = (await Promise.all(files.filter((f) => f.endsWith('.js')).map((f) => readDist(f)))).join('\n')
    expect(js).toContain('BODY_P1')
    expect(js.includes('BODY_DRAFT_POST')).toBe(mode === 'runtime')
    expect(js.includes('BODY_FUTURE_POST')).toBe(mode === 'runtime')
  })

  it('queries, tag counts and static paths see published posts only', async () => {
    expect((await blog.getPosts()).map((p) => p.slug)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect((await blog.getTags()).map((t) => [t.slug, t.count])).toEqual([
      ['signals', 3],
      ['ssr', 3],
      ['compiler', 2],
    ])
    expect((await blog.postPaths()).map((p) => p.params.slug)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect((await blog.tagPaths()).map((p) => p.params.tag)).toEqual(['signals', 'ssr', 'compiler'])
    // 5 posts at 2 per page → pages 2 and 3 (7 would make 4 pages).
    expect((await blog.pagePaths()).map((p) => p.params.page)).toEqual(['2', '3'])
  })

  it('the index pages list them nowhere, and the page count ignores them', async () => {
    const pages = [await render(blog.IndexPage)]
    for (const page of ['2', '3']) pages.push(await render(blog.IndexPage, { page }))
    const first = pages[0]?.html ?? ''
    // Newest published first: a leaked draft (11-14) or future post would lead.
    expect(first.indexOf('href="/blog/p1"')).toBeGreaterThan(-1)
    expect(first).toContain('Page 1 of 3')
    for (const { html, head } of pages) {
      expect(html).not.toMatch(LEAKS)
      expect(head).not.toMatch(LEAKS)
    }
    expect((await render(blog.IndexPage, { page: '4' })).html).toContain('pyreon-blog-notfound')
  })

  it('tag pages list them nowhere, and their tags have no page', async () => {
    for (const tag of ['signals', 'compiler', 'ssr']) {
      const { html, head } = await render(blog.TagPage, { tag })
      expect(html).toContain('Posts tagged')
      expect(html).not.toMatch(LEAKS)
      expect(head).not.toMatch(LEAKS)
    }
    expect((await render(blog.TagPage, { tag: 'signals' })).html).toContain('3 posts')
    for (const tag of ['secret-draft-tag', 'secret-future-tag']) {
      expect((await render(blog.TagPage, { tag })).html).toContain('pyreon-blog-notfound')
    }
  })

  it('post pages: previous/next and related posts skip them; their own pages do not exist', async () => {
    // p1's neighbours by date would be future-post (newer) and draft-post (older).
    const p1 = await render(blog.PostPage, { slug: 'p1' })
    expect(p1.html).toContain('BODY_P1')
    expect(p1.html).toMatch(/rel="prev"[^>]*>.*Title p2/s)
    expect(p1.html).not.toContain('rel="next"')
    // Related to p1 (signals, compiler): the draft and the future post share
    // both tags and would outrank everything.
    expect(p1.html).toContain('Related posts')
    for (const { html, head } of [p1, await render(blog.PostPage, { slug: 'p2' })]) {
      expect(html).not.toMatch(LEAKS)
      expect(head).not.toMatch(LEAKS)
    }
    for (const slug of ['draft-post', 'future-post']) {
      const { html } = await render(blog.PostPage, { slug })
      expect(html).toContain('pyreon-blog-notfound')
    }
  })

  it('RSS and the sitemap list them nowhere', async () => {
    const rss = await readDist('blog/rss.xml')
    expect(rss).toContain('<title>Title p1</title>')
    expect(rss).not.toMatch(LEAKS)
    const sitemap = await readDist('sitemap.xml')
    expect(sitemap).toContain('/blog/p5')
    expect(sitemap).not.toMatch(LEAKS)
  })
})
