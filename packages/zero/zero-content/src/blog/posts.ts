import type { CollectionEntry } from '../types'
import type { BlogFrontmatter, BlogPostData } from './schema'

// ─── Blog posts — the normalised model and the pure queries over it ────────
//
// Every query takes the list it works on: `defineBlog` feeds them the
// PUBLISHED posts only, so a draft or a future-dated post cannot reach a
// listing, a tag count, a page count, previous/next or related posts by any
// path. Keeping them pure also keeps them testable without a registry.

export interface BlogAuthor {
  name: string
  /** Profile or home page, used in the byline link and JSON-LD `author.url`. */
  url?: string | undefined
}

export interface BlogTag {
  /** The tag as first written (newest post wins). */
  name: string
  /** URL segment of the tag page: lowercase, hyphenated. */
  slug: string
  /** Site path of the tag page, e.g. `/blog/tags/web-dev`. */
  url: string
}

export interface BlogTagCount extends BlogTag {
  /** Published posts carrying the tag. */
  count: number
}

export interface BlogCover {
  src: string
  /** Empty when the frontmatter gave no `coverAlt` (decorative image). */
  alt: string
}

export interface BlogPost {
  slug: string
  /** Site path of the post, e.g. `/blog/my-first-post`. */
  url: string
  title: string
  description: string
  /** Publish date (from `date`). */
  date: Date
  /** Last revision (from `updated`). */
  updated: Date | undefined
  tags: BlogTag[]
  cover: BlogCover | undefined
  authors: BlogAuthor[]
  /** Frontmatter `canonical` — set only for a post first published elsewhere. */
  canonical: string | undefined
  /** The first paragraph as plain text (≤ 200 characters), counted at build. */
  excerpt: string
  /** Words in the body, counted when the markdown was compiled. */
  wordCount: number
  /** Whole minutes at the blog's reading speed, at least 1. */
  readingMinutes: number
  /** The collection entry — `entry.render()` loads the body component. */
  entry: CollectionEntry
}

/** What `toBlogPost` needs from the blog configuration. */
export interface BlogPostContext {
  /** URL prefix of the blog, e.g. `/blog` (no trailing slash). */
  basePath: string
  /** Author lookup for frontmatter `author` keys. */
  authors: Readonly<Record<string, BlogAuthor>>
  /** Authors of a post whose frontmatter names none. */
  defaultAuthors: readonly BlogAuthor[]
  wordsPerMinute: number
}

/** Reading time in whole minutes, never below 1. */
export function readingMinutes(wordCount: number, wordsPerMinute = 230): number {
  return Math.max(1, Math.round(wordCount / wordsPerMinute))
}

/**
 * The URL segment of a tag: lowercase, accents stripped, `+`/`#` spelled out
 * (so `C++` and `C#` stay distinct from `C`), everything else that is not a
 * letter or digit collapsed to single hyphens.
 *
 * @example slugifyTag('Web Dev') // 'web-dev'
 */
export function slugifyTag(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\+/g, '-plus-')
    .replace(/#/g, '-sharp-')
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : encodeURIComponent(name.trim().toLowerCase())
}

/** Read a frontmatter date (a `Date`, or the ISO string a compiled module carries). */
export function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

function resolveAuthors(value: unknown, ctx: BlogPostContext): BlogAuthor[] {
  const names = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  const out: BlogAuthor[] = []
  for (const name of names) {
    if (typeof name !== 'string' || name.trim() === '') continue
    out.push(ctx.authors[name] ?? { name })
  }
  return out.length > 0 ? out : [...ctx.defaultAuthors]
}

/**
 * Normalise a collection entry into a `BlogPost`. The frontmatter was
 * validated at build time by `blogSchema`; this only shapes it (dates to
 * `Date`, tags to slugs + URLs, author keys to authors).
 */
export function toBlogPost(entry: CollectionEntry, ctx: BlogPostContext): BlogPost {
  // `BlogPostData` from a `blogCollection()` (the plugin ships the schema's
  // parsed output); read defensively so a hand-built entry with the raw
  // written shape works too.
  const data = entry.data as Partial<BlogPostData> | Partial<BlogFrontmatter>
  const tagNames = Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string') : []
  const seen = new Set<string>()
  const tags: BlogTag[] = []
  for (const name of tagNames) {
    const slug = slugifyTag(name)
    if (seen.has(slug)) continue
    seen.add(slug)
    tags.push({ name, slug, url: `${ctx.basePath}/tags/${slug}` })
  }
  const cover =
    typeof data.cover === 'string' && data.cover.length > 0
      ? { src: data.cover, alt: typeof data.coverAlt === 'string' ? data.coverAlt : '' }
      : undefined
  return {
    slug: entry.slug,
    url: `${ctx.basePath}/${entry.slug}`,
    title: typeof data.title === 'string' ? data.title : entry.slug,
    description: typeof data.description === 'string' ? data.description : '',
    date: toDate(data.date) ?? new Date(0),
    updated: toDate(data.updated),
    tags,
    cover,
    authors: resolveAuthors(data.author, ctx),
    canonical: typeof data.canonical === 'string' ? data.canonical : undefined,
    excerpt: entry.excerpt,
    wordCount: entry.wordCount,
    readingMinutes: readingMinutes(entry.wordCount, ctx.wordsPerMinute),
    entry,
  }
}

/** Newest first; posts on the same date keep a stable order (by slug). */
export function sortNewestFirst(posts: readonly BlogPost[]): BlogPost[] {
  return [...posts].sort(
    (a, b) => b.date.getTime() - a.date.getTime() || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  )
}

/** Posts carrying the tag with this slug, in the order given. */
export function postsWithTag(posts: readonly BlogPost[], tagSlug: string): BlogPost[] {
  return posts.filter((post) => post.tags.some((tag) => tag.slug === tagSlug))
}

/**
 * Every tag with the number of posts carrying it — most used first, then by
 * name. The display name is the spelling of the first post in `posts`
 * (the newest, for a newest-first list).
 */
export function countTags(posts: readonly BlogPost[]): BlogTagCount[] {
  const bySlug = new Map<string, BlogTagCount>()
  for (const post of posts) {
    for (const tag of post.tags) {
      const found = bySlug.get(tag.slug)
      if (found) found.count++
      else bySlug.set(tag.slug, { ...tag, count: 1 })
    }
  }
  return [...bySlug.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en'),
  )
}

export interface BlogPage<T> {
  items: T[]
  /** 1-based page number. */
  page: number
  pageCount: number
  total: number
}

/**
 * One page of `items`. Page 1 of an empty list is an empty page; any other
 * page outside `1..pageCount` (or not a whole number) is `undefined`, which
 * a route renders as not found.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): BlogPage<T> | undefined {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(`[Pyreon] Blog pageSize must be a whole number of at least 1 (got ${pageSize}).`)
  }
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return undefined
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pageCount, total: items.length }
}

export interface AdjacentPosts {
  /** The next OLDER post. */
  previous: BlogPost | undefined
  /** The next NEWER post. */
  next: BlogPost | undefined
}

/** Older and newer neighbours of `slug` in a newest-first list. */
export function adjacentPosts(posts: readonly BlogPost[], slug: string): AdjacentPosts {
  const i = posts.findIndex((post) => post.slug === slug)
  if (i === -1) return { previous: undefined, next: undefined }
  return { previous: posts[i + 1], next: i > 0 ? posts[i - 1] : undefined }
}

/**
 * Posts sharing the most tags with `post`, excluding it; ties go to the
 * newer post. Posts sharing no tag are never "related".
 */
export function relatedPosts(posts: readonly BlogPost[], post: BlogPost, limit = 3): BlogPost[] {
  const own = new Set(post.tags.map((tag) => tag.slug))
  if (own.size === 0 || limit < 1) return []
  return posts
    .filter((other) => other.slug !== post.slug)
    .map((other) => ({ other, shared: other.tags.filter((tag) => own.has(tag.slug)).length }))
    .filter((scored) => scored.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.other.date.getTime() - a.other.date.getTime())
    .slice(0, limit)
    .map((scored) => scored.other)
}

/** `YYYY-MM-DD` of a date in UTC — frontmatter dates are calendar days. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * A long date in `locale`, always in UTC, so the server render and the
 * hydrated client print the same day whatever the visitor's time zone.
 */
export function formatPostDate(date: Date, locale = 'en-US'): string {
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
