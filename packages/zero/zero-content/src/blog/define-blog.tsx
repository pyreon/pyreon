import { h, Suspense } from '@pyreon/core'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import type { UseHeadInput } from '@pyreon/head'
import { signal } from '@pyreon/reactivity'
import { RouterLink, useParams } from '@pyreon/router'
import { getCollection, getEntry, isEntryPublished } from '../runtime'
import {
  CoverImage,
  Pagination,
  PostHeader,
  PostList,
  PostNav,
  RelatedPosts,
  TagList,
} from './components'
import type { CoverSize } from './components'
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

// ─── defineBlog — one object a Zero app wires into four route files ───────
//
//   src/routes/blog/index.tsx        export default blog.IndexPage
//   src/routes/blog/page/[page].tsx  getStaticPaths = blog.pagePaths; default blog.IndexPage
//   src/routes/blog/[slug].tsx       getStaticPaths = blog.postPaths; default blog.PostPage
//   src/routes/blog/tags/[tag].tsx   getStaticPaths = blog.tagPaths;  default blog.TagPage
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
  /** Rendered after a post body (share links, a call to action, a sign-up form…). */
  postFooter?: ComponentFn<{ post: BlogPost }>
  /** Rendered for an unknown post, tag or page. */
  notFound?: ComponentFn
}

/** A `getStaticPaths` export (structurally `GetStaticPaths` from `@pyreon/zero/server`). */
export type BlogStaticPaths<P extends Record<string, string>> = () => Promise<Array<{ params: P }>>

export interface ResolvedBlogConfig extends BlogSeoSite {
  collection: string
  heading: string
  pageSize: number
  relatedCount: number
  locale: string
  feedPath: string | undefined
  bodyClass: string
  postFooter: ComponentFn<{ post: BlogPost }> | undefined
  notFound: ComponentFn
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
  /** Posts with one tag (`/blog/tags/[tag]`). */
  TagPage: ComponentFn
  /** `getStaticPaths` of `/blog/page/[page]`: pages 2..n. */
  pagePaths: BlogStaticPaths<{ page: string }>
  /** `getStaticPaths` of `/blog/[slug]`: every published post. */
  postPaths: BlogStaticPaths<{ slug: string }>
  /** `getStaticPaths` of `/blog/tags/[tag]`: every tag of a published post. */
  tagPaths: BlogStaticPaths<{ tag: string }>
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
  const basePath = `/${(config.basePath ?? '/blog').replace(/^\/+|\/+$/g, '')}`
  const pageSize = config.pageSize ?? 10
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`[Pyreon] defineBlog: pageSize must be a whole number of at least 1 (got ${pageSize}).`)
  }
  const authors = config.authors ?? {}
  return {
    siteUrl: config.siteUrl.replace(/\/+$/, ''),
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
    locale: config.locale ?? 'en-US',
    feedPath: config.feedPath,
    bodyClass: config.bodyClass ?? 'pyreon-blog-post__body',
    postFooter: config.postFooter,
    notFound: config.notFound ?? DefaultNotFound,
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

  const pageUrl = (page: number): string =>
    page <= 1 ? config.basePath || '/' : `${config.basePath}/page/${page}`

  const IndexBody: AsyncComponent<{ page: string | undefined }> = async (props) => {
    const setHead = deferredHead()
    const posts = await getPosts()
    const page = paginate(posts, pageFromParam(props.page), config.pageSize)
    if (page === undefined) return h(config.notFound, null)
    const tags = countTags(posts)
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
          <TagList tags={tags} label="All tags" />
        </header>
        <PostList posts={page.items} locale={config.locale} coverSize={config.coverSize} />
        <Pagination page={page.page} pageCount={page.pageCount} href={pageUrl} />
      </div>
    )
  }

  const TagBody: AsyncComponent<{ tag: string | undefined }> = async (props) => {
    const setHead = deferredHead()
    const posts = await getPosts()
    const tagged = props.tag === undefined ? [] : postsWithTag(posts, props.tag)
    if (tagged.length === 0) return h(config.notFound, null)
    const tag = countTags(tagged).find((t) => t.slug === props.tag) as BlogTagCount
    const title = `Posts tagged #${tag.name}`
    setHead(
      blogListHead(config, {
        path: tag.url,
        title,
        description: `${tag.count} ${tag.count === 1 ? 'post' : 'posts'} tagged #${tag.name} on ${config.title}.`,
        posts: tagged,
        kind: 'collection',
      }),
    )
    return (
      <div class="pyreon-blog pyreon-blog--tag">
        <header class="pyreon-blog__header">
          <RouterLink class="pyreon-blog__back" to={pageUrl(1)}>
            ← All posts
          </RouterLink>
          <h1 class="pyreon-blog__title">{title}</h1>
          <p class="pyreon-blog__description">
            {tag.count} {tag.count === 1 ? 'post' : 'posts'}
          </p>
        </header>
        <PostList posts={tagged} locale={config.locale} coverSize={config.coverSize} />
      </div>
    )
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
    const related = config.relatedCount > 0 ? relatedPosts(posts, post, config.relatedCount) : []
    const Content = await entry.render()
    const Footer = config.postFooter
    return (
      <article class="pyreon-blog-post">
        <PostHeader
          post={post}
          locale={config.locale}
          back={{ href: pageUrl(1), label: 'All posts' }}
          status={published ? undefined : entry.data['draft'] === true ? 'draft' : 'scheduled'}
        />
        {post.cover !== undefined ? (
          <CoverImage cover={post.cover} class="pyreon-blog-post__cover" size={config.coverSize} loading="eager" />
        ) : null}
        <div class={config.bodyClass}>{h(Content, null)}</div>
        <footer class="pyreon-blog-post__footer">
          {Footer !== undefined ? h(Footer, { post }) : null}
          <RelatedPosts posts={related} locale={config.locale} />
          <PostNav previous={previous} next={next} />
        </footer>
      </article>
    )
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
    TagPage: () => suspended(TagBody, { tag: param('tag') }),
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
    async tagPaths() {
      return countTags(await getPosts()).map((tag) => ({ params: { tag: tag.slug } }))
    },
  }
}
