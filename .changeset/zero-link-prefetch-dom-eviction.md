---
"@pyreon/zero": patch
---

fix(zero/link): evict DOM `<link>` nodes when the prefetch cache rolls over

`doPrefetch` injected `<link rel="prefetch">` and `<link rel="modulepreload">`
elements into `document.head` with NO cleanup. The in-memory `prefetched`
Set was capped at 200 with FIFO eviction, but the matching DOM nodes
stayed forever. Long SPA sessions accumulated thousands of stale
`<link>` nodes in `<head>`.

Fix: `prefetched` is now a `Map<href, Element[]>` — when the cache
evicts the oldest href, its matching `<link>` elements are also
`.remove()`d from `document.head`.
