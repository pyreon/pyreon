// ─── sitemap.xml emitter (PR-L audit M19) ─────────────────────────────────
//
// Pure builder that produces a sitemap.xml string from a list of
// pages. Sitemaps follow the protocol at https://www.sitemaps.org/.
//
// Authors call this from their build script with the collection
// entries:
//
//     import { generateSitemap } from '@pyreon/zero-content'
//     const entries = await getCollection('docs')
//     const xml = generateSitemap({
//       baseUrl: 'https://example.com',
//       pages: entries.map((e) => ({ path: `/docs/${e.slug}` })),
//     })
//     await fs.writeFile('dist/sitemap.xml', xml)
//
// Or use the plugin's auto-emit hook (`sitemap: { baseUrl }`).

export interface SitemapPage {
  /** Relative URL path (joined to baseUrl at render time). */
  path: string
  /** Optional ISO-8601 last-modified date (`YYYY-MM-DD` or full
   *  ISO string). */
  lastmod?: string
  /** Change frequency hint per sitemap.org spec. */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  /** Priority 0.0–1.0 per sitemap.org spec. */
  priority?: number
}

export interface GenerateSitemapArgs {
  /** Site origin (no trailing slash). */
  baseUrl: string
  /** Pages in display order. */
  pages: SitemapPage[]
}

/**
 * Join a base URL with a path segment without producing `//`.
 *
 * @internal exported for testing
 */
export function joinUrl(baseUrl: string, pagePath: string): string {
  // O(n) — no quantifier regex. CodeQL flagged `/\/+$/` as polynomial
  // ReDoS on `/`-heavy input. Strip trailing slashes by index walk.
  let end = baseUrl.length
  while (end > 0 && baseUrl.charCodeAt(end - 1) === 47) end--
  const cleanedBase = baseUrl.slice(0, end)
  if (pagePath.length === 0) return cleanedBase
  const cleanedPath = pagePath.startsWith('/') ? pagePath : '/' + pagePath
  return cleanedBase + cleanedPath
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

export function generateSitemap(args: GenerateSitemapArgs): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  for (const page of args.pages) {
    lines.push('  <url>')
    lines.push(`    <loc>${escapeXml(joinUrl(args.baseUrl, page.path))}</loc>`)
    if (page.lastmod) lines.push(`    <lastmod>${escapeXml(page.lastmod)}</lastmod>`)
    if (page.changefreq) lines.push(`    <changefreq>${page.changefreq}</changefreq>`)
    if (typeof page.priority === 'number') {
      // Clamp to [0.0, 1.0] per the spec.
      const clamped = Math.max(0, Math.min(1, page.priority))
      lines.push(`    <priority>${clamped.toFixed(1)}</priority>`)
    }
    lines.push('  </url>')
  }
  lines.push('</urlset>')
  return lines.join('\n') + '\n'
}
