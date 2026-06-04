---
"@pyreon/zero": patch
---

fix(zero): adapters scope immutable cache to the resolved `build.assetsDir`, not a hardcoded `/assets/`

Every deploy adapter pinned its 1-year `immutable` cache rule to `/assets/*` —
the *default* Vite `build.assetsDir`. A site that sets a custom `assetsDir`
(e.g. `build: { assetsDir: 'static' }`) puts its content-hashed chunks at
`/static/`, which then **silently lost the long-cache treatment** (re-fetched
on every release, even though the hashes never change).

The resolved `assetsDir` is now threaded from the SSG/SSR plugins (captured in
`configResolved`) into `adapter.build(options)` via a new `AdapterBuildOptions.assetsDir`,
and every adapter scopes its rule to `/<assetsDir>/`:

- **vercel** — `config.json` route `src: '/<assetsDir>/(.*)'` (SSG + SSR)
- **netlify** — `netlify.toml [[headers]] for = "/<assetsDir>/*"` (SSG + SSR)
- **cloudflare** — `_headers` `/<assetsDir>/*` + the `_routes.json` worker-exclude (SSG + SSR)
- **node / bun** — the emitted server handler caches `pathname.startsWith('/<assetsDir>/')` immutable

Absent (the common case) it defaults to `'assets'` — no behavior change for the
vast majority of sites. Bisect-verified by `adapters.test.ts` (a custom
`assetsDir: 'static'` scopes every adapter's rule to `/static/`, and the default
still emits `/assets/`) + an end-to-end build of `examples/ssr-showcase` with
`build.assetsDir: 'static'` + the vercel adapter, asserting the emitted
`config.json` route is `/static/(.*)` with zero hardcoded `/assets/`.
