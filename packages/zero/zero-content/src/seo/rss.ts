import { joinUrl } from './sitemap'

// ─── RSS 2.0 feed emitter (PR-L audit M19) ────────────────────────────────
//
// Pure builder that produces an RSS 2.0 XML feed for a collection of
// dated entries (typically a blog or changelog). Authors call this
// from a build script with the entries:
//
//     import { generateRssFeed, getCollection } from '@pyreon/zero-content'
//     const posts = await getCollection('blog')
//     const xml = generateRssFeed({
//       title: 'My Blog',
//       description: 'Latest posts',
//       baseUrl: 'https://example.com',
//       items: posts.map((p) => ({
//         title: p.data.title,
//         link: `/blog/${p.slug}`,
//         pubDate: p.data.publishDate,
//         description: p.data.description,
//       })),
//     })

export interface RssItem {
  title: string
  /** Relative URL — joined to baseUrl at render time. */
  link: string
  /** ISO-8601 date string. Will be converted to RFC-822 in the output. */
  pubDate?: string
  /** One-line summary. */
  description?: string
  /** Optional author name (or `email (Name)` per RFC-2822). */
  author?: string
  /** Optional categorization (free-form tags). */
  categories?: string[]
  /** Optional GUID — defaults to the joined URL. */
  guid?: string
}

export interface GenerateRssFeedArgs {
  /** Feed title. */
  title: string
  /** Site origin (no trailing slash). */
  baseUrl: string
  /** Optional feed description (channel-level). */
  description?: string
  /** Optional language code (`en-us`, `cs-cz`, ...). */
  language?: string
  /** Items in display order — usually newest first. */
  items: RssItem[]
  /** Optional fixed `lastBuildDate` override (ISO 8601). Defaults to
   *  the first item's pubDate, or omitted entirely when no items
   *  carry one. */
  lastBuildDate?: string
}

/** Escape XML-sensitive characters. */
function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Convert an ISO-8601 date string to RFC-822 (the format RSS 2.0
 * requires for `pubDate` / `lastBuildDate`).
 *
 * Falls back to the input verbatim when the date can't be parsed.
 *
 * @internal exported for testing
 */
export function toRfc822(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toUTCString()
}

export function generateRssFeed(args: GenerateRssFeedArgs): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  lines.push('<rss version="2.0">')
  lines.push('  <channel>')
  lines.push(`    <title>${escapeXml(args.title)}</title>`)
  lines.push(`    <link>${escapeXml(args.baseUrl)}</link>`)
  if (args.description) {
    lines.push(`    <description>${escapeXml(args.description)}</description>`)
  }
  if (args.language) {
    lines.push(`    <language>${escapeXml(args.language)}</language>`)
  }
  const lastBuild =
    args.lastBuildDate
    ?? args.items.find((i) => i.pubDate)?.pubDate
  if (lastBuild) {
    lines.push(`    <lastBuildDate>${toRfc822(lastBuild)}</lastBuildDate>`)
  }
  for (const item of args.items) {
    const link = joinUrl(args.baseUrl, item.link)
    lines.push('    <item>')
    lines.push(`      <title>${escapeXml(item.title)}</title>`)
    lines.push(`      <link>${escapeXml(link)}</link>`)
    const guid = item.guid ?? link
    lines.push(`      <guid isPermaLink="${item.guid ? 'false' : 'true'}">${escapeXml(guid)}</guid>`)
    if (item.pubDate) {
      lines.push(`      <pubDate>${toRfc822(item.pubDate)}</pubDate>`)
    }
    if (item.author) lines.push(`      <author>${escapeXml(item.author)}</author>`)
    if (item.categories) {
      for (const cat of item.categories) {
        lines.push(`      <category>${escapeXml(cat)}</category>`)
      }
    }
    if (item.description) {
      lines.push(`      <description>${escapeXml(item.description)}</description>`)
    }
    lines.push('    </item>')
  }
  lines.push('  </channel>')
  lines.push('</rss>')
  return lines.join('\n') + '\n'
}
