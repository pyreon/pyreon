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

## Resource Hints

The `@pyreon/zero` package exports three resource-hint primitives for managing Web Vitals-aware prefetching and preloading. Each is a lightweight wrapper around `useHead` that emits the correct `<link rel="...">` tag into the document head with typed options enforced at the TypeScript level.

### Overview

| Hook | Emits | Use Case | Cost |
|------|-------|----------|------|
| `usePreconnect` | `<link rel="preconnect" ... crossorigin>` | Full connection to a critical external origin (DNS + TCP + TLS) | ~100-300ms saved on first fetch |
| `useDnsPrefetch` | `<link rel="dns-prefetch" ...>` | DNS-only hint for likely-but-uncertain origins (analytics, widgets) | ~10-20ms DNS resolution |
| `usePreload` | `<link rel="preload" as="..." ...>` | Explicit resource fetch hint for critical-path assets | ~50-100ms earlier start on that resource |

### Why Three Separate Hooks?

Rather than a single mega-hook, Pyreon ships three separate primitives because each has distinct semantics and type requirements:

- **`preconnect` ALWAYS needs `crossorigin`** for cross-origin fonts / APIs (without it the connection isn't reused by the credentialed fetch, defeating the hint).
- **`dns-prefetch` is CHEAPER but WEAKER** (DNS only, no TLS handshake) — different semantics, no `crossorigin` needed.
- **`preload` requires typed `as` + resource-specific options** that differ per asset class (fonts need `type`, images need `imagesrcset`/`imagesizes`, etc.).

Per-helper typed contracts catch usage errors at the type level (e.g. `usePreload` without `as` is a TS error).

## usePreconnect

Opens the connection (DNS + TCP + TLS) to a remote origin **before any resource is requested** — saves ~100-300ms on the first fetch from that origin.

```ts
usePreconnect(origin: string, opts?: { credentials?: boolean }): void
```

### Basic Usage

```tsx
// Font CDN — critical for paint
usePreconnect('https://fonts.gstatic.com')

// Image CDN
usePreconnect('https://cdn.example.com')

// API origin
usePreconnect('https://api.example.com')
```

### Credentialed Requests

The default `crossorigin="anonymous"` is correct for 99% of cases — every font fetch, every cross-origin image, every anonymous fetch. Only use `credentials: true` for credentialed cross-origin fetches (rare):

```tsx
// Cross-origin API that requires cookies + headers
usePreconnect('https://api.example.com', { credentials: true })
// → emits crossorigin="use-credentials"
```

### Performance Guidance

Reserve preconnect for the **1-3 most-critical external origins** your page hits. Avoid preconnecting to more than 3-4 origins — each connection costs memory + battery; the marginal benefit drops fast past ~4.

```tsx
// Good — just the critical origins
usePreconnect('https://fonts.gstatic.com')
usePreconnect('https://cdn.example.com')

// Bad — too many preconnects exhaust the connection budget
usePreconnect('https://api1.example.com')
usePreconnect('https://api2.example.com')
usePreconnect('https://api3.example.com')
usePreconnect('https://tracking.example.com')
usePreconnect('https://widget.example.com')
```

## useDnsPrefetch

A cheaper hint than `preconnect` — only resolves the DNS, doesn't open the TCP/TLS connection. Use for origins that are **LIKELY but not certain** to be hit (analytics endpoints that may not fire, third-party widgets that may not render).

```ts
useDnsPrefetch(origin: string): void
```

### Basic Usage

```tsx
useDnsPrefetch('https://analytics.example.com')
useDnsPrefetch('https://widget-provider.com')
```

### Pairing with Preconnect for Browser Fallback

Modern browsers prefer `preconnect` (the full connection) over `dns-prefetch`. Older browsers without preconnect support still get the DNS hint. Pair both for maximum coverage:

```tsx
// Fallback pattern — modern browsers use preconnect, older browsers use dns-prefetch
usePreconnect('https://api.example.com')
useDnsPrefetch('https://api.example.com')  // ignored on preconnect-capable browsers
```

### Notes

- `dns-prefetch` does NOT take `crossorigin` (DNS resolution is scheme-agnostic).
- Like all resource hints, `dns-prefetch` is advisory — the browser may ignore it due to network conditions, Save-Data preference, or memory pressure.

## usePreload

Emits a strong fetch hint for a specific resource that the page will hit in the **critical path**. Unlike generic preload markup, this hook requires the `as` parameter (the preload scanner ignores `<link rel="preload">` without it).

```ts
usePreload(href: string, opts: PreloadOptions): void
```

### Use Cases

- **LCP images** — when not using `<Image priority>`
- **CSS files loaded at runtime** — stylesheets required by JS
- **JSON / fetch responses** — critical-path data the page needs
- **Web worker scripts** — background computation

### Basic Usage

```tsx
// LCP image not using <Image priority>
usePreload('/hero.jpg', { as: 'image' })

// Style sheet loaded at runtime
usePreload('/extra.css', { as: 'style' })

// Font (requires type + crossorigin)
usePreload('/fonts/Inter.woff2', {
  as: 'font',
  type: 'font/woff2',
  crossorigin: 'anonymous',
})
```

### Responsive Images

For responsive image preloads, provide `imagesrcset` + `imagesizes` so the preload scanner picks the right size:

```tsx
usePreload('/hero.jpg', {
  as: 'image',
  imagesrcset: '/hero-640.jpg 640w, /hero-1920.jpg 1920w',
  imagesizes: '100vw',
})
```

### Fetch-Based Data

For JSON or other fetch-based resources, specify `as: 'fetch'` + `type` + `crossorigin`:

```tsx
usePreload('/api/critical.json', {
  as: 'fetch',
  type: 'application/json',
  crossorigin: 'anonymous',
})
```

### Media Queries

Conditionally preload based on a media query — useful for mobile-specific or device-specific resources:

```tsx
// Only preload on mobile
usePreload('/mobile.css', {
  as: 'style',
  media: '(max-width: 600px)',
})
```

### Fetch Priority

Hint the browser's fetch scheduler with `fetchpriority`:

```tsx
// High priority for critical script
usePreload('/critical.js', {
  as: 'script',
  fetchpriority: 'high',
})

// Low priority for deferred script
usePreload('/analytics.js', {
  as: 'script',
  fetchpriority: 'low',
})
```

### Deduplication

Deduplication is handled automatically via `@pyreon/head`'s `href`-keying — two `usePreload` calls with the same `href` emit ONE preload tag:

```tsx
// Both calls below result in a single <link rel="preload" href="/hero.jpg">
<Component1 />  // usePreload('/hero.jpg', { as: 'image' })
<Component2 />  // usePreload('/hero.jpg', { as: 'image' })
```

## PreloadOptions

Configuration for `usePreload`:

```ts
interface PreloadOptions {
  /**
   * REQUIRED. What kind of resource is being preloaded. The browser uses this
   * to set the Accept header, priority bucket, and download size budget.
   * The preload scanner ignores <link rel="preload"> without it.
   */
  as: 'script' | 'style' | 'image' | 'font' | 'fetch' | 'document' | 'audio' | 'video' | 'track' | 'object' | 'embed' | 'worker'

  /**
   * MIME type. REQUIRED for `as: 'font'` (preload scanner ignores font
   * preloads without matching type). Also recommended for `as: 'fetch'`
   * to ensure the correct Accept header.
   */
  type?: string

  /**
   * CORS mode. REQUIRED for fonts ('anonymous'), and for cross-origin
   * fetch/image preloads that the page will then read with CORS
   * (without it, double-fetch).
   */
  crossorigin?: 'anonymous' | 'use-credentials'

  /**
   * Media query — only preload when the query matches.
   * Example: '(max-width: 600px)' for mobile-only.
   */
  media?: string

  /**
   * Responsive image set. Use for LCP image preloads with `as: 'image'`.
   */
  imagesrcset?: string

  /**
   * Responsive sizes attribute paired with imagesrcset.
   */
  imagesizes?: string

  /**
   * Browser fetch priority hint.
   */
  fetchpriority?: 'high' | 'low' | 'auto'
}
```

## Common Patterns

### Font Stack with Preconnect

```tsx
function RootLayout() {
  // Preconnect to the font CDN
  usePreconnect('https://fonts.googleapis.com')
  usePreconnect('https://fonts.gstatic.com', { credentials: false })

  // Preload the specific fonts
  usePreload('/fonts/Inter.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossorigin: 'anonymous',
  })

  usePreload('/fonts/Merriweather.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossorigin: 'anonymous',
  })

  return <>{children}</>
}
```

### Hero Image (LCP) Without `<Image priority>`

```tsx
function HeroSection() {
  // When using a raw img instead of <Image> component
  usePreload('/hero.jpg', {
    as: 'image',
    imagesrcset: '/hero-640.jpg 640w, /hero-1920.jpg 1920w',
    imagesizes: '100vw',
  })

  return <img src="/hero.jpg" alt="Hero" />
}
```

### Critical API Data

```tsx
function DataDependentPage() {
  // Critical fetch that must happen early
  usePreload('/api/config.json', {
    as: 'fetch',
    type: 'application/json',
    crossorigin: 'anonymous',
  })

  return <div>{/* page content */}</div>
}
```

### Fallback for Uncertain Third-Party

```tsx
function Page() {
  // Full preconnect for certain-to-hit origin
  usePreconnect('https://analytics.example.com')

  // Fallback dns-prefetch for older browsers
  useDnsPrefetch('https://analytics.example.com')

  // Optional: preload the analytics script if critical
  usePreload('https://analytics.example.com/sdk.js', {
    as: 'script',
  })

  return <div>{/* page */}</div>
}
```

## Performance Tips

1. **Measure before optimizing** — use DevTools Network tab to identify the slowest third-party origins and resources. Preconnect / preload only what actually moves the needle.

2. **Preconnect ≈ 3-4 origins max** — beyond that, you're competing with other resource fetches and may actually slow down the page.

3. **Preload ≈ 2-5 critical resources** — every preload competes for bandwidth with the critical path. Over-preloading starves other requests.

4. **Pair `preconnect` + `dns-prefetch`** for uncertain origins to cover both modern and legacy browsers.

5. **Use `<Image priority>` instead of `usePreload` for images** — the Image component handles LCP optimization correctly. Only use `usePreload` when you need a raw `<img>` tag.

6. **Test on slower networks** — Fast 3G and 4G (throttled in DevTools) show the real benefit of resource hints. Fiber/broadband may mask poorly-prioritized hints.

## Related

- [`useHead`](/head) — the underlying head-management hook that powers these primitives
- [`@pyreon/head`](/head) — declarative document head management
- [`<Image priority>`](/zero#image) — for optimized LCP images (preferred over `usePreload`)

## `<NoOptimize>` — subtree-scoped image optimization opt-out

`@pyreon/zero` provides a three-tier image optimization grammar:

1. **Per-call**: `<Image src={hero} optimize={false} />`
2. **Subtree**: `<NoOptimize><Image .../><Image .../></NoOptimize>`
3. **Global**: `zero({ image: false })`

The `<NoOptimize>` boundary is the middle tier — wrap a subtree and every `<Image>` inside renders as a bare `<img>` (no IntersectionObserver wrapper, no aspect-ratio container, no lazy-loading layer).

### When to use `<NoOptimize>`

**Icon-sized images in grid layouts:**
```tsx
// Icon grid where the optimization wrapper distorts the layout
export default function IconLibrary() {
  return (
    <NoOptimize>
      <div class="icon-grid">
        <Image src={icon1} alt="Heart" width={24} height={24} />
        <Image src={icon2} alt="Star" width={24} height={24} />
        <Image src={icon3} alt="Moon" width={24} height={24} />
      </div>
    </NoOptimize>
  )
}
```

**Server-rendered, statically cached content (emails, PDFs, share cards):**
```tsx
// HTML email template cached as a static asset
export function EmailTemplate(props: EmailProps) {
  return (
    <NoOptimize>
      <img src={companyLogo} alt="Company" width={200} height={60} />
      <h1>Welcome</h1>
      <Image src={illustration} alt="Illustration" width={400} height={300} />
    </NoOptimize>
  )
}
```

In these cases, the optimization wrapper adds no value (images are already sized or cached), so bypass the overhead.

### Re-enabling optimization within a boundary

Use `<NoOptimize disabled>` to override an outer boundary and restore full optimization for a specific subtree:

```tsx
<NoOptimize>
  <Icon src={smallIcon} alt="Small" />
  <Icon src={anotherIcon} alt="Another" />

  {/* Re-enable optimization for the hero image */}
  <NoOptimize disabled>
    <Image src={hero} alt="Hero" priority />
  </NoOptimize>
</NoOptimize>
```

### Per-call override with `optimize={true}`

The explicit re-enable form that wins over a parent `<NoOptimize>` boundary:

```tsx
<NoOptimize>
  {/* Renders as bare <img> */}
  <Image src={icon} alt="Icon" optimize={false} />

  {/* Forced to optimize, overriding the boundary */}
  <Image src={featured} alt="Featured" optimize={true} />
</NoOptimize>
```

**Precedence (highest to lowest):**
1. Per-call `optimize={true}` — explicit force-enable
2. Per-call `optimize={false}` — explicit force-disable
3. `<NoOptimize>` boundary — applies to all children
4. Default — full optimization

### Scoping and nesting

`<NoOptimize>` affects ONLY its descendants; siblings outside the boundary continue to receive full optimization:

```tsx
<div>
  <NoOptimize>
    <Image src={icon1} alt="Icon 1" />
    {/* Renders bare <img> */}
  </NoOptimize>

  <Image src={hero} alt="Hero" />
  {/* Still fully optimized (aspect-ratio wrapper, lazy-load, etc.) */}
</div>
```

Multiple or nested `<NoOptimize>` boundaries work, but the innermost context value takes precedence — context doesn't stack:

```tsx
<NoOptimize>
  <Image src={icon1} alt="Icon 1" /> {/* bare */}

  <NoOptimize disabled>
    <Image src={featured} alt="Featured" /> {/* optimized */}
    <Image src={another} alt="Another" /> {/* optimized */}
  </NoOptimize>

  <Image src={icon2} alt="Icon 2" /> {/* bare again */}
</NoOptimize>
```

### Descriptor and string URLs both work

Just as with `<Image>`, `<NoOptimize>` children can use descriptor objects or string URLs:

```tsx
import hero from './hero.png?optimize'

<NoOptimize>
  {/* Descriptor form */}
  <Image src={hero} alt="Hero" />

  {/* String form */}
  <Image src="https://cdn.example.com/icon.svg" width={32} height={32} alt="Icon" />

  {/* Both render as bare <img>, no optimization overhead */}
</NoOptimize>
```

### Foot-guns and common mistakes

**Mistake 1: Boundary doesn't leak outward**

```tsx
{/* ❌ The bare image is inside; the optimized image is outside */}
<NoOptimize>
  <Image src={icon} alt="Icon" />
</NoOptimize>
<Image src={hero} alt="Hero" /> {/* still fully optimized! */}
```

**Mistake 2: Conflating `disabled` logic**

```tsx
{/* ❌ Setting disabled on the outer boundary */}
<NoOptimize disabled>
  <Image src={hero} alt="Hero" /> {/* Still renders as bare! */}
</NoOptimize>

{/* ✓ Set disabled on the INNER boundary to opt back in */}
<NoOptimize>
  <NoOptimize disabled>
    <Image src={hero} alt="Hero" /> {/* Now optimized */}
  </NoOptimize>
</NoOptimize>
```

**Mistake 3: Misunderstanding `optimize={false}` override**

Inside a `<NoOptimize>`, setting `optimize={false}` doesn't re-enable optimization — the boundary still applies. Use `optimize={true}` to override:

```tsx
<NoOptimize>
  {/* ❌ Still bare; optimize={false} doesn't help here */}
  <Image src={icon} alt="Icon" optimize={false} />

  {/* ✓ Forced optimization */}
  <Image src={featured} alt="Featured" optimize={true} />
</NoOptimize>
```

**Mistake 4: Performance regression from overzealous boundaries**

Don't wrap high-priority images (LCP heroes) in `<NoOptimize>` unless truly necessary. The optimization wrapper is negligible overhead, but the lack of preloading/priority hints can harm Core Web Vitals:

```tsx
{/* ❌ Bad: hero image loses priority preload */}
<NoOptimize>
  <Image src={hero} alt="Hero" priority /> {/* priority doesn't help without optimization */}
</NoOptimize>

{/* ✓ Good: use per-call optimize={false} only if layout requires it */}
<Image src={hero} alt="Hero" priority optimize={hero.distortsLayout} />
```
## Font preloading hooks & `?font` import

### Runtime Preloading with `usePreloadFont`

For fonts not in the global config—per-route hero fonts, conditional loads, or CDN-hosted faces—use the runtime hook:

```tsx
import { usePreloadFont } from '@pyreon/zero'

export default function HeroRoute() {
  // Emits <link rel="preload" as="font" href="..." type="font/woff2" crossorigin="anonymous">
  usePreloadFont('/fonts/display-bold.woff2')
  return <h1>Hero Content</h1>
}
```

**Key details:**
- Called at render time (SSR-visible); links are collected by `@pyreon/head` and emitted into `<head>`.
- `crossorigin="anonymous"` is **required** for all font loads per the CSS Fonts spec—without it, browsers preload the file, then refuse to use it for `@font-face`, and re-fetch under CORS (the dreaded double-fetch).
- MIME type is **auto-inferred** from the file extension (`.woff2` → `font/woff2`, etc.). For unknown extensions, it defaults to `font/woff2`; pass `type` explicitly if that's wrong.
- **Deduplication:** Multiple calls with the same href emit ONE preload (handled by `@pyreon/head`'s href-based keying).

Example with overrides:

```tsx
usePreloadFont('https://cdn.example.com/brand.woff2', {
  type: 'font/woff2',
  crossorigin: 'anonymous' // Optional; this is the default
})
```

### Import-Time Font Files with `?font`

For the cleanest DX, import font files directly with the `?font` query:

```tsx
import display from './fonts/display-bold.woff2?font'
import serif700 from './fonts/serif.woff2?font&family=Serif&weight=700'

export default function Page() {
  return (
    <>
      <h1 style={{ fontFamily: display.family }}>Display Heading</h1>
      <p style={{ fontFamily: serif700.family, fontWeight: 700 }}>Body</p>
    </>
  )
}
```

**What happens at build time:**
1. The file is hashed (`display-abc123de.woff2`) and emitted to `/assets/fonts/`.
2. A `@font-face` CSS rule is auto-generated and bundled.
3. The import returns a typed `FontDescriptor` with properties: `family`, `src` (the hashed URL), `weight`, `style`, `display`, `type`, and `fontFace` (the CSS rule string).
4. In dev, `src` points to `/@fs/...`; in build, it's the final asset hash.

**Filename inference:**

The plugin auto-extracts metadata from the filename (override via query params):

```
inter-700.woff2          → family: 'inter',       weight: 700, style: 'normal'
display-bold.woff2       → family: 'display',     weight: 700, style: 'normal'
inter-italic.woff2       → family: 'inter',       weight: 400, style: 'italic'
inter-700-italic.woff2   → family: 'inter',       weight: 700, style: 'italic'
serif.woff2              → family: 'serif',       weight: 400, style: 'normal'
```

**Weight keywords recognized:** `thin` (100), `hairline` (100), `extralight` (200), `light` (300), `normal/regular` (400), `medium` (500), `semibold/demibold` (600), `bold` (700), `extrabold/ultrabold` (800), `black/heavy` (900).

Override any inferred value via query parameters:

```tsx
import custom from './fonts/serif.woff2?font&family=Custom&weight=500&style=italic'
```

**MIME type & format:**

The plugin also infers the correct `format()` value for `@font-face`:

```
.woff2 → type: 'font/woff2',               format: 'woff2'
.woff  → type: 'font/woff',                format: 'woff'
.ttf   → type: 'font/ttf',                 format: 'truetype'
.otf   → type: 'font/otf',                 format: 'opentype'
.eot   → type: 'application/vnd.ms-fontobject', format: 'embedded-opentype'
```

### TypeScript Setup

To get full type checking on `?font` imports, add the ambient type declarations to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@pyreon/zero/font-types"]
  }
}
```

Or in a `.d.ts` file (e.g., `src/env.d.ts`):

```ts
/// <reference types="@pyreon/zero/font-types" />
```

### MIME Type Inference

Both `usePreloadFont` and the `?font` plugin use the same MIME type inference:

```ts
import { inferFontMimeType } from '@pyreon/zero'

inferFontMimeType('/fonts/inter.woff2')      // 'font/woff2'
inferFontMimeType('/fonts/x.ttf?v=2')        // 'font/ttf' (strips query)
inferFontMimeType('/fonts/x.unknown')        // 'font/woff2' (fallback)
```

### Common Patterns

**Combining global + per-route fonts:**

```tsx
// Global config in zero.config.ts declares Inter for the whole app
export default defineConfig({
  font: { google: ['Inter:wght@400;700'] }
})

// Route-specific hero font:
import display from './fonts/display-bold.woff2?font'

export default function HeroRoute() {
  usePreloadFont(display) // Explicit preload for the hero
  return (
    <h1 style={{ fontFamily: display.family }}>
      Hero with custom display font
    </h1>
  )
}
```

**Using descriptor toString() for interpolation:**

The descriptor's `toString()` method returns the family name, so you can interpolate directly:

```tsx
import inter from './fonts/inter.woff2?font'

const styles = `
  body { font-family: ${inter}; }
`
```

**Preload without CSS:**

If you import a font only for preloading (not for styling), use `usePreloadFont` directly:

```tsx
usePreloadFont('/fonts/font-I-load-conditionally.woff2')
```

