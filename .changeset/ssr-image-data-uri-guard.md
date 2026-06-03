---
"@pyreon/runtime-server": patch
---

fix(runtime-server): allow `data:image/*` placeholders through the SSR URL guard

SSR/SSG stripped **all** `data:` URIs from URL-bearing attributes, silently
dropping the `imagePlugin` blur/color placeholders (`data:image/webp;base64,…`,
`data:image/svg+xml,…`) from prerendered static HTML — `<img>`/`<video>` shipped
with no `src`/`poster`. The client-side guard fix (`@pyreon/runtime-dom`, 0.28.1)
only repaired post-hydration; the static markup `renderToString` /
`renderToStream` emit was unchanged.

Ports the client allowlist to the SSR renderer: a raster
(`png`/`jpeg`/`gif`/`webp`/`avif`/…) or non-scripted-SVG `data:image/*` URI on an
image-source attribute (`src`/`srcset`/`poster`) of an image-context element
(`<img>`/`<source>`/`<video>`) now renders. Everything previously blocked stays
blocked: `data:text/html` on `<iframe>`/`<object>`, `data:image` on
non-image-context elements (`<a>`, `<embed>`), SVG carrying `<script>`/`on*=`
handlers (base64 + url-encoded payloads decoded and scanned), and `javascript:`
everywhere. `renderProp` now receives the element tag so the guard can check
image context.
