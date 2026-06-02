---
"@pyreon/runtime-dom": patch
---

fix(runtime-dom): allow `data:image/*` URIs on image-source attributes (unblock `<Image>` placeholders)

The `setStaticProp` URL guard blocked **every** `data:` URI on URL-bearing
attributes (`src`, `poster`, …) to stop `javascript:`/`data:text/html`
injection. But that also rejected `data:image/*` placeholders — silently
disabling `<Image>`/`<OptimizedImage>`'s blur-up and color placeholders, which
is the framework's **own** `imagePlugin` output (`data:image/webp;base64,…` for
blur, `data:image/svg+xml,…` for color). Dev mode logged a `[Pyreon] Blocked
unsafe URL` warning on every render; production silently dropped the attribute
so the placeholder never reached the DOM.

The guard is now context-aware. A `data:image/<type>` URI is allowed only on an
image-source attribute (`src`/`srcset`/`poster`) of an image-context element
(`<img>`/`<source>`/`<video>`), where the browser treats it as a static,
non-executing image. Raster types (png/jpeg/webp/avif/…) always pass; SVG is
allowed only when it carries no `<script>` or `on*=` handlers (decoded for both
base64 and url-encoded payloads). Everything else stays blocked — `javascript:`
everywhere, `data:text/html` on `<iframe>`/`<object>`/`<embed>`, and `data:` on
navigable elements like `<a href>`/`<form action>`.

The same allowance applies to the HTML-sanitizer path (`dangerouslySetInnerHTML`),
so a legitimate `<img src="data:image/png;base64,…">` in sanitized HTML also
survives.
