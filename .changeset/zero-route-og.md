---
'@pyreon/zero': minor
'@pyreon/mcp': patch
---

Per-route OG images from JSX. A page route can `export const og` — a component rendering the social card as SVG JSX from `{ path, params, data }` (typed `OgImage` from `@pyreon/zero/server`). SSG paths rasterize at build time (via the optional `sharp` peer) to a content-hashed PNG under `assets/og/` with `og:image` / `og:image:width|height` / `twitter:card` injected into that page; SSR/ISR routes are served from an auto-mounted `/_zero/og/<path>.png` endpoint (CDN `s-maxage` + `stale-while-revalidate`) with an absolute `og:image` injected into the rendered page. The `og` export is only referenced from the server graph. Configure with `zero({ routeOg: { width, height, siteUrl } })`.
