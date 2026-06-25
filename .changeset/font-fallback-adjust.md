---
'@pyreon/zero': minor
---

font: auto-compute size-adjusted fallback fonts (`fallbackAdjust`) to eliminate font-swap CLS

`@pyreon/zero/font` now auto-computes size-adjusted fallback `@font-face`
declarations — the `next/font` technique — to eliminate the layout shift
(CLS) that occurs when a Google Font swaps in over a system font with
different metrics.

For each Google family, the build unpacks the actual downloaded `woff2`
for ground-truth metrics (`@capsizecss/unpack`; CDN mode falls back to
`@capsizecss/metrics`' precomputed table) and emits a paired
`@font-face` for `"<Family> Fallback"` whose `size-adjust` +
`ascent/descent/line-gap-override` (computed via `@capsizecss/core`'s
`createFontStack`) make the system fallback's box match the web font, so
the swap moves nothing.

Crucially — so the fallback actually reaches the rendered text — the
build also emits a `--pyreon-font-<slug>` CSS variable carrying the full
stack (e.g. `--pyreon-font-ubuntu: Ubuntu, "Ubuntu Fallback", Arial`).
Use it as your `font-family` (`body { font-family: var(--pyreon-font-ubuntu) }`)
and the size-adjusted fallback renders until the web font loads.

```ts
zero({ font: { google: ['Ubuntu:wght@300;500'], fallbackAdjust: true } })
```

- Default: `true`. Set `false` to opt out.
- A manual `fallbacks` entry for a family takes precedence (auto skips it).
- A font whose metrics can't be resolved is skipped with a build warning
  — never a build failure.
- `@capsizecss/*` runs at build time only; nothing is added to the client
  bundle.
