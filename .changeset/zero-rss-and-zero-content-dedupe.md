---
'@pyreon/zero': minor
'@pyreon/zero-content': patch
'@pyreon/vitest-config': patch
---

`@pyreon/zero`: add RSS 2.0 feed support to the SEO surface

- New `generateRssFeed({ title, origin, items, ... })` builder
- New `toRfc822` helper (ISO-8601 → RFC-822 date conversion)
- `seoPlugin({ rss: {...} })` auto-emits `dist/rss.xml` at build time
- `seoMiddleware` serves `/rss.xml` during dev
- Exported from `@pyreon/zero/server`

This consolidates SEO into one canonical source — RSS now lives alongside
sitemap, robots, and JSON-LD generators in `seo.ts`.

`@pyreon/zero-content`: deprecate duplicated SEO builders

- `seo/rss.ts` is now a thin backward-compat adapter that delegates to
  `@pyreon/zero`'s `generateRssFeed`. Preserves the `baseUrl` field
  name. New code should import from `@pyreon/zero` directly.
- `seo/sitemap.ts` and `seo/llms-txt.ts` marked `@deprecated`. Zero's
  `seoPlugin` (sitemap) and `aiPlugin` (llms.txt) are richer
  alternatives with i18n, hreflang, manifest-aware route enumeration,
  and dev-server middleware.

`@pyreon/vitest-config`: add `@pyreon/zero/server` + `@pyreon/zero/client`
subpath aliases so workspace test runs resolve them under the `bun`
condition.
