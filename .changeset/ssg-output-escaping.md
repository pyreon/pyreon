---
'@pyreon/zero': patch
---

fix(zero): four SSG output surfaces interpolated data into a format with its own grammar

Each was the only unguarded field among guarded siblings — the shape worth
naming, because an escaper applied to a value's neighbours reads as covering it.

**`_redirects` and `_headers` are line-oriented**, so a line terminator in a
value is not cosmetic, it is a new rule. `to` comes from the argument to a
`redirect()` thrown by a route loader at build time, and the idiomatic CMS
shape is `if (post.redirectTo) throw redirect(post.redirectTo, 301)`:

```
/a /b
/* https://evil.com/:splat 302
# 301
```

a complete, valid Netlify / Cloudflare Pages rule, with the orphaned status
neutralised by the trailing `#`. Stripped rather than escaped — these formats
have no escape syntax, and a path containing a raw line terminator is already
malformed. `_headers` takes the same guard: a terminator there can SET or
REMOVE per-path response headers (CSP, CORS, framing).

**RSS dates skipped the escaper on the fall-through.** `toRfc822` returns its
INPUT VERBATIM when `new Date()` yields NaN, and that result was the one field
in the feed that was not escaped — so a malformed date, which is ordinary in a
CMS, could close `</item></channel></rss>` and forge entries.

**Sitemap `<lastmod>` was unescaped** where `<loc>` and the hreflang hrefs in
the same function are escaped, so a data-derived `additionalPaths[].lastmod`
could forge a whole `<url>` entry.
