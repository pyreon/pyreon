---
'@pyreon/zero-content': minor
---

Draft and scheduled entries stay out of every public output, and the RSS feed can carry full articles.

- New collection options. `publishDate: '<field>'` makes an entry dated in the future unpublished until that date, the same way `draft: true` works. `unpublished: 'omit'` leaves unpublished entries out of a production build entirely: they are not bundled, not routable, and not reachable through `getEntry`. Use it on static sites. The default, `'runtime'`, keeps the previous behavior: entries stay bundled and preview mode can still show them.
- A production build no longer lists drafts or scheduled entries in the search index, `sitemap.xml`, the RSS feed or `llms.txt`. Before this change, drafts were included in all four.
- `PYREON_CONTENT_NOW` overrides the build's clock, so you can build the site as it will look on a future date. `isPublished(data, publishDateField?, now?)` is exported.
- New `seo.rss` options. `path` sets the output location (for example `'blog/rss.xml'`) and also emits `<atom:link rel="self">`. `content: 'full'` renders each body to HTML in `<content:encoded>` with absolute URLs, which is what dev.to's "Publishing from RSS" and feed readers import. `limit` keeps only the newest N items. Items now carry `pubDate` and are sorted newest first, and `tags` become `<category>` elements.
- **Breaking:** `entry.slug` from `getCollection`, `getEntry` and `getEntries` is now relative to the collection, for example `'hello'` for `src/content/blog/hello.md`. It is the same key `getEntry` accepts. Before, `getCollection` returned the content-root path (`'blog/hello'`), so `` `/blog/${entry.slug}` `` built `/blog/blog/hello`.
- Fix: `defineContentRoute` now applies its head tags on the client. `useHead` used to run after the entry `await`, where the client has no component context, so the tags were never applied and a hydrated or client-navigated page kept the previous `<title>`.
