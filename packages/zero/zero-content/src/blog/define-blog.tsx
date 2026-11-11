import { h, Suspense } from '@pyreon/core'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import type { UseHeadInput } from '@pyreon/head'
import { signal } from '@pyreon/reactivity'
import { RouterLink, useParams } from '@pyreon/router'
import { trimChars, trimEndChars } from '../_shared/trim-chars'
import { getCollection, getEntry, isEntryPublished } from '../runtime'
import {
  CoverImage,
  Pagination,
  PostHeader,
  PostList,
  PostEnd,
  PostNav,
  RelatedPosts,
  TagList,
} from './components'
import type { CallToActionProps, CoverSize, NewsletterFormProps } from './components'
import {
  adjacentPosts,
  countTags,
  paginate,
  postsWithTag,
  relatedPosts,
  sortNewestFirst,
  toBlogPost,
} from './posts'
import type { BlogAuthor, BlogPost, BlogPostContext, BlogTagCount } from './posts'
import { absoluteUrl, blogListHead, blogPostHead } from './seo'
import type { BlogSeoSite } from './seo'
import type { Heading } from '../types'

// ─── defineBlog — one object a Zero app wires into four route files ───────
//
//   src/routes/blog/index.tsx        export default blog.IndexPage
//   src/routes/blog/page/[page].tsx  getStaticPaths = blog.pagePaths; default blog.IndexPage
//   src/routes/blog/[slug].tsx       getStaticPaths = blog.postPaths; default blog.PostPage
//   src/routes/blog/tags/[tag]/index.tsx        getStaticPaths = blog.tagPaths;     default blog.TagPage
//   src/routes/blog/tags/[tag]/page/[page].tsx  getStaticPaths = blog.tagPagePaths; default blog.TagPage
//
// Every listing, count, page count, previous/next and related list is
// computed from `getPosts()` — the PUBLISHED posts — so a draft or a
// future-dated post cannot appear on any of them.

export interface BlogConfig {
  /** Absolute site origin, e.g. `https://example.com`. Canonical, OG and JSON-LD URLs need it. */
  siteUrl: string
  /** Blog name: `og:site_name`, JSON-LD `Blog.name`, and the title suffix. */
  title: string
  /** One or two sentences about the blog (index description, JSON-LD). */
  description: string
  /** Content collection holding the posts. Default `blog`. */
  collection?: string
  /** URL prefix of the blog routes. Default `/blog`. */
  basePath?: string
  /** `<h1>` of the index. Default: `title`. */
  heading?: string
  /** Posts per index page. Default `10`. */
  pageSize?: number
  /** Related posts under a post. Default `3`; `0` turns them off. */
  relatedCount?: number
  /**
   * The most-used tags listed on the index (every tag still has its page
   * and appears on its posts). Default `10`; `0` hides the list.
   */
  indexTags?: number
  /** Locale of displayed dates. Default `en-US`. Dates always render in UTC. */
  locale?: string
  /** BCP 47 language of the posts (JSON-LD `inLanguage`), e.g. `en`. */
  language?: string
  /** Reading speed for "N min read". Default `230`. */
  wordsPerMinute?: number
  /** Frontmatter `author: <key>` resolves through this map; unknown values are used as names. */
  authors?: Record<string, BlogAuthor>
  /** Authors of a post whose frontmatter names none: keys of `authors`, or names. */
  defaultAuthor?: string | string[]
  /** Intrinsic size of every cover image (`<img width height>`, `og:image:width/height`). */
  coverSize?: CoverSize
  /** Organisation behind the blog (JSON-LD `publisher`). */
  publisher?: { name: string; url?: string; logo?: string }
  /** `%s` is the post or page title. Default `%s | <title>`. */
  titleTemplate?: string
  /**
   * Site path of the RSS feed, linked from the index (`Subscribe via RSS`).
   * The feed itself is emitted by the content plugin's `seo.rss` option.
   */
  feedPath?: string
  /** Class of the element wrapping a post body — point it at your prose styles. */
  bodyClass?: string
  /**
   * What follows every post body, each part on or off: a call-to-action box
   * (`cta`, off unless given), share links (`share`, on by default), a "Follow
   * via RSS" link (`feed`, on when `feedPath` is set) and a newsletter form
   * (`newsletter`, off unless given). `false` renders none of it. Turn `cta`
   * off when your posts end with their own closing.
   */
  postEnd?: BlogPostEnd | false
  /** A component rendered after the post end, for anything else. */
  postFooter?: ComponentFn<{ post: BlogPost }>
  /** Rendered for an unknown post, tag or page. */
  notFound?: ComponentFn
  /**
   * Replace the markup of a page type while keeping everything else the
   * blog does (queries, pagination, 404s, head tags, JSON-LD, static paths).
   * Each view receives the page's computed data as plain props (see
   * `BlogListView` and `BlogPostView`); a page type without a view renders
   * the default markup (the `pyreon-blog-*` classes `blog.css` styles).
   */
  views?: BlogViews
}

/**
 * The data of one listing page: the index (and its pages) or a tag (and its pages).
 * (A type alias, not an interface, so it is a valid props object for `h`.)
 */
export type BlogListView = {
  kind: 'index' | 'tag'
  /** The posts on this page, newest first. */
  posts: BlogPost[]
  /** 1-based page number. */
  page: number
  pageCount: number
  /** Posts in the whole listing, every page. */
  total: number
  /** Site path of page `n` of this listing. */
  href: (page: number) => string
  /** The most-used tags of all published posts (`indexTags` of them), most used first. */
  tags: BlogTagCount[]
  /** The tag of a tag page; `undefined` on the index. */
  tag: BlogTagCount | undefined
  config: ResolvedBlogConfig
}

/** The data of a post page. */
export type BlogPostView = {
  post: BlogPost
  /** The compiled body. */
  Content: ComponentFn
  /** The body's level 2 and 3 headings, for a table of contents. */
  headings: Heading[]
  /** The next older published post. */
  previous: BlogPost | undefined
  /** The next newer published post. */
  next: BlogPost | undefined
  /** Up to `relatedCount` published posts sharing a tag. */
  related: BlogPost[]
  /** Only set while previewing an unpublished post in development. */
  status: 'draft' | 'scheduled' | undefined
  /** Absolute URL of the post (share links). */
  url: string
  config: ResolvedBlogConfig
}

/** Replacement markup per page type (`BlogConfig.views`). */
export interface BlogViews {
  /** `/blog` and `/blog/page/[page]`. */
  index?: ComponentFn<BlogListView>
  /** `/blog/tags/[tag]` and its pages. */
  tag?: ComponentFn<BlogListView>
  /** `/blog/[slug]`. */
  post?: ComponentFn<BlogPostView>
}

/** What `defineBlog` renders after every post (see `BlogConfig.postEnd`). */
export interface BlogPostEnd {
  cta?: CallToActionProps | false
  share?: boolean | { mastodonInstance?: string }
  /** Default `true` when `feedPath` is set. */
  feed?: boolean
  newsletter?: NewsletterFormProps | false
}

/** A `getStaticPaths` export (structurally `GetStaticPaths` from `@pyreon/zero/server`). */
export type BlogStaticPaths<P extends Record<string, string>> = () => Promise<Array<{ params: P }>>

export interface ResolvedBlogConfig extends BlogSeoSite {
  collection: string
  heading: string
  pageSize: number
  relatedCount: number
  indexTags: number
  locale: string
  feedPath: string | undefined
  bodyClass: string
  postEnd: BlogPostEnd | false
  postFooter: ComponentFn<{ post: BlogPost }> | undefined
  notFound: ComponentFn
  views: BlogViews
  post: BlogPostContext
}

export interface Blog {
  readonly config: ResolvedBlogConfig
  /** Published posts, newest first. */
  getPosts(): Promise<BlogPost[]>
  /** One published post by slug. */
  getPost(slug: string): Promise<BlogPost | undefined>
  /** Tags of published posts with their counts, most used first. */
  getTags(): Promise<BlogTagCount[]>
  /** Site path of index page `n` (`/blog` for page 1). */
  pageUrl(page: number): string
  /** Absolute URL of a site path. */
  absoluteUrl(path: string): string
  /** The index (`/blog`) and its pages (`/blog/page/[page]`). */
  IndexPage: ComponentFn
  /** A post (`/blog/[slug]`). */
  PostPage: ComponentFn
  /** Posts with one tag (`/blog/tags/[tag]` and `/blog/tags/[tag]/page/[page]`). */
  TagPage: ComponentFn
  /** `getStaticPaths` of `/blog/page/[page]`: pages 2..n. */
  pagePaths: BlogStaticPaths<{ page: string }>
  /** `getStaticPaths` of `/blog/[slug]`: every published post. */
  postPaths: BlogStaticPaths<{ slug: string }>
  /** `getStaticPaths` of `/blog/tags/[tag]`: every tag of a published post. */
  tagPaths: BlogStaticPaths<{ tag: string }>
  /** `getStaticPaths` of `/blog/tags/[tag]/page/[page]`: pages 2..n of every tag. */
  tagPagePaths: BlogStaticPaths<{ tag: string; page: string }>
  /** Site path of page `n` of a tag (`/blog/tags/<tag>` for page 1). */
  tagPageUrl(tagSlug: string, page: number): string
}

const DefaultNotFound: ComponentFn = () =>
  h('div', { class: 'pyreon-blog-notfound' }, h('h1', null, 'Not found'), h('p', null, 'There is nothing here.'))

function asList(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

/** @internal exported for testing */
export function resolveBlogConfig(config: BlogConfig): ResolvedBlogConfig {
  if (!/^https?:\/\/[^/\s]+/.test(config.siteUrl)) {
    throw new Error(
      `[Pyreon] defineBlog: siteUrl must be an absolute origin such as "https://example.com" (got "${config.siteUrl}"). Canonical, Open Graph and JSON-LD URLs are built from it.`,
    )
  }
  const basePath = `/${trimChars(config.basePath ?? '/blog', '/')}`
  const pageSize = config.pageSize ?? 10
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`[Pyreon] defineBlog: pageSize must be a whole number of at least 1 (got ${pageSize}).`)
  }
  const authors = config.authors ?? {}
  return {
    siteUrl: trimEndChars(config.siteUrl, '/'),
    title: config.title,
    description: config.description,
    basePath: basePath === '/' ? '' : basePath,
    titleTemplate: config.titleTemplate ?? `%s | ${config.title}`,
    coverSize: config.coverSize,
    publisher: config.publisher,
    language: config.language,
    collection: config.collection ?? 'blog',
    heading: config.heading ?? config.title,
    pageSize,
    relatedCount: config.relatedCount ?? 3,
    indexTags: config.indexTags ?? 10,
    locale: config.locale ?? 'en-US',
    feedPath: config.feedPath,
    bodyClass: config.bodyClass ?? 'pyreon-blog-post__body',
    postEnd: config.postEnd ?? {},
    postFooter: config.postFooter,
    notFound: config.notFound ?? DefaultNotFound,
    views: config.views ?? {},
    post: {
      basePath: basePath === '/' ? '' : basePath,
      authors,
      defaultAuthors: asList(config.defaultAuthor).map((key) => authors[key] ?? { name: key }),
      wordsPerMinute: config.wordsPerMinute ?? 230,
    },
  }
}

/** Read a route param that may be absent or (for a catch-all) an array. */
function param(name: string): string | undefined {
  const params = useParams() as Record<string, string | string[] | undefined>
  const raw = params[name]
  return Array.isArray(raw) ? raw.join('/') : raw
}

/**
 * Register a page's head tags from an async body. `useHead` must run before
 * the first `await` (on the client nothing after it has a current
 * component), so the reactive form is registered first and filled once the
 * data is in; the server, which evaluates a function `useHead` once, gets
 * the resolved input registered directly as well (same keys — one set of
 * tags). Same contract as `defineContentRoute`.
 */
function deferredHead(): (input: UseHeadInput) => void {
  const head = signal<UseHeadInput>({})
  useHead(() => head())
  return (input) => {
    head.set(input)
    useHead(input)
  }
}

/**
 * The index page number of a `[page]` param: absent → 1. `/blog/page/1`
 * would duplicate `/blog`, so `1` (like `02`, `x` or `-1`) is not a page.
 *
 * @internal exported for testing
 */
export function pageFromParam(raw: string | undefined): number {
  if (raw === undefined) return 1
  return /^[1-9]\d*$/.test(raw) && raw !== '1' ? Number(raw) : Number.NaN
}

type AsyncComponent<P> = (props: P) => Promise<VNodeChild>

/** Render an async body under `<Suspense>` — SSG awaits it; the client resolves it. */
function suspended<P extends Record<string, unknown>>(body: AsyncComponent<P>, props: P): VNodeChild {
  return h(Suspense, { fallback: null }, h(body as unknown as ComponentFn<P>, props))
}

/** `<h1>` of a tag page: `Posts tagged #<name>`. */
function tagHeading(tag: BlogTagCount): string {
  return `Posts tagged #${tag.name}`
}

/** The index markup when `views.index` is not set. */
function DefaultIndexView(view: BlogListView): VNodeChild {
  const config = view.config
  return (
    <div class="pyreon-blog">
      <header class="pyreon-blog__header">
        <h1 class="pyreon-blog__title">{config.heading}</h1>
        <p class="pyreon-blog__description">{config.description}</p>
        {config.feedPath !== undefined ? (
          <p class="pyreon-blog__feed">
            <a href={config.feedPath} rel="alternate" type="application/rss+xml">
              Subscribe via RSS
            </a>
          </p>
        ) : null}
        <TagList tags={view.tags} label="All tags" />
      </header>
      <PostList posts={view.posts} locale={config.locale} coverSize={config.coverSize} />
      <Pagination page={view.page} pageCount={view.pageCount} href={view.href} />
    </div>
  )
}

/** The tag page markup when `views.tag` is not set. */
function DefaultTagView(view: BlogListView): VNodeChild {
  const config = view.config
  const tag = view.tag as BlogTagCount
  return (
    <div class="pyreon-blog pyreon-blog--tag">
      <header class="pyreon-blog__header">
        <RouterLink class="pyreon-blog__back" to={view.config.basePath || '/'}>
          ← All posts
        </RouterLink>
        <h1 class="pyreon-blog__title">{tagHeading(tag)}</h1>
        <p class="pyreon-blog__description">
          {tag.count} {tag.count === 1 ? 'post' : 'posts'}
        </p>
      </header>
      <PostList posts={view.posts} locale={config.locale} coverSize={config.coverSize} />
      <Pagination page={view.page} pageCount={view.pageCount} href={view.href} />
    </div>
  )
}

/** The post markup when `views.post` is not set. */
function DefaultPostView(view: BlogPostView): VNodeChild {
  const config = view.config
  const post = view.post
  const Footer = config.postFooter
  return (
    <article class="pyreon-blog-post">
      <PostHeader
        post={post}
        locale={config.locale}
        back={{ href: config.basePath || '/', label: 'All posts' }}
        status={view.status}
      />
      {post.cover !== undefined ? (
        <CoverImage cover={post.cover} class="pyreon-blog-post__cover" size={config.coverSize} loading="eager" />
      ) : null}
      <div class={config.bodyClass}>{h(view.Content, null)}</div>
      <footer class="pyreon-blog-post__footer">
        {config.postEnd !== false ? (
          <PostEnd
            url={view.url}
            title={post.title}
            cta={config.postEnd.cta}
            share={config.postEnd.share}
            feedPath={config.postEnd.feed !== false ? config.feedPath : undefined}
            newsletter={config.postEnd.newsletter}
          />
        ) : null}
        {Footer !== undefined ? h(Footer, { post }) : null}
        <RelatedPosts posts={view.related} locale={config.locale} />
        <PostNav previous={view.previous} next={view.next} />
      </footer>
    </article>
  )
}

/**
 * Define a blog over a content collection (see `blogCollection`). Returns
 * the queries, the four route components and their `getStaticPaths`.
 *
 * @example
 * // src/blog.ts
 * import 'virtual:zero-content/collections'
 * import { defineBlog } from '@pyreon/zero-content/blog'
 * export const blog = defineBlog({ siteUrl: 'https://example.com', title: 'Blog', description: '…' })
 */
export function defineBlog(input: BlogConfig): Blog {
  const config = resolveBlogConfig(input)

  async function getPosts(): Promise<BlogPost[]> {
    const entries = await getCollection(config.collection, { includeDrafts: false })
    return sortNewestFirst(entries.map((entry) => toBlogPost(entry, config.post)))
  }

  const tagPageUrl = (tagSlug: string, page: number): string =>
    page <= 1 ? `${config.basePath}/tags/${tagSlug}` : `${config.basePath}/tags/${tagSlug}/page/${page}`

  const pageUrl = (page: number): string =>
    page <= 1 ? config.basePath || '/' : `${config.basePath}/page/${page}`

  const IndexBody: AsyncComponent<{ page: string | undefined }> = async (props) => {
    const setHead = deferredHead()
    const posts = await getPosts()
    const page = paginate(posts, pageFromParam(props.page), config.pageSize)
    if (page === undefined) return h(config.notFound, null)
    const title = page.page === 1 ? config.title : `${config.heading} — page ${page.page}`
    setHead(
      blogListHead(config, {
        path: pageUrl(page.page),
        title,
        description: config.description,
        posts: page.items,
        kind: 'blog',
      }),
    )
    const view: BlogListView = {
      kind: 'index',
      posts: page.items,
      page: page.page,
      pageCount: page.pageCount,
      total: posts.length,
      href: pageUrl,
      // Most used first; a long tail would push the posts below the fold.
      tags: countTags(posts).slice(0, config.indexTags),
      tag: undefined,
      config,
    }
    return h(config.views.index ?? DefaultIndexView, view)
  }

  const TagBody: AsyncComponent<{ tag: string | undefined; page: string | undefined }> = async (props) => {
    const setHead = deferredHead()
    const posts = await getPosts()
    const tagged = props.tag === undefined ? [] : postsWithTag(posts, props.tag)
    if (tagged.length === 0) return h(config.notFound, null)
    // Same page size and pager as the index; `/page/1` is the tag page itself.
    const page = paginate(tagged, pageFromParam(props.page), config.pageSize)
    if (page === undefined) return h(config.notFound, null)
    const tag = countTags(tagged).find((t) => t.slug === props.tag) as BlogTagCount
    const heading = tagHeading(tag)
    const title = page.page === 1 ? heading : `${heading} — page ${page.page}`
    const href = (n: number): string => tagPageUrl(tag.slug, n)
    setHead(
      blogListHead(config, {
        path: href(page.page),
        title,
        description: `${tag.count} ${tag.count === 1 ? 'post' : 'posts'} tagged #${tag.name} on ${config.title}.`,
        posts: page.items,
        kind: 'collection',
      }),
    )
    const view: BlogListView = {
      kind: 'tag',
      posts: page.items,
      page: page.page,
      pageCount: page.pageCount,
      total: tagged.length,
      href,
      tags: countTags(posts).slice(0, config.indexTags),
      tag,
      config,
    }
    return h(config.views.tag ?? DefaultTagView, view)
  }

  const PostBody: AsyncComponent<{ slug: string | undefined }> = async (props) => {
    const setHead = deferredHead()
    if (props.slug === undefined) return h(config.notFound, null)
    const [entry, posts] = await Promise.all([getEntry(config.collection, props.slug), getPosts()])
    if (entry === undefined) return h(config.notFound, null)
    const published = isEntryPublished(config.collection, entry.data)
    // An unpublished post is reachable by slug only while developing (to
    // preview it); a production build never renders one, whatever the
    // collection's `unpublished` mode bundled.
    if (!published && process.env.NODE_ENV === 'production') return h(config.notFound, null)
    const post = toBlogPost(entry, config.post)
    setHead(blogPostHead(config, post))
    const { previous, next } = adjacentPosts(posts, post.slug)
    const view: BlogPostView = {
      post,
      Content: (await entry.render()) as ComponentFn,
      headings: entry.headings,
      previous,
      next,
      related: config.relatedCount > 0 ? relatedPosts(posts, post, config.relatedCount) : [],
      status: published ? undefined : entry.data['draft'] === true ? 'draft' : 'scheduled',
      url: absoluteUrl(config.siteUrl, post.url),
      config,
    }
    return h(config.views.post ?? DefaultPostView, view)
  }

  return {
    config,
    getPosts,
    async getPost(slug) {
      return (await getPosts()).find((post) => post.slug === slug)
    },
    async getTags() {
      return countTags(await getPosts())
    },
    pageUrl,
    absoluteUrl: (path) => absoluteUrl(config.siteUrl, path),
    IndexPage: () => suspended(IndexBody, { page: param('page') }),
    TagPage: () => suspended(TagBody, { tag: param('tag'), page: param('page') }),
    tagPageUrl,
    PostPage: () => suspended(PostBody, { slug: param('slug') }),
    async pagePaths() {
      const posts = await getPosts()
      const pageCount = Math.max(1, Math.ceil(posts.length / config.pageSize))
      return Array.from({ length: pageCount - 1 }, (_, i) => ({ params: { page: String(i + 2) } }))
    },
    async postPaths() {
      const posts = await getPosts()
      for (const post of posts) {
        const declared = post.entry.data['slug']
        if (declared !== undefined && declared !== post.slug) {
          throw new Error(
            `[Pyreon] Blog post "${post.slug}" declares slug "${String(declared)}". The URL comes from the file name: rename the file or fix the frontmatter so the two match.`,
          )
        }
      }
      return posts.map((post) => ({ params: { slug: post.slug } }))
    },
    async tagPagePaths() {
      const out: Array<{ params: { tag: string; page: string } }> = []
      for (const tag of countTags(await getPosts())) {
        const pageCount = Math.ceil(tag.count / config.pageSize)
        for (let page = 2; page <= pageCount; page++) out.push({ params: { tag: tag.slug, page: String(page) } })
      }
      return out
    },
    async tagPaths() {
      return countTags(await getPosts()).map((tag) => ({ params: { tag: tag.slug } }))
    },
  }
}
