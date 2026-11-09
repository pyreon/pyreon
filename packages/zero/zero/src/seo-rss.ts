// ─── RSS 2.0 feed — pure builder ──────────────────────────────────────────
//
// Lives in its own file (separate from `seo.ts`) so it can be exported
// from BOTH client and server entries. `seo.ts` pulls `node:fs` for
// the sitemap manifest reader, which would otherwise drag server-only
// dependencies into client bundles when consumers re-export RSS from
// a client-runnable file.

export interface RssItem {
  /** Item title. */
  title: string
  /** Relative URL — joined to `origin` at render time. */
  link: string
  /** ISO-8601 date string. Converted to RFC-822 in the output. */
  pubDate?: string
  /** One-line summary. */
  description?: string
  /** Optional author (RFC-2822: `email (Name)` or just a name). */
  author?: string
  /** Free-form categories / tags. */
  categories?: string[]
  /** Optional GUID — defaults to the joined URL. */
  guid?: string
  /**
   * Full item body as HTML, emitted as `<content:encoded>` inside a CDATA
   * section. Feed readers and importers (dev.to's "Publishing from RSS",
   * Feedly, Inoreader) use it as the article body and fall back to
   * `description` without it. URLs inside it should be absolute: a reader
   * resolves them against nothing.
   */
  content?: string
}

export interface RssConfig {
  /** Feed title (channel-level). */
  title: string
  /** Site origin (no trailing slash). e.g. "https://example.com" */
  origin: string
  /** Channel-level description. */
  description?: string
  /** Language code (`en-us`, `cs-cz`, ...). */
  language?: string
  /** Feed items — usually newest first. */
  items: RssItem[]
  /** Fixed `lastBuildDate` override (ISO 8601). Defaults to the first
   *  item's pubDate, or omitted entirely when no items carry one. */
  lastBuildDate?: string
  /**
   * Path (joined to `origin`) or absolute URL the feed itself is served at,
   * e.g. `/blog/rss.xml`. Emitted as `<atom:link rel="self">`, which the W3C
   * feed validator expects and readers use to dedupe subscriptions.
   */
  feedUrl?: string
}

/** Wrap HTML in CDATA. A literal `]]>` cannot appear inside one, so it is
 *  split across two sections. */
function cdata(html: string): string {
  return `<![CDATA[${html.split(']]>').join(']]]]><![CDATA[>')}]]>`
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

function escapeXmlRss(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function joinRssUrl(origin: string, path: string): string {
  let end = origin.length
  while (end > 0 && origin.charCodeAt(end - 1) === 47) end--
  const cleanedOrigin = origin.slice(0, end)
  if (path.length === 0) return cleanedOrigin
  const cleanedPath = path.startsWith('/') ? path : '/' + path
  return cleanedOrigin + cleanedPath
}

/**
 * Generate an RSS 2.0 feed string. Use for blog / changelog / podcast
 * content. Items are emitted in supplied order — sort newest-first
 * before passing in.
 *
 * @example
 * import { generateRssFeed } from "@pyreon/zero"
 *
 * const xml = generateRssFeed({
 *   title: "My Blog",
 *   origin: "https://example.com",
 *   description: "Latest posts",
 *   items: posts.map((p) => ({
 *     title: p.data.title,
 *     link: `/blog/${p.slug}`,
 *     pubDate: p.data.publishDate,
 *     description: p.data.description,
 *   })),
 * })
 */
export function generateRssFeed(config: RssConfig): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  const hasContent = config.items.some((i) => i.content !== undefined)
  const ns =
    (hasContent ? ' xmlns:content="http://purl.org/rss/1.0/modules/content/"' : '') +
    (config.feedUrl ? ' xmlns:atom="http://www.w3.org/2005/Atom"' : '')
  lines.push(`<rss version="2.0"${ns}>`)
  lines.push('  <channel>')
  lines.push(`    <title>${escapeXmlRss(config.title)}</title>`)
  lines.push(`    <link>${escapeXmlRss(config.origin)}</link>`)
  if (config.description) {
    lines.push(`    <description>${escapeXmlRss(config.description)}</description>`)
  }
  if (config.language) {
    lines.push(`    <language>${escapeXmlRss(config.language)}</language>`)
  }
  if (config.feedUrl) {
    const self = /^https?:\/\//.test(config.feedUrl)
      ? config.feedUrl
      : joinRssUrl(config.origin, config.feedUrl)
    lines.push(
      `    <atom:link href="${escapeXmlRss(self)}" rel="self" type="application/rss+xml" />`,
    )
  }
  const lastBuild =
    config.lastBuildDate
    ?? config.items.find((i) => i.pubDate)?.pubDate
  if (lastBuild) {
    // `toRfc822` returns its INPUT VERBATIM when `new Date()` yields NaN, so
    // the fallback branch is exactly the one that must still be escaped —
    // every other RSS field already is.
    lines.push(`    <lastBuildDate>${escapeXmlRss(toRfc822(lastBuild))}</lastBuildDate>`)
  }
  for (const item of config.items) {
    const link = joinRssUrl(config.origin, item.link)
    lines.push('    <item>')
    lines.push(`      <title>${escapeXmlRss(item.title)}</title>`)
    lines.push(`      <link>${escapeXmlRss(link)}</link>`)
    const guid = item.guid ?? link
    lines.push(
      `      <guid isPermaLink="${item.guid ? 'false' : 'true'}">${escapeXmlRss(guid)}</guid>`,
    )
    if (item.pubDate) {
      // See `lastBuildDate` above: the unparseable-date fallback is raw input.
      lines.push(`      <pubDate>${escapeXmlRss(toRfc822(item.pubDate))}</pubDate>`)
    }
    if (item.author) lines.push(`      <author>${escapeXmlRss(item.author)}</author>`)
    if (item.categories) {
      for (const cat of item.categories) {
        lines.push(`      <category>${escapeXmlRss(cat)}</category>`)
      }
    }
    if (item.description) {
      lines.push(`      <description>${escapeXmlRss(item.description)}</description>`)
    }
    if (item.content !== undefined) {
      lines.push(`      <content:encoded>${cdata(item.content)}</content:encoded>`)
    }
    lines.push('    </item>')
  }
  lines.push('  </channel>')
  lines.push('</rss>')
  return lines.join('\n') + '\n'
}
