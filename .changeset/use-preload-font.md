---
'@pyreon/zero': minor
---

`usePreloadFont(href, opts?)` — runtime font-preload primitive.

For fonts NOT in the global `zero({ font: { google, local } })` declaration — a route-specific display face, a conditionally-loaded variable font, a CDN-hosted brand font — `usePreloadFont` emits a `<link rel="preload" as="font">` into the document `<head>` at render time (via `useHead`, SSR-visible to the preload scanner).

```ts
import { usePreloadFont } from '@pyreon/zero'

export default function HeroRoute() {
  usePreloadFont('/fonts/display-bold.woff2')
  return <h1 style="font-family: 'Display Bold'">…</h1>
}
```

Emitted:

```html
<link rel="preload" as="font" href="/fonts/display-bold.woff2" type="font/woff2" crossorigin="anonymous">
```

**Three correctness contracts handled automatically:**

1. **`crossorigin="anonymous"` by default** — the CSS Fonts spec requires CORS for every font fetch. Without `crossorigin`, the preload double-fetches (preload bypass + refetch under CORS, defeating the purpose). The helper sets it by default; override via `opts.crossorigin: 'use-credentials'` for the rare credential-bearing case.

2. **`type` auto-inferred from extension** — preload scanner ignores `as=font` preloads without a matching MIME type. Mapping: `.woff2 → font/woff2`, `.woff → font/woff`, `.ttf → font/ttf`, `.otf → font/otf`, `.eot → application/vnd.ms-fontobject`. Case-insensitive; strips query string + fragment before matching. Unknown extension falls back to `font/woff2`. Pass `opts.type` to override.

3. **Dedup** — two `usePreloadFont(href)` calls with the same href emit ONE preload (via `@pyreon/head`'s LinkTag href-keying).

Exports: `usePreloadFont` (helper), `PreloadFontOptions` (options interface), `inferFontMimeType` (the pure MIME-inference fn — exposed for testing + custom integrations).

**Bisect-verified.** 19 unit tests (10 `inferFontMimeType` cases + 9 SSR `renderWithHead` round-trips). Dropping the `crossorigin: 'anonymous'` default fails 2 of 9 SSR specs with `expected to contain crossorigin="anonymous"`.

Documented in `docs/docs/zero.md` → Font Optimization → `usePreloadFont`.
