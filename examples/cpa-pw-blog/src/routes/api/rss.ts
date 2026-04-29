import { posts } from "../../lib/posts"

/**
 * Site origin used in feed URLs. Set this to your deployed domain — RSS readers
 * resolve relative links against it. The placeholder works locally and at any
 * preview URL but should be updated before publishing.
 */
const SITE_ORIGIN = "https://example.com"
const SITE_TITLE = "Blog"
const SITE_DESCRIPTION = "A Pyreon Zero blog."

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function rfc822(date: string): string {
  // Accepts YYYY-MM-DD; outputs RFC 822 used by RSS readers
  return new Date(`${date}T00:00:00Z`).toUTCString()
}

export function GET() {
  const items = posts
    .map((p) => {
      const url = `${SITE_ORIGIN}/blog/${p.slug}`
      return `    <item>
      <title>${escape(p.title)}</title>
      <link>${url}</link>
      <guid>${url}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${escape(p.description)}</description>
    </item>`
    })
    .join("\n")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escape(SITE_TITLE)}</title>
    <link>${SITE_ORIGIN}</link>
    <description>${escape(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
${items}
  </channel>
</rss>
`

  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  })
}
