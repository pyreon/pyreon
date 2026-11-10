import type { CollectionDefinition } from '../types'
import type { StandardSchemaIssue } from '../schema-validate'

// ─── Blog frontmatter — a Standard Schema validator with no dependency ─────
//
// Written by hand rather than with zod so a blog does not pull a validator
// into the app. It VALIDATES and does not transform: the compiled module
// carries the frontmatter exactly as written (a YAML date arrives as an ISO
// string at runtime), so the declared output type is the written shape,
// and `toBlogPost` normalises it.

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

/** The blog frontmatter schema (Standard Schema v1). */
export interface BlogSchema {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: 'pyreon-blog'
    readonly validate: (
      input: unknown,
    ) =>
      | { value: BlogFrontmatter; issues?: undefined }
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
      return issues.length > 0 ? { issues } : { value: input as BlogFrontmatter }
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
