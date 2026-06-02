---
"@pyreon/zero": minor
"@pyreon/mcp": patch
---

feat(zero): `sitemap.trailingSlash` option (`'always' | 'never' | 'preserve'`)

Adds a trailing-slash policy to `SitemapConfig`, applied to every non-root
`<loc>` and hreflang `href`. Default `'preserve'` is a no-op (no behaviour
change). Set `'always'` when deploying SSG output to a host that 301-redirects
`/path` → `/path/` (GitHub Pages, directory-style Netlify / Cloudflare Pages) so
the sitemap stops emitting redirect-triggering URLs — closes the bokisch.com
0.27.1 Lighthouse "Avoid multiple page redirects" finding (~160ms).

Default kept `'preserve'` rather than auto-switching on adapter, since not every
SSG host redirects — opt in to match your host. `@pyreon/mcp` api-reference
regenerated from the updated manifest.
