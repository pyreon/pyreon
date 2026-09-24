---
'@pyreon/zero': patch
---

fix(zero): escape data written into SSG output files

Four build outputs interpolated route or CMS data without escaping it for their format:

- **`_redirects`** (Netlify / Cloudflare Pages) is one rule per line. A line break in a `redirect()` target or source, for example `if (post.redirectTo) throw redirect(post.redirectTo, 301)`, added a new rule, which could send every path to another site. Line terminators are now stripped: the format has no escape syntax.
- **`_headers`** (`ssg.earlyHints`) has the same line-oriented format. A line break in a path could add a block that sets or removes response headers such as CSP. Stripped the same way.
- **RSS `pubDate` / `lastBuildDate`**: an unparseable date is written as its raw input, and that value was not XML-escaped, so it could close the feed and add entries. It is now escaped like every other RSS field.
- **Sitemap `<lastmod>`** was not escaped, while `<loc>` and the hreflang links beside it were. A data-derived `additionalPaths[].lastmod` could add `<url>` entries. It is now escaped.
