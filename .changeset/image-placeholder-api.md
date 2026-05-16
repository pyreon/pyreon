---
'@pyreon/zero': minor
---

`imagePlugin` — implement the `'color'` placeholder strategy + add per-format quality. Closes a typed-but-unimplemented bug.

**Closed bug (the `audit-types` class):** `PlaceholderStrategy` typed `'dominant-color'` from the plugin's inception but no code path ever implemented it — the CDN, dev, and build paths each open-coded `generateBlurPlaceholder`, so `placeholder: 'dominant-color'` silently produced a blur and `placeholder: 'none'` was silently ignored in build mode (only the CDN path honored it). All three paths now route through one `generatePlaceholder` dispatcher:

- `'blur'` (default, unchanged) — downscaled + blurred WebP base64
- `'color'` — sharp `.stats().dominant` → ~70-byte flat-fill SVG data URI (instant paint, zero layout shift, smallest payload)
- `'dominant-color'` — **deprecated alias of `'color'`**, normalized via `normalizePlaceholder`
- `'none'` — now honored in every path, not just CDN

**Better API — per-format quality.** `quality` now accepts a per-format map in addition to a single number:

```ts
imagePlugin({ formats: ['avif', 'webp'], quality: { avif: 55, webp: 75 } })
```

AVIF reaches WebP-equivalent perceived quality at a much lower number, so one flat value either over-spends bytes on AVIF or under-delivers on WebP. Formats omitted from the map fall back to 80. A bare number still works unchanged (backward-compatible). Resolved once into a per-format lookup (`resolveQuality`) threaded through the CDN / dev / build paths.

Backward-compatible: default placeholder stays `'blur'`, default quality stays `80`, the `placeholder` string contract is unchanged so `<Image>` consumes every strategy identically. `generatePlaceholder` / `resolveQuality` / `normalizePlaceholder` are `@internal` exports for unit testing (19 specs, including the bisect-locking `'none' produces no placeholder` regression that fails against the pre-dispatcher build path).

ThumbHash placeholders, rich import queries (`?inline` / `?url` / `?meta`), and a wasm sharp-fallback are deliberately deferred to follow-up PRs.
