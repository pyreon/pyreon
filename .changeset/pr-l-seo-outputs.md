---
'@pyreon/zero-content': minor
---

PR-L — SEO + build outputs (audit M19)

Three pure builders + a plugin auto-emit hook:

- **`generateSitemap({ baseUrl, pages })`** — sitemap.xml per
  sitemap.org spec. Supports `lastmod`, `changefreq`, and clamped
  `priority` fields. XML-escapes URLs so user-content `?a=1&b=2`
  paths survive.

- **`generateRssFeed({ title, baseUrl, items })`** — RSS 2.0 with
  ISO-8601 → RFC-822 date conversion (`toRfc822` exported). Supports
  per-item `pubDate`, `author`, `categories`, custom `guid`, and
  channel-level `language` / `lastBuildDate`.

- **`generateLlmsTxt({ title, baseUrl, sections })`** — llmstxt.org
  index format. Markdown-shaped page list per section with optional
  blockquote site description.

- **Plugin auto-emit** via `content({ seo: { baseUrl, sitemap, rss,
  llms } })`. `closeBundle` walks the accumulated collection
  entries and writes `dist/sitemap.xml`, `dist/rss.xml`, and
  `dist/llms.txt` per opt-in flags. Per-collection URL overrides
  (`collectionUrls: { blog: '/news' }`) and skip-collection
  (`collectionUrls: { drafts: null }`) supported.

27 new specs cover the three builders + the plugin hook;
bisect-verified by short-circuiting the sitemap emission branch.
