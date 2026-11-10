import type { CollectionDefinition } from '../types'
import type { StandardSchemaIssue } from '../schema-validate'

// ─── Blog frontmatter — a Standard Schema validator with no dependency ─────
//
// Written by hand rather than with zod so a blog does not pull a validator
// into the app. It validates the frontmatter AS WRITTEN (`BlogFrontmatter`)
// and outputs it normalised (`BlogPostData`: dates as `Date`, `tags` and
// `author` as lists, `draft` as a boolean). The content plugin ships the
// schema's output, so `entry.data` at runtime is exactly `BlogPostData`.

/** A frontmatter date: YAML reads `2026-11-16` as a `Date`; quoted, a string. */
export type FrontmatterDate = Date | string

/** Frontmatter of one blog post, as written. */
export interface BlogFrontmatter {
  title: string
  /** One or two sentences: the card, meta description and feed summary. */
  description: string
  /** Publish date. A post dated after the build is left out of it. */
  date: FrontmatterDate
  /** Date of the last meaningful revision (`dateModified`, `article:modified_time`). */
  updated?: FrontmatterDate | undefined
  /** Must equal the file name when present (checked when paths are built). */
  slug?: string | undefined
  tags?: string[] | undefined
  /** Root-relative path (`/blog/covers/x.png`) or absolute URL of the cover. */
  cover?: string | undefined
  /** Alt text of the cover. Without it the cover is treated as decorative. */
  coverAlt?: string | undefined
  /** An author key from `defineBlog({ authors })`, a plain name, or a list. */
  author?: string | string[] | undefined
  /** Absolute URL of the original when the post was first published elsewhere. */
  canonical?: string | undefined
  /** Never published while `true`. */
  draft?: boolean | undefined
}

const KNOWN_FIELDS = new Set([
  'title',
  'description',
  'date',
  'updated',
  'slug',
  'tags',
  'cover',
  'coverAlt',
  'author',
  'canonical',
  'draft',
])

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/

function isDate(value: unknown): value is FrontmatterDate {
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  return typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(value))
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\/[^\s/]+/.test(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validate one post's frontmatter. Returns every issue, not just the first,
 * so an author fixes a file in one pass.
 *
 * @internal exported for testing; use `blogSchema`
 */
export function validateBlogFrontmatter(input: unknown): StandardSchemaIssue[] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return [{ message: 'frontmatter must be a YAML mapping (`key: value` lines)' }]
  }
  const data = input as Record<string, unknown>
  const issues: StandardSchemaIssue[] = []
  const issue = (field: string, message: string): void => {
    issues.push({ message, path: [field] })
  }

  for (const field of ['title', 'description'] as const) {
    if (!isNonEmptyString(data[field])) issue(field, `\`${field}\` is required: a non-empty string`)
  }
  if (!isDate(data['date'])) {
    issue('date', '`date` is required: a calendar date such as 2026-11-16 (the publish date)')
  }
  if (data['updated'] !== undefined && !isDate(data['updated'])) {
    issue('updated', '`updated` must be a calendar date such as 2026-11-20')
  }
  if (data['slug'] !== undefined && !(typeof data['slug'] === 'string' && SLUG_RE.test(data['slug']))) {
    issue('slug', '`slug` must be lowercase words joined by hyphens, e.g. `my-first-post`')
  }
  const tags = data['tags']
  if (tags !== undefined && !(Array.isArray(tags) && tags.every(isNonEmptyString))) {
    issue('tags', '`tags` must be a list of non-empty strings, e.g. `[javascript, webdev]`')
  }
  const cover = data['cover']
  if (cover !== undefined && !(typeof cover === 'string' && (cover.startsWith('/') || isAbsoluteUrl(cover)))) {
    issue('cover', '`cover` must be a site-root path (`/blog/covers/post.png`) or an absolute http(s) URL')
  }
  if (data['coverAlt'] !== undefined && typeof data['coverAlt'] !== 'string') {
    issue('coverAlt', '`coverAlt` must be a string')
  }
  const author = data['author']
  if (
    author !== undefined &&
    !isNonEmptyString(author) &&
    !(Array.isArray(author) && author.length > 0 && author.every(isNonEmptyString))
  ) {
    issue('author', '`author` must be a name (or an `authors` key from defineBlog), or a list of them')
  }
  const canonical = data['canonical']
  if (canonical !== undefined && !(typeof canonical === 'string' && isAbsoluteUrl(canonical))) {
    issue('canonical', '`canonical` must be an absolute http(s) URL')
  }
  if (data['draft'] !== undefined && typeof data['draft'] !== 'boolean') {
    issue('draft', '`draft` must be `true` or `false`')
  }
  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.has(key)) {
      issue(
        key,
        `unknown field \`${key}\`. Blog posts accept: ${[...KNOWN_FIELDS].join(', ')}`,
      )
    }
  }
  return issues
}

/** A post's frontmatter as the blog schema outputs it (what `entry.data` holds). */
export interface BlogPostData {
  title: string
  description: string
  date: Date
  updated?: Date | undefined
  slug?: string | undefined
  tags: string[]
  cover?: string | undefined
  coverAlt?: string | undefined
  /** Author keys or names; empty when the frontmatter names none. */
  author: string[]
  canonical?: string | undefined
  draft: boolean
}

function toDateValue(value: FrontmatterDate): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Normalise validated frontmatter into `BlogPostData`.
 *
 * @internal exported for testing; use `blogSchema`
 */
export function normalizeBlogFrontmatter(input: BlogFrontmatter): BlogPostData {
  const out: BlogPostData = {
    title: input.title,
    description: input.description,
    date: toDateValue(input.date),
    tags: input.tags ?? [],
    author: input.author === undefined ? [] : Array.isArray(input.author) ? input.author : [input.author],
    draft: input.draft === true,
  }
  if (input.updated !== undefined) out.updated = toDateValue(input.updated)
  if (input.slug !== undefined) out.slug = input.slug
  if (input.cover !== undefined) out.cover = input.cover
  if (input.coverAlt !== undefined) out.coverAlt = input.coverAlt
  if (input.canonical !== undefined) out.canonical = input.canonical
  return out
}

/** The blog frontmatter schema (Standard Schema v1). */
export interface BlogSchema {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: 'pyreon-blog'
    readonly validate: (
      input: unknown,
    ) =>
      | { value: BlogPostData; issues?: undefined }
      | { issues: ReadonlyArray<StandardSchemaIssue> }
  }
}

/**
 * Standard Schema for blog frontmatter. Unknown fields are rejected, so a
 * typo such as `tag:` fails the build instead of silently dropping the tags.
 */
export const blogSchema: BlogSchema = {
  '~standard': {
    version: 1,
    vendor: 'pyreon-blog',
    validate(input) {
      const issues = validateBlogFrontmatter(input)
      return issues.length > 0 ? { issues } : { value: normalizeBlogFrontmatter(input as BlogFrontmatter) }
    },
  },
}

export interface BlogCollectionOptions {
  /** Directory of the posts, relative to the Vite root. Default `src/content/<collection name>`. */
  path?: string
  /**
   * What a production build does with drafts and future-dated posts.
   * `'omit'` (default) leaves them out of the build entirely — right for a
   * static site, where a bundled draft would ship in a public chunk.
   * `'runtime'` bundles them and filters at query time (SSR + preview mode).
   */
  unpublished?: 'omit' | 'runtime'
}

/**
 * A `pages` collection for blog posts: the frontmatter schema above, `date`
 * as the publish date, and unpublished posts left out of production builds.
 *
 * @example
 * // content.config.ts
 * export default defineConfig({ collections: { blog: blogCollection() } })
 */
export function blogCollection(options: BlogCollectionOptions = {}): CollectionDefinition<BlogSchema> {
  const def: CollectionDefinition<BlogSchema> = {
    type: 'pages',
    schema: blogSchema,
    publishDate: 'date',
    unpublished: options.unpublished ?? 'omit',
  }
  if (options.path !== undefined) def.path = options.path
  return def
}
