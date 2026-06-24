---
'@pyreon/zero': minor
---

SSG: add `ssg.format: 'file' | 'directory' | 'both'` (default `'directory'`)

Controls which on-disk form each prerendered route writes, mirroring
Astro's `build.format`:

- `'directory'` (default): `dist/<route>/index.html` — historical behavior.
- `'file'`: `dist/<route>.html` (Next.js `output: 'export'` style).
- `'both'`: emit both forms with byte-identical content.

**Why:** with `'directory'` only, a host that doesn't auto-rewrite
slash-less URLs to the trailing-slash form (GitHub Pages, raw Cloudflare
R2 / S3 without an index-document config, plain nginx without
`try_files`) answers a direct hit to `/resume` — the canonical
share/link form — with a `301 → /resume/ → 200` round-trip, a measurable
mobile-perf cost (Lighthouse "Avoid multiple page redirects"). The file
form lets those hosts serve `/resume` directly with no redirect.

`'both'` is the safe recommendation when redirects matter — it keeps
trailing-slash links / sitemap URLs working (directory form) AND serves
slash-less share URLs with no redirect (file form). The root route always
writes `dist/index.html` regardless of format. Default is unchanged.
