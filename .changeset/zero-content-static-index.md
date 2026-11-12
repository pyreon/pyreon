---
'@pyreon/zero-content': patch
---

A static, islands-only site (no page module runs in the browser, so the client build compiles no Markdown) now gets its search index and SEO outputs (RSS, sitemap, llms.txt): when the client build had no entries, @pyreon/zero's inner SSG build writes them into `dist/`. An index the client build wrote is still never re-emitted.
