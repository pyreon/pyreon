import { getCollection } from '@pyreon/zero-content'
import type { CollectionEntry } from '@pyreon/zero-content'

/** Production origin — feeds, canonical URLs and OG images must be absolute. */
export const SITE_ORIGIN = 'https://pyreon.dev'
export const BLOG_TITLE = 'Pyreon blog'
export const BLOG_DESCRIPTION =
  'Notes from building Pyreon: how the compiler and runtime work, measured benchmark results (losses included), and release write-ups.'
/** Every cover is rendered at this size (see `cover` in content.config.ts). */
export const COVER_WIDTH = 1600
export const COVER_HEIGHT = 840

export interface PostData {
  title: string
  description: string
  date: Date | string
  slug: string
  tags?: string[]
  cover: string
  canonical?: string
  draft?: boolean
}

export type Post = CollectionEntry<PostData>

/** `YYYY-MM-DD` of a frontmatter date (UTC — dates are calendar days). */
export function isoDay(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10)
}

/** "16 November 2026" — fixed locale + UTC so SSG and hydration agree. */
export function displayDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Published posts, newest first. Drafts and posts dated after the build are
 * not in the bundle at all (`unpublished: 'omit'`); `includeDrafts: false`
 * also filters them in `vite dev`, so the index looks the same there.
 */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = (await getCollection('blog', { includeDrafts: false })) as unknown as Post[]
  return posts.sort((a, b) => +new Date(b.data.date) - +new Date(a.data.date))
}
