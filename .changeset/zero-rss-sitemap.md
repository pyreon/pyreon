---
'@pyreon/zero': patch
---

RSS and sitemap fixes:

- `generateRssFeed` emits an item's `content` (HTML) as CDATA-wrapped `<content:encoded>`, and `feedUrl` as `<atom:link rel="self">`. Each namespace is declared only when it is used.
- The sitemap no longer lists the not-found route (`_404` or `_not-found`) as a page.
- The sitemap no longer emits a nested index twice when the route scan finds `/posts/` and the SSG manifest lists `/posts`.
