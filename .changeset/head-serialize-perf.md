---
'@pyreon/head': patch
---

Faster SSR head serialization + a public `serializeHead()` export.

- `serializeTag` now builds attributes with a direct `for…in` concat loop
  instead of `Object.entries(props).map(closure).join(' ')` (which
  allocated a pairs array + a per-tag closure + a strings array + a join
  per tag — the dominant cost when serializing many `<meta>` tags).
- The HTML escaper is a single charCode-scan pass: clean strings (the
  common case) return the original with zero allocation; strings needing
  escapes are rebuilt via slices in the same pass — replacing the prior
  `RE.test(s) ? s.replace(RE, …) : s` (two regex passes on any string
  containing a special char).
- New public `serializeHead(tags, titleTemplate?)` (from `@pyreon/head/ssr`)
  — the string-producing half of `renderWithHead`, for pipelines that
  resolve the head separately from the app render (streaming SSR, custom
  templating, framework adapters). `renderWithHead` now uses it (DRY).

Measured (`bench:head`, Bun, apples-to-apples — both producing the final
`<head>` HTML string): Pyreon is ~2.1× / ~1.33× / ~1.34× faster than unhead
at 5 / 20 / 50 meta tags. (The previous "4.9–7.2×" figure was a benchmark
artifact — it compared Pyreon's resolve-only against unhead's
resolve-and-serialize; with the bench corrected to compare equal work,
Pyreon initially LOST until this optimization.) Output is byte-identical
(127 head tests pass).
