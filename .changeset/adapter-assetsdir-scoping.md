---
"@pyreon/zero": patch
---

fix(zero): adapters scope immutable cache to the served `<base><assetsDir>` URL prefix, not a hardcoded `/assets/`

Every deploy adapter pinned its 1-year `immutable` cache rule to `/assets/*` —
the *default* Vite `build.assetsDir` at the root `base`. Two real deploy shapes
silently lost the long-cache treatment (hashed chunks re-fetched every release,
even though the hashes never change):

- a **custom `assetsDir`** (`build: { assetsDir: 'static' }`) → chunks at `/static/`
- a **subpath deploy** (`zero({ base: '/blog/' })`) → chunks at `/blog/assets/`

The resolved `assetsDir` (from `configResolved`) is now threaded into
`adapter.build(options)` via `AdapterBuildOptions.assetsDir`, and the **CDN
adapters** scope their rule to the full served URL prefix `<base><assetsDir>`
(via a new exported `assetUrlPrefix(base, assetsDir)` helper):

- **vercel** — `config.json` route `src: '<base><assetsDir>/(.*)'` (SSG + SSR)
- **netlify** — `netlify.toml [[headers]] for = "<base><assetsDir>/*"` (SSG + SSR)
- **cloudflare** — `_headers` `<base><assetsDir>/*` + `_routes.json` exclude (SSG + SSR)

**node / bun stay `assetsDir`-only (no base) by design** — their self-hosted
handler serves files by raw `url.pathname` with no base-stripping, so a subpath
deploy isn't supported there regardless; threading `base` into only the cache
check would imply support that doesn't exist (documented inline).

Defaults to root `/` + `'assets'` when absent — **no behavior change for the
common case**. Bisect-verified by `adapters.test.ts` (custom `assetsDir` and
`base: '/blog/'` each scope every CDN adapter; node/bun honor `assetsDir` but
NOT `base`; default stays `/assets/`) + two end-to-end `examples/ssr-showcase`
builds — one with `assetsDir: 'static'` asserting `/static/(.*)`, one with
`base: '/blog/'` + `assetsDir: 'static'` asserting `/blog/static/(.*)` matches
the actual asset URLs in the rendered HTML.
