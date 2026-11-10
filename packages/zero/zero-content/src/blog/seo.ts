import type { UseHeadInput } from '@pyreon/head'
import { trimEndChars, trimStartChars } from '../_shared/trim-chars'
import type { BlogAuthor, BlogPost } from './posts'

// ─── Blog SEO — <head> tags and JSON-LD for posts and listings ────────────
//
// Pure builders: they return a `useHead` input and touch nothing, so the
// route components register them and tests read them directly.

/** The site facts the head builders need (a subset of a resolved blog). */
export interface BlogSeoSite {
  /** Absolute origin, e.g. `https://example.com` (no trailing slash). */
  siteUrl: string
  /** Blog name — `og:site_name`, the JSON-LD `Blog`, and the title suffix. */
  title: string
  description: string
  /** Site path of the blog index, e.g. `/blog`. */
  basePath: string
  /** `%s` is replaced by the post or page title. */
  titleTemplate: string
  /** Intrinsic size of every cover image, for `og:image:width/height`. */
  coverSize: { width: number; height: number } | undefined
  /** Organisation publishing the blog (JSON-LD `publisher`). */
  publisher: { name: string; logo?: string | undefined; url?: string | undefined } | undefined
  /** BCP 47 language of the posts, e.g. `en` (JSON-LD `inLanguage`). */
  language: string | undefined
}

/** Resolve a site path (or an absolute URL) against the site origin. */
export function absoluteUrl(siteUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  return `${trimEndChars(siteUrl, '/')}/${trimStartChars(pathOrUrl, '/')}`
}

function person(site: BlogSeoSite, author: BlogAuthor): Record<string, unknown> {
  const out: Record<string, unknown> = { '@type': 'Person', name: author.name }
  if (author.url !== undefined) out['url'] = absoluteUrl(site.siteUrl, author.url)
  return out
}

function publisherLd(site: BlogSeoSite): Record<string, unknown> | undefined {
  const p = site.publisher
  if (p === undefined) return undefined
  const out: Record<string, unknown> = { '@type': 'Organization', name: p.name }
  if (p.url !== undefined) out['url'] = absoluteUrl(site.siteUrl, p.url)
  if (p.logo !== undefined) {
    out['logo'] = { '@type': 'ImageObject', url: absoluteUrl(site.siteUrl, p.logo) }
  }
  return out
}

function blogRef(site: BlogSeoSite): Record<string, unknown> {
  return { '@type': 'Blog', name: site.title, url: absoluteUrl(site.siteUrl, site.basePath) }
}

/** The JSON-LD `BlogPosting` of a post. */
export function blogPostingJsonLd(site: BlogSeoSite, post: BlogPost): Record<string, unknown> {
  const url = absoluteUrl(site.siteUrl, post.url)
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.canonical ?? url },
    datePublished: post.date.toISOString(),
    dateModified: (post.updated ?? post.date).toISOString(),
    wordCount: post.wordCount,
    timeRequired: `PT${post.readingMinutes}M`,
    isPartOf: blogRef(site),
  }
  if (post.authors.length > 0) ld['author'] = post.authors.map((a) => person(site, a))
  if (post.cover !== undefined) ld['image'] = [absoluteUrl(site.siteUrl, post.cover.src)]
  if (post.tags.length > 0) ld['keywords'] = post.tags.map((t) => t.name).join(', ')
  if (site.language !== undefined) ld['inLanguage'] = site.language
  const publisher = publisherLd(site)
  if (publisher !== undefined) ld['publisher'] = publisher
  return ld
}

/**
 * Every `<head>` tag a post page needs: title, description, canonical,
 * Open Graph (`og:*` + `article:*`), Twitter card, and the JSON-LD
 * `BlogPosting`. `canonical` points at the original when the frontmatter
 * names one.
 */
export function blogPostHead(site: BlogSeoSite, post: BlogPost): UseHeadInput {
  const url = absoluteUrl(site.siteUrl, post.url)
  const title = site.titleTemplate.replace('%s', post.title)
  const meta: NonNullable<UseHeadInput['meta']> = [
    { name: 'description', content: post.description },
    { property: 'og:type', content: 'article' },
    { property: 'og:site_name', content: site.title },
    { property: 'og:url', content: url },
    { property: 'og:title', content: post.title },
    { property: 'og:description', content: post.description },
    { property: 'article:published_time', content: post.date.toISOString() },
  ]
  if (post.updated !== undefined) {
    meta.push({ property: 'article:modified_time', content: post.updated.toISOString() })
  }
  for (const author of post.authors) {
    meta.push({
      property: 'article:author',
      content: author.url !== undefined ? absoluteUrl(site.siteUrl, author.url) : author.name,
    })
  }
  for (const tag of post.tags) meta.push({ property: 'article:tag', content: tag.name })
  meta.push(
    { name: 'twitter:card', content: post.cover ? 'summary_large_image' : 'summary' },
    { name: 'twitter:title', content: post.title },
    { name: 'twitter:description', content: post.description },
  )
  if (post.cover !== undefined) {
    const image = absoluteUrl(site.siteUrl, post.cover.src)
    const alt = post.cover.alt || post.title
    meta.push({ property: 'og:image', content: image })
    if (site.coverSize !== undefined) {
      meta.push(
        { property: 'og:image:width', content: String(site.coverSize.width) },
        { property: 'og:image:height', content: String(site.coverSize.height) },
      )
    }
    meta.push(
      { property: 'og:image:alt', content: alt },
      { name: 'twitter:image', content: image },
      { name: 'twitter:image:alt', content: alt },
    )
  }
  return {
    title,
    meta,
    link: [{ rel: 'canonical', href: post.canonical ?? url }],
    jsonLd: blogPostingJsonLd(site, post),
  }
}

export interface BlogListHeadOptions {
  /** Site path of this listing, e.g. `/blog/page/2` or `/blog/tags/web`. */
  path: string
  /** Heading of the listing; the blog title on the index. */
  title: string
  description: string
  /** The posts shown on this page (newest first). */
  posts: readonly BlogPost[]
  /** `'blog'` on the index and its pages (JSON-LD `Blog`); `'collection'` on a tag page. */
  kind: 'blog' | 'collection'
}

/**
 * `<head>` tags of a listing page (the index, its pages, a tag page):
 * title, description, canonical, Open Graph, and JSON-LD — a `Blog` with
 * its posts on the index, a `CollectionPage` that is part of the blog on a
 * tag page.
 */
export function blogListHead(site: BlogSeoSite, options: BlogListHeadOptions): UseHeadInput {
  const url = absoluteUrl(site.siteUrl, options.path)
  const title = options.title === site.title ? site.title : site.titleTemplate.replace('%s', options.title)
  const postings = options.posts.map((post) => {
    const posting: Record<string, unknown> = {
      '@type': 'BlogPosting',
      headline: post.title,
      url: absoluteUrl(site.siteUrl, post.url),
      datePublished: post.date.toISOString(),
    }
    if (post.authors.length > 0) posting['author'] = post.authors.map((a) => person(site, a))
    return posting
  })
  const jsonLd: Record<string, unknown> =
    options.kind === 'blog'
      ? {
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: site.title,
          description: site.description,
          url,
          blogPost: postings,
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: options.title,
          description: options.description,
          url,
          isPartOf: blogRef(site),
          hasPart: postings,
        }
  if (site.language !== undefined) jsonLd['inLanguage'] = site.language
  const publisher = publisherLd(site)
  if (publisher !== undefined && options.kind === 'blog') jsonLd['publisher'] = publisher
  return {
    title,
    meta: [
      { name: 'description', content: options.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: site.title },
      { property: 'og:url', content: url },
      { property: 'og:title', content: title },
      { property: 'og:description', content: options.description },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: options.description },
    ],
    link: [{ rel: 'canonical', href: url }],
    jsonLd,
  }
}
