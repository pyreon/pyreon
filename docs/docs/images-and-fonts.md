---
title: Images & Fonts
description: Out-of-the-box image and font optimization in @pyreon/zero — bi-modal Image, descriptor compat, registries, priority preload, self-hosted Google Fonts.
---

# Images & Fonts

`@pyreon/zero` auto-wires `imagePlugin` and `fontPlugin` into the build pipeline by default. A user adds `pyreon()` + `zero()` to vite.config and `<Image>` + self-hosted fonts Just Work — no manual plugin wiring.

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero'

export default {
  plugins: [
    pyreon(),
    zero({
      image: { formats: ['avif', 'webp'] },        // optional — defaults are sensible
      font: { google: ['Inter:wght@400;500;700'] }, // optional — declares fonts
    }),
  ],
}
```

`image: false` or `font: false` opts out entirely. `{}` (or omitted) uses the plugin's defaults.

## `<Image>` — bi-modal API

Two call shapes, one component:

```tsx
// 1. Descriptor form — width/height/srcset/placeholder/formats inherited.
import hero from './hero.png?optimize'

<Image src={hero} alt="Hero" priority />

// 2. String form — width + height REQUIRED at the type level.
<Image src="https://cdn.example.com/avatar.png" width={64} height={64} alt="…" />
```

The `?optimize` import returns a `ProcessedImage` descriptor carrying:

- `src` — the optimized URL (hashed in build, raw fs path in dev)
- `srcset` — width-descriptor responsive set
- `width` / `height` — intrinsic dimensions (CLS prevention)
- `placeholder` — base64 blur or SVG color swatch
- `formats[]` — AVIF / WebP sources for `<picture>`

### Descriptor compatibility

The descriptor's `toString()` / `valueOf()` / `[Symbol.toPrimitive]` all return the URL — foreign code that does `<img src={hero}>` continues to render correctly even outside a Pyreon `<Image>`:

```tsx
import hero from './hero.png?optimize'

// All of these resolve to the optimized URL:
<img src={hero} />                  // foreign component
<link rel="preload" href={hero} />  // raw markup
`${hero}`                            // template literal
hero == '/img/hero-a1b2.webp'        // (with valueOf)
```

The descriptor is `Object.freeze`d — accidental mutation throws `TypeError`. The `toString` chain is non-enumerable, so `JSON.stringify(descriptor)` produces clean JSON.

::: warning Object-spread is the one trap
`<img {...descriptor}>` loses the `toString` (defineProperty's non-enumerable descriptor doesn't carry through spread). Use `.src` explicitly when spreading:

```tsx
<img src={descriptor.src} alt="…" />
```
:::

### `optimize={false}` bypass

Drops the optimization wrapper entirely. Useful for icons inside a custom layout where the wrapper's `aspect-ratio` would distort the visual:

```tsx
<Image src={hero} alt="…" optimize={false} />
// → <img src="/img/hero-a1b2.webp" width="1920" height="1080" alt="…" />
```

The descriptor's `src`/`width`/`height` still feed the bare `<img>` — you get CLS prevention without the wrapper.

### `priority` — preload for LCP images

When an image is the Largest Contentful Paint (hero image, above-the-fold avatar, anything visible on initial load), mark it `priority`:

```tsx
<Image src={hero} alt="Hero" priority />
```

This:

1. Sets `fetchpriority="high"` on the `<img>` (high-priority fetch queue).
2. Sets `loading="eager"` (skips lazy-load).
3. Emits a `<link rel="preload" as="image" fetchpriority="high">` into `<head>` via `useHead`, with `imagesrcset` + `imagesizes` so the browser's preload scanner picks the right size.
4. For cross-origin URLs: adds `crossorigin="anonymous"` so the preload doesn't double-fetch.
5. Dedupes: two `<Image priority>`s with the same `src` emit ONE preload (via `@pyreon/head`'s LinkTag href-keying).

When `priority` is set but neither `srcset` nor `formats[]` is present (a fixed-size bare URL), the preload is **omitted** — `fetchpriority="high"` on the `<img>` alone is enough, and a bare-href preload would double-fetch.

## `createImageRegistry` — typed asset registries

For icon sets / logo libraries / partner images where you want to reference assets by name:

```tsx
import { createImageRegistry } from '@pyreon/zero'

const logos = createImageRegistry(
  import.meta.glob<ProcessedImage>('../assets/partners/*.png?optimize', { eager: true })
)

// Look up by full path, basename, or basename-without-extension:
<Image src={logos('../assets/partners/strv.png')} alt="STRV" />
<Image src={logos('strv.png')} alt="STRV" />
<Image src={logos('strv')} alt="STRV" />
```

Default `keyBy: 'auto'` creates basename + basename-without-extension aliases. `keyBy: 'path'` disables aliases — use it when two files share a basename.

Missing keys throw a descriptive error in dev mode (lists registered keys); pass a fallback to suppress:

```tsx
const logo = logos('unknown', placeholderDescriptor)  // returns fallback
const maybe = logos('unknown', null)                  // null = opt-in skip-render
```

## Fonts — self-hosted Google Fonts + preload

`fontPlugin` is auto-wired by `zero()`. Declare fonts:

```ts
zero({
  font: {
    google: ['Inter:wght@400;500;700', 'JetBrains Mono:wght@400;600'],
    display: 'swap',     // default
    preload: true,        // default — emit <link rel="preload"> for critical fonts
    selfHost: true,       // default — download at build, serve from /assets/fonts/
  },
})
```

At build time the plugin:

- Downloads each Google Font woff2 file and writes to `dist/assets/fonts/`
- Generates `@font-face` declarations referencing the self-hosted files
- Injects `<link rel="preload" as="font" type="font/woff2" crossorigin>` into `<head>`
- Adds `font-display: swap` to prevent Flash of Invisible Text (FOIT)
- Optionally applies size-adjusted fallback metrics to reduce CLS during font swap

Local fonts:

```ts
zero({
  font: {
    local: [
      { family: 'Brand', src: '/fonts/brand.woff2', weight: 400, style: 'normal' },
    ],
  },
})
```

In dev mode the plugin falls back to the Google Fonts CDN for fast startup (no download step); production always self-hosts.

## Opt-out

Either plugin can be skipped entirely:

```ts
zero({
  image: false,  // no ?optimize import handling, no AVIF/WebP, no sharp
  font: false,   // no font plugin
})
```

Use `image: false` when you handle image optimization via a third-party CDN provider (Cloudinary, Imgix, etc.). Use `font: false` when you load fonts via a different mechanism (a `<link>` in `index.html`, a CSS `@import`, etc.).

## Configuration reference

### `image`

| Field | Type | Default | Description |
|---|---|---|---|
| `formats` | `('avif' \| 'webp' \| 'jpg' \| 'png')[]` | `['avif', 'webp']` | Output formats for `<picture>` sources. Fallback is the source format. |
| `quality` | `number \| Partial<Record<Format, number>>` | `80` | Per-format quality. Object form: `{ avif: 55, webp: 75 }`. |
| `placeholder` | `'blur' \| 'color' \| 'none'` | `'blur'` | LQIP strategy. `color` uses sharp's dominant-color SVG swatch; `none` skips entirely. |
| `widths` | `number[]` | `[640, 1080, 1920]` | Responsive srcset widths. |
| `cdn` | `(src, opts) => string \| undefined` | — | CDN URL builder. See `cdnProviders` for built-ins (Cloudinary, Vercel). |
| `cacheDir` | `string` | `'node_modules/.cache/pyreon-images'` | Where sharp writes optimized images during build. |
| `svg` | `boolean \| SvgOptions` | `false` | Enable `?component` import for inline SVGs. |

### `font`

| Field | Type | Default | Description |
|---|---|---|---|
| `google` | `GoogleFontInput[]` | — | Google Fonts to self-host. Each entry: string shorthand (`'Inter:wght@400;700'`) or `{ family, weights, italic?, variable? }`. |
| `local` | `LocalFont[]` | — | Local font files: `{ family, src, weight, style }`. |
| `display` | `'swap' \| 'block' \| 'fallback' \| 'optional' \| 'auto'` | `'swap'` | `font-display` value for all declarations. |
| `preload` | `boolean` | `true` | Emit `<link rel="preload">` tags for critical fonts. |
| `selfHost` | `boolean` | `true` | Self-host Google Fonts at build time. `false` keeps the Google CDN link. |
| `fallbacks` | `Record<string, FallbackMetrics>` | — | Size-adjusted fallback font metrics for CLS reduction. |

## Migration

If you previously added the plugins manually:

```ts
// Before
import { imagePlugin } from '@pyreon/zero/image-plugin'
import { fontPlugin } from '@pyreon/zero/font'

export default {
  plugins: [pyreon(), zero(), imagePlugin({...}), fontPlugin({...})],
}

// After — config flows through zero()
export default {
  plugins: [
    pyreon(),
    zero({
      image: {...},
      font: {...},
    }),
  ],
}
```

Both forms work — auto-wire is a convenience layer over the same plugins, not a replacement. Direct plugin calls remain supported for advanced setups (custom ordering, multiple instances).
