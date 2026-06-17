---
'@pyreon/zero-content': minor
---

Search results now deep-link to the heading that best matches the query.

Each page's heading anchors (slug + lowercased text) are stored alongside its
search document, and the runtime picks the heading containing the most of the
query's matched terms — so a hit jumps to the exact section (`/docs/router#keyed-lists`)
instead of the page top. Falls back to the page URL when the match is in the
body or page title (no heading contains a matched term).

This delivers section-precision navigation without one search document per
section, which ~4×'s the index and would hit the 1 MB build-error budget at
~130 pages. The page stays the single searchable unit; the docs index grows
modestly (~210 KB → ~350 KB at 96 pages) with headroom to ~270 pages.
