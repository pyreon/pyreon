---
'@pyreon/zero': minor
---

**Image plugin: better placeholder + quality API; closes a typed-but-unimplemented bug.**

`imagePlugin`'s `PlaceholderStrategy` typed `'dominant-color'` since the plugin's inception but **never implemented it** — every path (CDN / dev / build) fell through to blur. Worse, `placeholder: 'none'` was only honoured in the CDN path: the build (`processImage`) and dev (`loadDevImage`) paths hard-coded `generateBlurPlaceholder` and ignored the configured strategy entirely. This is exactly the typed-but-unimplemented bug class Pyreon's `audit-types` gate exists to catch.

This PR routes every path through a single `generatePlaceholder(input, strategy, size)` dispatcher, so the configured strategy is honoured everywhere, and implements the colour strategy for real:

- **New `placeholder: 'color'`** — the image's dominant colour (sharp `.stats()` histogram swatch, not a muddy average) as a constant ~200-byte flat SVG data URI. Zero image decode, instant paint, no layout shift, and a fixed size regardless of source complexity (a blurred WebP grows with image content). The swatch is approximate by design — a pure-red source resolves to ~`#f80808`, not `#ff0000`.
- **`'dominant-color'` is kept as a deprecated alias of `'color'`** — existing configs that set it (and silently got blur) now get the colour placeholder they asked for. Prefer the shorter `'color'` in new code.
- **`placeholder: 'none'` now works in build + dev mode**, not just CDN mode.

**New per-format `quality` API** — `quality` now accepts `number | Partial<Record<ImageFormat, number>>`. AVIF tolerates a far lower number than WebP/JPEG for the same perceived quality; you can now tune each codec independently:

```ts
imagePlugin({ formats: ['avif', 'webp'], quality: { avif: 55, webp: 75 } })
```

The single-number form (`quality: 85`) is unchanged — fully backward-compatible. Formats omitted from a map fall back to 80.

No `<Image>` component changes — `placeholder` is still consumed as an opaque string, so this is drop-in for existing consumers. Tests: 5 new specs in `image-plugin.test.ts` (per-format quality resolution, alias normalization, sharp-backed dispatch for color/blur/none, constant-size invariant for `'color'`).
