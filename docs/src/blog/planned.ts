import { isPublished } from '@pyreon/zero-content'
import { isoDay, readingMinutes, toDate } from '@pyreon/zero-content/blog'

/**
 * Scheduled posts, as the blog index lists them under "Up next": a post that
 * is written, not a draft, and dated after this build. Only what a planned
 * card shows leaves the build: the title, the description, the tags, the
 * publish day and the reading time. The slug, the URL and the body never do,
 * so a scheduled post still has no page, no feed item and no sitemap entry
 * until a build on or after its date publishes it (content.config.ts).
 *
 * Read at build time by `vite-plugins/blog-planned.ts`; node-free, so the
 * unit tests run it on the real post files.
 */
export interface PlannedPost {
  title: string
  description: string
  /** Publish day, `YYYY-MM-DD` (UTC). */
  date: string
  tags: string[]
  readingMinutes: number
}

// The content pipeline's word rule (`@pyreon/zero-content`, word-count.ts):
// a run of letters or digits, an apostrophe inside it allowed.
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu

/**
 * Words in a markdown body, counted the way the content pipeline counts them
 * for a published post (prose, inline code and code blocks; not raw HTML,
 * images, or link targets), so a planned card shows the reading time the post
 * will show on its date. Works on the source, so it is an estimate: the e2e
 * suite checks it against every published post's own label.
 */
export function estimateWords(body: string): number {
  let words = 0
  let fence: string | null = null
  const prose: string[] = []
  for (const line of body.replace(/<!--[\s\S]*?-->/g, ' ').split('\n')) {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1]
    if (fence !== null) {
      // Inside a code block every line is read as written, tags and all.
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = null
      else words += countIn(line)
      continue
    }
    if (marker !== undefined) {
      fence = marker // the info string (```tsx) is not read
      continue
    }
    // Inline code is read as written too; the rest of the line is prose.
    prose.push(
      line.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_m, _ticks: string, code: string) => {
        words += countIn(code)
        return ' '
      }),
    )
  }
  const text = prose
    .join('\n')
    // Images: neither alt text nor URL is counted.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    // Links: the text is read, the target is not.
    .replace(/\]\([^)]*\)/g, ']')
    // Autolinks and raw HTML tags.
    .replace(/<https?:[^>]*>/g, ' ')
    .replace(/<\/?[A-Za-z][^>\n]*>/g, ' ')
  return words + countIn(text)
}

function countIn(value: string): number {
  return value.match(WORD)?.length ?? 0
}

/** One post file, already split into frontmatter and body. */
export interface PostSource {
  data: Record<string, unknown>
  body: string
}

/**
 * The scheduled posts among `files` at `now`, soonest first. Drafts are never
 * planned (they have no date to promise), and neither is a post with no
 * readable date.
 */
export function plannedPosts(files: readonly PostSource[], now: number, wordsPerMinute = 230): PlannedPost[] {
  const out: PlannedPost[] = []
  for (const { data, body } of files) {
    if (data['draft'] === true || isPublished(data, 'date', now)) continue
    const date = toDate(data['date'])
    if (!date || typeof data['title'] !== 'string') continue
    out.push({
      title: data['title'],
      description: typeof data['description'] === 'string' ? data['description'] : '',
      date: isoDay(date),
      tags: Array.isArray(data['tags']) ? data['tags'].filter((t): t is string => typeof t === 'string') : [],
      readingMinutes: readingMinutes(estimateWords(body), wordsPerMinute),
    })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title, 'en')))
}

/**
 * The planned posts to show beside the published ones: never one whose title
 * is already published (the build's two publish clocks are read a moment
 * apart, so a post dated exactly at the cutoff could otherwise appear twice).
 */
export function upNext(planned: readonly PlannedPost[], publishedTitles: readonly string[]): PlannedPost[] {
  const published = new Set(publishedTitles)
  return planned.filter((p) => !published.has(p.title))
}
