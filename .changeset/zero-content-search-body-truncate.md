---
'@pyreon/zero-content': patch
---

perf(zero-content): truncate search-index body to ~1500 chars per page

For a 91-page docs site the full stripped-markdown body exceeded the
plugin's own 300KB warn threshold (719KB observed on docs-zero). Most
search hits land in title (boost 3) / headings (boost 2) / description
(boost 1.5) anyway, so truncating the body to the first 1500 chars
(at a word boundary) shrinks the index without measurably affecting
result quality. Measured impact: 719KB → 198KB on docs-zero (-72%).

The 1500-char limit is currently hardcoded; tuning per project lands
when a real use case surfaces.
