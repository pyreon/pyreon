---
"@pyreon/zero-content": minor
---

Remove the deprecated SEO helpers `generateSitemap`, `generateRssFeed`, `toRfc822` and `generateLlmsTxt` (and their `GenerateSitemapArgs`, `SitemapPage`, `GenerateRssFeedArgs`, `RssItem`, `GenerateLlmsTxtArgs`, `LlmsTxtPage`, `LlmsTxtSection` types), and stop exporting `shortId` from `@pyreon/zero-content/plugin`. The plugin's `seo: { sitemap, rss, llms }` output is unchanged.

Migration: import `generateRssFeed` / `toRfc822` / `RssItem` from `@pyreon/zero` (pass `origin` instead of `baseUrl`), and use `seoPlugin` / `aiPlugin` from `@pyreon/zero/server` for the sitemap and `llms.txt`.
