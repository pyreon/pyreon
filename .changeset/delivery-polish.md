---
'@pyreon/zero': minor
---

Delivery polish (Phase 6 of the render-modes plan):

- **`ssg.speculationRules: 'prefetch' | 'prerender'`** — inject a Speculation Rules document-rules block into every prerendered page (near-instant MPA navigations; progressive enhancement).
- **`ssg.viewTransitions: true`** — cross-document View Transitions opt-in (`@view-transition { navigation: auto }`) on prerendered pages.
- **`ssg.cssMode: 'asset'`** — ship the styler's CSS as ONE content-hashed shared file every page links, instead of inlining the full sheet in each page's HTML.
- **`ssg.earlyHints: true`** — per-path `Link: <chunk>; rel=modulepreload` entries in `_headers` (Cloudflare/Netlify emit HTTP 103 Early Hints from them).
- **ISR tag-based invalidation** — `isr.tagsForRequest(req)` records tags at cache-set time; `isrHandler.revalidateTag(tag)` drops every entry carrying the tag (CMS-webhook ergonomics, no path enumeration). Both shipped stores implement the tag index.
- **`createFsStore(dir)`** — filesystem-backed ISR store for self-hosted node/bun: the cache (and tag index) survives restarts, killing the cold-cache thundering herd. Errors degrade to cache-miss, never a request-path throw.
