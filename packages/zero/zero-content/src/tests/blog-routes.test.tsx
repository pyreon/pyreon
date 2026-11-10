/**
 * `defineBlog` route components and head tags, rendered through the real
 * SSR path (`renderWithHead` → `renderToString`). `useParams` is mocked:
 * the routes read their one param from it and nothing else of the router.
 */
import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockParams: Record<string, string> = {}
vi.mock('@pyreon/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pyreon/router')>()),
  useParams: () => mockParams,
}))

const { _resetRegistryForTesting, _setRegistry } = await import('../runtime')
const { defineBlog, pageFromParam, resolveBlogConfig } = await import('../blog/define-blog')
const { blogListHead, blogPostHead } = await import('../blog/seo')
type Registry = Parameters<typeof _setRegistry>[0]

interface Fixture {
  slug: string
  frontmatter: Record<string, unknown>
  words?: number
}

const NOW = Date.parse('2026-11-16T12:00:00Z')

const FIXTURES: Fixture[] = [
  { slug: 'newest', frontmatter: { title: 'Newest', description: 'N', date: '2026-11-15', tags: ['signals', 'ssr'], cover: '/covers/newest.png', coverAlt: 'Newest cover', author: 'ada' }, words: 1150 },
  { slug: 'middle', frontmatter: { title: 'Middle', description: 'M', date: '2026-11-10', tags: ['signals'] } },
  { slug: 'oldest', frontmatter: { title: 'Oldest', description: 'O', date: '2026-11-01', tags: ['ssr', 'signals'], updated: '2026-11-12' } },
  { slug: 'draft', frontmatter: { title: 'Draft post', description: 'D', date: '2026-11-02', tags: ['secret', 'signals'], draft: true } },
  { slug: 'future', frontmatter: { title: 'Future post', description: 'F', date: '2026-12-01', tags: ['later', 'signals'] } },
]

function setup(fixtures: Fixture[] = FIXTURES): void {
  const loaders: Registry[string]['loaders'] = {}
  for (const f of fixtures) {
    const Body: ComponentFn = () => h('p', { class: 'body' }, `BODY:${f.slug}`)
    loaders[f.slug] = async () => ({
      default: Body as ComponentFn<Record<string, never>>,
      frontmatter: f.frontmatter,
      headings: [],
      slug: f.slug,
      wordCount: f.words ?? 300,
    })
  }
  _setRegistry({ blog: { name: 'blog', type: 'pages', loaders, publishDate: 'date', publishCutoff: NOW } })
}

const blog = defineBlog({
  siteUrl: 'https://example.dev/',
  title: 'Example blog',
  description: 'Notes.',
  pageSize: 2,
  authors: { ada: { name: 'Ada Lovelace', url: '/about/ada' } },
  defaultAuthor: 'The Team',
  coverSize: { width: 1600, height: 840 },
  publisher: { name: 'Example', logo: '/logo.png' },
  feedPath: '/blog/rss.xml',
  language: 'en',
})

async function render(Page: ComponentFn, params: Record<string, string> = {}) {
  mockParams = params
  return renderWithHead(h(Page, null))
}

function jsonLd(head: string): Record<string, unknown> {
  const m = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s.exec(head)
  if (m === null) throw new Error(`no JSON-LD in head:\n${head}`)
  return JSON.parse(m[1] as string) as Record<string, unknown>
}

beforeEach(() => {
  _resetRegistryForTesting()
  vi.stubEnv('NODE_ENV', 'production')
  setup()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('queries on a registry with a draft and a future-dated post', () => {
  it('getPosts lists published posts only, newest first', async () => {
    expect((await blog.getPosts()).map((p) => p.slug)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('getTags counts published posts only', async () => {
    expect((await blog.getTags()).map((t) => [t.slug, t.count])).toEqual([
      ['signals', 3],
      ['ssr', 2],
    ])
  })

  it('getPost does not resolve an unpublished post', async () => {
    expect((await blog.getPost('middle'))?.title).toBe('Middle')
    expect(await blog.getPost('draft')).toBeUndefined()
    expect(await blog.getPost('future')).toBeUndefined()
  })

  it('static paths cover published posts, their tags and the extra index pages', async () => {
    expect(await blog.postPaths()).toEqual([
      { params: { slug: 'newest' } },
      { params: { slug: 'middle' } },
      { params: { slug: 'oldest' } },
    ])
    expect(await blog.tagPaths()).toEqual([{ params: { tag: 'signals' } }, { params: { tag: 'ssr' } }])
    expect(await blog.pagePaths()).toEqual([{ params: { page: '2' } }])
  })

  it('postPaths refuses a frontmatter slug that differs from the file name', async () => {
    setup([{ slug: 'file-name', frontmatter: { title: 'T', description: 'D', date: '2026-01-01', slug: 'other' } }])
    await expect(blog.postPaths()).rejects.toThrow(/declares slug "other"/)
  })
})

describe('IndexPage', () => {
  it('renders page 1 with tag counts, cards, pagination and Blog JSON-LD', async () => {
    const { html, head } = await render(blog.IndexPage)
    expect(html).toContain('Example blog')
    expect(html).toContain('href="/blog/rss.xml"')
    expect(html).toContain('href="/blog/newest"')
    expect(html).toContain('href="/blog/middle"')
    expect(html).not.toContain('href="/blog/oldest"')
    expect(html).toContain('Page 1 of 2')
    expect(html).toContain('href="/blog/page/2"')
    expect(html).toContain('5 min read')
    expect(html).toContain('width="1600"')
    expect(html).not.toMatch(/Draft post|Future post|secret|later/)
    expect(head).toContain('<title>Example blog</title>')
    expect(head).toContain('<link rel="canonical" href="https://example.dev/blog"')
    const ld = jsonLd(head)
    expect(ld['@type']).toBe('Blog')
    expect((ld['blogPost'] as unknown[]).length).toBe(2)
    expect(ld['publisher']).toEqual({
      '@type': 'Organization',
      name: 'Example',
      logo: { '@type': 'ImageObject', url: 'https://example.dev/logo.png' },
    })
  })

  it('renders page 2 and treats /page/1, /page/3 and junk as not found', async () => {
    const two = await render(blog.IndexPage, { page: '2' })
    expect(two.html).toContain('href="/blog/oldest"')
    expect(two.html).toContain('Page 2 of 2')
    expect(two.html).toContain('href="/blog"')
    expect(two.head).toContain('<title>Example blog — page 2 | Example blog</title>')
    for (const page of ['1', '3', 'x', '02']) {
      const { html } = await render(blog.IndexPage, { page })
      expect(html).toContain('pyreon-blog-notfound')
    }
    expect(pageFromParam(undefined)).toBe(1)
  })
})

describe('TagPage', () => {
  it('lists the published posts with the tag and emits CollectionPage JSON-LD', async () => {
    const { html, head } = await render(blog.TagPage, { tag: 'signals' })
    expect(html).toContain('Posts tagged #signals')
    expect(html).toContain('3 posts')
    expect(html).not.toMatch(/Draft post|Future post/)
    const ld = jsonLd(head)
    expect(ld['@type']).toBe('CollectionPage')
    expect((ld['hasPart'] as unknown[]).length).toBe(3)
    expect(head).toContain('href="https://example.dev/blog/tags/signals"')
  })

  it('a tag only an unpublished post carries has no page', async () => {
    for (const tag of ['secret', 'later', 'nope']) {
      const { html } = await render(blog.TagPage, { tag })
      expect(html).toContain('pyreon-blog-notfound')
    }
  })
})

describe('PostPage', () => {
  it('renders header, body, related posts and previous/next from published posts', async () => {
    const { html } = await render(blog.PostPage, { slug: 'middle' })
    expect(html).toContain('<h1 class="pyreon-blog-post__title">Middle</h1>')
    expect(html).toContain('BODY:middle')
    expect(html).toContain('The Team')
    expect(html).toContain('datetime="2026-11-10"')
    // previous = older, next = newer
    expect(html).toMatch(/rel="prev"[^>]*>.*Oldest/s)
    expect(html).toMatch(/rel="next"[^>]*>.*Newest/s)
    expect(html).toContain('Related posts')
    expect(html).not.toMatch(/Draft post|Future post/)
  })

  it('emits the full head: canonical, Open Graph, article:*, Twitter, BlogPosting JSON-LD', async () => {
    const { head } = await render(blog.PostPage, { slug: 'newest' })
    expect(head).toContain('<title>Newest | Example blog</title>')
    expect(head).toContain('<link rel="canonical" href="https://example.dev/blog/newest"')
    expect(head).toContain('property="og:type" content="article"')
    expect(head).toContain('property="og:image" content="https://example.dev/covers/newest.png"')
    expect(head).toContain('property="og:image:width" content="1600"')
    expect(head).toContain('property="og:image:alt" content="Newest cover"')
    expect(head).toContain('property="article:published_time" content="2026-11-15T00:00:00.000Z"')
    expect(head).toContain('property="article:author" content="https://example.dev/about/ada"')
    expect(head).toContain('property="article:tag" content="signals"')
    expect(head).toContain('property="article:tag" content="ssr"')
    expect(head).toContain('name="twitter:card" content="summary_large_image"')
    const ld = jsonLd(head)
    expect(ld).toMatchObject({
      '@type': 'BlogPosting',
      headline: 'Newest',
      datePublished: '2026-11-15T00:00:00.000Z',
      author: [{ '@type': 'Person', name: 'Ada Lovelace', url: 'https://example.dev/about/ada' }],
      image: ['https://example.dev/covers/newest.png'],
      keywords: 'signals, ssr',
      wordCount: 1150,
      timeRequired: 'PT5M',
      inLanguage: 'en',
    })
  })

  it('never renders an unpublished post in production, even when bundled', async () => {
    for (const slug of ['draft', 'future', 'missing']) {
      const { html } = await render(blog.PostPage, { slug })
      expect(html).toContain('pyreon-blog-notfound')
      expect(html).not.toContain(`BODY:${slug}`)
    }
  })

  it('previews an unpublished post in development, marked as such', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const draft = await render(blog.PostPage, { slug: 'draft' })
    expect(draft.html).toContain('BODY:draft')
    expect(draft.html).toContain('Draft: not published')
    const future = await render(blog.PostPage, { slug: 'future' })
    expect(future.html).toContain('Scheduled: dated in the future')
  })

  it('renders the configured postFooter with the post', async () => {
    const withFooter = defineBlog({
      siteUrl: 'https://example.dev',
      title: 'B',
      description: 'D',
      postFooter: (props) => h('aside', { class: 'cta' }, `CTA for ${props.post.slug}`),
      bodyClass: 'prose',
    })
    const { html } = await render(withFooter.PostPage, { slug: 'oldest' })
    expect(html).toContain('CTA for oldest')
    expect(html).toContain('class="prose"')
    expect(html).toContain('Updated')
  })
})

describe('config', () => {
  it('refuses a relative siteUrl and a bad pageSize', () => {
    expect(() => resolveBlogConfig({ siteUrl: '/x', title: 'T', description: 'D' })).toThrow(/siteUrl/)
    expect(() => resolveBlogConfig({ siteUrl: 'https://x.dev', title: 'T', description: 'D', pageSize: 0 })).toThrow(
      /pageSize/,
    )
  })

  it('normalises the base path and builds page URLs', () => {
    const b = defineBlog({ siteUrl: 'https://x.dev', title: 'T', description: 'D', basePath: 'news/' })
    expect(b.pageUrl(1)).toBe('/news')
    expect(b.pageUrl(3)).toBe('/news/page/3')
    expect(b.absoluteUrl('/news/a')).toBe('https://x.dev/news/a')
    const root = defineBlog({ siteUrl: 'https://x.dev', title: 'T', description: 'D', basePath: '/' })
    expect(root.pageUrl(1)).toBe('/')
    expect(root.pageUrl(2)).toBe('/page/2')
  })
})

describe('head builders without a cover or publisher', () => {
  it('a post without a cover gets a summary card and no og:image', async () => {
    const posts = await blog.getPosts()
    const middle = posts.find((p) => p.slug === 'middle')
    if (middle === undefined) throw new Error('fixture missing')
    const site = resolveBlogConfig({ siteUrl: 'https://x.dev', title: 'T', description: 'D' })
    const head = blogPostHead(site, { ...middle, canonical: 'https://orig.dev/m' })
    const meta = head.meta ?? []
    expect(meta.find((m) => m.name === 'twitter:card')?.content).toBe('summary')
    expect(meta.some((m) => m.property === 'og:image')).toBe(false)
    expect(head.link).toEqual([{ rel: 'canonical', href: 'https://orig.dev/m' }])
    const list = blogListHead(site, { path: '/blog', title: 'T', description: 'D', posts, kind: 'blog' })
    expect(list.title).toBe('T')
    expect((list.jsonLd as Record<string, unknown>)['publisher']).toBeUndefined()
  })
})

describe('ShareLinks + NewsletterForm (SSR)', () => {
  it('renders plain intent links, with a configurable Mastodon host', async () => {
    const { ShareLinks, shareTargets } = await import('../blog/components')
    const { html } = await renderWithHead(h(ShareLinks, { url: 'https://x.dev/a', title: 'T & U', label: 'Share:' }))
    expect(html).toContain('href="https://x.com/intent/post?text=T%20%26%20U&amp;url=https%3A%2F%2Fx.dev%2Fa"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(shareTargets('https://x.dev/a', 'T', 'https://hachyderm.io/')[3]?.href).toBe(
      'https://hachyderm.io/share?text=T%20https%3A%2F%2Fx.dev%2Fa',
    )
  })

  it('renders nothing without an action, and a plain form with one', async () => {
    const { NewsletterForm } = await import('../blog/components')
    expect((await renderWithHead(h(NewsletterForm, {}))).html).not.toContain('<form')
    expect((await renderWithHead(h(NewsletterForm, { action: '' }))).html).not.toContain('<form')
    const { html } = await renderWithHead(
      h(NewsletterForm, {
        action: 'https://news.example/s',
        emailName: 'EMAIL',
        hidden: { list: 'x' },
        heading: 'Get posts',
        description: 'Weekly.',
        submitLabel: 'Join',
      }),
    )
    expect(html).toContain('action="https://news.example/s"')
    expect(html).toContain('method="post"')
    expect(html).toContain('name="EMAIL"')
    expect(html).toContain('type="hidden" name="list" value="x"')
    expect(html).toContain('Get posts')
    expect(html).toContain('Join')
  })

  it('renders the empty state and the standalone Byline/TagList pieces', async () => {
    const { PostList, TagList } = await import('../blog/components')
    expect((await renderWithHead(h(PostList, { posts: [], empty: 'Nothing yet' }))).html).toContain('Nothing yet')
    expect((await renderWithHead(h(TagList, { tags: [] }))).html).not.toContain('<ul')
  })
})
