---
"@pyreon/zero-content": minor
---

Remove the deprecated SEO helpers `generateSitemap`, `generateRssFeed`, `toRfc822` and `generateLlmsTxt` (and their `GenerateSitemapArgs`, `SitemapPage`, `GenerateRssFeedArgs`, `RssItem`, `GenerateLlmsTxtArgs`, `LlmsTxtPage`, `LlmsTxtSection` types), and stop exporting `shortId` from `@pyreon/zero-content/plugin`. The plugin's `seo: { sitemap, rss, llms }` output is unchanged.

What is gone with them: `generateSitemap` and `generateLlmsTxt` were pure builders that took an ARBITRARY list (`pages`, or named `sections` of titled pages) from your own build script. `seoPlugin` and `aiPlugin` build from the route files instead, so they are not drop-in replacements for a hand-assembled list.

Migration:

- **RSS:** import `generateRssFeed` / `toRfc822` / `RssItem` from `@pyreon/zero` (pass `origin` instead of `baseUrl`). Same generator.
- **Sitemap from content collections:** the content plugin's `seo: { sitemap: true }` emits it. **From routes:** `seoPlugin` from `@pyreon/zero/server`. **From your own list:** `generateSitemap([], { origin, additionalPaths: pages })` from `@pyreon/zero/server` is still a pure builder; each entry takes `path` and optional `lastmod`, `changefreq`, `priority`.
- **llms.txt from content collections:** the content plugin's `seo: { llms }`. **From routes:** `aiPlugin` from `@pyreon/zero/server`. **Custom named sections:** there is no pure builder any more. Write the few lines of markdown yourself (`# Title`, `> description`, `## Section`, `- [title](url): description`), or append them to `aiPlugin`'s output with its `llmsExtra` option.

Upgrade: manual — move each removed import to the replacement above; no codemod, because the sitemap and llms.txt arguments change shape and a custom llms.txt section list has no one-to-one target.
