---
"@pyreon/zero": patch
---

feat(zero): cloudflareAdapter emits `_headers` pinning `/assets/*` immutable

The Cloudflare adapter emitted `_routes.json` (function routing) but **no cache
config** — so content-hashed `/assets/*` chunks inherited Cloudflare Pages'
short default and got re-fetched on every release window, even though they never
change. Vercel (`config.json` routes) and Netlify (`netlify.toml [[headers]]`)
already emit the `/assets/*` immutable rule; Cloudflare was the gap.

`cloudflareAdapter().build()` now writes `dist/_headers` (Cloudflare Pages +
Netlify format) for both SSG and SSR:

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

Only `/assets/*` (Vite's content-hashed output) is immutable — HTML, favicon,
sitemap, robots all fall through to the host's revalidating default, so a deploy
is never served stale. A **user-provided `_headers`** (e.g. copied from
`public/_headers`) is respected: if it already declares an `/assets/` policy
it's left untouched; otherwise the framework block is appended so user and
framework rules coexist.

The `staticAdapter` deliberately stays a no-op (it's host-agnostic; a
Netlify/CF-specific `_headers` would be scope-creep — static deploys to GitHub
Pages / S3 don't read it).

Bisect-verified by `adapters.test.ts` (cloudflare SSG: `_headers` carries the
`/assets/*` immutable rule and does NOT target favicon/sitemap/`.html`; user
`/assets/` policy preserved; user `/api/*` rule + framework `/assets/*` rule
coexist).
