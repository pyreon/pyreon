---
'@pyreon/zero': minor
'@pyreon/create-zero': patch
---

feat(zero): one config surface for the whole DX suite — `zero({ seo, favicon, og, ai })` — plus parallel favicon/og generation

**Unified auto-wiring.** `seoPlugin`, `faviconPlugin`, `ogImagePlugin`, and `aiPlugin` are now fields on `zero()` — the same pattern `image`/`font` already used — instead of four separate imports + plugin entries:

```ts
zero({
  font: { google: ['Inter:wght@400;700'], fallbackAdjust: true },
  seo: { sitemap: { origin: 'https://example.com' }, robots: { … } },
  favicon: { source: './src/favicon.svg', darkSource: './src/favicon-dark.svg' },
  og: { templates: [{ name: 'default', background: { color: '#111' }, layers: [{ text: 'Hi' }] }] },
  ai: { name: 'My Site' },
})
```

Unlike image/font these are NOT default-on — each needs user input to do anything meaningful (an origin, a source icon, templates), so supplying the config IS the opt-in. The standalone plugin imports keep working unchanged.

**Parallel image generation.** `faviconPlugin` previously resized every PNG **serially** — and in dual-variant (dark) mode re-rendered the light PNGs a second time for the standard names. All sizes + locale sets now generate in parallel and the light buffers are reused (identical bytes), so a 5-locale dual-variant build drops from ~6× to ~1× the single-set wall clock. `ogImagePlugin` likewise renders all template × locale variants in parallel (3 templates × 5 locales previously paid 15× the single-image time).

**Scaffolder alignment.** `create-zero`'s generated `vite.config.ts` now uses the unified `zero({ font, seo })` surface, `subsets: ['latin']`, and `fallbackAdjust: true` (the auto capsize-derived CLS-free fallback) instead of hand-tuned `sizeAdjust`/`ascentOverride` metrics.
