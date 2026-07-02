---
'@pyreon/zero': minor
---

feat(zero): DX-audit follow-ups — strict-CSP theme script, auto-canonical, sitemap lastmod, font visibility, dev-cache invalidation

Five follow-ups from the zero DX audit:

- **Strict CSP for the theme script.** New `themeScriptCspHash` constant (precomputed `'sha256-…'`, drift-locked by a test that recomputes it from `themeScript`) lets the pre-paint theme script run under `script-src` without `'unsafe-inline'` — including on static SSG HTML where per-request nonces are impossible. For parametrized inline scripts (e.g. ui-core's `cssVariablesPrePaintScript(opts)`), new `cspHashForInlineScript(script)` in `@pyreon/zero/csp` computes the hash via Web Crypto (client-safe, Node/Bun/edge).
- **Auto-canonical URLs.** `<Meta origin="https://example.com">` now derives `<link rel="canonical">` (and `og:url`) from the current route path — every page gets a canonical with zero per-route boilerplate. Explicit `canonical` wins; `autoCanonical={false}` opts out; no-op outside a router context.
- **Sitemap `lastmod`.** `sitemap: { lastmod: 'build-time' | '<ISO date>' }` stamps entries that don't carry their own (per-entry `additionalPaths[].lastmod` wins). `'build-time'` is the honest automated default — file mtimes are unreliable in CI.
- **Font failure visibility + `?font&display=`.** Google-Fonts self-hosting failure at build now warns loudly (it silently fell back to the CDN — a perf/privacy regression you couldn't see). The `?font` import accepts a `display=` query override (`swap` default unchanged).
- **Dev-cache invalidation.** Editing a favicon source icon or an og-image background now clears the dev server's on-the-fly cache — no more stale icons until restart.

Plus first-class docs for the og-image subsystem (previously discoverable only via TypeScript).
