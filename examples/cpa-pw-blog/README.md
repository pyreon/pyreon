# cpa-pw-blog — canonical SSG reference

A minimal blog built with [`@pyreon/zero`](https://github.com/pyreon/pyreon/tree/main/packages/zero) in `mode: 'ssg'`. The canonical reference example for static site generation — every SSG feature this app exercises is documented in [`docs/src/content/docs/ssg.md`](../../docs/src/content/docs/ssg.md).

## What it shows

- **Static routes** — `/`, `/about`, `/blog` auto-detected from the file-system router
- **Dynamic routes with `getStaticPaths`** — `/blog/:slug` enumerates 3 posts ([`src/routes/blog/[slug].tsx`](src/routes/blog/[slug].tsx))
- **Build-time ISR via `revalidate` export** — `/blog/<slug>` revalidates every hour; entries land in `dist/_pyreon-revalidate.json`
- **`vercelRevalidateHandler` scaffold** — drop-in webhook at [`src/routes/api/_pyreon-revalidate.ts`](src/routes/api/_pyreon-revalidate.ts) that platform adapters call on CMS publish
- **`_404.tsx` with layout chrome** — 404 pages wrap in the parent layout via PR L5's router-driven fallback
- **`_layout.tsx`** — global navigation + theme provider, rendered once per page
- **API routes** — `/api/rss.xml` (RSS feed), `/api/echo/[...path]` (streaming catch-all canary)
- **Sitemap auto-emit** — `useSsgPaths: true` reads the resolved-paths manifest so dynamic blog URLs land in `dist/sitemap.xml`
- **Per-post `useHead`** — title + og:* meta tags per route
- **`@pyreon/zero/font`** — Google Fonts self-hosted at build time (CDN in dev), with sized fallback for CLS protection

## Build

```bash
bun install
bun run build
```

Output:

```text
dist/
├── index.html                       # /
├── about/index.html                 # /about
├── blog/index.html                  # /blog
├── blog/welcome/index.html          # /blog/welcome (from getStaticPaths)
├── blog/why-signals/index.html      # /blog/why-signals
├── blog/static-vs-ssr/index.html    # /blog/static-vs-ssr
├── 404.html                         # from _404.tsx (with layout chrome)
├── sitemap.xml                      # includes static + dynamic URLs
├── robots.txt                       # from seoPlugin
├── _redirects                       # Netlify / Cloudflare format
├── _redirects.json                  # Vercel format
├── _pyreon-revalidate.json          # { "/blog/welcome": 3600, ... }
├── _pyreon-ssg-paths.json           # internal — consumed by seoPlugin
└── assets/                          # hashed JS / CSS bundles
```

`_pyreon-revalidate.json` contains the per-route `revalidate` allowlist that the `vercelRevalidateHandler` (in `api/_pyreon-revalidate.ts`) validates incoming webhook requests against.

## Deploy

Drop `dist/` on any static host. Recommended:

- **Netlify** — auto-detects `dist/404.html` + `_redirects`, no extra config
- **Cloudflare Pages** — same convention as Netlify
- **GitHub Pages** — auto-serves `404.html` (no per-directory 404 support)
- **Vercel** (static) — auto-detects everything; set `VERCEL_REVALIDATE_TOKEN` in project env to enable build-time ISR

See [`docs/src/content/docs/ssg.md`](../../docs/src/content/docs/ssg.md) for the full per-platform deploy reference + nginx / Caddy / S3+CloudFront snippets.

## Files

```text
src/
├── content/posts/                   # post bodies (TSX components)
│   ├── welcome.tsx
│   ├── why-signals.tsx
│   └── static-vs-ssr.tsx
├── lib/posts.ts                     # post manifest + helpers
├── routes/
│   ├── _layout.tsx                  # global nav + PyreonUI
│   ├── _404.tsx                     # not-found page
│   ├── index.tsx                    # home (/)
│   ├── about.tsx                    # about (/about)
│   ├── blog/
│   │   ├── index.tsx                # blog listing (/blog)
│   │   └── [slug].tsx               # post page (getStaticPaths + revalidate)
│   └── api/
│       ├── rss.ts                   # /api/rss.xml — RSS feed
│       ├── echo/[...path].ts        # /api/echo/* — streaming catch-all
│       └── _pyreon-revalidate.ts    # /api/_pyreon-revalidate — ISR webhook
├── global.css
├── entry-client.ts
└── entry-server.ts
vite.config.ts                       # mode: 'ssg', seoPlugin, fontPlugin
```

## Audit + lint

The project ships with `@pyreon/lint`'s recommended preset (which includes the three SSG rules) plus `pyreon doctor` for project-wide audits:

```bash
bun run doctor              # all audits (--check-islands, --check-ssg, --audit-tests)
bun run lint                # SSG rules + reactivity + JSX + accessibility
bun run typecheck           # tsc --noEmit
```

`bun run doctor --check-ssg` catches:

- Dynamic routes without `getStaticPaths`
- `_404.tsx` outside a `_layout.tsx` directory
- Non-literal `revalidate` exports (silently dropped from the manifest)
