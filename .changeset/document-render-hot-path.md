---
'@pyreon/document': patch
---

Render hot-path performance pass + a code-block double-escape fix.

- **Fix: code blocks no longer double-escape in the html and email renderers.** Both wrapped `renderChildren(...)` — which already escapes string children — in a second outer escape, so `<Code>a < b && c</Code>` emitted `a &amp;lt; b &amp;amp;&amp;amp; c` and the entities rendered literally. Code content is now escaped exactly once (regression-locked through the public `render()` API, bisect-verified).
- **Perf: `escapeXml` is now single-pass** — a `NEEDS_ESCAPE_RE` fast path returns clean strings untouched (the dominant case), and dirty strings take one charCode scan with lazy slicing instead of the previous 4 chained `.replace()` passes. The entity set is unchanged (`& < > "` — no `&#39;`); output is byte-identical (differential-tested against the old implementation).
- **Perf: `''`-joined `.map().join('')` child concatenation replaced with `acc +=` loops** in `getTextContent` and the html/email/markdown/text/telegram/whatsapp/slack renderers (V8 cons-strings beat join at every measured size). Separator joins are untouched.

Measured on the repo's `bench:document` (median-of-7): escape-heavy formats gain the most — LARGE report email ~6×, html ~5×, svg ~3×, google-chat ~2.6× docs/sec; most other formats move within noise.
